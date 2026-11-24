// The wiki space: page tree and search on the left, the page on the right.
import { wikiTree } from "@listgate/db/wiki";
import { requireAdmin } from "@/lib/auth";
import { wikiRows } from "@/lib/wiki";
import { createPage } from "@/app/wiki-actions";
import { WikiTree, type TreeNode } from "./tree";
import Link from "next/link";

export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const rows = await wikiRows();
  const strip = (n: ReturnType<typeof wikiTree<(typeof rows)[number]>>[number]): TreeNode => ({ id: n.id, title: n.title, emoji: n.emoji, internal: n.internal, children: n.children.map(strip) });
  const tree = wikiTree(rows).map(strip);
  return (
    <div className="-my-2 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
        <Link href="/wiki" className="flex items-center gap-2 rounded-[3px] px-2 py-1.5 hover:bg-zinc-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy text-sm font-bold text-cyan">K</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">Knowledge base</span>
            <span className="block text-xs text-zinc-500">Listgate wiki</span>
          </span>
        </Link>
        <form action="/wiki" className="mt-3 px-1">
          <input name="q" placeholder="Search pages" aria-label="Search the wiki" className="input h-8 w-full rounded-[3px] py-1 text-sm" />
        </form>
        <div className="mt-4 flex items-center justify-between px-2">
          <p className="card-title">Pages</p>
          <form action={createPage}>
            <button className="rounded-[3px] px-1.5 text-lg leading-none text-zinc-500 hover:bg-zinc-100 hover:text-ink" title="Create a page" aria-label="Create a page">+</button>
          </form>
        </div>
        <nav className="mt-1" aria-label="Pages">
          <WikiTree nodes={tree} />
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
