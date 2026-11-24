"use server";
// Admin project to-do list: add, tick off, edit and delete tasks for running Listgate itself.
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb, projectTasks } from "@listgate/db";
import { requireAdmin } from "@/lib/auth";

const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);
const uuidOrNull = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);
const urlOrNull = (v: string) => (/^https?:\/\/\S+$/i.test(v) ? v : null);
const done = () => revalidatePath("/project");

export async function addProjectTask(f: FormData) {
  await requireAdmin();
  const title = str(f, "title", 300);
  if (!title) return;
  const db = await getDb();
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${projectTasks.sort}), 0)::int` }).from(projectTasks);
  await db.insert(projectTasks).values({
    title,
    section: str(f, "section", 60) || "General",
    note: str(f, "note", 2000) || null,
    link: urlOrNull(str(f, "link", 1000)),
    sort: max + 10,
  });
  done();
}

export async function updateProjectTask(f: FormData) {
  await requireAdmin();
  const id = uuidOrNull(str(f, "id"));
  const title = str(f, "title", 300);
  if (!id || !title) return;
  const db = await getDb();
  await db
    .update(projectTasks)
    .set({ title, section: str(f, "section", 60) || "General", note: str(f, "note", 2000) || null, link: urlOrNull(str(f, "link", 1000)) })
    .where(eq(projectTasks.id, id));
  done();
}

export async function toggleProjectTask(f: FormData) {
  await requireAdmin();
  const id = uuidOrNull(str(f, "id"));
  if (!id) return;
  const db = await getDb();
  const [t] = await db.select({ doneAt: projectTasks.doneAt }).from(projectTasks).where(eq(projectTasks.id, id));
  if (t) await db.update(projectTasks).set({ doneAt: t.doneAt ? null : new Date() }).where(eq(projectTasks.id, id));
  done();
}

export async function deleteProjectTask(f: FormData) {
  await requireAdmin();
  const id = uuidOrNull(str(f, "id"));
  if (!id) return;
  const db = await getDb();
  await db.delete(projectTasks).where(eq(projectTasks.id, id));
  done();
}
