"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Phone header: hamburger opens the full grouped sidebar as a drawer from the left. */
export function MobileNav({ logo, footer, children }: { logo: React.ReactNode; footer: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <>
      <header className="sidenav sticky top-0 z-30 flex h-14 items-center gap-3 px-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="admin-drawer"
          className="nav-item -ml-1 grid h-10 w-10 place-items-center rounded-lg"
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="flex items-center gap-2">
          {logo}
          <span className="nav-muted text-[11px] font-semibold uppercase tracking-[0.18em]">Admin</span>
        </span>
      </header>

      <div className={`fixed inset-0 z-40 md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`} />
        <aside
          id="admin-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Admin menu"
          className={`sidenav absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col shadow-2xl transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <span>
              {logo}
              <span className="nav-muted mt-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em]">Admin</span>
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="nav-item grid h-10 w-10 place-items-center rounded-lg">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto overscroll-contain px-2 pb-3 [scrollbar-width:none]" aria-label="Admin">{children}</nav>
          {footer}
        </aside>
      </div>
    </>
  );
}
