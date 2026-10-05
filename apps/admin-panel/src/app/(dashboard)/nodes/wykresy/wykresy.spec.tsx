/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Wykres, najblizszy } from "@/components/wykres";

jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));

import { adminApi } from "@/lib/api";
import WykresyStrona from "./page";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const OD = "2026-10-05T10:00:00.000Z";
const DO = "2026-10-05T12:00:00.000Z";
const PUNKTY = [
  { t: "2026-10-05T10:00:00.000Z", v: 20 },
  { t: "2026-10-05T11:00:00.000Z", v: 55.5 },
  { t: "2026-10-05T12:00:00.000Z", v: 90 },
];

describe("Wykres — dymek", () => {
  let root: Root;
  let kontener: HTMLElement;
  beforeEach(() => {
    kontener = document.createElement("div");
    document.body.appendChild(kontener);
    root = createRoot(kontener);
    act(() => root.render(<Wykres punkty={PUNKTY} od={OD} do={DO} etykieta="CPU fsn-01, 24 h" />));
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });
  const svg = () => kontener.querySelector("svg")!;
  const dymek = () => kontener.querySelector('[role="tooltip"]')?.textContent ?? null;

  it("ruch kursora pokazuje wartość i godzinę punktu pod kursorem, wyjście chowa", () => {
    expect(dymek()).toBeNull();
    svg().getBoundingClientRect = () => ({ left: 100, width: 320, top: 0, right: 420, bottom: 48, height: 48, x: 100, y: 0, toJSON: () => ({}) });
    act(() => svg().dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 100 + 170 })));
    expect(dymek()).toBe("55,5% · 13:00");
    act(() => svg().dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 100 + 10 })));
    expect(dymek()).toBe("20% · 12:00");
    act(() => svg().dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body })));
    expect(dymek()).toBeNull();
  });

  it("klawiatura: fokus pokazuje ostatni punkt, strzałki i Home przesuwają, czytnik dostaje wartość", () => {
    act(() => svg().focus());
    expect(dymek()).toBe("90% · 14:00");
    act(() => svg().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(dymek()).toBe("55,5% · 13:00");
    expect(svg().getAttribute("aria-valuetext")).toBe("55,5% · 13:00");
    act(() => svg().dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(dymek()).toBe("20% · 12:00");
    act(() => svg().blur());
    expect(dymek()).toBeNull();
  });

  it("najbliższy punkt i pusta seria", () => {
    expect(najblizszy([0, 80, 160], 119)).toBe(1);
    expect(najblizszy([0, 80, 160], 121)).toBe(2);
    expect(renderToStaticMarkup(<Wykres punkty={[]} od={OD} do={DO} etykieta="x" />)).toContain("brak próbek");
  });
});

describe("Strona „Wykresy węzłów”", () => {
  const wezel = (id: string, stan: string, z: Record<string, unknown> = {}) => ({
    id,
    name: id,
    region: "DE-FSN",
    status: "ACTIVE",
    stan,
    accounts: 3,
    pozaPula: null,
    cpuNow: 40,
    ramNow: 50,
    diskPct: 60,
    lastSignalAt: new Date().toISOString(),
    lastOffsiteBackupAt: null,
    cpu: PUNKTY,
    ram: PUNKTY,
    ...z,
  });

  it("filtr stanu z liczbami, lokalizacja bez dostawcy, zakres i sort idą do API", async () => {
    (adminApi as jest.Mock).mockResolvedValue({
      zakres: "7d",
      od: OD,
      do: DO,
      kpi: { wszystkie: 3, aktywne: 3, pozaPula: 1, cpuSrednie: 31, ramSrednie: 44, cpu: PUNKTY, ram: PUNKTY, pojemnosc: { wymiar: "dysk", proc: 58 } },
      wezly: [wezel("nbg-03", "krytyczny", { region: "DE-NBG", pozaPula: "poza pulą — wstrzymany" }), wezel("fsn-02", "ostrzezenie"), wezel("hel-01", "norma", { region: "FI-HEL" })],
    });
    const html = renderToStaticMarkup(await WykresyStrona({ searchParams: Promise.resolve({ zakres: "7d", stan: "krytyczny", sort: "cpu" }) }));
    const tekst = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(adminApi).toHaveBeenCalledWith("/admin/servers/wykresy?zakres=7d&sort=cpu");
    expect(tekst).toContain("Wszystkie 3");
    expect(tekst).toContain("Krytyczne 1");
    expect(tekst).toContain("Średnie CPU · 7 dni 31%");
    expect(tekst).toContain("3 z 3");
    expect(tekst).toContain("58%");
    expect(html).toContain('href="/nodes/nbg-03"');
    expect(html).not.toContain('href="/nodes/fsn-02"');
    expect(tekst).toContain("DE · Norymberga");
    expect(tekst).toContain("poza pulą — wstrzymany");
    expect(tekst).not.toContain("Hetzner");
    expect(tekst).toContain("3 konta");
    // linki zakresu zachowują filtr i sort
    expect(html).toContain('href="/nodes/wykresy?stan=krytyczny&amp;sort=cpu"');
    // każdy wykres to suwak z opisem dla czytnika
    expect(html.match(/role="slider"/g)).toHaveLength(4);
  });

  it("API niedostępne — komunikat zamiast pustej strony", async () => {
    (adminApi as jest.Mock).mockRejectedValue(new Error("HTTP 502"));
    const html = renderToStaticMarkup(await WykresyStrona({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Nie udało się pobrać wykresów: HTTP 502");
  });
});
