/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
jest.mock("./actions", () => ({
  createVpsPlan: jest.fn(async () => ({ ok: true })),
  updateVpsPlan: jest.fn(async () => ({ ok: true })),
  disableVpsPlan: jest.fn(async () => ({ ok: true })),
}));

import { createVpsPlan } from "./actions";
import { VpsPlansClient } from "./vps-plans-client";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const TYPY = [
  { name: "cpx11", cores: 2, memory: 2, disk: 40 },
  { name: "cx23", cores: 2, memory: 4, disk: 40 },
];

let root: Root;
let k: HTMLElement;

function wpisz(el: HTMLInputElement, v: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const przycisk = (t: string) => [...k.querySelectorAll("button")].find((b) => b.textContent?.includes(t))!;
const pole = (etykieta: string) =>
  [...k.querySelectorAll("label")].find((l) => l.textContent?.startsWith(etykieta))!.querySelector("input")!;

beforeEach(() => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  act(() => root.render(<VpsPlansClient available plans={[]} serverTypes={TYPY} />));
  act(() => przycisk("Nowy plan VPS").click());
  act(() => {
    wpisz(pole("Slug"), "vps-start");
    wpisz(pole("Nazwa"), "VPS Start");
  });
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  jest.clearAllMocks();
});

describe("Nowy plan VPS — cena i typ", () => {
  it("cena z przecinkiem (polska przeglądarka) zapisuje się jako 44.99, typ domyślny z katalogu", async () => {
    act(() => wpisz(pole("Cena/mies."), "44,99"));
    await act(async () => przycisk("Utwórz plan").click());
    expect(createVpsPlan).toHaveBeenCalledWith(expect.objectContaining({ priceMonthly: 44.99, hetznerServerType: "cx23" }));
  });

  it("cena z kropką też działa", async () => {
    act(() => wpisz(pole("Cena/mies."), "44.99"));
    await act(async () => przycisk("Utwórz plan").click());
    expect(createVpsPlan).toHaveBeenCalledWith(expect.objectContaining({ priceMonthly: 44.99 }));
  });

  it("bez ceny albo z ceną 0 nie da się utworzyć planu (VPS za darmo)", () => {
    expect(przycisk("Utwórz plan").disabled).toBe(true);
    act(() => wpisz(pole("Cena/mies."), "0"));
    expect(przycisk("Utwórz plan").disabled).toBe(true);
  });

  it("typ spoza katalogu blokuje zapis", () => {
    act(() => root.render(<VpsPlansClient available plans={[]} serverTypes={[TYPY[0]]} />));
    act(() => wpisz(pole("Cena/mies."), "44,99"));
    expect(przycisk("Utwórz plan").disabled).toBe(true);
    expect(k.textContent).toContain("Wybierz typ serwera z katalogu.");
  });
});
