import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await currentUser()) redirect("/app");
  const { expired } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-sky px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6"><Logo height={28} /></div>
        <h1 className="mb-1 text-2xl font-bold">Sign in</h1>
        <p className="mb-5 text-sm text-slate-600">Agencies sending listings through Listgate, and Listgate staff.</p>
        <LoginForm expired={!!expired} />
      </div>
    </main>
  );
}
