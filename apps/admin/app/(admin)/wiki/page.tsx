import Link from "next/link";
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb, users, wikiPages } from "@listgate/db";
import { wikiExcerpt } from "@listgate/db/wiki";
import { requireAdmin } from "@/lib/auth";
import { ago } from "@/lib/format";
import { publicSet, wikiRows } from "@/lib/wiki";
import { createPage, unarchivePage } from "@/app/wiki-actions";
import { UserAvatar } from "../tickets/ui";

export const dynamic = "force-dynamic";

export default async function WikiHome({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const db = await getDb();
  const rows = await wikiRows();
  const pub = publicSet(rows);

  if (sp.archived) {
    const archived = await db.select().from(wikiPages).where(isNotNull(wikiPages.archivedAt)).orderBy(desc(wikiPages.archivedAt)).limit(200);
    return (
      <>
        <h1 className="text-2xl font-semibold text-ink">Archived pages</h1>
        <p className="mt-1 text-sm text-zinc-500">Hidden from the tree and the public help site. Restore puts a page back where it was.</p>
        <ul className="mt-5 divide-y divide-zinc-100 rounded-[3px] border border-zinc-200 bg-white">
          {archived.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.emoji} {p.title}</span>
              <span className="text-zinc-500">archived {ago(p.archivedAt)}</span>
              <form action={unarchivePage}><input type="hidden" name="id" value={p.id} /><button className="btn-secondary min-h-[30px] rounded-[3px] px-3">Restore</button></form>
            </li>
          ))}
          {!archived.length && <li className="px-4 py-8 text-center text-sm text-zinc-500">Nothing archived.</li>}
        </ul>
      </>
    );
  }

  if (q) {
    const hits = await db
      .select({ id: wikiPages.id, title: wikiPages.title, emoji: wikiPages.emoji, body: wikiPages.body, updatedAt: wikiPages.updatedAt })
      .from(wikiPages)
      .where(and(isNull(wikiPages.archivedAt), or(ilike(wikiPages.title, `%${q}%`), ilike(wikiPages.body, `%${q}%`), sql`${q.toLowerCase()} = any(${wikiPages.labels})`)))
      .orderBy(sql`case when ${wikiPages.title} ilike ${`%${q}%`} then 0 else 1 end`, desc(wikiPages.updatedAt))
      .limit(50);
    return (
      <>
        <h1 className="text-2xl font-semibold text-ink">Search</h1>
        <form action="/wiki" className="mt-3 flex max-w-xl gap-2">
          <input name="q" defaultValue={q} aria-label="Search the wiki" className="input w-full rounded-[3px]" />
          <button className="btn-secondary rounded-[3px]">Search</button>
        </form>
        <p className="mt-4 text-sm text-zinc-500">{hits.length} result{hits.length === 1 ? "" : "s"} for “{q}”</p>
        <ul className="mt-3 space-y-4">
          {hits.map((h) => {
            const text = wikiExcerpt(h.body, 100000);
            const at = text.toLowerCase().indexOf(q.toLowerCase());
            const snip = at > 60 ? `…${text.slice(at - 60, at + 160)}…` : text.slice(0, 220);
            return (
              <li key={h.id}>
                <Link href={`/wiki/${h.id}`} className="text-base font-semibold text-teal hover:underline">{h.emoji} {h.title}</Link>
                <p className="mt-0.5 text-sm text-zinc-600">{snip || <span className="text-zinc-400">Empty page</span>}</p>
                <p className="text-xs text-zinc-400">Updated {ago(h.updatedAt)}{pub.has(h.id) ? " · Public" : " · Internal"}</p>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  const recent = await db
    .select({ id: wikiPages.id, title: wikiPages.title, emoji: wikiPages.emoji, updatedAt: wikiPages.updatedAt, version: wikiPages.version, by: users.name })
    .from(wikiPages)
    .leftJoin(users, eq(users.id, wikiPages.updatedById))
    .where(isNull(wikiPages.archivedAt))
    .orderBy(desc(wikiPages.updatedAt))
    .limit(12);
  const roots = rows.filter((r) => !r.parentId);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Knowledge base</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            The team writes here. Pages are public on the help site for customers unless they (or a page above them) are marked <strong>Internal</strong>.
          </p>
        </div>
        <form action={createPage}><button className="btn-primary">Create page</button></form>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[3px] border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">Pages</p><p className="text-2xl font-semibold">{rows.length}</p></div>
        <div className="rounded-[3px] border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">Public on the help site</p><p className="text-2xl font-semibold">{pub.size}</p></div>
        <div className="rounded-[3px] border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">Internal</p><p className="text-2xl font-semibold">{rows.length - pub.size}</p></div>
      </div>

      {roots.length > 0 && (
        <section className="mt-8">
          <h2 className="card-title mb-3">Start here</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {roots.map((r) => (
              <Link key={r.id} href={`/wiki/${r.id}`} className="rounded-[3px] border border-zinc-200 bg-white p-4 hover:border-teal">
                <p className="text-2xl leading-none">{r.emoji ?? "📄"}</p>
                <p className="mt-2 font-semibold text-ink">{r.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{rows.filter((x) => x.parentId === r.id).length} child pages · {pub.has(r.id) ? "Public" : "Internal"}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="card-title mb-3">Recently updated</h2>
        {recent.length ? (
          <ul className="divide-y divide-zinc-100 rounded-[3px] border border-zinc-200 bg-white">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/wiki/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50">
                  <span className="w-5 text-center">{r.emoji ?? "📄"}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{r.title}</span>
                  {r.version === 0 && <span className="rounded-[3px] bg-zinc-100 px-1.5 text-[11px] font-semibold uppercase text-zinc-500">Draft</span>}
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500"><UserAvatar name={r.by} size={20} />{ago(r.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-[3px] border border-dashed border-zinc-300 p-8 text-center">
            <p className="font-semibold text-ink">No pages yet</p>
            <p className="mt-1 text-sm text-zinc-500">Start with something customers ask about, like connecting a domain.</p>
          </div>
        )}
        <p className="mt-3 text-xs"><Link href="/wiki?archived=1" className="text-zinc-500 hover:underline">Archived pages</Link></p>
      </section>
    </>
  );
}
