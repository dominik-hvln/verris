/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * F2.7 (D2/D8) — operacje na karcie domeny: uprawnienia jak w API (DOMAINS_MANAGE; koszt Verris także
 * BILLING_MANAGE), powód obowiązkowy, wycena przed odnowieniem, potwierdzenie, kod EPP tylko na ekranie.
 */
const akcja = jest.fn();
const sync = jest.fn();
const wycena = jest.fn();
const ponow = jest.fn();
jest.mock("../actions", () => ({
  akcjaDomenyAction: (...a: unknown[]) => akcja(...a),
  synchronizujDomeneAction: (...a: unknown[]) => sync(...a),
  wycenaOdnowieniaAction: (...a: unknown[]) => wycena(...a),
  ponowZamowienieAction: (...a: unknown[]) => ponow(...a),
  sprawdzTransferyAction: jest.fn(),
}));
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: jest.fn() }) }));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { DzialaniaDomeny, opisSynchronizacji } from "./dzialania-domeny";
import { PonowZamowienie } from "../ponow-zamowienie";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let k: HTMLElement;
const op = (...permissions: string[]) => ({ isAdmin: false, permissions });

const render = async (el: React.ReactElement) => {
  await act(async () => {
    root.render(el);
  });
};
const karta = (dostep: { isAdmin: boolean; permissions: string[] }, saldo = "100.00") =>
  render(<DzialaniaDomeny domainId="d1" domena="klient.pl" transferLock nameservers={["ns1.verris.pl", "ns2.verris.pl"]} saldoKlienta={saldo} dostep={dostep} />);
const przycisk = (sel: string) => k.querySelector<HTMLButtonElement>(sel)!;
const wpisz = async (pole: HTMLInputElement, tekst: string) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(pole, tekst);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const klik = async (b: HTMLElement) => {
  await act(async () => {
    b.click();
  });
};
const pola = () => [...k.querySelectorAll<HTMLInputElement>("input")];

