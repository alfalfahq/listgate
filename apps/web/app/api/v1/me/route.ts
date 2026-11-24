import { api, requirePartner } from "@/lib/partner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/me: checks your key and shows your partner settings. */
export const GET = api(async (req: Request) => {
  const p = await requirePartner(req);
  return Response.json({ data: { id: p.id, name: p.name, slug: p.slug, webhookUrl: p.webhookUrl, kinds: p.kinds, includeSold: p.includeSold, confidential: p.confidential } });
});
