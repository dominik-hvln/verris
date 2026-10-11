import { renderToStaticMarkup } from "react-dom/server";

/**
 * F2.5 — skrzynka obsługi bierze z API jedną stronę z filtrami (nie całą tabelę) i pokazuje stronicowanie,
 * liczniki z API, tagi wierszy i formularz filtrów. Menu liczy z `liczby` jednym wierszem (limit=1).
 */
jest.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));
jest.mock("@/lib/staff-api", () => {
  class StaffApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: jest.fn(), staffApiMultipart: jest.fn() };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { staffApi } from "@/lib/staff-api";
import Skrzynka from "./page";

const api = staffApi as jest.Mock;
const wiersz = {
  id: "t1000000-0000-4000-8000-000000000001",
  subject: "Poczta nie dochodzi",
  status: "OPEN",
  priority: "HIGH",
  department: "TECHNICAL",
  createdAt: "2026-10-10T08:00:00Z",
  user: { id: "u1", firstName: "Anna", lastName: null, email: "anna@test.pl", companyName: null },
  assignedTo: null,
  tags: ["vip"],
  _count: { replies: 2 },
};
const zapytania: string[] = [];
let dostep: string[] = ["TICKETS_VIEW", "TICKETS_MANAGE"];

beforeEach(() => {
  zapytania.length = 0;
  dostep = ["TICKETS_VIEW", "TICKETS_MANAGE"];
  api.mockReset().mockImplementation(async (sciezka: string) => {
    zapytania.push(sciezka);
    if (sciezka === "/users/me") return { id: "s1", email: "s@verris.pl", role: "STAFF", firstName: "Piotr", lastName: null };
    if (sciezka === "/tickets/admin/tagi") return [{ tag: "vip", liczba: 3 }];
    if (sciezka === "/staff/me/access") return { role: "STAFF", isAdmin: false, permissions: dostep };
    if (sciezka.startsWith("/admin/users?role=")) return { rows: [{ id: "s2", email: "anna@verris.pl", firstName: "Anna", lastName: "Nowak" }] };
    if (sciezka.startsWith("/tickets/admin/all")) {
      return {
        rows: [wiersz], total: 61, page: 2, limit: 50, totalPages: 2,
        liczby: { otwarte: 61, moje: 4, czeka: 7, poTerminie: 3, zamkniete: 9 },
        dzialy: { TECHNICAL: 40, BILLING: 15, SALES: 6 },
      };
    }
    throw new Error(`nieoczekiwane ${sciezka}`);
  });
});

const tekst = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

it("filtry i strona idą do API; widok „moje” = przypisane do mnie", async () => {
  const html = renderToStaticMarkup(await Skrzynka({ searchParams: Promise.resolve({ widok: "moje", q: "poczta", tag: "vip", page: "2" }) }));
  const lista = zapytania.find((z) => z.startsWith("/tickets/admin/all"))!;
  const q = new URLSearchParams(lista.split("?")[1]);
  expect(Object.fromEntries(q)).toEqual({ stan: "otwarte", sort: "termin", limit: "50", przypisany: "ja", q: "poczta", tag: "vip", page: "2" });
  const t = tekst(html);
  expect(t).toContain("Strona 2 z 2 · 61 zgłoszeń");
  expect(html).toContain('href="/?widok=moje&amp;q=poczta&amp;tag=vip"');
  expect(html).not.toContain("Następna");
  expect(html).toContain('data-filtry="skrzynka"');
  expect(t).toMatch(/Poczta nie dochodzi vip/);
  expect(t).toContain("3 Po terminie");
});

it("F3.7: działy z licznikami (filtr `dzial` do API), akcje masowe i pola wyboru tylko z TICKETS_MANAGE", async () => {
  const html = renderToStaticMarkup(await Skrzynka({ searchParams: Promise.resolve({ dzial: "BILLING" }) }));
  const lista = zapytania.find((z) => z.startsWith("/tickets/admin/all"))!;
  expect(new URLSearchParams(lista.split("?")[1]).get("dzial")).toBe("BILLING");
  const t = tekst(html);
  expect(t).toContain("Techniczny · 40");
  expect(t).toContain("Płatności · 15");
  expect(html).toMatch(/aria-current="page"[^>]*>Płatności/);
  expect(html).toContain('data-akcje="masowe"');
  expect(html).toContain('form="akcje-masowe"');
  // filtr działu zostaje przy wysyłaniu formularza filtrów
  expect(html).toContain('name="dzial" value="BILLING"');

  dostep = ["TICKETS_VIEW"];
  const podglad = renderToStaticMarkup(await Skrzynka({ searchParams: Promise.resolve({}) }));
  expect(podglad).not.toContain('data-akcje="masowe"');
  expect(podglad).not.toContain('form="akcje-masowe"');
});
