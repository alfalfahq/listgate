// Manual upload of a REAXML file from the agency app (testing, or a CRM that only exports files).
import { FeedError, getDb, ingestFeed } from "@listgate/db";
import { audit } from "@/lib/audit";
import { handle, HttpError, requireAgency } from "@/lib/auth";
import { getAgency } from "@/lib/agency";
import { config } from "@/lib/config";
import { kickDeliveries } from "@/lib/deliver";

export const runtime = "nodejs";

export const POST = handle(async (req: Request) => {
  const form = await req.formData();
  const agencyId = String(form.get("agencyId") || "");
  const user = await requireAgency(agencyId, { write: true });
  const agency = await getAgency(agencyId);
  const file = form.get("file");
  if (!agency) throw new HttpError(404, "Agency not found.");
  if (!file || typeof file === "string") throw new HttpError(400, "Choose a REAXML file.");
  if (file.size > config.maxFeedMb * 1_048_576) throw new HttpError(413, `Files can be up to ${config.maxFeedMb} MB.`);
  try {
    const r = await ingestFeed(await getDb(), agency, await file.text(), { via: "upload", fileName: file.name });
    if (r.queued) kickDeliveries();
    await audit({ actor: { id: user.id, name: user.name }, action: "feed.uploaded", entityType: "agency", entityId: agencyId, agencyId, data: { file: file.name, ...r } });
    return Response.json({ ok: true, message: `${r.received} listings read: ${r.created} new, ${r.updated} updated, ${r.removed} removed, ${r.unchanged} unchanged.`, ...r });
  } catch (e) {
    if (e instanceof FeedError) throw new HttpError(400, e.message);
    throw e;
  }
});
