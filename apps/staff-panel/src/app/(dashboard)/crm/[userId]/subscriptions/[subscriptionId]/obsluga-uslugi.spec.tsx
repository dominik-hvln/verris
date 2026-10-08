import { renderToStaticMarkup } from "react-dom/server";

/**
 * PB-44 (decyzja 08.10) — karta usługi w panelu obsługi: zasoby, kopie z odtwarzaniem, migracja wewnętrzna
 * i historia migracji. Akcje tylko z uprawnieniem, 403 i awaria węzła → czytelny komunikat w swojej sekcji.
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
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

import { staffApi, StaffApiError } from "@/lib/staff-api";
import { ObslugaUslugi } from "./obsluga-uslugi";
import { odtworzZKopiiAction, zlecMigracjeWewnetrznaAction } from "./obsluga-actions";

const api = staffApi as jest.Mock;
const Blad = StaffApiError as unknown as new (m: string, s: number) => Error;
const SUB = "00000000-0000-4000-8000-000000000003";

type Odpowiedzi = Record<string, unknown | Error>;
function odpowiedzi(nadpisz: Odpowiedzi = {}) {
  const baza: Odpowiedzi = {
    "/staff/me/access": { isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE", "NODES_VIEW"] },
    [`/admin/subscriptions/${SUB}/usage?window=24h`]: {
      window: "24h",
      account: { daUsername: "firma", domain: "firma.pl", status: "ACTIVE", serverId: "n1", cpuLimit: 100, ramLimitMb: 2048, diskLimitMb: 20480, ioLimitKbps: 10240, scaledCpu: 0, scaledRamMb: 0, scaledDiskMb: 0 },
      latest: { bucketStart: "2026-10-08T10:00:00Z", cpuUsageAvg: 37, memUsageAvgMb: 512, diskUsageMb: 4096, ioUsageKbps: 100 },
      rows: [{ bucketStart: "2026-10-08T10:00:00Z", cpuUsageAvg: 37 }],
    },
    [`/admin/subscriptions/${SUB}/hosting-backups`]: { rows: [{ id: "b1", fileName: "backup-2026-10-07.tar.zst" }, { id: "b2", fileName: "backup-2026-10-06.tar.zst" }], fetchError: null },
    [`/admin/subscriptions/${SUB}/hosting-restore/status`]: null,
    [`/admin/subscriptions/${SUB}/migrations`]: [
      { id: "e2", type: "MIGRATION_INTERNAL_QUEUED", createdAt: "2026-10-08T11:00:00Z", details: { requestId: "e1", ticketId: "t-77" } },
      { id: "e1", type: "MIGRATION_INTERNAL_REQUESTED", createdAt: "2026-10-08T10:55:00Z", details: { targetServerId: "n2", notes: "Węzeł przeciążony — zgłoszenie #77" } },
    ],
    "/admin/servers": [
      { id: "n1", name: "wezel-1", region: "PL", status: "ACTIVE" },
      { id: "n2", name: "wezel-2", region: "DE", status: "ACTIVE" },
      { id: "n3", name: "wezel-3", region: "PL", status: "MAINTENANCE" },
    ],
  };
  const mapa = { ...baza, ...nadpisz };
  api.mockImplementation(async (path: string) => {
    if (!(path in mapa)) throw new Error(`nieoczekiwane wywołanie ${path}`);
    const v = mapa[path];
    if (v instanceof Error) throw v;
    return v;
  });
}

const render = async (account: { domain: string; serverId: string | null } | null = { domain: "firma.pl", serverId: "n1" }) =>
  renderToStaticMarkup(await ObslugaUslugi({ subscriptionId: SUB, userId: "u1", account }));

beforeEach(() => api.mockReset());

describe("ObslugaUslugi — render", () => {
  it("z uprawnieniami: zasoby, kopie z odtwarzaniem, migracja na aktywny inny węzeł, historia z etykietami", async () => {
    odpowiedzi();
    const html = await render();
    expect(html).toContain("Zasoby");
    expect(html).toContain("37 / 100%");
    expect(html).toContain("Kopie i odtwarzanie");
    expect(html).toContain("backup-2026-10-07.tar.zst");
    expect(html).toContain("2 kopie");
    expect(html).toContain("Odtwórz konto z kopii");
    expect(html).toContain("Wpisz domenę, żeby potwierdzić");
    expect(html).toContain("Migracja wewnętrzna");
    expect(html).toContain("wezel-2 (DE)");
    expect(html).toContain("Zleć migrację wewnętrzną");
    expect(html).toContain("Zlecono przeniesienie konta na inny serwer");
    expect(html).toContain("Węzeł docelowy: wezel-2");
    expect(html).toContain("Powód: Węzeł przeciążony — zgłoszenie #77");
    expect(html).toContain('href="/tickets/t-77"');
  });

  it("bez konta hostingowego: tylko historia migracji, bez odczytów z węzła", async () => {
    odpowiedzi({ [`/admin/subscriptions/${SUB}/migrations`]: [] });
    const html = await render(null);
    expect(html).not.toContain("Kopie i odtwarzanie");
    expect(html).not.toContain("Zleć migrację");
    expect(html).toContain("Brak zdarzeń migracji.");
    expect(api.mock.calls.map((c) => c[0])).not.toContain(`/admin/subscriptions/${SUB}/hosting-backups`);
  });
});

describe("ObslugaUslugi — błędy", () => {
  it("węzeł nie oddaje kopii → komunikat w sekcji kopii, reszta karty działa", async () => {
    odpowiedzi({ [`/admin/subscriptions/${SUB}/hosting-backups`]: new Blad("Serwer konta nie odpowiada.", 502) });
    const html = await render();
    expect(html).toContain("Serwer konta nie odpowiada.");
    expect(html).not.toContain("Odtwórz konto z kopii");
    expect(html).toContain("37 / 100%");
    expect(html).toContain("Zlecono przeniesienie konta na inny serwer");
  });

  it("lista kopii częściowa (fetchError) → ostrzeżenie, kopie i tak widoczne", async () => {
    odpowiedzi({ [`/admin/subscriptions/${SUB}/hosting-backups`]: { rows: [{ id: "b1", fileName: "a.tar.zst" }], fetchError: "timeout" } });
    const html = await render();
    expect(html).toContain("lista może być niepełna: timeout");
    expect(html).toContain("a.tar.zst");
  });

  it("awaria API (bez odpowiedzi) → komunikaty zamiast wyjątku", async () => {
    const brak = new Error("ECONNREFUSED");
    odpowiedzi({
      [`/admin/subscriptions/${SUB}/usage?window=24h`]: brak,
      [`/admin/subscriptions/${SUB}/hosting-backups`]: brak,
      [`/admin/subscriptions/${SUB}/migrations`]: brak,
    });
    const html = await render();
    expect(html).toContain("Nie udało się pobrać zużycia zasobów.");
    expect(html).toContain("Nie udało się pobrać kopii konta z serwera.");
    expect(html).toContain("Nie udało się pobrać historii migracji.");
  });
});

describe("ObslugaUslugi — uprawnienia (403)", () => {
  it("403 z API → komunikat o brakującym uprawnieniu „Subskrypcje i usługi”", async () => {
    api.mockRejectedValue(new Blad("Twoja rola nie ma uprawnień do tej operacji.", 403));
    const html = await render();
    expect(html).toContain("Twoja rola nie ma uprawnienia „Subskrypcje i usługi”");
    expect(html).not.toContain("Odtwórz konto z kopii");
  });

  // L1-KARTA — uprawnienia roli systemowej „L1 Konsultant” (apps/api/src/staff-roles/role-systemowe.ts).
  const L1 = ["DASHBOARD_VIEW", "CUSTOMERS_VIEW", "TICKETS_VIEW", "TICKETS_MANAGE", "BILLING_VIEW"];

  it("L1 (bez SUBSCRIPTIONS_MANAGE i podglądu konta) → zasoby i historia migracji; bez kopii z węzła, odtwarzania i migracji", async () => {
    odpowiedzi({ "/staff/me/access": { isAdmin: false, permissions: L1 } });
    const html = await render();
    expect(html).toContain("37 / 100%");
    expect(html).toContain("Zlecono przeniesienie konta na inny serwer");
    expect(html).not.toContain("Kopie i odtwarzanie");
    expect(html).not.toContain("Odtwórz konto z kopii");
    expect(html).not.toContain("Migracja wewnętrzna");
    const wolane = api.mock.calls.map((c) => c[0]);
    expect(wolane).not.toContain(`/admin/subscriptions/${SUB}/hosting-backups`);
    expect(wolane).not.toContain("/admin/servers");
  });

  it("podgląd konta (ACCOUNT_DIAGNOSTICS_VIEW) bez SUBSCRIPTIONS_MANAGE → lista kopii bez odtwarzania i bez migracji", async () => {
    odpowiedzi({ "/staff/me/access": { isAdmin: false, permissions: [...L1, "ACCOUNT_DIAGNOSTICS_VIEW", "NODES_VIEW"] } });
    const html = await render();
    expect(html).toContain("backup-2026-10-07.tar.zst");
    expect(html).not.toContain("Odtwórz konto z kopii");
    expect(html).not.toContain("Migracja wewnętrzna");
    expect(api.mock.calls.map((c) => c[0])).not.toContain("/admin/servers");
  });

  it("awaria /staff/me/access → podgląd bez kopii, odtwarzania i migracji (jak karta klienta, PB-46)", async () => {
    odpowiedzi({ "/staff/me/access": new Blad("Bad Gateway", 502) });
    const html = await render();
    expect(html).toContain("37 / 100%");
    expect(html).toContain("Zlecono przeniesienie konta na inny serwer");
    expect(html).not.toContain("Kopie i odtwarzanie");
    expect(html).not.toContain("Zleć migrację wewnętrzną");
    expect(api.mock.calls.map((c) => c[0])).not.toContain("/admin/servers");
  });

  it("rola bez NODES_VIEW → migracja z komunikatem zamiast formularza, lista węzłów nie wołana", async () => {
    odpowiedzi({ "/staff/me/access": { isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE"] } });
    const html = await render();
    expect(html).toContain("Migracja wewnętrzna");
    expect(html).toContain("„Podgląd węzłów i floty”");
    expect(html).not.toContain("Zleć migrację wewnętrzną");
    expect(api.mock.calls.map((c) => c[0])).not.toContain("/admin/servers");
  });

  it("lista węzłów 403 mimo uprawnień w profilu → czytelny komunikat", async () => {
    odpowiedzi({ "/admin/servers": new Blad("Forbidden", 403) });
    const html = await render();
    expect(html).toContain("„Podgląd węzłów i floty”");
    expect(html).not.toContain("Zleć migrację wewnętrzną");
  });

  it("tylko bieżący węzeł aktywny → nie ma dokąd przenieść", async () => {
    odpowiedzi({ "/admin/servers": [{ id: "n1", name: "wezel-1", region: null, status: "ACTIVE" }] });
    const html = await render();
    expect(html).toContain("Brak innego aktywnego węzła");
  });
});

describe("akcje obsługi", () => {
  it("odtworzenie: wysyła zakres i powód; 403 → komunikat o uprawnieniu", async () => {
    api.mockResolvedValueOnce({ id: "j1" });
    const wejscie = { subscriptionId: SUB, userId: "u1", backupId: "b1", scopeFiles: true, scopeDatabases: false, scopeEmail: false, safetyBackup: true, reason: "Zgłoszenie #77 — kopia z wczoraj" };
    await expect(odtworzZKopiiAction(wejscie)).resolves.toEqual({ ok: true });
    expect(api).toHaveBeenCalledWith(`/admin/subscriptions/${SUB}/hosting-restore`, {
      method: "POST",
      body: { backupId: "b1", scopeFiles: true, scopeDatabases: false, scopeEmail: false, safetyBackup: true, reason: "Zgłoszenie #77 — kopia z wczoraj" },
    });
    api.mockRejectedValueOnce(new Blad("Twoja rola nie ma uprawnień do tej operacji.", 403));
    await expect(odtworzZKopiiAction(wejscie)).resolves.toMatchObject({ ok: false, error: expect.stringContaining("„Subskrypcje i usługi”") });
  });

  it("migracja: błąd walidacji z API przechodzi do operatora", async () => {
    api.mockRejectedValueOnce(new Blad("Docelowy węzeł nie jest aktywny — wybierz aktywny węzeł.", 400));
    await expect(zlecMigracjeWewnetrznaAction({ subscriptionId: SUB, userId: "u1", targetServerId: "n3", notes: "Przeciążenie węzła n1" })).resolves.toEqual({
      ok: false,
      error: "Docelowy węzeł nie jest aktywny — wybierz aktywny węzeł.",
    });
    expect(api).toHaveBeenCalledWith(`/admin/subscriptions/${SUB}/internal-migration`, { method: "POST", body: { targetServerId: "n3", notes: "Przeciążenie węzła n1" } });
  });
});
