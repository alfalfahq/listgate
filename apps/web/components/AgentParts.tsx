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

function Switch({ on, label, disabled, onClick }: { on: boolean; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-cyan" : "bg-slate-300"} disabled:opacity-50`}>
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

export type AgentPartner = { id: string; name: string; description: string | null };

/**
 * Per partner: "My …" and "Whole office" switches. kind=listings or properties.
 * approve: "verified" (CRM says principal: no tick box), "tick" (no CRM sign-in: tick box), "no" (CRM sign-in on, not a principal).
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
  const [agree, setAgree] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const run = async (key: string, body: Record<string, unknown>, done: () => void) => {
    setBusy(key);
    setMsg("");
    try {
      const j = await post("/api/agent", body);
      done();
      setMsg(j.message || "Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(null);
  };
  if (o.locked)
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Listgate has locked changes for this office{o.locked !== "yes" ? `: ${o.locked}` : ""}. Your {noun} from this office only go where Listgate has set. Email {o.contact} if you need help.
      </p>
    );
  if (!o.partners.length) return <p className="text-sm text-slate-500">No partners take {noun} yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {o.partners.map((p) => {
          const officeBy = office.get(p.id);
          const officeOn = office.has(p.id);
          return (
            <li key={p.id} className="rounded-xl border border-slate-200 p-4">
              <p className="font-bold text-navy">{p.name}</p>
              {p.description && <p className="mt-0.5 text-sm text-slate-600">{p.description}</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold text-ink">My {noun}</span>
                    <span className="block text-xs text-slate-500">{o.myCount} {props ? "assigned to you" : "with your email"}{officeOn ? " (already covered by the office)" : ""}</span>
                  </span>
                  <Switch
                    on={mine.has(p.id) || officeOn}
                    label={`Share my ${noun} with ${p.name}`}
                    disabled={o.viewingAs || officeOn || busy === `m${p.id}`}
                    onClick={() => {
                      const enabled = !mine.has(p.id);
                      if (!enabled && !confirm(`Stop sharing your ${noun} with ${p.name}? They'll be told to remove them.`)) return;
                      run(`m${p.id}`, { action: props ? "propsMine" : "mine", sourceId: o.sourceId, partnerId: p.id, enabled }, () => setMine((s) => { const n = new Set(s); if (enabled) n.add(p.id); else n.delete(p.id); return n; }));
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
                  <div className="flex items-start gap-3">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-semibold text-ink">Whole office</span>
                      <span className="block text-xs text-slate-500">{officeOn ? `All ${o.officeCount} ${noun}${officeBy ? ` · approved by ${officeBy}` : ""}` : `All ${o.officeCount} ${noun}, including other agents'`}</span>
                    </span>
                    <Switch
                      on={officeOn}
                      label={`Share every ${props ? "property" : "listing"} from ${o.officeName} with ${p.name}`}
                      disabled={o.viewingAs || busy === `o${p.id}` || (o.approve === "no" && !officeOn)}
                      onClick={() => {
                        const enabled = !officeOn;
                        if (enabled && o.approve === "tick" && !agree[p.id]) return setMsg("Tick the box to confirm you're authorised for the whole office first.");
                        if (!enabled && !confirm(`Stop sharing the whole office with ${p.name}? What agents shared themselves keeps going.`)) return;
                        run(`o${p.id}`, { action: props ? "propsOffice" : "office", agencyId: o.agencyId, partnerId: p.id, enabled, authorise: !!agree[p.id] }, () =>
                          setOffice((m) => { const n = new Map(m); if (enabled) n.set(p.id, "you"); else n.delete(p.id); return n; })
                        );
                      }}
                    />
                  </div>
                  {!officeOn && o.approve === "tick" && (
                    <label className="flex items-start gap-2 text-xs text-slate-700">
                      <input type="checkbox" className="mt-0.5" checked={!!agree[p.id]} onChange={(e) => setAgree((a) => ({ ...a, [p.id]: e.target.checked }))} />
                      <span>I&apos;m authorised to approve this for the whole office (e.g. I&apos;m the principal or office manager).</span>
                    </label>
                  )}
                  {!officeOn && o.approve === "no" && <p className="text-xs text-slate-500">Only a principal or office admin in {o.crmName} can approve the whole office.</p>}
                  {!officeOn && o.approve === "verified" && <p className="text-xs text-slate-500">{o.crmName} confirms you can approve for the office.</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
    </div>
  );
}

type Found = { id: string; address: string; status: string; kind: string; goingTo: string[]; keptFrom: { partnerId: string; by: string | null }[] };

/** Search listings and keep one away from a partner (or let it through again). */
export function ListingSearch({ agencyId, partners, viewingAs }: { agencyId: string; partners: AgentPartner[]; viewingAs: boolean }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Found[] | null>(null);
  const [scope, setScope] = useState<"mine" | "office">("mine");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const search = async () => {
    setMsg("");
    const r = await fetch(`/api/agent/listings?agencyId=${encodeURIComponent(agencyId)}&q=${encodeURIComponent(q)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error || "Couldn't search.");
    setRows(j.rows);
    setScope(j.scope);
  };
  const name = (id: string) => partners.find((p) => p.id === id)?.name ?? "partner";
  return (
    <div className="flex flex-col gap-3">
      <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), search())}>
        <input className="field flex-1" placeholder="Street, suburb or listing ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search listings" />
        <button className="btn-cyan px-4">Search</button>
      </form>
      {rows && <p className="text-xs text-slate-500">{scope === "office" ? "Showing the whole office (you're a principal)." : "Showing your own listings."} {rows.length === 25 ? "First 25 matches." : ""}</p>}
      {rows?.length === 0 && <p className="text-sm text-slate-600">No listings match.</p>}
      <ul className="flex flex-col gap-2">
        {rows?.map((l) => (
          <li key={l.id} className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold text-ink">{l.address}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {partners.map((p) => {
                const kept = l.keptFrom.find((k) => k.partnerId === p.id);
                const going = l.goingTo.includes(p.id);
                if (!kept && !going) return null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={viewingAs || busy === `${l.id}${p.id}`}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${kept ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-300 bg-white text-ink"}`}
                    title={kept ? `Kept from ${p.name}${kept.by ? ` by ${kept.by}` : ""}. Click to let it through again.` : `Going to ${p.name}. Click to remove it from ${p.name}.`}
                    onClick={async () => {
                      const excluded = !kept;
                      if (excluded && !confirm(`Remove ${l.address} from ${p.name}? They'll be told to take it down, and it won't go there again until you undo this.`)) return;
                      setBusy(`${l.id}${p.id}`);
                      setMsg("");
                      try {
                        const j = await post("/api/agent", { action: "exclude", listingId: l.id, partnerId: p.id, excluded });
                        setRows((rs) => rs!.map((r) => (r.id !== l.id ? r : { ...r, keptFrom: excluded ? [...r.keptFrom, { partnerId: p.id, by: "you" }] : r.keptFrom.filter((k) => k.partnerId !== p.id), goingTo: excluded ? r.goingTo.filter((g) => g !== p.id) : r.goingTo })));
                        setMsg(j.message || "Saved.");
                      } catch (e) {
                        setMsg((e as Error).message);
                      }
                      setBusy(null);
                    }}
                  >
                    {kept ? `Removed from ${name(p.id)} · undo` : `On ${name(p.id)} · remove`}
                  </button>
                );
              })}
              {!l.goingTo.length && !l.keptFrom.length && <span className="text-xs text-slate-500">Not going to any partner.</span>}
            </div>
          </li>
        ))}
      </ul>
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
    </div>
  );
}
