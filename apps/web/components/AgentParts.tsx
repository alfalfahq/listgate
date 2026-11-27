"use client";
import { useState } from "react";

async function post(url: string, body: Record<string, unknown>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j as { message?: string };
}

export function AgentSignIn() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const j = await post("/api/auth", { action: "emailLink", email });
          setMsg({ ok: true, text: j.message || "Check your email." });
        } catch (e) {
          setMsg({ ok: false, text: (e as Error).message });
        }
        setBusy(false);
      }}
    >
      <label className="label" htmlFor="agent-email">The email address on your listings</label>
      <input id="agent-email" className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
      <button className="btn-cyan py-3" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
    </form>
  );
}

const ICON = {
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>,
  off: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  check: <><path d="m5 12 4.5 4.5L19 7" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
};
export function Icon({ name, className = "size-4" }: { name: keyof typeof ICON; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[name]}
    </svg>
  );
}

export type AgentPartner = { id: string; name: string; description: string | null; website?: string | null };

/** Partner logo: the site's icon, over its initials while it loads (or if it doesn't). */
export function PartnerMark({ p, size = 40 }: { p: AgentPartner; size?: number }) {
  const [ok, setOk] = useState(false);
  const host = p.website ? p.website.replace(/^https?:\/\//, "").split("/")[0] : null;
  return (
    <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy text-sm font-bold text-white" style={{ width: size, height: size }} aria-hidden="true">
      {p.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
      {host && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=128`} alt="" ref={(el) => { if (el?.complete && el.naturalWidth > 16) setOk(true); }} onLoad={(e) => setOk(e.currentTarget.naturalWidth > 16)} className={`absolute inset-0 size-full bg-white object-contain p-1.5 ${ok ? "" : "opacity-0"}`} />
      )}
    </span>
  );
}

type Choice = "off" | "mine" | "office";

/**
 * One row per partner with a three-way choice: Off · Mine · Whole office.
 * approve: "verified" (CRM says principal), "tick" (no CRM sign-in: confirm with a tick), "no" (CRM sign-in on, not a principal).
 */
export function OfficeUnlocks(o: {
  kind?: "listings" | "properties";
  sourceId: string;
  agencyId: string;
  officeName: string;
  partners: AgentPartner[];
  mineOn: string[];
  officeOn: { partnerId: string; by: string | null }[];
  myCount: number;
  officeCount: number;
  viewingAs: boolean;
  approve: "verified" | "tick" | "no";
  crmName: string;
  locked?: string | null;
  contact?: string;
}) {
  const props = o.kind === "properties";
  const noun = props ? "properties" : "listings";
  const [mine, setMine] = useState(new Set(o.mineOn));
  const [office, setOffice] = useState(new Map(o.officeOn.map((x) => [x.partnerId, x.by])));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (o.locked)
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Changes for this office are paused{o.locked !== "yes" ? `: ${o.locked}` : ""}. Email {o.contact} if you need help.
      </p>
    );
  if (!o.partners.length) return <p className="text-sm text-slate-500">No partners take {noun} yet.</p>;

  const call = (body: Record<string, unknown>) => post("/api/agent", body);
  const choose = async (p: AgentPartner, to: Choice) => {
    const from: Choice = office.has(p.id) ? "office" : mine.has(p.id) ? "mine" : "off";
    if (to === from) return;
    if (to === "office" && o.approve === "tick" && confirming !== p.id) {
      setAgree(false);
      return setConfirming(p.id);
    }
    if (from === "office" && to === "off" && !confirm(`Stop sending ${o.officeName}'s ${noun} to ${p.name}? They'll be asked to take them down.`)) return;
    if (from === "mine" && to === "off" && !confirm(`Stop sending your ${noun} to ${p.name}? They'll be asked to take them down.`)) return;
    setBusy(p.id);
    setMsg(null);
    try {
      let last: { message?: string } = {};
      if (to === "office") last = await call({ action: props ? "propsOffice" : "office", agencyId: o.agencyId, partnerId: p.id, enabled: true, authorise: true });
      if (from === "office") last = await call({ action: props ? "propsOffice" : "office", agencyId: o.agencyId, partnerId: p.id, enabled: false });
      if (to === "mine" && !mine.has(p.id)) last = await call({ action: props ? "propsMine" : "mine", sourceId: o.sourceId, partnerId: p.id, enabled: true });
      if (to === "off" && mine.has(p.id)) last = await call({ action: props ? "propsMine" : "mine", sourceId: o.sourceId, partnerId: p.id, enabled: false });
      setOffice((m) => { const n = new Map(m); if (to === "office") n.set(p.id, "you"); else n.delete(p.id); return n; });
      setMine((s) => { const n = new Set(s); if (to === "mine") n.add(p.id); if (to === "off") n.delete(p.id); return n; });
      setConfirming(null);
      setMsg({ ok: true, text: last.message || "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-slate-100">
        {o.partners.map((p) => {
          const cur: Choice = office.has(p.id) ? "office" : mine.has(p.id) ? "mine" : "off";
          const by = office.get(p.id);
          const seg = (c: Choice, label: string, icon: keyof typeof ICON, title: string, disabled = false) => (
            <button
              type="button"
              role="radio"
              aria-checked={cur === c}
              title={title}
              disabled={o.viewingAs || busy === p.id || disabled}
              onClick={() => choose(p, c)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${cur === c ? (c === "off" ? "bg-white text-ink shadow-sm" : "bg-cyan text-navy shadow-sm") : "text-slate-500 hover:text-ink"}`}
            >
              <Icon name={icon} className="size-3.5" />
              {label}
            </button>
          );
          return (
            <li key={p.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <PartnerMark p={p} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">{cur === "office" ? `Whole office${by ? ` · approved by ${by}` : ""}` : cur === "mine" ? `Your ${o.myCount} ${noun}` : p.description || "Not receiving anything"}</p>
                </div>
                <div role="radiogroup" aria-label={`${p.name}: what to send`} className="flex rounded-full bg-slate-100 p-1">
                  {seg("off", "Off", "off", "Send nothing")}
                  {seg("mine", "Mine", "user", `Only ${noun} ${props ? "assigned to you" : "with your email on them"}`)}
                  {seg("office", "Office", "building", o.approve === "no" ? `Only a principal or office admin in ${o.crmName} can choose this` : `Every ${props ? "property" : "listing"} in ${o.officeName}`, o.approve === "no" && cur !== "office")}
                </div>
              </div>
              {confirming === p.id && (
                <div className="mt-3 rounded-xl bg-sky p-3 text-sm">
                  <label className="flex items-start gap-2 text-ink">
                    <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                    <span>I&apos;m authorised to share all {o.officeCount} of {o.officeName}&apos;s {noun} with {p.name}, including other agents&apos; (for example, I&apos;m the principal or office manager).</span>
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn-cyan px-4 py-1.5 text-sm" disabled={!agree || busy === p.id} onClick={() => choose(p, "office")}>Share the whole office</button>
                    <button type="button" className="btn-ghost px-4 py-1.5 text-sm" onClick={() => setConfirming(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {o.approve === "no" && <p className="text-xs text-slate-500">Sharing the whole office needs a principal or office admin in {o.crmName}.</p>}
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}

type Found = { id: string; address: string; photo: string | null; status: string; kind: string; goingTo: string[]; keptFrom: { partnerId: string; by: string | null }[] };

/** Search listings and take one off a particular partner (or put it back). */
export function ListingSearch({ agencyId, partners, viewingAs }: { agencyId: string; partners: AgentPartner[]; viewingAs: boolean }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Found[] | null>(null);
  const [scope, setScope] = useState<"mine" | "office">("mine");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const search = async () => {
    setMsg(null);
    const r = await fetch(`/api/agent/listings?agencyId=${encodeURIComponent(agencyId)}&q=${encodeURIComponent(q)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ ok: false, text: j.error || "Couldn't search." });
    setRows(j.rows);
    setScope(j.scope);
  };
  const byId = new Map(partners.map((p) => [p.id, p]));
  const toggle = async (l: Found, p: AgentPartner, excluded: boolean) => {
    if (excluded && !confirm(`Take ${l.address} off ${p.name}? It stays off until you put it back.`)) return;
    setBusy(`${l.id}${p.id}`);
    setMsg(null);
    try {
      const j = await post("/api/agent", { action: "exclude", listingId: l.id, partnerId: p.id, excluded });
      setRows((rs) => rs!.map((r) => (r.id !== l.id ? r : { ...r, keptFrom: excluded ? [...r.keptFrom, { partnerId: p.id, by: "you" }] : r.keptFrom.filter((k) => k.partnerId !== p.id), goingTo: excluded ? r.goingTo.filter((g) => g !== p.id) : [...r.goingTo, p.id] })));
      setMsg({ ok: true, text: j.message || "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(null);
  };
  return (
    <div className="flex flex-col gap-3">
      <form className="relative" onSubmit={(e) => (e.preventDefault(), search())}>
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input className="field w-full pl-10 pr-24" placeholder="Search by street or suburb" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search listings" />
        <button className="btn-cyan absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 text-sm">Search</button>
      </form>
      {rows && <p className="text-xs text-slate-500">{scope === "office" ? "Whole office" : "Your listings"}{rows.length === 25 ? " · first 25" : ""}</p>}
      {rows?.length === 0 && <p className="text-sm text-slate-600">No listings match.</p>}
      <ul className="flex flex-col gap-2">
        {rows?.map((l) => (
          <li key={l.id} className="flex gap-3 rounded-xl border border-slate-200 p-2.5">
            <Thumb src={l.photo} className="h-16 w-24" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{l.address}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {l.goingTo.map((id) => byId.get(id)).filter((p): p is AgentPartner => !!p).map((p) => (
                  <button key={p.id} type="button" disabled={viewingAs || busy === `${l.id}${p.id}`} onClick={() => toggle(l, p, true)} title={`Take this listing off ${p.name}`} className="flex items-center gap-1 rounded-full bg-cyan-soft px-2.5 py-1 text-xs font-semibold text-navy hover:bg-rose-50 hover:text-rose-800">
                    {p.name} <Icon name="x" className="size-3" />
                  </button>
                ))}
                {l.keptFrom.map((k) => byId.get(k.partnerId)).filter((p): p is AgentPartner => !!p).map((p) => (
                  <button key={p.id} type="button" disabled={viewingAs || busy === `${l.id}${p.id}`} onClick={() => toggle(l, p, false)} title={`Put this listing back on ${p.name}`} className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-500 line-through decoration-slate-400 hover:text-ink">
                    {p.name} <Icon name="undo" className="size-3" />
                  </button>
                ))}
                {!l.goingTo.length && !l.keptFrom.length && <span className="text-xs text-slate-500">Not on any partner yet.</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}

/** A listing photo, or a soft placeholder. */
export function Thumb({ src, className = "" }: { src: string | null; className?: string }) {
  // Hidden until it has actually loaded, so a broken or slow image never shows the browser's broken-image icon.
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sky text-teal ${className}`}>
      <Icon name="home" className="size-6 opacity-60" />
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoaded(true); }}
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
