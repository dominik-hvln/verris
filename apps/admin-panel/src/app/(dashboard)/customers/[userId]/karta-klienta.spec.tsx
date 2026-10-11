import { renderToStaticMarkup } from "react-dom/server";

/**
 * PB-46 (decyzja 08.10) — karta klienta admina ma te same zakładki i karty w tej samej kolejności co karta
 * w panelu obsługi (`KARTY_SEKCJI`, plik identyczny w obu panelach). Doszły: ryzyko i sugestie, diagnostyka
 * DNS/TLS i otwarte incydenty na węzłach klienta.
 */
// D1 — bramka strony (uprawnienia z mapy STRONY) ma własne testy (uprawnienia-stron.spec.tsx); tu treść strony.
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
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

import { readFileSync } from "node:fs";
import { adminApi } from "@/lib/api";
import { AKCJE_KLIENTA } from "@/lib/akcje/klient";
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
    // Pełne uprawnienia (administrator) — D1: bez nich karta chowa działania tylko dla administratora.
    if (sciezka === "/staff/me/access") return { role: "ADMIN", isAdmin: true, permissions: [] };
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
      if (sciezka === "/staff/me/access") return dostep;
      throw new Error(`nieoczekiwane ${sciezka}`);
    });
    let dostep: unknown = { role: "ADMIN", isAdmin: true, permissions: [] };
    expect(await render("rozliczenia")).toContain('href="/invoices/f1"');
    // Przegląd 10.10: strona faktury wymaga BILLING_VIEW — konsultant z samym CUSTOMERS_VIEW dostawał link do odmowy.
    dostep = { role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW"] };
    const bezFaktur = await render("rozliczenia");
    expect(bezFaktur).toContain("VFV/2026/10/0001");
    expect(bezFaktur).not.toContain('href="/invoices/f1"');
  });

  it("otwarte incydenty na węzłach klienta widać nad zakładkami", async () => {
    expect(await render("dziennik")).toContain("fsn-01 nie odpowiada");
  });
});

