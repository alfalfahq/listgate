// Partner pushes. Every listing change is queued in `deliveries` for each partner the agency sends to,
// then a worker POSTs it to the partner's webhook, signed, with retries and backoff.
//
//   POST <partner.webhookUrl>
//   Content-Type: application/json
//   X-Listgate-Event: listing.upserted | listing.removed | ping
//   X-Listgate-Delivery: <delivery id>
//   X-Listgate-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the partner's signing secret>
//
// A 2xx means received. 410 Gone means "we don't want this agency/listing", also treated as done.
// Anything else (or a timeout) is retried: 1, 2, 4, 8… minutes, capped at 6 hours, until maxAttempts.
import { createHmac, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "./index";
import { listingPayload, removedPayload, PAYLOAD_VERSION } from "./payload";
import { assetsFor, mediaPublicUrl } from "./media";
import { agencies, agencyPartners, agentPartners, agents, deliveries, listingExclusions, listings, partners, type DeliveryEvent } from "./schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;
type Partner = typeof partners.$inferSelect;
type Listing = typeof listings.$inferSelect;

export const newSecret = (prefix: string) => `${prefix}_${randomBytes(24).toString("base64url")}`;

export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** What a partner gets for this listing right now: an upsert, a removal, or nothing (filtered out). */
export function eventFor(p: Pick<Partner, "kinds" | "includeSold">, l: Pick<Listing, "kind" | "status" | "removedAt">): DeliveryEvent {
  if (l.removedAt) return "listing.removed";
  if (p.kinds.length && !p.kinds.includes(l.kind)) return "listing.removed";
  if (!p.includeSold && (l.status === "sold" || l.status === "leased")) return "listing.removed";
  return "listing.upserted";
}

/** Partners this agency currently sends to (enabled, active, with a webhook). */
export async function pushPartnersFor(db: Tx, agencyId: string) {
  return db
    .select({ partner: partners })
    .from(agencyPartners)
    .innerJoin(partners, eq(partners.id, agencyPartners.partnerId))
    .where(and(eq(agencyPartners.agencyId, agencyId), eq(agencyPartners.enabled, true), eq(partners.active, true)))
    .then((rows) => rows.map((r) => r.partner).filter((p) => !!p.webhookUrl));
}

type Row = Pick<Listing, "id" | "version" | "kind" | "status" | "removedAt"> & { agentExtIds?: string[] };

/** One delivery. One that hasn't been picked up yet is updated in place, so ten resends in a minute mean one push. */
async function put(db: Tx, p: Partner, agencyId: string, l: Row, event: DeliveryEvent, holdMs = 0) {
  const now = new Date();
  // A new listing whose photos are still being copied waits a little, so its first push carries Listgate photo URLs.
  const at = holdMs && event !== "listing.removed" ? new Date(now.getTime() + holdMs) : now;
  const updated = await db
    .update(deliveries)
    .set({ event, listingVersion: l.version, status: "pending", attempts: 0, nextAttemptAt: at, lastError: null, updatedAt: now })
    .where(
      and(
        eq(deliveries.partnerId, p.id),
        eq(deliveries.listingId, l.id),
        inArray(deliveries.status, ["pending", "failed"]),
        or(isNull(deliveries.lockedUntil), lt(deliveries.lockedUntil, now))
      )
    )
    .returning({ id: deliveries.id });
  if (!updated.length) await db.insert(deliveries).values({ partnerId: p.id, agencyId, listingId: l.id, event, listingVersion: l.version, nextAttemptAt: at });
}

/** For agencies from a CRM-wide feed: partners each listing's agents unlocked (listing id → partners). */
async function unlockedPartnersFor(db: Tx, agencyId: string, rows: Row[]) {
  const out = new Map<string, Partner[]>();
  const [agency] = await db.select({ sourceId: agencies.sourceId, locked: agencies.agentsLockedAt }).from(agencies).where(eq(agencies.id, agencyId));
  const extIds = [...new Set(rows.flatMap((r) => r.agentExtIds ?? []))];
  if (!agency?.sourceId || agency.locked || !extIds.length) return out;
  const people = await db.select({ extId: agents.extId, email: agents.email }).from(agents).where(and(eq(agents.agencyId, agencyId), inArray(agents.extId, extIds)));
  const emailOf = new Map(people.filter((a) => a.email).map((a) => [a.extId, a.email!.toLowerCase()]));
  const emails = [...new Set(emailOf.values())];
  if (!emails.length) return out;
  const grants = await db
    .select({ email: agentPartners.email, partner: partners })
    .from(agentPartners)
    .innerJoin(partners, eq(partners.id, agentPartners.partnerId))
    .where(and(eq(agentPartners.sourceId, agency.sourceId), eq(agentPartners.enabled, true), inArray(agentPartners.email, emails), eq(partners.active, true)));
  for (const r of rows) {
    const mine = new Set((r.agentExtIds ?? []).map((x) => emailOf.get(x)).filter(Boolean));
    out.set(r.id, grants.filter((g) => mine.has(g.email) && g.partner.webhookUrl).map((g) => g.partner));
  }
  return out;
}

/**
 * Queues the change for every partner that should hear about it: the partners the agency turned on, plus any partner
 * one of the listing's agents unlocked. A partner that was sent the listing but no longer qualifies (the agent locked it
 * again, or left the listing) gets listing.removed.
 */
export async function enqueue(db: Tx, agencyId: string, rows: Row[], opts: { partners?: Partner[]; event?: DeliveryEvent; hold?: Set<string>; holdMs?: number } = {}) {
  const hold = (l: Row) => (opts.hold?.has(l.id) ? opts.holdMs ?? 180_000 : 0);
  if (!rows.length) return 0;
  let n = 0;
  // Listings an agent kept away from a partner: always a removal for that partner.
  const ex = new Set(
    (await db.select({ l: listingExclusions.listingId, p: listingExclusions.partnerId }).from(listingExclusions).where(inArray(listingExclusions.listingId, rows.map((r) => r.id)))).map((x) => `${x.l}:${x.p}`)
  );
  const ev = (p: Partner, l: Row) => (ex.has(`${l.id}:${p.id}`) ? "listing.removed" : opts.event ?? eventFor(p, l));
  if (opts.partners) {
    for (const p of opts.partners) for (const l of rows) (await put(db, p, agencyId, l, ev(p, l), hold(l)), n++);
    return n;
  }
  const base = await pushPartnersFor(db, agencyId);
  const unlocked = await unlockedPartnersFor(db, agencyId, rows);
  const last = await db
    .selectDistinctOn([deliveries.partnerId, deliveries.listingId], { partnerId: deliveries.partnerId, listingId: deliveries.listingId, event: deliveries.event })
    .from(deliveries)
    .where(inArray(deliveries.listingId, rows.map((r) => r.id)))
    .orderBy(deliveries.partnerId, deliveries.listingId, desc(deliveries.id));
  const stale = last.filter((d) => d.event === "listing.upserted");
  const staleIds = [...new Set(stale.map((d) => d.partnerId))];
  const staleP = new Map((staleIds.length ? await db.select().from(partners).where(inArray(partners.id, staleIds)) : []).map((p) => [p.id, p]));
  for (const l of rows) {
    const targets = new Map(base.map((p) => [p.id, p]));
    for (const p of unlocked.get(l.id) ?? []) targets.set(p.id, p);
    for (const p of targets.values()) (await put(db, p, agencyId, l, ev(p, l), hold(l)), n++);
    for (const d of stale) {
      const p = staleP.get(d.partnerId);
      if (d.listingId !== l.id || targets.has(d.partnerId) || !p?.active || !p.webhookUrl) continue;
      await put(db, p, agencyId, l, "listing.removed");
      n++;
    }
  }
  return n;
}

/**
 * An agent unlocking (or locking) their own listings from a CRM-wide feed for one partner.
 * Queues their listings: upserts when unlocked, removals when locked (unless something else still covers them).
 */
export async function setAgentUnlock(db: Db, o: { sourceId: string; email: string; partnerId: string; enabled: boolean; userId?: string | null }) {
  const email = o.email.trim().toLowerCase();
  await db
    .insert(agentPartners)
    .values({ sourceId: o.sourceId, email, partnerId: o.partnerId, enabled: o.enabled, userId: o.userId ?? null })
    .onConflictDoUpdate({ target: [agentPartners.sourceId, agentPartners.email, agentPartners.partnerId], set: { enabled: o.enabled, userId: o.userId ?? null, updatedAt: new Date() } });
  const rows = await agentListings(db, o.sourceId, email, { live: o.enabled });
  await touch(db, rows.map((r) => r.id));
  const byAgency = new Map<string, typeof rows>();
  for (const r of rows) byAgency.set(r.agencyId, [...(byAgency.get(r.agencyId) ?? []), r]);
  let n = 0;
  for (const [agencyId, part] of byAgency) n += await enqueue(db, agencyId, part);
  return n;
}

/** Listings in a source where this email is one of the listing agents. */
export async function agentListings(db: Tx, sourceId: string, email: string, opts: { live?: boolean } = {}) {
  return db
    .selectDistinct({ listing: listings })
    .from(listings)
    .innerJoin(agencies, eq(agencies.id, listings.agencyId))
    .innerJoin(agents, and(eq(agents.agencyId, listings.agencyId), sql`jsonb_exists(${listings.agentExtIds}, ${agents.extId})`))
    .where(and(eq(agencies.sourceId, sourceId), sql`lower(${agents.email}) = ${email.trim().toLowerCase()}`, opts.live ? isNull(listings.removedAt) : undefined))
    .then((r) => r.map((x) => x.listing));
}

/** Everything an agency has live (or all of it, for removals), for when a partner is switched on or off. */
export async function enqueueAgencyForPartner(db: Db, agencyId: string, partner: Partner, mode: "backfill" | "remove") {
  const rows = await db
    .select({ id: listings.id, version: listings.version, kind: listings.kind, status: listings.status, removedAt: listings.removedAt })
    .from(listings)
    .where(mode === "backfill" ? and(eq(listings.agencyId, agencyId), isNull(listings.removedAt)) : eq(listings.agencyId, agencyId));
  if (!partner.webhookUrl) return 0;
  return enqueue(db, agencyId, rows, { partners: [partner], event: mode === "remove" ? "listing.removed" : undefined });
}

const backoffMs = (attempts: number) => Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 6 * 3_600_000);

