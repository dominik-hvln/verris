import { NextRequest, NextResponse } from "next/server";
import { safeGrafanaRedirectUrl } from "@verris/contracts";
import { ADMIN_COOKIE_NAME, getAdminAuthToken } from "@/lib/auth";
import { panelAuthCookieDomain, panelAuthCookieOptions } from "@/lib/auth-cookie";

export async function GET(request: NextRequest) {
  const token = await getAdminAuthToken();
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const grafanaBase = process.env.NEXT_PUBLIC_GRAFANA_URL?.trim();
  if (!grafanaBase) {
    return NextResponse.json({ error: "Grafana URL not configured" }, { status: 503 });
  }

  const target = safeGrafanaRedirectUrl(
    request.nextUrl.searchParams.get("to"),
    grafanaBase,
  );
  const response = NextResponse.redirect(target);
  response.cookies.set(
    ADMIN_COOKIE_NAME,
    token,
    panelAuthCookieOptions(panelAuthCookieDomain()),
  );
  return response;
}
