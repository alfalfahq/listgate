import { searchListings } from "@/lib/agent";
import { handle, HttpError, requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?agencyId=&q= → listings this agent can keep away from partners, with where each goes now. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const r = await searchListings(user, q.get("agencyId") || "", (q.get("q") || "").slice(0, 80));
  if (!r) throw new HttpError(403, "You're not an agent at this office.");
  return Response.json(r);
});
