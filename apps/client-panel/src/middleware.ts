import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canAccessDashboardRoute } from "@/lib/client-nav-access";
import { fetchSessionProfileState } from "@/lib/session-profile";
import { CIASTECZKO_WLASCICIELA, opcjeSesji } from "@/lib/auth";
import { sciezkaPowrotu } from "@/lib/sciezka-powrotu";
import { naglowkiCsp } from "@verris/ui/csp";

/**
 * Dalej do strony z CSP z nonce per żądanie (bez `'unsafe-inline'` w script-src). Next czyta nonce
 * z nagłówka CSP żądania i dokleja go do swoich skryptów; własne skrypty inline biorą go z `x-nonce`.
 */
function dalejZCsp(request: NextRequest): NextResponse {
  const { headers, csp } = naglowkiCsp(request.headers);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

const PANEL_CHWILOWO_NIEDOSTEPNY = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="15"><title>Panel chwilowo niedostępny — Verris</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#091410;color:#b4c2bb;font-family:system-ui,sans-serif}main{max-width:420px;padding:24px;text-align:center}h1{color:#f4f4ee;font-size:20px}a{color:#34e5a0}</style></head><body><main><h1>Panel chwilowo niedostępny</h1><p>Wprowadzamy aktualizację albo mamy krótką przerwę w łączności. Jesteś nadal zalogowany — strona odświeży się sama za kilkanaście sekund.</p><p><a href="https://status.verris.pl">Status usług</a></p></main></body></html>`;

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  const pathname = request.nextUrl.pathname;

  // Impersonacja wygasła (albo API ją odrzuciło), a w przeglądarce czeka odłożona sesja
  // właściciela — wraca ona na miejsce zamiast wylogowania.
  const wlasciciel = request.cookies.get(CIASTECZKO_WLASCICIELA)?.value;
  const przywrocWlasciciela = () => {
    const res = NextResponse.redirect(publicPanelUrl(request, `${pathname}${request.nextUrl.search}`));
    res.cookies.set("auth_token", wlasciciel!, opcjeSesji());
    res.cookies.delete(CIASTECZKO_WLASCICIELA);
    res.cookies.delete("impersonation_operator");
    return res;
  };
  if (!token && wlasciciel) return przywrocWlasciciela();

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

  // Strona panelu bez sesji (np. link z maila do zgody na migrację) → logowanie z powrotem w `next`.
  const logowanieZPowrotem = (powod?: string) => {
    const login = publicPanelUrl(request, "/login");
    if (powod) login.searchParams.set("reason", powod);
    if (pathname.startsWith("/dashboard")) login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return login;
  };

  if (!token && !isAuthPage && !isPublicHandoff && !isPublicLegal && pathname !== "/") {
    return NextResponse.redirect(logowanieZPowrotem());
  }

  if (token && isAuthPage) {
    const cel = pathname.startsWith("/login") ? sciezkaPowrotu(request.nextUrl.searchParams.get("next")) : "/dashboard";
    return NextResponse.redirect(publicPanelUrl(request, cel));
  }

  if (token && pathname.startsWith("/dashboard")) {
    const { profile: session, unauthorized } = await fetchSessionProfileState(token, request.headers.get("x-forwarded-for"));
    if (unauthorized) {
      if (wlasciciel && wlasciciel !== token) return przywrocWlasciciela();
      const res = NextResponse.redirect(logowanieZPowrotem("session-ended"));
      res.cookies.delete("auth_token");
      return res;
    }
    if (!session) {
      // Akcja serwera (nagłówek Next-Action) sama woła API z tokenem klienta, a API sprawdza
      // uprawnienia (customer-permissions.guard) — tu zwracamy ją dalej, żeby komponent dostał
      // swój komunikat po polsku zamiast „An unexpected response was received from the server”.
      if (request.headers.has("next-action")) return dalejZCsp(request);
      // API chwilowo niedostępne (np. wdrożenie): nie wpuszczamy bez znanych uprawnień, ale też
      // nie kasujemy sesji — wcześniej każda taka chwila wylogowywała wszystkich klientów.
      return new NextResponse(PANEL_CHWILOWO_NIEDOSTEPNY, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "15", "Cache-Control": "no-store" },
      });
    }
    if (
      session.isSubaccount &&
      !canAccessDashboardRoute(pathname, session)
    ) {
      return NextResponse.redirect(publicPanelUrl(request, "/dashboard"));
    }
  }

  return dalejZCsp(request);
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
  // fonts/ i brand/ to publiczne pliki statyczne — strona logowania też ich potrzebuje.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts/|brand/).*)"],
};
