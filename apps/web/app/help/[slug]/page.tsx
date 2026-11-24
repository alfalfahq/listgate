import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { renderWiki, wikiExcerpt } from "@listgate/db/wiki";
import { helpPages, helpResolver } from "@/lib/help";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const pages = await helpPages();
  const page = pages.find((p) => p.slug === slug);
  return page ? { page, pages } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hit = await load(slug);
  if (!hit) return { title: "Help centre | Listgate" };
  const description = wikiExcerpt(hit.page.body, 160);
  return { title: `${hit.page.title} | Listgate help`, description, openGraph: { title: hit.page.title, description } };
}

export default async function HelpArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hit = await load(slug);
  if (!hit) notFound();
  const { page, pages } = hit;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const trail: typeof pages = [];
  for (let cur = page.parentId ? byId.get(page.parentId) : undefined; cur && trail.length < 20; cur = cur.parentId ? byId.get(cur.parentId) : undefined) trail.unshift(cur);
  const children = pages.filter((p) => p.parentId === page.id);
  const { html, headings } = renderWiki(page.body, helpResolver(pages), { markMissing: false });
  const toc = headings.filter((h) => h.depth >= 2 && h.depth <= 3);
  return (
    <article className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="min-w-0 max-w-3xl">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500" aria-label="Breadcrumb">
          <Link href="/help" className="hover:text-ink hover:underline">Help centre</Link>
          {trail.map((t) => (
            <span key={t.id} className="flex items-center gap-1"><span aria-hidden="true">/</span><Link href={`/help/${t.slug}`} className="hover:text-ink hover:underline">{t.title}</Link></span>
          ))}
        </nav>
        <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-navy">{page.emoji && <span className="mr-2">{page.emoji}</span>}{page.title}</h1>
        <p className="mt-2 text-sm text-slate-500">Updated {page.updatedAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>
        <div className="wiki-body mt-8" dangerouslySetInnerHTML={{ __html: html }} />
        {children.length > 0 && (
          <section className="mt-12 border-t border-slate-200 pt-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">In this section</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {children.map((c) => (
                <li key={c.id}><Link href={`/help/${c.slug}`} className="block rounded-xl border border-slate-200 px-4 py-3 font-medium text-navy hover:border-teal">{c.emoji} {c.title}</Link></li>
              ))}
            </ul>
          </section>
        )}
        <aside className="mt-12 rounded-2xl bg-sky p-5 text-sm text-slate-700">
          Still stuck? Open the <strong>Help</strong> tab in your editor and ask the team. We&apos;ll email you when we reply.
        </aside>
      </div>
      {toc.length >= 2 && (
        <aside className="hidden xl:block">
          <nav className="sticky top-6 text-sm" aria-label="On this page">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">On this page</p>
            <ul className="space-y-1.5 border-l border-slate-200">
              {toc.map((h) => (
                <li key={h.id} style={{ paddingLeft: `${(h.depth - 2) * 10 + 10}px` }}><a href={`#${h.id}`} className="text-slate-600 hover:text-teal">{h.text}</a></li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </article>
  );
}
