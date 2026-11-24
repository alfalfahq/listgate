import type { TicketKind, TicketPriority, TicketStatus } from "@listgate/db";

/** Jira-style keys: DW-1001. */
export const KEY_PREFIX = "DW";
export const ticketKey = (n: number) => `${KEY_PREFIX}-${n}`;
/** "DW-1001", "dw-1001" or "1001" → 1001. */
export const keyNumber = (q: string) => {
  const m = q.trim().match(/^(?:dw-?)?(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
};

export const STATUS_META: Record<TicketStatus, { label: string; lozenge: string }> = {
  open: { label: "To do", lozenge: "bg-zinc-200 text-zinc-700" },
  in_progress: { label: "In progress", lozenge: "bg-sky-100 text-sky-800" },
  waiting: { label: "Waiting for customer", lozenge: "bg-violet-100 text-violet-800" },
  resolved: { label: "Done", lozenge: "bg-emerald-100 text-emerald-800" },
};
export const STATUS_ORDER: TicketStatus[] = ["open", "in_progress", "waiting", "resolved"];

export const TYPE_META: Record<TicketKind, { label: string; long: string }> = {
  problem: { label: "Bug", long: "Something's not working" },
  change: { label: "Story", long: "A change or new feature" },
  question: { label: "Question", long: "A question" },
  billing: { label: "Billing", long: "Billing or their plan" },
};
export const TYPE_ORDER: TicketKind[] = ["problem", "change", "question", "billing"];

export const PRIORITY_META: Record<TicketPriority, { label: string; rank: number }> = {
  urgent: { label: "Highest", rank: 0 },
  high: { label: "High", rank: 1 },
  normal: { label: "Medium", rank: 2 },
  low: { label: "Low", rank: 3 },
};
export const PRIORITY_ORDER: TicketPriority[] = ["urgent", "high", "normal", "low"];

/** Kept for older pages that still colour statuses with Pill tones. */
export const STATUS_TONE: Record<TicketStatus, "red" | "amber" | "sky" | "green"> = { open: "red", in_progress: "amber", waiting: "sky", resolved: "green" };

/** Clean a comma-separated labels box into a short list. */
export const parseLabels = (s: string) =>
  [...new Set(s.split(/[,\n]/).map((x) => x.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 30)).filter(Boolean))].slice(0, 10);

/** Today in Brisbane, YYYY-MM-DD. */
export const todayBne = () => new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10);
