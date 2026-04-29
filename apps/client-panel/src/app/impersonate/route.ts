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

  if (!token) {
    const errorUrl = new URL("/login", url);
    errorUrl.searchParams.set("error", "impersonation_no_token");
    return NextResponse.redirect(errorUrl);
  }

  const target = new URL(returnTo, url);
  const response = NextResponse.redirect(target);

  response.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });

  return response;
}
