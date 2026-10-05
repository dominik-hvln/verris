const adminApi = jest.fn();
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {}
  return { AdminApiError, adminApi: (...a: unknown[]) => adminApi(...a) };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
import { AdminApiError } from "@/lib/api";
import { zwrotPaynowAction } from "./actions";

/** 2026-10-05 — zwrot doładowania Paynow z karty klienta: walidacja kwoty i wywołanie API. */
describe("zwrotPaynowAction", () => {
  beforeEach(() => adminApi.mockReset());

  it("puste pole → cała kwota (bez pola kwota); „20,5” → 20.5", async () => {
    adminApi.mockResolvedValue({ refundId: "R1", status: "PENDING", kwota: "45.67" });
    await expect(zwrotPaynowAction("u1", "wtx-1", " ")).resolves.toEqual({ ok: true, kwota: "45.67", status: "PENDING" });
    expect(adminApi).toHaveBeenLastCalledWith("/admin/billing/paynow/zwrot", { method: "POST", body: { walletTxId: "wtx-1" } });
    await zwrotPaynowAction("u1", "wtx-1", "20,5");
    expect(adminApi.mock.calls[1][1].body).toEqual({ walletTxId: "wtx-1", kwota: 20.5 });
  });

  it("zwrot zrobiony w panelu Paynow → flaga wPaneluPaynow", async () => {
    adminApi.mockResolvedValue({ refundId: "panel-x", status: "WYKONANY_W_PANELU", kwota: "25.00" });
    await zwrotPaynowAction("u1", "wtx-1", "", true);
    expect(adminApi).toHaveBeenLastCalledWith("/admin/billing/paynow/zwrot", { method: "POST", body: { walletTxId: "wtx-1", wPaneluPaynow: true } });
  });

  it("zła kwota → błąd bez API; błąd API → komunikat API", async () => {
    expect((await zwrotPaynowAction("u1", "wtx-1", "-3")).ok).toBe(false);
    expect((await zwrotPaynowAction("u1", "wtx-1", "abc")).ok).toBe(false);
    expect(adminApi).not.toHaveBeenCalled();
    adminApi.mockRejectedValue(new AdminApiError("Paynow odrzucił zwrot (INSUFFICIENT_BALANCE_FUNDS)."));
    await expect(zwrotPaynowAction("u1", "wtx-1", "")).resolves.toEqual({ ok: false, error: "Paynow odrzucił zwrot (INSUFFICIENT_BALANCE_FUNDS)." });
  });
});
