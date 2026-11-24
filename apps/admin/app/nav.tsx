"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, className, children }: { href: string; exact?: boolean; className?: string; children: React.ReactNode }) {
  const path = usePathname();
  const here = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={here ? "page" : undefined} className={className}>
      {children}
    </Link>
  );
}
