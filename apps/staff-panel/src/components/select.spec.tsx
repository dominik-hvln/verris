/**
 * @jest-environment jsdom
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Select } from "./select";

/**
 * Weryfikacja 11.10 — karta usługi → Operacje → „Dodatki” (slug = ""): Select pokazywał pierwszą pozycję jako
 * wybraną, a jej wybór nie wołał onChange, więc „Dodaj dodatek” zostawał nieaktywny. Z jawnym placeholderem wartość
 * spoza listy = brak wyboru; bez placeholdera zostaje zachowanie natywnego selecta (formularze na nim polegają).
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// jsdom nie ma scrollIntoView (Select przewija listę do podświetlonej pozycji).
Element.prototype.scrollIntoView = () => {};

const OPCJE = [
  { value: "dedicated_ip", label: "Dedykowane IP" },
  { value: "backup_plus", label: "Kopie plus" },
];
let root: Root;
let k: HTMLElement;
const zmiany: string[] = [];

function Test({ placeholder, name }: { placeholder?: string; name?: string }) {
  const [v, setV] = useState("");
  return (
    <>
      <Select value={v} onChange={(x) => { zmiany.push(x); setV(x); }} options={OPCJE} placeholder={placeholder} name={name} aria-label="Dodatek" />
      <output data-stan>{v}</output>
    </>
  );
}
const pole = () => k.querySelector<HTMLButtonElement>('[role="combobox"]')!;
const widoczne = () => pole().querySelector("span > span:last-child")!.textContent;
async function wybierz(etykieta: string) {
  await act(async () => pole().click());
  const opcja = [...k.querySelectorAll<HTMLLIElement>('[role="option"]')].find((o) => o.textContent === etykieta)!;
  await act(async () => opcja.click());
}

beforeEach(() => {
  zmiany.length = 0;
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("z placeholderem: wartość '' pokazuje placeholder, a wybór PIERWSZEJ opcji woła onChange", async () => {
  await act(async () => root.render(<Test placeholder="Wybierz dodatek…" name="slug" />));
  expect(widoczne()).toBe("Wybierz dodatek…");
  expect(k.querySelector<HTMLInputElement>('input[name="slug"]')!.value).toBe("");
  await act(async () => pole().click());
  expect(k.querySelector('[role="option"][aria-selected="true"]')).toBeNull();
  await act(async () => pole().click());
  await wybierz("Dedykowane IP");
  expect(zmiany).toEqual(["dedicated_ip"]);
  expect(k.querySelector("[data-stan]")!.textContent).toBe("dedicated_ip");
  expect(widoczne()).toBe("Dedykowane IP");
});

it("bez placeholdera: jak natywny select — pierwsza opcja widoczna i wysyłana, jej ponowny wybór bez onChange", async () => {
  await act(async () => root.render(<Test name="slug" />));
  expect(widoczne()).toBe("Dedykowane IP");
  expect(k.querySelector<HTMLInputElement>('input[name="slug"]')!.value).toBe("dedicated_ip");
  await wybierz("Dedykowane IP");
  expect(zmiany).toEqual([]);
  await wybierz("Kopie plus");
  expect(zmiany).toEqual(["backup_plus"]);
});
