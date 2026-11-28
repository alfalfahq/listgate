// Slows down password guessing: a key (an email, an IP) gets a few failed sign-ins per window, then waits.
// Held in memory, which is fine for a single server; a restart just clears it.
import { headers } from "next/headers";

const g = globalThis as unknown as { __loginFails?: Map<string, number[]> };
const fails: Map<string, number[]> = (g.__loginFails ??= new Map<string, number[]>());

/** Minutes until this key may try again, or 0 if it can try now. */
export function lockedFor(key: string, max: number, windowMin = 15) {
  const now = Date.now();
  const recent = (fails.get(key) ?? []).filter((t) => now - t < windowMin * 60_000);
  fails.set(key, recent);
  return recent.length >= max ? Math.max(1, Math.ceil((recent[0] + windowMin * 60_000 - now) / 60_000)) : 0;
}

export function noteFailure(key: string) {
  const list = fails.get(key) ?? [];
  list.push(Date.now());
  fails.set(key, list.slice(-50));
  if (fails.size > 20_000) fails.clear();
}

export function clearFailures(key: string) {
  fails.delete(key);
}

/**
 * The caller's IP. App Platform sets do-connecting-ip itself, so it can't be faked; otherwise use the last
 * x-forwarded-for hop (added by our proxy), never the first (which the caller writes).
 */
export async function clientIp() {
  const h = await headers();
  const direct = h.get("do-connecting-ip");
  if (direct) return direct.trim();
  const hops = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return hops[hops.length - 1] || "local";
}
