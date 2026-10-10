/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** F3.2 (D5) — blokady IP węzła (NOC): lista z powodem, odblokowanie i biała lista z powodem i potwierdzeniem. */
const akcja = jest.fn();
jest.mock("./blokady-ip-wezla-actions", () => ({ blokadyIpWezlaAction: (...a: unknown[]) => akcja(...a) }));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));

import { BlokadyIpWezlaPanel } from "./blokady-ip-wezla-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const STAN = {
  wToku: false,
  lista: {
    kiedy: "2026-10-10T10:00:00Z",
    jaile: ["sshd", "dovecot"],
    blokady: [
      { ip: "203.0.113.7", jail: "sshd", powod: "nieudane logowania SSH", od: "2026-10-10T10:00:00Z", do: "2026-10-10T11:00:00Z", stala: false },
      { ip: "2001:db8::5", jail: "dovecot", powod: "nieudane logowania IMAP/POP3 (odbiór poczty)", od: "2026-10-10T09:00:00Z", do: null, stala: true },
    ],
    razem: 2,
    pokazano: 2,
    bialaLista: ["198.51.100.9"],
  },
  operacja: { tryb: "unban", ip: "203.0.113.9", wToku: false, kiedy: "2026-10-10T09:59:00Z", odblokowano: 2, blad: null },
  blad: null,
};

let root: Root;
let k: HTMLElement;
const q = <T extends HTMLElement = HTMLButtonElement>(sel: string) => k.querySelector<T>(sel);
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
  await act(async () => root.render(<BlokadyIpWezlaPanel serverId="w1" />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

it("lista: adres, powód z jailem, stała blokada, biała lista, wynik ostatniej operacji", () => {
  expect(akcja).toHaveBeenCalledWith("w1", "stan");
  expect(q('[data-blokada="203.0.113.7"]')!.textContent).toContain("nieudane logowania SSH");
  expect(q('[data-blokada="2001:db8::5"]')!.textContent).toContain("na stałe");
  expect(q("[data-biala-lista]")!.textContent).toContain("198.51.100.9");
  expect(q('[data-operacja="wynik"]')!.textContent).toContain("zdjęto 2 blokady");
});

it("odblokowanie i biała lista: wymagają adresu i powodu, z potwierdzeniem; anulowanie — nic", async () => {
  await klik(q<HTMLButtonElement>('[data-blokada="203.0.113.7"] button')!);
  expect(q('[data-akcja="odblokuj"]')!.disabled).toBe(true);
  await wpisz(k.querySelector<HTMLInputElement>('input[aria-label="Powód"]')!, "Biuro klienta za NAT, zgłoszenie #ab12cd34");
  await klik(q('[data-akcja="odblokuj"]')!);
  expect(akcja).toHaveBeenLastCalledWith("w1", "odblokuj", { ip: "203.0.113.7", powod: "Biuro klienta za NAT, zgłoszenie #ab12cd34" });
  await wpisz(k.querySelector<HTMLInputElement>('input[aria-label="Powód"]')!, "Monitoring partnera, stałe zaufane IP");
  potwierdz.mockResolvedValueOnce(false);
  await klik(q('[data-akcja="dodaj"]')!);
  expect(akcja).not.toHaveBeenCalledWith("w1", "dodaj", expect.anything());
  await klik(q('[data-akcja="dodaj"]')!);
  expect(String(potwierdz.mock.calls.at(-1)![0])).toContain("białej listy");
  expect(akcja).toHaveBeenLastCalledWith("w1", "dodaj", { ip: "203.0.113.7", powod: "Monitoring partnera, stałe zaufane IP" });
});
