import Link from "next/link";
import { and, count, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { agencies, auditLog, deliveries, feedRuns, getDb, listings, partners } from "@listgate/db";
import { actionLabel, ago, num } from "@/lib/format";
import { Avatar, Kpi, PageHeader, Pill, Section, TableCard } from "@/app/kit";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const db = await getDb();
  const day = new Date(Date.now() - 86_400_000);
  const [[ag], [live], [runs], [badRuns], queue, ps, recentRuns, activity] = await Promise.all([
    db.select({ n: count() }).from(agencies),
    db.select({ n: count() }).from(listings).where(isNull(listings.removedAt)),
    db.select({ n: count() }).from(feedRuns).where(gte(feedRuns.createdAt, day)),
    db.select({ n: count() }).from(feedRuns).where(and(gte(feedRuns.createdAt, day), isNotNull(feedRuns.error))),
    db.select({ status: deliveries.status, n: count() }).from(deliveries).groupBy(deliveries.status),
    db
      .select({
        p: partners,
        agencies: sql<number>`(select count(*)::int from agency_partners ap where ap.partner_id = "partners"."id" and ap.enabled)`,
        sent24: sql<number>`(select count(*)::int from deliveries d where d.partner_id = "partners"."id" and d.status = 'sent' and d.sent_at > now() - interval '1 day')`,
        waiting: sql<number>`(select count(*)::int from deliveries d where d.partner_id = "partners"."id" and d.status in ('pending','failed'))`,
        dead: sql<number>`(select count(*)::int from deliveries d where d.partner_id = "partners"."id" and d.status = 'dead')`,
      })
      .from(partners)
      .orderBy(partners.sort, partners.name),
    db.select({ r: feedRuns, name: agencies.name }).from(feedRuns).leftJoin(agencies, eq(agencies.id, feedRuns.agencyId)).orderBy(desc(feedRuns.createdAt)).limit(10),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(10),
  ]);
  const q = Object.fromEntries(queue.map((r) => [r.status, r.n])) as Record<string, number>;

  return (
    <div className="space-y-8">
      <PageHeader icon="home" title="Overview" sub="Feeds in, listings out." actions={<Link href="/agencies/new" className="btn-primary">Add agency</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Agencies" value={num(ag.n)} href="/agencies" icon="building" />
        <Kpi label="Live listings" value={num(live.n)} href="/listings" icon="home2" />
        <Kpi label="Feeds, last 24h" value={num(runs.n)} sub={badRuns.n ? `${badRuns.n} with errors` : "No errors"} href="/feeds" icon="inbox" />
        <Kpi label="Waiting to send" value={num((q.pending ?? 0) + (q.failed ?? 0))} sub={q.failed ? `${q.failed} retrying` : undefined} href="/deliveries" icon="repeat" />
        <Kpi label="Gave up" value={num(q.dead ?? 0)} sub="Retry from Deliveries" href="/deliveries?status=dead" icon="alert" />
      </div>

      <Section title="Partners" icon="network" action={<Link href="/partners/new" className="text-sm font-semibold text-teal">Add partner</Link>}>
        <TableCard empty={ps.length ? false : "No partners yet."}>
          <thead><tr><th>Partner</th><th>Status</th><th>Agencies</th><th>Sent 24h</th><th>Waiting</th><th>Gave up</th><th>Last success</th></tr></thead>
          <tbody>
            {ps.map(({ p, agencies: a, sent24, waiting, dead }) => (
              <tr key={p.id}>
                <td><Link href={`/partners/${p.id}`} className="font-semibold">{p.name}</Link></td>
                <td>{!p.active ? <Pill>Paused</Pill> : p.webhookUrl ? <Pill tone="green">Push</Pill> : <Pill tone="sky">Pull only</Pill>}</td>
                <td>{a}</td>
                <td>{sent24}</td>
                <td>{waiting}</td>
                <td>{dead ? <Pill tone="red">{dead}</Pill> : 0}</td>
                <td className="text-zinc-500">{ago(p.lastSuccessAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Latest feeds" icon="inbox" action={<Link href="/feeds" className="text-sm font-semibold text-teal">All</Link>}>
          <TableCard empty={recentRuns.length ? false : "No feeds received yet."}>
            <thead><tr><th>Agency</th><th>Listings</th><th>Changes</th><th>Result</th><th>When</th></tr></thead>
            <tbody>
              {recentRuns.map(({ r, name }) => (
                <tr key={r.id}>
                  <td>{r.agencyId ? <Link href={`/agencies/${r.agencyId}`}>{name}</Link> : "—"}</td>
                  <td>{r.received}</td>
                  <td>{r.created + r.updated + r.removed}</td>
                  <td>{r.error ? <span className="text-rose-700">{r.error}</span> : <Pill tone="green">OK</Pill>}</td>
                  <td className="text-zinc-500">{ago(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </Section>
        <Section title="Activity" icon="pulse" action={<Link href="/activity" className="text-sm font-semibold text-teal">All</Link>}>
          <TableCard empty={activity.length ? false : "Nothing yet."}>
            <tbody>
              {activity.map((e) => (
                <tr key={e.id}>
                  <td className="w-10"><Avatar name={e.actorLabel} size="h-7 w-7 text-[10px]" /></td>
                  <td><span className="font-medium">{e.actorLabel}</span> <span className="text-zinc-500">{actionLabel(e.action).toLowerCase()}</span></td>
                  <td className="text-right text-zinc-500">{ago(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </Section>
      </div>
    </div>
  );
}
