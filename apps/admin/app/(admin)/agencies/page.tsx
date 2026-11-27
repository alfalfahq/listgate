import Link from "next/link";
import { and, asc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { agencies, getDb } from "@listgate/db";
import { ago, num } from "@/lib/format";
import { AgencyMark, PageHeader, Pill, SearchBox, TableCard } from "@/app/kit";

export const dynamic = "force-dynamic";

export default async function Agencies({ searchParams }: { searchParams: Promise<{ q?: string; crm?: string }> }) {
  const { q, crm } = await searchParams;
  const db = await getDb();
  const crms = await db.selectDistinct({ crm: agencies.crm }).from(agencies).where(isNotNull(agencies.crm)).orderBy(asc(agencies.crm));
  const rows = await db
    .select({
      a: agencies,
      live: sql<number>`(select count(*)::int from listings l where l.agency_id = "agencies"."id" and l.removed_at is null)`,
      partners: sql<string[]>`coalesce((select array_agg(p.name order by p.sort) from agency_partners ap join partners p on p.id = ap.partner_id where ap.agency_id = "agencies"."id" and ap.enabled), '{}')`,
      lastError: sql<string | null>`(select fr.error from feed_runs fr where fr.agency_id = "agencies"."id" order by fr.created_at desc limit 1)`,
    })
    .from(agencies)
    .where(and(q ? or(ilike(agencies.name, `%${q}%`), ilike(agencies.slug, `%${q}%`), ilike(agencies.suburb, `%${q}%`), ilike(agencies.crm, `%${q}%`), ilike(agencies.reaxmlAgentId, `%${q}%`)) : undefined, crm ? eq(agencies.crm, crm) : undefined))
    .orderBy(asc(agencies.name));
  return (
    <div className="space-y-6">
      <PageHeader icon="building" title="Agencies" sub={`${rows.length} agenc${rows.length === 1 ? "y" : "ies"} sending feeds`} actions={<Link href="/agencies/new" className="btn-primary">Add agency</Link>} />
      <SearchBox action="/agencies" q={q} placeholder="Name, suburb or agent ID">
        <select name="crm" defaultValue={crm ?? ""} aria-label="CRM" className="input w-48">
          <option value="">All CRMs</option>
          {crms.map((c) => <option key={c.crm} value={c.crm!}>{c.crm}</option>)}
        </select>
      </SearchBox>
      <TableCard empty={rows.length ? false : q || crm ? "No matches." : "No agencies yet. Add the first one."}>
        <thead><tr><th>Agency</th><th>CRM</th><th>Live</th><th>Sends to</th><th>Last feed</th><th></th></tr></thead>
        <tbody>
          {rows.map(({ a, live, partners, lastError }) => (
            <tr key={a.id}>
              <td>
                <Link href={`/agencies/${a.id}`} className="flex items-center gap-2.5 font-semibold">
                  <AgencyMark name={a.name} />
                  <span>{a.name}<span className="block text-xs font-normal text-zinc-500">{[a.suburb, a.state].filter(Boolean).join(" ") || a.slug}</span></span>
                </Link>
              </td>
              <td>{a.crm ?? "—"}{a.sourceId && <span className="block text-xs text-zinc-500">CRM feed · ID {a.reaxmlAgentId}</span>}</td>
              <td>{num(live)}</td>
              <td className="text-sm">{partners.length ? partners.join(", ") : <span className="text-zinc-400">Nobody yet</span>}</td>
              <td className="text-zinc-500">{a.lastFeedAt ? ago(a.lastFeedAt) : "Never"}</td>
              <td>{a.suspendedAt ? <Pill tone="red">Suspended</Pill> : lastError ? <Pill tone="amber">Feed error</Pill> : !a.authorisedAt ? <Pill>{a.sourceId ? "Agent unlocks only" : "Not authorised"}</Pill> : null}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
