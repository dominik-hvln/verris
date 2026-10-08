import { renderToStaticMarkup } from "react-dom/server";

/**
 * L1-KARTA (decyzja 08.10) — karta usługi otwiera się L1 Konsultantowi w podglądzie: nagłówek, konto, zasoby
 * i historia (sekcje obsługi), bez zmiany planu, migracji za klienta, podglądu konta i kopii. Lista planów do zmiany
 * nie jest wołana bez SUBSCRIPTIONS_MANAGE — wcześniej jej 403 wywracał całą stronę. Z uprawnieniami — jak dotąd.
 */
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock("lucide-react", () => ({ ArrowLeft: () => null }));
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));
jest.mock("@/lib/staff-api", () => {
  class StaffApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: jest.fn() };
});
// Sekcje z własnymi testami (obsluga-uslugi.spec.tsx, konto-klienta.spec.tsx) — tu tylko czy są na karcie.
jest.mock("./obsluga-uslugi", () => ({ ObslugaUslugi: () => <div data-sekcja="obsluga">Zasoby · Historia migracji</div> }));
jest.mock("./diagnostics-panel", () => ({ StaffDiagnosticsPanel: () => <div data-sekcja="diagnostyka" /> }));
jest.mock("./konto-klienta-panel", () => ({ KontoKlientaPanel: () => <div data-sekcja="konto-klienta" /> }));
jest.mock("./staff-plan-change-form", () => ({
  StaffPlanChangeForm: (p: { plans: { name: string }[] }) => <div data-sekcja="zmiana-planu">{p.plans.map((x) => x.name).join(",")}</div>,
}));
jest.mock("./ticket-template", () => ({ PlanChangeTicketTemplate: () => null }));

import { staffApi, StaffApiError } from "@/lib/staff-api";
import StaffSubscriptionReadonlyPage from "./page";

const api = staffApi as jest.Mock;
const Blad = StaffApiError as unknown as new (m: string, s: number) => Error;
const SUB = "00000000-0000-4000-8000-0000000000a1";
const USER = "u-1";
const L1 = ["DASHBOARD_VIEW", "CUSTOMERS_VIEW", "TICKETS_VIEW", "TICKETS_MANAGE", "BILLING_VIEW"];
const L2 = [...L1, "ACCOUNT_DIAGNOSTICS_VIEW", "SUBSCRIPTIONS_MANAGE", "MIGRATIONS_MANAGE", "CUSTOMERS_IMPERSONATE", "NODES_VIEW"];

const USLUGA = {
  id: SUB,
  status: "ACTIVE",
  serviceTag: null,
  interval: "MONTH",
  priceAmount: "45.00",
  currency: "PLN",
  currentPeriodEnd: null,
  autoscalingEnabled: false,
  plan: { id: "p1", name: "Hosting Start", slug: "start" },
  user: { id: USER, email: "jan@firma.pl", firstName: "Jan", lastName: "Kowalski" },
  account: { id: "a1", domain: "firma.pl", daUsername: "firma", status: "ACTIVE", serverId: "n1", server: { id: "n1", name: "wezel-1", region: "PL", hostname: null } },
  events: [],
};

function odpowiedzi(uprawnienia: string[] | Error, plany: unknown = [{ id: "p2", name: "Hosting Pro", slug: "pro" }]) {
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka === `/admin/subscriptions/${SUB}`) return USLUGA;
    if (sciezka === "/staff/me/access") {
      if (uprawnienia instanceof Error) throw uprawnienia;
      return { role: "STAFF", isAdmin: false, permissions: uprawnienia };
    }
    if (sciezka === `/admin/subscriptions/${SUB}/plan/eligible-plans`) {
      if (plany instanceof Error) throw plany;
      return plany;
    }
    throw new Error(`nieoczekiwane wywołanie ${sciezka}`);
  });
}

const render = async () => renderToStaticMarkup(await StaffSubscriptionReadonlyPage({ params: Promise.resolve({ userId: USER, subscriptionId: SUB }) }));
const wolane = () => api.mock.calls.map((c) => c[0]);

beforeEach(() => api.mockReset());

describe("karta usługi — L1 Konsultant (podgląd)", () => {
  it("otwiera się: nagłówek, konto, sekcje obsługi i diagnostyka; bez zmiany planu, migracji za klienta i podglądu konta", async () => {
    odpowiedzi(L1);
    const html = await render();
    expect(html).toContain("Hosting Start");
    expect(html).toContain("Jan Kowalski");
    expect(html).toContain("firma.pl");
    expect(html).toContain('data-sekcja="obsluga"');
    expect(html).toContain('data-sekcja="diagnostyka"');
    expect(html).toContain("Zmiany w usłudze (plan, odtwarzanie z kopii, migracje) wykonuje obsługa od poziomu L2");
    expect(html).not.toContain("Zmiana planu");
    expect(html).not.toContain('data-sekcja="zmiana-planu"');
    expect(html).not.toContain("Migracja za klienta");
    expect(html).not.toContain('data-sekcja="konto-klienta"');
    expect(wolane()).not.toContain(`/admin/subscriptions/${SUB}/plan/eligible-plans`);
  });

  it("awaria /staff/me/access → podgląd bez akcji i bez diagnostyki, karta nadal się otwiera", async () => {
    odpowiedzi(new Blad("Bad Gateway", 502));
    const html = await render();
    expect(html).toContain("Hosting Start");
    expect(html).toContain('data-sekcja="obsluga"');
    expect(html).not.toContain('data-sekcja="diagnostyka"');
    expect(html).not.toContain("Migracja za klienta");
    expect(wolane()).not.toContain(`/admin/subscriptions/${SUB}/plan/eligible-plans`);
  });
});

describe("karta usługi — z uprawnieniami (L2)", () => {
  it("jak dotąd: zmiana planu, migracja za klienta, podgląd konta, diagnostyka; bez informacji dla L1", async () => {
    odpowiedzi(L2);
    const html = await render();
    expect(html).toContain('data-sekcja="zmiana-planu"');
    expect(html).toContain("Hosting Pro");
    expect(html).toContain(`href="/migrations/za-klienta?subscriptionId=${SUB}"`);
    expect(html).toContain('data-sekcja="konto-klienta"');
    expect(html).toContain('data-sekcja="diagnostyka"');
    expect(html).not.toContain("wykonuje obsługa od poziomu L2");
  });

  it("migracja za klienta tylko z MIGRATIONS_MANAGE (nie z samego SUBSCRIPTIONS_MANAGE)", async () => {
    odpowiedzi([...L1, "SUBSCRIPTIONS_MANAGE"]);
    const html = await render();
    expect(html).toContain('data-sekcja="zmiana-planu"');
    expect(html).not.toContain("Migracja za klienta");
    expect(html).not.toContain('data-sekcja="konto-klienta"');
  });

  it("błąd listy planów → komunikat w sekcji zmiany planu, reszta karty działa", async () => {
    odpowiedzi(L2, new Blad("Internal Server Error", 500));
    const html = await render();
    expect(html).toContain("Nie udało się pobrać planów do zmiany.");
    expect(html).toContain('data-sekcja="obsluga"');
    expect(html).not.toContain('data-sekcja="zmiana-planu"');
  });
});

it("operator bez podglądu klientów i usług: 403 z API karty → komunikat zamiast wyjątku", async () => {
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka === "/staff/me/access") return { role: "STAFF", isAdmin: false, permissions: [] };
    throw new Blad("Twoja rola nie ma uprawnień do tej operacji.", 403);
  });
  const html = await render();
  expect(html).toContain("Twoje konto nie ma uprawnienia do tego widoku.");
});
