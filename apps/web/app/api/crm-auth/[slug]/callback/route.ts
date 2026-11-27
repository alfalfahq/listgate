import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { finishOAuth, signInCrmUser, sourceBySlug, ssoOn } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The CRM sends the agent back here with a code. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const back = (error: string) => NextResponse.redirect(`${config.appUrl}/agent?error=${encodeURIComponent(error)}`);
  const s = await sourceBySlug((await ctx.params).slug);
  if (!s || !ssoOn(s)) return back("Signing in with that CRM isn't switched on.");
  const q = new URL(req.url).searchParams;
  if (q.get("error")) return back(`${s.name} sign-in was cancelled.`);
  try {
    const u = await finishOAuth(s, q.get("code") || "", q.get("state") || "");
    await signInCrmUser(s, u, "oauth");
    return NextResponse.redirect(`${config.appUrl}/agent`);
  } catch (e) {
    console.error("[crm-auth]", e);
    return back(e instanceof Error ? e.message : "Sign-in failed.");
  }
}
