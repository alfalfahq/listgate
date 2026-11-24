import { receiveFeed } from "@/lib/feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CRMs POST REAXML here: https://listgate.com.au/api/feeds/reaxml/<agency feed token>
 * Body: the XML itself (text/xml or application/xml), or a multipart upload with one file.
 * Response: { ok, received, created, updated, unchanged, removed, queued }.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return receiveFeed(req, decodeURIComponent(token), "http", req.headers.get("x-file-name"));
}

export async function GET() {
  return Response.json({ ok: true, message: "POST REAXML to this address to send listings to Listgate." });
}
