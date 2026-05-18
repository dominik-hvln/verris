import { NextRequest, NextResponse } from "next/server";

/**
 * Handoff route — receives a freshly minted impersonation token from the admin
 * panel and stores it as the regular `auth_token` cookie, then redirects into
 * the dashboard.
 *
 * Implemented as a Route Handler (GET) so we can mutate cookies — this isn't
 * possible from a plain Server Component in Next 15.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  const returnToParam = url.searchParams.get("returnTo");
  const returnTo =
    returnToParam && returnToParam.startsWith("/") ? returnToParam : "/dashboard";
  const operator = url.searchParams.get("operator") === "staff" ? "staff" : "admin";

  if (!token) {
    const errorUrl = publicPanelUrl(req, "/login");
    errorUrl.searchParams.set("error", "impersonation_no_token");
    return NextResponse.redirect(errorUrl);
  }

  const target = publicPanelUrl(req, returnTo);
  const response = NextResponse.redirect(target);

  response.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });

  response.cookies.set("impersonation_operator", operator, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });

  return response;
}

function publicPanelUrl(req: NextRequest, path: string): URL {
  const configuredBase = process.env.CLIENT_PANEL_URL?.trim();
  if (configuredBase) return new URL(path, configuredBase);

  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return new URL(path, `${forwardedProto}://${forwardedHost}`);

  return new URL(path, req.url);
}
