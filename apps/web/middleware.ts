import { NextResponse, type NextRequest } from "next/server";

// Cookie-signed-in API writes must come from Listgate's own pages. Feeds and the partner API are called
// by other servers (CRMs, the FTP receiver, partners) with their own credentials, so they skip the check.
const PUBLIC_API = ["/api/feeds/", "/api/v1/"];
const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const APP_HOSTS = (process.env.APP_HOSTS || "listgate.com.au,www.listgate.com.au,app.listgate.com.au,localhost,127.0.0.1")
  .split(",")
  .map((h) => h.trim().toLowerCase());

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (WRITE.has(req.method) && pathname.startsWith("/api/") && !PUBLIC_API.some((p) => pathname.startsWith(p))) {
    const origin = req.headers.get("origin");
    const fetchSite = req.headers.get("sec-fetch-site");
    let ok = fetchSite ? fetchSite === "same-origin" || fetchSite === "none" : true;
    if (origin) {
      try {
        ok = APP_HOSTS.includes(new URL(origin).hostname.toLowerCase());
      } catch {
        ok = false;
      }
    }
    if (!ok) return NextResponse.json({ error: "This request has to come from Listgate itself." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