/** The JSON body for one delivery. Exported so admin can show exactly what was (or will be) sent. */
export async function buildBody(db: Db, d: typeof deliveries.$inferSelect, partner: Partner) {
  const base = { id: String(d.id), event: d.event, payloadVersion: PAYLOAD_VERSION, sentAt: new Date().toISOString() };
  if (d.event === "ping" || !d.listingId) return { ...base, listing: null };
  const [l] = await db.select().from(listings).where(eq(listings.id, d.listingId));
  if (!l) return null;
  const [agency] = await db.select().from(agencies).where(eq(agencies.id, l.agencyId));
  const [ap] = await db.select({ ref: agencyPartners.partnerAgencyRef }).from(agencyPartners).where(and(eq(agencyPartners.agencyId, l.agencyId), eq(agencyPartners.partnerId, partner.id)));
  if (d.event === "listing.removed") return { ...base, listing: removedPayload(l, agency, ap?.ref) };
  const agentRows = l.agentExtIds.length ? await db.select().from(agents).where(and(eq(agents.agencyId, l.agencyId), inArray(agents.extId, l.agentExtIds))) : [];
  return { ...base, listing: listingPayload(l, agency, agentRows, partner, ap?.ref, { assets: await assetsFor(db, l), publicUrl: mediaPublicUrl() }) };
}

