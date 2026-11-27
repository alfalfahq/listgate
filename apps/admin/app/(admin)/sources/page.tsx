import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { agencies, agencyPartners, agentPartners, getDb, partners, sources } from "@listgate/db";
import { createSource, rotateSourceToken } from "@/app/actions";
import { CopyButton } from "@/app/copy-button";
import { PageHeader, Pill, Section, TableCard } from "@/app/kit";
import { ActionForm, Field } from "@/app/ui";
import { ago, feedUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Sources() {
  const db = await getDb();
  const rows = await db
    .select({
      s: sources,
      offices: sql<number>`(select count(*)::int from agencies a where a.source_id = "sources"."id")`,
      listings: sql<number>`(select count(*)::int from listings l join agencies a on a.id = l.agency_id where a.source_id = "sources"."id" and l.removed_at is null)`,
      agents: sql<number>`(select count(distinct ap.email)::int from agent_partners ap where ap.source_id = "sources"."id" and ap.enabled)`,
    })
    .from(sources)
    .orderBy(asc(sources.name));
  const unlocks = await db
    .select({ source: sources.name, email: agentPartners.email, partner: partners.name, at: agentPartners.updatedAt })
    .from(agentPartners)
    .innerJoin(sources, eq(sources.id, agentPartners.sourceId))
    .innerJoin(partners, eq(partners.id, agentPartners.partnerId))
    .where(eq(agentPartners.enabled, true))
    .orderBy(desc(agentPartners.updatedAt))
    .limit(50);
  const officeUnlocks = await db
    .select({ agencyId: agencies.id, agency: agencies.name, source: sources.name, partner: partners.name, by: agencyPartners.changedByName, authorisedBy: agencies.authorisedBy, at: agencyPartners.updatedAt })
    .from(agencyPartners)
    .innerJoin(agencies, eq(agencies.id, agencyPartners.agencyId))
    .innerJoin(sources, eq(sources.id, agencies.sourceId))
    .innerJoin(partners, eq(partners.id, agencyPartners.partnerId))
    .where(eq(agencyPartners.enabled, true))
    .orderBy(desc(agencyPartners.updatedAt))
    .limit(50);
  return (
    <div className="space-y-6">
      <PageHeader icon="bolt" title="CRM feeds" sub="One feed from a CRM for every agency on it. Split into offices by <agentID>. Nothing goes to partners until an agent unlocks their listings at /agent, or approves their whole office." />
      <TableCard empty={rows.length ? false : "No CRM feeds yet. Add one below."}>
        <thead><tr><th>CRM</th><th>Feed URL</th><th>Offices</th><th>Live listings</th><th>Agents unlocked</th><th>Last feed</th><th /></tr></thead>
        <tbody>
          {rows.map(({ s, offices, listings, agents }) => (
            <tr key={s.id}>
              <td><Link href={`/sources/${s.id}`} className="font-semibold">{s.name}</Link>{s.suspendedAt && <Pill tone="red">Suspended</Pill>}<span className="block text-xs text-zinc-500">{s.contactEmail ?? s.slug}</span></td>
              <td><code className="block max-w-xs truncate text-xs">{feedUrl(s.feedToken)}</code><CopyButton text={feedUrl(s.feedToken)} label="Copy URL" className="text-xs" /></td>
              <td><Link href={`/agencies?crm=${encodeURIComponent(s.name)}`}>{offices}</Link></td>
              <td>{listings}</td>
              <td>{agents}</td>
              <td className="text-zinc-500">{ago(s.lastFeedAt)}</td>
              <td>
                <form action={rotateSourceToken}>
                  <input type="hidden" name="sourceId" value={s.id} />
                  <button className="text-xs font-semibold text-rose-700" title="The old URL stops working at once">New token</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <Section title="Whole-office approvals" icon="building">
        {officeUnlocks.length ? (
          <ul className="divide-y divide-zinc-100 text-sm">
            {officeUnlocks.map((o, i) => (
              <li key={i} className="flex flex-wrap gap-x-2 py-2">
                <Link href={`/agencies/${o.agencyId}`} className="font-semibold">{o.agency}</Link>
                <span className="text-zinc-500">({o.source})</span> → {o.partner}
                <span className="text-zinc-500">· by {o.by ?? "?"}{o.authorisedBy ? `, authorised by ${o.authorisedBy}` : ""} · {ago(o.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">None yet.</p>
        )}
      </Section>

      <Section title="Agents who unlocked their listings" icon="users">
        {unlocks.length ? (
          <ul className="divide-y divide-zinc-100 text-sm">
            {unlocks.map((u, i) => (
              <li key={i} className="py-2">{u.email} <span className="text-zinc-500">({u.source})</span> → {u.partner} <span className="text-zinc-500">· {ago(u.at)}</span></li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">None yet.</p>
        )}
      </Section>

      <Section title="Add a CRM feed" icon="plus">
        <ActionForm action={createSource} submit="Add CRM feed" className="max-w-xl">
          <Field label="CRM name"><input name="name" className="input" placeholder="e.g. LockedOn" required /></Field>
          <Field label="Contact email at the CRM (optional)"><input name="contactEmail" type="email" className="input" /></Field>
          <Field label="Notes (optional)"><textarea name="notes" className="input" rows={2} /></Field>
        </ActionForm>
      </Section>
    </div>
  );
}
