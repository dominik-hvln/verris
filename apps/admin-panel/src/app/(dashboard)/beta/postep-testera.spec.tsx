/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LICZBA_KROKOW_BETA } from "@verris/contracts";

/** PB-26 — panel admina → Testy (beta): postęp testera, rozwijane szczegóły i odświeżanie na żywo. */
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock("./actions", () => ({}));

import { ODSWIEZANIE_BETA_MS, OdswiezanieNaZywo, WierszTestera, szczegolyPostepu } from "./postep-testera";
import type { TesterRow } from "./actions";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const wiersz = (postep: TesterRow["postep"]): TesterRow => ({
  id: "i1", email: "a@b.pl", name: "Ala", code: "BETA-AAAAAA", wyslane: null, stan: "UZYTY", waznyDo: null,
  konto: { email: "a@b.pl", od: "2026-10-20T10:00:00.000Z" }, aktywneUslugi: 1, zgloszenia: 0, zgloszeniaOtwarte: 0, postep,
});

describe("postęp testera w panelu admina", () => {
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => {
    jest.useFakeTimers();
    mockRefresh.mockReset();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    jest.useRealTimers();
  });

  it("szczegóły: każdy scenariusz z liczbą kroków i uwagą testera", () => {
    const s = szczegolyPostepu({ zrobione: 2, wszystkie: LICZBA_KROKOW_BETA, zaktualizowano: null, kroki: { "s01.k1": "x", "s01.k2": "x" }, uwagi: { s05: "Mail w spamie" } });
    expect(s[0]).toMatchObject({ id: "s01", zrobione: 2, uwaga: null });
    expect(s.find((x) => x.id === "s05")?.uwaga).toBe("Mail w spamie");
  });

  it("wiersz: 2/N, klik rozwija szczegóły z uwagą; bez użytego kodu — kreska", async () => {
    const p = { zrobione: 2, wszystkie: LICZBA_KROKOW_BETA, zaktualizowano: "2026-10-20T10:00:00.000Z", kroki: { "s01.k1": "x", "s01.k2": "x" }, uwagi: { s05: "Mail w spamie" } };
    await act(async () => root.render(<table><tbody><WierszTestera r={wiersz(p)} /></tbody></table>));
    expect(el.textContent).toContain(`2/${LICZBA_KROKOW_BETA}`);
    expect(el.querySelector("[data-szczegoly-testera]")).toBeNull();
    await act(async () => el.querySelector<HTMLButtonElement>("[data-postep-testera]")!.click());
    expect(el.querySelector("[data-szczegoly-testera]")?.textContent).toContain("Mail w spamie");

    await act(async () => root.render(<table><tbody><WierszTestera r={wiersz(null)} /></tbody></table>));
    expect(el.querySelector("[data-postep-testera]")).toBeNull();
  });

  it("odświeżanie na żywo: co 15 s, tylko gdy karta jest widoczna", async () => {
    await act(async () => root.render(<OdswiezanieNaZywo />));
    await act(async () => { jest.advanceTimersByTime(ODSWIEZANIE_BETA_MS); });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => { jest.advanceTimersByTime(ODSWIEZANIE_BETA_MS); });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
});
