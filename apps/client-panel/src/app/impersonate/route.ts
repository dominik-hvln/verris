import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Przejęcie sesji klienta przez operatora (impersonacja). W adresie przychodzi tylko jednorazowy
 * kod (60 s) z API — serwer panelu wymienia go na token (POST /auth/handoff) i zapisuje w ciasteczku.
 * Token nie trafia do historii przeglądarki ani logów. Nieznany / zużyty kod → logowanie, a
 * istniejąca sesja zostaje nietknięta (wcześniej dowolny ciąg nadpisywał ciasteczko — wylogowanie
 * ofiary jednym linkiem).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const operator = url.searchParams.get("operator") === "staff" ? "staff" : "admin";

  const token = /^[A-Za-z0-9_-]{43}$/.test(code) ? await wymien(code) : null;
  if (!token) {
    const errorUrl = publicPanelUrl(req, "/login");
    errorUrl.searchParams.set("error", code ? "impersonation_invalid" : "impersonation_no_token");
    return NextResponse.redirect(errorUrl);
  }

  const response = NextResponse.redirect(bezpiecznyCel(req, url.searchParams.get("returnTo")));
  const opcje = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 30 };
  response.cookies.set("auth_token", token, opcje);
  response.cookies.set("impersonation_operator", operator, opcje);
  return response;
}

async function wymien(code: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const { access_token } = (await res.json()) as { access_token?: unknown };
    return typeof access_token === "string" && access_token ? access_token : null;
  } catch {
    return null;
  }
}

/**
 * Cel przekierowania tylko w panelu: po zbudowaniu adresu musi mieć ten sam origin co panel
 * (parser URL usuwa np. tabulator, więc „/\t/evil.com” zamieniał się w „//evil.com”).
 */
function bezpiecznyCel(req: NextRequest, returnTo: string | null): URL {
  const baza = publicPanelUrl(req, "/dashboard");
  if (!returnTo || !returnTo.startsWith("/")) return baza;
  try {
    const cel = new URL(returnTo, baza);
    return cel.origin === baza.origin ? cel : baza;
  } catch {
    return baza;
  }
}

function publicPanelUrl(req: NextRequest, path: string): URL {
  const configuredBase = process.env.CLIENT_PANEL_URL?.trim();
  if (configuredBase) return new URL(path, configuredBase);

  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return new URL(path, `${forwardedProto}://${forwardedHost}`);

  return new URL(path, req.url);
}
