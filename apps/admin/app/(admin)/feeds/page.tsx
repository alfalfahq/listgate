import Link from "next/link";
import { desc, eq, isNotNull } from "drizzle-orm";
import { agencies, feedRuns, getDb } from "@listgate/db";
import { when } from "@/lib/format";
import { PageHeader, Pill, TableCard, Tabs } from "@/app/kit";

export const dynamic = "force-dynamic";

export default async function Feeds({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show = "all" } = await searchParams;
  const db = await getDb();
  const rows = await db
    .select({ r: feedRuns, name: agencies.name })
    .from(feedRuns)
    .leftJoin(agencies, eq(agencies.id, feedRuns.agencyId))
    .where(show === "errors" ? isNotNull(feedRuns.error) : undefined)
    .orderBy(desc(feedRuns.createdAt))
    .limit(300);
  return (
    <div className="space-y-6">
      <PageHeader icon="inbox" title="Feed log" sub="Every REAXML file received, by HTTP, FTP or upload (latest 300)." />
      <Tabs label="Show" current={show} tabs={[{ key: "all", label: "All", href: "/feeds" }, { key: "errors", label: "Errors", href: "/feeds?show=errors" }]} />
      <TableCard empty={rows.length ? false : "Nothing received yet."}>
        <thead><tr><th>When</th><th>Agency</th><th>Via</th><th>File</th><th>Size</th><th>Read</th><th>New</th><th>Changed</th><th>Same</th><th>Removed</th><th>Took</th><th>Result</th></tr></thead>
        <tbody>
          {rows.map(({ r, name }) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{when(r.createdAt)}</td>
              <td>{r.agencyId ? <Link href={`/agencies/${r.agencyId}`}>{name}</Link> : "—"}</td>
              <td className="uppercase text-zinc-500">{r.via}</td>
              <td className="max-w-[160px] truncate text-xs">{r.fileName ?? "—"}</td>
              <td className="text-xs">{(r.bytes / 1024).toFixed(0)} KB</td>
              <td>{r.received}</td>
              <td>{r.created}</td>
              <td>{r.updated}</td>
              <td>{r.unchanged}</td>
              <td>{r.removed}</td>
              <td className="text-xs text-zinc-500">{r.ms ?? "—"} ms</td>
              <td>{r.error ? <span className="text-sm text-rose-700">{r.error}</span> : <Pill tone="green">OK</Pill>}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
