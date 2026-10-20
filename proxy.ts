import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next 16 proxy (formerly middleware) — first gate for the authenticated app
 * shell. It checks only for the *presence* of the session cookie
 * (`accessToken`, set httpOnly by the backend) so an anonymous visitor never
 * flashes a protected page; the authoritative validation happens client-side
 * against `GET /auth/me` (a forged/invalid cookie fails there and the API
 * client redirects to /login on any 401). The cookie's value is never read.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/tasks", "/company", "/onboarding"];

const isProtected = (pathname: string) =>
  PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) return NextResponse.next();

  if (request.cookies.has("accessToken")) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/tasks",
    "/tasks/:path*",
    "/company",
    "/company/:path*",
    "/onboarding",
    "/onboarding/:path*",
  ],
};
