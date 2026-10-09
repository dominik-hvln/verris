/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let sciezka = "/nodes/3f2a9c1e-0000-4000-8000-000000000001";
jest.mock("next/navigation", () => ({ usePathname: () => sciezka }));
const mockZapytaj = jest.fn<Promise<{ available: boolean; answer: string; sources: [] }>, [unknown]>(async () => ({
  available: true,
  answer: "Otwórz zakładkę Aktualizacje.",
  sources: [],
}));
jest.mock("./asystent-actions", () => ({ zapytajAsystenta: (input: unknown) => mockZapytaj(input) }));

import { AsystentPracownika, kontekstZeSciezki, pytanieOFunkcje } from "./asystent";
import { Pomoc } from "./pomoc";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("kontekstZeSciezki", () => {
  it("karta obiektu → typ i ID; podstrona bez cyfry nie jest kartą", () => {
    expect(kontekstZeSciezki("/nodes/3f2a9c1e-0000")).toEqual({ strona: "/nodes/3f2a9c1e-0000", obiektTyp: "wezel", obiektId: "3f2a9c1e-0000" });
    expect(kontekstZeSciezki("/customers/u1/rozliczenia")).toEqual({ strona: "/customers/u1/rozliczenia", obiektTyp: "klient", obiektId: "u1" });
    expect(kontekstZeSciezki("/nodes/wizard")).toEqual({ strona: "/nodes/wizard" });
    expect(kontekstZeSciezki("/invoices/reczna")).toEqual({ strona: "/invoices/reczna" });
    expect(kontekstZeSciezki("/")).toEqual({ strona: "/" });
  });

  it("ścieżka w granicach walidacji API: bez spacji i znaków spoza listy, do 200 znaków", () => {
    expect(kontekstZeSciezki("/nodes/a b?x=1").strona).toBe("/nodes/abx1");
    expect(kontekstZeSciezki(`/${"a".repeat(300)}`).strona).toHaveLength(200);
  });
});

describe("Asystent pracowników w AdminShell", () => {
  let root: Root;
  let el: HTMLElement;
  const render = (dostepny: boolean) =>
    act(async () =>
      root.render(
        <AsystentPracownika dostepny={dostepny}>
          <Pomoc id="onboard-live" href="?sekcja=aktualizacje#onboard-live" />
        </AsystentPracownika>,
      ),
    );
  const dymek = () => document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Onboard LIVE"]');
  const okno = () => document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Asystent"]');

  beforeEach(() => {
    sciezka = "/nodes/3f2a9c1e-0000-4000-8000-000000000001";
    mockZapytaj.mockClear();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  it("„Zapytaj asystenta” pod „?” otwiera okno i od razu pyta z kontekstem strony, funkcji i węzła", async () => {
    await render(true);
    expect(okno()!.hidden).toBe(true);
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="Pomoc: Onboard LIVE"]')!.click());
    const zapytaj = [...dymek()!.querySelectorAll("button")].find((b) => b.textContent?.includes("Zapytaj asystenta"))!;
    expect(dymek()!.textContent).not.toContain("Przejdź do funkcji");
    await act(async () => zapytaj.click());

    expect(dymek()).toBeNull();
    expect(okno()!.hidden).toBe(false);
    expect(mockZapytaj).toHaveBeenCalledTimes(1);
    expect(mockZapytaj.mock.calls[0][0]).toEqual({
      question: pytanieOFunkcje("onboard-live"),
      history: [],
      kontekst: {
        strona: "/nodes/3f2a9c1e-0000-4000-8000-000000000001",
        obiektTyp: "wezel",
        obiektId: "3f2a9c1e-0000-4000-8000-000000000001",
        funkcja: "onboard-live",
      },
    });
    expect(okno()!.textContent).toContain("Otwórz zakładkę Aktualizacje.");
  });

  it("zamknięcie zostawia rozmowę; pływający przycisk otwiera ją z powrotem", async () => {
    await render(true);
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="Pomoc: Onboard LIVE"]')!.click());
    await act(async () => [...dymek()!.querySelectorAll("button")].find((b) => b.textContent?.includes("Zapytaj"))!.click());
    await act(async () => document.body.querySelector<HTMLButtonElement>('button[aria-label="Zamknij asystenta"]')!.click());
    expect(okno()!.hidden).toBe(true);
    await act(async () => document.body.querySelector<HTMLButtonElement>('button[aria-label="Otwórz asystenta"]')!.click());
    expect(okno()!.hidden).toBe(false);
    expect(okno()!.textContent).toContain(pytanieOFunkcje("onboard-live"));
    expect(mockZapytaj).toHaveBeenCalledTimes(1);
  });

  it("AI nieskonfigurowane: bez asystenta, pod „?” „Przejdź do funkcji”", async () => {
    await render(false);
    expect(okno()).toBeNull();
    expect(document.body.querySelector('button[aria-label="Otwórz asystenta"]')).toBeNull();
    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="Pomoc: Onboard LIVE"]')!.click());
    expect(dymek()!.textContent).not.toContain("Zapytaj asystenta");
    expect(dymek()!.querySelector('a[href="?sekcja=aktualizacje#onboard-live"]')?.textContent).toContain("Przejdź do funkcji");
  });
});
