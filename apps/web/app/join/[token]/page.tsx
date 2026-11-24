import { and, eq, gt, isNull } from "drizzle-orm";
import { agencies, getDb, hashToken, loginTokens } from "@listgate/db";
import { InviteForm } from "@/components/AuthForms";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const [inv] = await db
    .select({ email: loginTokens.email, agency: agencies.name })
    .from(loginTokens)
    .innerJoin(agencies, eq(agencies.id, loginTokens.agencyId))
    .where(and(eq(loginTokens.tokenHash, hashToken(token)), eq(loginTokens.purpose, "invite"), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())));
  return (
    <main className="flex min-h-screen items-center justify-center bg-sky px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6"><Logo height={28} /></div>
        {inv?.email ? (
          <>
            <h1 className="mb-2 text-2xl font-bold">{inv.agency} on Listgate</h1>
            <p className="mb-5 text-sm text-slate-700">Set a password to manage where your listings go.</p>
            <InviteForm token={token} email={inv.email} agency={inv.agency} />
          </>
        ) : (
          <p>This invite link has already been used or has expired. <a href="/login">Sign in</a></p>
        )}
      </div>
    </main>
  );
}
