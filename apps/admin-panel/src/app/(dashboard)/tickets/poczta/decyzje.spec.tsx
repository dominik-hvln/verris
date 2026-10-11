/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** F3.7 — pliki od nieznanego nadawcy: bez nazw i linków, dopóki operator nie potwierdzi „Pokaż”; link z potwierdzam=1. */
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a), zapytaj: jest.fn() }));
jest.mock("./actions", () => ({ przypiszPocztaAction: jest.fn(), odrzucPocztaAction: jest.fn(), blokadaNadawcyAction: jest.fn() }));

import { DecyzjePoczty, PlikiPoczty } from "./decyzje";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ID = "0b6f4d1e-1111-4222-8333-444455556666";
const PLIKI = [
  { nr: 0, nazwa: "zrzut.jpg", typ: "image/jpeg", rozmiar: 2048, dostepny: true },
  { nr: 1, nazwa: "dowody.zip", pominiety: "niedozwolony typ pliku", dostepny: false },
];

let root: Root;
let k: HTMLElement;
beforeEach(async () => {
  potwierdz.mockClear();
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<PlikiPoczty id={ID} pliki={PLIKI} />));
});
afterEach(() => {
  act(() => root.unmount());
  k.remove();
});

const przycisk = () => k.querySelector<HTMLButtonElement>('[data-akcja="pokaz-pliki"]');

it("domyślnie tylko liczba plików — bez nazw i linków", () => {
  expect(przycisk()?.textContent).toBe("Pokaż pliki (2)");
  expect(k.textContent).not.toContain("zrzut.jpg");
  expect(k.querySelector("a")).toBeNull();
});

it("anulowane ostrzeżenie — dalej ukryte; potwierdzone — link z potwierdzam=1, pominięty plik bez linku", async () => {
  potwierdz.mockResolvedValueOnce(false);
  await act(async () => przycisk()!.click());
  expect(k.querySelector("a")).toBeNull();
  await act(async () => przycisk()!.click());
  expect(String(potwierdz.mock.calls[1][0])).toMatch(/nie były skanowane antywirusem/);
  const a = k.querySelectorAll("a");
  expect(a).toHaveLength(1);
  expect(a[0].getAttribute("href")).toBe(`/api/poczta-plik/${ID}/0?potwierdzam=1`);
  expect(k.textContent).toContain("dowody.zip — pominięty: niedozwolony typ pliku");
});

it("abuse@: bez „Załóż zgłoszenie” (treść zgłaszającego nie trafia do klienta) — tylko dopisanie i odrzucenie", async () => {
  await act(async () => root.render(<DecyzjePoczty id={ID} nadawca="anna@firma.pl" sugerowane={null} abuse />));
  expect(k.querySelector('[data-akcja="do-klienta"]')).toBeNull();
  expect(k.querySelector('[data-akcja="do-zgloszenia"]')).not.toBeNull();
  await act(async () => root.render(<DecyzjePoczty id={ID} nadawca="jan@x.pl" sugerowane={null} />));
  expect(k.querySelector('[data-akcja="do-klienta"]')).not.toBeNull();
});
