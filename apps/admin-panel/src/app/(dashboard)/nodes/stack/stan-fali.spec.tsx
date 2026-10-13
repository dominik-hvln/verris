/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** PB-32 — status fali w panelu zgodny z logiem: przebieg po węzłach, wynik z logu, auto-odświeżanie gdy trwa. */
const mockStan = jest.fn();
jest.mock("./actions", () => ({ pobierzStanFali: () => mockStan() }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { StanFaliPanel } from "./stan-fali";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  mockStan.mockReset();
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => act(() => root.unmount()));

const wezel = (o: Record<string, unknown>) => ({
  taskId: `t${o.nr}`, serverId: `s${o.nr}`, blad: null, zlecono: "2026-10-13T02:00:00Z", start: null, koniec: null, ...o,
});

it("fala zatrzymana: kanarek z błędem z logu, pozostałe węzły", async () => {
  mockStan.mockResolvedValue({
    ok: true,
    data: {
      id: "f1", wyrownaj: false, razem: 3, stan: "zatrzymana", pozostale: 2, wymagaRestartu: [], rozpoczeta: "2026-10-13T02:00:00Z",
      wezly: [wezel({ nr: 1, nazwa: "t1", status: "FAILED", wynik: "failed", blad: "VERRIS_UPDATE_RESULT=failed errors=2" })],
    },
  });
  await act(async () => root.render(<StanFaliPanel />));
  const t = el.textContent ?? "";
  expect(t).toContain("Zatrzymana na błędzie");
  expect(t).toContain("pozostało węzłów: 2 z 3");
  expect(t).toContain("1 (kanarek)");
  expect(t).toContain("błąd aktualizacji");
  expect(el.querySelector('a[href="/nodes/s1"]')).not.toBeNull();
});

it("fala zakończona z węzłem do restartu; brak fali — informacja", async () => {
  mockStan.mockResolvedValueOnce({
    ok: true,
    data: {
      id: "f2", wyrownaj: true, razem: 1, stan: "zakonczona", pozostale: 0, wymagaRestartu: ["t2"], rozpoczeta: "2026-10-13T02:00:00Z",
      wezly: [wezel({ nr: 1, nazwa: "t2", status: "COMPLETED", wynik: "needs-reboot" })],
    },
  });
  await act(async () => root.render(<StanFaliPanel />));
  expect(el.textContent).toContain("Wymaga restartu: t2");
  expect(el.textContent).toContain("wyrównanie do manifestu");
  mockStan.mockResolvedValueOnce({ ok: true, data: null });
  await act(async () => void [...el.querySelectorAll("button")].find((b) => b.textContent === "Odśwież")!.click());
  expect(el.textContent).toContain("Nie było jeszcze fali aktualizacji");
});

it("fala trwa: odświeża się sama co 15 s", async () => {
  jest.useFakeTimers();
  mockStan.mockResolvedValue({
    ok: true,
    data: { id: "f3", wyrownaj: false, razem: 2, stan: "trwa", pozostale: 2, wymagaRestartu: [], rozpoczeta: "2026-10-13T02:00:00Z", wezly: [wezel({ nr: 1, nazwa: "t1", status: "RUNNING", wynik: null })] },
  });
  await act(async () => root.render(<StanFaliPanel />));
  expect(mockStan).toHaveBeenCalledTimes(1);
  await act(async () => void jest.advanceTimersByTime(15_000));
  expect(mockStan).toHaveBeenCalledTimes(2);
  jest.useRealTimers();
});
