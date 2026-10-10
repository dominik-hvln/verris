const adminApi = jest.fn();
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {}
  return { AdminApiError, adminApi: (...a: unknown[]) => adminApi(...a) };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
import { AdminApiError } from "@/lib/api";
import { zmienDaneNabywcyAction } from "./actions";

/** Fala 1B — „Dane nabywcy”: kraj i NIP z powodem do PATCH /admin/billing/nabywcy/:id/vat/dane. */
describe("zmienDaneNabywcyAction", () => {
  beforeEach(() => adminApi.mockReset());

  it("wysyła kraj wielkimi literami, NIP i powód", async () => {
    adminApi.mockResolvedValue({});
    await expect(zmienDaneNabywcyAction("u1", { kraj: " de ", nip: " DE123456789 ", powod: " zgłoszenie #12 " })).resolves.toEqual({ ok: true });
    expect(adminApi).toHaveBeenCalledWith("/admin/billing/nabywcy/u1/vat/dane", { method: "PATCH", body: { country: "DE", nip: "DE123456789", powod: "zgłoszenie #12" } });
  });

  it("zły kraj albo krótki powód → błąd bez API; błąd API → komunikat API", async () => {
    expect((await zmienDaneNabywcyAction("u1", { kraj: "Polska", nip: "", powod: "zgłoszenie" })).ok).toBe(false);
    expect((await zmienDaneNabywcyAction("u1", { kraj: "PL", nip: "", powod: "abc" })).ok).toBe(false);
    expect(adminApi).not.toHaveBeenCalled();
    adminApi.mockRejectedValue(new AdminApiError("Kraj i NIP są takie same jak w profilu — nic do zmiany."));
    expect(await zmienDaneNabywcyAction("u1", { kraj: "PL", nip: "1", powod: "zgłoszenie" })).toEqual({ ok: false, error: "Kraj i NIP są takie same jak w profilu — nic do zmiany." });
  });
});
