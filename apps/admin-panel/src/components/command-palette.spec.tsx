/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const WEZEL = { type: "node", id: "n1", title: "t1", subtitle: "Węzeł · t1.verris.net", href: "/nodes/n1", status: "ACTIVE" };
const KLIENT = { type: "user", id: "u1", title: "jan@firma.pl", subtitle: "Klient · Jan", href: "/customers/u1" };
const FAKTURA = { type: "invoice", id: "f1", title: "VFV/2026/10/0001", subtitle: "Faktura", href: "/invoices/f1", status: "PAID", ksefStatus: "REJECTED", userId: "u1" };
const NIEOPLACONA = { ...FAKTURA, id: "f2", title: "VFV/2026/10/0002", href: "/invoices/f2", status: "OPEN", ksefStatus: "NOT_APPLICABLE" };
const odpowiedzi: Record<string, unknown> = {
  VFO: { results: [NIEOPLACONA], pominiete: [] },
  t1: { results: [WEZEL], pominiete: [] },
  jan: { results: [KLIENT], pominiete: [] },
  VFV: { results: [FAKTURA], pominiete: [] },
  awaria: { results: [], pominiete: [], blad: true },
};
const mockSzukaj = jest.fn(async (q: string) => odpowiedzi[q] ?? { results: [], pominiete: [] });
jest.mock("./command-palette-actions", () => ({ globalSearchAction: (q: string) => mockSzukaj(q) }));

