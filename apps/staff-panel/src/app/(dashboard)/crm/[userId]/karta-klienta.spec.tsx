import { renderToStaticMarkup } from "react-dom/server";

/**
 * PB-46 (decyzja 08.10) — karta klienta w panelu obsługi: te same zakładki i karty w tej samej kolejności co
 * w panelu admina (`KARTY_SEKCJI`), bez operacji tylko-admin; notatka wewnętrzna — podgląd z CUSTOMERS_VIEW,
 * edycja i blokada logowania tylko z CUSTOMERS_MANAGE.
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
  notFound: jest.fn(),
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/staff-api", () => {
  class StaffApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: jest.fn(), staffApiMultipart: jest.fn() };
});
// Warunki indywidualne mają własne testy — tu liczy się tylko miejsce karty.
jest.mock("./warunki-indywidualne", () => ({ WarunkiIndywidualne: () => null }));
// PB-48: karta wniosków to osobny komponent serwerowy (ma własne testy) — tu tylko jej miejsce na karcie.
jest.mock("./operacje-z-wnioskiem", () => ({ OperacjeZWnioskiem: () => <section data-karta="operacje-wnioski" /> }));

import { staffApi, StaffApiError } from "@/lib/staff-api";
import type { StaffCustomerProfile } from "@/lib/crm-profile-data";
import { KARTY_SEKCJI, KARTY_TYLKO_ADMIN, SEKCJE_KARTY_KLIENTA, type SekcjaKartyKlienta } from "@/lib/sekcje-karty-klienta";
import KartaKlienta from "./page";
import { ustawBlokadeAction, zapiszNotatkeAction } from "./operacje-actions";

const api = staffApi as jest.Mock;
const UID = "00000000-0000-4000-8000-0000000000cc";
const NOTATKA = "Dzwoni po 16, woli telefon.";

const profil: StaffCustomerProfile = {
  user: {
    id: UID,
    email: "anna@test.pl",
    firstName: "Anna",
    lastName: "Nowak",
    companyName: null,
    nip: null,
    role: "USER",
    walletBalance: "120.00",
    walletCurrency: "PLN",
    createdAt: "2026-01-10T00:00:00Z",
    isTwoFactorEnabled: true,
    stripeCustomerId: null,
    deletionRequestedAt: null,
    loginBlocked: false,
    loginBlockedReason: null,
    adminInternalNote: NOTATKA,
  },
  subscriptions: [
    {
      id: "s1",
      status: "ACTIVE",
      serviceTag: null,
      interval: "MONTHLY",
      paymentSource: "WALLET",
      priceAmount: "45.00",
      currency: "PLN",
      currentPeriodStart: "2026-09-01T00:00:00Z",
      currentPeriodEnd: "2026-10-01T00:00:00Z",
      cancelAt: null,
      autoscalingEnabled: false,
      plan: { id: "p1", name: "Hosting", slug: "hosting" },
      account: { id: "a1", domain: "sklep.pl", daUsername: "sklep", status: "ACTIVE", server: { id: "w1", name: "fsn-01", ipAddress: "10.0.0.1", hostname: null } },
    },
  ],
  recentTickets: [{ id: "t1", subject: "Strona nie działa", status: "OPEN", priority: "HIGH", department: "TECH", createdAt: "2026-10-01T00:00:00Z", replyCount: 1 }],
  domains: [],
  walletLedger: [],
  recentInvoices: [],
  paymentMethods: [],
  auditTrail: [],
  statusPageOpenIncidents: [],
  customerTimeline: [],
  supportInsights: { riskScore: 40, riskLevel: "medium", reasons: ["Otwarte zgłoszenie bez odpowiedzi"], suggestions: ["Zadzwoń do klienta"] },
};

function odpowiedzi(uprawnienia: string[] | "awaria", isAdmin = false, p: StaffCustomerProfile = profil) {
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka === `/admin/users/${UID}/customer-profile`) return p;
    if (sciezka.startsWith("/admin/custom-terms/user/")) return { uslugi: [] };
    if (sciezka === "/staff/me/access") {
      if (uprawnienia === "awaria") throw new Error("ECONNREFUSED");
      return { role: isAdmin ? "ADMIN" : "STAFF", isAdmin, permissions: uprawnienia };
    }
    throw new Error(`nieoczekiwane ${sciezka}`);
  });
}

const render = async (sekcja?: SekcjaKartyKlienta) =>
  renderToStaticMarkup(await KartaKlienta({ params: Promise.resolve({ userId: UID }), searchParams: Promise.resolve({ sekcja }) }));
const karty = (html: string) => [...html.matchAll(/data-karta="([^"]+)"/g)].map((m) => m[1]);

const PODGLAD = ["CUSTOMERS_VIEW"];
const PELNE = ["CUSTOMERS_VIEW", "CUSTOMERS_MANAGE", "CUSTOM_TERMS_MANAGE"];

describe("PB-46 karta klienta w panelu obsługi", () => {
  beforeEach(() => api.mockReset());

  it.each(SEKCJE_KARTY_KLIENTA)("zakładka %s: karty jak w panelu admina, bez operacji tylko-admin", async (sekcja) => {
    odpowiedzi(PELNE);
    // PB-48: obsługa ma dodatkowo kartę „Operacje wymagające uprawnień” (wniosek) — administrator wniosków nie składa.
    const tylkoObsluga: string[] = sekcja === "dostepy" ? ["operacje-wnioski"] : [];
    expect(karty(await render(sekcja))).toEqual([...KARTY_SEKCJI[sekcja].filter((k) => !KARTY_TYLKO_ADMIN.includes(k)), ...tylkoObsluga]);
  });

  it("zakładki w tej samej kolejności i z tymi samymi nazwami co w adminie", async () => {
    odpowiedzi(PELNE);
    const html = await render();
    const nav = html.slice(html.indexOf('aria-label="Sekcje klienta"'));
    const nazwy = [...nav.matchAll(/<a [^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]).slice(0, 7);
    expect(nazwy).toEqual(["Przegląd", "Usługi (1)", "Rozliczenia", "Warunki indywidualne", "Zgłoszenia (1)", "Dostępy i bezpieczeństwo", "Dziennik"]);
  });

  it("CUSTOMERS_VIEW: notatka tylko do odczytu, bez operacji wrażliwych i bez formularza blokady", async () => {
    odpowiedzi(PODGLAD);
    const przeglad = await render("przeglad");
    expect(przeglad).toContain(NOTATKA);
    expect(przeglad).not.toContain("<textarea");
    expect(przeglad).not.toContain("Operacje wrażliwe");
    expect(karty(przeglad)).not.toContain("operacje");
    expect(karty(await render("dostepy"))).toEqual(["dostep", "operacje-wnioski"]);
  });

  it("CUSTOMERS_MANAGE: notatka edytowalna, blokada logowania dostępna", async () => {
    odpowiedzi(PELNE);
    const przeglad = await render("przeglad");
    expect(przeglad).toMatch(/<textarea[^>]*>Dzwoni po 16/);
    expect(przeglad).toContain("Zablokuj…");
    const dostepy = await render("dostepy");
    expect(dostepy).toContain("Logowanie zablokowane");
    expect(dostepy).not.toMatch(/Reset hasła<|Zmiana adresu e-mail<|Usuń konto/);
  });

  it("awaria /staff/me/access → podgląd (bez formularzy), strona się renderuje", async () => {
    odpowiedzi("awaria");
    const przeglad = await render("przeglad");
    expect(przeglad).toContain(NOTATKA);
    expect(przeglad).not.toContain("<textarea");
  });

  it("administrator zalogowany do panelu obsługi też nie dostaje operacji tylko-admin", async () => {
    odpowiedzi([], true);
    expect(karty(await render("dostepy"))).toEqual(["dostep", "blokada", "operacje-wnioski"]);
  });

  it("zablokowany klient: baner i karta blokady nie obiecują, że wejście na konto działa (JwtStrategy odrzuca zablokowanych)", async () => {
    odpowiedzi(PELNE, false, { ...profil, user: { ...profil.user, loginBlocked: true } });
    const html = await render("dostepy");
    expect(html).not.toContain("nadal działa");
    expect(html.match(/wejście na jego konto z panelu też nie zadziała/g)).toHaveLength(2);
  });

  it("ryzyko i sugestie na przeglądzie", async () => {
    odpowiedzi(PODGLAD);
    const html = await render("przeglad");
    expect(html).toContain("Otwarte zgłoszenie bez odpowiedzi");
    expect(html).toContain("Zadzwoń do klienta");
  });
});

describe("PB-46 zapis z karty klienta", () => {
  beforeEach(() => api.mockReset());

  it("notatka: wysyła wyłącznie notatkę (nie rusza blokady)", async () => {
    api.mockResolvedValue({ ok: true });
    await expect(zapiszNotatkeAction(UID, "  nowa  ")).resolves.toEqual({ ok: true });
    expect(api).toHaveBeenCalledWith(`/admin/users/${UID}/operational`, { method: "PATCH", body: { adminInternalNote: "nowa" } });
  });

  it("blokada: wysyła wyłącznie pola blokady; odblokowanie czyści powód", async () => {
    api.mockResolvedValue({ ok: true });
    await ustawBlokadeAction(UID, true, " spam ");
    expect(api).toHaveBeenLastCalledWith(`/admin/users/${UID}/operational`, { method: "PATCH", body: { loginBlocked: true, loginBlockedReason: "spam" } });
    await ustawBlokadeAction(UID, false, "spam");
    expect(api).toHaveBeenLastCalledWith(`/admin/users/${UID}/operational`, { method: "PATCH", body: { loginBlocked: false, loginBlockedReason: null } });
  });

  it("403 z API → komunikat o brakującym uprawnieniu", async () => {
    api.mockRejectedValue(new (StaffApiError as unknown as new (m: string, s: number) => Error)("Forbidden", 403));
    await expect(zapiszNotatkeAction(UID, "x")).resolves.toEqual({
      ok: false,
      error: "Twoja rola nie ma uprawnienia „Zarządzanie klientami (edycja, blokady)”. Poproś administratora o jego nadanie.",
    });
  });
});
