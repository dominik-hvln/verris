/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** Otwarta beta — panel admina → Testy (beta) → Zgłoszenia: decyzje i opisy wierszy. */
const mockZapros = jest.fn();
const mockOdrzuc = jest.fn();
const mockPotwierdz = jest.fn();
jest.mock("./actions", () => ({
  zaprosZgloszenieAction: (...a: unknown[]) => mockZapros(...a),
  odrzucZgloszenieAction: (...a: unknown[]) => mockOdrzuc(...a),
}));
jest.mock("@/components/potwierdz", () => ({ potwierdz: (...a: unknown[]) => mockPotwierdz(...a) }));

import { DecyzjaZgloszenia } from "./zgloszenia";
import { bezpiecznyLink, opisZakresu, zrodloZgloszenia } from "./zgloszenia-opisy";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const z = (nadpisz: Partial<Parameters<typeof DecyzjaZgloszenia>[0]["z"]> = {}) => ({
  id: "z1", imie: "Ala", email: "ala@firma.pl", status: "NOWE" as const, potwierdzone: "2026-11-20T10:00:00.000Z", ...nadpisz,
});

describe("zgłoszenia do bety w panelu admina", () => {
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => {
    [mockZapros, mockOdrzuc, mockPotwierdz].forEach((m) => m.mockReset());
    mockPotwierdz.mockResolvedValue(true);
    mockZapros.mockResolvedValue({ ok: true, code: "BETA-AAAAAA", mailWyslany: true });
    mockOdrzuc.mockResolvedValue({ ok: true, mailWyslany: true });
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  const przycisk = (tekst: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === tekst)!;

  it("opisy: zakres po polsku, źródło z UTM, link tylko http(s)", () => {
    expect(opisZakresu(["WORDPRESS", "STRONY_DLA_KLIENTOW"])).toBe("WordPress, Strony dla klientów");
    expect(zrodloZgloszenia({ zrodlo: { source: "facebook", campaign: "meta-leadgen-hosting-202611" } })).toBe("facebook / meta-leadgen-hosting-202611");
    expect(zrodloZgloszenia({ zrodlo: null })).toBe("–");
    // utm_content rozróżnia kreację i zestaw reklamy — bez niego nie porównamy kosztu zgłoszenia.
    expect(zrodloZgloszenia({ zrodlo: { source: "meta", campaign: "meta-leadgen-hosting-202611", content: "b-firmy" } })).toBe(
      "meta / meta-leadgen-hosting-202611 / b-firmy",
    );
    expect(bezpiecznyLink("javascript:void(0)")).toBeNull();
    expect(bezpiecznyLink("https://firma.pl")).toBe("https://firma.pl");
  });

  it("nowe: „Zaproś” po potwierdzeniu wysyła kod; „Odrzuć” domyślnie z uprzejmą wiadomością", async () => {
    await act(async () => root.render(<DecyzjaZgloszenia z={z()} />));
    await act(async () => przycisk("Zaproś").click());
    expect(mockZapros).toHaveBeenCalledWith("z1");
    expect(el.textContent).toContain("BETA-AAAAAA");
    await act(async () => przycisk("Odrzuć").click());
    expect(mockOdrzuc).toHaveBeenCalledWith("z1", true);
  });

  it("odznaczona wiadomość → odrzucenie bez maila; anulowane potwierdzenie → nic nie wychodzi", async () => {
    await act(async () => root.render(<DecyzjaZgloszenia z={z()} />));
    await act(async () => el.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
    await act(async () => przycisk("Odrzuć").click());
    expect(mockOdrzuc).toHaveBeenCalledWith("z1", false);
    mockPotwierdz.mockResolvedValue(false);
    await act(async () => przycisk("Zaproś").click());
    expect(mockZapros).not.toHaveBeenCalled();
  });

  it("niepotwierdzony adres: „Zaproś” nieaktywne, bez pola wiadomości; zaproszone i odrzucone – bez przycisków", async () => {
    await act(async () => root.render(<DecyzjaZgloszenia z={z({ status: "NIEPOTWIERDZONE", potwierdzone: null })} />));
    expect(przycisk("Zaproś").disabled).toBe(true);
    expect(el.querySelector("input[type=checkbox]")).toBeNull();
    await act(async () => root.render(<DecyzjaZgloszenia z={z({ status: "ZAPROSZONE" })} />));
    expect(el.querySelector("[data-decyzja-zgloszenia]")).toBeNull();
  });
});
