import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("@/lib/staff-api", () => {
  class StaffApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: jest.fn() };
});

import { staffApi } from "@/lib/staff-api";
import BazaWiedzyPage from "./page";

/** Pozycja 18 — /knowledge pokazuje artykuły KB z treścią, a nie szablony z pustym `body`. */
const api = staffApi as jest.Mock;

describe("baza wiedzy w panelu obsługi", () => {
  beforeEach(() => api.mockReset());

  it("czyta opublikowane artykuły KB i pokazuje ich treść, pogrupowane po kategoriach", async () => {
    api.mockImplementation(async (sciezka: string) => {
      if (sciezka === "/admin/kb/categories") return [{ id: "k1", name: "Poczta", order: 1 }];
      if (sciezka.startsWith("/admin/kb/articles")) {
        return [{ id: "a1", title: "Konfiguracja Thunderbirda", excerpt: null, bodyMarkdown: "Serwer IMAP: port 993", categoryId: "k1", updatedAt: "2026-10-01" }];
      }
      throw new Error(`nieoczekiwane wywołanie ${sciezka}`);
    });
    const html = renderToStaticMarkup(await BazaWiedzyPage({ searchParams: Promise.resolve({}) }));
    expect(api).toHaveBeenCalledWith("/admin/kb/articles?status=PUBLISHED");
    expect(api).not.toHaveBeenCalledWith(expect.stringContaining("canned"));
    expect(html).toContain("Poczta");
    expect(html).toContain("Konfiguracja Thunderbirda");
    expect(html).toContain("Serwer IMAP: port 993");
  });

  it("wyszukiwanie przekazuje frazę do API", async () => {
    api.mockResolvedValue([]);
    const html = renderToStaticMarkup(await BazaWiedzyPage({ searchParams: Promise.resolve({ q: "dns ssl" }) }));
    expect(api).toHaveBeenCalledWith("/admin/kb/articles?status=PUBLISHED&q=dns%20ssl");
    expect(html).toContain("Brak artykułów o takim tytule.");
  });
});
