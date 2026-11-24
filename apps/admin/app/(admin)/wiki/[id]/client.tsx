"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Press "e" to edit, like Confluence. */
export function EditShortcut({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "e" && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) router.push(href);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [href, router]);
  return null;
}

/** Copies the public link (or the admin link for internal pages). */
export function CopyLink({ url }: { url: string | null }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url ?? window.location.href);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="btn-secondary min-h-[34px] rounded-[3px]"
      title={url ? "Copy the public help-site link" : "Copy the team link (this page is internal)"}
    >
      {done ? "Copied" : url ? "Copy public link" : "Copy link"}
    </button>
  );
}
