"use server";
// Admin: Jira-style ticket actions. Customer replies and resolving email the person who raised it; internal notes never do.
// Every field change is written to the audit log, which is the ticket's History.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { agencies, auditLog, getDb, ticketMessages, tickets, users, TICKET_KINDS, TICKET_STATUSES, type TicketKind, type TicketPriority, type TicketStatus } from "@listgate/db";
import { requireAdmin } from "@/lib/auth";
import { sendTicketUpdate } from "@/lib/email";
import { APP_URL } from "@/lib/format";
import { parseLabels } from "@/lib/tickets";

const str = (f: FormData, k: string, max = 8000) => String(f.get(k) ?? "").trim().slice(0, max);
const uuidOrNull = (v: string | null | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];
const isStatus = (s: string): s is TicketStatus => TICKET_STATUSES.some((x) => x.value === s);
const isKind = (s: string): s is TicketKind => TICKET_KINDS.some((x) => x.value === s);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const ticketLink = (t: { agencyId: string | null }) => (t.agencyId ? `${APP_URL}/app?a=${t.agencyId}` : `${APP_URL}/app`);
const done = () => revalidatePath("/tickets", "layout");

async function load(id: string) {
  const db = await getDb();
  const [t] = await db.select().from(tickets).where(eq(tickets.id, id));
  return t;
}

/** Top of a column: a rank lower than everything in it. */
async function topRank(status: TicketStatus) {
  const db = await getDb();
  const [r] = await db.select({ min: sql<number | null>`min(${tickets.rank})` }).from(tickets).where(eq(tickets.status, status));
  return (r?.min ?? 0) - 1;
}

async function history(me: { id: string; name: string }, t: { id: string; number: number; agencyId: string | null }, field: string, from: unknown, to: unknown) {
  const db = await getDb();
  await db.insert(auditLog).values({ actorUserId: me.id, actorLabel: me.name, action: "ticket.changed", entityType: "ticket", entityId: t.id, agencyId: t.agencyId, data: { number: t.number, field, from: from ?? null, to: to ?? null } });
}


/** A comment: either a reply to the customer (emailed) or an internal note. Optionally moves the status too. */
export async function replyTicket(f: FormData) {
  const me = await requireAdmin();
  const id = uuidOrNull(str(f, "id"));
  const body = str(f, "body");
  const internal = f.get("internal") === "on" || str(f, "mode") === "note";
  if (!id || !body) return;
  const t = await load(id);
  if (!t) return;
  const wanted = str(f, "status");
  const status: TicketStatus = isStatus(wanted) ? wanted : internal ? t.status : t.status === "resolved" ? "resolved" : "waiting";
  const db = await getDb();
  await db.insert(ticketMessages).values({ ticketId: t.id, authorUserId: me.id, authorName: me.name, fromStaff: true, internal, body });
  await db
    .update(tickets)
    .set({ status, resolvedAt: status === "resolved" ? (t.resolvedAt ?? new Date()) : null, lastActivityAt: new Date(), assigneeId: t.assigneeId ?? me.id })
    .where(eq(tickets.id, t.id));
  if (status !== t.status) await history(me, t, "status", t.status, status);
  if (!t.assigneeId) await history(me, t, "assignee", null, me.name);
  if (!internal)
    await sendTicketUpdate({ to: t.raisedByEmail, firstName: t.raisedByName.split(" ")[0], number: t.number, subject: t.subject, reply: body, resolved: status === "resolved", link: ticketLink(t), staffName: me.name });
  done();
}

