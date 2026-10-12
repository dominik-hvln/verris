/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const createFeatureFlagAction = jest.fn(async (..._a: unknown[]) => ({ ok: true as const }));
jest.mock("./actions", () => ({
  createFeatureFlagAction: (...a: unknown[]) => createFeatureFlagAction(...a),
  updateFeatureFlagAction: jest.fn(),
}));

import { FeatureFlags } from "./flags";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let k: HTMLElement;
beforeEach(() => {
  createFeatureFlagAction.mockClear();
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const przycisk = (tekst: string) => [...k.querySelectorAll("button")].find((b) => b.textContent?.includes(tekst))!;

/** Beta „Zgłoś uwagę” — flaga bety powstaje wyłączona (brak flagi = wyłączona), flaga modułu — włączona. */
describe("FeatureFlags — zakładanie flag", () => {
  it("flaga bety: przycisk „+ flaga”, założona jako wyłączona; moduł jak dotąd włączony", async () => {
    act(() => root.render(<FeatureFlags rows={[]} />));
    await act(async () => przycisk("Zgłoś uwagę").click());
    expect(createFeatureFlagAction).toHaveBeenLastCalledWith("beta.zglos-uwage", "Przycisk „Zgłoś uwagę” (beta)", false);
    await act(async () => przycisk("Punkty EKO").click());
    expect(createFeatureFlagAction).toHaveBeenLastCalledWith("modul.eco", "Punkty EKO", true);
  });

  it("założona flaga bety jest „znana” (bez ostrzeżenia „nie steruje niczym”)", () => {
    const row = { id: "f1", key: "beta.zglos-uwage", name: "Przycisk „Zgłoś uwagę” (beta)", enabledDefault: false, rolloutPercent: 0 };
    act(() => root.render(<FeatureFlags rows={[row as never]} />));
    expect(k.textContent).not.toContain("nie steruje niczym");
    expect(k.textContent).not.toContain("+ flaga: Przycisk „Zgłoś uwagę”");
  });
});
