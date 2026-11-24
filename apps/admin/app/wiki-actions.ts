"use server";
// Wiki: create, edit (every save is a version), move, archive, restore, comments. Admins only.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, ne } from "drizzle-orm";
import { auditLog, getDb, wikiComments, wikiPageVersions, wikiPages } from "@listgate/db";
import { slugify } from "@listgate/db/wiki";
import { requireAdmin } from "@/lib/auth";
import { descendantIds, wikiRows } from "@/lib/wiki";

const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (f: FormData, k: string, max = 200_000) => String(f.get(k) ?? "").slice(0, max);
const labelsOf = (s: string) => [...new Set(s.split(/[,\n]/).map((x) => x.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 30)).filter(Boolean))].slice(0, 12);
const done = () => {
  revalidatePath("/wiki", "layout");
};

async function uniqueSlug(base: string, notId?: string) {
  const db = await getDb();
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const s = i ? `${root}-${i + 1}` : root;
    const [hit] = await db.select({ id: wikiPages.id }).from(wikiPages).where(notId ? and(eq(wikiPages.slug, s), ne(wikiPages.id, notId)) : eq(wikiPages.slug, s));
    if (!hit) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** "+ Create": a blank page (under a parent if given), straight into the editor. New pages start internal until published. */
export async function createPage(f: FormData) {
  const me = await requireAdmin();
  const parentId = uuid(str(f, "parentId"));
  const db = await getDb();
  const [parent] = parentId ? await db.select({ internal: wikiPages.internal }).from(wikiPages).where(eq(wikiPages.id, parentId)) : [];
  const [p] = await db
    .insert(wikiPages)
    .values({ parentId: parent ? parentId : null, title: "Untitled page", slug: await uniqueSlug(`untitled-${Date.now().toString(36)}`), body: "", internal: true, version: 0, ownerId: me.id, updatedById: me.id, sort: Date.now() / 1e6 })
    .returning();
  done();
  redirect(`/wiki/${p.id}/edit?new=1`);
}

export type SaveState = { error?: string } | undefined;

/** Publish from the editor. Refuses if someone else saved since you opened it, so nobody's work is overwritten. */
export async function savePage(_: SaveState, f: FormData): Promise<SaveState> {
  const me = await requireAdmin();
  const id = uuid(str(f, "id"));
  if (!id) return { error: "That page no longer exists." };
  const db = await getDb();
  const [p] = await db.select().from(wikiPages).where(eq(wikiPages.id, id));
  if (!p) return { error: "That page no longer exists." };
  const title = str(f, "title", 200).trim() || "Untitled page";
  const body = str(f, "body").replace(/\r\n/g, "\n");
  const base = Number(str(f, "baseVersion"));
  if (Number.isFinite(base) && base !== p.version)
    return { error: `Someone saved this page while you were editing (now version ${p.version}). Copy your changes, reload, and add them again.` };
  const rows = await wikiRows();
  let parentId = uuid(str(f, "parentId"));
  if (parentId && (descendantIds(rows, id).has(parentId) || !rows.some((r) => r.id === parentId))) parentId = p.parentId;
  const internal = f.get("internal") === "on";
  const emoji = [...str(f, "emoji", 16).trim()].slice(0, 2).join("") || null;
  // The address is set from the title the first time it's published, then kept so links don't break.
  const slug = p.version === 0 || p.slug.startsWith("untitled-") ? await uniqueSlug(title, id) : p.slug;
  const version = p.version + 1;
  const changed = title !== p.title || body !== p.body;
  await db
    .update(wikiPages)
    .set({ title, body, emoji, internal, parentId, slug, labels: labelsOf(str(f, "labels", 500)), version: changed || p.version === 0 ? version : p.version, updatedById: me.id, updatedAt: new Date() })
    .where(eq(wikiPages.id, id));
  if (changed || p.version === 0)
    await db.insert(wikiPageVersions).values({ pageId: id, version, title, body, note: str(f, "note", 200).trim() || null, authorId: me.id, authorName: me.name });
  await db.insert(auditLog).values({ actorUserId: me.id, actorLabel: me.name, action: p.version === 0 ? "wiki.created" : "wiki.updated", entityType: "wiki_page", entityId: id, data: { title, version, internal } });
  done();
  redirect(`/wiki/${id}`);
}

/** Leaving a brand-new page without publishing throws it away. */
export async function discardDraft(id: string) {
  await requireAdmin();
  if (!uuid(id)) return;
  const db = await getDb();
  await db.delete(wikiPages).where(and(eq(wikiPages.id, id), eq(wikiPages.version, 0)));
  done();
}

/** Archive (Confluence's delete): hidden from the tree and the public site, children too. Restorable. */
export async function archivePage(f: FormData) {
  const me = await requireAdmin();
  const id = uuid(str(f, "id"));
  if (!id) return;
  const db = await getDb();
  const ids = [...descendantIds(await wikiRows(), id)];
  await db.update(wikiPages).set({ archivedAt: new Date() }).where(inArray(wikiPages.id, ids));
  await db.insert(auditLog).values({ actorUserId: me.id, actorLabel: me.name, action: "wiki.archived", entityType: "wiki_page", entityId: id, data: { pages: ids.length } });
  done();
  redirect("/wiki");
}

export async function unarchivePage(f: FormData) {
  const me = await requireAdmin();
  const id = uuid(str(f, "id"));
  if (!id) return;
  const db = await getDb();
  await db.update(wikiPages).set({ archivedAt: null }).where(eq(wikiPages.id, id));
  await db.insert(auditLog).values({ actorUserId: me.id, actorLabel: me.name, action: "wiki.restored", entityType: "wiki_page", entityId: id, data: {} });
  done();
  redirect(`/wiki/${id}`);
}

/** Bring back an old version as a new one (history is never rewritten). */
export async function restoreVersion(f: FormData) {
  const me = await requireAdmin();
  const id = uuid(str(f, "id"));
  const v = Number(str(f, "version"));
  if (!id || !Number.isInteger(v)) return;
  const db = await getDb();
  const [[p], [old]] = await Promise.all([
    db.select().from(wikiPages).where(eq(wikiPages.id, id)),
    db.select().from(wikiPageVersions).where(and(eq(wikiPageVersions.pageId, id), eq(wikiPageVersions.version, v))),
  ]);
  if (!p || !old) return;
  const version = p.version + 1;
  await db.update(wikiPages).set({ title: old.title, body: old.body, version, updatedById: me.id, updatedAt: new Date() }).where(eq(wikiPages.id, id));
  await db.insert(wikiPageVersions).values({ pageId: id, version, title: old.title, body: old.body, note: `Restored version ${v}`, authorId: me.id, authorName: me.name });
  await db.insert(auditLog).values({ actorUserId: me.id, actorLabel: me.name, action: "wiki.updated", entityType: "wiki_page", entityId: id, data: { title: old.title, version, restored: v } });
  done();
  redirect(`/wiki/${id}`);
}

/** Public ↔ internal from the page itself. */
export async function setVisibility(f: FormData) {
  const me = await requireAdmin();
  const id = uuid(str(f, "id"));
  if (!id) return;
  const internal = str(f, "internal") === "1";
  const db = await getDb();
  await db.update(wikiPages).set({ internal }).where(eq(wikiPages.id, id));
  await db.insert(auditLog).values({ actorUserId: me.id, actorLabel: me.name, action: internal ? "wiki.made_internal" : "wiki.made_public", entityType: "wiki_page", entityId: id, data: {} });
  done();
}

export async function addComment(f: FormData) {
  const me = await requireAdmin();
  const id = uuid(str(f, "id"));
  const body = str(f, "body", 8000).trim();
  if (!id || !body) return;
  const db = await getDb();
  await db.insert(wikiComments).values({ pageId: id, authorId: me.id, authorName: me.name, body });
  done();
}

export async function resolveComment(f: FormData) {
  await requireAdmin();
  const id = uuid(str(f, "commentId"));
  if (!id) return;
  const db = await getDb();
  const [c] = await db.select({ r: wikiComments.resolvedAt }).from(wikiComments).where(eq(wikiComments.id, id));
  await db.update(wikiComments).set({ resolvedAt: c?.r ? null : new Date() }).where(eq(wikiComments.id, id));
  done();
}
