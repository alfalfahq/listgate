// Public help site: the wiki pages the team has made public.
import Link from "next/link";
import { WIKI_CSS } from "@listgate/db/wiki";
import { Logo } from "@/components/Logo";
import { helpPages, helpTree } from "@/lib/help";
import { HelpNav, type NavNode } from "./nav";

export const dynamic = "force-dynamic";

export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const pages = await helpPages();
  const strip = (n: ReturnType<typeof helpTree>[number]): NavNode => ({ slug: n.slug, title: n.title, emoji: n.emoji, children: n.children.map(strip) });
  const tree = helpTree(pages).map(strip);
  return (
    <main className="min-h-screen bg-white text-ink">
      <style dangerouslySetInnerHTML={{ __html: WIKI_CSS }} />
      <header className="border-b border-slate-200 bg-navy">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <Link href="/" aria-label="Listgate home"><Logo height={26} white /></Link>
          <Link href="/help" className="text-sm font-semibold text-cyan hover:underline">Help centre</Link>
          <form action="/help" className="ml-auto w-full sm:w-80">
            <input name="q" placeholder="Search help" aria-label="Search help" className="w-full rounded-full border-0 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/60 focus:bg-white focus:text-ink focus:outline-none focus:ring-2 focus:ring-cyan" />
          </form>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto text-sm" aria-label="Help articles">
            <HelpNav nodes={tree} />
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-6 text-sm text-slate-500">
          <span>Can&apos;t find it? Ask us from the Help tab in your editor.</span>
          <Link href="/app" className="ml-auto font-semibold text-teal hover:underline">Open your editor</Link>
        </div>
      </footer>
    </main>
  );
}
