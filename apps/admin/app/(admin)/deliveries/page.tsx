import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { agencies, deliveries, getDb, partners, type DeliveryStatus } from "@listgate/db";
import { ago } from "@/lib/format";
import { retry } from "@/app/actions";
import { PageHeader, Pill, TableCard, Tabs } from "@/app/kit";

export const dynamic = "force-dynamic";
const TONE = { sent: "green", pending: "sky", failed: "amber", dead: "red" } as const;
const STATUSES: DeliveryStatus[] = ["pending", "failed", "dead", "sent"];

export default async function Deliveries({ searchParams }: { searchParams: Promise<{ status?: string; partner?: string }> }) {
  const { status, partner } = await searchParams;
  const where: SQL[] = [];
  if (status && (STATUSES as string[]).includes(status)) where.push(eq(deliveries.status, status as DeliveryStatus));
  if (partner && /^[0-9a-f-]{36}$/i.test(partner)) where.push(eq(deliveries.partnerId, partner));
  const db = await getDb();
  const rows = await db
    .select({ d: deliveries, partner: partners.name, agency: agencies.name })
    .from(deliveries)
    .innerJoin(partners, eq(partners.id, deliveries.partnerId))
    .leftJoin(agencies, eq(agencies.id, deliveries.agencyId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(deliveries.id))
    .limit(300);
  const tab = (s?: string) => `/deliveries${s ? `?status=${s}` : ""}`;
  return (
    <div className="space-y-6">
      <PageHeader
        icon="repeat"
        title="Deliveries"
        sub="Pushes to partner webhooks. Failed ones retry by themselves; ones that gave up wait for you."
        actions={<form action={retry}><button className="btn-secondary">Retry all failed</button></form>}
      />
      <Tabs label="Status" current={status ?? "all"} tabs={[{ key: "all", label: "All", href: tab() }, ...STATUSES.map((s) => ({ key: s, label: s === "dead" ? "Gave up" : s[0].toUpperCase() + s.slice(1), href: tab(s) }))]} />
      <TableCard empty={rows.length ? false : "Nothing here."}>
        <thead><tr><th>#</th><th>Partner</th><th>Agency</th><th>Event</th><th>Status</th><th>Tries</th><th>Result</th><th>When</th><th></th></tr></thead>
        <tbody>
          {rows.map(({ d, partner: p, agency }) => (
            <tr key={d.id}>
              <td className="text-xs">{d.listingId ? <Link href={`/listings/${d.listingId}`}>{d.id}</Link> : d.id}</td>
              <td><Link href={`/partners/${d.partnerId}`}>{p}</Link></td>
              <td>{agency ?? "—"}</td>
              <td className="text-xs">{d.event}{d.listingVersion ? ` v${d.listingVersion}` : ""}</td>
              <td><Pill tone={TONE[d.status]}>{d.status === "dead" ? "gave up" : d.status}</Pill></td>
              <td>{d.attempts}</td>
              <td className="max-w-xs truncate text-xs text-zinc-500">{d.lastStatus ? `HTTP ${d.lastStatus}` : ""} {d.lastError ?? ""}</td>
              <td className="text-zinc-500">{ago(d.sentAt ?? d.updatedAt)}</td>
              <td>{(d.status === "dead" || d.status === "failed") && <form action={retry}><input type="hidden" name="id" value={d.id} /><button className="text-xs font-semibold text-teal">Retry</button></form>}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
