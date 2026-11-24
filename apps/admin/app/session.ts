"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";

export type LoginState = { error?: string } | undefined;

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  if (!(await signIn(email, password))) return { error: "That email and password don't match an admin account." };
  redirect("/");
}

export async function logout() {
  await signOut();
  redirect("/login");
}
