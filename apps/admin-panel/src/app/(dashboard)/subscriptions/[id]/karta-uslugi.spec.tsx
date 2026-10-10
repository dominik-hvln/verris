import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Plan E, patch 9 — karta usługi: zakładki v2, Ponów / Odrzuć zakładanie i zlecenia migracji na karcie,
 * linki do klienta, węzła i /migrations/[id], bez kodów zadań w nagłówkach.
 */
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/" }));
jest.mock("@/lib/api", () => ({ adminApi: jest.fn() }));
jest.mock("../../plans/data", () => ({ listAdminPlans: jest.fn(async () => []) }));
jest.mock("./internal-migration-form", () => ({ InternalMigrationForm: () => null }));
jest.mock("./plan-change-form", () => ({ PlanChangeForm: () => null }));
jest.mock("./usage-panel", () => ({ ServiceUsagePanel: () => null }));
jest.mock("./diagnostics-panel", () => ({ DiagnosticsPanel: () => null }));
jest.mock("./konto-klienta-panel", () => ({ KontoKlientaPanel: () => null }));
jest.mock("./suspend-form", () => ({ SuspendForm: () => null, ZakonczIUsunForm: () => null }));
jest.mock("./restore-panel", () => ({ RestorePanel: () => null }));
jest.mock("./odtworzenie-na-wezle-panel", () => ({ OdtworzenieNaWezlePanel: () => null }));

import { adminApi } from "@/lib/api";
import { AKCJE_USLUGI } from "@/lib/akcje/usluga";
import KartaUslugi from "./page";

const api = adminApi as jest.Mock;
const SUB = "00000000-0000-4000-8000-0000000000bb";
const ADMIN = { role: "ADMIN", isAdmin: true, permissions: [] };

const usluga = (o: Record<string, unknown> = {}) => ({
  id: SUB,
  status: "ACTIVE",
  provisioningStage: null,
  serviceTag: "H-7",
  interval: "MONTH",
  priceAmount: "45.00",
  currency: "PLN",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  user: { id: "u1", email: "jan@firma.pl", firstName: "Jan", lastName: null },
  plan: { id: "p1", name: "Hosting", slug: "hosting", cpuLimit: 1, ramLimitMb: 1024, diskLimitMb: 10240 },
  account: { id: "a1", domain: "firma.pl", daUsername: "firma", status: "ACTIVE", server: { id: "w1", name: "t1", region: "fsn" } },
  events: [],
  ...o,
});

function render(sekcja: string | undefined, odpowiedzi: Record<string, unknown>, dostep: unknown = ADMIN) {
  api.mockImplementation(async (p: string) => {
    if (p === "/staff/me/access") return dostep;
    if (p in odpowiedzi) {
      const v = odpowiedzi[p];
      if (v instanceof Error) throw v;
      return v;
    }
    return [];
  });
  return KartaUslugi({ params: Promise.resolve({ id: SUB }), searchParams: Promise.resolve({ sekcja }) }).then((el) => renderToStaticMarkup(el));
}

beforeEach(() => api.mockReset());

describe("karta usługi", () => {
  it("przegląd: klient i węzeł są linkami, „Działania” z rejestru", async () => {
    const html = await render(undefined, { [`/admin/subscriptions/${SUB}`]: usluga() });
    expect(html).toContain('href="/customers/u1"');
    expect(html).toContain('href="/nodes/w1"');
    expect(html).toContain('data-dzialania="dzialania-uslugi"');
    expect(html).toContain(`href="/subscriptions/${SUB}?sekcja=migracje#zlecenia-migracji"`);
    expect(html).not.toContain('id="zakladanie"');
  });

  it("nieudane zakładanie: Ponów i Odrzuć na karcie, z jobem tej usługi", async () => {
    const html = await render(undefined, {
      [`/admin/subscriptions/${SUB}`]: usluga({ status: "PROVISIONING", provisioningStage: "failed" }),
      [`/admin/provisioning-queue?subscriptionId=${SUB}`]: {
        async: true,
        rows: [{ id: `stripe-${SUB}`, attemptsMade: 3, failedReason: "Węzeł nie odpowiada", failedCategory: "transient", data: {}, subscription: null }],
      },
    });
    expect(html).toContain('id="zakladanie"');
    expect(html).toContain("Węzeł nie odpowiada");
    expect(html).toContain("3 próby");
    expect(html).toContain(">Ponów<");
    expect(html).toContain(">Odrzuć<");
    expect(api).toHaveBeenCalledWith(`/admin/provisioning-queue?subscriptionId=${SUB}`);
  });

  it("nieudane zakładanie bez PROVISIONING_MANAGE: mówi, czego brakuje, i działanie jest wyszarzone", async () => {
    const html = await render(
      undefined,
      {
        [`/admin/subscriptions/${SUB}`]: usluga({ status: "PROVISIONING", provisioningStage: "failed" }),
        [`/admin/provisioning-queue?subscriptionId=${SUB}`]: new Error("403"),
      },
      { role: "STAFF", isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE"] },
    );
    expect(html).toContain("Ponowienie wymaga PROVISIONING_MANAGE.");
    expect(html).toContain('title="Wymaga PROVISIONING_MANAGE"');
  });

  it("migracje: zlecenie z linkiem do /migrations/[id] i działaniami (wznów, ponów krok)", async () => {
    const html = await render("migracje", {
      [`/admin/subscriptions/${SUB}`]: usluga(),
      [`/admin/migrations?subscriptionId=${SUB}`]: {
        rows: [
          { id: "m1", subscriptionId: SUB, status: "ATTENTION", targetDomain: "firma.pl", needsAttention: true, attentionReason: "Brak bazy", ticketId: null, lastError: null, createdAt: "2026-10-01T10:00:00Z", jobs: [] },
        ],
      },
    });
    expect(html).toContain('href="/migrations/m1"');
    expect(html).toContain("Pilne");
    expect(html).toContain("Wznów automat");
    expect(html).not.toContain("Otwórz usługę");
  });

  it("nagłówki bez kodów zadań (A‑25, H‑18, PC‑3, G‑7, H‑16)", () => {
    const strona = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(strona).not.toMatch(/\((?:A|H|PC|G)[‑-]\d+\)/);
  });

  it("każda kotwica z rejestru działań istnieje na karcie", () => {
    const strona = readFileSync(join(__dirname, "page.tsx"), "utf8");
    for (const a of AKCJE_USLUGI) {
      const kotwica = a.href({ id: SUB, klientId: "u1", wezelId: "w1" }).split("#")[1];
      if (kotwica) expect(strona).toContain(`id="${kotwica}"`);
    }
  });

  // Przegląd 10.10: kartę otwiera też NOC (SUBSCRIPTIONS_MANAGE bez CUSTOMERS_VIEW i NODES_VIEW) — linki do kart
  // klienta i węzła kończyły się dla niego odmową.
  it("bez CUSTOMERS_VIEW i NODES_VIEW: klient i węzeł jako tekst; bez linku do Kolejki zadań bez PROVISIONING_MANAGE", async () => {
    const html = await render(
      undefined,
      {
        [`/admin/subscriptions/${SUB}`]: usluga({ status: "PROVISIONING", provisioningStage: "failed" }),
        [`/admin/provisioning-queue?subscriptionId=${SUB}`]: new Error("403"),
      },
      { role: "STAFF", isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE"] },
    );
    expect(html).toContain("jan@firma.pl");
    expect(html).not.toContain('href="/customers/u1"');
    expect(html).not.toContain('href="/nodes/w1"');
    expect(html).not.toContain('href="/provisioning-queue');
  });
});
