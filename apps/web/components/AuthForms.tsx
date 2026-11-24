"use client";
import { useState } from "react";

async function post(body: unknown) {
  const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}

export function LoginForm({ expired }: { expired?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(expired ? "That link has expired or was already used. Sign in again." : "");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        setOk("");
        try {
          await post({ action: "login", email, password });
          location.href = "/app";
        } catch (e) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      {ok && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>}
      <button className="btn-cyan py-3" disabled={busy || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      <button
        type="button"
        className="text-sm font-semibold text-teal underline"
        disabled={busy}
        onClick={async () => {
          setErr("");
          setOk("");
          try {
            const j = await post({ action: "emailLink", email });
            setOk(j.message);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        Email me a sign-in link instead
      </button>
    </form>
  );
}

export function InviteForm({ token, email, agency }: { token: string; email: string; agency: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          await post({ action: "acceptInvite", token, firstName, lastName, password });
          location.href = "/app";
        } catch (e) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-slate-700">
        Joining <strong>{agency}</strong> as <strong>{email}</strong>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="first">First name</label>
          <input id="first" className="field" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="last">Last name</label>
          <input id="last" className="field" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="pw">Choose a password (10+ characters)</label>
        <input id="pw" className="field" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      <button className="btn-cyan py-3" disabled={busy}>{busy ? "Setting up…" : "Take the keys"}</button>
    </form>
  );
}

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const j = await post({ action: "setPassword", password });
          setMsg(j.message);
          setPassword("");
        } catch (e) {
          setMsg((e as Error).message);
        }
      }}
    >
      <label className="label" htmlFor="newpw">New password (10+ characters)</label>
      <input id="newpw" className="field" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
      <button className="btn-cyan">Save password</button>
    </form>
  );
}

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => post({ action: "logout" }).then(() => (location.href = "/login"))}>
      Sign out
    </button>
  );
}
