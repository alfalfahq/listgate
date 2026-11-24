"use client";
// Confluence-style page tree for the wiki sidebar. Everything is open; the current page is highlighted.
import Link from "next/link";
import { usePathname } from "next/navigation";

export type TreeNode = { id: string; title: string; emoji: string | null; internal: boolean; children: TreeNode[] };

export function WikiTree({ nodes }: { nodes: TreeNode[] }) {
  const path = usePathname();
  const current = path.match(/^\/wiki\/([0-9a-f-]{36})/)?.[1];
  if (!nodes.length) return <p className="px-2 py-3 text-sm text-zinc-500">No pages yet.</p>;
  return <List nodes={nodes} current={current} depth={0} />;
}

function List({ nodes, current, depth }: { nodes: TreeNode[]; current?: string; depth: number }) {
  return (
    <ul className={depth ? "ml-3 border-l border-zinc-200 pl-1.5" : ""}>
      {nodes.map((n) => (
        <li key={n.id}>
          <Link
            href={`/wiki/${n.id}`}
            aria-current={current === n.id ? "page" : undefined}
            className={`group flex items-center gap-1.5 rounded-[3px] px-2 py-1 text-sm ${current === n.id ? "bg-cyan/15 font-semibold text-navy" : "text-zinc-700 hover:bg-zinc-100"}`}
          >
            <span className="w-4 shrink-0 text-center text-[13px] leading-none" aria-hidden="true">{n.emoji ?? "·"}</span>
            <span className="min-w-0 flex-1 truncate">{n.title}</span>
            {n.internal && <span className="shrink-0 rounded-[3px] bg-amber-100 px-1 text-[10px] font-semibold uppercase text-amber-800" title="Internal: only the team can see it">Int</span>}
          </Link>
          {n.children.length > 0 && <List nodes={n.children} current={current} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}
