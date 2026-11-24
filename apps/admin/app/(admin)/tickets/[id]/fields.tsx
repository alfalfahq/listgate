"use client";
// Jira-style inline editing on the ticket page. Each field saves on its own; Done asks first because it emails them.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { TicketStatus } from "@listgate/db";
import { replyTicket, resolveTicket, setTicketField } from "@/app/ticket-actions";
import { ResolveEmail } from "../resolve-email";
import { safely } from "../stale";
import { STATUS_META, STATUS_ORDER } from "@/lib/tickets";

function useSave(id: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (field: string, value: string) =>
    start(() =>
      safely(async () => {
        await setTicketField(id, field, value);
        router.refresh();
      })
    );
  return { save, pending };
}

export function InlineSummary({ id, value }: { id: string; value: string }) {
  const { save } = useSave(id);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!editing)
    return (
      <h1>
        <button type="button" onClick={() => setEditing(true)} className="-mx-1.5 w-full rounded-[3px] px-1.5 py-0.5 text-left text-2xl font-semibold leading-tight text-ink hover:bg-zinc-100" title="Click to edit">
          {value}
        </button>
      </h1>
    );
  const finish = (keep: boolean) => {
    setEditing(false);
    if (keep && v.trim() && v.trim() !== value) save("subject", v);
    else setV(value);
  };
  return (
    <input
      autoFocus
      aria-label="Summary"
      value={v}
      maxLength={160}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      className="-mx-1.5 w-full rounded-[3px] border-2 border-teal px-1.5 py-0.5 text-2xl font-semibold leading-tight text-ink focus:outline-none"
    />
  );
}

export function InlineDescription({ id, value, fallback }: { id: string; value: string | null; fallback?: string | null }) {
  const { save, pending } = useSave(id);
  const [editing, setEditing] = useState(false);
  const text = value ?? fallback ?? "";
  const [v, setV] = useState(text);
  useEffect(() => setV(text), [text]);
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="-mx-2 block w-[calc(100%+1rem)] rounded-[3px] px-2 py-1.5 text-left hover:bg-zinc-100" title="Click to edit">
        {text ? <span className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{text}</span> : <span className="text-sm text-zinc-400">Add a description…</span>}
      </button>
    );
  return (
    <div>
      <textarea autoFocus aria-label="Description" value={v} onChange={(e) => setV(e.target.value)} rows={Math.min(16, Math.max(5, v.split("\n").length + 1))} className="input w-full rounded-[3px] leading-relaxed" />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            save("description", v);
            setEditing(false);
          }}
          className="btn-primary min-h-[32px] rounded-[3px] px-3"
        >
          Save
        </button>
        <button type="button" onClick={() => { setV(text); setEditing(false); }} className="rounded-[3px] px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100">Cancel</button>
      </div>
    </div>
  );
}

/** The big status button at the top of the details panel. Done opens the customer's email underneath, ready to edit. */
export function StatusSelect({ id, status, ticket, staffName, fromCustomer }: { id: string; status: TicketStatus; ticket: { number: number; subject: string; reporter: string; email: string }; staffName: string; fromCustomer: boolean }) {
  const router = useRouter();
  const { save, pending } = useSave(id);
  const [resolving, setResolving] = useState(false);
  const [busy, start] = useTransition();
  const tone = { open: "bg-zinc-200 text-zinc-800 hover:bg-zinc-300", in_progress: "bg-sky-600 text-white hover:bg-sky-700", waiting: "bg-violet-600 text-white hover:bg-violet-700", resolved: "bg-emerald-600 text-white hover:bg-emerald-700" }[resolving ? "resolved" : status];
  return (
    <div className="space-y-3">
      <label className="inline-flex">
        <span className="sr-only">Status</span>
        <select
          value={resolving ? "resolved" : status}
          disabled={pending || busy}
          onChange={(e) => {
            const v = e.target.value as TicketStatus;
            if (v === "resolved") {
              if (fromCustomer) setResolving(true);
              else
                start(() =>
                  safely(async () => {
                    await resolveTicket(id, { send: false });
                    router.refresh();
                  })
                );
              return;
            }
            setResolving(false);
            save("status", v);
          }}
          className={`h-9 cursor-pointer appearance-none rounded-[3px] border-0 bg-none px-3 py-0 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal ${tone}`}
        >
          {STATUS_ORDER.map((s) => <option key={s} value={s} className="bg-white text-ink">{STATUS_META[s].label}</option>)}
        </select>
      </label>
      {resolving && (
        <ResolveEmail
          ticket={{ id, ...ticket }}
          staffName={staffName}
          onDone={() => {
            setResolving(false);
            router.refresh();
          }}
          onCancel={() => setResolving(false)}
        />
      )}
    </div>
  );
}

