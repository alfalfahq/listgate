import { and, asc, eq, gt, inArray, isNull, or, type SQL } from "drizzle-orm";
import { getDb, listings } from "@listgate/db";
import { agenciesFor, api, ApiError, decodeCursor, encodeCursor, payloads, requirePartner } from "@/lib/partner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/listings
 *   ?updatedSince=<ISO time>   only listings changed after this (include removed ones, so you can delete them)
 *   ?cursor=<nextCursor>       next page
 *   ?limit=1-500               page size (default 100)
 *   ?agency=<id>               one agency
 * Without updatedSince, removed listings are left out (a fresh full sync).
 * Sync loop: page until nextCursor is null, keep the last item's updatedAt, pass it as updatedSince next time.
 */
export const GET = api(async (req: Request) => {
  const p = await requirePartner(req);
  const q = new URL(req.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(q.get("limit")) || 100));
  const since = q.get("updatedSince");
  const sinceAt = since ? new Date(since) : null;
  if (sinceAt && Number.isNaN(sinceAt.getTime())) throw new ApiError(400, "updatedSince must be an ISO date-time.");
  const cursor = decodeCursor(q.get("cursor"));

  const mine = await agenciesFor(p.id);
  const refs = new Map(mine.map((m) => [m.agency.id, { agency: m.agency, ref: m.ref }]));
  let ids = [...refs.keys()];
  const only = q.get("agency");
  if (only) ids = ids.filter((i) => i === only);
  if (!ids.length) return Response.json({ data: [], nextCursor: null });

  const where: SQL[] = [inArray(listings.agencyId, ids)];
  if (sinceAt) where.push(gt(listings.updatedAt, sinceAt));
  else where.push(isNull(listings.removedAt));
  if (cursor) where.push(or(gt(listings.updatedAt, cursor.at), and(eq(listings.updatedAt, cursor.at), gt(listings.id, cursor.id)))!);

  const db = await getDb();
  const rows = await db.select().from(listings).where(and(...where)).orderBy(asc(listings.updatedAt), asc(listings.id)).limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return Response.json({ data: await payloads(p, page, refs), nextCursor: rows.length > limit && last ? encodeCursor(last.updatedAt, last.id) : null });
});