/** One field at a time, like editing a field in Jira's details panel. */
export async function setTicketField(id: string, field: string, value: string) {
  const me = await requireAdmin();
  if (!uuidOrNull(id)) return;
  const t = await load(id);
  if (!t) return;
  const db = await getDb();
  const v = String(value ?? "").trim();
  const set: Partial<typeof tickets.$inferInsert> = {};
  let from: unknown;
  let to: unknown;
  switch (field) {
    case "status": {
      if (!isStatus(v) || v === t.status) return;
      if (v === "resolved") return; // Done goes through resolveTicket, which shows the email first.
      Object.assign(set, { status: v, resolvedAt: null, lastActivityAt: new Date(), rank: await topRank(v) });
      [from, to] = [t.status, v];
      break;
    }
    case "priority": {
      if (!(PRIORITIES as string[]).includes(v) || v === t.priority) return;
      set.priority = v as TicketPriority;
      [from, to] = [t.priority, v];
      break;
    }
    case "kind": {
      if (!isKind(v) || v === t.kind) return;
      set.kind = v;
      [from, to] = [t.kind, v];
      break;
    }
    case "assignee": {
      const next = uuidOrNull(v);
      if (next === t.assigneeId) return;
      const ids = [t.assigneeId, next].filter(Boolean) as string[];
      const names = ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
      set.assigneeId = next;
      [from, to] = [names.find((n) => n.id === t.assigneeId)?.name ?? null, names.find((n) => n.id === next)?.name ?? null];
      break;
    }
    case "agency": {
      const next = uuidOrNull(v);
      if (next === t.agencyId) return;
      const ids = [t.agencyId, next].filter(Boolean) as string[];
      const names = ids.length ? await db.select({ id: agencies.id, name: agencies.name }).from(agencies).where(inArray(agencies.id, ids)) : [];
      set.agencyId = next;
      [from, to] = [names.find((n) => n.id === t.agencyId)?.name ?? null, names.find((n) => n.id === next)?.name ?? null];
      break;
    }
    case "subject": {
      const s = v.slice(0, 160);
      if (!s || s === t.subject) return;
      set.subject = s;
      [from, to] = [t.subject, s];
      break;
    }
    case "description": {
      const s = String(value ?? "").slice(0, 20000);
      if (s === (t.description ?? "")) return;
      set.description = s || null;
      [from, to] = [null, null];
      break;
    }
    case "labels": {
      const next = parseLabels(v);
      if (next.join(",") === t.labels.join(",")) return;
      set.labels = next;
      [from, to] = [t.labels.join(", ") || null, next.join(", ") || null];
      break;
    }
    case "due": {
      const next = isDate(v) ? v : null;
      if (next === t.dueOn) return;
      set.dueOn = next;
      [from, to] = [t.dueOn, next];
      break;
    }
    default:
      return;
  }
  await db.update(tickets).set(set).where(eq(tickets.id, t.id));
  await history(me, t, field, from, to);
  done();
}

/** Drag on the board: change column and/or position. `before` is the ticket it was dropped above (null = bottom). */
export async function moveTicket(id: string, status: string, before?: string | null) {
  const me = await requireAdmin();
  if (!uuidOrNull(id) || !isStatus(status)) return;
  const t = await load(id);
  if (!t) return;
  const db = await getDb();
  const col = await db.select({ id: tickets.id, rank: tickets.rank }).from(tickets).where(and(eq(tickets.status, status), sql`${tickets.id} <> ${t.id}`)).orderBy(asc(tickets.rank), sql`${tickets.lastActivityAt} desc`);
  const i = before ? col.findIndex((c) => c.id === before) : -1;
  let rank: number;
  if (i === -1) rank = col.length ? col[col.length - 1].rank + 1 : 0;
  else if (i === 0) rank = col[0].rank - 1;
  else rank = (col[i - 1].rank + col[i].rank) / 2;
  // Ranks can collide on old tickets (all 0): spread the column out first.
  if (i > 0 && col[i - 1].rank === col[i].rank) {
    for (const [n, c] of col.entries()) await db.update(tickets).set({ rank: n * 1000 }).where(eq(tickets.id, c.id));
    rank = (i - 1) * 1000 + 500;
  }
  const moved = t.status !== status;
  await db
    .update(tickets)
    .set({ status, rank, ...(moved ? { resolvedAt: status === "resolved" ? new Date() : null, lastActivityAt: new Date(), assigneeId: t.assigneeId ?? me.id } : {}) })
    .where(eq(tickets.id, t.id));
  if (moved) {
    await history(me, t, "status", t.status, status);
  }
  done();
}

