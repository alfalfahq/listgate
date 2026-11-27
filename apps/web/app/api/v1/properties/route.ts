import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { agencies, getDb, properties, propertyPayload, propertyShares } from "@listgate/db";
import { api, ApiError, decodeCursor, encodeCursor, requirePartner } from "@/lib/partner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/properties — CRM property databases offices or agents have shared with you. No owner details, ever.
 *   ?cursor=<nextCursor>   continue (store the last nextCursor and start from it next time: you get only changes)
 *   ?limit=1-1000          page size (default 500)
 * Each item is a property, or { id, removed: true } when it's no longer shared with you or was deleted: delete it.
 * First sync: no cursor, page until nextCursor is null. Keep the final cursor for the next run.
 */
export const GET = api(async (req: Request) => {
  const p = await requirePartner(req);
  if (!p.acceptsProperties) throw new ApiError(403, "Your Listgate account isn't set up for property databases.");
  const q = new URL(req.url).searchParams;
  const limit = Math.min(1000, Math.max(1, Number(q.get("limit")) || 500));
  const cursor = decodeCursor(q.get("cursor"));
  const db = await getDb();
  const rows = await db
    .select()
    .from(propertyShares)
    .where(and(eq(propertyShares.partnerId, p.id), cursor ? or(gt(propertyShares.changedAt, cursor.at), and(eq(propertyShares.changedAt, cursor.at), gt(propertyShares.propertyId, cursor.id))) : undefined))
    .orderBy(asc(propertyShares.changedAt), asc(propertyShares.propertyId))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const visibleIds = page.filter((r) => r.visible).map((r) => r.propertyId);
  const props = visibleIds.length ? await db.select({ p: properties, a: agencies }).from(properties).innerJoin(agencies, eq(agencies.id, properties.agencyId)).where(inArray(properties.id, visibleIds)) : [];
  const byId = new Map(props.map((x) => [x.p.id, x]));
  const data = page.map((r) => {
    const x = r.visible ? byId.get(r.propertyId) : null;
    return x ? { ...propertyPayload(x.p, x.a), removed: false } : { id: r.propertyId, removed: true };
  });
  const last = page[page.length - 1];
  // Always hand back a cursor (even on the last page) so the next run starts after what you've seen.
  return Response.json({ data, nextCursor: rows.length > limit && last ? encodeCursor(last.changedAt, last.propertyId) : null, resumeCursor: last ? encodeCursor(last.changedAt, last.propertyId) : cursor ? q.get("cursor") : null });
});
