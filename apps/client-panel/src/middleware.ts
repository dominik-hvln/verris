import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canAccessDashboardRoute } from "@/lib/client-nav-access";
import { fetchSessionProfile } from "@/lib/session-profile";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  const pathname = request.nextUrl.pathname;

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/resend-verification");
  const isPublicHandoff = pathname === "/impersonate" || pathname.startsWith("/accept-invite");
  /** Regulamin, polityka prywatności, cookies, DPA — publiczne (API /legal bez JWT). */
  const isPublicLegal = pathname.startsWith("/legal");

  if (!token && !isAuthPage && !isPublicHandoff && !isPublicLegal && pathname !== "/") {
    return NextResponse.redirect(publicPanelUrl(request, "/login"));
  }

  if (token && isAuthPage) {
    return NextResponse.redirect(publicPanelUrl(request, "/dashboard"));
  }

  if (token && pathname.startsWith("/dashboard")) {
    const session = await fetchSessionProfile(token);
    if (!session) {
      const login = publicPanelUrl(request, "/login");
      login.searchParams.set("reason", "session-ended");
      const res = NextResponse.redirect(login);
      res.cookies.delete("auth_token");
      return res;
    }
    if (
      session.isSubaccount &&
      !canAccessDashboardRoute(pathname, session)
    ) {
      return NextResponse.redirect(publicPanelUrl(request, "/dashboard"));
    }
  }

  return NextResponse.next();
}

function publicPanelUrl(request: NextRequest, path: string): URL {
  const configuredBase = process.env.CLIENT_PANEL_URL?.trim();
  if (configuredBase) return new URL(path, configuredBase);

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return new URL(path, `${forwardedProto}://${forwardedHost}`);

  return new URL(path, request.url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
