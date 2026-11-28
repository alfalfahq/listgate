import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { agencyByFeedToken, getDb, sourceByFeedToken } from "@listgate/db";
import { receiveFeed } from "@/lib/feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function relayAllowed(req: Request) {
  const key = Buffer.from(req.headers.get("x-listgate-ftp-key") || "");
  const want = Buffer.from(config.ftpRelayKey);
  return !!want.length && key.length === want.length && timingSafeEqual(key, want);
}

/** The FTP receiver checks a login's feed token here before it accepts any files. */
export async function GET(req: Request) {
  if (!relayAllowed(req)) return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
  const token = req.headers.get("x-feed-token") || "";
  const db = await getDb();
  const ok = !!((await agencyByFeedToken(db, token)) || (await sourceByFeedToken(db, token)));
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}

/** The FTP receiver (apps/ftp) relays each uploaded file here. Not for CRMs to call directly. */
export async function POST(req: Request) {
  if (!relayAllowed(req)) return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
  return receiveFeed(req, req.headers.get("x-feed-token") || "", "ftp", req.headers.get("x-file-name"));
}
