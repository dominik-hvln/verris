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
  const zrodla = ["page.tsx", "operational-forms.tsx", "dzialania-klienta.tsx", "diagnostyka-dns-tls.tsx"].map((f) => readFileSync(`${__dirname}/${f}`, "utf8")).join("\n");
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
