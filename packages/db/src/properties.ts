// CRM property databases (not listings). A CRM uploads its offices' property records as CSV, JSON or NDJSON;
// Listgate maps the columns to its own fields once (admin), normalises every row and keeps only those fields.
// There are no owner or contact fields, so unmapped columns (names, phones, notes…) are dropped on arrival.
// Partners pull changes from /api/v1/properties; what each may see lives in property_shares.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "./index";
import { sign } from "./outbox";
import {
  agencies,
  agencyPropertyPartners,
  agentPropertyPartners,
  partners,
  properties,
  propertyRuns,
  propertyShares,
  sources,
  PROPERTY_FIELDS,
  type PropertyField,
  type PropertyMapping,
} from "./schema";
import { initials, newFeedToken, slugify } from "./tokens";

type Source = typeof sources.$inferSelect;
type Row = Record<string, string>;
type Property = typeof properties.$inferSelect;

export class PropertyFeedError extends Error {}

// ---------------------------------------------------------------------------
// Reading files
// ---------------------------------------------------------------------------

/** RFC 4180 CSV (quotes, doubled quotes, newlines in quotes). Comma, or tab/semicolon if the header has more of them. */
export function parseCsv(text: string): { columns: string[]; rows: Row[] } {
  text = text.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0 || text.length);
  const delim = [",", "\t", ";"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') (cell += '"'), i++;
        else q = false;
      } else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v !== "")) out.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) (row.push(cell), row.some((v) => v !== "") && out.push(row));
  const [head = [], ...body] = out;
  const columns = head.map((h, i) => h.trim() || `column${i + 1}`);
  return { columns, rows: body.map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? "").trim()]))) };
}

/** Nested JSON → dotted keys ("address.suburb"); arrays of scalars → "a; b". */
function flatten(o: unknown, prefix = "", out: Row = {}): Row {
  if (o == null) return out;
  if (Array.isArray(o)) {
    if (o.every((v) => v == null || typeof v !== "object")) out[prefix] = o.filter((v) => v != null).join("; ");
    else o.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
  } else if (typeof o === "object") for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = String(o).trim();
  return out;
}

/** CSV, a JSON array (or {properties|data|items: [...]}), or NDJSON. Gzipped is fine. */
export function readTable(input: Buffer | string): { columns: string[]; rows: Row[]; format: "csv" | "json" | "ndjson" } {
  let buf = typeof input === "string" ? Buffer.from(input) : input;
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const t = text.trimStart();
  let rows: Row[];
  let format: "json" | "ndjson";
  if (t.startsWith("[") || (t.startsWith("{") && !/}\s*\n\s*{/.test(t.slice(0, 200_000)))) {
    let doc: unknown;
    try {
      doc = JSON.parse(t);
    } catch (e) {
      throw new PropertyFeedError(`Couldn't read the JSON: ${(e as Error).message}`);
    }
    const list = Array.isArray(doc) ? doc : ((doc as Record<string, unknown>).properties ?? (doc as Record<string, unknown>).data ?? (doc as Record<string, unknown>).items);
    if (!Array.isArray(list)) throw new PropertyFeedError("Expected a JSON array of properties (or {\"properties\": [...]}).");
    rows = list.map((r) => flatten(r));
    format = "json";
  } else if (t.startsWith("{")) {
    rows = t.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
      try {
        return flatten(JSON.parse(l));
      } catch {
        throw new PropertyFeedError(`Line ${i + 1} isn't valid JSON.`);
      }
    });
    format = "ndjson";
  } else return { ...parseCsv(text), format: "csv" };
  const columns = [...new Set(rows.slice(0, 500).flatMap((r) => Object.keys(r)))];
  return { columns, rows, format };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export const FIELD_LABELS: Record<PropertyField, string> = {
  extId: "Property ID (required)",
  officeRef: "Office ID (same as <agentID> in the listing feed)",
  agentRefs: "Assigned agent (CRM user ID or email; several split by ; or ,)",
  addressLine: "Full address on one line",
  unitNumber: "Unit",
  streetNumber: "Street number",
  street: "Street",
  suburb: "Suburb",
  state: "State",
  postcode: "Postcode",
  lat: "Latitude",
  lng: "Longitude",
  propertyType: "Property type",
  beds: "Bedrooms",
  baths: "Bathrooms",
  cars: "Car spaces",
  landArea: "Land area (m²)",
  buildingArea: "Building area (m²)",
  yearBuilt: "Year built",
  features: "Features (list)",
  lastSaleDate: "Last sale date",
  lastSalePrice: "Last sale price",
};

