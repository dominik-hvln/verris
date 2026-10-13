/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** 13.10 — strażnik węzła na karcie węzła: zdarzenia z krokami, diagnoza na żądanie, wyłącznik restartu (admin). */
const mockPobierz = jest.fn();
const mockDiagnoza = jest.fn();
const mockUstaw = jest.fn();
const mockPotwierdz = jest.fn();
jest.mock("./straznik-actions", () => ({
  pobierzStraznika: (...a: unknown[]) => mockPobierz(...a),
  pobierzDiagnoze: (...a: unknown[]) => mockDiagnoza(...a),
  ustawRestartWezla: (...a: unknown[]) => mockUstaw(...a),
}));
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => mockPotwierdz(...a) }));

import { StraznikPanel } from "./straznik-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  jest.clearAllMocks();
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  mockPobierz.mockResolvedValue({
    ok: true,
    dane: {
      restartWezla: true,
      zdarzenia: [
        {
          id: "z1", rodzaj: "lve", nazwa: "izolacja kont (LVE) — strony PHP nie działają", stan: "naprawiono",
          objaw: "Procesy kont nie wchodzą do LVE: 3 błędów w logu LiteSpeed, 0 w jądrze.",
          kroki: [{ at: "x", krok: "1. restart LiteSpeed", wynik: "wykonany" }, { at: "y", krok: "sprawdzenie d3.hvln.pl", wynik: "HTTP 200 — OK" }],
          katalog: "/var/log/verris-straznik/zdarzenia/20261013-044100-lve",
          wykrytoAt: "2026-10-13T02:41:00Z", zakonczonoAt: "2026-10-13T02:42:00Z", updatedAt: "2026-10-13T02:42:00Z",
        },
      ],
    },
  });
});
afterEach(() => act(() => root.unmount()));

const przycisk = (t: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === t)!;

it("zdarzenie z krokami; diagnoza wczytywana po kliknięciu", async () => {
  mockDiagnoza.mockResolvedValue({ ok: true, dane: { diagnoza: "== LiteSpeed stderr\nenter LVE (1003)", katalog: null } });
  await act(async () => root.render(<StraznikPanel serverId="s1" isAdmin={false} />));
  const t = el.textContent ?? "";
  expect(t).toContain("naprawione");
  expect(t).toContain("1. restart LiteSpeed: wykonany");
  expect(t).toContain("sprawdzenie d3.hvln.pl: HTTP 200 — OK");
  expect(t).toContain("Restart węzła przez strażnika: włączony");
  expect(przycisk("Wyłącz")).toBeUndefined();
  await act(async () => void przycisk("Pokaż diagnozę").click());
  expect(mockDiagnoza).toHaveBeenCalledWith("s1", "z1");
  expect(el.textContent).toContain("enter LVE (1003)");
  expect(el.textContent).toContain("Pełna diagnoza na węźle: /var/log/verris-straznik/zdarzenia/20261013-044100-lve");
});

it("administrator wyłącza restart węzłów po potwierdzeniu", async () => {
  mockPotwierdz.mockResolvedValue(true);
  mockUstaw.mockResolvedValue({ ok: true, dane: { restartWezla: false } });
  await act(async () => root.render(<StraznikPanel serverId="s1" isAdmin />));
  await act(async () => void przycisk("Wyłącz").click());
  expect(mockPotwierdz).toHaveBeenCalledWith(expect.stringContaining("Wyłączyć restart węzłów"), expect.objectContaining({ niebezpieczne: true }));
  expect(mockUstaw).toHaveBeenCalledWith("s1", false);
  expect(el.textContent).toContain("Restart węzła przez strażnika: wyłączony");
});
