import { renderToStaticMarkup } from "react-dom/server";

/** F3.6 — „Nieudane płatności” i „Przypomnienia i zawieszenia” (GET admin/rozliczenia/*). */
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/billing/nieudane" }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn(), adminApiMultipart: jest.fn() }));

import { adminApi } from "@/lib/api";
import Nieudane from "./nieudane/page";
import Windykacja from "./windykacja/page";
import type { ListaNieudanych, WindykacjaFloty } from "./rozliczenia-dane";

const api = adminApi as jest.Mock;
const UID = "00000000-0000-4000-8000-0000000000aa";
const lista: ListaNieudanych = {
  od: "2026-09-11T00:00:00Z",
  total: 2,
  ucieto: false,
  wiersze: [
    { id: "auto:1", zrodlo: "AUTO_DOLADOWANIE", kiedy: "2026-10-10T08:00:00Z", klient: { id: UID, email: "anna@test.pl" }, kwota: "100.00", waluta: "PLN", status: "ODRZUCONA", powod: "Bank odrzucił płatność kartą.", referencja: null, ponowienie: { mozliwe: true, uwaga: "Obciąży zapisaną kartę klienta kwotą z jego reguły." } },
    { id: "paynow:2", zrodlo: "PAYNOW", kiedy: "2026-10-09T08:00:00Z", klient: { id: UID, email: "anna@test.pl" }, kwota: "25.00", waluta: "PLN", status: "REJECTED", powod: "Płatność odrzucona.", referencja: "PN-1", ponowienie: { mozliwe: false, uwaga: "Płatność online ponawia klient — w panelu zleca nowe doładowanie." } },
  ],
};
function odpowiedzi(permissions: string[]) {
  api.mockReset().mockImplementation(async (s: string) => {
    if (s === "/staff/me/access") return { role: "STAFF", isAdmin: false, permissions };
    if (s.startsWith("/admin/rozliczenia/nieudane-platnosci")) return lista;
    if (s === "/admin/rozliczenia/windykacja") return windykacja;
    throw new Error(`nieoczekiwane ${s}`);
  });
}
const windykacja: WindykacjaFloty = {
  progi: { przypomnieniaDniPrzed: [7, 3, 1], karencjaDni: 0, zawieszenieDoWygasnieciaDni: 14, retencjaKontaDni: 14 },
  ucieto: false,
  wiersze: [
    {
      id: "s1", userId: UID, email: "anna@test.pl", saldo: "5.00", usluga: "Hosting · sklep.pl", status: "ACTIVE", zrodlo: "WALLET",
      koniecOkresu: "2030-01-03T08:00:00Z", obietnicaDo: null, ostatniaNieudana: null, kwotaOdnowienia: "45.00", brakuje: "40.00",
      etap: "odnowienie", probaOdnowienia: "2030-01-02T08:00:00Z", zawieszenie: "2030-01-03T08:00:00Z", wygasniecie: null,
      uwaga: "Odnowienie z portfela — przy braku środków zawieszenie z końcem opłaconego okresu.",
    },
    {
      id: "s2", userId: UID, email: "anna@test.pl", saldo: "5.00", usluga: "Hosting · blog.pl", status: "SUSPENDED", zrodlo: "WALLET",
      koniecOkresu: null, obietnicaDo: null, ostatniaNieudana: null, kwotaOdnowienia: "45.00", brakuje: "40.00",
      etap: "zawieszona", probaOdnowienia: null, zawieszenie: "2020-01-01T00:00:00Z", wygasniecie: "2020-01-15T00:00:00Z", uwaga: "Wróci sama po doładowaniu portfela.",
    },
  ],
};

it("Finanse (BILLING_MANAGE): lista z przejściem do klienta i „Ponów” tylko przy auto-doładowaniu", async () => {
  odpowiedzi(["BILLING_VIEW", "BILLING_MANAGE"]);
  const html = renderToStaticMarkup(await Nieudane({ searchParams: Promise.resolve({}) }));
  expect(html).toContain(`href="/customers/${UID}?sekcja=rozliczenia"`);
  expect(html.match(/data-akcja="ponow"/g)).toHaveLength(1);
  expect(html).toContain("Płatność online ponawia klient");
  expect(html).toContain("2 płatności");
});

it("L1 (BILLING_VIEW): widzi listę, bez „Ponów” — mówi, czego brakuje", async () => {
  odpowiedzi(["BILLING_VIEW"]);
  const html = renderToStaticMarkup(await Nieudane({ searchParams: Promise.resolve({}) }));
  expect(html).not.toContain('data-akcja="ponow"');
  expect(html).toContain("BILLING_MANAGE");
});

it("filtry idą do API: źródło, okres, klient; śmieci z adresu są pomijane", async () => {
  odpowiedzi(["BILLING_VIEW"]);
  await Nieudane({ searchParams: Promise.resolve({ zrodlo: "PAYNOW", dni: "90", klient: UID, strona: "2" }) });
  const zapytanie = api.mock.calls.map((c) => c[0] as string).find((s) => s.startsWith("/admin/rozliczenia/nieudane-platnosci"))!;
  expect(zapytanie).toContain("zrodlo=PAYNOW");
  expect(zapytanie).toContain("dni=90");
  expect(zapytanie).toContain(`userId=${UID}`);
  expect(zapytanie).toContain("offset=50");
  api.mockClear();
  await Nieudane({ searchParams: Promise.resolve({ zrodlo: "toString", dni: "5", klient: "'; drop" }) });
  const czyste = api.mock.calls.map((c) => c[0] as string).find((s) => s.startsWith("/admin/rozliczenia/nieudane-platnosci"))!;
  expect(czyste).not.toMatch(/zrodlo=|userId=/);
  expect(czyste).toContain("dni=30");
});

it("przypomnienia i zawieszenia: progi z kodu, data zawieszenia, przeszła data = najbliższy przebieg", async () => {
  odpowiedzi(["BILLING_VIEW"]);
  const html = renderToStaticMarkup(await Windykacja());
  expect(html).toContain("Przypomnienia 7, 3, 1 dni przed odnowieniem");
  expect(html).toContain('data-etap="odnowienie"');
  expect(html).toContain("40.00 K");
  expect(html).toContain("wygaśnie: w najbliższym przebiegu");
  expect(html).toContain(`href="/subscriptions/s1"`);
});
