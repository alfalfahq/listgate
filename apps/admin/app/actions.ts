"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import {
  FeedError,
  agencies,
  agencyMembers,
  agencyPartners,
  auditLog,
  createLoginToken,
  enqueue,
  enqueueAgencyForPartner,
  PROPERTY_FIELDS,
  setAgentsLocked,
  getDb,
  listings,
  newFeedToken,
  sources,
  hashToken,
  ingestFeed,
  initials,
  inviteLink,
  newSecret,
  partners,
  pingPartner,
  retryDeliveries,
  slugify,
  users,
} from "@listgate/db";
import { canSeeMoney, requireAdmin } from "@/lib/auth";
import { APP_URL } from "@/lib/format";
import { sendInvite } from "@/lib/email";

export type State = { error?: string; link?: string; ok?: string; open?: string; secret?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const ROLES = ["owner", "editor"] as const;
const UUID = /^[0-9a-f-]{36}$/i;
const feedToken = () => randomBytes(24).toString("base64url");

async function log(admin: { id: string; name: string }, action: string, entityType: string, entityId: string, agencyId: string | null, data?: Record<string, unknown>) {
  const db = await getDb();
  await db.insert(auditLog).values({ actorUserId: admin.id, actorLabel: admin.name, action, entityType, entityId, agencyId, data: data ?? null });
}

/** Adds a person to an agency (creating their user if needed), emails the invite when email is on, and returns the link. */
async function addPerson(agencyId: string, agencyName: string, name: string, email: string, role: (typeof ROLES)[number], invitedBy: string) {
  const db = await getDb();
  const e = email.toLowerCase();
  let [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${e}`).limit(1);
  if (!u) [u] = await db.insert(users).values({ name, email: e }).returning();
  await db.insert(agencyMembers).values({ agencyId, userId: u.id, role }).onConflictDoNothing();
  const raw = await createLoginToken(db, { purpose: "invite", email: e, agencyId, agencyRole: role, invitedByUserId: invitedBy });
  const link = inviteLink(raw);
  const emailed = await sendInvite({ to: e, firstName: name.split(" ")[0], agency: agencyName, link, role });
  return { link, emailed };
}

// ---------------------------------------------------------------------------
// Agencies
// ---------------------------------------------------------------------------

/** Creates an agency with its feed token, optionally invites the owner, and switches on chosen partners. */
export async function createAgency(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const name = str(form, "name");
  if (!name) return { error: "Add the agency's name." };
  const db = await getDb();
  let slug = slugify(str(form, "slug") || name) || "agency";
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(agencies).where(sql`${agencies.slug} = ${slug} or ${agencies.slug} like ${slug + "-%"}`);
  if (n > 0) slug = `${slug}-${n + 1}`;
  const crm = str(form, "crm");
  const [a] = await db
    .insert(agencies)
    .values({
      name,
      slug,
      initials: initials(name),
      crm: crm || null,
      suburb: str(form, "suburb") || null,
      state: str(form, "state").toUpperCase() || null,
      contactEmail: str(form, "contactEmail") || null,
      reaxmlAgentId: str(form, "reaxmlAgentId") || null,
      feedToken: feedToken(),
    })
    .returning();
  await log(admin, "agency.created", "agency", a.id, a.id, { name, crm });

  for (const pid of form.getAll("partner").map(String).filter((v) => UUID.test(v))) {
    await db.insert(agencyPartners).values({ agencyId: a.id, partnerId: pid, changedById: admin.id, changedByName: admin.name }).onConflictDoNothing();
  }

  const ownerEmail = str(form, "ownerEmail");
  if (ownerEmail) {
    if (!isEmail(ownerEmail)) return { error: "Agency created, but the owner's email doesn't look right. Invite them from the agency page." };
    const { link, emailed } = await addPerson(a.id, name, str(form, "ownerName") || ownerEmail.split("@")[0], ownerEmail, "owner", admin.id);
    await log(admin, "member.invited", "agency", a.id, a.id, { email: ownerEmail, role: "owner" });
    return { ok: `${name} created.${emailed ? ` Invite emailed to ${ownerEmail}.` : " Email is off, so copy the invite link:"}`, link, open: `/agencies/${a.id}` };
  }
  redirect(`/agencies/${a.id}`);
}

export async function updateAgency(form: FormData) {
  const admin = await requireAdmin();
  const id = str(form, "agencyId");
  const db = await getDb();
  const set = {
    name: str(form, "name") || undefined,
    crm: str(form, "crm") || null,
    suburb: str(form, "suburb") || null,
    state: str(form, "state").toUpperCase() || null,
    abn: str(form, "abn") || null,
    contactEmail: str(form, "contactEmail") || null,
    website: str(form, "website") || null,
    reaxmlAgentId: str(form, "reaxmlAgentId") || null,
    notes: str(form, "notes") || null,
  };
  await db.update(agencies).set(set).where(eq(agencies.id, id));
  await log(admin, "agency.updated", "agency", id, id, set);
  revalidatePath(`/agencies/${id}`);
}

export async function inviteToAgency(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const agencyId = str(form, "agencyId");
  const email = str(form, "email");
  const role = (ROLES as readonly string[]).includes(str(form, "role")) ? (str(form, "role") as (typeof ROLES)[number]) : "owner";
  if (!isEmail(email)) return { error: "Add a valid email." };
  const db = await getDb();
  const [a] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
  if (!a) return { error: "Agency not found." };
  const { link, emailed } = await addPerson(a.id, a.name, str(form, "name") || email.split("@")[0], email, role, admin.id);
  await log(admin, "member.invited", "agency", a.id, a.id, { email, role });
  revalidatePath(`/agencies/${a.id}`);
  return { ok: emailed ? `Invite emailed to ${email}.` : "Email is off. Copy the invite link:", link };
}

/** New feed token. The old HTTP URL and FTP password stop working at once, so the CRM must be updated. */
export async function rotateFeedToken(form: FormData) {
  const admin = await requireAdmin();
  const id = str(form, "agencyId");
  const db = await getDb();
  await db.update(agencies).set({ feedToken: feedToken() }).where(eq(agencies.id, id));
  await log(admin, "agency.feed_token_rotated", "agency", id, id);
  revalidatePath(`/agencies/${id}`);
}

export async function setSuspended(form: FormData) {
  const admin = await requireAdmin();
  const id = str(form, "agencyId");
  const on = str(form, "suspend") === "1";
  const db = await getDb();
  await db.update(agencies).set({ suspendedAt: on ? new Date() : null }).where(eq(agencies.id, id));
  await log(admin, on ? "agency.suspended" : "agency.unsuspended", "agency", id, id);
  revalidatePath(`/agencies/${id}`);
}

/** Turns a partner on or off for an agency, from admin. Same effect as the agency doing it. */
export async function setAgencyPartner(form: FormData) {
  const admin = await requireAdmin();
  const agencyId = str(form, "agencyId");
  const partnerId = str(form, "partnerId");
  const enabled = str(form, "enabled") === "1";
  const ref = str(form, "ref");
  const db = await getDb();
  const [p] = await db.select().from(partners).where(eq(partners.id, partnerId));
  if (!p) return;
  await db
    .insert(agencyPartners)
    .values({ agencyId, partnerId, enabled, partnerAgencyRef: ref || null, changedById: admin.id, changedByName: admin.name })
    .onConflictDoUpdate({ target: [agencyPartners.agencyId, agencyPartners.partnerId], set: { enabled, ...(form.has("ref") ? { partnerAgencyRef: ref || null } : {}), changedById: admin.id, changedByName: admin.name, updatedAt: new Date() } });
  const [a] = await db.select({ sourceId: agencies.sourceId }).from(agencies).where(eq(agencies.id, agencyId));
  // Offices from a CRM-wide feed: switching off recomputes, so listings agents unlocked themselves keep going.
  const queued = !p.active ? 0 : enabled || !a?.sourceId ? await enqueueAgencyForPartner(db, agencyId, p, enabled ? "backfill" : "remove") : await enqueue(db, agencyId, await db.select().from(listings).where(eq(listings.agencyId, agencyId)));
  await log(admin, enabled ? "partner.enabled" : "partner.disabled", "agency", agencyId, agencyId, { partner: p.name, queued });
  revalidatePath(`/agencies/${agencyId}`);
}

/** Re-sends everything an agency has live to one partner (or all its partners). */
export async function resendAgency(form: FormData) {
  const admin = await requireAdmin();
  const agencyId = str(form, "agencyId");
  const partnerId = str(form, "partnerId");
  const db = await getDb();
  const rows = await db
    .select({ p: partners })
    .from(agencyPartners)
    .innerJoin(partners, eq(partners.id, agencyPartners.partnerId))
    .where(and(eq(agencyPartners.agencyId, agencyId), eq(agencyPartners.enabled, true), ...(partnerId ? [eq(partners.id, partnerId)] : [])));
  let queued = 0;
  for (const { p } of rows) queued += await enqueueAgencyForPartner(db, agencyId, p, "backfill");
  await log(admin, "agency.resent", "agency", agencyId, agencyId, { queued });
  revalidatePath(`/agencies/${agencyId}`);
}

export async function uploadFeed(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const agencyId = str(form, "agencyId");
  const file = form.get("file");
  if (!file || typeof file === "string" || !file.size) return { error: "Choose a REAXML file." };
  const db = await getDb();
  const [a] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
  if (!a) return { error: "Agency not found." };
  try {
    const r = await ingestFeed(db, a, await file.text(), { via: "upload", fileName: file.name });
    await log(admin, "feed.uploaded", "agency", a.id, a.id, { file: file.name, ...r });
    revalidatePath(`/agencies/${a.id}`);
    return { ok: `${r.received} listings read: ${r.created} new, ${r.updated} updated, ${r.removed} removed, ${r.unchanged} unchanged. ${r.queued} partner pushes queued.` };
  } catch (e) {
    return { error: e instanceof FeedError ? e.message : "Couldn't read that file." };
  }
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

function partnerFields(form: FormData) {
  const kinds = form.getAll("kinds").map(String).filter((k): k is "sale" | "rent" => k === "sale" || k === "rent");
  const webhookUrl = str(form, "webhookUrl");
  return {
    name: str(form, "name"),
    description: str(form, "description") || null,
    website: str(form, "website") || null,
    webhookUrl: webhookUrl || null,
    kinds: kinds.length === 2 ? [] : kinds,
    includeSold: form.get("includeSold") === "on",
    confidential: form.get("confidential") === "on",
    acceptsProperties: form.get("acceptsProperties") === "on",
    listed: form.get("listed") === "on",
    active: form.get("active") === "on",
    maxAttempts: Math.min(50, Math.max(1, Number(str(form, "maxAttempts")) || 12)),
    sort: Number(str(form, "sort")) || 100,
  };
}

export async function createPartner(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const f = partnerFields(form);
  if (!f.name) return { error: "Add the partner's name." };
  if (f.webhookUrl && !/^https?:\/\//.test(f.webhookUrl)) return { error: "The webhook URL must start with https://" };
  const db = await getDb();
  const slug = slugify(str(form, "slug") || f.name);
  const [exists] = await db.select({ id: partners.id }).from(partners).where(eq(partners.slug, slug));
  if (exists) return { error: `There's already a partner called ${slug}.` };
  const [p] = await db.insert(partners).values({ ...f, slug, signingSecret: newSecret("whsec") }).returning();
  await log(admin, "partner.created", "partner", p.id, null, { name: f.name });
  redirect(`/partners/${p.id}`);
}

export async function updatePartner(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const id = str(form, "partnerId");
  const f = partnerFields(form);
  if (!f.name) return { error: "Add the partner's name." };
  if (f.webhookUrl && !/^https?:\/\//.test(f.webhookUrl)) return { error: "The webhook URL must start with https://" };
  const db = await getDb();
  await db.update(partners).set(f).where(eq(partners.id, id));
  await log(admin, "partner.updated", "partner", id, null, { ...f });
  revalidatePath(`/partners/${id}`);
  return { ok: "Saved." };
}

/** New API key for the partner's pull access. Shown once; only a hash is kept. Full admins only. */
export async function rotateApiKey(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  if (!canSeeMoney(admin)) return { error: "Only full admins can issue partner keys." };
  const id = str(form, "partnerId");
  const key = newSecret("lg_live");
  const db = await getDb();
  await db.update(partners).set({ apiKeyHash: hashToken(key), apiKeyLast4: key.slice(-4) }).where(eq(partners.id, id));
  await log(admin, "partner.api_key_rotated", "partner", id, null);
  revalidatePath(`/partners/${id}`);
  return { ok: "New API key. Copy it now: it won't be shown again. The old key has stopped working.", secret: key };
}

export async function rotateSigningSecret(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  if (!canSeeMoney(admin)) return { error: "Only full admins can change signing secrets." };
  const id = str(form, "partnerId");
  const secret = newSecret("whsec");
  const db = await getDb();
  await db.update(partners).set({ signingSecret: secret }).where(eq(partners.id, id));
  await log(admin, "partner.signing_secret_rotated", "partner", id, null);
  revalidatePath(`/partners/${id}`);
  return { ok: "New signing secret. Give it to the partner now: pushes are signed with it from this moment.", secret };
}

export async function testPartner(_: State, form: FormData): Promise<State> {
  await requireAdmin();
  const db = await getDb();
  const [p] = await db.select().from(partners).where(eq(partners.id, str(form, "partnerId")));
  if (!p?.webhookUrl) return { error: "Add a webhook URL first." };
  const d = await pingPartner(db, { ...p, active: true });
  revalidatePath(`/partners/${p.id}`);
  return d.status === "sent" ? { ok: `Ping delivered: HTTP ${d.lastStatus} in ${d.ms} ms.` } : { error: `Ping failed: ${d.lastError ?? "no response"}` };
}

export async function retry(form: FormData) {
  const admin = await requireAdmin();
  const ids = form.getAll("id").map(Number).filter(Number.isFinite);
  const partnerId = str(form, "partnerId") || undefined;
  const db = await getDb();
  const n = await retryDeliveries(db, { ids, partnerId });
  await log(admin, "deliveries.retried", "partner", partnerId ?? "all", null, { n });
  revalidatePath("/deliveries");
  if (partnerId) revalidatePath(`/partners/${partnerId}`);
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * "View as": a one-hour, look-only session in the app as this person. Logged in the audit log.
 * Opens the app via a single-use link (valid 5 minutes).
 */
export async function viewAs(form: FormData) {
  const admin = await requireAdmin();
  const userId = str(form, "userId");
  const db = await getDb();
  const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId));
  if (!u || u.id === admin.id) redirect("/users");
  const raw = await createLoginToken(db, { purpose: "impersonate", userId: u.id, invitedByUserId: admin.id, ttlHours: 1 / 12 });
  await log(admin, "admin.viewed_as", "user", u.id, null, { name: u.name });
  redirect(`${APP_URL}/auth/${raw}`);
}

/** Who's a Listgate admin. Only full admins can change this. */
export async function setAdminAccess(form: FormData) {
  const me = await requireAdmin();
  if (!canSeeMoney(me)) return;
  const userId = String(form.get("userId") ?? "");
  const access = String(form.get("access") ?? "");
  if (!UUID.test(userId) || !["none", "full", "tech"].includes(access) || userId === me.id) return;
  const db = await getDb();
  await db
    .update(users)
    .set(access === "none" ? { isPlatformAdmin: false, adminRole: "full" } : { isPlatformAdmin: true, adminRole: access as "full" | "tech" })
    .where(eq(users.id, userId));
  await db.insert(auditLog).values({ actorUserId: me.id, actorLabel: me.name, action: "admin.access_changed", entityType: "user", entityId: userId, data: { access } });
  revalidatePath(`/users/${userId}`);
}


/** A CRM sending one feed for all its agencies (e.g. LockedOn). Gets its own feed token. */
export async function createSource(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const name = str(form, "name");
  if (!name) return { error: "Add the CRM's name." };
  const db = await getDb();
  const slug = slugify(str(form, "slug") || name) || "crm";
  const [s] = await db
    .insert(sources)
    .values({ name, slug, feedToken: newFeedToken(), contactEmail: str(form, "contactEmail") || null, notes: str(form, "notes") || null })
    .onConflictDoNothing()
    .returning();
  if (!s) return { error: `There's already a CRM feed called ${slug}.` };
  await log(admin, "source.created", "source", s.id, null, { name });
  revalidatePath("/sources");
  return { ok: `${name} added. Give them the feed URL in the table below.` };
}

/** New token for a CRM feed. The old URL stops working at once. */
export async function rotateSourceToken(form: FormData) {
  const admin = await requireAdmin();
  const id = str(form, "sourceId");
  const db = await getDb();
  await db.update(sources).set({ feedToken: newFeedToken() }).where(eq(sources.id, id));
  await log(admin, "source.token_rotated", "source", id, null);
  revalidatePath("/sources");
}

/** Locks (or unlocks) agent changes for an office from a CRM feed, e.g. after a complaint. */
export async function setAgentsLock(form: FormData) {
  const admin = await requireAdmin();
  const id = str(form, "agencyId");
  const on = str(form, "lock") === "1";
  const db = await getDb();
  const queued = await setAgentsLocked(db, id, on, str(form, "reason").slice(0, 300));
  await log(admin, on ? "agency.agents_locked" : "agency.agents_unlocked", "agency", id, id, { reason: str(form, "reason") || null, queued });
  revalidatePath(`/agencies/${id}`);
}

/** Turns on the property database feed for a CRM (or issues a new token: the old URL stops at once). */
export async function rotatePropertyToken(form: FormData) {
  const admin = await requireAdmin();
  const id = str(form, "sourceId");
  const db = await getDb();
  await db.update(sources).set({ propertyToken: newFeedToken() }).where(eq(sources.id, id));
  await log(admin, "source.property_token", "source", id, null);
  revalidatePath(`/sources/${id}`);
}

/** Saves the column mapping for a CRM's property files. Clears the stored sample (it may hold columns we don't keep). */
export async function savePropertyMapping(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const id = str(form, "sourceId");
  const fields: Record<string, { column: string; transform: "ha_to_m2" | "list" | "none" }> = {};
  for (const f of PROPERTY_FIELDS) {
    const column = str(form, `col_${f}`);
    if (!column) continue;
    const t = str(form, `tr_${f}`);
    fields[f] = { column, transform: t === "ha_to_m2" ? "ha_to_m2" : f === "features" || f === "agentRefs" ? "list" : "none" };
  }
  if (!fields.extId) return { error: "Map the property ID column. It's how updates find the same property." };
  const db = await getDb();
  await db.update(sources).set({ propertyMapping: { fields, updatedAt: new Date().toISOString(), updatedBy: admin.name }, ...(form.get("keepSample") ? {} : { propertySample: null }) }).where(eq(sources.id, id));
  await log(admin, "source.mapping_saved", "source", id, null, { fields: Object.keys(fields) });
  revalidatePath(`/sources/${id}`);
  return { ok: "Mapping saved. Ask the CRM to send the file again (the one that needed mapping wasn't stored)." };
}

/** CRM sign-in (OAuth) settings, and the signed-link secret. */
export async function saveSourceSso(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const id = str(form, "sourceId");
  const db = await getDb();
  const [s] = await db.select().from(sources).where(eq(sources.id, id));
  if (!s) return { error: "Not found." };
  const sso = {
    enabled: form.get("enabled") === "on",
    label: str(form, "label") || undefined,
    authorizeUrl: str(form, "authorizeUrl") || undefined,
    tokenUrl: str(form, "tokenUrl") || undefined,
    userinfoUrl: str(form, "userinfoUrl") || undefined,
    clientId: str(form, "clientId") || undefined,
    // Blank keeps the saved secret.
    clientSecret: str(form, "clientSecret") || s.sso?.clientSecret,
    scope: str(form, "scope") || undefined,
    idPath: str(form, "idPath") || undefined,
    emailPath: str(form, "emailPath") || undefined,
    namePath: str(form, "namePath") || undefined,
    officePath: str(form, "officePath") || undefined,
    rolePath: str(form, "rolePath") || undefined,
    principalRoles: str(form, "principalRoles") || undefined,
  };
  for (const u of [sso.authorizeUrl, sso.tokenUrl, sso.userinfoUrl]) if (u && !/^https:\/\//.test(u)) return { error: "The OAuth URLs must start with https://." };
  if (sso.enabled && !(sso.clientId && sso.authorizeUrl && sso.tokenUrl && sso.userinfoUrl)) return { error: "Fill in the client ID and the three URLs before switching sign-in on." };
  await db.update(sources).set({ sso }).where(eq(sources.id, id));
  await log(admin, "source.sso_saved", "source", id, null, { enabled: sso.enabled });
  revalidatePath(`/sources/${id}`);
  return { ok: sso.enabled ? `Agents can now sign in with ${s.name}.` : "Saved." };
}

export async function rotateLinkSecret(form: FormData) {
  const admin = await requireAdmin();
  const id = str(form, "sourceId");
  const db = await getDb();
  await db.update(sources).set({ linkSecret: form.get("off") ? null : newSecret("lgl") }).where(eq(sources.id, id));
  await log(admin, form.get("off") ? "source.link_off" : "source.link_secret", "source", id, null);
  revalidatePath(`/sources/${id}`);
}
