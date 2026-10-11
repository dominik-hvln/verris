/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** F3.8 (ON-03) — „Napisz do klienta”: szablon z polami, zmiana usługi, ostrzeżenie o treści promocyjnej, wysyłka z potwierdzeniem. */
const akcja = jest.fn(async (..._a: unknown[]) => ({ ok: true }));
jest.mock("./mail-obslugi-actions", () => ({ wyslijMailObslugiAction: (...a: unknown[]) => akcja(...a) }));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

import { NapiszDoKlienta } from "./napisz-do-klienta";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let k: HTMLElement;
const pole = <T extends HTMLElement>(s: string) => k.querySelector<T>(s)!;
const wpisz = async (el: HTMLInputElement | HTMLTextAreaElement, tekst: string) => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, tekst);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(async () => {
  akcja.mockClear();
  potwierdz.mockClear();
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<NapiszDoKlienta userId="k1" imie="Anna" domeny={["firma.pl", "sklep.pl"]} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

it("szablon wypełniony domeną i imieniem; wysyłka z potwierdzeniem i numerem zgłoszenia", async () => {
  expect(pole<HTMLInputElement>('input[aria-label="Temat"]').value).toBe("Prosimy o kontakt w sprawie usługi firma.pl");
  expect(pole<HTMLTextAreaElement>('textarea[aria-label="Treść"]').value).toContain("Dzień dobry Anna,");
  await wpisz(pole<HTMLInputElement>('input[aria-label="Numer zgłoszenia"]'), "#ab12cd34");
  await act(async () => pole<HTMLButtonElement>('[data-akcja="wyslij-mail"]').click());
  expect(potwierdz).toHaveBeenCalled();
  expect(akcja).toHaveBeenCalledWith("k1", expect.objectContaining({ szablon: "kontakt", temat: "Prosimy o kontakt w sprawie usługi firma.pl", zgloszenie: "#ab12cd34" }));
  expect(k.textContent).toContain("Wysłano");
});

it("treść promocyjna — ostrzeżenie i zablokowana wysyłka", async () => {
  await wpisz(pole<HTMLTextAreaElement>('textarea[aria-label="Treść"]'), "Dzień dobry, mamy dla Ciebie rabat 20% na kolejny rok hostingu.");
  expect(pole('[data-ostrzezenie]').textContent).toContain("promocyjną");
  expect(pole<HTMLButtonElement>('[data-akcja="wyslij-mail"]').disabled).toBe(true);
  expect(akcja).not.toHaveBeenCalled();
});
