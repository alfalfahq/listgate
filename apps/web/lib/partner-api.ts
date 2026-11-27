// Partner pull API (v1). Partners authenticate with their API key: Authorization: Bearer lg_…
// They only ever see listings from agencies that have switched them on.
import { and, eq, inArray } from "drizzle-orm";
import { agencies, agencyPartners, agentPartners, agents, eventFor, getDb, hashToken, assetsFor, listingPayload, mediaPublicUrl, partnersForListing, removedPayload, partners, type listings } from "@listgate/db";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requirePartner(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : req.headers.get("x-api-key") || "";
  if (!key) throw new ApiError(401, "Send your Listgate API key as Authorization: Bearer <key>.");
  const db = await getDb();
  const [p] = await db.select().from(partners).where(eq(partners.apiKeyHash, hashToken(key)));
  if (!p) throw new ApiError(401, "That API key isn't valid.");
  if (!p.active) throw new ApiError(403, "This partner is paused. Contact Listgate.");
  return p;
}

/**
 * Agencies that send to this partner, with the partner's own reference for each: ones that switched it on, plus
 * offices from CRM feeds where at least one agent unlocked it (each listing is then checked on its own).
 */
export async function agenciesFor(partnerId: string) {
  const db = await getDb();
  const direct = await db
    .select({ agency: agencies, ref: agencyPartners.partnerAgencyRef, since: agencyPartners.updatedAt })
    .from(agencyPartners)
    .innerJoin(agencies, eq(agencies.id, agencyPartners.agencyId))
    .where(and(eq(agencyPartners.partnerId, partnerId), eq(agencyPartners.enabled, true)));
  const srcs = await db.selectDistinct({ id: agentPartners.sourceId }).from(agentPartners).where(and(eq(agentPartners.partnerId, partnerId), eq(agentPartners.enabled, true)));
  if (!srcs.length) return direct;
  const seen = new Set(direct.map((d) => d.agency.id));
  const viaAgents = await db.select().from(agencies).where(inArray(agencies.sourceId, srcs.map((s) => s.id)));
  return [...direct, ...viaAgents.filter((a) => !seen.has(a.id)).map((a) => ({ agency: a, ref: null, since: a.createdAt }))];
}

type Partner = typeof partners.$inferSelect;
type Listing = typeof listings.$inferSelect;

/** Payloads for listings, with `removed: true` on ones this partner shouldn't show (withdrawn, or filtered out). */
export async function payloads(p: Partner, rows: Listing[], refs: Map<string, { agency: typeof agencies.$inferSelect; ref: string | null }>) {
  if (!rows.length) return [];
  const db = await getDb();
  const ids = [...new Set(rows.map((r) => r.agencyId))];
  const agentRows = await db.select().from(agents).where(inArray(agents.agencyId, ids));
  return Promise.all(
    rows.map(async (l) => {
      const a = refs.get(l.agencyId)!;
      const mine = agentRows.filter((g) => g.agencyId === l.agencyId);
      // Not shared with this partner (agent didn't unlock it, or kept it away): sent as removed, without the details.
      const shared = (await partnersForListing(db, l)).has(p.id);
      if (!shared) return { ...removedPayload(l, a.agency, a.ref), removed: true };
      return { ...listingPayload(l, a.agency, mine, p, a.ref, { assets: await assetsFor(db, l), publicUrl: mediaPublicUrl() }), removed: !shared || eventFor(p, l) === "listing.removed" };
    })
  );
}

export function api<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
      console.error("[api v1]", e);
      return Response.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

export const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
export function decodeCursor(c: string | null) {
  if (!c) return null;
  const [at, id] = Buffer.from(c, "base64url").toString().split("|");
  const d = new Date(at);
  if (!id || Number.isNaN(d.getTime())) throw new ApiError(400, "Bad cursor.");
  return { at: d, id };
}
