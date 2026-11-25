import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { LoginForm } from "./form";
import { APP_URL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (await getAdmin()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d2d4f] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/listgate-logo-white.png" alt="Listgate" className="h-9 w-auto" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">Admin</span>
        </div>
        <div className="card p-6 shadow-xl">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mb-5 text-sm text-zinc-500">Use your Listgate email and password.</p>
          <LoginForm />
          <p className="mt-4 text-xs text-zinc-500">No password yet? <a className="underline" href={`${APP_URL}/login`}>Email yourself a sign-in link</a> in the app, then set one under Account.</p>
        </div>
      </div>
    </main>
  );
}