import { CommandPalette } from "./command-palette";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("Cmd+K — tryb obiekt → działanie (prowadzi do karty, nie wykonuje)", () => {
  let root: Root;
  let el: HTMLElement;
  const czekaj = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)));
  const pole = () => document.querySelector<HTMLInputElement>('input[aria-label="Szukaj"]')!;
  const okno = () => document.querySelector('[role="dialog"][aria-label="Wyszukiwarka"]')!.textContent ?? "";
  const klawisz = (key: string) => act(async () => pole().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
  const wpisz = async (tekst: string) => {
    const ustaw = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      ustaw.call(pole(), tekst);
      pole().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await czekaj(300);
  };
  const otworz = async (dostep = { isAdmin: true, permissions: [] as string[] }) => {
    await act(async () => root.render(<CommandPalette dostep={dostep} />));
    await act(async () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })));
    await czekaj(40);
  };
  beforeEach(() => {
    push.mockReset();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  it("węzeł + Tab → jego działania; wybór prowadzi do zakładki z kotwicą; Backspace wraca", async () => {
    await otworz();
    await wpisz("t1");
    expect(okno()).toContain("Tab · działania");
    await klawisz("Tab");
    expect(okno()).toContain("Węzeł t1");
    expect(okno()).toContain("Onboard LIVE");
    expect(okno()).toContain("Wycofanie węzła");
    await wpisz("onb");
    expect(okno()).not.toContain("Wycofanie węzła");
    await klawisz("Enter");
    expect(push).toHaveBeenCalledWith("/nodes/n1?sekcja=aktualizacje#onboard-live");
  });

  it("Backspace w pustym polu wychodzi z trybu węzła", async () => {
    await otworz();
    await wpisz("t1");
    await klawisz("ArrowRight");
    expect(okno()).toContain("Węzeł t1");
    await klawisz("Backspace");
    expect(okno()).not.toContain("Węzeł t1");
  });

  it("„onboard t1” → „Onboard LIVE · t1” na górze listy", async () => {
    await otworz();
    await wpisz("onboard t1");
    expect(mockSzukaj).toHaveBeenCalledWith("t1");
    const pierwszy = document.querySelector('[role="dialog"] button:not([aria-label])')!;
    expect(pierwszy.textContent).toContain("Onboard LIVE · t1");
    await klawisz("Enter");
    expect(push).toHaveBeenCalledWith("/nodes/n1?sekcja=aktualizacje#onboard-live");
  });

  it("bez NODES_MANAGE — działanie wyszarzone z powodem, Enter nic nie robi", async () => {
    await otworz({ isAdmin: false, permissions: ["NODES_VIEW"] });
    await wpisz("onboard t1");
    const b = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-disabled="true"]')].find((x) => x.textContent?.includes("Onboard LIVE · t1"));
    expect(b?.title).toBe("Wymaga NODES_MANAGE");
    await klawisz("Enter");
    expect(push).not.toHaveBeenCalled();
  });

  it("Tab na wyniku innym niż węzeł nie zmienia trybu", async () => {
    await otworz();
    await wpisz("flotę");
    expect(okno()).toContain("Aktualizuj flotę");
    await klawisz("Tab");
    expect(okno()).not.toContain("Węzeł ");
    await klawisz("Enter");
    expect(push).toHaveBeenCalledWith("/nodes/stack#aktualizuj-flote");
  });

  it("klient + Tab → jego działania (reseller); Enter prowadzi do sekcji na karcie", async () => {
    await otworz();
    await wpisz("jan");
    expect(okno()).toContain("Tab · działania");
    await klawisz("Tab");
    expect(okno()).toContain("Klient jan@firma.pl");
    expect(okno()).toContain("Zdejmij blokadę wysyłki poczty");
    await wpisz("narzut");
    await klawisz("Enter");
    expect(push).toHaveBeenCalledWith("/customers/u1?sekcja=rozliczenia#reseller");
  });

  it("faktura + → : ponowienie KSeF dla admina prowadzi do sekcji KSeF na stronie faktury", async () => {
    await otworz();
    await wpisz("VFV");
    await klawisz("ArrowRight");
    expect(okno()).toContain("Faktura VFV/2026/10/0001");
    expect(okno()).toContain("Wystaw korektę");
    expect(okno()).not.toContain("Anuluj dokument");
    await wpisz("ksef");
    await klawisz("Enter");
    expect(push).toHaveBeenCalledWith("/invoices/f1#ksef");
  });

  // Przegląd 10.10: działanie z mechanizmem wniosków było w palecie martwe (wyszarzone, Enter nic nie robił),
  // choć decyzja właściciela: wyszarzone z „Wyślij wniosek” tam, gdzie wnioski istnieją.
  it("bez uprawnienia, ale z wnioskiem: Enter prowadzi do formularza z „Wyślij wniosek”", async () => {
    await otworz({ isAdmin: false, permissions: ["CUSTOMERS_VIEW"] });
    await wpisz("jan");
    await klawisz("Tab");
    await wpisz("wewnętrzne");
    expect(okno()).toContain("Wymaga CUSTOMERS_INTERNAL_FLAG · wyślij wniosek");
    await klawisz("Enter");
    expect(push).toHaveBeenCalledWith("/customers/u1?sekcja=dostepy#blokada");
  });

  it("anulowanie faktury: wniosek tylko z BILLING_VIEW i CUSTOMERS_VIEW (strona faktury + złożenie wniosku)", async () => {
    await otworz({ isAdmin: false, permissions: ["BILLING_VIEW"] });
    await wpisz("VFO");
    await klawisz("Tab");
    await wpisz("anuluj");
    expect(okno()).not.toContain("wyślij wniosek");
    await klawisz("Enter");
    expect(push).not.toHaveBeenCalled();
    act(() => root.unmount());
    root = createRoot(el);
    await otworz({ isAdmin: false, permissions: ["BILLING_VIEW", "CUSTOMERS_VIEW"] });
    await wpisz("VFO");
    await klawisz("Tab");
    await wpisz("anuluj");
    await klawisz("Enter");
    expect(push).toHaveBeenCalledWith("/invoices/f2#anuluj");
  });

  it("błąd wyszukiwarki API: „Nie udało się wczytać” z ponowieniem zamiast „Brak wyników” (fala 1B)", async () => {
    await otworz();
    await wpisz("awaria");
    expect(okno()).toContain("Nie udało się wczytać wyników wyszukiwania.");
    expect(okno()).not.toContain("Brak wyników.");
    mockSzukaj.mockClear();
    const ponow = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === "Spróbuj ponownie")!;
    await act(async () => ponow.click());
    await czekaj(300);
    expect(mockSzukaj).toHaveBeenCalledWith("awaria");
  });
});