/** A select in the details panel that saves as soon as it changes. */
export function FieldSelect({ id, field, value, options, label, icon }: { id: string; field: string; value: string; options: { value: string; label: string }[]; label: string; icon?: React.ReactNode }) {
  const { save, pending } = useSave(id);
  return (
    <span className="flex min-w-0 items-center gap-2">
      {icon}
      <select aria-label={label} value={value} disabled={pending} onChange={(e) => save(field, e.target.value)} className="-ml-1 min-w-0 flex-1 cursor-pointer truncate rounded-[3px] border border-transparent bg-transparent px-1 py-1 text-sm text-ink hover:border-zinc-300 hover:bg-white focus:border-teal focus:outline-none">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}

export function AssignToMe({ id, meId }: { id: string; meId: string }) {
  const { save, pending } = useSave(id);
  return (
    <button type="button" disabled={pending} onClick={() => save("assignee", meId)} className="mt-0.5 text-xs font-medium text-teal hover:underline">
      Assign to me
    </button>
  );
}

/** Text-ish field (labels, due date): saves when you leave it. */
export function FieldInput({ id, field, value, label, type = "text", placeholder }: { id: string; field: string; value: string; label: string; type?: string; placeholder?: string }) {
  const { save } = useSave(id);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && save(field, v);
  return (
    <input
      aria-label={label}
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => {
        setV(e.target.value);
        if (type === "date") save(field, e.target.value);
      }}
      onBlur={type === "date" ? undefined : commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className="-ml-1 w-full rounded-[3px] border border-transparent bg-transparent px-1 py-1 text-sm text-ink placeholder:text-zinc-400 hover:border-zinc-300 hover:bg-white focus:border-teal focus:bg-white focus:outline-none"
    />
  );
}

/** Jira Service Management's two buttons: an internal note, or a reply the customer gets by email. */
export function Composer({ id, reporter, email, status }: { id: string; reporter: string; email: string; status: TicketStatus }) {
  const router = useRouter();
  const [mode, setMode] = useState<"note" | "reply" | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  if (!mode)
    return (
      <div className="flex items-center gap-3">
        <span className="h-8 w-8 shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />
        <button type="button" onClick={() => setMode("note")} className="text-sm font-medium text-zinc-600 hover:text-ink hover:underline">Add internal note</button>
        <span className="text-zinc-300">/</span>
        <button type="button" onClick={() => setMode("reply")} className="text-sm font-medium text-zinc-600 hover:text-ink hover:underline">Reply to customer</button>
      </div>
    );
  return (
    <form
      ref={form}
      action={(f) =>
        start(() =>
          safely(async () => {
            await replyTicket(f);
            form.current?.reset();
            setMode(null);
            router.refresh();
          })
        )
      }
      className={`rounded-[3px] border-2 p-3 ${mode === "note" ? "border-amber-300 bg-amber-50/60" : "border-teal bg-white"}`}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="mode" value={mode} />
      <div className="mb-2 flex gap-1 text-sm">
        <button type="button" onClick={() => setMode("note")} className={`rounded-[3px] px-2 py-1 font-medium ${mode === "note" ? "bg-amber-200 text-amber-900" : "text-zinc-500 hover:bg-zinc-100"}`}>Internal note</button>
        <button type="button" onClick={() => setMode("reply")} className={`rounded-[3px] px-2 py-1 font-medium ${mode === "reply" ? "bg-cyan/20 text-navy" : "text-zinc-500 hover:bg-zinc-100"}`}>Reply to customer</button>
      </div>
      <textarea autoFocus name="body" required rows={4} className="input w-full rounded-[3px] bg-white" placeholder={mode === "note" ? "Only the team sees this" : `Hi ${reporter.split(" ")[0]}, …`} />
      <p className="mt-1 text-xs text-zinc-500">{mode === "note" ? "Not emailed. The customer never sees internal notes." : `Emailed to ${email} with a link to their Help tab.`}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="btn-primary min-h-[32px] rounded-[3px] px-3" disabled={pending}>{pending ? "Saving…" : mode === "note" ? "Save note" : "Send"}</button>
        <button type="button" onClick={() => setMode(null)} className="rounded-[3px] px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100">Cancel</button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-zinc-600">
          and set to
          <select name="status" defaultValue={mode === "reply" && status !== "resolved" ? "waiting" : status} className="rounded-[3px] border border-zinc-300 bg-white px-2 py-1 text-sm">
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </label>
      </div>
    </form>
  );
}

export function ActivityTabs({ all, comments, history }: { all: React.ReactNode; comments: React.ReactNode; history: React.ReactNode }) {
  const [tab, setTab] = useState<"all" | "comments" | "history">("comments");
  return (
    <div>
      <div className="mb-3 flex items-center gap-1 text-sm" role="tablist" aria-label="Activity">
        <span className="mr-2 text-zinc-500">Show:</span>
        {(["all", "comments", "history"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-[3px] px-2.5 py-1 font-medium capitalize ${tab === k ? "bg-cyan/15 text-navy" : "text-zinc-600 hover:bg-zinc-100"}`}>
            {k}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === "all" ? all : tab === "comments" ? comments : history}</div>
    </div>
  );
}
