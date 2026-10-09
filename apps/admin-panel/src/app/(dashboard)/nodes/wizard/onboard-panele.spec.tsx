/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("./onboard-actions", () => ({
  pobierzStanOnboardu: jest.fn().mockResolvedValue({ ok: true, data: { zweryfikowany: null, raport: null, zadanie: null, trwa: false } }),
  pobierzOffsite: jest.fn().mockResolvedValue({ ok: true, data: { skonfigurowany: true, host: "h", port: 23, user: "u", sciezka: "v", retencjaDni: 30, zmienionoAt: null } }),
  uruchomOnboard: jest.fn().mockResolvedValue({ ok: true, data: {} }),
  zapiszOffsite: jest.fn(),
}));

import { uruchomOnboard } from "./onboard-actions";
import { OnboardLivePanel } from "./onboard-panele";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const przycisk = (tekst: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(tekst))!;

describe("Onboard LIVE — uruchomienie z potwierdzeniem", () => {
  let root: Root;
  let el: HTMLElement;
  beforeEach(async () => {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => root.render(<OnboardLivePanel serverId="w1" />));
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  it("klik pokazuje okno; Anuluj nie uruchamia, Uruchom uruchamia", async () => {
    await act(async () => przycisk("Uruchom Onboard LIVE").click());
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Uruchomić Onboard LIVE?");
    await act(async () => przycisk("Anuluj").click());
    expect(uruchomOnboard).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => przycisk("Uruchom Onboard LIVE").click());
    await act(async () => document.querySelector<HTMLFormElement>('[role="alertdialog"]')!.requestSubmit());
    expect(uruchomOnboard).toHaveBeenCalledWith("w1");
  });
});
