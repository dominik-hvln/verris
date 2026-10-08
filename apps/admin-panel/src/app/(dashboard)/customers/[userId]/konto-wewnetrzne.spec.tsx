import { renderToStaticMarkup } from "react-dom/server";

/** PB-47 (decyzja 08.10) — przełącznik „konto wewnętrzne” aktywny tylko z uprawnieniem CUSTOMERS_INTERNAL_FLAG. */
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));

import { adminApi } from "@/lib/api";
import { PoleKontaWewnetrznego } from "./konto-wewnetrzne";
import { mozeOznaczacKontoWewnetrzne } from "./konto-wewnetrzne-actions";

const api = adminApi as jest.Mock;
const pole = (dozwolone: boolean | null) =>
  renderToStaticMarkup(<PoleKontaWewnetrznego checked={false} onChange={() => undefined} dozwolone={dozwolone} />);

describe("PB-47 — konto wewnętrzne na karcie klienta", () => {
  it("bez uprawnienia: przełącznik nieaktywny i podpowiedź; z uprawnieniem: aktywny, bez podpowiedzi", () => {
    const bez = pole(false);
    expect(bez).toContain("disabled=\"\"");
    expect(bez).toContain("Oznaczanie konta jako wewnętrzne");
    const z = pole(true);
    expect(z).not.toContain("disabled=\"\"");
    expect(z).not.toContain("Oznaczanie konta jako wewnętrzne");
    // Do czasu odpowiedzi o uprawnienia — nieaktywny, bez podpowiedzi.
    expect(pole(null)).toContain("disabled=\"\"");
    expect(pole(null)).not.toContain("Oznaczanie konta jako wewnętrzne");
  });

  it("uprawnienie liczone z /staff/me/access (suma ról); ADMIN zawsze może", async () => {
    api.mockResolvedValueOnce({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_MANAGE"] });
    await expect(mozeOznaczacKontoWewnetrzne()).resolves.toBe(false);
    // Sama flaga bez CUSTOMERS_MANAGE — API odrzuci zapis formularza, więc przełącznik nieaktywny (tak jak wnioski).
    api.mockResolvedValueOnce({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "CUSTOMERS_INTERNAL_FLAG"] });
    await expect(mozeOznaczacKontoWewnetrzne()).resolves.toBe(false);
    api.mockResolvedValueOnce({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_MANAGE", "CUSTOMERS_INTERNAL_FLAG"] });
    await expect(mozeOznaczacKontoWewnetrzne()).resolves.toBe(true);
    api.mockResolvedValueOnce({ role: "ADMIN", isAdmin: true, permissions: [] });
    await expect(mozeOznaczacKontoWewnetrzne()).resolves.toBe(true);
    expect(api).toHaveBeenCalledWith("/staff/me/access");
  });
});
