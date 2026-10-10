import { renderToStaticMarkup } from "react-dom/server";

/**
 * PB-46 (decyzja 08.10) — karta klienta admina ma te same zakładki i karty w tej samej kolejności co karta
 * w panelu obsługi (`KARTY_SEKCJI`, plik identyczny w obu panelach). Doszły: ryzyko i sugestie, diagnostyka
 * DNS/TLS i otwarte incydenty na węzłach klienta.
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn(), adminApiMultipart: jest.fn() }));
// Warunki indywidualne mają własne testy — tu liczy się tylko miejsce karty.
jest.mock("./warunki-indywidualne", () => ({ WarunkiIndywidualne: () => null }));

import { adminApi } from "@/lib/api";
import { KARTY_SEKCJI, SEKCJE_KARTY_KLIENTA, type SekcjaKartyKlienta } from "@/lib/sekcje-karty-klienta";
import KlientStrona from "./page";
import type { ProfilKlienta } from "./profil-data";

const api = adminApi as jest.Mock;
const UID = "00000000-0000-4000-8000-0000000000dd";

const profil: ProfilKlienta = {
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
  recentTickets: [],
  domains: [{ id: "d1", name: "sklep.pl", status: "ACTIVE" }],
  walletLedger: [],
  recentInvoices: [],
  paymentMethods: [],
  auditTrail: [],
  statusPageOpenIncidents: [
    { id: "i1", serverId: "w1", serverName: "fsn-01", probeKind: "HTTP", probeTarget: "x", severity: "MAJOR", title: "fsn-01 nie odpowiada", publicMessage: null, startedAt: "2026-09-26T07:00:00Z" },
  ],
  customerTimeline: [],
  supportInsights: { riskScore: 40, riskLevel: "medium", reasons: ["Otwarte zgłoszenie bez odpowiedzi"], suggestions: ["Zadzwoń do klienta"] },
};

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka.split("?")[0] === `/admin/users/${UID}/customer-profile`) return profil;
    if (sciezka === `/admin/users/${UID}/operational-detail`)
      return { ...profil.user, loginBlockedReason: null, adminInternalNote: "notatka", isInternal: false, subscriptionsCount: 1 };
    if (sciezka.startsWith("/admin/custom-terms/user/")) return { uslugi: [] };
    throw new Error(`nieoczekiwane ${sciezka}`);
  });
  global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never;
});

const render = async (sekcja?: SekcjaKartyKlienta) =>
  renderToStaticMarkup(await KlientStrona({ params: Promise.resolve({ userId: UID }), searchParams: Promise.resolve({ sekcja }) }));
const karty = (html: string) => [...html.matchAll(/data-karta="([^"]+)"/g)].map((m) => m[1]);

describe("PB-46 karta klienta admina", () => {
  it.each(SEKCJE_KARTY_KLIENTA)("zakładka %s: karty jak w panelu obsługi (pełne uprawnienia)", async (sekcja) => {
    expect(karty(await render(sekcja))).toEqual(KARTY_SEKCJI[sekcja]);
  });

  it("przegląd: ryzyko i sugestie (wcześniej tylko liczba w „Kondycji”)", async () => {
    const html = await render("przeglad");
    expect(html).toContain("Ryzyko i sugestie");
    expect(html).toContain("Otwarte zgłoszenie bez odpowiedzi");
    expect(html).toContain("Zadzwoń do klienta");
  });

  it("usługi: diagnostyka DNS i TLS dla domeny konta", async () => {
    const html = await render("uslugi");
    expect(html).toContain("Diagnostyka DNS i TLS");
    expect(html).toContain("Hosting — sklep.pl");
  });

  it("rozliczenia: faktura prowadzi do swojej strony (plan E, patch 10)", async () => {
    const zFaktura = { ...profil, recentInvoices: [{ id: "f1", number: "VFV/2026/10/0001", status: "PAID", amount: "45.00", currency: "PLN", paidAt: null, createdAt: "2026-10-01T00:00:00Z" }] };
    api.mockImplementation(async (sciezka: string) => {
      if (sciezka.split("?")[0] === `/admin/users/${UID}/customer-profile`) return zFaktura;
      if (sciezka === `/admin/users/${UID}/operational-detail`) return { ...profil.user, loginBlockedReason: null, adminInternalNote: "", isInternal: false, subscriptionsCount: 1 };
      if (sciezka.startsWith("/admin/custom-terms/user/")) return { uslugi: [] };
      throw new Error(`nieoczekiwane ${sciezka}`);
    });
    expect(await render("rozliczenia")).toContain('href="/invoices/f1"');
  });

  it("otwarte incydenty na węzłach klienta widać nad zakładkami", async () => {
    expect(await render("dziennik")).toContain("fsn-01 nie odpowiada");
  });
});
