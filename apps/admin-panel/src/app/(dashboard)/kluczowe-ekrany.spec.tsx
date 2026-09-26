import { renderToStaticMarkup } from "react-dom/server";

/**
 * X-05 — kluczowe ekrany admina z danymi (uzupełnia strony-przy-awarii-api: tam awaria, tu treść).
 * Pulpit „Stan platformy” i zgłoszenia — to, co admin ogląda pierwsze i na czym podejmuje decyzje.
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

import { adminApi } from "@/lib/api";
import { AdminDashboardReal } from "@/components/admin-dashboard-real";
import type { AdminDashboardOverview } from "@/lib/admin-overview-data";
import ZgloszeniaStrona from "./tickets/page";
import WezelStrona from "./nodes/[id]/page";
import type { PrzegladWezla } from "./nodes/[id]/przeglad-data";
import KlientStrona from "./customers/[userId]/page";
import type { ProfilKlienta } from "./customers/[userId]/profil-data";

const api = adminApi as jest.Mock;
const tekst = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function pulpit(zmiany: Partial<AdminDashboardOverview> = {}): AdminDashboardOverview {
  return {
    generatedAt: "2026-09-26T08:00:00Z",
    users: { total: 3, clients: 2, staffAndAdmin: 1 },
    subscriptions: { byStatus: {}, active: 2 },
    servers: { total: 2, active: 2, byStatus: {} },
    accounts: { total: 2 },
    tickets: { openNonClosed: 1 },
    billing: { periodDays: 30, walletNetPln: "0", walletByTypePln: {} },
    serverRows: [],
    recentSubscriptions: [],
    naUwadze: [],
    flota: {
      manifest: "2026.09.1",
      wezly: [
        { id: "w1", nazwa: "fsn-01", status: "ACTIVE", stan: "ok", cpuProc: 37, poza: null, konta: 12, sygnal: "na żywo", naZywo: true },
        { id: "w2", nazwa: "fsn-02", status: "ACTIVE", stan: "crit", cpuProc: null, poza: "brak sygnału od 14 min", konta: 3, sygnal: "14 min", naZywo: false },
      ],
    },
    klienci: { razem: 2, nowi7d: 1, dzienne7: [0, 0, 0, 0, 0, 1, 0] },
    uslugi: { aktywne: 2, hosting: 1, poczta: 1, inne: 0, zakladane: 0, zawieszone: 0, wszystkie: 2 },
    wplywy: { okresDni: 30, bruttoPln: "1234.56", dzienne7: [0, 0, 0, 0, 0, 0, 0] },
    zgloszenia: { otwarte: 1, poTerminie: 0, dzis: 0 },
    zdarzenia: [],
    noweUslugi: [],
    ...zmiany,
  };
}

describe("X-05 pulpit „Stan platformy”", () => {
  it("bez spraw: jasny komunikat, że nic nie wymaga uwagi", () => {
    const t = tekst(renderToStaticMarkup(<AdminDashboardReal o={pulpit()} />));
    expect(t).toContain("Nic nie wymaga uwagi");
    expect(t).toContain("Wszystkie węzły, zgłoszenia i płatności są w porządku.");
  });

  it("sprawy: liczba z odmianą, pilne oznaczone, akcja prowadzi do miejsca naprawy", () => {
    const html = renderToStaticMarkup(
      <AdminDashboardReal
        o={pulpit({
          naUwadze: [
            { waga: "crit", tytul: "fsn-02 nie odpowiada", opis: "brak sygnału od 14 min", akcja: "Otwórz węzeł", href: "/nodes/w2" },
            { waga: "warn", tytul: "Zgłoszenie po terminie", opis: "#abc", akcja: "Odpowiedz", href: "/tickets/t1" },
          ],
        })}
      />,
    );
    const t = tekst(html);
    expect(t).toContain("2 sprawy wymagają uwagi");
    expect(html).toContain('aria-label="pilne"');
    expect(html).toContain('href="/nodes/w2"');
    // Zgłoszenie żyje w panelu obsługi — link nie może prowadzić do nieistniejącej trasy admina.
    expect(html).not.toContain('href="/tickets/t1"');
    expect(html).toMatch(/href="https?:\/\/[^"]+\/tickets\/t1"/);
  });

  it("flota: węzeł bez sygnału pokazuje powód zamiast paska CPU", () => {
    const t = tekst(renderToStaticMarkup(<AdminDashboardReal o={pulpit()} />));
    expect(t).toContain("fsn-01");
    expect(t).toContain("brak sygnału od 14 min");
    expect(t).toContain("manifest 2026.09.1");
    expect(t).toContain("w terminie SLA");
  });
});

describe("X-05 zgłoszenia", () => {
  const godzina = 3600_000;
  const zgl = (id: string, o: Record<string, unknown>) => ({
    id: `${id}0000000`,
    subject: `Temat ${id}`,
    status: "OPEN",
    priority: "NORMAL",
    department: "TECHNICAL",
    createdAt: "2026-09-26T08:00:00Z",
    user: { email: `${id}@test.pl` },
    ...o,
  });

  beforeEach(() => {
    api.mockReset();
    api.mockResolvedValue([
      zgl("a", { slaResponseDueAt: new Date(Date.now() + godzina).toISOString() }),
      zgl("b", { slaResponseDueAt: new Date(Date.now() - godzina).toISOString() }),
      zgl("c", { status: "CLOSED" }),
      zgl("d", { slaResponseDueAt: new Date(Date.now() - godzina).toISOString(), firstResponseAt: new Date().toISOString() }),
    ]);
  });

  const render = async (widok?: string) => tekst(renderToStaticMarkup(await ZgloszeniaStrona({ searchParams: Promise.resolve({ widok }) })));

  it("otwarte: bez zamkniętych, po terminie na górze, liczniki widoków", async () => {
    const t = await render();
    expect(t).not.toContain("Temat c");
    expect(t.indexOf("Temat b")).toBeLessThan(t.indexOf("Temat a"));
    expect(t).toContain("Otwarte · 3");
    expect(t).toContain("Po terminie SLA · 1");
    expect(t).toContain("Zamknięte · 1");
  });

  it("po terminie: tylko bez pierwszej odpowiedzi i po terminie (odpowiedziane się nie liczą)", async () => {
    const t = await render("po-terminie");
    expect(t).toContain("Temat b");
    expect(t).not.toContain("Temat a");
    expect(t).not.toContain("Temat d");
  });

  it("nieznany widok wraca do otwartych", async () => {
    expect(await render("cokolwiek")).toContain("Temat a");
  });
});

describe("X-05 strona węzła", () => {
  const ID = "00000000-0000-4000-8000-0000000000aa";
  const przeglad: PrzegladWezla = {
    id: ID,
    nazwa: "fsn-01",
    region: "FSN1",
    ip: "10.0.0.1",
    status: "ACTIVE",
    stan: "ok",
    poza: null,
    przyjmujeKonta: true,
    sygnal: "na żywo",
    naZywo: true,
    wersje: { cloudlinux: "9.4", directadmin: "1.680", manifest: "2026.09.0", agent: "2.3.0" },
    manifestFloty: "2026.09.1",
    zasoby: {
      cpu: { proc: 37, rdzenie: 16, sprzedane: 2.5, limit: 4 },
      ram: { uzyteMb: 32768, razemMb: 131072, rezerwaProc: 20 },
      dysk: { uzyteMb: 512000, razemMb: 3_800_000, przydzieloneMb: 900000 },
      konta: { razem: 12, limit: 200, autoskalowane: 1 },
    },
    zgodnosc: { pozycje: [{ co: "PHP 8.4", oczekiwane: "8.4.12", faktyczne: "8.4.10", zgodne: false }], rozjazdy: 1, bezRaportu: false },
    gotowosc: [{ co: "Kopie zapasowe", stan: "ok", opis: "ostatnia 03:10", naprawa: null }],
    doNaprawy: 0,
    obciazone: [{ id: "a1", domena: "sklep.pl", plan: "Hosting", klient: "Anna Nowak", klientId: "u1", autoskalowanieCpu: 0, proc: 64 }],
    zadania: [],
  };

  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (sciezka: string) => {
      if (sciezka === `/admin/servers/${ID}/przeglad`) return przeglad;
      if (sciezka === `/admin/servers/${ID}`) return { id: ID, name: "fsn-01", ipAddress: "10.0.0.1", region: "FSN1", status: "ACTIVE", acceptsNewAccounts: true, daHost: "da.fsn-01", _count: { accounts: 12 } };
      throw new Error(`nieoczekiwane ${sciezka}`);
    });
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never;
  });

  const render = async () =>
    tekst(renderToStaticMarkup(await WezelStrona({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) })));

  it("zasoby z rzeczywistego zużycia, rozjazd manifestu z flotą widoczny", async () => {
    const t = await render();
    expect(t).toContain("fsn-01");
    expect(t).toContain("CPU realne");
    expect(t).toContain("% z 16 rdzeni");
    expect(t).toContain("manifest 2026.09.0 (flota: 2026.09.1)");
    expect(t).toContain("sklep.pl");
  });

  it("węzeł bez próbek CPU: mówi wprost, że brak danych, zamiast pokazać 0%", async () => {
    przeglad.zasoby.cpu.proc = null;
    const t = await render();
    expect(t).toContain("brak próbek z ostatnich 10 min");
    przeglad.zasoby.cpu.proc = 37;
  });
});

describe("X-05 karta klienta", () => {
  const UID = "00000000-0000-4000-8000-0000000000bb";
  const SERWER = { id: "s-awaria", name: "fsn-02", ipAddress: "10.0.0.2", hostname: null };
  const usluga = (id: string, o: Partial<ProfilKlienta["subscriptions"][number]>): ProfilKlienta["subscriptions"][number] => ({
    id,
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
    account: { id: `a-${id}`, domain: `${id}.pl`, daUsername: id, status: "ACTIVE", server: null },
    ...o,
  });
  const profil: ProfilKlienta = {
    user: {
      id: UID,
      email: "anna@test.pl",
      firstName: "Anna",
      lastName: "Nowak",
      companyName: "Biuro Anna",
      nip: null,
      role: "CLIENT",
      walletBalance: "120.00",
      walletCurrency: "PLN",
      createdAt: "2026-01-10T00:00:00Z",
      isTwoFactorEnabled: true,
      stripeCustomerId: null,
      deletionRequestedAt: null,
      loginBlocked: false,
    },
    subscriptions: [
      usluga("sklep", { individualPrice: "30.00", listPriceAmount: "45.00", account: { id: "a1", domain: "sklep.pl", daUsername: "sklep", status: "ACTIVE", server: SERWER } }),
      usluga("blog", {}),
    ],
    recentTickets: [],
    domains: [],
    walletLedger: [],
    recentInvoices: [],
    paymentMethods: [],
    auditTrail: [],
    statusPageOpenIncidents: [
      { id: "i1", serverId: "s-awaria", serverName: "fsn-02", probeKind: "HTTP", probeTarget: "x", severity: "MAJOR", title: "fsn-02 nie odpowiada", publicMessage: null, startedAt: "2026-09-26T07:00:00Z" },
    ],
    customerTimeline: [],
    supportInsights: { riskScore: 0, riskLevel: "low", reasons: [], suggestions: [] },
  };

  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (sciezka: string) => {
      if (sciezka === `/admin/users/${UID}/customer-profile`) return profil;
      if (sciezka === `/admin/users/${UID}/operational-detail`)
        return { ...profil.user, loginBlocked: false, loginBlockedReason: null, adminInternalNote: null, subscriptionsCount: 2 };
      throw new Error(`nieoczekiwane ${sciezka}`);
    });
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never;
  });

  const render = async () =>
    tekst(renderToStaticMarkup(await KlientStrona({ params: Promise.resolve({ userId: UID }), searchParams: Promise.resolve({}) })));

  it("usługa na węźle z otwartym incydentem ma stan „awaria”, zdrowa — nie", async () => {
    const t = await render();
    expect(t).toContain("Biuro Anna");
    expect(t).toMatch(/sklep\.pl.*awaria/);
    expect(t).not.toMatch(/blog\.pl[^|]*awaria/);
  });

  it("cena indywidualna pokazana obok ceny z cennika", async () => {
    const t = await render();
    expect(t).toContain("cennik 45");
    expect(t).toContain("Saldo portfela");
  });
});