/** Move to Done, optionally emailing the customer the (edited) message. The email is kept as a reply on the ticket. */
export async function resolveTicket(id: string, o: { send: boolean; subject?: string; message?: string; before?: string | null }) {
  const me = await requireAdmin();
  if (!uuidOrNull(id)) return;
  const t = await load(id);
  if (!t) return;
  if (o.before !== undefined) await moveTicket(id, "resolved", o.before);
  const db = await getDb();
  const now = await load(id);
  if (now && now.status !== "resolved") {
    await db.update(tickets).set({ status: "resolved", resolvedAt: new Date(), lastActivityAt: new Date(), rank: await topRank("resolved"), assigneeId: t.assigneeId ?? me.id }).where(eq(tickets.id, t.id));
    await history(me, t, "status", t.status, "resolved");
  }
  const message = String(o.message ?? "").trim().slice(0, 20000);
  if (o.send && message) {
    await db.insert(ticketMessages).values({ ticketId: t.id, authorUserId: me.id, authorName: me.name, fromStaff: true, internal: false, body: message });
    await sendTicketUpdate({ to: t.raisedByEmail, firstName: t.raisedByName.split(" ")[0], number: t.number, subject: t.subject, resolved: true, link: ticketLink(t), staffName: me.name, subjectLine: String(o.subject ?? "").slice(0, 200), message });
  }
  done();
}

/** "+ Create" at the bottom of a board column: a summary is enough. */
export async function quickCreate(status: string, subject: string) {
  const me = await requireAdmin();
  const s = String(subject ?? "").trim().slice(0, 160);
  if (!s || !isStatus(status)) return;
  const db = await getDb();
  const [t] = await db
    .insert(tickets)
    .values({ raisedByUserId: me.id, raisedByName: me.name, raisedByEmail: me.email, kind: "change", subject: s, priority: "normal", status, assigneeId: me.id, rank: (await topRank(status)) + 0.5, resolvedAt: status === "resolved" ? new Date() : null })
    .returning();
  await db.insert(auditLog).values({ actorUserId: me.id, actorLabel: me.name, action: "ticket.logged", entityType: "ticket", entityId: t.id, agencyId: null, data: { number: t.number, subject: s } });
  done();
}

/** The Create dialog: logged by us from a call or email, or our own bug or idea. */
export async function createTicket(f: FormData) {
  const me = await requireAdmin();
  const subject = str(f, "subject", 160);
  const body = str(f, "body", 20000);
  if (!subject) return;
  const agencyId = uuidOrNull(str(f, "agencyId"));
  const kind: TicketKind = isKind(str(f, "kind")) ? (str(f, "kind") as TicketKind) : "problem";
  const priority = (PRIORITIES as string[]).includes(str(f, "priority")) ? (str(f, "priority") as TicketPriority) : "normal";
  const wanted = str(f, "status");
  const status: TicketStatus = isStatus(wanted) ? wanted : "open";
  const name = str(f, "name", 120) || me.name;
  const email = str(f, "email", 200) || me.email;
  const due = str(f, "due");
  const db = await getDb();
  const [a] = agencyId ? await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.id, agencyId)) : [];
  const [t] = await db
    .insert(tickets)
    .values({
      agencyId: a?.id ?? null,
      raisedByUserId: str(f, "name") ? null : me.id,
      raisedByName: name,
      raisedByEmail: email,
      kind,
      subject,
      description: body || null,
      labels: parseLabels(str(f, "labels", 400)),
      dueOn: isDate(due) ? due : null,
      priority,
      status,
      rank: await topRank(status),
      assigneeId: f.has("assigneeId") ? uuidOrNull(str(f, "assigneeId")) : me.id,
    })
    .returning();
  await db.insert(auditLog).values({ actorUserId: me.id, actorLabel: me.name, action: "ticket.logged", entityType: "ticket", entityId: t.id, agencyId: a?.id ?? null, data: { number: t.number, subject } });
  if (f.get("tell") === "on" && body && email !== me.email) {
    await db.insert(ticketMessages).values({ ticketId: t.id, authorUserId: me.id, authorName: me.name, fromStaff: true, internal: false, body });
    await sendTicketUpdate({ to: email, firstName: name.split(" ")[0], number: t.number, subject, reply: body, resolved: false, link: ticketLink(t), staffName: me.name, logged: true });
  }
  done();
  redirect(f.get("another") === "on" ? `/tickets?create=1&created=${t.number}` : `/tickets/${t.id}`);
}