beforeEach(() => {
  for (const m of [akcja, sync, wycena, ponow, refresh, potwierdz]) m.mockClear();
  akcja.mockReset();
  wycena.mockReset().mockResolvedValue({ ok: true, wynik: { priceAmount: "59.99", currency: "PLN", expiresAt: null } });
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

it("L1 — wszystko wyszarzone z nazwą uprawnienia; L3 — bez kosztu Verris; L4 — wszystko", async () => {
  await karta(op("CUSTOMERS_VIEW"));
  expect(przycisk('[data-akcja="kod-epp"]').disabled).toBe(true);
  expect(przycisk('[data-akcja="kod-epp"]').title).toBe("Wymaga DOMAINS_MANAGE");
  expect(przycisk('[data-akcja="odnow-verris"]').title).toBe("Wymaga DOMAINS_MANAGE i BILLING_MANAGE");
  await karta(op("CUSTOMERS_VIEW", "DOMAINS_MANAGE"));
  expect(przycisk('[data-akcja="odnow"]').disabled).toBe(false);
  expect(przycisk('[data-akcja="odnow-verris"]').disabled).toBe(true);
  expect(przycisk('[data-akcja="odnow-verris"]').title).toBe("Wymaga BILLING_MANAGE");
  await karta(op("CUSTOMERS_VIEW", "DOMAINS_MANAGE", "BILLING_MANAGE"));
  expect([...k.querySelectorAll<HTMLButtonElement>("[data-akcja]")].filter((b) => b.disabled)).toEqual([]);
  expect(przycisk('[data-akcja="blokada"]').textContent).toBe("Zdejmij blokadę transferu");
});

it("odnowienie z portfela: wycena i saldo przed wykonaniem, powód obowiązkowy, potwierdzenie z kwotą", async () => {
  akcja.mockResolvedValue({ ok: true, wynik: { id: "z1" } });
  await karta(op("DOMAINS_MANAGE"), "20.00");
  await klik(przycisk('[data-akcja="odnow"]'));
  expect(wycena).toHaveBeenCalledWith("d1", 1);
  expect(k.querySelector("[data-wycena]")!.textContent).toContain("59,99 zł");
  expect(k.textContent).toContain("Klient ma za mało środków");
  const wykonaj = przycisk("[data-wykonaj]");
  expect(wykonaj.disabled).toBe(true);
  await wpisz(pola()[0]!, "auto-odnowienie padło");
  expect(przycisk("[data-wykonaj]").disabled).toBe(false);
  await klik(przycisk("[data-wykonaj]"));
  expect(potwierdz.mock.calls[0]![0]).toContain("za 59,99 zł z portfela klienta");
  expect(akcja).toHaveBeenCalledWith("d1", "odnow", { years: 1, powod: "auto-odnowienie padło", zgloszenie: "" });
  expect(refresh).toHaveBeenCalled();
});

it("koszt Verris: potwierdzenie jako niebezpieczne, osobna akcja; błąd API widoczny", async () => {
  akcja.mockResolvedValue({ ok: false, error: "Twoja rola nie ma uprawnienia DOMAINS_MANAGE i BILLING_MANAGE." });
  await karta({ isAdmin: true, permissions: [] });
  await klik(przycisk('[data-akcja="odnow-verris"]'));
  expect(k.querySelector("[data-wycena]")!.textContent).toContain("klient nie zapłaci nic");
  await wpisz(pola()[0]!, "nasza awaria odnowienia");
  await klik(przycisk("[data-wykonaj]"));
  expect(potwierdz.mock.calls[0]![1]).toMatchObject({ niebezpieczne: true });
  expect(akcja).toHaveBeenCalledWith("d1", "odnow-na-koszt-verris", expect.objectContaining({ years: 1 }));
  expect(k.querySelector("[role=status]")!.textContent).toBe("Twoja rola nie ma uprawnienia DOMAINS_MANAGE i BILLING_MANAGE.");
});

it("kod EPP: pokazany tylko na ekranie po potwierdzeniu", async () => {
  akcja.mockResolvedValue({ ok: true, wynik: { authCode: "EPP-123", transferLock: true } });
  await karta(op("DOMAINS_MANAGE"));
  await klik(przycisk('[data-akcja="kod-epp"]'));
  await wpisz(pola()[0]!, "klient przenosi domenę");
  await wpisz(pola()[1]!, "#ab12cd34");
  await klik(przycisk("[data-wykonaj]"));
  expect(akcja).toHaveBeenCalledWith("d1", "kod-epp", { powod: "klient przenosi domenę", zgloszenie: "#ab12cd34" });
  expect(k.querySelector("[data-kod-epp]")!.textContent).toBe("EPP-123");
});

it("synchronizacja bez powodu, z opisem zmian", async () => {
  sync.mockResolvedValue({ ok: true, wynik: { odeszla: false, zmiany: { expiresAt: { z: null, na: "2027-01-01" } } } });
  await karta(op("DOMAINS_MANAGE"));
  await klik(przycisk('[data-akcja="synchronizuj"]'));
  expect(sync).toHaveBeenCalledWith("d1");
  expect(k.querySelector("[role=status]")!.textContent).toBe("Zaktualizowano: data wygaśnięcia.");
  expect(opisSynchronizacji({ odeszla: false, zmiany: {} })).toBe("Dane zgodne z rejestratorem — bez zmian.");
  expect(opisSynchronizacji({ odeszla: true, zmiany: {} })).toContain("odeszła");
});

it("ponowienie zamówienia: bez uprawnienia wyszarzone; transfer z nowym kodem EPP; bez uchwytu — informacja", async () => {
  await render(<PonowZamowienie orderId="o1" domena="a.pl" typ="TRANSFER" kwota="40.00" zablokowane="Wymaga DOMAINS_MANAGE" moznaPonowic />);
  expect(przycisk("[data-ponow]").disabled).toBe(true);
  await render(<PonowZamowienie orderId="o1" domena="a.pl" typ="REGISTER" kwota="40.00" zablokowane={null} moznaPonowic={false} />);
  expect(k.textContent).toContain("klient musi zamówić ponownie");
  ponow.mockResolvedValue({ ok: true, wynik: { id: "z2", status: "SUBMITTED" } });
  await render(<PonowZamowienie orderId="o2" domena="b.pl" typ="TRANSFER" kwota="40.00" zablokowane={null} moznaPonowic />);
  await klik(przycisk("[data-ponow]"));
  const [powod, , kod] = pola();
  await wpisz(powod!, "zły kod przy transferze");
  await wpisz(kod!, "NOWY-EPP");
  await klik([...k.querySelectorAll("button")].find((b) => b.textContent === "Ponów zamówienie")!);
  expect(potwierdz.mock.calls[0]![0]).toContain("z portfela klienta");
  // Audyt Fal 2 — API obciąża dokładnie kwotą z zamówienia klienta, więc potwierdzenie nie mówi „ok.”.
  expect(potwierdz.mock.calls[0]![0]).toContain("Opłata 40.00 zł (kwota z zamówienia klienta)");
  expect(ponow).toHaveBeenCalledWith("o2", { powod: "zły kod przy transferze", zgloszenie: "", authCode: "NOWY-EPP" });
  expect(k.textContent).toContain("Transfer zlecony ponownie");
});