const SYNONYMS: Record<PropertyField, string[]> = {
  extId: ["propertyid", "property_id", "id", "uniqueid", "recordid", "propid"],
  officeRef: ["officeid", "office", "agentid", "branchid", "accountid", "officecode"],
  agentRefs: ["agentemail", "assignedagent", "agent", "agentid", "userid", "salesperson", "listingagent", "agents"],
  addressLine: ["address", "fulladdress", "propertyaddress", "displayaddress"],
  unitNumber: ["unit", "unitnumber", "subnumber", "flat", "lot"],
  streetNumber: ["streetnumber", "streetno", "number", "houseno"],
  street: ["street", "streetname", "road"],
  suburb: ["suburb", "locality", "city", "town"],
  state: ["state"],
  postcode: ["postcode", "postalcode", "zip", "pcode"],
  lat: ["lat", "latitude"],
  lng: ["lng", "lon", "long", "longitude"],
  propertyType: ["propertytype", "type", "category", "dwellingtype"],
  beds: ["beds", "bedrooms", "bed"],
  baths: ["baths", "bathrooms", "bath"],
  cars: ["cars", "carspaces", "parking", "garages", "car"],
  landArea: ["landarea", "landsize", "land", "lotsize", "sitearea"],
  buildingArea: ["buildingarea", "floorarea", "buildingsize", "internalarea"],
  yearBuilt: ["yearbuilt", "builtyear", "year"],
  features: ["features", "featurelist", "amenities"],
  lastSaleDate: ["lastsaledate", "solddate", "saledate", "lastsolddate"],
  lastSalePrice: ["lastsaleprice", "soldprice", "saleprice", "lastsoldprice"],
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Columns that look like someone's personal details are never suggested (the agent column is the one exception).
const PERSONAL = /owner|vendor|contact|buyer|tenant|landlord|purchaser|phone|mobile|^e-?mail$|first.?name|last.?name|surname/i;

/** Best guesses from the headers. There are no owner fields to map to, and personal-looking columns are skipped. */
export function suggestMapping(columns: string[]): PropertyMapping {
  const fields: PropertyMapping["fields"] = {};
  const used = new Set<string>();
  for (const f of PROPERTY_FIELDS) {
    const want = SYNONYMS[f];
    const allowed = (c: string) => !used.has(c) && (!PERSONAL.test(c) || (f === "agentRefs" && /agent|salesperson|user/i.test(c)));
    const hit = columns.find((c) => allowed(c) && want.includes(squash(c))) ?? columns.find((c) => allowed(c) && want.some((w) => w.length > 3 && squash(c).endsWith(w)));
    if (!hit) continue;
    fields[f] = { column: hit, transform: f === "features" || f === "agentRefs" ? "list" : "none" };
    used.add(hit);
  }
  return { fields };
}

// ---------------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------------

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
const STATE_NAMES: Record<string, string> = { "new south wales": "NSW", victoria: "VIC", queensland: "QLD", "south australia": "SA", "western australia": "WA", tasmania: "TAS", "northern territory": "NT", "australian capital territory": "ACT" };

export function parseAddressLine(line: string) {
  let s = line.replace(/\s+/g, " ").replace(/,?\s*Australia$/i, "").trim();
  const out: { unitNumber?: string; streetNumber?: string; street?: string; suburb?: string; state?: string; postcode?: string } = {};
  const pc = s.match(/\b(\d{4})$/);
  if (pc) (out.postcode = pc[1]), (s = s.slice(0, -4).trim());
  const st = s.match(new RegExp(`(?:,\\s*|\\s)(${STATES.join("|")})$`, "i"));
  if (st) (out.state = st[1].toUpperCase()), (s = s.slice(0, st.index).trim());
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  let streetPart = parts[0] ?? "";
  if (parts.length > 1) out.suburb = parts[parts.length - 1];
  else {
    // "12 Smith St Paddington": suburb is whatever follows the street type.
    const m = streetPart.match(/^(.*?\b(?:st|street|rd|road|ave|avenue|dr|drive|ct|court|pl|place|tce|terrace|cres|crescent|pde|parade|ln|lane|hwy|highway|blvd|boulevard|cl|close|way|cct|circuit|esp|esplanade)\.?)\s+(.+)$/i);
    if (m) (streetPart = m[1]), (out.suburb = m[2]);
  }
  const u = streetPart.match(/^(?:(?:unit|apt|apartment|flat|lot|shop|suite)\s*)?([\w-]+)\s*\/\s*([\w-]+)\s+(.+)$/i);
  if (u) (out.unitNumber = u[1]), (out.streetNumber = u[2]), (out.street = u[3]);
  else {
    const n = streetPart.match(/^(?:(?:unit|apt|apartment|flat)\s+([\w-]+)\s*,?\s+)?([\d]+[a-z]?(?:-\d+[a-z]?)?)\s+(.+)$/i);
    if (n) (out.unitNumber = n[1]), (out.streetNumber = n[2]), (out.street = n[3]);
    else if (streetPart) out.street = streetPart;
  }
  if (out.suburb) out.suburb = out.suburb.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase());
  return out;
}

