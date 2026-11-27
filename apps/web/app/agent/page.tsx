import Link from "next/link";
import { fullAddress } from "@listgate/db";
import { AgentSignIn, OfficeUnlocks } from "@/components/AgentParts";
import { SignOutButton } from "@/components/AuthForms";
import { Logo } from "@/components/Logo";
import { agentOffices } from "@/lib/agent";
import { listedPartners } from "@/lib/agency";
import { currentUser } from "@/lib/auth";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unlock your listings · Listgate" };

const STATUS: Record<string, string> = { current: "For sale", under_offer: "Under offer", sold: "Sold", leased: "Leased" };

export default async function AgentPage() {
  const me = await currentUser();
  const header = (
    <header className="bg-navy">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
        <Link href="/" aria-label="Listgate home"><Logo height={26} white /></Link>
        <span className="flex-1" />
        {me && <SignOutButton className="text-sm font-semibold text-white/80" />}
      </div>
    </header>
  );

  if (!me) {
    return (
      <>
        {header}
        <main className="mx-auto max-w-md px-4 py-14">
          <h1 className="text-2xl font-bold text-navy">Unlock your listings</h1>
          <p className="mt-2 text-slate-600">Your CRM sends your listings to Listgate, but nothing goes anywhere until you choose. Sign in with the email on your listings to pick where they go.</p>
          <div className="card mt-6 p-5"><AgentSignIn /></div>
        </main>
      </>
    );
  }

  const [offices, partners] = await Promise.all([agentOffices(me.email), listedPartners()]);
  const tiles = partners.map((p) => ({ id: p.id, name: p.name, description: p.description }));
  return (
    <>
      {header}
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-bold text-navy">Your listings</h1>
          <p className="mt-1 text-slate-600">Signed in as {me.email}. Choose which partners get your listings, or approve the whole office if you&apos;re authorised to.</p>
        </div>
        {!offices.length && (
          <section className="card p-6">
            <p className="font-semibold text-navy">No listings with {me.email} yet.</p>
            <p className="mt-1 text-sm text-slate-600">Your CRM needs to send Listgate listings with this email as the listing agent. If your listings use a different email, sign out and sign in with that one.</p>
          </section>
        )}
        {offices.map((o) => (
          <section key={o.agency.id} className="card p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-teal">{o.source.name}</p>
            <h2 className="text-lg font-bold text-navy">{o.agency.name}</h2>
            <p className="mb-4 text-sm text-slate-600">{o.mine.length} of your listings · {o.officeCount} in the office</p>
            {o.mine.length > 0 && (
              <ul className="mb-4 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                {o.mine.slice(0, 12).map((l) => (
                  <li key={l.id} className="truncate">{fullAddress(l) || l.headline || l.extId} <span className="text-slate-400">· {l.kind === "rent" && l.status === "current" ? "For rent" : STATUS[l.status] ?? l.status}</span></li>
                ))}
                {o.mine.length > 12 && <li className="text-slate-500">and {o.mine.length - 12} more</li>}
              </ul>
            )}
            <OfficeUnlocks sourceId={o.source.id} agencyId={o.agency.id} officeName={o.agency.name} partners={tiles} mineOn={o.mineOn} officeOn={o.officeOn.map((x) => ({ partnerId: x.partnerId, by: x.by }))} myCount={o.mine.length} officeCount={o.officeCount} viewingAs={me.viewingAs} locked={o.agency.agentsLockedAt ? o.agency.agentsLockedReason || "yes" : null} contact={config.contactEmail} />
          </section>
        ))}
      </main>
    </>
  );
}
