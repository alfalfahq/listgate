"use client";
import { useRef, useState } from "react";

async function post(url: string, body: Record<string, unknown>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j as { message?: string };
}

export function Copy({ value, label = "Copy", secret = false }: { value: string; label?: string; secret?: boolean }) {
  const [done, setDone] = useState(false);
  const [shown, setShown] = useState(!secret);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-ink">{shown ? value : "•".repeat(Math.min(28, value.length))}</code>
      {secret && (
        <button type="button" className="text-xs font-bold text-teal" onClick={() => setShown((v) => !v)}>
          {shown ? "Hide" : "Show"}
        </button>
      )}
      <button
        type="button"
        className="text-xs font-bold text-teal"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? "Copied" : label}
      </button>
    </span>
  );
}

export type PartnerTile = { id: string; name: string; description: string | null; website: string | null; enabled: boolean; changedBy: string | null };

export function PartnerToggles({ agencyId, partners, authorised, canManage, viewingAs }: { agencyId: string; partners: PartnerTile[]; authorised: boolean; canManage: boolean; viewingAs: boolean }) {
  const [list, setList] = useState(partners);
  const [ok, setOk] = useState(authorised);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const locked = !canManage || viewingAs;
  return (
    <div className="flex flex-col gap-3">
      {!ok && canManage && (
        <label className="flex items-start gap-2.5 rounded-xl bg-sky p-3 text-sm">
          <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I&apos;m authorised to share this agency&apos;s listings, and I agree to Listgate sending them to the partners I switch on below.</span>
        </label>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((p) => (
          <li key={p.id} className="card flex items-start gap-3">
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-navy">{p.name}</span>
              {p.description && <span className="mt-0.5 block text-sm text-slate-600">{p.description}</span>}
              <span className="mt-1 block text-xs text-slate-500">
                {p.enabled ? "Receiving your listings" : "Not receiving your listings"}
                {p.changedBy ? ` · set by ${p.changedBy}` : ""}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={p.enabled}
              aria-label={`Send listings to ${p.name}`}
              disabled={locked || busy === p.id}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${p.enabled ? "bg-cyan" : "bg-slate-300"} disabled:opacity-50`}
              onClick={async () => {
                const enabled = !p.enabled;
                if (enabled && !ok && !agree) {
                  setMsg("Tick the box above first.");
                  return;
                }
                if (!enabled && !confirm(`Stop sending to ${p.name}? They'll be told to remove all your listings.`)) return;
                setBusy(p.id);
                setMsg("");
                try {
                  const j = await post("/api/app", { action: "setPartner", agencyId, partnerId: p.id, enabled, authorise: agree });
                  setList((l) => l.map((x) => (x.id === p.id ? { ...x, enabled, changedBy: "you" } : x)));
                  if (enabled) setOk(true);
                  setMsg(j.message || "Saved.");
                } catch (e) {
                  setMsg((e as Error).message);
                }
                setBusy(null);
              }}
            >
              <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition ${p.enabled ? "left-6" : "left-1"}`} />
            </button>
          </li>
        ))}
      </ul>
      {!canManage && <p className="text-xs text-slate-500">Only owners can change where listings go.</p>}
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
    </div>
  );
}

export function UploadFeed({ agencyId, disabled }: { agencyId: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = ref.current?.files?.[0];
        if (!f) return setMsg("Choose a file first.");
        setBusy(true);
        setMsg("");
        const fd = new FormData();
        fd.set("agencyId", agencyId);
        fd.set("file", f);
        const r = await fetch("/api/app/upload", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        setMsg(j.message || j.error || "Done.");
        setBusy(false);
        if (r.ok) setTimeout(() => location.reload(), 1200);
      }}
    >
      <input ref={ref} type="file" accept=".xml,text/xml,application/xml" className="text-sm" disabled={disabled} />
      <button className="btn-ghost px-4 py-2" disabled={disabled || busy}>{busy ? "Reading…" : "Upload"}</button>
      {msg && <span role="status" className="w-full text-sm text-slate-700">{msg}</span>}
    </form>
  );
}

export function TicketForm({ agencyId, disabled }: { agencyId: string; disabled?: boolean }) {
  const [f, setF] = useState({ subject: "", body: "", kind: "question" });
  const [msg, setMsg] = useState("");
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const j = await post("/api/tickets", { agencyId, ...f, page: "/app" });
          setMsg(j.message || "Sent.");
          setF({ subject: "", body: "", kind: "question" });
        } catch (e) {
          setMsg((e as Error).message);
        }
      }}
    >
      <div className="grid gap-2.5 sm:grid-cols-[1fr_200px]">
        <input className="field" placeholder="Short summary" required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <select className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="question">A question</option>
          <option value="problem">Something&apos;s not working</option>
          <option value="change">A change or new partner</option>
          <option value="billing">Partners or data use</option>
        </select>
      </div>
      <textarea className="field min-h-24" placeholder="What's happening?" required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <button className="btn-navy self-start" disabled={disabled}>Send to Listgate</button>
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
    </form>
  );
}