const num = (v: string | undefined) => {
  if (!v) return null;
  const n = parseFloat(v.replace(/[$,\s]/g, "").replace(/m2|m²|sqm|ha$/i, ""));
  return Number.isFinite(n) ? n : null;
};
const int = (v: string | undefined) => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};
const date = (v: string | undefined) => {
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const au = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  return au ? `${au[3]}-${au[2].padStart(2, "0")}-${au[1].padStart(2, "0")}` : null;
};
const list = (v: string | undefined) => (v ? v.split(/[;,|\n]/).map((x) => x.trim()).filter(Boolean) : []);

export type NormalisedProperty = Omit<Property, "id" | "agencyId" | "contentHash" | "version" | "removedAt" | "createdAt" | "updatedAt"> & { officeRef: string | null };

/** One CRM row → Listgate's fields. Only mapped fields are read; everything else in the row is ignored. */
export function normalise(row: Row, m: PropertyMapping): { ok: true; p: NormalisedProperty } | { ok: false; error: string } {
  const get = (f: PropertyField) => {
    const c = m.fields[f];
    return c ? (row[c.column] ?? "").trim() || undefined : undefined;
  };
  const tr = (f: PropertyField) => m.fields[f]?.transform;
  const extId = get("extId");
  if (!extId) return { ok: false, error: "No property ID." };
  const a = get("addressLine") ? parseAddressLine(get("addressLine")!) : {};
  let state = (get("state") ?? a.state ?? "").trim();
  state = STATE_NAMES[state.toLowerCase()] ?? state.toUpperCase();
  const area = (f: "landArea" | "buildingArea") => {
    const n = num(get(f));
    if (n == null) return null;
    return tr(f) === "ha_to_m2" || /ha$/i.test(get(f) ?? "") ? Math.round(n * 10_000) : n;
  };
  const year = int(get("yearBuilt"));
  const lat = num(get("lat"));
  const lng = num(get("lng"));
  return {
    ok: true,
    p: {
      extId: extId.slice(0, 120),
      officeRef: get("officeRef") ?? null,
      agentRefs: [...new Set(list(get("agentRefs")).map((x) => x.toLowerCase()))].slice(0, 10),
      unitNumber: get("unitNumber") ?? a.unitNumber ?? null,
      streetNumber: get("streetNumber") ?? a.streetNumber ?? null,
      street: get("street") ?? a.street ?? null,
      suburb: get("suburb") ?? a.suburb ?? null,
      state: STATES.includes(state) ? state : null,
      postcode: (get("postcode") ?? a.postcode ?? "").match(/\d{4}/)?.[0] ?? null,
      lat: lat != null && lat >= -44 && lat <= -9 ? lat : null,
      lng: lng != null && lng >= 112 && lng <= 154 ? lng : null,
      propertyType: get("propertyType")?.slice(0, 60) ?? null,
      beds: int(get("beds")),
      baths: int(get("baths")),
      cars: int(get("cars")),
      landArea: area("landArea"),
      buildingArea: area("buildingArea"),
      yearBuilt: year && year >= 1800 && year <= new Date().getFullYear() + 5 ? year : null,
      features: list(get("features")).map((f) => f.slice(0, 40)).slice(0, 30),
      lastSaleDate: date(get("lastSaleDate")),
      lastSalePrice: int(get("lastSalePrice")),
    },
  };
}

