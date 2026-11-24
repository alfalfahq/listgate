import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, wikiPages } from "@listgate/db";
import { wikiTree } from "@listgate/db/wiki";
import { requireAdmin } from "@/lib/auth";
import { descendantIds, publicSet, publicUrl, wikiRows } from "@/lib/wiki";
import { Editor } from "./editor";

export const dynamic = "force-dynamic";

export default async function EditWikiPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [p] = await db.select().from(wikiPages).where(eq(wikiPages.id, id));
  if (!p) notFound();
  const rows = await wikiRows();
  const blocked = descendantIds(rows, id);
  const parents: { id: string; title: string; depth: number }[] = [];
  const walk = (nodes: ReturnType<typeof wikiTree<(typeof rows)[number]>>, depth: number) => {
    for (const n of nodes) {
      if (blocked.has(n.id)) continue;
      parents.push({ id: n.id, title: n.title, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(wikiTree(rows), 0);
  const pub = publicSet(rows);
  const parentInternal = !!p.parentId && !pub.has(p.parentId);
  const isNew = p.version === 0;
  return (
    <Editor
      page={{ id: p.id, title: p.title, body: p.body, emoji: p.emoji, internal: isNew ? parentInternal : p.internal, labels: p.labels, parentId: p.parentId, version: p.version, isNew, publicUrl: publicUrl(p.slug) }}
      parents={parents}
      titles={rows.filter((r) => r.id !== id).map((r) => ({ title: r.title, slug: r.slug }))}
      parentInternal={parentInternal}
    />
  );
}
