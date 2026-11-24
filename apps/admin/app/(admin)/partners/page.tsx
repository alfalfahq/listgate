import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { getDb, partners } from "@listgate/db";
import { ago } from "@/lib/format";
import { PageHeader, Pill, TableCard } from "@/app/kit";

export const dynamic = "force-dynamic";

export default async function Partners() {
  const db = await getDb();
  const rows = await db
    .select({
      p: partners,
      agencies: sql<number>`(select count(*)::int from agency_partners ap where ap.partner_id = "partners"."id" and ap.enabled)`,
      waiting: sql<number>`(select count(*)::int from deliveries d where d.partner_id = "partners"."id" and d.status in ('pending','failed'))`,
      dead: sql<number>`(select count(*)::int from deliveries d where d.partner_id = "partners"."id" and d.status = 'dead')`,
    })
    .from(partners)
    .orderBy(asc(partners.sort), asc(partners.name));
  return (
    <div className="space-y-6">
      <PageHeader icon="network" title="Partners" sub="Products that receive listings. Agencies choose which ones get theirs." actions={<Link href="/partners/new" className="btn-primary">Add partner</Link>} />
      <TableCard empty={rows.length ? false : "No partners yet."}>
        <thead><tr><th>Partner</th><th>Mode</th><th>Takes</th><th>Agencies</th><th>Waiting</th><th>Gave up</th><th>Last success</th><th>Last error</th></tr></thead>
        <tbody>
          {rows.map(({ p, agencies, waiting, dead }) => (
            <tr key={p.id}>
              <td><Link href={`/partners/${p.id}`} className="font-semibold">{p.name}</Link><span className="block text-xs text-zinc-500">{p.slug}{p.listed ? "" : " · hidden from agencies"}</span></td>
              <td>{!p.active ? <Pill>Paused</Pill> : p.webhookUrl ? <Pill tone="green">Push</Pill> : <Pill tone="sky">Pull</Pill>}{p.apiKeyLast4 && <span className="ml-1 text-xs text-zinc-500">key …{p.apiKeyLast4}</span>}</td>
              <td className="text-xs">{p.kinds.length ? p.kinds.join(", ") : "sale, rent"}{p.includeSold ? " + results" : ""}{p.confidential ? " · confidential" : ""}</td>
              <td>{agencies}</td>
              <td>{waiting}</td>
              <td>{dead ? <Pill tone="red">{dead}</Pill> : 0}</td>
              <td className="text-zinc-500">{ago(p.lastSuccessAt)}</td>
              <td className="max-w-xs truncate text-xs text-rose-700">{p.lastFailureAt && (!p.lastSuccessAt || p.lastFailureAt > p.lastSuccessAt) ? p.lastError : ""}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
