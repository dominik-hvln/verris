/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Pomoc, placeTip } from "./pomoc";
import { POMOC } from "@/lib/pomoc";
import { AKCJE_WEZLA } from "@/lib/akcje/wezel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("Pomoc „?”", () => {
  let root: Root;
  let el: HTMLElement;
  const przycisk = () => el.querySelector<HTMLButtonElement>('button[aria-label="Pomoc: Onboard LIVE"]')!;
  const dymek = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

  beforeEach(async () => {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => root.render(<Pomoc id="onboard-live" />));
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  it("zamknięty: przycisk z aria-label i aria-expanded=false, bez dymka", () => {
    expect(przycisk().type).toBe("button");
    expect(przycisk().getAttribute("aria-expanded")).toBe("false");
    expect(dymek()).toBeNull();
  });

  it("klik otwiera dymek ze słownika, fokus w dymku; poza AdminShell i bez href — bez odnośników", async () => {
    await act(async () => przycisk().click());
    const d = dymek()!;
    expect(d.getAttribute("aria-label")).toBe("Onboard LIVE");
    expect(d.textContent).toContain(POMOC["onboard-live"].opis);
    expect(d.textContent).toContain("Kiedy:");
    expect(przycisk().getAttribute("aria-expanded")).toBe("true");
    expect(przycisk().getAttribute("aria-controls")).toBe(d.id);
    expect(document.activeElement).toBe(d);
    // „Zapytaj asystenta” i „Przejdź do funkcji” — components/asystent.spec.tsx.
    expect(d.querySelector("a")).toBeNull();
    expect(d.textContent).not.toContain("Zapytaj asystenta");
  });

  it("Esc zamyka i wraca fokusem na „?”", async () => {
    await act(async () => przycisk().click());
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(dymek()).toBeNull();
    expect(document.activeElement).toBe(przycisk());
  });

  it("klik poza dymkiem zamyka; ponowny klik w „?” też", async () => {
    await act(async () => przycisk().click());
    await act(async () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(dymek()).toBeNull();
    await act(async () => przycisk().click());
    await act(async () => przycisk().click());
    expect(dymek()).toBeNull();
  });
});

describe("placeTip", () => {
  it("nad elementem, a przy górnej krawędzi — pod nim; w granicach ekranu", () => {
    expect(placeTip({ x: 200, y: 300, bottom: 320 }, { w: 100, h: 50 }, { w: 1000, h: 800 })).toEqual({ left: 150, top: 242 });
    expect(placeTip({ x: 200, y: 20, bottom: 40 }, { w: 100, h: 50 }, { w: 1000, h: 800 })).toEqual({ left: 150, top: 48 });
    expect(placeTip({ x: 5, y: 300, bottom: 320 }, { w: 100, h: 50 }, { w: 1000, h: 800 }).left).toBe(8);
  });
});

describe("Słownik pomocy", () => {
  it("każde działanie węzła z pomocId ma wpis; wpisy niepuste", () => {
    for (const a of AKCJE_WEZLA) if (a.pomocId) expect(POMOC[a.pomocId]).toBeDefined();
    for (const w of Object.values(POMOC)) {
      expect(w.tytul.length).toBeGreaterThan(0);
      expect(w.opis.length).toBeGreaterThan(0);
    }
  });

  it("bez adresów IP i haseł — słownik trafi do indeksu asystenta (decyzja 10.10)", () => {
    const tekst = JSON.stringify(POMOC);
    expect(tekst).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(tekst).not.toMatch(/password|token|secret/i);
  });
});
