// Agents on CRM-wide feeds: unlock their own listings or properties, approve the whole office (verified principal,
// or a tick box when the CRM has no sign-in), and keep single listings away from a partner.
import { eq } from "drizzle-orm";
import { agencies, getDb, partners, setAgentPropertyUnlock, setAgentUnlock, setListingExclusion, setOfficePropertyUnlock, setOfficeUnlock } from "@listgate/db";
import { canExclude, officeFor, sourceStanding } from "@/lib/agent";
import { audit } from "@/lib/audit";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { kickDeliveries } from "@/lib/deliver";
import { brandedHtml, esc, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function tellStaff(subject: string, line: string, agencyId: string) {
  const staff = (process.env.ADMIN_EMAILS || config.contactEmail).split(",").map((e) => e.trim()).filter(Boolean);
  if (!staff.length) return;
  const link = `${config.adminUrl}/agencies/${agencyId}`;
  await sendEmail({
    to: staff,
    subject,
    text: `${line}\n\n${link}`,
    html: brandedHtml({ preheader: subject, heading: "Office-wide approval", paragraphs: [esc(line), "If that doesn't look right, switch it off or lock the office in admin."], button: { label: "Open the office", url: link }, footer: "Sent to Listgate admins for every office-wide approval." }),
  }).catch((e) => console.error("[agent] notify", e));
}

export const POST = handle(async (req: Request) => {
  const user = await requireUser({ write: true });
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  const [p] = await db.select().from(partners).where(eq(partners.id, s(body.partnerId, 60)));
  if (!p || !p.active || (!p.listed && !user.admin)) throw new HttpError(404, "Partner not found.");
  const enabled = body.enabled === true;
  const actor = { id: user.id, name: user.name };
  const who = `${user.name} <${user.email}>`;

  // Office-level checks shared by listings and properties.
  const office = async () => {
    const o = await officeFor(user, s(body.agencyId, 60));
    if (!o) throw new HttpError(403, "You're not an agent at this office.");
    if (o.agency.agentsLockedAt) throw new HttpError(403, `Listgate has locked changes for this office. Email ${config.contactEmail} if you need help.`);
    if (enabled) {
      if (o.standing.verifiedMode && !o.standing.principal) throw new HttpError(403, `Only a principal or office admin can approve the whole office. ${o.source.name} says your role is ${o.standing.role ?? "agent"}.`);
      if (!o.standing.verifiedMode && body.authorise !== true) throw new HttpError(400, "Tick the box to confirm you're authorised to approve this for the whole office.");
    }
    return o;
  };

  switch (body.action) {
    case "mine": {
      const sourceId = s(body.sourceId, 60);
      if (!(await sourceStanding(user, sourceId))) throw new HttpError(403, "None of the listings from this CRM have your email on them.");
      const queued = await setAgentUnlock(db, { sourceId, email: user.email, partnerId: p.id, enabled, userId: user.id });
      if (queued) kickDeliveries();
      await audit({ actor, action: enabled ? "agent.unlocked" : "agent.locked", entityType: "partner", entityId: p.id, data: { partner: p.name, email: user.email, sourceId, queued } });
      return Response.json({ ok: true, message: enabled ? `Your listings are on their way to ${p.name}.` : `${p.name} has been told to remove your listings.` });
    }
    case "office": {
      const o = await office();
      const queued = await setOfficeUnlock(db, { agencyId: o.agency.id, partner: p, enabled, userId: user.id, userName: user.name, authorisedBy: enabled ? `${who}${o.standing.principal ? ` (${o.source.name}: ${o.standing.role})` : ""}` : undefined });
      if (queued) kickDeliveries();
      await audit({ actor, action: enabled ? "office.unlocked" : "office.locked", entityType: "agency", entityId: o.agency.id, agencyId: o.agency.id, data: { partner: p.name, by: who, role: o.standing.role, queued } });
      if (enabled) await tellStaff(`${user.name} unlocked ${o.agency.name} for ${p.name}`, `${who}${o.standing.principal ? `, ${o.source.name} ${o.standing.role}` : ""}, unlocked every listing from ${o.agency.name} for ${p.name}.`, o.agency.id);
      return Response.json({ ok: true, message: enabled ? `Every listing from ${o.agency.name} is on its way to ${p.name}.` : `Office-wide sending to ${p.name} is off. Listings agents unlocked themselves keep going.` });
    }
    case "propsMine": {
      if (!p.acceptsProperties) throw new HttpError(400, `${p.name} doesn't take property databases.`);
      const st = await sourceStanding(user, s(body.sourceId, 60));
      if (!st) throw new HttpError(403, "You're not an agent on this CRM.");
      const changed = await setAgentPropertyUnlock(db, { sourceId: st.source.id, refs: st.refs, partnerId: p.id, enabled, userId: user.id });
      await audit({ actor, action: enabled ? "agent.properties_unlocked" : "agent.properties_locked", entityType: "partner", entityId: p.id, data: { partner: p.name, sourceId: st.source.id, changed } });
      return Response.json({ ok: true, message: enabled ? `Your properties are shared with ${p.name}.` : `${p.name} has been told to delete your properties.` });
    }
    case "propsOffice": {
      if (!p.acceptsProperties) throw new HttpError(400, `${p.name} doesn't take property databases.`);
      const o = await office();
      const changed = await setOfficePropertyUnlock(db, { agencyId: o.agency.id, partnerId: p.id, enabled, userId: user.id, by: `${who}${o.standing.role ? ` (${o.standing.role})` : ""}` });
      await audit({ actor, action: enabled ? "office.properties_unlocked" : "office.properties_locked", entityType: "agency", entityId: o.agency.id, agencyId: o.agency.id, data: { partner: p.name, by: who, changed } });
      if (enabled) await tellStaff(`${user.name} shared ${o.agency.name}'s property database with ${p.name}`, `${who} shared the whole property database of ${o.agency.name} with ${p.name}.`, o.agency.id);
      return Response.json({ ok: true, message: enabled ? `${o.agency.name}'s property database is shared with ${p.name}.` : `${p.name} has been told to delete the office's properties. Properties agents shared themselves stay.` });
    }
    case "exclude": {
      const l = await canExclude(user, s(body.listingId, 60));
      if (!l) throw new HttpError(403, "You can only change your own listings (or the office's, as a verified principal).");
      const [a] = await db.select({ locked: agencies.agentsLockedAt }).from(agencies).where(eq(agencies.id, l.agencyId));
      if (a?.locked) throw new HttpError(403, `Listgate has locked changes for this office. Email ${config.contactEmail} if you need help.`);
      const excluded = body.excluded === true;
      const queued = await setListingExclusion(db, { listingId: l.id, partnerId: p.id, excluded, userId: user.id, byName: user.name });
      if (queued) kickDeliveries();
      await audit({ actor, action: excluded ? "listing.excluded" : "listing.included", entityType: "listing", entityId: l.id, agencyId: l.agencyId, data: { partner: p.name } });
      return Response.json({ ok: true, message: excluded ? `${p.name} has been told to remove this listing.` : `This listing can go to ${p.name} again.` });
    }
  }
  throw new HttpError(400, "Unknown action.");
});
