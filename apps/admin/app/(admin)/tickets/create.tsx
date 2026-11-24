"use client";
// Jira's Create dialog. Opens from the Create button, by pressing "c" anywhere, or with ?create=1.
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { TicketKind } from "@listgate/db";
import { createTicket } from "@/app/ticket-actions";
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER, TYPE_META, TYPE_ORDER } from "@/lib/tickets";
import { TypeIcon } from "./ui";

export function CreateTicket({ people, businesses, meId, openAtStart, justCreated }: { people: { id: string; name: string }[]; businesses: { id: string; name: string }[]; meId: string; openAtStart?: boolean; justCreated?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<TicketKind>("problem");
  const [customer, setCustomer] = useState(false);
  const open = () => ref.current?.showModal();

  useEffect(() => {
    if (openAtStart) open();
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable && !ref.current?.open) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [openAtStart]);

  return (
    <>
      <button type="button" onClick={open} className="btn-primary" title="Create a ticket (c)">
        Create
      </button>
      <dialog
        ref={ref}
        aria-labelledby="create-h"
        className="m-auto w-[min(680px,calc(100vw-2rem))] rounded-md p-0 shadow-2xl backdrop:bg-[#091e42]/50"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <form action={createTicket} className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
            <h2 id="create-h" className="text-xl font-semibold text-ink">Create ticket</h2>
            <button type="button" onClick={() => ref.current?.close()} className="rounded p-1 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </header>
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            {justCreated && <p className="rounded-[3px] bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Created {justCreated}. Add the next one.</p>}
            <p className="text-xs text-zinc-500">Required fields are marked with an asterisk <span className="text-rose-600">*</span></p>

            <fieldset>
              <legend className="label">Issue type <span className="text-rose-600">*</span></legend>
              <div className="flex flex-wrap gap-1.5">
                {TYPE_ORDER.map((k) => (
                  <label key={k} className={`flex cursor-pointer items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-sm ${kind === k ? "border-teal bg-cyan/10 font-medium text-ink" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}>
                    <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                    <TypeIcon kind={k} />
                    {TYPE_META[k].label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="label">Summary <span className="text-rose-600">*</span></span>
              <input name="subject" required maxLength={160} autoFocus className="input w-full rounded-[3px]" placeholder="e.g. Ray White Bulimba: change the footer phone number" />
            </label>

            <label className="block">
              <span className="label">Description</span>
              <textarea name="body" rows={5} className="input w-full rounded-[3px]" placeholder="Steps to reproduce, what they expected, links…" />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Status</span>
                <select name="status" defaultValue="open" className="input w-full rounded-[3px]">
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label flex items-center gap-1">Priority</span>
                <select name="priority" defaultValue="normal" className="input w-full rounded-[3px]">
                  {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label">Assignee</span>
                <select name="assigneeId" defaultValue={meId} className="input w-full rounded-[3px]">
                  <option value="">Unassigned</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.id === meId ? `${p.name} (me)` : p.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label">Business</span>
                <select name="agencyId" defaultValue="" className="input w-full rounded-[3px]">
                  <option value="">None: one of ours</option>
                  {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label">Labels</span>
                <input name="labels" className="input w-full rounded-[3px]" placeholder="editor, domains" />
              </label>
              <label className="block">
                <span className="label">Due date</span>
                <input name="due" type="date" className="input w-full rounded-[3px]" />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={customer} onChange={(e) => setCustomer(e.target.checked)} className="size-4 accent-teal" />
              A customer reported this
            </label>
            {customer && (
              <div className="grid gap-4 rounded-[3px] bg-zinc-50 p-3 sm:grid-cols-2">
                <label className="block"><span className="label">Reporter name</span><input name="name" className="input w-full rounded-[3px]" /></label>
                <label className="block"><span className="label">Reporter email</span><input name="email" type="email" className="input w-full rounded-[3px]" /></label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="tell" className="size-4 accent-teal" /> Email them that we&apos;ve logged it (sends the description)
                </label>
              </div>
            )}
          </div>
          <footer className="flex items-center gap-3 border-t border-zinc-200 px-6 py-3">
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input type="checkbox" name="another" defaultChecked={!!justCreated} className="size-4 accent-teal" /> Create another
            </label>
            <span className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => ref.current?.close()} className="rounded-[3px] px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">Cancel</button>
              <Submit />
            </span>
          </footer>
        </form>
      </dialog>
    </>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Creating…" : "Create"}
    </button>
  );
}

