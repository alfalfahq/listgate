import { receiveFeed } from "@/lib/feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same as /api/feeds/reaxml/<token>, for CRMs that put the token in ?token= or an X-Feed-Token header. */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || req.headers.get("x-feed-token") || "";
  if (!token) return Response.json({ ok: false, error: "Missing feed token." }, { status: 401 });
  return receiveFeed(req, token, "http", req.headers.get("x-file-name"));
}
