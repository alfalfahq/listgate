import { api, agenciesFor, requirePartner } from "@/lib/partner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/agencies: agencies that send their listings to you. */
export const GET = api(async (req: Request) => {
  const p = await requirePartner(req);
  const rows = await agenciesFor(p.id);
  return Response.json({
    data: rows.map(({ agency: a, ref, since }) => ({
      id: a.id,
      name: a.name,
      reaxmlAgentId: a.reaxmlAgentId,
      suburb: a.suburb,
      state: a.state,
      website: a.website,
      ref,
      sendingSince: since.toISOString(),
      lastFeedAt: a.lastFeedAt?.toISOString() ?? null,
    })),
  });
});
