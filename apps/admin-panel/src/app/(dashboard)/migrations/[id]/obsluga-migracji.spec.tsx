/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ObslugaMigracji } from "../tablica-typy";

/**
 * D11 — panel obsługi migracji: przejście dalej zablokowane, dopóki API zgłasza braki checklisty; cofnięcie
 * wymaga powodu; okno poprawek przy „Po przełączeniu”; raport tylko z kompletem i po potwierdzeniu; kontakt
 * czyszczony dopiero po zapisie; komunikat z „Sprawdź DNS”.
 */
const dzialanie = jest.fn();
const podglad = jest.fn();
jest.mock("../tablica-actions", () => ({
  dzialanieTablicyAction: (...a: unknown[]) => dzialanie(...a),
  podgladRaportuAction: (...a: unknown[]) => podglad(...a),
}));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));
// Lista rozwijana panelu jako zwykłe pole (test wybiera wartość wpisaniem).
jest.mock("@/components/select", () => ({
  Select: (p: { value: string; onChange: (v: string) => void; "aria-label"?: string }) => (
    <input aria-label={p["aria-label"]} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
}));

import { ObslugaMigracjiPanel } from "./obsluga-migracji";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let k: HTMLElement;

const baza = (o: Partial<ObslugaMigracji> = {}): ObslugaMigracji => ({
  id: "m1",
  domena: "sklep.pl",
  etap: "TESTY",
  etapOd: null,
  status: "COMPLETED",
  statusOpis: "ukończona",
  cutoverAt: null,
  termin: null,
  terminDomyslny: "2026-10-14T10:00:00.000Z",
  wygasaUStaregoAt: null,
  domenaWygasaAt: null,
  przerywacz: false,
  przypisany: null,
  poprawkiDo: null,
  ticketId: null,
  raportWyslanyAt: null,
  checklista: {},
  terminStan: null,
  dalej: { etap: "DO_ZMIANY_DNS", nazwa: "Do zmiany DNS", braki: ["TTL domen zmienione na 300"] },
  brakiRaportu: ["Raport wysyłamy na etapie „Po przełączeniu”"],
  oknoPoprawekDni: 7,
  operatorzy: [],
  os: [],
  ...o,
});

const render = async (o: ObslugaMigracji) => {
  await act(async () => {
    root.render(<ObslugaMigracjiPanel initial={o} />);
  });
};
const przycisk = (tekst: string) => [...k.querySelectorAll("button")].find((b) => b.textContent?.includes(tekst))!;
const klik = async (b: HTMLElement) => {
  await act(async () => {
    b.click();
  });
};
const wpisz = async (pole: HTMLInputElement | HTMLTextAreaElement, tekst: string) => {
  await act(async () => {
    const proto = pole instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(pole, tekst);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const pole = (etykieta: string) => k.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${etykieta}"]`)!;

beforeEach(() => {
  dzialanie.mockReset();
  podglad.mockReset();
  potwierdz.mockClear();
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

it("braki checklisty: „Dalej” wyłączone z listą braków; bez braków — przejście na następny etap", async () => {
  await render(baza());
  expect(przycisk("Dalej: Do zmiany DNS").disabled).toBe(true);
  expect(k.querySelector('[aria-label="Brakuje do następnego etapu"]')!.textContent).toContain("TTL domen zmienione na 300");

  dzialanie.mockResolvedValue({ ok: true, wynik: baza({ etap: "DO_ZMIANY_DNS", dalej: { etap: "PO_PRZELACZENIU", nazwa: "Po przełączeniu", braki: [] } }) });
  await act(async () => root.unmount());
  root = createRoot(k);
  await render(baza({ dalej: { etap: "DO_ZMIANY_DNS", nazwa: "Do zmiany DNS", braki: [] } }));
  await klik(przycisk("Dalej: Do zmiany DNS"));
  expect(dzialanie).toHaveBeenCalledWith("m1", "etap", { etap: "DO_ZMIANY_DNS" });
  expect(k.querySelector('[aria-current="step"]')!.textContent).toBe("Do zmiany DNS");
});

it("„Po przełączeniu” wysyła okno poprawek; „Sprawdź DNS” pokazuje komunikat o DNS", async () => {
  dzialanie.mockResolvedValue({ ok: true, wynik: { ...baza({ etap: "DO_ZMIANY_DNS" }), dns: { komunikat: "Rekordy DNS wskazują na nasz serwer." } } });
  await render(baza({ etap: "DO_ZMIANY_DNS", dalej: { etap: "PO_PRZELACZENIU", nazwa: "Po przełączeniu", braki: [] } }));
  await klik(przycisk("Sprawdź DNS"));
  expect(dzialanie).toHaveBeenLastCalledWith("m1", "sprawdz-dns", {});
  expect(k.querySelector('[role="status"]')!.textContent).toBe("Rekordy DNS wskazują na nasz serwer.");

  await act(async () => root.unmount());
  root = createRoot(k);
  dzialanie.mockResolvedValue({ ok: true, wynik: baza({ etap: "PO_PRZELACZENIU" }) });
  await render(baza({ etap: "DO_ZMIANY_DNS", dalej: { etap: "PO_PRZELACZENIU", nazwa: "Po przełączeniu", braki: [] } }));
  const okno = [...k.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Okno poprawek"))!.querySelector("input")!;
  await wpisz(okno, "10");
  await klik(przycisk("Dalej: Po przełączeniu"));
  expect(dzialanie).toHaveBeenLastCalledWith("m1", "etap", { etap: "PO_PRZELACZENIU", oknoDni: 10 });
});

it("cofnięcie: tylko z wybranym etapem i powodem min. 10 znaków; błąd API na ekranie", async () => {
  dzialanie.mockResolvedValue({ ok: false, error: "Ktoś właśnie zmienił etap tej migracji — odśwież stronę." });
  await render(baza({ etap: "DO_ZMIANY_DNS", dalej: { etap: "PO_PRZELACZENIU", nazwa: "Po przełączeniu", braki: [] } }));
  expect(przycisk("Cofnij").disabled).toBe(true);
  await wpisz(pole("Cofnij do etapu") as HTMLInputElement, "TESTY");
  await wpisz(k.querySelector<HTMLInputElement>('input[placeholder^="Powód cofnięcia"]')!, "krótko");
  expect(przycisk("Cofnij").disabled).toBe(true);
  await wpisz(k.querySelector<HTMLInputElement>('input[placeholder^="Powód cofnięcia"]')!, "Klient zgłosił błąd formularza");
  await klik(przycisk("Cofnij"));
  expect(dzialanie).toHaveBeenCalledWith("m1", "etap", { etap: "TESTY", powod: "Klient zgłosił błąd formularza" });
  expect(k.querySelector('[role="status"]')!.textContent).toContain("odśwież stronę");
});

it("raport: bez kompletu wyłączony z brakami; z kompletem — potwierdzenie, potem wysyłka", async () => {
  await render(baza());
  expect(przycisk("Wyślij raport").disabled).toBe(true);
  expect(k.querySelector('[aria-label="Brakuje do raportu"]')!.textContent).toContain("Po przełączeniu");

  await act(async () => root.unmount());
  root = createRoot(k);
  dzialanie.mockResolvedValue({ ok: true, wynik: baza({ etap: "PO_PRZELACZENIU", brakiRaportu: [], raportWyslanyAt: "2026-10-11T12:00:00.000Z" }) });
  await render(baza({ etap: "PO_PRZELACZENIU", brakiRaportu: [] }));
  potwierdz.mockResolvedValueOnce(false);
  await klik(przycisk("Wyślij raport"));
  expect(dzialanie).not.toHaveBeenCalled();
  await klik(przycisk("Wyślij raport"));
  expect(potwierdz.mock.calls[1]![0]).toContain("sklep.pl");
  expect(dzialanie).toHaveBeenCalledWith("m1", "raport", {});
  expect(k.textContent).toContain("Wysłano do klienta");
  expect(przycisk("Wyślij raport ponownie")).toBeDefined();
});

it("kontakt: opis czyszczony dopiero po zapisie; oś czasu opisuje kontakt i zmianę etapu", async () => {
  dzialanie.mockResolvedValueOnce({ ok: false, error: "Nie ma takiego zgłoszenia u tego klienta." });
  await render(
    baza({
      os: [
        { typ: "kontakt", id: "k1", at: "2026-10-11T09:00:00.000Z", kto: "l2@verris.pl", kanal: "TELEFON", tresc: "Klient zmieni NS jutro.", ticketId: "abcdef12-0000" },
        { typ: "zdarzenie", id: "a1", at: "2026-10-11T08:00:00.000Z", kto: "l2@verris.pl", akcja: "MIGRATION_STAGE_CHANGED", szczegoly: { z: "NOWA", na: "TESTY" } },
      ],
    }),
  );
  const os = k.querySelector('[aria-label="Oś czasu migracji"]')!.textContent!;
  expect(os).toContain("Telefon: Klient zmieni NS jutro. (zgłoszenie #abcdef12)");
  expect(os).toContain("Zmiana etapu: Nowa → Testy u nas");

  await wpisz(pole("Opis kontaktu"), "Mail z potwierdzeniem terminu");
  await wpisz(pole("Zgłoszenie kontaktu") as HTMLInputElement, "#zzzz");
  await klik(przycisk("Dodaj kontakt"));
  expect(dzialanie).toHaveBeenLastCalledWith("m1", "kontakty", { kanal: "TELEFON", tresc: "Mail z potwierdzeniem terminu", zgloszenie: "#zzzz", kiedy: null });
  expect((pole("Opis kontaktu") as HTMLTextAreaElement).value).toBe("Mail z potwierdzeniem terminu");

  dzialanie.mockResolvedValueOnce({ ok: true, wynik: baza() });
  await klik(przycisk("Dodaj kontakt"));
  expect((pole("Opis kontaktu") as HTMLTextAreaElement).value).toBe("");
});

it("Przerywacz i prowadzący: zapis przez ustawienia", async () => {
  dzialanie.mockResolvedValue({ ok: true, wynik: baza({ przerywacz: true }) });
  await render(baza({ operatorzy: [{ id: "op2", email: "l2b@verris.pl" }] }));
  await klik(przycisk("Oznacz jako Przerywacz"));
  expect(dzialanie).toHaveBeenLastCalledWith("m1", "ustawienia", { przerywacz: true });
  expect(przycisk("Przerywacz — zdejmij")).toBeDefined();
  await wpisz(pole("Prowadzi") as HTMLInputElement, "op2");
  await klik(przycisk("Zapisz"));
  expect(dzialanie).toHaveBeenLastCalledWith("m1", "ustawienia", {
    termin: null,
    wygasaUStaregoAt: null,
    domenaWygasaAt: null,
    przypisanyDoId: "op2",
    zgloszenie: null,
  });
});
