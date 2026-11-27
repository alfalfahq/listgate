import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { CRMS, agencies, agencyMembers, agencyPartners, auditLog, feedRuns, fullAddress, getDb, listings, partners, users } from "@listgate/db";
import { actionLabel, ago, feedUrl, FTP_HOST, num, when } from "@/lib/format";
import { requireAdmin } from "@/lib/auth";
import { inviteToAgency, resendAgency, rotateFeedToken, setAgencyPartner, setAgentsLock, setSuspended, updateAgency, uploadFeed, viewAs } from "@/app/actions";
import { AgencyMark, Avatar, PageHeader, Pill, Section, StatusPill, TableCard } from "@/app/kit";
import { ActionForm, Field } from "@/app/ui";
import { CopyButton } from "@/app/copy-button";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

export default async function AgencyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = await getDb();
  const [a] = await db.select().from(agencies).where(eq(agencies.id, id));
  if (!a) notFound();
  const [[live], ls, runs, ps, optIns, people, events] = await Promise.all([
    db.select({ n: count() }).from(listings).where(and(eq(listings.agencyId, id), isNull(listings.removedAt))),
    db.select().from(listings).where(eq(listings.agencyId, id)).orderBy(desc(listings.updatedAt)).limit(50),
    db.select().from(feedRuns).where(eq(feedRuns.agencyId, id)).orderBy(desc(feedRuns.createdAt)).limit(15),
    db.select().from(partners).orderBy(asc(partners.sort), asc(partners.name)),
    db.select().from(agencyPartners).where(eq(agencyPartners.agencyId, id)),
    db.select({ u: users, role: agencyMembers.role }).from(agencyMembers).innerJoin(users, eq(users.id, agencyMembers.userId)).where(eq(agencyMembers.agencyId, id)),
    db.select().from(auditLog).where(eq(auditLog.agencyId, id)).orderBy(desc(auditLog.createdAt)).limit(20),
  ]);
  const on = new Map(optIns.map((o) => [o.partnerId, o]));

  return (
    <div className="space-y-8">
      <Link href="/agencies" className="text-sm text-zinc-500">← Agencies</Link>
      <PageHeader
        title={<span className="flex items-center gap-3"><AgencyMark name={a.name} size="h-10 w-10 text-sm" />{a.name}</span>}
        sub={`${num(live.n)} live listings · last feed ${a.lastFeedAt ? ago(a.lastFeedAt) : "never"} · ${a.authorisedAt ? `authorised by ${a.authorisedBy ?? "agency"} ${ago(a.authorisedAt)}` : "not authorised yet"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {a.sourceId && (
              <form action={setAgentsLock} className="flex items-center gap-2">
                <input type="hidden" name="agencyId" value={a.id} />
                <input type="hidden" name="lock" value={a.agentsLockedAt ? "0" : "1"} />
                {!a.agentsLockedAt && <input name="reason" className="input w-48" placeholder="Reason (shown to agents)" />}
                <button className={a.agentsLockedAt ? "btn-primary" : "btn-secondary"} title="Stops agents changing anything for this office">{a.agentsLockedAt ? "Unlock agents" : "Lock agents"}</button>
              </form>
            )}
            <form action={setSuspended}>
              <input type="hidden" name="agencyId" value={a.id} />
              <input type="hidden" name="suspend" value={a.suspendedAt ? "0" : "1"} />
              <button className={a.suspendedAt ? "btn-primary" : "btn-secondary"}>{a.suspendedAt ? "Unsuspend" : "Suspend"}</button>
            </form>
          </div>
        }
      />
      {a.sourceId && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">From a CRM feed ({a.crm}, office ID {a.reaxmlAgentId}). Agents unlock their own listings at /agent; partners switched on below apply to the whole office.</p>}
      {a.agentsLockedAt && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Agents locked {ago(a.agentsLockedAt)}{a.agentsLockedReason ? `: ${a.agentsLockedReason}` : ""}. Agents can't change anything here and their own unlocks don't apply. Only the partners below get these listings.</p>}
      {a.suspendedAt && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Suspended {ago(a.suspendedAt)}. Feeds are refused and nothing new goes to partners.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Feed" icon="inbox">
          <div className="card space-y-4 p-5 text-sm">
            <div>
              <p className="label">HTTP POST</p>
              <div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-xs">{feedUrl(a.feedToken)}</code><CopyButton text={feedUrl(a.feedToken)} label="Copy" /></div>
            </div>
            <div className="grid grid-cols-[90px_1fr] items-center gap-2">
              <span className="label mb-0">FTP host</span><code className="text-xs">{FTP_HOST}</code>
              <span className="label mb-0">Username</span><code className="text-xs">{a.slug}</code>
              <span className="label mb-0">Password</span><span className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate text-xs">{a.feedToken}</code><CopyButton text={a.feedToken} label="Copy" /></span>
            </div>
            <form action={rotateFeedToken} className="border-t border-zinc-100 pt-3">
              <input type="hidden" name="agencyId" value={a.id} />
              <button className="text-xs font-semibold text-rose-700">New feed key (the old URL and FTP password stop working)</button>
            </form>
          </div>
          <ActionForm action={uploadFeed} submit="Read file" className="mt-3">
            <input type="hidden" name="agencyId" value={a.id} />
            <Field label="Upload a REAXML file"><input type="file" name="file" accept=".xml,text/xml" className="text-sm" /></Field>
          </ActionForm>
        </Section>

        <Section title="Sends to" icon="network">
          <TableCard empty={ps.length ? false : "No partners set up."}>
            <thead><tr><th>Partner</th><th>Their ref</th><th>On</th><th></th></tr></thead>
            <tbody>
              {ps.map((p) => {
                const o = on.get(p.id);
                return (
                  <tr key={p.id}>
                    <td><Link href={`/partners/${p.id}`} className="font-semibold">{p.name}</Link>{!p.active && <span className="ml-1 text-xs text-zinc-500">(paused)</span>}{o && <span className="block text-xs text-zinc-500">{o.changedByName ? `by ${o.changedByName}, ` : ""}{ago(o.updatedAt)}</span>}</td>
                    <td colSpan={2}>
                      <form key={`${o?.enabled}|${o?.partnerAgencyRef}|${o?.updatedAt?.getTime()}`} action={setAgencyPartner} className="flex items-center gap-2">
                        <input type="hidden" name="agencyId" value={a.id} />
                        <input type="hidden" name="partnerId" value={p.id} />
                        <input name="ref" defaultValue={o?.partnerAgencyRef ?? ""} placeholder="optional" className="input w-28 py-1 text-xs" aria-label={`${p.name}'s id for this agency`} />
                        <select name="enabled" defaultValue={o?.enabled ? "1" : "0"} className="input w-20 py-1 text-xs" aria-label={`Send to ${p.name}`}>
                          <option value="1">On</option>
                          <option value="0">Off</option>
                        </select>
                        <button className="btn-secondary py-1 text-xs">Save</button>
                      </form>
                    </td>
                    <td>
                      {o?.enabled && (
                        <form action={resendAgency}>
                          <input type="hidden" name="agencyId" value={a.id} />
                          <input type="hidden" name="partnerId" value={p.id} />
                          <button className="text-xs font-semibold text-teal">Resend all</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
          <p className="mt-2 text-xs text-zinc-500">On sends every live listing now and every change after. Off tells the partner to remove them all.</p>
        </Section>
      </div>

      <Section title="Listings" icon="home2" action={<Link href={`/listings?agency=${a.id}`} className="text-sm font-semibold text-teal">All</Link>}>
        <TableCard empty={ls.length ? false : "No listings yet. They appear when the first feed arrives."}>
          <thead><tr><th>Property</th><th>Status</th><th>Price</th><th>Photos</th><th>Version</th><th>Updated</th></tr></thead>
          <tbody>
            {ls.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/listings/${l.id}`} className="font-medium">{fullAddress(l) || l.extId}</Link>
                  {!l.displayAddress && <Pill>Address hidden</Pill>}
                  <span className="block text-xs text-zinc-500">{l.extId} · {l.category}</span>
                </td>
                <td><StatusPill status={l.status} /></td>
                <td className="text-sm">{l.priceText ?? "—"}</td>
                <td>{l.images.length}</td>
                <td>v{l.version}</td>
                <td className="text-zinc-500">{ago(l.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Feed log" icon="inbox">
          <TableCard empty={runs.length ? false : "Nothing received yet."}>
            <thead><tr><th>When</th><th>Via</th><th>Read</th><th>New</th><th>Changed</th><th>Removed</th><th>Result</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{when(r.createdAt)}</td>
                  <td className="uppercase text-zinc-500">{r.via}</td>
                  <td>{r.received}</td>
                  <td>{r.created}</td>
                  <td>{r.updated}</td>
                  <td>{r.removed}</td>
                  <td>{r.error ? <span className="text-rose-700">{r.error}</span> : <Pill tone="green">OK</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </Section>

        <Section title="People" icon="users">
          <TableCard empty={people.length ? false : "Nobody yet. Invite the owner below."}>
            <tbody>
              {people.map(({ u, role }) => (
                <tr key={u.id}>
                  <td className="w-10"><Avatar name={u.name} /></td>
                  <td><Link href={`/users/${u.id}`} className="font-medium">{u.name}</Link><span className="block text-xs text-zinc-500">{u.email}{u.passwordHash ? "" : " · invite not accepted"}</span></td>
                  <td className="capitalize">{role}</td>
                  <td className="text-right">
                    <form action={viewAs}><input type="hidden" name="userId" value={u.id} /><button className="text-xs font-semibold text-teal">View as</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <ActionForm action={inviteToAgency} submit="Send invite" className="mt-3">
            <input type="hidden" name="agencyId" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name"><input name="name" className="input" /></Field>
              <Field label="Email"><input name="email" type="email" className="input" required /></Field>
              <Field label="Role"><select name="role" className="input" defaultValue="owner"><option value="owner">Owner</option><option value="editor">Editor</option></select></Field>
            </div>
          </ActionForm>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Details" icon="building">
          <form action={updateAgency} className="card grid gap-3 p-5 sm:grid-cols-2">
            <input type="hidden" name="agencyId" value={a.id} />
            <Field label="Name"><input name="name" defaultValue={a.name} className="input" /></Field>
            <Field label="CRM">
              <select name="crm" defaultValue={a.crm ?? ""} className="input">
                <option value="">—</option>
                {[...new Set([...CRMS, ...(a.crm ? [a.crm] : [])])].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Suburb"><input name="suburb" defaultValue={a.suburb ?? ""} className="input" /></Field>
            <Field label="State"><input name="state" defaultValue={a.state ?? ""} className="input" /></Field>
            <Field label="ABN"><input name="abn" defaultValue={a.abn ?? ""} className="input" /></Field>
            <Field label="REAXML agent ID"><input name="reaxmlAgentId" defaultValue={a.reaxmlAgentId ?? ""} className="input" /></Field>
            <Field label="Office email"><input name="contactEmail" defaultValue={a.contactEmail ?? ""} className="input" /></Field>
            <Field label="Website"><input name="website" defaultValue={a.website ?? ""} className="input" /></Field>
            <div className="sm:col-span-2"><Field label="Notes (staff only)"><textarea name="notes" defaultValue={a.notes ?? ""} className="input min-h-20" /></Field></div>
            <button className="btn-primary sm:col-span-2 sm:justify-self-start">Save</button>
          </form>
        </Section>
        <Section title="Activity" icon="pulse">
          <TableCard empty={events.length ? false : "Nothing yet."}>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
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
