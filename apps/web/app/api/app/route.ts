// Agency app actions. Every write uses requireAgency(..., { write: true }) so admin view-as stays read-only.
import { and, eq, sql } from "drizzle-orm";
import { agencies, agencyMembers, agencyPartners, createLoginToken, enqueueAgencyForPartner, getDb, inviteLink, partners, users } from "@listgate/db";
import { audit } from "@/lib/audit";
import { handle, HttpError, isEmail, requireAgency } from "@/lib/auth";
import { getAgency, requireOwner } from "@/lib/agency";
import { kickDeliveries } from "@/lib/deliver";
import { brandedHtml, esc, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const agencyId = s(body.agencyId, 60);
  const user = await requireAgency(agencyId, { write: true });
  const agency = await getAgency(agencyId);
  if (!agency) throw new HttpError(404, "Agency not found.");
  const db = await getDb();
  const log = (action: string, data?: Record<string, unknown>) => audit({ actor: { id: user.id, name: user.name }, action, entityType: "agency", entityId: agencyId, agencyId, data });

  switch (body.action) {
    case "setPartner": {
      // Owners decide where the agency's listings go.
      await requireOwner(user, agencyId);
      const [p] = await db.select().from(partners).where(eq(partners.id, s(body.partnerId, 60)));
      if (!p || (!p.listed && !user.admin)) throw new HttpError(404, "Partner not found.");
      const enabled = body.enabled === true;
      if (enabled && !agency.authorisedAt) {
        if (body.authorise !== true) throw new HttpError(400, "Tick the box to confirm you're authorised to share this agency's listings.");
        await db.update(agencies).set({ authorisedAt: new Date(), authorisedBy: `${user.name} <${user.email}>` }).where(eq(agencies.id, agencyId));
        await log("agency.authorised");
      }
      await db
        .insert(agencyPartners)
        .values({ agencyId, partnerId: p.id, enabled, changedById: user.id, changedByName: user.name })
        .onConflictDoUpdate({ target: [agencyPartners.agencyId, agencyPartners.partnerId], set: { enabled, changedById: user.id, changedByName: user.name, updatedAt: new Date() } });
      // Switching on sends everything that's live; switching off tells the partner to take it all down.
      const queued = p.active ? await enqueueAgencyForPartner(db, agencyId, p, enabled ? "backfill" : "remove") : 0;
      if (queued) kickDeliveries();
      await log(enabled ? "partner.enabled" : "partner.disabled", { partner: p.name, queued });
      return Response.json({ ok: true, message: enabled ? `Your listings are on their way to ${p.name}.` : `${p.name} has been told to remove your listings.` });
    }
    case "updateAgency": {
      await requireOwner(user, agencyId);
      const set = {
        name: s(body.name, 120) || agency.name,
        contactEmail: s(body.contactEmail, 200) || null,
        website: s(body.website, 200) || null,
        crm: s(body.crm, 60) || null,
      };
      if (set.contactEmail && !isEmail(set.contactEmail)) throw new HttpError(400, "That contact email doesn't look right.");
      await db.update(agencies).set(set).where(eq(agencies.id, agencyId));
      await log("agency.updated", set);
      return Response.json({ ok: true, message: "Saved." });
    }
    case "invite": {
      await requireOwner(user, agencyId);
      const name = s(body.name, 120);
      const email = s(body.email, 200).toLowerCase();
      const role = body.role === "owner" ? "owner" : "editor";
      if (!name || !isEmail(email)) throw new HttpError(400, "Add their name and a valid email.");
      let [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
      if (!u) [u] = await db.insert(users).values({ name, email }).returning();
      await db.insert(agencyMembers).values({ agencyId, userId: u.id, role }).onConflictDoNothing();
      const link = inviteLink(await createLoginToken(db, { purpose: "invite", email, agencyId, agencyRole: role, invitedByUserId: user.id }));
      await sendEmail({
        to: email,
        replyTo: user.email,
        subject: `${user.name} invited you to ${agency.name} on Listgate`,
        text: `${user.name} invited you to manage ${agency.name}'s listing feed on Listgate: ${link}`,
        html: brandedHtml({
          preheader: `${user.name} invited you to ${agency.name} on Listgate`,
          heading: `Join ${agency.name} on Listgate`,
          paragraphs: [`Hi ${esc(name.split(" ")[0])},`, `${esc(user.name)} has invited you to see ${esc(agency.name)}'s listing feed on Listgate and choose where its listings go.`],
          button: { label: "Accept the invite", url: link },
          footer: "This link is just for you and works for 14 days. Not expecting this? You can ignore it.",
        }),
      });
      await log("member.invited", { email, role });
      return Response.json({ ok: true, message: `Invite sent to ${email}.`, link });
    }
    case "removeMember": {
      await requireOwner(user, agencyId);
      const uid = s(body.userId, 60);
      if (uid === user.id) throw new HttpError(400, "You can't remove yourself.");
      await db.delete(agencyMembers).where(and(eq(agencyMembers.agencyId, agencyId), eq(agencyMembers.userId, uid)));
      await log("member.removed", { userId: uid });
      return Response.json({ ok: true, message: "Removed." });
    }
  }
  throw new HttpError(400, "Unknown action.");
});
