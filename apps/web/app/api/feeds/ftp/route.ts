import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { receiveFeed } from "@/lib/feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The FTP receiver (apps/ftp) relays each uploaded file here. Not for CRMs to call directly. */
export async function POST(req: Request) {
  const key = Buffer.from(req.headers.get("x-listgate-ftp-key") || "");
  const want = Buffer.from(config.ftpRelayKey);
  if (!want.length || key.length !== want.length || !timingSafeEqual(key, want)) return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
  return receiveFeed(req, req.headers.get("x-feed-token") || "", "ftp", req.headers.get("x-file-name"));
}
