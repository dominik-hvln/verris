/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** K3 — limity indywidualne na karcie usługi: plan obok pola, powód obowiązkowy, potwierdzenie, przywrócenie planu. */
const zapis = jest.fn();
jest.mock("./limity-indywidualne-actions", () => ({ zapiszLimityAction: (...a: unknown[]) => zapis(...a) }));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));

import { LimityIndywidualnePanel } from "./limity-indywidualne-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const LIMITY = [
  { pole: "diskLimitMb", etykieta: "Dysk", plan: 51200, nadpisanie: null, efektywny: 51200 },
  { pole: "includedTransferGb", etykieta: "Transfer miesięczny", plan: null, nadpisanie: null, efektywny: null },
  { pole: "domains", etykieta: "Domeny", plan: null, nadpisanie: null, efektywny: null },
  { pole: "emailAccounts", etykieta: "Skrzynki e-mail", plan: null, nadpisanie: 100, efektywny: 100 },
  { pole: "databases", etykieta: "Bazy danych", plan: null, nadpisanie: null, efektywny: null },
] as const;

let root: Root;
let k: HTMLElement;
const render = async (isAdmin = true, limity: readonly (typeof LIMITY)[number][] = LIMITY) => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<LimityIndywidualnePanel subscriptionId="s1" limity={limity as never} isAdmin={isAdmin} />));
};
const przycisk = (a: string) => k.querySelector<HTMLButtonElement>(`[data-akcja="${a}"]`);
const pole = (p: string) => k.querySelector<HTMLInputElement>(`[data-limit="${p}"] input`)!;
const wpisz = async (el: HTMLInputElement, tekst: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, tekst);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const powod = () => k.querySelector<HTMLInputElement>('input[maxlength="500"]')!;

beforeEach(() => {
  zapis.mockReset();
  potwierdz.mockClear();
  zapis.mockResolvedValue({ ok: true, komunikat: "Zapisano limity indywidualne — obowiązują na serwerze." });
});
afterEach(() => act(() => root.unmount()));

it("pokazuje plan i obecne nadpisanie; puste pole = jak w planie", async () => {
  await render();
  expect(k.querySelector('[data-limit="diskLimitMb"]')!.textContent).toContain("Dysk (MB) — w planie: 50 GB");
  expect(k.querySelector('[data-limit="emailAccounts"]')!.textContent).toContain("w planie: bez limitu · teraz 100");
  expect(pole("emailAccounts").value).toBe("100");
  expect(pole("diskLimitMb").value).toBe("");
});

it("zapis wymaga powodu; potwierdzenie z listą limitów; wysyła wszystkie pola (puste = null)", async () => {
  await render();
  await wpisz(pole("diskLimitMb"), "102400");
  expect(przycisk("zapisz-limity")!.disabled).toBe(true);
  await wpisz(powod(), "Umowa z klientem z 12.10");
  await act(async () => przycisk("zapisz-limity")!.click());
  expect(potwierdz.mock.calls[0]?.[0]).toContain("Dysk 100 GB, Skrzynki e-mail 100");
  expect(zapis).toHaveBeenCalledWith("s1", {
    limity: { diskLimitMb: 102400, includedTransferGb: null, domains: null, emailAccounts: 100, databases: null },
    powod: "Umowa z klientem z 12.10",
    zgloszenie: "",
  });
  expect(k.textContent).toContain("Zapisano limity indywidualne");
});

it("błędna wartość (poza zakresem) — komunikat i zapis wyłączony", async () => {
  await render();
  await wpisz(powod(), "Umowa z klientem z 12.10");
  await wpisz(pole("domains"), "0");
  expect(k.textContent).toContain("Domeny: liczba całkowita od 1");
  expect(przycisk("zapisz-limity")!.disabled).toBe(true);
});

it("„Przywróć limity planu” tylko przy nadpisaniach; wysyła limity null", async () => {
  await render();
  await wpisz(powod(), "Koniec umowy indywidualnej");
  await act(async () => przycisk("przywroc-limity")!.click());
  expect(zapis).toHaveBeenCalledWith("s1", { limity: null, powod: "Koniec umowy indywidualnej", zgloszenie: "" });
  act(() => root.unmount());
  await render(true, LIMITY.map((l) => ({ ...l, nadpisanie: null })) as never);
  expect(przycisk("przywroc-limity")).toBeNull();
});

it("personel (nie administrator): tylko podgląd, pola i przyciski wyłączone", async () => {
  await render(false);
  expect(k.textContent).toContain("Limity indywidualne ustawia administrator.");
  expect(pole("diskLimitMb").disabled).toBe(true);
  expect(przycisk("zapisz-limity")!.disabled).toBe(true);
});