async function send(db: Db, d: typeof deliveries.$inferSelect, partner: Partner) {
  const started = Date.now();
  const finish = async (ok: boolean, status: number | null, error: string | null) => {
    const ms = Date.now() - started;
    const attempts = d.attempts + 1;
    // A ping is a one-off test: never retried in the background.
    const dead = !ok && (attempts >= partner.maxAttempts || d.event === "ping");
    await db
      .update(deliveries)
      .set({
        status: ok ? "sent" : dead ? "dead" : "failed",
        attempts,
        lastStatus: status,
        lastError: error?.slice(0, 500) ?? null,
        ms,
        sentAt: ok ? new Date() : null,
        nextAttemptAt: ok ? d.nextAttemptAt : new Date(Date.now() + backoffMs(attempts)),
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, d.id));
    await db
      .update(partners)
      .set(ok ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date(), lastError: error?.slice(0, 300) ?? null })
      .where(eq(partners.id, partner.id));
    return ok;
  };
  if (!partner.active || !partner.webhookUrl) return finish(false, null, "Partner is paused or has no webhook URL.");
  const payload = await buildBody(db, d, partner);
  if (!payload) return finish(true, null, "Listing no longer exists; skipped.");
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(partner.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Listgate/1 (+https://listgate.com.au)",
        "x-listgate-event": d.event,
        "x-listgate-delivery": String(d.id),
        "x-listgate-signature": sign(partner.signingSecret, body),
      },
      body,
      signal: AbortSignal.timeout(15_000),
      redirect: "manual",
    });
    const ok = (res.status >= 200 && res.status < 300) || res.status === 410;
    const text = ok ? null : `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
    return finish(ok, res.status, text);
  } catch (e) {
    return finish(false, null, e instanceof Error ? e.message : String(e));
  }
}

/** Claims and sends up to `limit` due deliveries. Safe to run from several app instances at once.
 *  A paused partner's deliveries wait (without using up tries) until it's active again. */
export async function deliverDue(db: Db, limit = 50) {
  const claimed = await db.execute<{ id: number }>(sql`
    update ${deliveries} set locked_until = now() + interval '2 minutes'
    where id in (
      select d.id from ${deliveries} d join ${partners} p on p.id = d.partner_id
      where d.status in ('pending', 'failed') and d.next_attempt_at <= now() and (d.locked_until is null or d.locked_until < now())
        and p.active and p.webhook_url is not null
      order by d.id limit ${limit}
      for update of d skip locked
    )
    returning id`);
  const ids = ((claimed as unknown as { rows?: { id: number }[] }).rows ?? (claimed as unknown as { id: number }[])).map((r) => Number(r.id));
  if (!ids.length) return { sent: 0, failed: 0 };
  const rows = await db.select().from(deliveries).where(inArray(deliveries.id, ids));
  const ps = await db.select().from(partners).where(inArray(partners.id, [...new Set(rows.map((r) => r.partnerId))]));
  const byId = new Map(ps.map((p) => [p.id, p]));
  let sent = 0;
  let failed = 0;
  // Oldest first so a listing's changes arrive in order; partners should still compare `version`.
  for (const d of rows.sort((a, b) => a.id - b.id)) {
    const p = byId.get(d.partnerId);
    if (!p) continue;
    if (await send(db, d, p)) sent++;
    else failed++;
  }
  return { sent, failed };
}

/** Sends one test event to a partner's webhook right now and reports what came back. */
export async function pingPartner(db: Db, partner: Partner) {
  const [d] = await db.insert(deliveries).values({ partnerId: partner.id, event: "ping" }).returning();
  await send(db, d, partner);
  const [after] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
  return after;
}

/** Puts failed and dead deliveries back in the queue (all of a partner's, or the given ids). */
export async function retryDeliveries(db: Db, opts: { partnerId?: string; ids?: number[] }) {
  const now = new Date();
  const where = opts.ids?.length
    ? inArray(deliveries.id, opts.ids)
    : opts.partnerId
      ? and(eq(deliveries.partnerId, opts.partnerId), inArray(deliveries.status, ["failed", "dead"]))
      : inArray(deliveries.status, ["failed", "dead"]);
  const r = await db.update(deliveries).set({ status: "pending", attempts: 0, nextAttemptAt: now, lockedUntil: null, updatedAt: now }).where(where).returning({ id: deliveries.id });
  return r.length;
}

/**
 * Turns a partner on or off for a whole office (agency-level). Off recomputes rather than removing everything,
 * so listings an agent unlocked themselves keep going to the partner.
 */
export async function setOfficeUnlock(db: Db, o: { agencyId: string; partner: Partner; enabled: boolean; userId: string; userName: string; authorisedBy?: string }) {
  await db
    .insert(agencyPartners)
    .values({ agencyId: o.agencyId, partnerId: o.partner.id, enabled: o.enabled, changedById: o.userId, changedByName: o.userName })
    .onConflictDoUpdate({ target: [agencyPartners.agencyId, agencyPartners.partnerId], set: { enabled: o.enabled, changedById: o.userId, changedByName: o.userName, updatedAt: new Date() } });
  if (o.enabled && o.authorisedBy) await db.update(agencies).set({ authorisedAt: new Date(), authorisedBy: o.authorisedBy }).where(and(eq(agencies.id, o.agencyId), isNull(agencies.authorisedAt)));
  await db.update(listings).set({ updatedAt: new Date() }).where(eq(listings.agencyId, o.agencyId));
  if (!o.partner.active || !o.partner.webhookUrl) return 0;
  if (o.enabled) return enqueueAgencyForPartner(db, o.agencyId, o.partner, "backfill");
  const rows = await db.select().from(listings).where(eq(listings.agencyId, o.agencyId));
  return enqueue(db, o.agencyId, rows);
}

/** Admin lock on an office's agent unlocks. Re-queues its listings so agent-only partners are told to remove them (or get them back). */
export async function setAgentsLocked(db: Db, agencyId: string, locked: boolean, reason?: string | null) {
  await db.update(agencies).set({ agentsLockedAt: locked ? new Date() : null, agentsLockedReason: locked ? reason || null : null }).where(eq(agencies.id, agencyId));
  const rows = await db.select().from(listings).where(eq(listings.agencyId, agencyId));
  await touch(db, rows.map((r) => r.id));
  return enqueue(db, agencyId, locked ? rows : rows.filter((r) => !r.removedAt));
}

/** Bumps updatedAt so pull-API partners see a visibility change on their next `updatedSince` sync. */
async function touch(db: Tx, ids: string[]) {
  if (ids.length) await db.update(listings).set({ updatedAt: new Date() }).where(inArray(listings.id, ids));
}

/** Keeps one listing away from one partner (or lets it through again), and tells the partner. */
export async function setListingExclusion(db: Db, o: { listingId: string; partnerId: string; excluded: boolean; userId?: string | null; byName?: string | null }) {
  if (o.excluded) await db.insert(listingExclusions).values({ listingId: o.listingId, partnerId: o.partnerId, userId: o.userId ?? null, byName: o.byName ?? null }).onConflictDoNothing();
  else await db.delete(listingExclusions).where(and(eq(listingExclusions.listingId, o.listingId), eq(listingExclusions.partnerId, o.partnerId)));
  await touch(db, [o.listingId]);
  const [l] = await db.select().from(listings).where(eq(listings.id, o.listingId));
  return l ? enqueue(db, l.agencyId, [l]) : 0;
}

/** Partners a listing currently goes to (agency-level, agent unlocks, minus exclusions). For the pull API and the agent page. */
export async function partnersForListing(db: Db, l: Listing) {
  const base = await db
    .select({ id: agencyPartners.partnerId })
    .from(agencyPartners)
    .where(and(eq(agencyPartners.agencyId, l.agencyId), eq(agencyPartners.enabled, true)));
  const unlocked = await unlockedPartnersFor(db, l.agencyId, [l]);
  const ex = await db.select({ p: listingExclusions.partnerId }).from(listingExclusions).where(eq(listingExclusions.listingId, l.id));
  const out = new Set([...base.map((b) => b.id), ...(unlocked.get(l.id) ?? []).map((p) => p.id)]);
  for (const e of ex) out.delete(e.p);
  return out;
}
