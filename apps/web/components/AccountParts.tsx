"use client";
import { useState } from "react";
import { CardTitle } from "./CardTitle";

async function post(url: string, body: Record<string, unknown>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j as { message?: string; url?: string };
}

export function DetailsForm({ firstName, lastName, phone, email }: { firstName: string; lastName: string; phone: string; email: string }) {
  const start = { firstName, lastName, phone };
  const [v, setV] = useState(start);
  const [saved, setSaved] = useState(start);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); setMsg(""); };
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          setMsg((await post("/api/auth", { action: "updateDetails", ...v })).message || "Saved.");
          setSaved(v);
        } catch (e) {
          setMsg((e as Error).message);
        }
        setBusy(false);
      }}
    >
      <div>
        <label className="label" htmlFor="acc-first">First name</label>
        <input id="acc-first" className="field" value={v.firstName} onChange={set("firstName")} autoComplete="given-name" required />
      </div>
      <div>
        <label className="label" htmlFor="acc-last">Last name</label>
        <input id="acc-last" className="field" value={v.lastName} onChange={set("lastName")} autoComplete="family-name" />
      </div>
      <div>
        <label className="label" htmlFor="acc-phone">Mobile</label>
        <input id="acc-phone" className="field" type="tel" inputMode="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" placeholder="04xx xxx xxx" />
      </div>
      <div>
        <span className="label">Email</span>
        <span className="field block truncate bg-slate-50 text-slate-600">{email}</span>
        <span className="mt-1 block text-xs text-slate-500">To change your email, ask the account owner or email us.</span>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-navy px-5" disabled={!dirty || busy || !v.firstName.trim()}>{busy ? "Saving…" : "Save details"}</button>
        {msg && <span role="status" className="text-sm text-slate-600">{msg}</span>}
      </div>
    </form>
  );
}

/** Set or change the password. Magic links keep working either way. */
export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [current, setCurrent] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [has, setHas] = useState(hasPassword);
  const short = pw.length > 0 && pw.length < 10;
  const mismatch = again.length > 0 && again !== pw;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="mb-1"><CardTitle icon="lock">Password</CardTitle></span>
          <span className="text-sm text-slate-600">
            {has ? "You can sign in with your email and password, or with a link we email you." : "You sign in with a link we email you. Add a password if you'd rather type one."}
          </span>
        </div>
        {!open && (
          <button type="button" className="btn-ghost shrink-0 px-4 py-2 text-sm" onClick={() => { setOpen(true); setMsg(""); }}>
            {has ? "Change password" : "Set a password"}
          </button>
        )}
      </div>
      {msg && !open && <p role="status" className="text-sm text-emerald-700">{msg}</p>}
      {open && (
        <form
          className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.length < 10) return setErr("Use at least 10 characters.");
            if (pw !== again) return setErr("The two passwords don't match.");
            setBusy(true);
            setErr("");
            try {
              await post("/api/auth", { action: "setPassword", password: pw, currentPassword: current });
              setCurrent("");
              setMsg(has ? "Password changed." : "Password set. You can now sign in with it.");
              setHas(true);
              setOpen(false);
              setPw("");
              setAgain("");
            } catch (e) {
              setErr((e as Error).message);
            }
            setBusy(false);
          }}
        >
          {has && (
            <div className="sm:max-w-[50%] sm:pr-1.5">
              <label className="label" htmlFor="pw-current">Current password</label>
              <input id="pw-current" className="field bg-white" type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              <span className="mt-1 block text-xs text-slate-500">Not needed if you signed in within the last 15 minutes.</span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pw-new">New password</label>
              <input id="pw-new" className="field bg-white" type={show ? "text" : "password"} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-describedby="pw-hint" autoFocus />
              <span id="pw-hint" className={`mt-1 block text-xs ${short ? "text-amber-700" : "text-slate-500"}`}>
                {short ? `${10 - pw.length} more character${10 - pw.length === 1 ? "" : "s"} to go` : "At least 10 characters. A short phrase works well."}
              </span>
            </div>
            <div>
              <label className="label" htmlFor="pw-again">Type it again</label>
              <input id="pw-again" className="field bg-white" type={show ? "text" : "password"} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
              {mismatch && <span className="mt-1 block text-xs text-amber-700">Doesn&apos;t match yet</span>}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
          </label>
          {err && <p role="alert" className="text-sm text-rose-700">{err}</p>}
          <div className="flex gap-2">
            <button className="btn-cyan px-5" disabled={busy || pw.length < 10 || pw !== again}>{busy ? "Saving…" : has ? "Change password" : "Set password"}</button>
            <button type="button" className="btn-ghost px-4" onClick={() => { setOpen(false); setPw(""); setAgain(""); setCurrent(""); setErr(""); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

type Member = { userId: string; name: string; email: string; role: string; isMe: boolean; joined: boolean };

export function TeamCard({ agencyId, members, canManage }: { agencyId: string; members: Member[]; canManage: boolean }) {
  const [list, setList] = useState(members);
  const [f, setF] = useState({ name: "", email: "", role: "editor" });
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-slate-100">
        {list.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white" aria-hidden>
              {m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{m.name}{m.isMe ? " (you)" : ""}</span>
              <span className="truncate text-xs text-slate-500">{m.email}{m.joined ? "" : " · invite sent"}</span>
            </span>
            <span className="pill bg-slate-100 text-slate-700 capitalize">{m.role}</span>
            {canManage && !m.isMe && (
              <button
                type="button"
                className="text-xs text-slate-500 underline"
                onClick={async () => {
                  if (!confirm(`Remove ${m.name} from this account?`)) return;
                  try {
                    await post("/api/app", { action: "removeMember", agencyId, userId: m.userId });
                    setList((l) => l.filter((x) => x.userId !== m.userId));
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                }}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canManage &&
        (open ? (
          <form
            className="flex flex-col gap-2.5 rounded-lg bg-slate-50 p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const j = await post("/api/app", { action: "invite", agencyId, ...f });
                setList((l) => (l.some((x) => x.email.toLowerCase() === f.email.toLowerCase()) ? l : [...l, { userId: f.email, name: f.name, email: f.email, role: f.role, isMe: false, joined: false }]));
                setMsg(j.message || "Invite sent.");
                setF({ name: "", email: "", role: "editor" });
                setOpen(false);
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div><label className="label" htmlFor={`inv-n-${agencyId}`}>Name</label><input id={`inv-n-${agencyId}`} className="field" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div><label className="label" htmlFor={`inv-e-${agencyId}`}>Email</label><input id={`inv-e-${agencyId}`} type="email" className="field" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            </div>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="label">Role</legend>
              <label className="flex items-center gap-2"><input type="radio" name={`role-${agencyId}`} checked={f.role === "editor"} onChange={() => setF({ ...f, role: "editor" })} /> Editor <span className="text-xs text-slate-500">(sees feeds and listings)</span></label>
              <label className="flex items-center gap-2"><input type="radio" name={`role-${agencyId}`} checked={f.role === "owner"} onChange={() => setF({ ...f, role: "owner" })} /> Owner <span className="text-xs text-slate-500">(also partners and team)</span></label>
            </fieldset>
            <div className="flex gap-2">
              <button className="btn-cyan px-4 py-2 text-sm">Send invite</button>
              <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="self-start text-sm font-bold text-teal" onClick={() => setOpen(true)}>+ Invite someone</button>
        ))}
      {msg && <p role="status" className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
