import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, users, wikiComments, wikiPages } from "@listgate/db";
import { WIKI_CSS, renderWiki } from "@listgate/db/wiki";
import { requireAdmin } from "@/lib/auth";
import { ago } from "@/lib/format";
import { adminResolver, ancestors, publicSet, publicUrl, wikiRows } from "@/lib/wiki";
import { addComment, archivePage, createPage, resolveComment, setVisibility, unarchivePage } from "@/app/wiki-actions";
import { ResetForm } from "@/app/crm-client";
import { UserAvatar } from "../../tickets/ui";
import { CopyLink, EditShortcut } from "./client";

export const dynamic = "force-dynamic";

export default async function WikiPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [p] = await db.select().from(wikiPages).where(eq(wikiPages.id, id));
  if (!p) notFound();
  const rows = await wikiRows();
  const people = [p.ownerId, p.updatedById].filter(Boolean) as string[];
  const [names, comments] = await Promise.all([
    people.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, people)) : Promise.resolve([] as { id: string; name: string }[]),
    db.select().from(wikiComments).where(eq(wikiComments.pageId, id)).orderBy(asc(wikiComments.createdAt)),
  ]);
  const owner = names.find((n) => n.id === p.ownerId)?.name;
  const editor = names.find((n) => n.id === p.updatedById)?.name;
  const trail = ancestors(rows, id);
  const isPublic = publicSet(rows).has(id);
  const hiddenByParent = !p.internal && !isPublic && !p.archivedAt;
  const children = rows.filter((r) => r.parentId === id);
  const { html, headings } = renderWiki(p.body, adminResolver(rows));
  const toc = headings.filter((h) => h.depth <= 3);
  const open = comments.filter((c) => !c.resolvedAt);
  const resolved = comments.filter((c) => c.resolvedAt);

  return (
    <article>
      <style dangerouslySetInnerHTML={{ __html: WIKI_CSS }} />
      <EditShortcut href={`/wiki/${p.id}/edit`} />
      {p.archivedAt && (
        <form action={unarchivePage} className="mb-4 flex items-center gap-3 rounded-[3px] bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <input type="hidden" name="id" value={p.id} />
          This page is archived {ago(p.archivedAt)}. Nobody else can see it.
          <button className="ml-auto font-semibold underline">Restore</button>
        </form>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm text-zinc-500" aria-label="Breadcrumb">
          <Link href="/wiki" className="hover:text-ink hover:underline">Knowledge base</Link>
          {trail.map((a) => (
            <span key={a.id} className="flex items-center gap-1">
              <span aria-hidden="true">/</span>
              <Link href={`/wiki/${a.id}`} className="max-w-[16rem] truncate hover:text-ink hover:underline">{a.title}</Link>
            </span>
          ))}
        </nav>
        <Link href={`/wiki/${p.id}/edit`} className="btn-primary min-h-[34px] rounded-[3px] px-4" title="Edit (e)">Edit</Link>
        <form action={createPage}>
          <input type="hidden" name="parentId" value={p.id} />
          <button className="btn-secondary min-h-[34px] rounded-[3px]" title="Create a page under this one">+ Child page</button>
        </form>
        <Link href={`/wiki/${p.id}/history`} className="btn-secondary min-h-[34px] rounded-[3px]">History</Link>
        <CopyLink url={isPublic ? publicUrl(p.slug) : null} />
      </div>

      <div className="mt-6 grid gap-10 xl:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 max-w-[52rem]">
          <h1 className="text-3xl font-bold leading-tight text-navy">
            {p.emoji && <span className="mr-2">{p.emoji}</span>}
            {p.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
            <span className="flex items-center gap-1.5"><UserAvatar name={owner ?? editor ?? null} size={22} />Owned by {owner ?? "someone"}</span>
            <span>·</span>
            <span>Last updated {ago(p.updatedAt)}{editor ? ` by ${editor}` : ""}</span>
            <span>·</span>
            <Link href={`/wiki/${p.id}/history`} className="hover:underline">v{Math.max(1, p.version)}</Link>
            {isPublic ? (
              <a href={publicUrl(p.slug)} target="_blank" rel="noreferrer" className="rounded-[3px] bg-emerald-100 px-1.5 py-px text-[11px] font-bold uppercase tracking-wide text-emerald-800 hover:underline" title="Anyone can read this on the help site">Public</a>
            ) : (
              <span className="rounded-[3px] bg-amber-100 px-1.5 py-px text-[11px] font-bold uppercase tracking-wide text-amber-800" title={hiddenByParent ? "A page above this one is internal, so this one is too" : "Only the team can see this"}>
                Internal{hiddenByParent ? " (from parent)" : ""}
              </span>
            )}
            {!p.archivedAt && !hiddenByParent && (
              <form action={setVisibility}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="internal" value={p.internal ? "0" : "1"} />
                <button className="text-xs font-medium text-teal hover:underline">{p.internal ? "Make public" : "Make internal"}</button>
              </form>
            )}
          </div>
          {p.labels.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-1">
              {p.labels.map((l) => <Link key={l} href={`/wiki?q=${encodeURIComponent(l)}`} className="rounded-[3px] bg-zinc-100 px-1.5 py-px text-xs font-medium text-zinc-700 hover:bg-zinc-200">{l}</Link>)}
            </p>
          )}

          <div className="mt-8">
            {p.body.trim() ? (
              <div className="wiki-body" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <p className="text-zinc-400">This page is empty. <Link href={`/wiki/${p.id}/edit`} className="text-teal underline">Start writing</Link>.</p>
            )}
          </div>

          {children.length > 0 && (
            <section className="mt-12 border-t border-zinc-200 pt-6">
              <h2 className="card-title mb-3">Child pages</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {children.map((c) => (
                  <li key={c.id}>
                    <Link href={`/wiki/${c.id}`} className="flex items-center gap-2 rounded-[3px] border border-zinc-200 bg-white px-3 py-2 text-sm hover:border-teal">
                      <span>{c.emoji ?? "📄"}</span><span className="min-w-0 flex-1 truncate font-medium text-ink">{c.title}</span>
                      {c.internal && <span className="text-[10px] font-semibold uppercase text-amber-700">Int</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-12 border-t border-zinc-200 pt-6" aria-labelledby="comments-h">
            <h2 id="comments-h" className="mb-4 text-sm font-semibold text-ink">Team comments {open.length > 0 && <span className="text-zinc-400">· {open.length}</span>}</h2>
            <ul className="space-y-4">
              {open.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <UserAvatar name={c.authorName} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm"><strong className="text-ink">{c.authorName}</strong> <span className="text-zinc-400">{ago(c.createdAt)}</span></p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-800">{c.body}</p>
                    <form action={resolveComment}><input type="hidden" name="commentId" value={c.id} /><button className="mt-1 text-xs font-medium text-zinc-500 hover:text-teal hover:underline">Resolve</button></form>
                  </div>
                </li>
              ))}
            </ul>
            {resolved.length > 0 && <p className="mt-3 text-xs text-zinc-400">{resolved.length} resolved comment{resolved.length === 1 ? "" : "s"} hidden.</p>}
            <ResetForm action={addComment} className="mt-4 flex gap-3">
              <input type="hidden" name="id" value={p.id} />
              <span className="h-[30px] w-[30px] shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <textarea name="body" required rows={2} placeholder="Add a comment for the team (never shown on the help site)" className="input w-full rounded-[3px]" />
                <button className="btn-secondary mt-2 min-h-[30px] rounded-[3px] px-3">Comment</button>
              </div>
            </ResetForm>
          </section>

          {!p.archivedAt && (
            <form action={archivePage} className="mt-10">
              <input type="hidden" name="id" value={p.id} />
              <button className="text-xs font-medium text-zinc-400 hover:text-rose-700 hover:underline">Archive this page{children.length ? ` and its ${children.length} child page${children.length === 1 ? "" : "s"}` : ""}</button>
            </form>
          )}
        </div>

        {toc.length >= 2 && (
          <aside className="hidden xl:block">
            <nav className="sticky top-6 text-sm" aria-label="On this page">
              <p className="card-title mb-2">On this page</p>
              <ul className="space-y-1 border-l border-zinc-200">
                {toc.map((h) => (
                  <li key={h.id} style={{ paddingLeft: `${(h.depth - 1) * 10 + 10}px` }}>
                    <a href={`#${h.id}`} className="block truncate text-zinc-600 hover:text-teal">{h.text}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </article>
  );
}