/** Plan E, patch 11 — działania na kliencie z /deliverability, /resellers i /referral-enrollments na karcie. */
describe("karta klienta — działania (patch 11)", () => {
  const otwarte = { id: "t-1", subject: "Nie działa poczta", status: "OPEN", priority: "NORMAL", createdAt: "2026-10-09T10:00:00Z", firstResponseAt: null, slaResponseDueAt: null, replyCount: 0 };
  function dane(o: { cordons?: unknown; resellers?: unknown; zgloszenia?: unknown; dostep?: unknown } = {}) {
    api.mockImplementation(async (sciezka: string) => {
      if (sciezka.split("?")[0] === `/admin/users/${UID}/customer-profile`) return { ...profil, recentTickets: [otwarte] };
      if (sciezka === `/admin/users/${UID}/operational-detail`)
        return { ...profil.user, loginBlockedReason: null, adminInternalNote: "", isInternal: false, subscriptionsCount: 1 };
      if (sciezka.startsWith("/admin/custom-terms/user/")) return { uslugi: [] };
      if (sciezka === "/staff/me/access") return o.dostep ?? { role: "ADMIN", isAdmin: true, permissions: [] };
      if (sciezka === "/admin/deliverability/cordons") return { cordons: o.cordons ?? [] };
      if (sciezka === "/admin/reseller") {
        if (o.resellers instanceof Error) throw o.resellers;
        return o.resellers ?? [];
      }
      if (sciezka === "/admin/users/referral-enrollments") return o.zgloszenia ?? [];
      throw new Error(`nieoczekiwane ${sciezka}`);
    });
  }
  const blokada = { userId: UID, reason: "500 maili w 5 minut", at: "2026-10-09T08:00:00Z", email: "anna@test.pl", name: "Anna" };
  const zgloszenie = {
    id: "r1",
    userId: UID,
    status: "PENDING",
    appliedAt: "2026-10-08T00:00:00Z",
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: null,
    termsVersion: null,
    user: { id: UID, email: "anna@test.pl", firstName: "Anna", lastName: null, referralCode: "ANNA1", ecoPoints: 0 },
  };

  it("przegląd: „Działania” z blokadą poczty, programem partnerskim i odpowiedzią w panelu obsługi", async () => {
    dane({ cordons: [blokada], zgloszenia: [zgloszenie] });
    const html = await render("przeglad");
    expect(html).toContain('data-dzialania="dzialania-klienta"');
    expect(html).toContain(`href="/customers/${UID}?sekcja=dostepy#blokada-poczty"`);
    expect(html).toContain(`href="/customers/${UID}?sekcja=rozliczenia#program-partnerski"`);
    expect(html).toContain(`href="/customers/${UID}?sekcja=rozliczenia#reseller"`);
    expect(html).toMatch(/href="https:\/\/staff\.verris\.pl\/tickets\/t-1" target="_blank"/);
    expect(html).toContain('id="akcje-klienta"');
  });

  it("F2.5 — Zgłoszenia: „Nowe zgłoszenie w imieniu klienta” z TICKETS_MANAGE, bez niego — brak formularza", async () => {
    dane();
    const html = await render("zgloszenia");
    expect(html).toContain('id="nowe-zgloszenie"');
    expect(html).toContain("Napisz do klienta");
    dane({ dostep: { role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "TICKETS_VIEW"] } });
    const podglad = await render("zgloszenia");
    expect(podglad).not.toContain('id="nowe-zgloszenie"');
    expect(podglad).toContain("Nie działa poczta");
    expect(AKCJE_KLIENTA.find((a) => a.id === "nowe-zgloszenie")?.href({ id: UID })).toBe(`/customers/${UID}?sekcja=zgloszenia#nowe-zgloszenie`);
  });

  it("przegląd bez blokady poczty: bez działania „Zdejmij blokadę”", async () => {
    dane();
    expect(await render("przeglad")).not.toContain("#blokada-poczty");
  });

  it("dostępy: blokada poczty z powodem i przyciskiem dla admina", async () => {
    dane({ cordons: [blokada] });
    const html = await render("dostepy");
    expect(html).toContain('id="blokada-poczty"');
    expect(html).toContain("500 maili w 5 minut");
    expect(html).toContain("Zdejmij blokadę");
  });

  it("rozliczenia: włączenie resellera bez wpisywania ID i akceptacja w programie partnerskim", async () => {
    dane({ zgloszenia: [zgloszenie] });
    const html = await render("rozliczenia");
    expect(html).toContain('id="reseller"');
    expect(html).toContain("Włącz resellera");
    expect(html).not.toContain("E-mail lub ID klienta");
    expect(html).toContain('id="program-partnerski"');
    expect(html).toContain("Akceptuj");
  });

  it("rozliczenia bez CUSTOMERS_MANAGE (403 z /admin/reseller): sekcja mówi, czego brakuje", async () => {
    dane({ resellers: new Error("403"), dostep: { role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW"] } });
    expect(await render("rozliczenia")).toContain("Wymaga CUSTOMERS_MANAGE.");
  });

  it("fala 1B: z CUSTOMERS_MANAGE błąd /admin/reseller to „Nie udało się wczytać”, nie „Wymaga …”", async () => {
    dane({ resellers: new Error("ECONNREFUSED") });
    const html = (await render("rozliczenia")).split('id="reseller"')[1];
    expect(html).toContain("Nie udało się wczytać danych resellera.");
    expect(html).not.toContain("Wymaga CUSTOMERS_MANAGE.");
  });
});

it("każda kotwica z rejestru działań klienta istnieje na karcie", () => {
  const zrodla = ["page.tsx", "operational-forms.tsx", "dzialania-klienta.tsx", "diagnostyka-dns-tls.tsx", "nowe-zgloszenie.tsx", "portfel-operacje.tsx", "rozliczenia-klienta.tsx"].map((f) => readFileSync(`${__dirname}/${f}`, "utf8")).join("\n");
  for (const a of AKCJE_KLIENTA) {
    const kotwica = a.href({ id: UID }).split("#")[1];
    if (kotwica) expect(zrodla).toMatch(new RegExp(`id="${kotwica}"`));
  }
});

/** Fala 1B — gotowe endpointy API na karcie: maile do klienta, historia logowań, „Kto oglądał”. */
describe("karta klienta — komunikacja, logowania, kto oglądał (fala 1B)", () => {
  const mail = { id: "m1", category: "TRANSACTIONAL", tag: "security.password-reset", subject: "Ustaw nowe hasło", status: "SENT", createdAt: "2026-10-09T10:00:00Z", sentAt: "2026-10-09T10:00:01Z", errorMessage: null };
  function dane(extra: Record<string, unknown>) {
    api.mockImplementation(async (sciezka: string) => {
      if (sciezka.split("?")[0] === `/admin/users/${UID}/customer-profile`) return profil;
      if (sciezka === `/admin/users/${UID}/operational-detail`) return { ...profil.user, loginBlockedReason: null, adminInternalNote: "", isInternal: false, subscriptionsCount: 1 };
      if (sciezka.startsWith("/admin/custom-terms/user/")) return { uslugi: [] };
      if (sciezka in extra) return extra[sciezka];
      throw new Error(`nieoczekiwane ${sciezka}`);
    });
  }
  const renderZ = async (sekcja: SekcjaKartyKlienta, mailId?: string) =>
    renderToStaticMarkup(await KlientStrona({ params: Promise.resolve({ userId: UID }), searchParams: Promise.resolve({ sekcja, mail: mailId }) }));

  it("zakładka „Komunikacja” jest w adminie, lista prowadzi do podglądu", async () => {
    dane({ [`/admin/email-log/user/${UID}?limit=50`]: [mail] });
    const html = await renderZ("komunikacja");
    expect(html).toContain(">Komunikacja</a>");
    expect(html).toContain("Ustaw nowe hasło");
    expect(html).toContain(`href="/customers/${UID}?sekcja=komunikacja&amp;mail=m1#podglad"`);
    expect(html).toContain("Wybierz mail z listy.");
  });

  it("podgląd pokazuje to, co oddało API (tokeny zamaskowane w API), a mail innego klienta — nie", async () => {
    const podglad = { ...mail, toEmail: "anna@test.pl", userId: UID, providerId: "smtp", messageId: null, campaignId: null, metadata: { listUnsubscribeUrl: "https://api.verris.pl/unsubscribe?token=•••" } };
    dane({ [`/admin/email-log/user/${UID}?limit=50`]: [mail], "/admin/email-log/m1": podglad });
    const html = await renderZ("komunikacja", "m1");
    expect(html).toContain("unsubscribe?token=•••");
    expect(html).toContain("zamaskowane");
    dane({ [`/admin/email-log/user/${UID}?limit=50`]: [mail], "/admin/email-log/m1": { ...podglad, userId: "inny" } });
    expect(await renderZ("komunikacja", "m1")).toContain("Nie udało się wczytać maila.");
  });

  it("dostępy: historia logowań klienta z IP i wynikiem", async () => {
    dane({
      [`/admin/users/${UID}/login-history`]: {
        user: { id: UID, email: "anna@test.pl", role: "USER", loginBlocked: false, loginBlockedReason: null },
        lockout: { windowMinutes: 15, threshold: 10, recentFailures: 0, currentlyLockedOut: false },
        suspiciousAlerts: [],
        rows: [{ id: "l1", kind: "failure", occurredAt: "2026-10-09T09:00:00Z", ip: "203.0.113.7", userAgent: "Firefox", isNewDevice: true, method: null, countryCode: "PL", reason: "bad_password" }],
      },
    });
    const html = await renderZ("dostepy");
    expect(html).toContain('id="logowania"');
    expect(html).toContain("203.0.113.7");
    expect(html).toContain("błędne hasło");
    expect(html).toContain("nowe urządzenie");
  });

  it("dziennik: „Kto oglądał” — tylko otwarcia przez operatorów, z adresem operatora", async () => {
    dane({
      [`/admin/users/${UID}/staff-audit?limit=200`]: {
        rows: [
          { id: "a1", action: "OPERATOR_CUSTOMER_CARD_VIEWED", actorUserId: "op1", actorEmail: "ola@verris.pl", impersonatedBy: null, details: null, createdAt: "2026-10-10T08:00:00Z" },
          { id: "a2", action: "PLAN_CHANGED", actorUserId: UID, actorEmail: "anna@test.pl", impersonatedBy: null, details: null, createdAt: "2026-10-10T07:00:00Z" },
        ],
      },
    });
    const html = await renderZ("dziennik");
    const sekcja = html.slice(html.indexOf('data-karta="kto-ogladal"'));
    expect(sekcja).toContain('href="/operators/op1"');
    expect(sekcja).toContain("ola@verris.pl");
    expect(sekcja).not.toContain("anna@test.pl");
  });
});

/** Fala 1B — działanie „Dane nabywcy” (PATCH /admin/billing/nabywcy/:id/vat/dane, BILLING_MANAGE). */
describe("karta klienta — dane nabywcy (fala 1B)", () => {
  function dane(dostep: unknown, vat: unknown = { kraj: "PL", nip: "7792512345", pozaUe: false, wymagaWeryfikacji: false, weryfikacja: null }) {
    api.mockImplementation(async (sciezka: string) => {
      if (sciezka.split("?")[0] === `/admin/users/${UID}/customer-profile`) return profil;
      if (sciezka === `/admin/users/${UID}/operational-detail`) return { ...profil.user, loginBlockedReason: null, adminInternalNote: "", isInternal: false, subscriptionsCount: 1 };
      if (sciezka.startsWith("/admin/custom-terms/user/")) return { uslugi: [] };
      if (sciezka === `/admin/billing/nabywcy/${UID}/vat`) {
        if (vat instanceof Error) throw vat;
        return vat;
      }
      if (sciezka === "/staff/me/access") return dostep;
      if (sciezka === "/admin/deliverability/cordons") return { cordons: [] };
      if (sciezka === "/admin/reseller" || sciezka === "/admin/users/referral-enrollments") return [];
      throw new Error(`nieoczekiwane ${sciezka}`);
    });
  }

  it("z BILLING_MANAGE: formularz z bieżącym krajem i NIP-em; działanie w rejestrze prowadzi do sekcji", async () => {
    dane({ role: "ADMIN", isAdmin: true, permissions: [] });
    const html = await render("rozliczenia");
    const sekcja = html.slice(html.indexOf('id="dane-nabywcy"'));
    expect(sekcja).toContain('value="7792512345"');
    expect(sekcja).toContain("Zmień dane nabywcy</button>");
    expect(AKCJE_KLIENTA.find((a) => a.id === "dane-nabywcy")?.href({ id: UID })).toBe(`/customers/${UID}?sekcja=rozliczenia#dane-nabywcy`);
    expect(await render("przeglad")).toContain(`href="/customers/${UID}?sekcja=rozliczenia#dane-nabywcy"`);
  });

  it("z samym BILLING_VIEW: przycisk wyszarzony z dymkiem „Wymaga BILLING_MANAGE”", async () => {
    dane({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "BILLING_VIEW"] });
    const sekcja = (await render("rozliczenia")).split('id="dane-nabywcy"')[1]!;
    expect(sekcja).toContain('title="Wymaga BILLING_MANAGE"');
    expect(sekcja).not.toContain("Zmień dane nabywcy</button>");
  });

  it("bez BILLING_VIEW (403 statusu VAT): sekcja mówi, czego brakuje", async () => {
    dane({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW"] }, new Error("403"));
    expect((await render("rozliczenia")).split('id="dane-nabywcy"')[1]).toContain("Wymaga BILLING_VIEW.");
  });

  it("fala 1B: z BILLING_VIEW błąd statusu VAT to „Nie udało się wczytać”, nie „Wymaga BILLING_VIEW”", async () => {
    dane({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "BILLING_VIEW"] }, new Error("ECONNREFUSED"));
    const sekcja = (await render("rozliczenia")).split('id="dane-nabywcy"')[1]!;
    expect(sekcja).toContain("Nie udało się wczytać danych nabywcy.");
    expect(sekcja).not.toContain("Wymaga BILLING_VIEW.");
  });
});

/** F2.4 — notatki wewnętrzne: wiele, z autorem i datą, przypięte pierwsze; dopisuje L1 (TICKETS_MANAGE), audytor tylko czyta. */
describe("F2.4 — notatki na karcie klienta", () => {
  const NOTATKI = {
    notatki: [
      { id: "n1", tresc: "VIP — dzwonić przed zmianami", przypieta: true, utworzono: "2026-10-01T08:00:00Z", autor: null },
      { id: "n2", tresc: "Zaległość wyjaśniona", przypieta: false, utworzono: "2026-10-09T08:00:00Z", autor: { id: "op", nazwa: "Anna Nowak" } },
    ],
  };
  const z = (dostep: unknown, notatki: unknown = NOTATKI) => {
    const baza = api.getMockImplementation()!;
    api.mockImplementation(async (s: string) => {
      if (s === "/staff/me/access") return dostep;
      if (s === `/admin/users/${UID}/notes`) {
        if (notatki instanceof Error) throw notatki;
        return notatki;
      }
      return baza(s);
    });
  };
  const karta = (html: string) => html.slice(html.indexOf('data-karta="notatka"'), html.indexOf('data-karta="operacje"'));

  it("lista z autorem; stara notatka bez autora; formularz dla L1 (CUSTOMERS_VIEW + TICKETS_MANAGE)", async () => {
    z({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "TICKETS_MANAGE"] });
    const k = karta(await render("przeglad"));
    expect(k).toContain("Notatki wewnętrzne");
    expect(k.indexOf("VIP — dzwonić")).toBeLessThan(k.indexOf("Zaległość wyjaśniona"));
    expect(k).toContain('data-notatka="przypieta"');
    expect(k).toContain("Anna Nowak");
    expect(k).toContain("notatka sprzed zmian");
    expect(k).toContain('data-notatki="dodaj"');
    expect(k).toContain("Odepnij");
  });

  it("audytor (bez TICKETS_MANAGE i CUSTOMERS_MANAGE) — tylko odczyt; błąd API — „Nie udało się wczytać”", async () => {
    z({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "TICKETS_VIEW"] });
    const k = karta(await render("przeglad"));
    expect(k).toContain("Zaległość wyjaśniona");
    expect(k).not.toContain('data-notatki="dodaj"');
    expect(k).not.toContain("Przypnij");
    z({ role: "ADMIN", isAdmin: true, permissions: [] }, new Error("500"));
    expect(karta(await render("przeglad"))).toContain("Nie udało się wczytać notatek");
  });

  it("Dostępy → „Zespół klienta”: subkonta, osoby z własnym kontem i zaproszenia, tylko odczyt", async () => {
    const baza = api.getMockImplementation()!;
    api.mockImplementation(async (s: string) =>
      s === `/admin/users/${UID}/zespol`
        ? {
            jestSubkontem: false,
            subkonta: [{ id: "s1", email: "ola@firma.pl", nazwa: "Ola", etykieta: "Księgowa", uprawnienia: ["BILLING_READ"], uslugi: null, wylaczone: false, utworzono: "2026-09-01T00:00:00Z" }],
            czlonkostwa: [{ id: "m1", czlonekId: "u9", email: "dev@agencja.pl", nazwa: null, etykieta: null, uprawnienia: ["SERVICES_MANAGE", "DNS_MANAGE"], uslugi: ["sklep.pl"], utworzono: "2026-09-02T00:00:00Z" }],
            zaproszenia: [{ id: "z1", email: "nowy@firma.pl", etykieta: null, uprawnienia: [], uslugi: null, wygasa: "2026-10-15T00:00:00Z", utworzono: "2026-10-08T00:00:00Z" }],
          }
        : baza(s),
    );
    const html = await render("dostepy");
    const k = html.slice(html.indexOf('data-karta="zespol"'), html.indexOf('data-karta="blokada"'));
    expect(k).toContain("Ola · Księgowa");
    expect(k).toContain("płatności (podgląd) · całe konto");
    expect(k).toContain("usługi, DNS · tylko: sklep.pl");
    expect(k).toContain("własne konto Verris");
    expect(k).toContain("nowy@firma.pl");
    expect(k).not.toContain("<button");
  });
});

