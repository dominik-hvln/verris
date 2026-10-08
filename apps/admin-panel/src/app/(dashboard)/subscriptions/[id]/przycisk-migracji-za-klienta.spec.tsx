import { renderToStaticMarkup } from "react-dom/server";

/**
 * ADMIN-MIGR — karta usługi w adminie ma „Migrację za klienta” przy koncie hostingowym (jak karta usługi w obsłudze);
 * bez konta hostingowego przycisku nie ma (nie ma dokąd przenieść danych).
 */
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock("@/lib/api", () => ({ adminApi: jest.fn() }));
jest.mock("../../plans/data", () => ({ listAdminPlans: jest.fn(async () => []) }));
// Panele karty mają własne testy — tu liczy się tylko nagłówek z kontem.
jest.mock("./internal-migration-form", () => ({ InternalMigrationForm: () => null }));
jest.mock("./plan-change-form", () => ({ PlanChangeForm: () => null }));
jest.mock("./usage-panel", () => ({ ServiceUsagePanel: () => null }));
jest.mock("./diagnostics-panel", () => ({ DiagnosticsPanel: () => null }));
jest.mock("./konto-klienta-panel", () => ({ KontoKlientaPanel: () => null }));
jest.mock("./suspend-form", () => ({ SuspendForm: () => null, ZakonczIUsunForm: () => null }));
jest.mock("./restore-panel", () => ({ RestorePanel: () => null }));
jest.mock("./odtworzenie-na-wezle-panel", () => ({ OdtworzenieNaWezlePanel: () => null }));

import { adminApi } from "@/lib/api";
import AdminSubscriptionDetailPage from "./page";

const api = adminApi as jest.Mock;
const SUB = "00000000-0000-4000-8000-0000000000aa";

const usluga = (account: unknown) => ({
  id: SUB,
  status: "ACTIVE",
  serviceTag: "H-1",
  interval: "MONTH",
  priceAmount: "45.00",
  currency: "PLN",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  user: { id: "u1", email: "jan@firma.pl", firstName: "Jan", lastName: null },
  plan: { id: "p1", name: "Hosting", slug: "hosting", cpuLimit: 1, ramLimitMb: 1024, diskLimitMb: 10240 },
  account,
  events: [],
});

const render = async (account: unknown) => {
  api.mockImplementation(async (p: string) => (p === `/admin/subscriptions/${SUB}` ? usluga(account) : []));
  return renderToStaticMarkup(await AdminSubscriptionDetailPage({ params: Promise.resolve({ id: SUB }) }));
};

beforeEach(() => api.mockReset());

it("konto hostingowe → przycisk „Migracja za klienta” z ID usługi", async () => {
  const html = await render({ id: "a1", domain: "firma.pl", daUsername: "firma", status: "ACTIVE", server: null });
  expect(html).toContain(`href="/migrations/za-klienta?subscriptionId=${SUB}"`);
  expect(html).toContain("Migracja za klienta");
});

it("bez konta hostingowego → bez przycisku", async () => {
  const html = await render(null);
  expect(html).toContain("Brak konta");
  expect(html).not.toContain("/migrations/za-klienta");
});
