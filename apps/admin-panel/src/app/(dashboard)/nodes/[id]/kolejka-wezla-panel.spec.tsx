/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** F3.1 — kolejka poczty węzła: odczyt z frazą, nagłówki bez treści, „Wypchnij kolejkę” tylko z powodem i potwierdzeniem. */
const akcja = jest.fn();
jest.mock("./kolejka-wezla-actions", () => ({ kolejkaWezlaAction: (...a: unknown[]) => akcja(...a) }));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { KolejkaWezlaPanel } from "./kolejka-wezla-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const STAN = {
  wToku: false,
  wczytano: "2026-10-10T12:00:00.000Z",
  szukaj: "gmail",
  podsumowanie: { wKolejce: 5000, przeczytano: 3000, pasuje: 1, pokazano: 1 },
  wiadomosci: [{ id: "1aBcDe-0003hL-9u", wiek: "2h", rozmiar: "12K", zamrozona: true, nadawca: "", odbiorcy: "b@gmail.com", temat: "Undelivered" }],
  blad: null,
  usuwanie: null,
  wypchniecie: { wToku: false, kiedy: "2026-10-10T11:00:00.000Z", blad: null, przed: 40, po: 3 },
};

let root: Root;
let k: HTMLElement;
const klik = async (b: HTMLElement) => {
  await act(async () => {
    b.click();
  });
};
const wpisz = async (pole: HTMLInputElement, tekst: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pole, tekst);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(async () => {
  akcja.mockReset();
  potwierdz.mockClear();
  akcja.mockResolvedValue({ ok: true, wynik: STAN });
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<KolejkaWezlaPanel serverId="w1" />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

it("stan: nagłówki, zwrot <> i zamrożona, ile sprawdzono z ilu, wynik ostatniego wypchnięcia", () => {
  expect(akcja).toHaveBeenCalledWith("w1", "stan");
  expect(k.querySelectorAll("[data-wiadomosc]")).toHaveLength(1);
  expect(k.textContent).toContain("<> (zwrot)");
  expect(k.textContent).toContain("sprawdzono 3000 najstarszych");
  expect(k.textContent).toContain("w kolejce było 40, zostało 3");
});

it("wczytanie z frazą; wypchnięcie dopiero z powodem i po potwierdzeniu", async () => {
  await wpisz(k.querySelector<HTMLInputElement>('input[aria-label="Fraza wyszukiwania na serwerze"]')!, "spam");
  await klik(k.querySelector<HTMLButtonElement>('[data-akcja="wczytaj"]')!);
  expect(akcja).toHaveBeenLastCalledWith("w1", "wczytaj", { szukaj: "spam" });
  const wypchnij = k.querySelector<HTMLButtonElement>('[data-akcja="wypchnij"]')!;
  expect(wypchnij.disabled).toBe(true);
  await wpisz(k.querySelector<HTMLInputElement>('input[placeholder="np. po zdjęciu IP z RBL"]')!, "Po zdjęciu IP z listy RBL");
  potwierdz.mockResolvedValueOnce(false);
  await klik(wypchnij);
  expect(akcja).not.toHaveBeenCalledWith("w1", "wypchnij", expect.anything());
  await klik(wypchnij);
  expect(akcja).toHaveBeenLastCalledWith("w1", "wypchnij", { powod: "Po zdjęciu IP z listy RBL" });
});
