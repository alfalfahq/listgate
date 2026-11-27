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

export function OfficeUnlocks(o: { sourceId: string; agencyId: string; officeName: string; partners: AgentPartner[]; mineOn: string[]; officeOn: { partnerId: string; by: string | null }[]; myCount: number; officeCount: number; viewingAs: boolean; locked?: string | null; contact?: string }) {
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
        Listgate has locked changes for this office{o.locked !== "yes" ? `: ${o.locked}` : ""}. Your listings from this office only go where Listgate has set. Email {o.contact} if you need help.
      </p>
    );
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
                    <span className="block font-semibold text-ink">My listings</span>
                    <span className="block text-xs text-slate-500">{o.myCount} listing{o.myCount === 1 ? "" : "s"} with your email{officeOn ? " (already covered by the office)" : ""}</span>
                  </span>
                  <Switch
                    on={mine.has(p.id) || officeOn}
                    label={`Send my listings to ${p.name}`}
                    disabled={o.viewingAs || officeOn || busy === `m${p.id}`}
                    onClick={() => {
                      const enabled = !mine.has(p.id);
                      if (!enabled && !confirm(`Stop sending your listings to ${p.name}? They'll be told to remove them.`)) return;
                      run(`m${p.id}`, { action: "mine", sourceId: o.sourceId, partnerId: p.id, enabled }, () => setMine((s) => { const n = new Set(s); if (enabled) n.add(p.id); else n.delete(p.id); return n; }));
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
                  <div className="flex items-start gap-3">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-semibold text-ink">Whole office</span>
                      <span className="block text-xs text-slate-500">{officeOn ? `All ${o.officeCount} listings${officeBy ? ` · approved by ${officeBy}` : ""}` : `All ${o.officeCount} listings, including other agents'`}</span>
                    </span>
                    <Switch
                      on={officeOn}
                      label={`Send every listing from ${o.officeName} to ${p.name}`}
                      disabled={o.viewingAs || busy === `o${p.id}`}
                      onClick={() => {
                        const enabled = !officeOn;
                        if (enabled && !agree[p.id]) return setMsg("Tick the box to confirm you're authorised for the whole office first.");
                        if (!enabled && !confirm(`Stop sending the whole office to ${p.name}? Listings agents unlocked themselves keep going.`)) return;
                        run(`o${p.id}`, { action: "office", agencyId: o.agencyId, partnerId: p.id, enabled, authorise: !!agree[p.id] }, () =>
                          setOffice((m) => { const n = new Map(m); if (enabled) n.set(p.id, "you"); else n.delete(p.id); return n; })
                        );
                      }}
                    />
                  </div>
                  {!officeOn && (
                    <label className="flex items-start gap-2 text-xs text-slate-700">
                      <input type="checkbox" className="mt-0.5" checked={!!agree[p.id]} onChange={(e) => setAgree((a) => ({ ...a, [p.id]: e.target.checked }))} />
                      <span>I&apos;m authorised to approve this for the whole office (e.g. I&apos;m the principal or office manager).</span>
                    </label>
                  )}
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
