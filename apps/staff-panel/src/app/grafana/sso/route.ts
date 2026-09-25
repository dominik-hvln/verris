import { NextRequest, NextResponse } from "next/server";
import { safeGrafanaRedirectUrl } from "@verris/contracts";
import { getStaffAuthToken } from "@/lib/staff-auth-cookie";
import { API_URL } from "@/lib/staff-api";

/**
 * SSO do Grafany bez ciasteczka sesji panelu na całej domenie: serwer panelu prosi API o bilet
 * (jednorazowy kod, 60 s) i przekierowuje na grafana.verris.pl/verris-sso, gdzie API ustawia
 * ciasteczko sesji Grafany tylko dla jej hosta. Token panelu nie opuszcza panelu.
 */
export async function GET(request: NextRequest) {
  const token = await getStaffAuthToken();
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const grafanaBase = process.env.NEXT_PUBLIC_GRAFANA_URL?.trim();
  if (!grafanaBase) {
    return NextResponse.json({ error: "Grafana URL not configured" }, { status: 503 });
  }

  const cel = new URL(safeGrafanaRedirectUrl(request.nextUrl.searchParams.get("to"), grafanaBase));
  const res = await fetch(`${API_URL}/auth/grafana-ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ error: "Brak dostępu do Grafany." }, { status: res.status === 403 ? 403 : 401 });
  }
  const { code } = (await res.json()) as { code: string };
  const sso = new URL("/verris-sso", grafanaBase);
  sso.searchParams.set("code", code);
  sso.searchParams.set("to", cel.pathname + cel.search);
  return NextResponse.redirect(sso);
}
