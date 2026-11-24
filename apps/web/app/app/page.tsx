import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { agencyPartners, agencyMembers, feedRuns, fullAddress, getDb, listings, users } from "@listgate/db";
import { SignOutButton } from "@/components/AuthForms";
import { Copy, PartnerToggles, TicketForm, UploadFeed } from "@/components/AgencyParts";
import { TeamCard } from "@/components/AccountParts";
import { Logo } from "@/components/Logo";
import { agenciesFor, listedPartners } from "@/lib/agency";
import { currentUser } from "@/lib/auth";
import { config, feedUrl } from "@/lib/config";
import { ticketsFor } from "@/lib/tickets";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { current: "For sale", under_offer: "Under offer", sold: "Sold", leased: "Leased", withdrawn: "Withdrawn", off_market: "Off market" };
const when = (d: Date | null | undefined) => (d ? d.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never");

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      {hint && <p className="mb-4 mt-0.5 text-sm text-slate-600">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

export default async function AgencyApp({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/login");
  const mine = await agenciesFor(me);
  const { a } = await searchParams;
  const pick = mine.find((m) => m.agency.id === a) ?? mine[0];

  const header = (
    <header className="bg-navy">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4">
        <Link href="/" aria-label="Listgate home"><Logo height={26} white /></Link>
        <span className="flex-1" />
        {me.admin && <a href={config.adminUrl} className="text-sm font-semibold text-white/80">Admin</a>}
        <Link href="/account" className="text-sm font-semibold text-white/80">Account</Link>
        <SignOutButton className="text-sm font-semibold text-white/80" />
      </div>
    </header>
  );

  if (!pick) {
    return (
      <>
        {header}
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-navy">No agency yet</h1>
          <p className="mt-2 text-slate-600">Your login isn&apos;t linked to an agency. Ask whoever set up Listgate for your office to invite you, or email <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.</p>
        </main>
      </>
    );
  }

  const agency = pick.agency;
  const canManage = pick.role === "owner" || me.admin;
  const db = await getDb();
  const [[live], recent, runs, optIns, partners, team, tickets] = await Promise.all([
    db.select({ n: count() }).from(listings).where(and(eq(listings.agencyId, agency.id), isNull(listings.removedAt))),
    db.select().from(listings).where(eq(listings.agencyId, agency.id)).orderBy(desc(listings.updatedAt)).limit(25),
    db.select().from(feedRuns).where(eq(feedRuns.agencyId, agency.id)).orderBy(desc(feedRuns.createdAt)).limit(8),
    db.select().from(agencyPartners).where(eq(agencyPartners.agencyId, agency.id)),
    listedPartners(),
    db.select({ userId: users.id, name: users.name, email: users.email, role: agencyMembers.role, joined: users.passwordHash }).from(agencyMembers).innerJoin(users, eq(users.id, agencyMembers.userId)).where(eq(agencyMembers.agencyId, agency.id)),
    ticketsFor(agency.id, 5),
  ]);
  const on = new Map(optIns.map((o) => [o.partnerId, o]));

  return (
    <>
      {header}
      {me.viewingAs && <p className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">You&apos;re viewing as {me.name}. Changes are switched off.</p>}
      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold text-navy">{agency.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {live.n} live listing{live.n === 1 ? "" : "s"} · last feed {when(agency.lastFeedAt)}
              {agency.suspendedAt && <span className="pill ml-2 bg-red-100 text-red-800">Suspended</span>}
            </p>
          </div>
          {mine.length > 1 && (
            <form className="flex items-center gap-2">
              <select name="a" defaultValue={agency.id} className="field w-auto">
                {mine.map((m) => <option key={m.agency.id} value={m.agency.id}>{m.agency.name}</option>)}
              </select>
              <button className="btn-ghost px-4 py-2">Open</button>
            </form>
          )}
        </div>

        <Section title="Where your listings go" hint="Switch a partner on and Listgate sends it every listing in your feed, and every change after that. Switch it off and they're told to take your listings down.">
          <PartnerToggles
            agencyId={agency.id}
            authorised={!!agency.authorisedAt}
            canManage={canManage}
            viewingAs={me.viewingAs}
            partners={partners.map((p) => ({ id: p.id, name: p.name, description: p.description, website: p.website, enabled: !!on.get(p.id)?.enabled, changedBy: on.get(p.id)?.changedByName ?? null }))}
          />
        </Section>

        <Section title="Your feed" hint="Add Listgate in your CRM the same way you add a portal. It sends the same REAXML it already sends to realestate.com.au and Domain.">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <dt className="font-bold">By HTTP (preferred)</dt>
              <dd><Copy value={feedUrl(agency.feedToken)} secret /></dd>
              <dd className="text-xs text-slate-500">POST the REAXML file to this address. Keep it private: it&apos;s your agency&apos;s key.</dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="font-bold">By FTP</dt>
              <dd className="grid grid-cols-[80px_1fr] items-center gap-1.5">
                <span className="text-slate-500">Host</span><Copy value={config.ftpHost} />
                <span className="text-slate-500">Username</span><Copy value={agency.slug} />
                <span className="text-slate-500">Password</span><Copy value={agency.feedToken} secret />
              </dd>
            </div>
          </dl>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-bold">Upload a file</p>
            <UploadFeed agencyId={agency.id} disabled={me.viewingAs} />
          </div>
          {runs.length > 0 && (
            <div className="mt-5 overflow-x-auto border-t border-slate-100 pt-4">
              <p className="mb-2 text-sm font-bold">Recent feeds</p>
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3">Received</th><th className="pr-3">Via</th><th className="pr-3">Listings</th><th className="pr-3">New</th><th className="pr-3">Changed</th><th className="pr-3">Removed</th><th>Result</th></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3">{when(r.createdAt)}</td>
                      <td className="pr-3 uppercase text-slate-500">{r.via}</td>
                      <td className="pr-3">{r.received}</td>
                      <td className="pr-3">{r.created}</td>
                      <td className="pr-3">{r.updated}</td>
                      <td className="pr-3">{r.removed}</td>
                      <td className={r.error ? "text-red-700" : "text-green-700"}>{r.error || "OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Listings" hint={recent.length ? "Most recently changed first." : "Nothing yet. Listings show here as soon as your CRM sends its first feed."}>
          {recent.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3">Property</th><th className="pr-3">Status</th><th className="pr-3">Price</th><th className="pr-3">Photos</th><th>Updated</th></tr></thead>
                <tbody>
                  {recent.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3">
                        <span className="font-semibold">{fullAddress(l) || l.extId}</span>
                        {!l.displayAddress && <span className="pill ml-2 bg-slate-100 text-slate-600">Address hidden</span>}
                        <span className="block text-xs text-slate-500">{[l.propertyType, l.beds != null && `${l.beds} bed`, l.baths != null && `${l.baths} bath`, l.extId].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="pr-3">{STATUS[l.status]}</td>
                      <td className="pr-3">{l.priceText || "—"}</td>
                      <td className="pr-3">{l.images.length}</td>
                      <td className="whitespace-nowrap">{when(l.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Team">
            <TeamCard agencyId={agency.id} canManage={canManage && !me.viewingAs} members={team.map((t) => ({ userId: t.userId, name: t.name, email: t.email, role: t.role, isMe: t.userId === me.id, joined: !!t.joined }))} />
          </Section>
          <Section title="Help" hint="Questions about your feed or a partner? Send it here and we'll email you back.">
            <TicketForm agencyId={agency.id} disabled={me.viewingAs} />
            {tickets.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1 border-t border-slate-100 pt-3 text-sm">
                {tickets.map((t) => <li key={t.id}>#{t.number} {t.subject} <span className="text-xs text-slate-500">· {t.status}</span></li>)}
              </ul>
            )}
          </Section>
        </div>
      </main>
    </>
  );
}
