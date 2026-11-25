import { NextResponse, type NextRequest } from "next/server";

// Signed-out visitors go to /login. The session (and that you're a platform admin)
// is checked against the database on every page and every action.
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/login" || req.nextUrl.pathname.startsWith("/listgate-logo")) return NextResponse.next();
  if (req.cookies.get("lg_admin")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|listgate-mark.png).*)"] };
