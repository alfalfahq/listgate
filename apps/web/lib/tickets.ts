// Support tickets from the business side: raise, list, reply. Listgate answers them in admin.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, ticketMessages, tickets, users, type TicketStatus } from "@listgate/db";
import { config } from "./config";
import { brandedHtml, esc, sendEmail } from "./email";

/** Where new tickets and client replies are emailed: the Listgate team. */
export function supportInbox(): string[] {
  const list = (process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAILS || process.env.CONTACT_EMAIL || "colin@alfalfa.com.au")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

export type TicketView = {
  id: string;
  number: number;
  kind: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  lastActivityAt: string;
  raisedByName: string;
  messages: { id: string; fromStaff: boolean; authorName: string; body: string; createdAt: string }[];
};

/** A business's tickets, newest activity first, with the public messages (never staff-only notes). */
export async function ticketsFor(agencyId: string, limit = 30): Promise<TicketView[]> {
  const db = await getDb();
  const rows = await db.select().from(tickets).where(eq(tickets.agencyId, agencyId)).orderBy(desc(tickets.lastActivityAt)).limit(limit);
  if (!rows.length) return [];
  const msgs = await db
    .select()
    .from(ticketMessages)
    .where(and(inArray(ticketMessages.ticketId, rows.map((r) => r.id)), eq(ticketMessages.internal, false)))
    .orderBy(asc(ticketMessages.createdAt));
  return rows.map((t) => ({
    id: t.id,
    number: t.number,
    kind: t.kind,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    lastActivityAt: t.lastActivityAt.toISOString(),
    raisedByName: t.raisedByName,
    messages: msgs.filter((m) => m.ticketId === t.id).map((m) => ({ id: m.id, fromStaff: m.fromStaff, authorName: m.authorName, body: m.body, createdAt: m.createdAt.toISOString() })),
  }));
}

/** Tells the Listgate team about a new ticket or a reply from the business. */
export async function notifySupport(o: { number: number; id: string; subject: string; business: string; from: string; email: string; body: string; isNew: boolean; page?: string | null }) {
  const link = `${config.adminUrl}/tickets/${o.id}`;
  const subject = `${o.isNew ? "New ticket" : "Reply on ticket"} #${o.number}: ${o.subject}`;
  await sendEmail({
    to: supportInbox(),
    replyTo: o.email,
    subject,
    text: `${o.from} (${o.email}) from ${o.business}${o.isNew ? " raised a ticket" : " replied"}:\n\n${o.body}\n\n${o.page ? `Page: ${o.page}\n` : ""}Open it: ${link}`,
    html: brandedHtml({
      preheader: `${o.from}: ${o.body.slice(0, 90)}`,
      heading: `${o.isNew ? "New ticket" : "New reply"} #${o.number}`,
      paragraphs: [
        `<strong>${esc(o.subject)}</strong>`,
        `${esc(o.from)} (${esc(o.email)}) from ${esc(o.business)}${o.page ? ` · page ${esc(o.page)}` : ""}`,
        esc(o.body).replace(/\n/g, "<br>"),
      ],
      button: { label: "Open the ticket", url: link },
      footer: "Listgate support",
    }),
  });
}

export async function userName(userId: string) {
  const db = await getDb();
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
  return u;
}
