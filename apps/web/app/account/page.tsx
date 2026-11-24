import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, users } from "@listgate/db";
import { DetailsForm, PasswordCard } from "@/components/AccountParts";
import { SignOutButton } from "@/components/AuthForms";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await currentUser();
  if (!me) redirect("/login");
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, me.id));
  return (
    <>
      <header className="bg-navy">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-4">
          <Link href="/app" aria-label="Back to your agency"><Logo height={26} white /></Link>
          <span className="flex-1" />
          <Link href="/app" className="text-sm font-semibold text-white/80">Your agency</Link>
          <SignOutButton className="text-sm font-semibold text-white/80" />
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
        <h1 className="text-3xl font-extrabold text-navy">Account</h1>
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold text-navy">Your details</h2>
          <DetailsForm firstName={u.firstName ?? u.name.split(" ")[0]} lastName={u.lastName ?? ""} phone={u.phone ?? ""} email={u.email} />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold text-navy">Password</h2>
          <PasswordCard hasPassword={!!u.passwordHash} />
        </section>
      </main>
    </>
  );
}
