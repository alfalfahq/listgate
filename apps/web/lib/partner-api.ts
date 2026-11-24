// Partner pull API (v1). Partners authenticate with their API key: Authorization: Bearer lg_…
// They only ever see listings from agencies that have switched them on.
import { and, eq, inArray } from "drizzle-orm";
import { agencies, agencyPartners, agents, eventFor, getDb, hashToken, listingPayload, partners, type listings } from "@listgate/db";

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

/** Agencies that send to this partner, with the partner's own reference for each. */
export async function agenciesFor(partnerId: string) {
  const db = await getDb();
  return db
    .select({ agency: agencies, ref: agencyPartners.partnerAgencyRef, since: agencyPartners.updatedAt })
    .from(agencyPartners)
    .innerJoin(agencies, eq(agencies.id, agencyPartners.agencyId))
    .where(and(eq(agencyPartners.partnerId, partnerId), eq(agencyPartners.enabled, true)));
}

type Partner = typeof partners.$inferSelect;
type Listing = typeof listings.$inferSelect;

/** Payloads for listings, with `removed: true` on ones this partner shouldn't show (withdrawn, or filtered out). */
export async function payloads(p: Partner, rows: Listing[], refs: Map<string, { agency: typeof agencies.$inferSelect; ref: string | null }>) {
  if (!rows.length) return [];
  const db = await getDb();
  const ids = [...new Set(rows.map((r) => r.agencyId))];
  const agentRows = await db.select().from(agents).where(inArray(agents.agencyId, ids));
  return rows.map((l) => {
    const a = refs.get(l.agencyId)!;
    const mine = agentRows.filter((g) => g.agencyId === l.agencyId);
    return { ...listingPayload(l, a.agency, mine, p, a.ref), removed: eventFor(p, l) === "listing.removed" };
  });
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
