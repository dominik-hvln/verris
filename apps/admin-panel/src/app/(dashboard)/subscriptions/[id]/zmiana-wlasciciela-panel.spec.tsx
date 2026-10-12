/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** K2 (PB-53.5) — „Zmień właściciela”: wyszukanie po e-mailu, odmowy z API, powód i potwierdzenie wpisaniem adresu. */
const podglad = jest.fn();
const zmien = jest.fn();
jest.mock("./zmiana-wlasciciela-actions", () => ({
  podgladZmianyWlascicielaAction: (...a: unknown[]) => podglad(...a),
  zmienWlascicielaAction: (...a: unknown[]) => zmien(...a),
}));
const zapytaj = jest.fn(async (..._a: unknown[]): Promise<string | null> => "nowy@firma.pl");
jest.mock("@/components/potwierdz", () => ({ zapytaj: (...a: unknown[]) => zapytaj(...a) }));
jest.mock("next/link", () => ({ __esModule: true, default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));

import { ZmianaWlascicielaPanel } from "./zmiana-wlasciciela-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const POWOD = "Sprzedaż firmy — prośba obu stron";
const OK = {
  ok: true,
  wynik: { usluga: { id: "s1", domena: "strona.pl", obecnyWlasciciel: "stary@firma.pl" }, nowyWlasciciel: { id: "u2", email: "nowy@firma.pl", imie: "Ala" }, odmowy: [], uwagi: ["Płatne dodatki (autoskalowanie) od przeniesienia obciążają portfel nowego właściciela."] },
};

let root: Root | undefined;
let k: HTMLElement;
const render = async () => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root!.render(<ZmianaWlascicielaPanel subscriptionId="s1" obecnyEmail="stary@firma.pl" />));
};
const przycisk = (a: string) => k.querySelector<HTMLButtonElement>(`[data-akcja="${a}"]`);
const pole = (p: string) => k.querySelector<HTMLInputElement>(`[data-pole="${p}"]`)!;
const wpisz = async (el: HTMLInputElement, tekst: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, tekst);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const klik = (b: HTMLElement) => act(async () => b.click());

beforeEach(() => {
  podglad.mockReset().mockResolvedValue(OK);
  zmien.mockReset().mockResolvedValue({ ok: true, komunikat: "Usługa strona.pl należy teraz do nowy@firma.pl.", nowyWlascicielId: "u2" });
  zapytaj.mockReset().mockResolvedValue("nowy@firma.pl");
});
afterEach(() => act(() => root?.unmount()));

it("sprawdzenie → nowy właściciel i uwagi; powód obowiązkowy; potwierdzenie adresem; wysyła e-mail, powód i potwierdzenie", async () => {
  await render();
  expect(przycisk("sprawdz")!.disabled).toBe(true);
  await wpisz(pole("email"), " Nowy@Firma.pl ");
  await klik(przycisk("sprawdz")!);
  expect(podglad).toHaveBeenCalledWith("s1", "Nowy@Firma.pl");
  expect(k.textContent).toContain("Nowy właściciel: nowy@firma.pl (Ala)");
  expect(k.textContent).toContain("Płatne dodatki");
  expect(przycisk("zmien-wlasciciela")!.disabled).toBe(true);
  await wpisz(pole("powod"), POWOD);
  await klik(przycisk("zmien-wlasciciela")!);
  expect(zapytaj).toHaveBeenCalledWith(expect.stringContaining("od stary@firma.pl do nowy@firma.pl"), expect.objectContaining({ akcja: "Zmień właściciela" }));
  expect(zmien).toHaveBeenCalledWith("s1", { email: "nowy@firma.pl", powod: POWOD, potwierdzenie: "nowy@firma.pl" });
  expect(k.querySelector('[role="status"]')!.textContent).toContain("należy teraz do nowy@firma.pl");
  expect(k.querySelector('a[href="/customers/u2"]')).not.toBeNull();
});

it("zły adres w potwierdzeniu albo anulowanie okna → nic nie wysyłamy", async () => {
  await render();
  await wpisz(pole("email"), "nowy@firma.pl");
  await klik(przycisk("sprawdz")!);
  await wpisz(pole("powod"), POWOD);
  zapytaj.mockResolvedValueOnce("inny@firma.pl");
  await klik(przycisk("zmien-wlasciciela")!);
  expect(k.textContent).toContain("nie zgadza się");
  zapytaj.mockResolvedValueOnce(null);
  await klik(przycisk("zmien-wlasciciela")!);
  expect(zmien).not.toHaveBeenCalled();
});

it("odmowy z API: pokazane, bez pola powodu i bez przycisku zmiany", async () => {
  podglad.mockResolvedValue({ ok: true, wynik: { ...OK.wynik, odmowy: ["Usługa ma zaległą płatność — najpierw rozlicz ją u obecnego właściciela (zaległość nie przechodzi na nowego)."] } });
  await render();
  await wpisz(pole("email"), "nowy@firma.pl");
  await klik(przycisk("sprawdz")!);
  expect(k.querySelectorAll("[data-odmowa]")).toHaveLength(1);
  expect(przycisk("zmien-wlasciciela")).toBeNull();
});

it("zmiana adresu po sprawdzeniu unieważnia podgląd — trzeba sprawdzić ponownie", async () => {
  await render();
  await wpisz(pole("email"), "nowy@firma.pl");
  await klik(przycisk("sprawdz")!);
  expect(przycisk("zmien-wlasciciela")).not.toBeNull();
  await wpisz(pole("email"), "inny@firma.pl");
  expect(przycisk("zmien-wlasciciela")).toBeNull();
});
