import { NextResponse } from "next/server";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb, hashToken, loginTokens } from "@listgate/db";
import { createSession } from "@/lib/auth";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-time links: emailed sign-in links, and admin "view as" (read-only, one hour). */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const db = await getDb();
  const [t] = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(loginTokens.tokenHash, hashToken(token)), inArray(loginTokens.purpose, ["login", "impersonate"]), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())))
    .returning();
  if (!t?.userId) return NextResponse.redirect(`${config.appUrl}/login?expired=1`);
  await createSession(t.userId, t.purpose === "impersonate" && t.invitedByUserId ? { impersonatorId: t.invitedByUserId } : {});
  return NextResponse.redirect(`${config.appUrl}/app`);
}
