"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavNode = { slug: string; title: string; emoji: string | null; children: NavNode[] };

export function HelpNav({ nodes }: { nodes: NavNode[] }) {
  const path = usePathname();
  const current = path.match(/^\/help\/([^/]+)/)?.[1];
  return <List nodes={nodes} current={current} depth={0} />;
}

function List({ nodes, current, depth }: { nodes: NavNode[]; current?: string; depth: number }) {
  return (
    <ul className={depth ? "ml-3 border-l border-slate-200 pl-2" : "space-y-0.5"}>
      {nodes.map((n) => (
        <li key={n.slug}>
          <Link href={`/help/${n.slug}`} aria-current={current === n.slug ? "page" : undefined} className={`block rounded-md px-2 py-1 ${current === n.slug ? "bg-sky font-semibold text-navy" : "text-slate-600 hover:bg-slate-50 hover:text-ink"}`}>
            {n.emoji && <span className="mr-1.5" aria-hidden="true">{n.emoji}</span>}
            {n.title}
          </Link>
          {n.children.length > 0 && <List nodes={n.children} current={current} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}
