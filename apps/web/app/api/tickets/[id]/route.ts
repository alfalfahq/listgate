// A reply from the business on one of its tickets. Reopens it if we'd marked it resolved or waiting.
import { eq } from "drizzle-orm";
import { getDb, ticketMessages, tickets } from "@listgate/db";
import { audit } from "@/lib/audit";
import { handle, HttpError, isUuid, requireAgency } from "@/lib/auth";
import { getAgency } from "@/lib/agency";
import { notifySupport, ticketsFor } from "@/lib/tickets";

export const runtime = "nodejs";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const id = (await ctx.params).id;
  if (!isUuid(id)) throw new HttpError(404, "Ticket not found.");
  const db = await getDb();
  const [t] = await db.select().from(tickets).where(eq(tickets.id, id));
  if (!t || !t.agencyId) throw new HttpError(404, "Ticket not found.");
  const user = await requireAgency(t.agencyId, { write: true });
  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 8000) : "";
  if (!text) throw new HttpError(400, "Type your reply.");
  await db.insert(ticketMessages).values({ ticketId: t.id, authorUserId: user.id, authorName: user.name, body: text });
  await db.update(tickets).set({ status: t.status === "in_progress" ? "in_progress" : "open", resolvedAt: null, lastActivityAt: new Date() }).where(eq(tickets.id, t.id));
  await audit({ actor: { id: user.id, name: user.name }, action: "ticket.replied", entityType: "ticket", entityId: t.id, agencyId: t.agencyId, data: { number: t.number } });
  const agency = (await getAgency(t.agencyId))!;
  await notifySupport({ number: t.number, id: t.id, subject: t.subject, business: agency.name, from: user.name, email: user.email, body: text, isNew: false });
  return Response.json({ ok: true, message: "Reply sent.", tickets: await ticketsFor(t.agencyId) });
});