const hashOf = (p: NormalisedProperty) => {
  const { officeRef: _o, ...rest } = p;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex").slice(0, 32);
};

// ---------------------------------------------------------------------------
// Storing
// ---------------------------------------------------------------------------

/** The office (agency) for a CRM's office id, created on first sight. Shared with the listing feed. */
export async function officeFor(db: Db, source: Source, ref: string) {
  const find = () => db.select().from(agencies).where(and(eq(agencies.sourceId, source.id), eq(agencies.reaxmlAgentId, ref))).then((r) => r[0]);
  let a = await find();
  if (a) return { agency: a, created: false };
  const base = `${source.slug}-${slugify(ref)}`.slice(0, 50);
  const values = { name: `${source.name} agency ${ref}`, initials: initials(source.name), reaxmlAgentId: ref, crm: source.name, sourceId: source.id };
  [a] = await db.insert(agencies).values({ ...values, slug: base, feedToken: newFeedToken() }).onConflictDoNothing().returning();
  if (a) return { agency: a, created: true };
  a = await find();
  if (a) return { agency: a, created: false };
  [a] = await db.insert(agencies).values({ ...values, slug: `${base}-${newFeedToken().slice(0, 5).toLowerCase()}`, feedToken: newFeedToken() }).returning();
  return { agency: a, created: true };
}

export type PropertyRunResult = typeof propertyRuns.$inferSelect;

/**
 * Stores one upload. Without a saved mapping, keeps the headers and a few rows for the mapping screen and stops.
 * mode "snapshot": properties missing from the file are removed, but only in offices that appear in it.
 */
