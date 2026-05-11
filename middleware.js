import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { ROUTE_ROLE_MAP } from "@/types/auth.types";

/**
 * Public routes that do not require authentication.
 */
const PUBLIC_ROUTES = ["/login", "/403"];
const PUBLIC_PREFIXES = ["/api/auth", "/_next", "/favicon.ico"];

/**
 * Determine if a pathname is public (no auth required).
 * @param {string} pathname
 * @returns {boolean}
 */
function isPublicRoute(pathname) {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Determine the required role for a given pathname.
 * Returns null if no role restriction applies.
 * @param {string} pathname
 * @returns {string[]|null}
 */
function getRequiredRoles(pathname) {
  for (const [prefix, roles] of Object.entries(ROUTE_ROLE_MAP)) {
    if (pathname.startsWith(prefix)) {
      return roles;
    }
  }
  return null;
}

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Allow public routes through without any checks
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // No session → redirect to /login
  if (!session || !session.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check role-based access
  const requiredRoles = getRequiredRoles(pathname);
  if (requiredRoles && !requiredRoles.includes(session.user.role)) {
    // Wrong role → redirect to 403 page
    const forbiddenUrl = new URL("/403", req.url);
    return NextResponse.redirect(forbiddenUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
