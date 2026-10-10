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

  it("treść artykułu to Markdown: nagłówki i bloki kodu zamiast surowych „##” i ```, HTML z treści jako tekst", async () => {
    const md = "## Konfiguracja\n\nUstaw **port 993** i `SSL`.\n\n```\nimap.example.pl\n```\n\n- [pomoc](https://pomoc.verris.pl) i [zły](javascript:zlo(1))\n\n<script>zlo(1)</script>";
    api.mockImplementation(async (sciezka: string) => {
      if (sciezka === "/admin/kb/categories") return [{ id: "k1", name: "Poczta", order: 1 }];
      return [{ id: "a1", title: "IMAP", excerpt: null, bodyMarkdown: md, categoryId: "k1", updatedAt: "2026-10-01" }];
    });
    const html = renderToStaticMarkup(await BazaWiedzyPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("<h3>Konfiguracja</h3>"); // jak pomoc.verris.pl: „#” → h2, „##” → h3
    expect(html).not.toContain("## Konfiguracja");
    expect(html).toContain("<strong>port 993</strong>");
    expect(html).toContain("<code>SSL</code>");
    expect(html).toContain("<pre><code>imap.example.pl</code></pre>");
    expect(html).not.toContain("```");
    expect(html).toContain('<a href="https://pomoc.verris.pl" target="_blank" rel="noopener noreferrer">pomoc</a>');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;zlo(1)&lt;/script&gt;");
  });

  it("wyszukiwanie przekazuje frazę do API", async () => {
    api.mockResolvedValue([]);
    const html = renderToStaticMarkup(await BazaWiedzyPage({ searchParams: Promise.resolve({ q: "dns ssl" }) }));
    expect(api).toHaveBeenCalledWith("/admin/kb/articles?status=PUBLISHED&q=dns%20ssl");
    expect(html).toContain("Brak artykułów o takim tytule.");
  });
});
