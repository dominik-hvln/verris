/**
 * @jest-environment jsdom
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PoleLiczby, liczbaZPola } from "./pole-liczby";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let k: HTMLElement;
const zmiany: number[] = [];
const ostatnia = () => zmiany.at(-1) ?? 3;

function Test({ start }: { start: number }) {
  const [v, setV] = useState(start);
  return <PoleLiczby value={v} onChange={(n) => { zmiany.push(n); setV(n); }} aria-label="kwota" />;
}
const pole = () => k.querySelector("input")!;
function wpisz(v: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pole(), v);
  pole().dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  act(() => root.render(<Test start={3} />));
});
afterEach(() => {
  act(() => root.unmount());
  zmiany.length = 0;
});

describe("PoleLiczby", () => {
  it("liczbaZPola: przecinek i kropka", () => {
    expect(liczbaZPola("44,99")).toBe(44.99);
    expect(liczbaZPola("44.99")).toBe(44.99);
    expect(Number.isNaN(liczbaZPola(""))).toBe(true);
  });

  it("wpisywanie „0,” i „0.” nie zeruje pola ani wartości (ułamki w polskiej przeglądarce)", () => {
    act(() => wpisz(""));
    expect(pole().value).toBe("");
    expect(ostatnia()).toBe(3);
    act(() => wpisz("0."));
    expect(pole().value).toBe("0.");
    act(() => wpisz("0.15"));
    expect(ostatnia()).toBe(0.15);
    act(() => wpisz("1,5"));
    expect(ostatnia()).toBe(1.5);
  });

  it("po wyjściu z pustego pola wraca bieżąca wartość; ujemne → 0", () => {
    act(() => wpisz("-4"));
    expect(ostatnia()).toBe(0);
    act(() => wpisz(""));
    act(() => pole().dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(pole().value).toBe("0");
  });
});
