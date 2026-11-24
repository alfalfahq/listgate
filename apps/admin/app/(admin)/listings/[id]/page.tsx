import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { agencies, agents, deliveries, fullAddress, getDb, listingPayload, listings, partners } from "@listgate/db";
import { requireAdmin } from "@/lib/auth";
import { ago, when } from "@/lib/format";
import { retry } from "@/app/actions";
import { PageHeader, Pill, Section, StatusPill, TableCard } from "@/app/kit";

export const dynamic = "force-dynamic";
const TONE = { sent: "green", pending: "sky", failed: "amber", dead: "red" } as const;

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [l] = await db.select().from(listings).where(eq(listings.id, id));
  if (!l) notFound();
  const [a] = await db.select().from(agencies).where(eq(agencies.id, l.agencyId));
  const [ags, ds] = await Promise.all([
    l.agentExtIds.length ? db.select().from(agents).where(and(eq(agents.agencyId, l.agencyId), inArray(agents.extId, l.agentExtIds))) : Promise.resolve([]),
    db.select({ d: deliveries, partner: partners.name }).from(deliveries).innerJoin(partners, eq(partners.id, deliveries.partnerId)).where(eq(deliveries.listingId, id)).orderBy(desc(deliveries.id)).limit(30),
  ]);
  const payload = listingPayload(l, a, ags, { confidential: false });
  return (
    <div className="space-y-8">
      <Link href={`/agencies/${a.id}`} className="text-sm text-zinc-500">← {a.name}</Link>
      <PageHeader title={fullAddress(l) || l.extId} sub={<>{l.extId} · {l.category} · v{l.version} · first seen {when(l.firstSeenAt)} · updated {ago(l.updatedAt)}</>} actions={<StatusPill status={l.status} />} />
      {l.images[0] && (
        <div className="flex gap-2 overflow-x-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {l.images.slice(0, 8).map((m) => <img key={m.url} src={m.url} alt="" loading="lazy" className="h-28 w-40 shrink-0 rounded-lg object-cover" />)}
        </div>
      )}
      <Section title="Sent to partners" icon="repeat">
        <TableCard empty={ds.length ? false : "Not sent anywhere yet."}>
          <thead><tr><th>Partner</th><th>Event</th><th>Version</th><th>Status</th><th>Tries</th><th>Result</th><th>When</th><th></th></tr></thead>
          <tbody>
            {ds.map(({ d, partner }) => (
              <tr key={d.id}>
                <td>{partner}</td>
                <td className="text-xs">{d.event}</td>
                <td>{d.listingVersion ? `v${d.listingVersion}` : "—"}</td>
                <td><Pill tone={TONE[d.status]}>{d.status}</Pill></td>
                <td>{d.attempts}</td>
                <td className="max-w-xs truncate text-xs text-zinc-500">{d.lastStatus ? `HTTP ${d.lastStatus}` : ""} {d.lastError ?? ""}</td>
                <td className="text-zinc-500">{ago(d.sentAt ?? d.updatedAt)}</td>
                <td>{d.status !== "pending" && <form action={retry}><input type="hidden" name="id" value={d.id} /><button className="text-xs font-semibold text-teal">Send again</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="What partners get" icon="list">
          <pre className="card max-h-[600px] overflow-auto p-4 text-xs">{JSON.stringify(payload, null, 2)}</pre>
          <p className="mt-1 text-xs text-zinc-500">As a standard partner sees it. Confidential partners also get a hidden address and price.</p>
        </Section>
        <Section title="REAXML as received" icon="inbox">
          <pre className="card max-h-[600px] overflow-auto p-4 text-xs">{JSON.stringify(l.raw, null, 2)}</pre>
        </Section>
      </div>
    </div>
  );
}