export async function ingestProperties(db: Db, source: Source, input: Buffer | string, opts: { mode?: "snapshot" | "delta"; office?: string | null; fileName?: string | null; runId?: number }) {
  const started = Date.now();
  const bytes = typeof input === "string" ? Buffer.byteLength(input) : input.length;
  const [run] = opts.runId
    ? await db.update(propertyRuns).set({ status: "running" }).where(eq(propertyRuns.id, opts.runId)).returning()
    : await db.insert(propertyRuns).values({ sourceId: source.id, status: "running", mode: opts.mode ?? "delta", fileName: opts.fileName?.slice(0, 200) ?? null, bytes }).returning();
  const finish = (set: Partial<PropertyRunResult>) => db.update(propertyRuns).set({ ...set, ms: Date.now() - started }).where(eq(propertyRuns.id, run.id)).returning().then((r) => r[0]);
  try {
    const table = readTable(input);
    const mapping = source.propertyMapping;
    const unmapped = mapping ? table.columns.filter((c) => !Object.values(mapping.fields).some((f) => f?.column === c)) : [];
    if (!mapping?.fields.extId) {
      await db.update(sources).set({ propertySample: { columns: table.columns, rows: table.rows.slice(0, 8), at: new Date().toISOString() } }).where(eq(sources.id, source.id));
      return finish({ status: "needs_mapping", rows: table.rows.length, error: "Columns need mapping in Listgate admin before properties are stored." });
    }
    if (!mapping.fields.officeRef && !opts.office) return finish({ status: "failed", rows: table.rows.length, error: "Map an office column, or send ?office=<office id> with a one-office file." });
    const byOffice = new Map<string, NormalisedProperty[]>();
    let skipped = 0;
    for (const r of table.rows) {
      const n = normalise(r, mapping);
      const office = n.ok ? n.p.officeRef || opts.office : null;
      if (!n.ok || !office) {
        skipped++;
        continue;
      }
      byOffice.set(office, [...(byOffice.get(office) ?? []), n.p]);
    }
    const res = { created: 0, updated: 0, unchanged: 0, removed: 0 };
    for (const [ref, rows] of byOffice) {
      const { agency } = await officeFor(db, source, ref);
      if (agency.suspendedAt) {
        skipped += rows.length;
        continue;
      }
      const r = await storeOffice(db, agency.id, rows, opts.mode === "snapshot");
      for (const k of ["created", "updated", "unchanged", "removed"] as const) res[k] += r[k];
    }
    await db.update(sources).set({ lastPropertyFeedAt: new Date() }).where(eq(sources.id, source.id));
    return finish({ status: "done", rows: table.rows.length, offices: byOffice.size, skipped, ...res, error: unmapped.length ? `Ignored ${unmapped.length} unmapped column${unmapped.length === 1 ? "" : "s"}.` : null });
  } catch (e) {
    return finish({ status: "failed", error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
  }
}

async function storeOffice(db: Db, agencyId: string, rows: NormalisedProperty[], snapshot: boolean) {
  const res = { created: 0, updated: 0, unchanged: 0, removed: 0 };
  const existing = await db.select().from(properties).where(eq(properties.agencyId, agencyId));
  const byExt = new Map(existing.map((p) => [p.extId, p]));
  const seen = new Set<string>();
  const changed: string[] = [];
  const inserts: (typeof properties.$inferInsert)[] = [];
  for (const p of rows) {
    if (seen.has(p.extId)) continue;
    seen.add(p.extId);
    const { officeRef: _o, ...fields } = p;
    const hash = hashOf(p);
    const old = byExt.get(p.extId);
    if (old && old.contentHash === hash && !old.removedAt) {
      res.unchanged++;
      continue;
    }
    if (old) {
      await db.update(properties).set({ ...fields, contentHash: hash, version: old.version + 1, removedAt: null, updatedAt: new Date() }).where(eq(properties.id, old.id));
      changed.push(old.id);
      res.updated++;
    } else {
      inserts.push({ ...fields, agencyId, contentHash: hash });
      res.created++;
    }
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const ins = await db.insert(properties).values(inserts.slice(i, i + 500)).returning({ id: properties.id });
    changed.push(...ins.map((r) => r.id));
  }
  if (snapshot) {
    const gone = existing.filter((p) => !seen.has(p.extId) && !p.removedAt);
    for (let i = 0; i < gone.length; i += 500) {
      const ids = gone.slice(i, i + 500).map((p) => p.id);
      await db.update(properties).set({ removedAt: new Date(), version: 1 + Math.max(...gone.slice(i, i + 500).map((p) => p.version)), updatedAt: new Date() }).where(inArray(properties.id, ids));
      changed.push(...ids);
    }
    res.removed = gone.length;
  }
  if (changed.length) await syncShares(db, agencyId, changed);
  return res;
}

// ---------------------------------------------------------------------------
// Who sees what
// ---------------------------------------------------------------------------

/**
 * Recomputes property_shares for an office (or some of its properties): the office's approved partners, plus partners
 * an assigned agent unlocked (not when the office is locked). Returns how many shares changed, per partner.
 */
export async function syncShares(db: Db, agencyId: string, propertyIds?: string[]) {
  const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
  if (!agency) return new Map<string, number>();
  const ok = and(eq(partners.active, true), eq(partners.acceptsProperties, true));
  const office = (
    await db.select({ id: partners.id }).from(agencyPropertyPartners).innerJoin(partners, eq(partners.id, agencyPropertyPartners.partnerId)).where(and(eq(agencyPropertyPartners.agencyId, agencyId), eq(agencyPropertyPartners.enabled, true), ok))
  ).map((r) => r.id);
  const grants =
    agency.sourceId && !agency.agentsLockedAt
      ? await db.select({ ref: agentPropertyPartners.ref, id: partners.id }).from(agentPropertyPartners).innerJoin(partners, eq(partners.id, agentPropertyPartners.partnerId)).where(and(eq(agentPropertyPartners.sourceId, agency.sourceId), eq(agentPropertyPartners.enabled, true), ok))
      : [];
  const byRef = new Map<string, string[]>();
  for (const g of grants) byRef.set(g.ref, [...(byRef.get(g.ref) ?? []), g.id]);

  const changes = new Map<string, number>();
  const ids = propertyIds ?? (await db.select({ id: properties.id }).from(properties).where(eq(properties.agencyId, agencyId))).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const props = await db.select().from(properties).where(inArray(properties.id, chunk));
    const shares = await db.select().from(propertyShares).where(inArray(propertyShares.propertyId, chunk));
    const now = new Date();
    const upserts: (typeof propertyShares.$inferInsert)[] = [];
    for (const p of props) {
      const want = new Set(p.removedAt ? [] : [...office, ...p.agentRefs.flatMap((r) => byRef.get(r) ?? [])]);
      const have = shares.filter((s) => s.propertyId === p.id);
      for (const pid of want) {
        const s = have.find((h) => h.partnerId === pid);
        if (!s || !s.visible || s.version !== p.version) upserts.push({ partnerId: pid, propertyId: p.id, visible: true, version: p.version, changedAt: now });
      }
      for (const s of have) if (s.visible && !want.has(s.partnerId)) upserts.push({ partnerId: s.partnerId, propertyId: p.id, visible: false, version: p.version, changedAt: now });
    }
    if (upserts.length) {
      await db
        .insert(propertyShares)
        .values(upserts)
        .onConflictDoUpdate({ target: [propertyShares.partnerId, propertyShares.propertyId], set: { visible: sqlExcluded("visible"), version: sqlExcluded("version"), changedAt: sqlExcluded("changed_at") } });
      for (const u of upserts) changes.set(u.partnerId, (changes.get(u.partnerId) ?? 0) + 1);
    }
  }
  if (changes.size) void notifyPartners(db, changes);
  return changes;
}

const sqlExcluded = (col: string) => sql.raw(`excluded.${col}`);

/** A short signed webhook so pulling partners know to sync. Best effort: no retries (the pull API is the record). */
async function notifyPartners(db: Db, changes: Map<string, number>) {
  const rows = await db.select().from(partners).where(inArray(partners.id, [...changes.keys()]));
  await Promise.all(
    rows
      .filter((p) => p.webhookUrl)
      .map((p) => {
        const body = JSON.stringify({ event: "properties.changed", changed: changes.get(p.id), sentAt: new Date().toISOString(), pull: "/api/v1/properties" });
        return fetch(p.webhookUrl!, { method: "POST", headers: { "content-type": "application/json", "x-listgate-event": "properties.changed", "x-listgate-signature": sign(p.signingSecret, body) }, body, signal: AbortSignal.timeout(10_000) }).catch(() => null);
      })
  );
}

/** An agent sharing the properties assigned to them (by every ref they have in this CRM) with a partner. */
export async function setAgentPropertyUnlock(db: Db, o: { sourceId: string; refs: string[]; partnerId: string; enabled: boolean; userId?: string | null }) {
  const refs = [...new Set(o.refs.map((r) => r.trim().toLowerCase()).filter(Boolean))];
  for (const ref of refs)
    await db
      .insert(agentPropertyPartners)
      .values({ sourceId: o.sourceId, ref, partnerId: o.partnerId, enabled: o.enabled, userId: o.userId ?? null })
      .onConflictDoUpdate({ target: [agentPropertyPartners.sourceId, agentPropertyPartners.ref, agentPropertyPartners.partnerId], set: { enabled: o.enabled, userId: o.userId ?? null, updatedAt: new Date() } });
  const offices = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.sourceId, o.sourceId));
  let n = 0;
  for (const a of offices) {
    const mine = await agentProperties(db, a.id, refs);
    if (mine.length) n += [...(await syncShares(db, a.id, mine.map((p) => p.id))).values()].reduce((x, y) => x + y, 0);
  }
  return n;
}

