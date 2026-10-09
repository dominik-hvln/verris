/** 10.10 — wyszukiwarka API: pominięte typy z odpowiedzi; 403 (rola bez żadnego typu) to nie „brak wyników”. */
const mockApi = jest.fn();
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: (...a: unknown[]) => mockApi(...a) };
});

import { AdminApiError } from "@/lib/api";
import { globalSearchAction } from "./command-palette-actions";

beforeEach(() => mockApi.mockReset());

it("przekazuje wyniki i pominięte typy", async () => {
  mockApi.mockResolvedValue({ results: [{ type: "node", id: "n1" }], pominiete: ["user"] });
  await expect(globalSearchAction(" t1 ")).resolves.toEqual({ results: [{ type: "node", id: "n1" }], pominiete: ["user"] });
  expect(mockApi).toHaveBeenCalledWith("/admin/search?q=t1");
});

it("403 — wszystkie typy pominięte; inny błąd — pusto bez komunikatu", async () => {
  mockApi.mockRejectedValue(new AdminApiError("Brak uprawnień", 403));
  expect((await globalSearchAction("t1")).pominiete).toHaveLength(7);
  mockApi.mockRejectedValue(new AdminApiError("Błąd", 500));
  await expect(globalSearchAction("t1")).resolves.toEqual({ results: [], pominiete: [] });
});
