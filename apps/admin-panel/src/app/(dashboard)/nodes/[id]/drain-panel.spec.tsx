/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("../actions", () => ({
  drainNode: jest.fn().mockResolvedValue({ data: {} }),
  fetchMigrationPlan: jest.fn().mockResolvedValue({ data: null }),
}));

import { drainNode } from "../actions";
import { DrainPanel } from "./drain-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const przycisk = (tekst: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(tekst))!;

/** Przegląd 10.10 — „Rozpocznij wycofanie” zmieniało węzeł jednym kliknięciem, bez okna (nagłówek karty pyta). */
describe("Wycofanie węzła — potwierdzenie", () => {
  let root: Root;
  let el: HTMLElement;
  beforeEach(async () => {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => root.render(<DrainPanel serverId="w1" acceptsNewAccounts />));
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  it("Anuluj nie wycofuje; potwierdzenie wycofuje", async () => {
    await act(async () => przycisk("Rozpocznij wycofanie").click());
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Rozpocząć wycofanie węzła?");
    await act(async () => przycisk("Anuluj").click());
    expect(drainNode).not.toHaveBeenCalled();

    await act(async () => przycisk("Rozpocznij wycofanie").click());
    await act(async () => document.querySelector<HTMLFormElement>('[role="alertdialog"]')!.requestSubmit());
    expect(drainNode).toHaveBeenCalledWith("w1", undefined);
  });
});
