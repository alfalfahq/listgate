import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { signInCrmUser, sourceBySlug, verifyLink } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Manage on Listgate" from inside the CRM: a short-lived signed link that signs the agent in. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const s = await sourceBySlug((await ctx.params).slug);
  if (!s) return NextResponse.redirect(`${config.appUrl}/agent`);
  try {
    const u = verifyLink(s, new URL(req.url).searchParams);
    await signInCrmUser(s, u, "link");
    return NextResponse.redirect(`${config.appUrl}/agent`);
  } catch (e) {
    return NextResponse.redirect(`${config.appUrl}/agent?error=${encodeURIComponent(e instanceof Error ? e.message : "Sign-in failed.")}`);
  }
}
