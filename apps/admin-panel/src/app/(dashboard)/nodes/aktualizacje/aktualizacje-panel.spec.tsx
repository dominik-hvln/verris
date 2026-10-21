/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** 21.10 — weryfikator aktualizacji: wyszukiwarka CVE, uczciwy wynik „brak na liście” i fala poprawek po potwierdzeniu. */
const mockPobierz = jest.fn();
const mockZainstaluj = jest.fn();
const mockPotwierdz = jest.fn();
jest.mock("./actions", () => ({
  pobierzAktualizacje: (...a: unknown[]) => mockPobierz(...a),
  zainstalujPoprawki: (...a: unknown[]) => mockZainstaluj(...a),
}));
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => mockPotwierdz(...a) }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { AktualizacjePanel } from "./aktualizacje-panel";
import type { PodsumowanieAktualizacji } from "./actions";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const START: PodsumowanieAktualizacji = {
  wezly: [
    { id: "w1", nazwa: "t1", status: "ACTIVE", dane: "swieze", sprawdzono: "2026-10-21T19:00:00Z", poprawek: 1, waznych: 1, bladDnf: null, custombuild: [], bladCustomBuild: null, altPhp: { "8.3": "8.3.11" } },
    { id: "w2", nazwa: "t2", status: "ACTIVE", dane: "stare", sprawdzono: null, poprawek: 0, waznych: 0, bladDnf: null, custombuild: [{ nazwa: "exim", z: "4.98", na: "4.98.1" }], bladCustomBuild: null, altPhp: {} },
  ],
  poprawki: [{ advisory: "CLSA-2026:1001", waga: "Important", cve: ["CVE-2026-109618"], pakiety: ["alt-php83-cli-8.3.12"], wezly: [{ id: "w1", nazwa: "t1" }] }],
  kafelki: { wezlowZWaznymi: 1, poprawek: 1, wezlowBezDanych: 1 },
  cve: null,
};

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  [mockPobierz, mockZainstaluj, mockPotwierdz].forEach((m) => m.mockReset());
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => act(() => root.unmount()));

const wpisz = async (wartosc: string) => {
  const pole = el.querySelector<HTMLInputElement>("[data-pole-cve]")!;
  const ustaw = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    ustaw.call(pole, wartosc);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => el.querySelector<HTMLButtonElement>("[data-sprawdz-cve]")!.click());
};

it("tabela poprawek, wersje alt-php, CustomBuild i węzeł bez świeżych danych", async () => {
  await act(async () => root.render(<AktualizacjePanel start={START} bezInstalacji={null} />));
  const t = el.textContent ?? "";
  expect(el.querySelector("[data-tabela-poprawek]")?.textContent).toContain("CLSA-2026:1001");
  expect(t).toContain("Ważna");
  expect(t).toContain("8.3: 8.3.11");
  expect(t).toContain("raport starszy niż doba");
  expect(el.querySelector("[data-custombuild-lista]")?.textContent).toContain("exim 4.98 → 4.98.1");
});

it("CVE: zły numer — komunikat bez zapytania; dobry — wynik per węzeł i instalacja tylko dla tych węzłów", async () => {
  await act(async () => root.render(<AktualizacjePanel start={START} bezInstalacji={null} />));
  await wpisz("12345");
  expect(mockPobierz).not.toHaveBeenCalled();
  expect(el.textContent).toContain("CVE-2026-12345");

  mockPobierz.mockResolvedValue({
    ok: true,
    data: { ...START, cve: { cve: "CVE-2026-109618", doZalatania: [{ id: "w1", nazwa: "t1", advisory: ["CLSA-2026:1001"], pakiety: ["alt-php83-cli"] }], bezPoprawkiNaLiscie: [], bezDanych: [{ id: "w2", nazwa: "t2" }], komunikat: "CVE-2026-109618: poprawka czeka na 1 z 2 węzłów." } },
  });
  await wpisz(" cve-2026-109618 ");
  expect(mockPobierz).toHaveBeenCalledWith("CVE-2026-109618");
  expect(el.querySelector("[data-wynik-cve]")?.textContent).toContain("poprawka czeka na 1 z 2");
  expect(el.querySelector("[data-wynik-cve]")?.textContent).toContain("Bez świeżych danych (nie wiadomo): t2");

  mockPotwierdz.mockResolvedValue(true);
  mockZainstaluj.mockResolvedValue({ ok: true, data: { queued: 1, skipped: 0, kanarek: "w1" } });
  await act(async () => el.querySelector<HTMLButtonElement>("[data-instaluj-cve]")!.click());
  expect(mockZainstaluj).toHaveBeenCalledWith({ cve: ["CVE-2026-109618"], serwery: ["w1"] });
  expect(el.textContent).toContain("Fala poprawek ruszyła");
});

it("instalacja floty: bez potwierdzenia nic się nie dzieje; z CustomBuild przekazuje opcję; bez uprawnienia przycisk wyłączony", async () => {
  await act(async () => root.render(<AktualizacjePanel start={START} bezInstalacji={null} />));
  mockPotwierdz.mockResolvedValue(false);
  await act(async () => el.querySelector<HTMLButtonElement>("[data-instaluj-wszystkie]")!.click());
  expect(mockZainstaluj).not.toHaveBeenCalled();

  await act(async () => el.querySelector<HTMLInputElement>("[data-custombuild]")!.click());
  mockPotwierdz.mockResolvedValue(true);
  mockZainstaluj.mockResolvedValue({ ok: false, error: "Aktualizacja floty już trwa — poczekaj na jej koniec." });
  await act(async () => el.querySelector<HTMLButtonElement>("[data-instaluj-wszystkie]")!.click());
  expect(mockZainstaluj).toHaveBeenCalledWith({ custombuild: true });
  expect(el.textContent).toContain("Aktualizacja floty już trwa");

  await act(async () => root.render(<AktualizacjePanel start={START} bezInstalacji="Wymaga NODES_MANAGE" />));
  expect(el.querySelector<HTMLButtonElement>("[data-instaluj-wszystkie]")!.disabled).toBe(true);
});
