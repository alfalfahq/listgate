export const LISTING_STATUS: Record<string, string> = { current: "For sale", under_offer: "Under offer", sold: "Sold", leased: "Leased", withdrawn: "Withdrawn", off_market: "Off market" };

const AVATAR = ["bg-rose-50 text-rose-600", "bg-amber-50 text-amber-700", "bg-emerald-50 text-emerald-700", "bg-sky-50 text-sky-700", "bg-violet-50 text-violet-600", "bg-teal-50 text-teal-700", "bg-orange-50 text-orange-600", "bg-indigo-50 text-indigo-600"];
export function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

export function initials(name: string) {
  const w = name.replace(/[^\p{L} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] ?? "?").slice(0, 2)).toUpperCase();
}

export const num = (n: number) => n.toLocaleString("en-AU");

export function date(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" });
}

export function ago(d: Date | null | undefined) {
  if (!d) return "—";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  return date(d);
}

/** "site.deployed" → "Site deployed" */
export const actionLabel = (a: string) => {
  const s = a.replace(/[._]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "listgate.com.au";
export const ADMIN_URL = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
export const FTP_HOST = process.env.FTP_HOST ?? "ftp.listgate.com.au";
export const feedUrl = (token: string) => `${APP_URL}/api/feeds/reaxml/${encodeURIComponent(token)}`;
export function when(d: Date | null | undefined) {
  return d ? d.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
}
