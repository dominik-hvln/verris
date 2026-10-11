/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** F3.8 (ON-01) — komunikat serwisowy: najpierw podgląd odbiorców i treści, potem wysyłka z powodem i potwierdzeniem. */
const podglad = jest.fn();
const zlec = jest.fn(async (..._a: unknown[]) => ({ ok: true, wynik: { id: "k1" } }));
jest.mock("./actions", () => ({ podgladKomunikatuAction: (...a: unknown[]) => podglad(...a), zlecKomunikatAction: (...a: unknown[]) => zlec(...a) }));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

import { FormularzKomunikatu } from "./formularz-komunikatu";

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
const TRESC = "Dzień dobry{imie},\n\nserwer z Twoją stroną jest niedostępny, pracujemy nad tym.\n\nZespół obsługi Verris";

beforeEach(async () => {
  podglad.mockReset();
  zlec.mockClear();
  potwierdz.mockClear();
  podglad.mockResolvedValue({
    ok: true,
    wynik: { zakres: "WEZEL", cel: { id: "w1", nazwa: "fra-01" }, odbiorcow: 2, przekroczono: false, przyklad: [{ id: "u1", email: "a@firma.pl", nazwa: null }], temat: "Awaria", podgladTekst: "Dzień dobry,", minutWysylki: 1 },
  });
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<FormularzKomunikatu wezly={[{ id: "w1", nazwa: "fra-01" }]} plany={[]} start={{ zakres: "WEZEL", celId: "w1" }} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

it("podgląd → „Wyślij do 2 klientów” dopiero z powodem → potwierdzenie → zlecenie", async () => {
  await wpisz(pole<HTMLInputElement>('input[aria-label="Temat"]'), "Awaria serwera — pracujemy nad tym");
  await wpisz(pole<HTMLTextAreaElement>('textarea[aria-label="Treść"]'), TRESC);
  expect(k.querySelector('[data-akcja="wyslij"]')).toBeNull();
  await act(async () => pole<HTMLButtonElement>('[data-akcja="podglad"]').click());
  expect(podglad).toHaveBeenCalledWith({ zakres: "WEZEL", celId: "w1", temat: "Awaria serwera — pracujemy nad tym", tresc: TRESC });
  expect(pole("[data-podglad]").textContent).toContain("a@firma.pl");
  expect(pole<HTMLButtonElement>('[data-akcja="wyslij"]').disabled).toBe(true);
  await wpisz(pole<HTMLInputElement>('input[aria-label="Powód"]'), "awaria dysku, incydent #12");
  expect(pole('[data-akcja="wyslij"]').textContent).toBe("Wyślij do 2 klientów");
  await act(async () => pole<HTMLButtonElement>('[data-akcja="wyslij"]').click());
  expect(potwierdz).toHaveBeenCalled();
  expect(zlec).toHaveBeenCalledWith({ zakres: "WEZEL", celId: "w1", temat: "Awaria serwera — pracujemy nad tym", tresc: TRESC, powod: "awaria dysku, incydent #12" });
});

it("zmiana treści po podglądzie unieważnia podgląd; treść promocyjna blokuje podgląd", async () => {
  await wpisz(pole<HTMLInputElement>('input[aria-label="Temat"]'), "Awaria serwera — pracujemy nad tym");
  await act(async () => pole<HTMLButtonElement>('[data-akcja="podglad"]').click());
  await wpisz(pole<HTMLTextAreaElement>('textarea[aria-label="Treść"]'), `${TRESC}\n\nPS. Promocja na domeny!`);
  expect(k.querySelector("[data-podglad]")).toBeNull();
  expect(pole("[data-ostrzezenie]").textContent).toContain("promocyjną");
  expect(pole<HTMLButtonElement>('[data-akcja="podglad"]').disabled).toBe(true);
});
