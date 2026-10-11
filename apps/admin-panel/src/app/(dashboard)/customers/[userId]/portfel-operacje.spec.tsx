/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** F3.6 — „Zaksięguj przelew” i „Korekta salda” na karcie klienta: walidacja, potwierdzenie, klucz operacji. */
const wplata = jest.fn();
const korekta = jest.fn();
jest.mock("../../billing/rozliczenia-actions", () => ({
  wplataPrzelewemAction: (...a: unknown[]) => wplata(...a),
  korektaSaldaAction: (...a: unknown[]) => korekta(...a),
}));
const potwierdz = jest.fn(async (..._a: unknown[]) => true);
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));
jest.mock("@/components/select", () => ({
  Select: (p: { value: string; onChange: (v: string) => void }) => <input data-pole="kierunek" value={p.value} onChange={(e) => p.onChange(e.target.value)} />,
}));
jest.mock("@/components/pole-daty", () => ({
  PoleDaty: (p: { value: string; onChange: (v: string) => void }) => <input data-pole="data" value={p.value} onChange={(e) => p.onChange(e.target.value)} />,
}));

import { PortfelOperacje, kwotaZPola } from "./portfel-operacje";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let k: HTMLElement;
const render = async () => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root!.render(<PortfelOperacje userId="u1" saldo="20.00" />));
};
const pole = (p: string) => k.querySelector<HTMLInputElement>(`[data-pole="${p}"]`)!;
const przycisk = (a: string) => k.querySelector<HTMLButtonElement>(`[data-akcja="${a}"]`)!;
const wpisz = async (el: HTMLInputElement, tekst: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, tekst);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const klik = (b: HTMLElement) => act(async () => b.click());

beforeEach(() => {
  wplata.mockReset().mockResolvedValue({ ok: true, komunikat: "Zaksięgowano 123.45 K; dokument VDR/2026/10/0007." });
  korekta.mockReset().mockResolvedValue({ ok: true, komunikat: "Korekta zapisana." });
  potwierdz.mockClear();
});
afterEach(() => act(() => root?.unmount()));

it("kwota z pola: przecinek albo kropka, dwa miejsca, do 100 000", () => {
  expect(kwotaZPola("123,45")).toBe(123.45);
  expect(kwotaZPola(" 1 000.5 ")).toBe(1000.5);
  expect(kwotaZPola("0")).toBeNull();
  expect(kwotaZPola("1,234")).toBeNull();
  expect(kwotaZPola("100000.01")).toBeNull();
  expect(kwotaZPola("abc")).toBeNull();
});

it("przelew: przycisk czeka na kwotę, tytuł i referencję; po potwierdzeniu wysyła dane i pokazuje wynik", async () => {
  await render();
  expect(przycisk("zaksieguj").disabled).toBe(true);
  await wpisz(pole("kwota-wplaty"), "123,45");
  await wpisz(pole("tytul"), "Doładowanie konta");
  await wpisz(pole("referencja"), "ab12");
  await wpisz(pole("data"), "2026-10-10");
  expect(przycisk("zaksieguj").disabled).toBe(false);
  await klik(przycisk("zaksieguj"));
  expect(potwierdz).toHaveBeenCalledTimes(1);
  expect(wplata).toHaveBeenCalledWith("u1", { kwota: 123.45, tytul: "Doładowanie konta", referencja: "ab12", dataWplaty: "2026-10-10", zgloszenie: "" });
  expect(k.textContent).toContain("dokument VDR/2026/10/0007");
});

it("korekta: wymaga powodu min. 10 znaków; ten sam klucz przy ponowieniu po błędzie, nowy po sukcesie", async () => {
  korekta.mockResolvedValueOnce({ ok: false, error: "Saldo klienta (20.00 K) jest mniejsze niż kwota korekty." });
  await render();
  await wpisz(pole("kierunek"), "minus");
  await wpisz(pole("kwota-korekty"), "30");
  await wpisz(pole("powod"), "krótki");
  expect(przycisk("korekta").disabled).toBe(true);
  await wpisz(pole("powod"), "Cofnięcie błędnego uznania z 10.10");
  await klik(przycisk("korekta"));
  expect(k.textContent).toContain("mniejsze niż kwota korekty");
  await klik(przycisk("korekta"));
  const [pierwszy, drugi] = korekta.mock.calls.map((c) => (c[1] as { klucz: string }).klucz);
  expect(korekta.mock.calls[0][1]).toMatchObject({ kierunek: "minus", kwota: 30, powod: "Cofnięcie błędnego uznania z 10.10" });
  expect(pierwszy).toBe(drugi);
  expect(k.textContent).toContain("Korekta zapisana.");
  // Po sukcesie formularz dostaje nowy klucz — następna korekta nie zostanie uznana za duplikat.
  await wpisz(pole("kwota-korekty"), "5");
  await wpisz(pole("powod"), "Druga, osobna korekta salda");
  await klik(przycisk("korekta"));
  expect((korekta.mock.calls[2][1] as { klucz: string }).klucz).not.toBe(pierwszy);
});
