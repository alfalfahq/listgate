"use client";
// Jira-style board: quick filters, drag a card to another column or up and down within one, "+ Create" in each column.
// Moving a customer's ticket to Done opens the email to them, ready to edit, at the top of the Done column.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { TicketKind, TicketPriority, TicketStatus } from "@listgate/db";
import { moveTicket, quickCreate, setTicketField } from "@/app/ticket-actions";
import { STATUS_META, STATUS_ORDER, TYPE_META, TYPE_ORDER, ticketKey } from "@/lib/tickets";
import { DueChip, LabelChip, PriorityIcon, TypeIcon, UserAvatar } from "./ui";
import { ResolveEmail } from "./resolve-email";
import { safely } from "./stale";

export type TicketCard = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  kind: TicketKind;
  labels: string[];
  due: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  business: string | null;
  raisedBy: string;
  raisedByEmail: string;
  updated: number;
  fromCustomer: boolean;
};

export function TicketBoard({ cards: initial, people, meId, meName }: { cards: TicketCard[]; people: { id: string; name: string }[]; meId: string; meName: string }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  useEffect(() => setCards(initial), [initial]);
  const [drag, setDrag] = useState<string | null>(null);
  // Dragging a type or a person from the toolbar onto a card changes that ticket's type or assignee.
  const [tool, setTool] = useState<{ kind: TicketKind } | { assignee: string | null } | null>(null);
  const [toolOver, setToolOver] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ status: TicketStatus; before: string | null } | null>(null);
  const [q, setQ] = useState("");
  const [who, setWho] = useState<string[]>([]);
  const [mine, setMine] = useState(false);
  const [recent, setRecent] = useState(false);
  const [kinds, setKinds] = useState<TicketKind[]>([]);
  const [, start] = useTransition();
  const [resolving, setResolving] = useState<{ id: string; before: string | null } | null>(null);
  const search = useRef<HTMLInputElement>(null);

  // "/" jumps to search, like Jira.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const dayAgo = Date.now() - 86_400_000;
    return cards.filter(
      (c) =>
        (!needle || `${ticketKey(c.number)} ${c.subject} ${c.business ?? ""} ${c.raisedBy} ${c.labels.join(" ")}`.toLowerCase().includes(needle)) &&
        (!who.length || who.includes(c.assigneeId ?? "none")) &&
        (!mine || c.assigneeId === meId) &&
        (!recent || c.updated > dayAgo) &&
        (!kinds.length || kinds.includes(c.kind))
    );
  }, [cards, q, who, mine, recent, kinds, meId]);
  const filtered = q || who.length || mine || recent || kinds.length;

  const move = (id: string, status: TicketStatus, before: string | null) => {
    const c = cards.find((x) => x.id === id);
    if (!c || before === id) return;
    if (status === "resolved" && c.status !== "resolved" && c.fromCustomer) {
      setResolving({ id, before });
      return;
    }
    place(id, status, before);
    start(() => safely(() => moveTicket(id, status, before)));
  };
  const place = (id: string, status: TicketStatus, before: string | null) => {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    setCards((cs) => {
      const rest = cs.filter((x) => x.id !== id);
      const at = before ? rest.findIndex((x) => x.id === before) : -1;
      const moved = { ...c, status, updated: c.status === status ? c.updated : Date.now() };
      if (at === -1) return [...rest, moved];
      return [...rest.slice(0, at), moved, ...rest.slice(at)];
    });
  };
  const resolvingCard = resolving ? cards.find((c) => c.id === resolving.id) : null;

  const applyTool = (id: string) => {
    const c = cards.find((x) => x.id === id);
    if (!c || !tool) return;
    if ("kind" in tool) {
      if (c.kind === tool.kind) return;
      setCards((cs) => cs.map((x) => (x.id === id ? { ...x, kind: tool.kind } : x)));
      start(() => safely(() => setTicketField(id, "kind", tool.kind)));
    } else {
      if (c.assigneeId === tool.assignee) return;
      const name = people.find((p) => p.id === tool.assignee)?.name ?? null;
      setCards((cs) => cs.map((x) => (x.id === id ? { ...x, assigneeId: tool.assignee, assigneeName: name } : x)));
      start(() => safely(() => setTicketField(id, "assignee", tool.assignee ?? "")));
    }
  };
  const toolProps = (t: { kind: TicketKind } | { assignee: string | null }, label: string) => ({
    draggable: true,
    title: `${label}. Drag onto a ticket to set it`,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("application/x-dw-tool", JSON.stringify(t));
      e.dataTransfer.effectAllowed = "copy";
      setTool(t);
    },
    onDragEnd: () => {
      setTool(null);
      setToolOver(null);
    },
  });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const assignees = people;
  const unassigned = true;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">Search this board</span>
          <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search board" className="h-8 w-48 rounded-[3px] border border-zinc-300 bg-white pl-8 pr-2 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-cyan/25" />
        </label>
        <div className="flex items-center pl-1" role="group" aria-label="Filter by assignee">
          {assignees.map((p) => (
            <button key={p.id} type="button" {...toolProps({ assignee: p.id }, p.name)} onClick={() => setWho(toggle(who, p.id))} aria-pressed={who.includes(p.id)} className={`-ml-1 rounded-full ring-2 transition first:ml-0 hover:z-10 hover:-translate-y-0.5 ${who.includes(p.id) ? "z-10 ring-teal" : "ring-white"}`}>
              <UserAvatar name={p.name} size={30} />
            </button>
          ))}
          {unassigned && (
            <button type="button" {...toolProps({ assignee: null }, "Unassigned")} onClick={() => setWho(toggle(who, "none"))} aria-pressed={who.includes("none")} className={`-ml-1 rounded-full ring-2 transition hover:z-10 hover:-translate-y-0.5 ${who.includes("none") ? "z-10 ring-teal" : "ring-white"}`}>
              <UserAvatar name={null} size={30} />
            </button>
          )}
        </div>
        <QuickFilter on={mine} set={setMine}>Only my tickets</QuickFilter>
        <QuickFilter on={recent} set={setRecent}>Recently updated</QuickFilter>
        {TYPE_ORDER.map((k) => (
          <QuickFilter key={k} on={kinds.includes(k)} set={() => setKinds(toggle(kinds, k))} drag={toolProps({ kind: k }, TYPE_META[k].label)}>
            <TypeIcon kind={k} size={14} />
            {TYPE_META[k].label}
          </QuickFilter>
        ))}
        {tool && <span className="text-sm font-medium text-teal">Drop it on a ticket</span>}
        {filtered ? (
          <button type="button" onClick={() => { setQ(""); setWho([]); setMine(false); setRecent(false); setKinds([]); }} className="ml-1 text-sm font-medium text-teal hover:underline">
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        <div className="grid min-w-[1040px] grid-cols-4 gap-2">
          {STATUS_ORDER.map((status) => {
            const list = shown.filter((c) => c.status === status);
            const total = cards.filter((c) => c.status === status).length;
            const isOver = drop?.status === status;
            return (
              <section
                key={status}
                aria-label={`${STATUS_META[status].label}, ${list.length}`}
                onDragOver={(e) => {
                  if (tool) return;
                  e.preventDefault();
                  if (!drop || drop.status !== status) setDrop({ status, before: null });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (tool) return;
                  const id = e.dataTransfer.getData("text/plain") || drag;
                  if (id) move(id, status, drop?.status === status ? drop.before : null);
                  setDrag(null);
                  setDrop(null);
                }}
                className={`flex min-h-[65vh] flex-col rounded-md p-1.5 transition-colors ${isOver ? "bg-cyan/10" : "bg-[#f4f5f7]"}`}
              >
                <header className="flex items-center gap-1.5 px-2 pb-2 pt-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
                  {STATUS_META[status].label}
                  <span className="font-medium normal-case tracking-normal">{list.length === total ? total : `${list.length} of ${total}`}</span>
                  {status === "resolved" && <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-zinc-400">last 14 days</span>}
                </header>
                {status === "resolved" && resolving && resolvingCard && (
                  <div className="mb-2">
                    <ResolveEmail
                      ticket={{ id: resolvingCard.id, number: resolvingCard.number, subject: resolvingCard.subject, reporter: resolvingCard.raisedBy, email: resolvingCard.raisedByEmail }}
                      staffName={meName}
                      before={resolving.before}
                      onDone={() => {
                        place(resolving.id, "resolved", resolving.before);
                        setResolving(null);
                        router.refresh();
                      }}
                      onCancel={() => setResolving(null)}
                    />
                  </div>
                )}
                <ul className="flex flex-col gap-1">
                  {list.map((c, i) => {
                    const next = list[i + 1]?.id ?? null;
                    const lineAbove = isOver && drop?.before === c.id && drag !== c.id;
                    return (
                      <li
                        key={c.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", c.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDrag(c.id);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setDrop(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (tool) {
                            e.dataTransfer.dropEffect = "copy";
                            if (toolOver !== c.id) setToolOver(c.id);
                            return;
                          }
                          const r = e.currentTarget.getBoundingClientRect();
                          const before = e.clientY < r.top + r.height / 2 ? c.id : next;
                          if (drop?.status !== status || drop.before !== before) setDrop({ status, before });
                        }}
                        onDragLeave={(e) => {
                          if (tool && !e.currentTarget.contains(e.relatedTarget as Node)) setToolOver(null);
                        }}
                        onDrop={(e) => {
                          if (!tool) return;
                          e.preventDefault();
                          e.stopPropagation();
                          applyTool(c.id);
                          setTool(null);
                          setToolOver(null);
                        }}
                        className={`relative rounded-[3px] transition ${drag === c.id ? "opacity-40" : ""} ${toolOver === c.id ? "scale-[1.02] ring-2 ring-teal ring-offset-1" : ""}`}
                      >
                        {lineAbove && <span className="absolute -top-[3px] left-0 right-0 h-0.5 rounded bg-teal" aria-hidden="true" />}
                        <Card c={c} />
                      </li>
                    );
                  })}
                  {isOver && drop?.before === null && drag && <li className="h-0.5 rounded bg-teal" aria-hidden="true" />}
                </ul>
                <QuickCreate
                  status={status}
                  onCreate={(subject) =>
                    start(() =>
                      safely(async () => {
                        await quickCreate(status, subject);
                        router.refresh();
                      })
                    )
                  }
                />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Card({ c }: { c: TicketCard }) {
  const done = c.status === "resolved";
  return (
    <Link
      href={`/tickets/${c.id}`}
      draggable={false}
      className="block cursor-pointer rounded-[3px] bg-white p-2.5 text-sm shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)] hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-teal"
    >
      <p className={`leading-snug text-ink ${done ? "text-zinc-500" : ""}`}>{c.subject}</p>
      {(c.business || c.labels.length > 0 || c.due) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1">
          {c.business && <span className="max-w-full truncate rounded-[3px] bg-cyan/15 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-navy">{c.business}</span>}
          {c.labels.map((l) => <LabelChip key={l}>{l}</LabelChip>)}
          <DueChip due={c.due} done={done} />
        </p>
      )}
      <p className="mt-2 flex items-center gap-1.5">
        <TypeIcon kind={c.kind} />
        <span className={`text-xs font-semibold text-zinc-500 ${done ? "line-through" : ""}`}>{ticketKey(c.number)}</span>
        {done && (
          <svg width="14" height="14" viewBox="0 0 16 16" aria-label="Done" className="text-emerald-600"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {c.fromCustomer && <span title={`Raised by ${c.raisedBy}`} className="text-[11px] text-zinc-400">customer</span>}
          <PriorityIcon priority={c.priority} />
          <UserAvatar name={c.assigneeName} size={22} title={c.assigneeName ? `Assignee: ${c.assigneeName}` : "Unassigned"} />
        </span>
      </p>
    </Link>
  );
}

function QuickFilter({ on, set, children, drag }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode; drag?: React.HTMLAttributes<HTMLButtonElement> & { draggable?: boolean } }) {
  return (
    <button
      type="button"
      {...drag}
      onClick={() => set(!on)}
      aria-pressed={on}
      className={`inline-flex h-8 items-center gap-1.5 rounded-[3px] px-2.5 text-sm font-medium transition ${drag ? "cursor-grab active:cursor-grabbing" : ""} ${on ? "bg-navy text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
    >
      {children}
    </button>
  );
}

function QuickCreate({ status, onCreate }: { status: TicketStatus; onCreate: (subject: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 flex w-full items-center gap-1.5 rounded-[3px] px-2 py-1.5 text-left text-sm font-medium text-zinc-500 hover:bg-zinc-200/70 hover:text-ink">
        <span aria-hidden="true" className="text-base leading-none">+</span> Create
      </button>
    );
  return (
    <form
      className="mt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onCreate(v.trim());
        setV("");
      }}
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => !v && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && (setV(""), setOpen(false))}
        maxLength={160}
        placeholder="What needs to be done?"
        aria-label={`New ticket in ${STATUS_META[status].label}`}
        className="w-full rounded-[3px] border-2 border-teal bg-white px-2 py-2 text-sm focus:outline-none"
      />
      <p className="mt-1 px-1 text-[11px] text-zinc-500">Enter to create · Esc to cancel</p>
    </form>
  );
}