/** F3.6 — Rozliczenia: rejestr ruchów portfela (BILLING_VIEW), wpłata i korekta (BILLING_MANAGE), przypomnienia i zawieszenia. */
describe("F3.6 — rozliczenia na karcie klienta", () => {
  const ruchy = {
    saldo: "133.45",
    waluta: "PLN",
    subkonto: false,
    total: 30,
    wiersze: [
      { id: "w1", type: "TOPUP", status: "COMPLETED", amount: "123.45", currency: "PLN", balanceAfter: "133.45", description: "Wpłata przelewem — Faktura 7", paymentProvider: "PRZELEW", paymentRef: "AB-1234", faktura: { id: "f7", number: "VDR/2026/10/0007" }, paynowDoZwrotu: null, createdAt: "2026-10-10T10:00:00Z" },
      { id: "w2", type: "ADJUSTMENT", status: "COMPLETED", amount: "-5.00", currency: "PLN", balanceAfter: "10.00", description: "Korekta salda — obsługa Verris", paymentProvider: "MANUAL", paymentRef: null, faktura: null, paynowDoZwrotu: null, createdAt: "2026-10-09T10:00:00Z" },
    ],
  };
  const windykacja = {
    progi: { przypomnieniaDniPrzed: [7, 3, 1], karencjaDni: 0, zawieszenieDoWygasnieciaDni: 14, retencjaKontaDni: 14 },
    saldo: "5.00",
    uslugi: [
      { id: "s1", userId: UID, usluga: "Hosting · sklep.pl", status: "ACTIVE", zrodlo: "WALLET", koniecOkresu: "2030-01-03T08:00:00Z", obietnicaDo: null, ostatniaNieudana: null, kwotaOdnowienia: "45.00", brakuje: "40.00", etap: "odnowienie", probaOdnowienia: "2030-01-02T08:00:00Z", zawieszenie: "2030-01-03T08:00:00Z", wygasniecie: null, uwaga: "Odnowienie z portfela." },
    ],
    przypomnienia: [{ id: "a1", kiedy: "2026-10-08T09:15:00Z", akcja: "SUBSCRIPTION_REMINDER_T3", etykieta: "Przypomnienie o odnowieniu (3 dni przed)", subscriptionId: "s1", kwota: "45.00", brakuje: "40.00" }],
  };
  const sciezki: string[] = [];
  function dane(dostep: unknown, o: { ruchy?: unknown; windykacja?: unknown } = {}) {
    sciezki.length = 0;
    api.mockImplementation(async (sciezka: string) => {
      sciezki.push(sciezka);
      if (sciezka.split("?")[0] === `/admin/users/${UID}/customer-profile`) return profil;
      if (sciezka === `/admin/users/${UID}/operational-detail`) return { ...profil.user, loginBlockedReason: null, adminInternalNote: "", isInternal: false, subscriptionsCount: 1 };
      if (sciezka.startsWith("/admin/custom-terms/user/")) return { uslugi: [] };
      if (sciezka === "/staff/me/access") return dostep;
      if (sciezka.startsWith(`/admin/rozliczenia/klienci/${UID}/portfel`)) {
        if (o.ruchy instanceof Error) throw o.ruchy;
        return o.ruchy ?? ruchy;
      }
      if (sciezka === `/admin/rozliczenia/klienci/${UID}/windykacja`) {
        if (o.windykacja instanceof Error) throw o.windykacja;
        return o.windykacja ?? windykacja;
      }
      if (sciezka === "/admin/deliverability/cordons") return { cordons: [] };
      if (sciezka === "/admin/reseller" || sciezka === "/admin/users/referral-enrollments") return [];
      throw new Error(`nieoczekiwane ${sciezka}`);
    });
  }
  const renderStrona = async (portfel?: string) =>
    renderToStaticMarkup(await KlientStrona({ params: Promise.resolve({ userId: UID }), searchParams: Promise.resolve({ sekcja: "rozliczenia", portfel }) }));

  it("Finanse: rejestr z kanałem, referencją, fakturą i saldem po; formularze wpłaty i korekty; przypomnienia z datą", async () => {
    dane({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "BILLING_VIEW", "BILLING_MANAGE"] });
    const html = await renderStrona("2");
    expect(sciezki).toContain(`/admin/rozliczenia/klienci/${UID}/portfel?limit=25&offset=25`);
    expect(html).toContain('data-rejestr-portfela=""');
    expect(html).toContain("przelew · AB-1234");
    expect(html).toContain('href="/invoices/f7"');
    expect(html).toContain("2 / 2 · 30 operacji");
    expect(html).toContain('id="wplata"');
    expect(html).toContain('id="korekta"');
    expect(html).toContain('data-sekcja="windykacja"');
    expect(html).toContain("Przypomnienie o odnowieniu (3 dni przed)");
    expect(html).toContain("brakuje 40.00 K");
  });

  it("L1 (BILLING_VIEW bez BILLING_MANAGE): rejestr i przypomnienia tak, wpłata i korekta — nie", async () => {
    dane({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "BILLING_VIEW"] });
    const html = await renderStrona();
    expect(html).toContain('data-rejestr-portfela=""');
    expect(html).not.toContain('id="wplata"');
    expect(html).not.toContain('id="korekta"');
    expect(html).toContain('data-sekcja="windykacja"');
  });

  it("bez BILLING_VIEW: skrót ruchów z profilu, bez zapytań o rozliczenia; awaria API — „Nie udało się wczytać”", async () => {
    dane({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW"] });
    const html = await renderStrona();
    expect(sciezki.some((s) => s.startsWith("/admin/rozliczenia/"))).toBe(false);
    expect(html).not.toContain('data-rejestr-portfela=""');
    expect(html).not.toContain('data-sekcja="windykacja"');
    dane({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "BILLING_VIEW"] }, { windykacja: new Error("ECONNREFUSED") });
    expect((await renderStrona()).split('data-sekcja="windykacja"')[1]).toContain("Nie udało się wczytać przypomnień i zawieszeń.");
  });
});
