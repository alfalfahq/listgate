// Shared admin building blocks, matching the app's look.
import Link from "next/link";
import { LISTING_STATUS, avatarColor, initials } from "@/lib/format";
import { Icon, iconFor, type IconName } from "./icons";

export function PageHeader({ title, sub, actions, icon }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy text-cyan shadow-sm">
            <Icon name={icon} className="h-[22px] w-[22px]" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {sub && <p className="text-sm text-zinc-500">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, href, icon }: { label: string; value: string | number; sub?: string; href?: string; icon?: IconName }) {
  const name = icon ?? iconFor(label);
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        {name && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <Icon name={name} className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </>
  );
  return href ? <Link href={href} className="card card-hover block p-4">{body}</Link> : <div className="card p-4">{body}</div>;
}

export function Section({ title, action, children, className = "", icon }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string; icon?: IconName | false }) {
  const name = icon === false ? null : icon ?? iconFor(title);
  return (
    <section className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="card-title flex items-center gap-1.5">
          {name && <Icon name={name} className="h-3.5 w-3.5 text-teal" strokeWidth={2.2} />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TableCard({ children, empty }: { children: React.ReactNode; empty?: string | false }) {
  return (
    <div className="card overflow-hidden">
      {empty ? <p className="px-4 py-8 text-center text-sm text-zinc-500">{empty}</p> : <div className="overflow-x-auto"><table className="tbl">{children}</table></div>}
    </div>
  );
}

export function Avatar({ name, size = "h-8 w-8 text-xs" }: { name: string; size?: string }) {
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${avatarColor(name)} ${size}`}>{initials(name)}</span>;
}

export function AgencyMark({ name, logo, color, size = "h-8 w-8 text-xs" }: { name: string; logo?: string | null; color?: string | null; size?: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" className={`shrink-0 rounded-md object-cover ${size}`} />;
  }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white ${size}`} style={{ background: color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#0d2d4f" }}>
      {initials(name)}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = { current: "bg-sky-50 text-sky-700", under_offer: "bg-amber-50 text-amber-800", sold: "bg-emerald-50 text-emerald-700", leased: "bg-violet-50 text-violet-700", withdrawn: "bg-zinc-100 text-zinc-500", off_market: "bg-zinc-100 text-zinc-500" };
  return <span className={`pill ${tone[status] ?? "bg-zinc-100 text-zinc-600"}`}>{LISTING_STATUS[status] ?? status}</span>;
}

export function Pill({ tone = "zinc", children }: { tone?: "zinc" | "green" | "amber" | "red" | "violet" | "sky"; children: React.ReactNode }) {
  const t = { zinc: "bg-zinc-100 text-zinc-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", red: "bg-rose-50 text-rose-700", violet: "bg-violet-50 text-violet-700", sky: "bg-sky-50 text-sky-700" }[tone];
  return <span className={`pill ${t}`}>{children}</span>;
}

/** Underline tabs, same as the app's Home and Settings. */
export function Tabs({ tabs, current, label }: { tabs: { key: string; label: string; href: string }[]; current: string; label: string }) {
  return (
    <nav className="-mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-zinc-200 px-4 [scrollbar-width:none] md:mx-0 md:px-0" aria-label={label}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${t.key === current ? "border-teal font-semibold text-ink" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function SearchBox({ action, q, placeholder, children }: { action: string; q?: string; placeholder: string; children?: React.ReactNode }) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" role="search">
      <input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} className="input w-64 max-w-full" />
      {children}
      <button className="btn-secondary" type="submit">Search</button>
    </form>
  );
}
