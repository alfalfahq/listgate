import Link from "next/link";
import { wikiExcerpt } from "@listgate/db/wiki";
import { helpPages, helpTree, searchHelp } from "@/lib/help";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help centre | Listgate", description: "Guides for agencies, CRMs and partners: sending a REAXML feed, choosing partners, and the partner API." };

export default async function HelpHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const pages = await helpPages();
  if (q.trim()) {
    const hits = searchHelp(pages, q.slice(0, 100));
    return (
      <>
        <h1 className="text-3xl font-bold text-navy">Search results</h1>
        <form action="/help" className="mt-4 flex max-w-xl gap-2">
          <input name="q" defaultValue={q} aria-label="Search help" className="field w-full" />
          <button className="btn-navy px-4">Search</button>
        </form>
        <p className="mt-5 text-sm text-slate-500">{hits.length} result{hits.length === 1 ? "" : "s"} for “{q}”</p>
        <ul className="mt-4 space-y-5">
          {hits.map((h) => (
            <li key={h.slug}>
              <Link href={`/help/${h.slug}`} className="text-lg font-semibold text-teal hover:underline">{h.emoji} {h.title}</Link>
              <p className="mt-0.5 text-sm text-slate-600">{h.snippet}</p>
            </li>
          ))}
        </ul>
        {!hits.length && <p className="mt-4 text-slate-600">Nothing matched. Try other words, or ask us from the Help tab in your editor.</p>}
      </>
    );
  }
  const roots = helpTree(pages);
  return (
    <>
      <h1 className="text-4xl font-bold tracking-tight text-navy">How can we help?</h1>
      <p className="mt-2 text-lg text-slate-600">Sending your feed, choosing partners, and the partner API.</p>
      <form action="/help" className="mt-6 flex max-w-xl gap-2">
        <input name="q" aria-label="Search help" placeholder="e.g. connect my domain" className="field w-full" />
        <button className="btn-navy px-5">Search</button>
      </form>
      {roots.length ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {roots.map((r) => (
            <section key={r.id} className="rounded-2xl border border-slate-200 p-5">
              <Link href={`/help/${r.slug}`} className="flex items-center gap-2 text-lg font-semibold text-navy hover:underline">
                <span aria-hidden="true">{r.emoji ?? "📘"}</span>
                {r.title}
              </Link>
              {r.children.length ? (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {r.children.slice(0, 6).map((c) => (
                    <li key={c.id}><Link href={`/help/${c.slug}`} className="text-teal hover:underline">{c.title}</Link></li>
                  ))}
                  {r.children.length > 6 && <li><Link href={`/help/${r.slug}`} className="text-slate-500 hover:underline">{r.children.length - 6} more</Link></li>}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-600">{wikiExcerpt(r.body, 140)}</p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-10 rounded-2xl bg-sky p-8 text-center text-slate-700">Guides are on their way. In the meantime, ask us anything from the Help tab in your editor.</p>
      )}
    </>
  );
}
