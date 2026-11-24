import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, wikiPageVersions, wikiPages } from "@listgate/db";
import { requireAdmin } from "@/lib/auth";
import { ago } from "@/lib/format";
import { restoreVersion } from "@/app/wiki-actions";
import { UserAvatar } from "../../../tickets/ui";

export const dynamic = "force-dynamic";

type Line = { kind: "same" | "add" | "del"; text: string };
/** Line diff (longest common subsequence). Big pages fall back to showing both versions whole. */
function diffLines(a: string, b: string): Line[] | null {
  const x = a.split("\n");
  const y = b.split("\n");
  if (x.length * y.length > 4_000_000) return null;
  const m = x.length;
  const n = y.length;
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) (out.push({ kind: "same", text: x[i] }), i++, j++);
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: x[i++] });
    else out.push({ kind: "add", text: y[j++] });
  }
  while (i < m) out.push({ kind: "del", text: x[i++] });
  while (j < n) out.push({ kind: "add", text: y[j++] });
  return out;
}

export default async function WikiHistory({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { v } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [p] = await db.select().from(wikiPages).where(eq(wikiPages.id, id));
  if (!p) notFound();
  const versions = await db.select().from(wikiPageVersions).where(eq(wikiPageVersions.pageId, id)).orderBy(desc(wikiPageVersions.version));
  const pick = versions.find((x) => x.version === Number(v)) ?? versions[0];
  const prev = pick ? versions.find((x) => x.version === pick.version - 1) : undefined;
  const diff = pick ? diffLines(prev?.body ?? "", pick.body) : null;
  const added = diff?.filter((d) => d.kind === "add").length ?? 0;
  const removed = diff?.filter((d) => d.kind === "del").length ?? 0;

  return (
    <>
      <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
        <Link href={`/wiki/${p.id}`} className="hover:text-ink hover:underline">{p.title}</Link> <span aria-hidden="true">/</span> History
      </nav>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Page history</h1>
      <div className="mt-5 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <ol className="divide-y divide-zinc-100 self-start rounded-[3px] border border-zinc-200 bg-white">
          {versions.map((x) => (
            <li key={x.id}>
              <Link href={`/wiki/${p.id}/history?v=${x.version}`} aria-current={pick?.version === x.version ? "true" : undefined} className={`flex gap-2.5 px-3 py-2.5 ${pick?.version === x.version ? "bg-cyan/10" : "hover:bg-zinc-50"}`}>
                <UserAvatar name={x.authorName} size={26} />
                <span className="min-w-0 text-sm">
                  <span className="block font-semibold text-ink">v{x.version}{x.version === p.version ? <span className="ml-1.5 rounded-[3px] bg-emerald-100 px-1 text-[10px] font-bold uppercase text-emerald-800">Current</span> : null}</span>
                  <span className="block truncate text-xs text-zinc-500">{x.authorName} · {ago(x.createdAt)}</span>
                  {x.note && <span className="block truncate text-xs text-zinc-600">{x.note}</span>}
                </span>
              </Link>
            </li>
          ))}
          {!versions.length && <li className="px-3 py-6 text-center text-sm text-zinc-500">Not published yet.</li>}
        </ol>

        {pick && (
          <section className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-ink">Version {pick.version}{prev ? ` compared with ${prev.version}` : " (first version)"}</h2>
              <span className="text-sm"><span className="text-emerald-700">+{added}</span> <span className="text-rose-700">−{removed}</span> lines</span>
              {pick.version !== p.version && (
                <form action={restoreVersion} className="ml-auto">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="version" value={pick.version} />
                  <button className="btn-secondary min-h-[32px] rounded-[3px]">Restore this version</button>
                </form>
              )}
            </div>
            {prev && prev.title !== pick.title && (
              <p className="mt-2 text-sm">Title: <del className="bg-rose-50 text-rose-800">{prev.title}</del> <ins className="bg-emerald-50 text-emerald-800 no-underline">{pick.title}</ins></p>
            )}
            <div className="mt-3 overflow-x-auto rounded-[3px] border border-zinc-200 bg-white font-mono text-[12.5px] leading-relaxed">
              {diff ? (
                diff.map((d, i) => (
                  <div key={i} className={`whitespace-pre-wrap px-3 ${d.kind === "add" ? "bg-emerald-50 text-emerald-900" : d.kind === "del" ? "bg-rose-50 text-rose-900 line-through decoration-rose-300" : "text-zinc-600"}`}>
                    <span className="mr-3 inline-block w-3 select-none text-zinc-400">{d.kind === "add" ? "+" : d.kind === "del" ? "−" : " "}</span>
                    {d.text || " "}
                  </div>
                ))
              ) : (
                <pre className="whitespace-pre-wrap p-3">{pick.body}</pre>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
