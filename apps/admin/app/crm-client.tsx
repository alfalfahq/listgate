"use client";
import { useRef } from "react";
import { useFormStatus } from "react-dom";

/** A server-action form that clears itself after submitting. */
export function ResetForm({ action, className, children }: { action: (f: FormData) => Promise<void>; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className={className}
      action={async (f) => {
        await action(f);
        ref.current?.reset();
      }}
    >
      <Busy />
      {children}
    </form>
  );
}

function Busy() {
  const { pending } = useFormStatus();
  return pending ? <span className="sr-only" role="status">Saving…</span> : null;
}
