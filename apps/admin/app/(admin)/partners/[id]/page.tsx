import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { agencies, agencyPartners, deliveries, getDb, partners } from "@listgate/db";
import { canSeeMoney, requireAdmin } from "@/lib/auth";
import { APP_URL, ago } from "@/lib/format";
import { retry, rotateApiKey, rotateSigningSecret, testPartner, updatePartner } from "@/app/actions";
import { PageHeader, Pill, Section, TableCard } from "@/app/kit";
import { ActionForm } from "@/app/ui";
import { PartnerFields } from "../form";

export const dynamic = "force-dynamic";
const TONE = { sent: "green", pending: "sky", failed: "amber", dead: "red" } as const;

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [p] = await db.select().from(partners).where(eq(partners.id, id));
  if (!p) notFound();
  const full = canSeeMoney(me);
  const [ags, ds] = await Promise.all([
    db.select({ a: agencies, o: agencyPartners }).from(agencyPartners).innerJoin(agencies, eq(agencies.id, agencyPartners.agencyId)).where(eq(agencyPartners.partnerId, id)).orderBy(asc(agencies.name)),
    db.select().from(deliveries).where(eq(deliveries.partnerId, id)).orderBy(desc(deliveries.id)).limit(40),
  ]);
  return (
    <div className="space-y-8">
      <Link href="/partners" className="text-sm text-zinc-500">← Partners</Link>
      <PageHeader icon="network" title={p.name} sub={`${p.webhookUrl ? "Push to webhook" : "Pull only"} · ${ags.filter((x) => x.o.enabled).length} agencies sending · last success ${ago(p.lastSuccessAt)}`} actions={p.active ? <Pill tone="green">Active</Pill> : <Pill>Paused</Pill>} />
      {p.lastError && p.lastFailureAt && (!p.lastSuccessAt || p.lastFailureAt > p.lastSuccessAt) && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Last push failed {ago(p.lastFailureAt)}: {p.lastError}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Settings" icon="network">
          <ActionForm action={updatePartner} submit="Save">
            <input type="hidden" name="partnerId" value={p.id} />
            <PartnerFields p={p} />
          </ActionForm>
        </Section>
        <div className="space-y-6">
          <Section title="Webhook" icon="link">
            <div className="card space-y-3 p-5 text-sm">
              <p>Every change is POSTed as JSON with <code>X-Listgate-Event</code>, <code>X-Listgate-Delivery</code> and <code>X-Listgate-Signature: t=…,v1=…</code> (HMAC-SHA256 of <code>t.body</code> with the signing secret). Reply 2xx to accept.</p>
              {full && <p className="text-xs text-zinc-500">Signing secret: <code>{p.signingSecret.slice(0, 10)}…</code></p>}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ActionForm action={testPartner} submit="Send a test ping"><input type="hidden" name="partnerId" value={p.id} /></ActionForm>
              {full && <ActionForm action={rotateSigningSecret} submit="New signing secret"><input type="hidden" name="partnerId" value={p.id} /></ActionForm>}
            </div>
          </Section>
          <Section title="API key (pull)" icon="bolt">
            <div className="card space-y-2 p-5 text-sm">
              <p>{p.apiKeyLast4 ? <>Key ending <code>…{p.apiKeyLast4}</code> is active.</> : "No key issued yet."}</p>
              <p className="text-xs text-zinc-500">
                <code>GET {APP_URL}/api/v1/listings?updatedSince=…</code>, <code>/api/v1/listings/&lt;id&gt;</code>, <code>/api/v1/agencies</code>, <code>/api/v1/me</code> with <code>Authorization: Bearer &lt;key&gt;</code>.
              </p>
            </div>
            {full && <ActionForm action={rotateApiKey} submit={p.apiKeyLast4 ? "Replace API key" : "Issue API key"} className="mt-3"><input type="hidden" name="partnerId" value={p.id} /></ActionForm>}
          </Section>
        </div>
      </div>

      <Section title="Agencies" icon="building">
        <TableCard empty={ags.length ? false : "No agency has switched this partner on yet."}>
          <thead><tr><th>Agency</th><th>Sending</th><th>Their ref</th><th>Changed</th></tr></thead>
          <tbody>
            {ags.map(({ a, o }) => (
              <tr key={a.id}>
                <td><Link href={`/agencies/${a.id}`}>{a.name}</Link></td>
                <td>{o.enabled ? <Pill tone="green">On</Pill> : <Pill>Off</Pill>}</td>
                <td className="text-xs">{o.partnerAgencyRef ?? "—"}</td>
                <td className="text-zinc-500">{o.changedByName ? `${o.changedByName}, ` : ""}{ago(o.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </Section>

      <Section title="Recent deliveries" icon="repeat" action={<form action={retry}><input type="hidden" name="partnerId" value={p.id} /><button className="text-sm font-semibold text-teal">Retry failed</button></form>}>
        <TableCard empty={ds.length ? false : "Nothing sent yet."}>
          <thead><tr><th>#</th><th>Event</th><th>Status</th><th>Tries</th><th>Result</th><th>Next try</th><th>When</th></tr></thead>
          <tbody>
            {ds.map((d) => (
              <tr key={d.id}>
                <td className="text-xs">{d.listingId ? <Link href={`/listings/${d.listingId}`}>{d.id}</Link> : d.id}</td>
                <td className="text-xs">{d.event}{d.listingVersion ? ` v${d.listingVersion}` : ""}</td>
                <td><Pill tone={TONE[d.status]}>{d.status}</Pill></td>
                <td>{d.attempts}</td>
                <td className="max-w-xs truncate text-xs text-zinc-500">{d.lastStatus ? `HTTP ${d.lastStatus} · ${d.ms} ms` : ""} {d.lastError ?? ""}</td>
                <td className="text-xs text-zinc-500">{d.status === "failed" ? ago(d.nextAttemptAt).replace(" ago", "") : ""}</td>
                <td className="text-zinc-500">{ago(d.sentAt ?? d.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </Section>
    </div>
  );
}
