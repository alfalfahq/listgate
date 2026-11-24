import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { agencies, auditLog, getDb, ticketMessages, tickets, type TicketKind, type TicketPriority, type TicketStatus } from "@listgate/db";
import { requireAdmin } from "@/lib/auth";
import { adminUsers } from "@/lib/crm";
import { APP_URL, ago } from "@/lib/format";
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, TYPE_META, TYPE_ORDER, ticketKey } from "@/lib/tickets";
import { PriorityIcon, TypeIcon, UserAvatar } from "../ui";
import { ActivityTabs, AssignToMe, Composer, FieldInput, FieldSelect, InlineDescription, InlineSummary, StatusSelect } from "./fields";

export const dynamic = "force-dynamic";

const FIELD_LABEL: Record<string, string> = { status: "Status", priority: "Priority", kind: "Issue type", assignee: "Assignee", agency: "Business", subject: "Summary", description: "Description", labels: "Labels", due: "Due date" };
const show = (field: string, v: unknown) => {
  if (v === null || v === undefined || v === "") return "None";
  const s = String(v);
  if (field === "status") return STATUS_META[s as TicketStatus]?.label ?? s;
  if (field === "priority") return PRIORITY_META[s as TicketPriority]?.label ?? s;
  if (field === "kind") return TYPE_META[s as TicketKind]?.label ?? s;
  if (field === "due") return new Date(`${s}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return s;
};

export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [t] = await db.select().from(tickets).where(eq(tickets.id, id));
  if (!t) notFound();
  const [msgs, log, businesses, people] = await Promise.all([
    db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, t.id)).orderBy(asc(ticketMessages.createdAt)),
    db.select().from(auditLog).where(and(eq(auditLog.entityType, "ticket"), eq(auditLog.entityId, t.id))).orderBy(asc(auditLog.createdAt)),
    db.select({ id: agencies.id, name: agencies.name }).from(agencies).orderBy(agencies.name),
    adminUsers(),
  ]);
  const key = ticketKey(t.number);
  const assignee = people.find((p) => p.id === t.assigneeId);
  const business = businesses.find((b) => b.id === t.agencyId);

  // Older tickets have no description field: their first message is the description.
  const firstAsDescription = t.description === null && msgs.length > 0;
  const comments = (firstAsDescription ? msgs.slice(1) : msgs).slice().reverse();

  type Entry = { at: Date; node: React.ReactNode; key: string };
  const commentEntries: Entry[] = comments.map((m) => ({
    at: m.createdAt,
    key: `m${m.id}`,
    node: (
      <li className="flex gap-3">
        <UserAvatar name={m.authorName} size={32} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <strong className="font-semibold text-ink">{m.authorName}</strong>
            {!m.fromStaff && <span className="rounded-[3px] bg-zinc-100 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Customer</span>}
            {m.internal ? <span className="rounded-[3px] bg-amber-100 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-amber-800">Internal note</span> : m.fromStaff ? <span className="rounded-[3px] bg-cyan/15 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-navy">Reply to customer</span> : null}
            <span className="text-zinc-500" title={m.createdAt.toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}>{ago(m.createdAt)}</span>
          </p>
          <div className={`mt-1 whitespace-pre-wrap rounded-[3px] text-sm leading-relaxed text-zinc-800 ${m.internal ? "bg-amber-50 px-3 py-2" : ""}`}>{m.body}</div>
        </div>
      </li>
    ),
  }));
  const historyEntries: Entry[] = log
    .map((l) => {
      const d = (l.data ?? {}) as Record<string, unknown>;
      let what: React.ReactNode = null;
      if (l.action === "ticket.logged") what = <>created the ticket</>;
      else if (l.action === "ticket.changed" && typeof d.field === "string") {
        const f = d.field;
        what =
          f === "description" ? (
            <>updated the <strong>Description</strong></>
          ) : (
            <>
              changed the <strong>{FIELD_LABEL[f] ?? f}</strong> from <span className="rounded-[3px] bg-zinc-100 px-1">{show(f, d.from)}</span> to <span className="rounded-[3px] bg-zinc-100 px-1">{show(f, d.to)}</span>
            </>
          );
      } else if (l.action === "ticket.updated" && (d.from || d.to)) what = <>changed the <strong>Status</strong> from <span className="rounded-[3px] bg-zinc-100 px-1">{show("status", d.from)}</span> to <span className="rounded-[3px] bg-zinc-100 px-1">{show("status", d.to)}</span></>;
      else if (l.action === "ticket.updated") what = <>updated the ticket ({show("status", d.status)}, {show("priority", d.priority)})</>;
      if (!what) return null;
      return {
        at: l.createdAt,
        key: `h${l.id}`,
        node: (
          <li className="flex gap-3 text-sm text-zinc-600">
            <UserAvatar name={l.actorLabel} size={32} />
            <p className="pt-1.5"><strong className="font-semibold text-ink">{l.actorLabel}</strong> {what} <span className="text-zinc-400">{ago(l.createdAt)}</span></p>
          </li>
        ),
      };
    })
    .filter(Boolean)
    .reverse() as Entry[];
  const list = (entries: Entry[], empty: string) =>
    entries.length ? <ul className="space-y-5">{entries.map((e) => <div key={e.key}>{e.node}</div>)}</ul> : <p className="text-sm text-zinc-500">{empty}</p>;
  const all = [...commentEntries, ...historyEntries].sort((a, b) => b.at.getTime() - a.at.getTime());

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 py-1.5">
      <dt className="pt-1.5 text-sm font-semibold text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );

  return (
    <>
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500" aria-label="Breadcrumb">
        <Link href="/tickets" className="hover:text-ink hover:underline">Listgate support</Link>
        <span aria-hidden="true">/</span>
        <span className="inline-flex items-center gap-1.5"><TypeIcon kind={t.kind} size={14} /><Link href={`/tickets/${t.id}`} className="font-medium text-zinc-600 hover:underline">{key}</Link></span>
      </nav>

      <div className="mt-3 grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <InlineSummary id={t.id} value={t.subject} />

          <section className="mt-6" aria-labelledby="desc-h">
            <h2 id="desc-h" className="mb-1 text-sm font-semibold text-ink">Description</h2>
            <InlineDescription id={t.id} value={t.description} fallback={firstAsDescription ? msgs[0].body : null} />
            {firstAsDescription && <p className="mt-1 text-xs text-zinc-400">From {msgs[0].authorName}&apos;s first message, {ago(msgs[0].createdAt)}.</p>}
          </section>

          {t.page && (
            <section className="mt-5 flex flex-wrap gap-2 text-sm">
              {t.page && <span className="rounded-[3px] bg-zinc-100 px-2 py-1 text-zinc-600">Page they were on: {t.page}</span>}
            </section>
          )}

          <section className="mt-8" aria-labelledby="act-h">
            <h2 id="act-h" className="mb-3 text-sm font-semibold text-ink">Activity</h2>
            <div className="mb-6">
              <Composer id={t.id} reporter={t.raisedByName} email={t.raisedByEmail} status={t.status} />
            </div>
            <ActivityTabs all={list(all, "Nothing yet.")} comments={list(commentEntries, "No comments yet.")} history={list(historyEntries, "No changes yet.")} />
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div>
            <StatusSelect id={t.id} status={t.status} ticket={{ number: t.number, subject: t.subject, reporter: t.raisedByName, email: t.raisedByEmail }} staffName={me.name} fromCustomer={!t.raisedByUserId || !people.some((p) => p.id === t.raisedByUserId)} />
            {t.status === "resolved" && t.resolvedAt && <p className="mt-1 text-xs text-zinc-500">Done {ago(t.resolvedAt)}</p>}
          </div>
          <div className="rounded-[3px] border border-zinc-200 bg-white">
            <p className="border-b border-zinc-200 px-4 py-2.5 text-sm font-semibold text-ink">Details</p>
            <dl className="px-4 py-2">
              <Row label="Assignee">
                <FieldSelect id={t.id} field="assignee" label="Assignee" value={t.assigneeId ?? ""} icon={<UserAvatar name={assignee?.name ?? null} size={24} />} options={[{ value: "", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
                {t.assigneeId !== me.id && <AssignToMe id={t.id} meId={me.id} />}
              </Row>
              <Row label="Reporter">
                <span className="flex items-center gap-2 pt-1"><UserAvatar name={t.raisedByName} size={24} /><span className="min-w-0"><span className="block truncate">{t.raisedByName}</span><a href={`mailto:${t.raisedByEmail}`} className="block truncate text-xs text-zinc-500 hover:underline">{t.raisedByEmail}</a></span></span>
              </Row>
              <Row label="Business">
                <FieldSelect id={t.id} field="agency" label="Business" value={t.agencyId ?? ""} options={[{ value: "", label: "None" }, ...businesses.map((b) => ({ value: b.id, label: b.name }))]} />
                {business && <Link href={`/agencies/${business.id}`} className="mt-0.5 block text-xs font-medium text-teal hover:underline">Open business</Link>}
              </Row>
              <Row label="Issue type">
                <FieldSelect id={t.id} field="kind" label="Issue type" value={t.kind} icon={<TypeIcon kind={t.kind} />} options={TYPE_ORDER.map((k) => ({ value: k, label: TYPE_META[k].label }))} />
              </Row>
              <Row label="Priority">
                <FieldSelect id={t.id} field="priority" label="Priority" value={t.priority} icon={<PriorityIcon priority={t.priority} />} options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
              </Row>
              <Row label="Labels">
                <FieldInput id={t.id} field="labels" label="Labels" value={t.labels.join(", ")} placeholder="None" />
              </Row>
              <Row label="Due date">
                <FieldInput id={t.id} field="due" label="Due date" type="date" value={t.dueOn ?? ""} />
              </Row>
            </dl>
          </div>
          <p className="px-1 text-xs leading-relaxed text-zinc-500">
            Created {t.createdAt.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" })}
            <br />
            Updated {ago(t.lastActivityAt)}
          </p>
        </aside>
      </div>
    </>
  );
}
