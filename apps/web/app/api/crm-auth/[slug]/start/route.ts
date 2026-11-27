import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { sourceBySlug, ssoOn, startUrl } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Sign in with <CRM>" → the CRM's consent screen. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const s = await sourceBySlug((await ctx.params).slug);
  if (!s || !ssoOn(s)) return NextResponse.redirect(`${config.appUrl}/agent?error=${encodeURIComponent("Signing in with that CRM isn't switched on.")}`);
  return NextResponse.redirect(await startUrl(s));
}
