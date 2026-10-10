import { renderToStaticMarkup } from "react-dom/server";

/**
 * D11 — tablica migracji: kolumny etapów, Przerywacz, termin (po terminie / blisko), prowadzący, braki do
 * następnego etapu; filtr „Tylko moje” idzie do API; bez uprawnienia — bramka strony.
 */
jest.mock("@/lib/api", () => ({ adminApi: jest.fn() }));
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: jest.fn(async () => null) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { adminApi } from "@/lib/api";
import { bramkaStrony } from "@/lib/bramka-strony";
import TablicaMigracjiPage from "./page";
import { ETAPY, type KartaMigracji, type Tablica } from "../tablica-typy";

const api = adminApi as jest.Mock;
const karta = (o: Partial<KartaMigracji>): KartaMigracji => ({
  id: "m1",
  subscriptionId: "s1",
  domena: "sklep.pl",
  klient: "jan@firma.pl",
  etap: "NOWA",
  etapOd: null,
  status: "COMPLETED",
  statusOpis: "ukończona",
  needsAttention: false,
  przerywacz: false,
  przypisany: null,
  ticketId: null,
  termin: null,
  dalej: null,
  ...o,
});
const tablica = (kolumny: Partial<Tablica["kolumny"]>, alerty = { poTerminie: 0, blisko: 0 }): Tablica => ({
  etapy: ETAPY,
  kolumny: { NOWA: [], TESTY: [], DO_ZMIANY_DNS: [], PO_PRZELACZENIU: [], ZAMKNIETA: [], ...kolumny },
  alerty,
});
const html = async (sp: { moje?: string } = {}) => renderToStaticMarkup(await TablicaMigracjiPage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => api.mockReset());

it("kolumny etapów z kartami: Przerywacz, termin po terminie, prowadzący i braki checklisty", async () => {
  api.mockResolvedValue(
    tablica(
      {
        TESTY: [
          karta({
            id: "m2",
            etap: "TESTY",
            przerywacz: true,
            przypisany: { id: "op", email: "l2@verris.pl" },
            termin: { rodzaj: "stary-hosting", opis: "hosting u starego dostawcy wygasa", data: "2026-10-12T10:00:00.000Z", stan: "po-terminie" },
            dalej: { etap: "DO_ZMIANY_DNS", braki: ["TTL domen zmienione na 300"] },
          }),
        ],
        DO_ZMIANY_DNS: [karta({ id: "m3", etap: "DO_ZMIANY_DNS", dalej: { etap: "PO_PRZELACZENIU", braki: [] } })],
      },
      { poTerminie: 1, blisko: 0 },
    ),
  );
  const h = await html();
  expect(api).toHaveBeenCalledWith("/admin/migrations/tablica");
  for (const e of ETAPY) expect(h).toContain(`aria-label="${e.nazwa}"`);
  expect(h).toContain("Przerywacz");
  expect(h).toContain("Po terminie: hosting u starego dostawcy wygasa");
  expect(h).toContain("Prowadzi: l2@verris.pl");
  expect(h).toContain("TTL domen zmienione na 300");
  expect(h).toContain("Gotowa do przejścia dalej");
  expect(h).toContain('href="/migrations/m2"');
  expect(h).toContain("1 po terminie");
});

it("„Tylko moje” — filtr w API; błąd API — komunikat zamiast pustej tablicy", async () => {
  api.mockResolvedValue(tablica({}));
  await html({ moje: "1" });
  expect(api).toHaveBeenCalledWith("/admin/migrations/tablica?moje=1");
  api.mockRejectedValue(new Error("x"));
  expect(await html()).toContain("Nie udało się pobrać tablicy migracji.");
  expect(bramkaStrony).toHaveBeenCalledWith("/migrations/tablica");
});
