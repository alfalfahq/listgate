// Public help pages: the wiki pages the team hasn't marked internal (nor any page above them).
import { asc, isNull } from "drizzle-orm";
import { getDb, wikiPages } from "@listgate/db";
import { publicPageIds, wikiExcerpt, wikiTree } from "@listgate/db/wiki";

export type HelpPage = { id: string; parentId: string | null; title: string; slug: string; emoji: string | null; body: string; labels: string[]; sort: number; updatedAt: Date; internal: boolean };

export async function helpPages(): Promise<HelpPage[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: wikiPages.id, parentId: wikiPages.parentId, title: wikiPages.title, slug: wikiPages.slug, emoji: wikiPages.emoji, body: wikiPages.body, labels: wikiPages.labels, sort: wikiPages.sort, updatedAt: wikiPages.updatedAt, internal: wikiPages.internal, version: wikiPages.version })
    .from(wikiPages)
    .where(isNull(wikiPages.archivedAt))
    .orderBy(asc(wikiPages.sort), asc(wikiPages.title));
  // Unpublished drafts (version 0) are never public.
  const live = rows.filter((r) => r.version > 0).map((r) => ({ ...r, internal: r.internal }));
  const ok = publicPageIds([...live, ...rows.filter((r) => r.version === 0).map((r) => ({ ...r, internal: true }))]);
  return live.filter((r) => ok.has(r.id));
}

export function helpTree(pages: HelpPage[]) {
  return wikiTree(pages);
}

/** [[links]] to public pages only; links to internal pages render as plain text. */
export function helpResolver(pages: HelpPage[]) {
  const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p.slug]));
  const bySlug = new Set(pages.map((p) => p.slug));
  return (t: string) => {
    const s = byTitle.get(t.toLowerCase()) ?? (bySlug.has(t.toLowerCase()) ? t.toLowerCase() : null);
    return s ? `/help/${s}` : null;
  };
}

/** Simple ranked search: title matches first, then labels, then body. */
export function searchHelp(pages: HelpPage[], q: string, limit = 20) {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 8);
  if (!words.length) return [];
  return pages
    .map((p) => {
      const title = p.title.toLowerCase();
      const body = wikiExcerpt(p.body, 100_000).toLowerCase();
      let score = 0;
      for (const w of words) {
        if (title.includes(w)) score += 5;
        if (p.labels.some((l) => l.includes(w))) score += 3;
        if (body.includes(w)) score += 1;
      }
      return { p, score, body };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.title.localeCompare(b.p.title))
    .slice(0, limit)
    .map(({ p, body }) => {
      const at = body.indexOf(words[0]);
      const plain = wikiExcerpt(p.body, 100_000);
      const snippet = at > 60 ? `…${plain.slice(at - 60, at + 140)}…` : wikiExcerpt(p.body, 200);
      return { title: p.title, slug: p.slug, emoji: p.emoji, snippet };
    });
}