/** A principal sharing (or un-sharing) the whole office's property database with a partner. */
export async function setOfficePropertyUnlock(db: Db, o: { agencyId: string; partnerId: string; enabled: boolean; userId?: string | null; by: string }) {
  await db
    .insert(agencyPropertyPartners)
    .values({ agencyId: o.agencyId, partnerId: o.partnerId, enabled: o.enabled, approvedById: o.userId ?? null, approvedBy: o.by })
    .onConflictDoUpdate({ target: [agencyPropertyPartners.agencyId, agencyPropertyPartners.partnerId], set: { enabled: o.enabled, approvedById: o.userId ?? null, approvedBy: o.by, updatedAt: new Date() } });
  return [...(await syncShares(db, o.agencyId)).values()].reduce((x, y) => x + y, 0);
}

/** Live properties in an office assigned to any of these refs. */
export async function agentProperties(db: Db, agencyId: string, refs: string[]) {
  if (!refs.length) return [];
  const lc = refs.map((r) => r.toLowerCase());
  return db
    .select()
    .from(properties)
    .where(and(eq(properties.agencyId, agencyId), isNull(properties.removedAt), sql`${properties.agentRefs} ?| array[${sql.join(lc.map((r) => sql`${r}`), sql`, `)}]::text[]`));
}

