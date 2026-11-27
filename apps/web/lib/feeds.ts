import { agencyByFeedToken, FeedError, getDb, ingestFeed, ingestSourceFeed, sourceByFeedToken, type FeedVia } from "@listgate/db";
import { config } from "./config";
import { kickDeliveries } from "./deliver";

/**
 * Reads a feed body (raw XML, or a multipart upload with one file) and stores it for the agency with this token,
 * or, for a CRM-wide token, splits it across that CRM's agencies.
 */
export async function receiveFeed(req: Request, token: string, via: FeedVia, fileName?: string | null): Promise<Response> {
  const db = await getDb();
  const agency = await agencyByFeedToken(db, token);
  const source = agency ? null : await sourceByFeedToken(db, token);
  if (!agency && !source) return Response.json({ ok: false, error: "Unknown feed token." }, { status: 401 });
  const len = Number(req.headers.get("content-length") || 0);
  if (len > config.maxFeedMb * 1_048_576) return Response.json({ ok: false, error: `Feed files can be up to ${config.maxFeedMb} MB.` }, { status: 413 });

  let xml = "";
  const type = req.headers.get("content-type") || "";
  if (type.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = [...form.values()].find((v): v is File => typeof v === "object" && "text" in v);
    if (!file) return Response.json({ ok: false, error: "Attach the REAXML file." }, { status: 400 });
    fileName ||= file.name;
    xml = await file.text();
  } else {
    xml = await req.text();
  }
  if (Buffer.byteLength(xml) > config.maxFeedMb * 1_048_576) return Response.json({ ok: false, error: `Feed files can be up to ${config.maxFeedMb} MB.` }, { status: 413 });

  try {
    const r = agency ? await ingestFeed(db, agency, xml, { via, fileName }) : await ingestSourceFeed(db, source!, xml, { via, fileName });
    if (r.queued) kickDeliveries();
    return Response.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof FeedError) return Response.json({ ok: false, error: e.message }, { status: 400 });
    console.error("[feed]", e);
    return Response.json({ ok: false, error: "Couldn't store the feed. Try again shortly." }, { status: 500 });
  }
}
