import Link from "next/link";
import { and, asc, desc, eq, gt, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { agencies, getDb, tickets, users } from "@listgate/db";
import { requireAdmin } from "@/lib/auth";
import { adminUsers } from "@/lib/crm";
import { ago } from "@/lib/format";
import { PageHeader } from "@/app/kit";
import { KEY_PREFIX, PRIORITY_META, keyNumber, ticketKey } from "@/lib/tickets";
import { TicketBoard, type TicketCard } from "./board";
import { CreateTicket } from "./create";
import { DueChip, LabelChip, Lozenge, PriorityIcon, TypeIcon, UserAvatar } from "./ui";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "open", label: "All open tickets" },
  { key: "mine", label: "My open tickets" },
  { key: "unassigned", label: "Unassigned" },
  { key: "customer", label: "Raised by customers" },
  { key: "overdue", label: "Overdue" },
  { key: "done", label: "Done" },
  { key: "all", label: "All tickets" },
] as const;
const SORTS = ["key", "summary", "type", "priority", "status", "assignee", "reporter", "created", "updated", "due"] as const;
type Sort = (typeof SORTS)[number];

export default async function Tickets({ searchParams }: { searchParams: Promise<{ as?: string; filter?: string; q?: string; sort?: string; dir?: string; create?: string; created?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const board = sp.as !== "list";
  const db = await getDb();
  const assignee = alias(users, "assignee");
  const [businesses, people] = await Promise.all([db.select({ id: agencies.id, name: agencies.name }).from(agencies).orderBy(agencies.name), adminUsers()]);

  const header = (
    <>
      <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
        <span>Projects</span> <span aria-hidden="true">/</span> <span>Listgate support</span> <span className="ml-1 rounded-[3px] bg-zinc-100 px-1.5 py-px text-[11px] font-semibold text-zinc-600">{KEY_PREFIX}</span>
      </nav>
      <div className="mt-1">
        <PageHeader
          title={board ? "Board" : "Tickets"}
          sub="Raised by agencies from Help in the app, or logged by us. Replies to customers are emailed; internal notes never are."
          actions={
            <div className="flex items-center gap-2">
              <div className="flex rounded-[3px] border border-zinc-200 p-0.5 text-sm">
                <Link href="/tickets" className={`rounded-[2px] px-3 py-1 ${board ? "bg-navy text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>Board</Link>
                <Link href="/tickets?as=list" className={`rounded-[2px] px-3 py-1 ${!board ? "bg-navy text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>List</Link>
              </div>
              <CreateTicket people={people} businesses={businesses} meId={me.id} openAtStart={sp.create === "1"} justCreated={sp.created ? ticketKey(Number(sp.created)) : undefined} />
            </div>
          }
        />
      </div>
    </>
  );

  if (board) {
    // Everything open, plus tickets done in the last 14 days.
    const rows = await db
      .select({ t: tickets, business: agencies.name, assigneeName: assignee.name })
      .from(tickets)
      .leftJoin(agencies, eq(agencies.id, tickets.agencyId))
      .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
      .where(or(ne(tickets.status, "resolved"), gt(tickets.resolvedAt, new Date(Date.now() - 14 * 86_400_000))))
      .orderBy(asc(tickets.rank), desc(tickets.lastActivityAt))
      .limit(500);
    const cards: TicketCard[] = rows.map(({ t, business, assigneeName }) => ({
      id: t.id,
      number: t.number,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      kind: t.kind,
      labels: t.labels,
      due: t.dueOn,
      assigneeId: t.assigneeId,
      assigneeName,
      business,
      raisedBy: t.raisedByName,
      raisedByEmail: t.raisedByEmail,
      updated: t.lastActivityAt.getTime(),
      fromCustomer: !t.raisedByUserId || !people.some((p) => p.id === t.raisedByUserId),
    }));
    return (
      <>
        {header}
        <div className="mt-5">
          <TicketBoard cards={cards} people={people} meId={me.id} meName={me.name} />
        </div>
        <p className="mt-2 text-xs text-zinc-400">Shortcuts: <kbd className="rounded border border-zinc-300 px-1">c</kbd> create · <kbd className="rounded border border-zinc-300 px-1">/</kbd> search</p>
      </>
    );
  }

  // ---- List (Jira's issue navigator) ----
  const filter = (FILTERS.find((f) => f.key === sp.filter) ?? FILTERS[0]).key;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const sort: Sort = (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as Sort) : "updated";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const today = new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10);
  const conds: (SQL | undefined)[] = [];
  if (filter === "open") conds.push(ne(tickets.status, "resolved"));
  if (filter === "mine") conds.push(ne(tickets.status, "resolved"), eq(tickets.assigneeId, me.id));
  if (filter === "unassigned") conds.push(ne(tickets.status, "resolved"), isNull(tickets.assigneeId));
  if (filter === "customer") conds.push(or(isNull(tickets.raisedByUserId), sql`${tickets.raisedByUserId} not in (select ${users.id} from ${users} where ${users.isPlatformAdmin})`));
  if (filter === "overdue") conds.push(ne(tickets.status, "resolved"), sql`${tickets.dueOn} < ${today}`);
  if (filter === "done") conds.push(eq(tickets.status, "resolved"));
  if (q) {
    const n = keyNumber(q);
    conds.push(n ? eq(tickets.number, n) : or(ilike(tickets.subject, `%${q}%`), ilike(tickets.raisedByName, `%${q}%`), ilike(agencies.name, `%${q}%`), sql`${q.toLowerCase()} = any(${tickets.labels})`));
  }
  const col = {
    key: tickets.number,
    summary: tickets.subject,
    type: tickets.kind,
    priority: sql`case ${tickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
    status: sql`case ${tickets.status} when 'open' then 0 when 'in_progress' then 1 when 'waiting' then 2 else 3 end`,
    assignee: assignee.name,
    reporter: tickets.raisedByName,
    created: tickets.createdAt,
    updated: tickets.lastActivityAt,
    due: tickets.dueOn,
  }[sort];
  const rows = await db
    .select({ t: tickets, business: agencies.name, assigneeName: assignee.name })
    .from(tickets)
    .leftJoin(agencies, eq(agencies.id, tickets.agencyId))
    .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
    .where(and(...conds))
    .orderBy(dir === "asc" ? sql`${col} asc nulls last` : sql`${col} desc nulls last`, desc(tickets.number))
    .limit(500);

  const href = (o: Partial<{ filter: string; q: string; sort: string; dir: string }>) => {
    const p = new URLSearchParams({ as: "list" });
    const v = { filter, q, sort, dir, ...o };
    if (v.filter !== "open") p.set("filter", v.filter);
    if (v.q) p.set("q", v.q);
    if (v.sort !== "updated") p.set("sort", v.sort);
    if (v.dir !== "desc") p.set("dir", v.dir);
    return `/tickets?${p}`;
  };
  const Th = ({ s, children, className = "" }: { s: Sort; children: React.ReactNode; className?: string }) => (
    <th className={className} aria-sort={sort === s ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={href({ sort: s, dir: sort === s && dir === "desc" ? "asc" : "desc" })} className={`hover:text-ink ${sort === s ? "text-ink underline decoration-teal decoration-2 underline-offset-4" : ""}`}>
        {children}
        {sort === s && <span className="sr-only">{dir === "asc" ? " (sorted ascending)" : " (sorted descending)"}</span>}
      </Link>
    </th>
  );

  return (
    <>
      {header}
      <div className="mt-5 grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Filters" className="space-y-0.5">
          <p className="card-title mb-2 px-2">Filters</p>
          {FILTERS.map((f) => (
            <Link key={f.key} href={href({ filter: f.key })} aria-current={filter === f.key ? "page" : undefined} className={`block rounded-[3px] px-2 py-1.5 text-sm ${filter === f.key ? "bg-cyan/15 font-semibold text-navy" : "text-zinc-600 hover:bg-zinc-100"}`}>
              {f.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          <form className="mb-3 flex flex-wrap items-center gap-2" action="/tickets">
            <input type="hidden" name="as" value="list" />
            {filter !== "open" && <input type="hidden" name="filter" value={filter} />}
            <input name="q" defaultValue={q} placeholder={`Search summary, business, label or ${KEY_PREFIX}-1001`} aria-label="Search tickets" className="input h-9 w-full max-w-md rounded-[3px] py-1" />
            <button className="btn-secondary rounded-[3px]">Search</button>
            <span className="ml-auto text-sm text-zinc-500">{rows.length} ticket{rows.length === 1 ? "" : "s"}</span>
          </form>
          <div className="overflow-x-auto rounded-[3px] border border-zinc-200 bg-white">
            {rows.length ? (
              <table className="w-full min-w-[1000px] text-sm [&_td]:border-t [&_td]:border-zinc-100 [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-zinc-500">
                <thead className="bg-zinc-50">
                  <tr>
                    <Th s="type" className="w-10">T</Th>
                    <Th s="key" className="w-24">Key</Th>
                    <Th s="summary">Summary</Th>
                    <Th s="assignee">Assignee</Th>
                    <Th s="reporter">Reporter</Th>
                    <Th s="priority" className="w-10">P</Th>
                    <Th s="status">Status</Th>
                    <Th s="created">Created</Th>
                    <Th s="updated">Updated</Th>
                    <Th s="due">Due</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ t, business, assigneeName }) => (
                    <tr key={t.id} className="hover:bg-zinc-50">
                      <td><TypeIcon kind={t.kind} /></td>
                      <td><Link href={`/tickets/${t.id}`} className={`font-medium text-teal hover:underline ${t.status === "resolved" ? "line-through" : ""}`}>{ticketKey(t.number)}</Link></td>
                      <td>
                        <Link href={`/tickets/${t.id}`} className="text-ink hover:underline">{t.subject}</Link>
                        <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                          {business && <span className="rounded-[3px] bg-cyan/15 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-navy">{business}</span>}
                          {t.labels.map((l) => <LabelChip key={l}>{l}</LabelChip>)}
                        </span>
                      </td>
                      <td><span className="flex items-center gap-2 whitespace-nowrap"><UserAvatar name={assigneeName} size={22} />{assigneeName ?? <span className="text-zinc-400">Unassigned</span>}</span></td>
                      <td className="whitespace-nowrap text-zinc-600">{t.raisedByName}</td>
                      <td title={PRIORITY_META[t.priority].label}><PriorityIcon priority={t.priority} /></td>
                      <td><Lozenge status={t.status} /></td>
                      <td className="whitespace-nowrap text-zinc-500">{ago(t.createdAt)}</td>
                      <td className="whitespace-nowrap text-zinc-500">{ago(t.lastActivityAt)}</td>
                      <td>{t.dueOn ? <DueChip due={t.dueOn} done={t.status === "resolved"} /> : <span className="text-zinc-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-zinc-500">{q ? `No tickets match “${q}”.` : filter === "open" ? "No open tickets. Nice." : "Nothing here."}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
