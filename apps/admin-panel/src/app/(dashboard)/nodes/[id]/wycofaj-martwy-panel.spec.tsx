/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("../actions", () => ({ wycofajMartwyWezelAction: jest.fn() }));

import { WycofajMartwyPanel } from "./wycofaj-martwy-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Decyzja 15.10 — węzeł bez kont (przed reinstalacją u dostawcy) można wycofać od razu, bez tygodnia ciszy. */
describe("Wycofanie węzła z panelu — kiedy wolno", () => {
  let root: Root;
  let el: HTMLElement;
  beforeEach(() => {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });
  const render = (konta: number, martwy: boolean) =>
    act(() => root.render(<WycofajMartwyPanel serverId="w1" nazwa="t2" konta={konta} martwy={martwy} />));
  const pole = () => el.querySelector('input[placeholder="wpisz: t2"]');

  it("żywy węzeł z kontami — tylko informacja, bez pola potwierdzenia", () => {
    render(2, false);
    expect(pole()).toBeNull();
    expect(el.textContent).toContain("ma konta (2) — najpierw przenieś je na inne węzły");
  });

  it("żywy węzeł bez kont — pole potwierdzenia nazwą", () => {
    render(0, false);
    expect(pole()).not.toBeNull();
  });

  it("martwy węzeł z kontami — pole potwierdzenia nazwą (jak dotąd)", () => {
    render(3, true);
    expect(pole()).not.toBeNull();
  });
});
