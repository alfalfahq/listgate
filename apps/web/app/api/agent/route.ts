// Agents unlocking their listings from a CRM-wide feed: their own (by email), or the whole office (with a tick).
import { eq } from "drizzle-orm";
import { agencies, getDb, partners, setAgentUnlock, setOfficeUnlock } from "@listgate/db";
import { isAgentAt, isAgentInSource } from "@/lib/agent";
import { audit } from "@/lib/audit";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { kickDeliveries } from "@/lib/deliver";
import { brandedHtml, esc, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const POST = handle(async (req: Request) => {
  const user = await requireUser({ write: true });
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  const [p] = await db.select().from(partners).where(eq(partners.id, s(body.partnerId, 60)));
  if (!p || !p.active || (!p.listed && !user.admin)) throw new HttpError(404, "Partner not found.");
  const enabled = body.enabled === true;

  if (body.action === "mine") {
    const sourceId = s(body.sourceId, 60);
    if (!(await isAgentInSource(user.email, sourceId))) throw new HttpError(403, "None of the listings from this CRM have your email on them.");
    const queued = await setAgentUnlock(db, { sourceId, email: user.email, partnerId: p.id, enabled, userId: user.id });
    if (queued) kickDeliveries();
    await audit({ actor: { id: user.id, name: user.name }, action: enabled ? "agent.unlocked" : "agent.locked", entityType: "partner", entityId: p.id, data: { partner: p.name, email: user.email, sourceId, queued } });
    return Response.json({ ok: true, message: enabled ? `Your listings are on their way to ${p.name}.` : `${p.name} has been told to remove your listings.` });
  }

  if (body.action === "office") {
    const agencyId = s(body.agencyId, 60);
    if (!(await isAgentAt(user.email, agencyId))) throw new HttpError(403, "You're not a listing agent at this office.");
    const [locked] = await db.select({ at: agencies.agentsLockedAt }).from(agencies).where(eq(agencies.id, agencyId));
    if (locked?.at) throw new HttpError(403, `Listgate has locked changes for this office. Email ${config.contactEmail} if you need help.`);
    if (enabled && body.authorise !== true) throw new HttpError(400, "Tick the box to confirm you're authorised to approve this for the whole office.");
    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
    const who = `${user.name} <${user.email}>`;
    const queued = await setOfficeUnlock(db, { agencyId, partner: p, enabled, userId: user.id, userName: user.name, authorisedBy: enabled ? who : undefined });
    if (queued) kickDeliveries();
    await audit({ actor: { id: user.id, name: user.name }, action: enabled ? "office.unlocked" : "office.locked", entityType: "agency", entityId: agencyId, agencyId, data: { partner: p.name, by: who, queued } });
    // Listgate staff hear about every office-wide approval, so a wrong one can be caught and reversed.
    const staff = (process.env.ADMIN_EMAILS || config.contactEmail).split(",").map((e) => e.trim()).filter(Boolean);
    if (enabled && staff.length) {
      const link = `${config.adminUrl}/agencies/${agencyId}`;
      await sendEmail({
        to: staff,
        subject: `${user.name} unlocked ${agency.name} for ${p.name}`,
        text: `${who} ticked "authorised for the whole office" and unlocked every listing from ${agency.name} for ${p.name}.\n\n${link}`,
        html: brandedHtml({
          preheader: `Office-wide unlock for ${p.name}`,
          heading: "Office-wide unlock",
          paragraphs: [`${esc(who)} confirmed they're authorised for the whole office and unlocked every listing from <b>${esc(agency.name)}</b> for <b>${esc(p.name)}</b>.`, "If that doesn't look right, switch it off on the agency in admin."],
          button: { label: "Open the agency", url: link },
          footer: "Sent to Listgate admins for every office-wide unlock.",
        }),
      }).catch((e) => console.error("[agent] notify", e));
    }
    return Response.json({ ok: true, message: enabled ? `Every listing from ${agency.name} is on its way to ${p.name}.` : `Office-wide sending to ${p.name} is off. Listings agents unlocked themselves keep going.` });
  }
  throw new HttpError(400, "Unknown action.");
});
