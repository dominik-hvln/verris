/** D11 — akcje serwera tablicy migracji: trasy z białej listy, 403 strażnika jako nazwa uprawnienia. */
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { adminApi, AdminApiError } from "@/lib/api";
import { dzialanieTablicyAction, podgladRaportuAction } from "./tablica-actions";
import { opisZdarzenia } from "./tablica-typy";

const api = adminApi as jest.Mock;
beforeEach(() => api.mockReset());

it("działania trafiają na trasy karty migracji (POST); podgląd raportu — GET", async () => {
  api.mockResolvedValue({ id: "m/1" });
  await dzialanieTablicyAction("m/1", "etap", { etap: "TESTY" });
  await dzialanieTablicyAction("m/1", "sprawdz-dns");
  await podgladRaportuAction("m/1");
  expect(api.mock.calls).toEqual([
    ["/admin/migrations/m%2F1/etap", { method: "POST", body: { etap: "TESTY" } }],
    ["/admin/migrations/m%2F1/sprawdz-dns", { method: "POST", body: {} }],
    ["/admin/migrations/m%2F1/raport"],
  ]);
});

it("nieznane działanie — bez API; 403 strażnika — nazwa uprawnienia; odmowa z treścią — treść", async () => {
  expect(await dzialanieTablicyAction("m1", "constructor" as never)).toEqual({ ok: false, error: "Nieznane działanie." });
  expect(api).not.toHaveBeenCalled();
  api.mockRejectedValue(new AdminApiError("Forbidden", 403));
  expect(await dzialanieTablicyAction("m1", "raport")).toEqual({ ok: false, error: "Twoja rola nie ma uprawnienia MIGRATIONS_MANAGE." });
  api.mockRejectedValue(new AdminApiError("TTL domen zmienione na 300", 400));
  expect(await dzialanieTablicyAction("m1", "etap", { etap: "DO_ZMIANY_DNS" })).toEqual({ ok: false, error: "TTL domen zmienione na 300" });
});

it("oś czasu: etap z powodem, pozycja checklisty, zmienione pola, ponowny raport, nieznana akcja jak jest", () => {
  expect(opisZdarzenia("MIGRATION_STAGE_CHANGED", { z: "ZAMKNIETA", na: "TESTY", powod: "Błąd formularza" })).toBe(
    "Zmiana etapu: Zamknięta → Testy u nas — Błąd formularza",
  );
  expect(opisZdarzenia("MIGRATION_CHECKLIST_UPDATED", { pole: "ttl300", odhaczone: true })).toBe("Checklista: TTL 300 ✓");
  expect(opisZdarzenia("MIGRATION_CHECKLIST_UPDATED", { pole: "testPo", odhaczone: false })).toBe("Checklista: test po — wyczyszczone");
  expect(opisZdarzenia("MIGRATION_HANDLING_UPDATED", { zmiany: { przerywacz: {}, przypisanyDoId: {} } })).toBe(
    "Zmiana terminów lub przypisania: Przerywacz, prowadzący",
  );
  expect(opisZdarzenia("MIGRATION_REPORT_SENT", { ponownie: true })).toBe("Raport wysłany do klienta (ponownie)");
  expect(opisZdarzenia("COS_NOWEGO", null)).toBe("COS_NOWEGO");
});
