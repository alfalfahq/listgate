"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { State } from "./actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Working…" : children}
    </button>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function ActionForm({ action, children, submit, className = "" }: { action: (s: State, f: FormData) => Promise<State>; children: React.ReactNode; submit: string; className?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={`card space-y-4 p-5 ${className}`}>
      {children}
      <Submit>{submit}</Submit>
      <div aria-live="polite" className="space-y-2">
        {state?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
        {state?.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>}
        {state?.open && (
          <a href={state.open} className="btn-primary w-full">Open it</a>
        )}
        {state?.secret && (
          <div className="flex items-center gap-2">
            <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={state.secret} onFocus={(e) => e.currentTarget.select()} aria-label="Secret" />
            <Copy text={state.secret} />
          </div>
        )}
        {state?.link && (
          <div className="flex items-center gap-2">
            <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
            <Copy text={state.link} />
          </div>
        )}
      </div>
    </form>
  );
}

/** A labelled field. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
