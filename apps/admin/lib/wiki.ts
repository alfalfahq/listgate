// Wiki data for admin: the page list (for the tree, breadcrumbs and [[links]]) and the public address of a page.
import { asc, isNull } from "drizzle-orm";
import { getDb, wikiPages } from "@listgate/db";
import { publicPageIds } from "@listgate/db/wiki";
import { APP_URL } from "@/lib/format";

export type WikiRow = { id: string; parentId: string | null; title: string; slug: string; emoji: string | null; internal: boolean; sort: number; updatedAt: Date };

export async function wikiRows(): Promise<WikiRow[]> {
  const db = await getDb();
  return db
    .select({ id: wikiPages.id, parentId: wikiPages.parentId, title: wikiPages.title, slug: wikiPages.slug, emoji: wikiPages.emoji, internal: wikiPages.internal, sort: wikiPages.sort, updatedAt: wikiPages.updatedAt })
    .from(wikiPages)
    .where(isNull(wikiPages.archivedAt))
    .orderBy(asc(wikiPages.sort), asc(wikiPages.title));
}

/** Public address of a page on the help site. */
export const publicUrl = (slug: string) => `${APP_URL}/help/${slug}`;

/** Visible to the public: not internal and no internal parent. */
export const publicSet = (rows: WikiRow[]) => publicPageIds(rows);

/** Resolve a [[link]] by title or slug to its admin page. */
export function adminResolver(rows: WikiRow[]) {
  const byTitle = new Map(rows.map((r) => [r.title.toLowerCase(), r.id]));
  const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
  return (t: string) => {
    const id = byTitle.get(t.toLowerCase()) ?? bySlug.get(t.toLowerCase());
    return id ? `/wiki/${id}` : null;
  };
}

/** Parents from the top down. */
export function ancestors(rows: WikiRow[], id: string) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: WikiRow[] = [];
  let cur = byId.get(id)?.parentId;
  while (cur && out.length < 30) {
    const r = byId.get(cur);
    if (!r) break;
    out.unshift(r);
    cur = r.parentId;
  }
  return out;
}

/** The page and everything under it (so a page can't be moved inside itself). */
export function descendantIds(rows: WikiRow[], id: string) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) if (r.parentId && out.has(r.parentId) && !out.has(r.id)) {
      out.add(r.id);
      grew = true;
    }
  }
  return out;
}
