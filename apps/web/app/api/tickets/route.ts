// Support tickets from the agency app. GET ?agency=… lists the agency's tickets; POST raises one.
import { getDb, ticketMessages, tickets, TICKET_KINDS, type TicketKind } from "@listgate/db";
import { audit } from "@/lib/audit";
import { handle, HttpError, requireAgency } from "@/lib/auth";
import { getAgency } from "@/lib/agency";
import { notifySupport, ticketsFor } from "@/lib/tickets";

export const runtime = "nodejs";
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const GET = handle(async (req: Request) => {
  const agencyId = new URL(req.url).searchParams.get("agency") || "";
  await requireAgency(agencyId);
  return Response.json({ tickets: await ticketsFor(agencyId) });
});

export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const agencyId = s(body.agencyId, 60);
  const user = await requireAgency(agencyId, { write: true });
  const subject = s(body.subject, 160);
  const text = s(body.body, 8000);
  if (!subject || !text) throw new HttpError(400, "Add a short summary and the details.");
  const kind = (TICKET_KINDS.some((k) => k.value === body.kind) ? body.kind : "problem") as TicketKind;
  const page = s(body.page, 300) || null;
  const agency = (await getAgency(agencyId))!;
  const db = await getDb();
  const [t] = await db
    .insert(tickets)
    .values({ agencyId: agency.id, raisedByUserId: user.id, raisedByName: user.name, raisedByEmail: user.email, kind, subject, page, priority: kind === "billing" ? "high" : "normal" })
    .returning();
  await db.insert(ticketMessages).values({ ticketId: t.id, authorUserId: user.id, authorName: user.name, body: text });
  await audit({ actor: { id: user.id, name: user.name }, action: "ticket.raised", entityType: "ticket", entityId: t.id, agencyId: agency.id, data: { number: t.number, subject, kind } });
  await notifySupport({ number: t.number, id: t.id, subject, business: agency.name, from: user.name, email: user.email, body: text, isNew: true, page });
  return Response.json({ ok: true, message: `Ticket #${t.number} sent. We'll email you when we reply.`, tickets: await ticketsFor(agency.id) });
});
