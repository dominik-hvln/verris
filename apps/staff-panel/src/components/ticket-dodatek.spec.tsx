/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * M-33 — zlecenie dodatku na stronie zgłoszenia: „Zrealizowano” i „Odmowa ze zwrotem” z potwierdzeniem; odmowa
 * wymaga powodu; bez uprawnień — bez przycisków; zamknięte zlecenie pokazuje stan i notatkę, bez przycisków.
 */
const zamknij = jest.fn();
const odswiez = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: odswiez }) }));
jest.mock("@/lib/ticket-actions", () => ({ staffZamknijZlecenieDodatku: (...a: unknown[]) => zamknij(...a) }));

import { TicketDodatek } from "./ticket-dodatek";
import type { ZlecenieDodatku } from "@/lib/tickets-data";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ZLECENIE: ZlecenieDodatku = {
  id: "z1",
  slug: "dedicated_ip",
  name: "Dedykowane IP",
  amount: "25",
  status: "QUEUED",
  createdAt: "2026-10-12T08:00:00Z",
  notatka: null,
  zamknietoAt: null,
};

let root: Root;
let k: HTMLElement;
const q = (sel: string) => k.querySelector<HTMLButtonElement>(sel);
const klik = async (b: HTMLElement) => {
  await act(async () => {
    b.click();
  });
};
const wpisz = async (tekst: string) => {
  const pole = k.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(pole, tekst);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const montuj = async (p: { zlecenia?: ZlecenieDodatku[]; mozeRealizowac?: boolean; mozeZwrocic?: boolean } = {}) => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () =>
    root.render(<TicketDodatek ticketId="t1" zlecenia={p.zlecenia ?? [ZLECENIE]} mozeRealizowac={p.mozeRealizowac ?? true} mozeZwrocic={p.mozeZwrocic ?? true} />),
  );
};

beforeEach(() => {
  zamknij.mockReset().mockResolvedValue({ ok: true, note: "Zlecenie zamknięte. Klient dostał informację w zgłoszeniu." });
  odswiez.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

it("„Zrealizowano”: najpierw potwierdzenie (anulowanie — nic), potem zamknięcie z notatką i odświeżenie", async () => {
  await montuj();
  expect(k.textContent).toContain("Dedykowane IP · 25,00 zł · czeka na realizację");
  await wpisz("Przydzielono IP 203.0.113.10");
  await klik(q('[data-akcja="zrealizowano"]')!);
  expect(zamknij).not.toHaveBeenCalled();
  expect(k.textContent).toContain("Zamknąć zlecenie jako zrealizowane? Klient dostanie informację z notatką w zgłoszeniu.");
  await klik(q('[data-akcja="anuluj"]')!);
  expect(zamknij).not.toHaveBeenCalled();
  expect(q('[data-akcja="potwierdz"]')).toBeNull();

  await klik(q('[data-akcja="zrealizowano"]')!);
  await klik(q('[data-akcja="potwierdz"]')!);
  expect(zamknij).toHaveBeenCalledWith("t1", "z1", "ZREALIZOWANO", "Przydzielono IP 203.0.113.10");
  expect(odswiez).toHaveBeenCalled();
  expect(k.querySelector('[role="status"]')!.textContent).toBe("Zlecenie zamknięte. Klient dostał informację w zgłoszeniu.");
});

it("„Odmowa ze zwrotem”: zablokowana bez powodu; z powodem — potwierdzenie z kwotą zwrotu; błąd API (409) widać", async () => {
  zamknij.mockResolvedValueOnce({ error: "Tego zlecenia nie da się już zamknąć — jest zrealizowany. Odśwież stronę." });
  await montuj();
  expect(q('[data-akcja="odmowa"]')!.disabled).toBe(true);
  await wpisz("Pula adresów IP jest wyczerpana.");
  expect(q('[data-akcja="odmowa"]')!.disabled).toBe(false);
  await klik(q('[data-akcja="odmowa"]')!);
  expect(k.textContent).toContain("Odmówić realizacji i zwrócić 25,00 zł na portfel klienta?");
  await klik(q('[data-akcja="potwierdz"]')!);
  expect(zamknij).toHaveBeenCalledWith("t1", "z1", "ODMOWA", "Pula adresów IP jest wyczerpana.");
  expect(odswiez).not.toHaveBeenCalled();
  expect(k.querySelector('[role="alert"]')!.textContent).toContain("jest zrealizowany");
});

it("uprawnienia: L2 — tylko „Zrealizowano” i informacja o L4; L1 — bez przycisków", async () => {
  await montuj({ mozeZwrocic: false });
  expect(q('[data-akcja="zrealizowano"]')).not.toBeNull();
  expect(q('[data-akcja="odmowa"]')).toBeNull();
  expect(k.textContent).toContain("Odmowę ze zwrotem na portfel robi kierownik zmiany (L4).");
  await act(async () => root.unmount());
  k.remove();

  await montuj({ mozeRealizowac: false, mozeZwrocic: false });
  expect(q('[data-akcja="zrealizowano"]')).toBeNull();
  expect(q('[data-akcja="odmowa"]')).toBeNull();
  expect(k.querySelector("textarea")).toBeNull();
});

it("zamknięte zlecenie: stan i notatka, bez przycisków; brak zleceń — brak karty", async () => {
  await montuj({ zlecenia: [{ ...ZLECENIE, status: "REFUNDED", notatka: "Pula adresów IP jest wyczerpana.", zamknietoAt: "2026-10-12T10:30:00Z" }] });
  expect(k.textContent).toContain("odmowa — opłata zwrócona · 12.10, 12:30");
  expect(k.textContent).toContain("„Pula adresów IP jest wyczerpana.”");
  expect(q("button")).toBeNull();
  await act(async () => root.unmount());
  k.remove();

  await montuj({ zlecenia: [] });
  expect(k.querySelector('[data-karta="dodatek"]')).toBeNull();
});
