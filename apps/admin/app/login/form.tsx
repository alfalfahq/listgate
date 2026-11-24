"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "@/app/session";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>;
}

export function LoginForm() {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" autoComplete="username" required autoFocus className="input w-full" />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input w-full" />
      </label>
      {state?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" aria-live="polite">{state.error}</p>}
      <Submit />
    </form>
  );
}
