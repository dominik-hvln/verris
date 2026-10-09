const adminApi = jest.fn();
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {}
  return { AdminApiError, adminApi: (...a: unknown[]) => adminApi(...a) };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
import { AdminApiError } from "@/lib/api";
import { cofnijWeryfikacjeVatAction, weryfikacjaVatAction } from "../actions";
import { opisStatusuVat } from "./status-vat-opis";

/** Decyzja 09.10 — „Zweryfikuj status VAT nabywcy” na karcie klienta: walidacja, wywołanie API, opis statusu. */
describe("weryfikacja VAT nabywcy — karta klienta", () => {
  beforeEach(() => adminApi.mockReset());

  it("podstawa za krótka → błąd bez API; poprawna → POST z podstawą", async () => {
    expect((await weryfikacjaVatAction("u1", "krótko")).ok).toBe(false);
    expect(adminApi).not.toHaveBeenCalled();
    adminApi.mockResolvedValue({});
    await expect(weryfikacjaVatAction("u1", "  Rejestr CH, potwierdzone  ")).resolves.toEqual({ ok: true });
    expect(adminApi).toHaveBeenLastCalledWith("/admin/billing/nabywcy/u1/vat/weryfikacja", {
      method: "POST",
      body: { podstawa: "Rejestr CH, potwierdzone" },
    });
  });

  it("błąd API (np. brak BILLING_MANAGE) → komunikat API; cofnięcie → POST z powodem", async () => {
    adminApi.mockRejectedValue(new AdminApiError("Brak uprawnienia: BILLING_MANAGE"));
    await expect(weryfikacjaVatAction("u1", "Rejestr CH, potwierdzone")).resolves.toEqual({ ok: false, error: "Brak uprawnienia: BILLING_MANAGE" });
    adminApi.mockReset();
    adminApi.mockResolvedValue({});
    await cofnijWeryfikacjeVatAction("u1", "Księgowa nie potwierdziła");
    expect(adminApi).toHaveBeenLastCalledWith("/admin/billing/nabywcy/u1/vat/cofniecie", {
      method: "POST",
      body: { powod: "Księgowa nie potwierdziła" },
    });
  });

  it("opis: spoza UE bez weryfikacji krzyczy, po weryfikacji pokazuje podstawę", () => {
    expect(opisStatusuVat({ kraj: "US", pozaUe: true, wymagaWeryfikacji: true, weryfikacja: null })).toContain("NIEZWERYFIKOWANY");
    expect(
      opisStatusuVat({
        kraj: "CH", pozaUe: true, wymagaWeryfikacji: false,
        weryfikacja: { at: "2026-10-09T10:00:00Z", przez: "op", podstawa: "Rejestr CH", kraj: "CH", aktualna: true },
      }),
    ).toContain("Rejestr CH");
    expect(opisStatusuVat({ kraj: "PL", pozaUe: false, wymagaWeryfikacji: false, weryfikacja: null })).toBe("Polska — 23%");
  });
});
