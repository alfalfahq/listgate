// Jira-style bits shared by the board, list and ticket page. No hooks, so server and client can both use them.
import type { TicketKind, TicketPriority, TicketStatus } from "@listgate/db";
import { PRIORITY_META, STATUS_META, TYPE_META, todayBne } from "@/lib/tickets";
import { avatarColor, initials } from "@/lib/format";

export function TypeIcon({ kind, size = 16 }: { kind: TicketKind | string; size?: number }) {
  const k = (kind in TYPE_META ? kind : "problem") as TicketKind;
  const title = TYPE_META[k].label;
  const box = (bg: string, inner: React.ReactNode) => (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={title} className="shrink-0">
      <title>{title}</title>
      <rect width="16" height="16" rx="3" fill={bg} />
      {inner}
    </svg>
  );
  if (k === "problem") return box("#E5493A", <circle cx="8" cy="8" r="3.2" fill="#fff" />);
  if (k === "change") return box("#63BA3C", <path d="M5 4h6v8.5L8 10.4 5 12.5z" fill="#fff" />);
  if (k === "question") return box("#904EE2", <text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">?</text>);
  return box("#4BADE8", <text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">$</text>);
}

/** Jira's priority marks: bars filled to the level, coloured red → blue. */
export function PriorityIcon({ priority, size = 16 }: { priority: TicketPriority | string; size?: number }) {
  const p = (priority in PRIORITY_META ? priority : "normal") as TicketPriority;
  const meta = { urgent: { n: 4, c: "#CD1316" }, high: { n: 3, c: "#E9494A" }, normal: { n: 2, c: "#E97F33" }, low: { n: 1, c: "#2D8738" } }[p];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={`${PRIORITY_META[p].label} priority`} className="shrink-0">
      <title>{`${PRIORITY_META[p].label} priority`}</title>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={1.5 + i * 3.5} y={12 - i * 3} width="2.5" height={3 + i * 3} rx="0.8" fill={i < meta.n ? meta.c : "#DFE1E6"} />
      ))}
    </svg>
  );
}

export function Lozenge({ status, className = "" }: { status: TicketStatus; className?: string }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-[3px] px-1.5 py-px text-[11px] font-bold uppercase tracking-wide ${m.lozenge} ${className}`}>{m.label}</span>;
}

export function UserAvatar({ name, size = 24, title }: { name?: string | null; size?: number; title?: string }) {
  if (!name)
    return (
      <span title={title ?? "Unassigned"} className="inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500" style={{ width: size, height: size }}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.5" r="3" fill="currentColor" /><path d="M2.5 14c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5z" fill="currentColor" /></svg>
        <span className="sr-only">Unassigned</span>
      </span>
    );
  return (
    <span title={title ?? name} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${avatarColor(name)}`} style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}>
      {initials(name)}
    </span>
  );
}

export function LabelChip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-[3px] bg-zinc-100 px-1.5 py-px text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">{children}</span>;
}

export function DueChip({ due, done }: { due: string | null; done?: boolean }) {
  if (!due) return null;
  const overdue = !done && due < todayBne();
  const d = new Date(`${due}T00:00:00`);
  const label = d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return <span className={`inline-flex items-center gap-1 rounded-[3px] px-1.5 py-px text-[11px] font-medium ${overdue ? "bg-rose-100 text-rose-800" : "bg-zinc-100 text-zinc-600"}`} title={overdue ? "Overdue" : "Due date"}>{label}</span>;
}