/** What partners get for one property. */
export function propertyPayload(p: Property, agency: Pick<typeof agencies.$inferSelect, "id" | "name" | "reaxmlAgentId">) {
  const street = [p.unitNumber && p.streetNumber ? `${p.unitNumber}/${p.streetNumber}` : p.unitNumber || p.streetNumber, p.street].filter(Boolean).join(" ");
  return {
    id: p.id,
    agencyPropertyId: p.extId,
    version: p.version,
    office: { id: agency.id, name: agency.name, crmOfficeId: agency.reaxmlAgentId },
    address: { unitNumber: p.unitNumber, streetNumber: p.streetNumber, street: p.street, suburb: p.suburb, state: p.state, postcode: p.postcode, full: [street, [p.suburb, p.state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") },
    location: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
    propertyType: p.propertyType,
    beds: p.beds,
    baths: p.baths,
    cars: p.cars,
    landArea: p.landArea,
    buildingArea: p.buildingArea,
    yearBuilt: p.yearBuilt,
    features: p.features,
    lastSale: p.lastSaleDate || p.lastSalePrice ? { date: p.lastSaleDate, price: p.lastSalePrice } : null,
    agents: p.agentRefs,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function sourceByPropertyToken(db: Db, token: string) {
  if (!token || token.length < 16) return null;
  const [s] = await db.select().from(sources).where(eq(sources.propertyToken, token));
  return s ?? null;
}
