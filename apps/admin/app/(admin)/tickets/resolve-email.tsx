"use client";
// Moving a ticket to Done: the email to the customer, ready to edit in place, instead of a confirm popup.
import { useState, useTransition } from "react";
import { resolveTicket } from "@/app/ticket-actions";
import { ticketKey } from "@/lib/tickets";
import { safely } from "./stale";

export function resolvedDraft(o: { number: number; subject: string; reporter: string; staffName: string }) {
  const first = o.reporter.split(" ")[0] || "there";
  return {
    subject: `Resolved: #${o.number} ${o.subject}`,
    message: `Hi ${first},\n\nGood news: we've sorted “${o.subject}” and marked it as resolved.\n\nIf anything still isn't right, just reply in your editor's Help tab and it'll reopen.\n\nThanks,\n${o.staffName.split(" ")[0]}`,
  };
}

export function ResolveEmail({
  ticket,
  staffName,
  before,
  onDone,
  onCancel,
}: {
  ticket: { id: string; number: number; subject: string; reporter: string; email: string };
  staffName: string;
  /** Board only: the card it was dropped above in Done. */
  before?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const draft = resolvedDraft({ number: ticket.number, subject: ticket.subject, reporter: ticket.reporter, staffName });
  const [subject, setSubject] = useState(draft.subject);
  const [message, setMessage] = useState(draft.message);
  const [pending, start] = useTransition();
  const go = (send: boolean) =>
    start(() =>
      safely(async () => {
        await resolveTicket(ticket.id, { send, subject, message, ...(before !== undefined ? { before } : {}) });
        onDone();
      })
    );
  return (
    <div className="rounded-[3px] border-2 border-emerald-500 bg-white p-3 text-sm shadow-lg" role="region" aria-label={`Email for ${ticketKey(ticket.number)}`}>
      <p className="mb-2 font-semibold text-ink">
        Move {ticketKey(ticket.number)} to Done and email {ticket.reporter.split(" ")[0]}
      </p>
      <p className="mb-2 truncate text-xs text-zinc-500">To: {ticket.reporter} &lt;{ticket.email}&gt;</p>
      <label className="block">
        <span className="label">Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className="input w-full rounded-[3px] py-1.5" />
      </label>
      <label className="mt-2 block">
        <span className="label">Message</span>
        <textarea autoFocus value={message} onChange={(e) => setMessage(e.target.value)} rows={Math.min(14, Math.max(7, message.split("\n").length + 1))} className="input w-full rounded-[3px] leading-relaxed" />
      </label>
      <p className="mt-1 text-xs text-zinc-500">Sent with a button to their Help tab, and kept on the ticket as a reply.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending || !message.trim()} onClick={() => go(true)} className="btn-primary min-h-[32px] rounded-[3px] px-3">
          {pending ? "Sending…" : "Send and move to Done"}
        </button>
        <button type="button" disabled={pending} onClick={() => go(false)} className="rounded-[3px] px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100">
          Move without emailing
        </button>
        <button type="button" disabled={pending} onClick={onCancel} className="ml-auto rounded-[3px] px-3 py-1.5 font-medium text-zinc-500 hover:bg-zinc-100">
          Cancel
        </button>
      </div>
    </div>
  );
}
