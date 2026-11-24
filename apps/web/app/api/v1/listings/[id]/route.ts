import { eq } from "drizzle-orm";
import { getDb, listings } from "@listgate/db";
import { agenciesFor, api, ApiError, payloads, requirePartner } from "@/lib/partner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/listings/<id>: one listing, if its agency sends to you. */
export const GET = api(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const p = await requirePartner(req);
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError(404, "Listing not found.");
  const db = await getDb();
  const [l] = await db.select().from(listings).where(eq(listings.id, id));
  const mine = await agenciesFor(p.id);
  const a = l && mine.find((m) => m.agency.id === l.agencyId);
  if (!l || !a) throw new ApiError(404, "Listing not found.");
  const [out] = await payloads(p, [l], new Map([[a.agency.id, { agency: a.agency, ref: a.ref }]]));
  return Response.json({ data: out });
});
