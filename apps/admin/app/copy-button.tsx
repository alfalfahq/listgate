"use client";
import { useState } from "react";

// Copies a ready-made prompt so a task can be pasted into a Claude chat (on the subscription)
// instead of spending API credits.
export function CopyButton({ text, label = "Copy for Claude", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className={className || "font-medium text-violet-700 underline-offset-2 hover:underline"}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
