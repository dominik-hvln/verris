/**
 * @jest-environment jsdom
 */
/**
 * 6.11 — przełącznik asystenta na verris.pl w Admin → Ustawienia → Asystent AI. Wcześniej ustawienie `ai.asystentWww`
 * dało się zmienić tylko przez API, a dokumenty i www odsyłały do tego przełącznika. Na starym kodzie test pada
 * (brak komponentu, akcji i sekcji na stronie).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/settings/ai" }));

import { revalidatePath } from "next/cache";
import { adminApi } from "@/lib/api";
import { AsystentWwwForm } from "./asystent-www-form";
import type { AsystentWww, UstawieniaAi } from "./actions";
import Strona from "./page";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const MODELE: UstawieniaAi["znaneModele"] = [
  { dostawca: "openai", model: "gpt-6-luna", nazwa: "GPT-6 Luna", cenaWej: 1, cenaWyj: 4 },
  { dostawca: "anthropic", model: "claude-sonnet-5-5", nazwa: "Claude Sonnet 5.5", cenaWej: 2, cenaWyj: 10 },
  { dostawca: "anthropic", model: "claude-haiku-4-5-20251001", nazwa: "Claude Haiku 4.5", cenaWej: 1, cenaWyj: 5 },
];

const dane = (z: Partial<AsystentWww> = {}, konf: Partial<AsystentWww["konfiguracja"]> = {}): AsystentWww => ({
  konfiguracja: {
    wlaczony: false,
    model: "claude-sonnet-5-5",
    modelStraznika: "claude-haiku-4-5-20251001",
    limitDziennyUsd: 10,
    limitMiesiecznyUsd: 150,
    ...konf,
  },
  kluczAnthropic: true,
  dzisUsd: 1.234,
  miesiacUsd: 42.5,
  ...z,
});

const html = (d: AsystentWww) => renderToStaticMarkup(<AsystentWwwForm initial={{ ok: true, dane: d }} znaneModele={MODELE} />);

describe("AsystentWwwForm — render", () => {
  it("przełącznik z opisem, modele tylko Anthropic, limity i koszt dziś / w miesiącu", () => {
    const h = html(dane());
    expect(h).toContain("Asystent na verris.pl włączony");
    expect(h).toContain("do ok. minuty");
    expect(h).toMatch(/type=.checkbox./); // Checkbox z panelu (pod spodem prawdziwe pole, przezroczyste)
    expect(h).not.toMatch(/<select/);
    expect(h).toContain("Claude Sonnet 5.5");
    expect(h).toContain("Claude Haiku 4.5");
    expect(h).not.toContain("GPT-6 Luna");
    expect(h).toContain("Limit dzienny (USD, 0 = bez limitu)");
    expect(h).toContain("Limit miesięczny (USD, 0 = bez limitu)");
    expect(h).toMatch(/value="10"/);
    expect(h).toMatch(/value="150"/);
    expect(h).toContain("$1.23");
    expect(h).toContain("$42.50");
    expect(h).not.toContain('data-ostrzezenie="brak-klucza"');
  });

  it("bez klucza Anthropic: ostrzeżenie, że asystent się nie pokaże", () => {
    const h = html(dane({ kluczAnthropic: false }, { wlaczony: true }));
    expect(h).toContain('data-ostrzezenie="brak-klucza"');
    expect(h).toContain("asystent nie pokaże się na verris.pl");
  });

  it("wyczerpany limit dzienny: informacja, że asystent jest ukryty", () => {
    expect(html(dane({ dzisUsd: 10 }))).toContain("Limit dzienny wyczerpany");
    expect(html(dane({ dzisUsd: 10 }, { limitDziennyUsd: 0 }))).not.toContain("wyczerpany");
  });

  it("błąd odczytu: sekcja z komunikatem zamiast formularza", () => {
    const h = renderToStaticMarkup(<AsystentWwwForm initial={{ ok: false, error: "Brak uprawnień." }} znaneModele={MODELE} />);
    expect(h).toContain('data-sekcja="asystent-www"');
    expect(h).toContain("Brak uprawnień.");
    expect(h).not.toContain("Zapisz asystenta");
  });
});

describe("AsystentWwwForm — zapis", () => {
  let root: Root;
  let k: HTMLElement;
  beforeEach(() => {
    (adminApi as jest.Mock).mockReset();
    (revalidatePath as jest.Mock).mockReset();
    k = document.createElement("div");
    document.body.appendChild(k);
    root = createRoot(k);
  });
  afterEach(() => {
    act(() => root.unmount());
    k.remove();
  });

  function wpisz(pole: HTMLInputElement, v: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pole, v);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("włączenie i zmiana limitów → PATCH /admin/ai/asystent-www z dokładnie polami DTO, odświeżenie strony", async () => {
    (adminApi as jest.Mock).mockImplementation(async (_s: string, o: { body: AsystentWww["konfiguracja"] }) => dane({}, o.body));
    act(() => root.render(<AsystentWwwForm initial={{ ok: true, dane: dane() }} znaneModele={MODELE} />));

    const przelacznik = k.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    act(() => przelacznik.click());
    expect(przelacznik.checked).toBe(true);
    const [dzien, miesiac] = Array.from(k.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]'));
    act(() => wpisz(dzien, "5,5"));
    act(() => wpisz(miesiac, "0"));

    const zapisz = Array.from(k.querySelectorAll("button")).find((b) => b.textContent?.includes("Zapisz asystenta"))!;
    await act(async () => zapisz.click());

    expect(adminApi).toHaveBeenCalledWith("/admin/ai/asystent-www", {
      method: "PATCH",
      body: {
        wlaczony: true,
        model: "claude-sonnet-5-5",
        modelStraznika: "claude-haiku-4-5-20251001",
        limitDziennyUsd: 5.5,
        limitMiesiecznyUsd: 0,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/ai");
    expect(k.textContent).toContain("Zapisano — na verris.pl do ok. minuty.");
  });

  it("błąd zapisu: komunikat z API, bez „Zapisano”", async () => {
    (adminApi as jest.Mock).mockRejectedValue(new Error("Limit poza zakresem."));
    act(() => root.render(<AsystentWwwForm initial={{ ok: true, dane: dane() }} znaneModele={MODELE} />));
    const zapisz = Array.from(k.querySelectorAll("button")).find((b) => b.textContent?.includes("Zapisz asystenta"))!;
    await act(async () => zapisz.click());
    expect(k.textContent).toContain("Limit poza zakresem.");
    expect(k.textContent).not.toContain("Zapisano");
  });
});

describe("strona Ustawienia → Asystent AI", () => {
  const USTAWIENIA = {
    konfiguracja: {
      szybki: { dostawca: "openai", model: "gpt-6-luna" },
      analiza: { dostawca: "anthropic", model: "claude-sonnet-5-5" },
      limitKlientaUsd: 2,
      limitPlatformyUsd: 500,
      ceny: {},
      dlaWszystkichKlientow: false,
    },
    znaneModele: MODELE,
    klucze: { openai: true, anthropic: true },
    kontaTestowe: 0,
  };

  it("sekcja asystenta na verris.pl pod ustawieniami AI", async () => {
    (adminApi as jest.Mock).mockReset().mockImplementation(async (s: string) => {
      if (s === "/admin/ai/ustawienia") return USTAWIENIA;
      if (s === "/admin/ai/asystent-www") return dane();
      return null;
    });
    const h = renderToStaticMarkup(await Strona());
    expect(h).toContain("Poziomy i modele");
    expect(h).toContain('data-sekcja="asystent-www"');
    expect(h).toContain("Asystent na verris.pl włączony");
    expect(h.indexOf("Poziomy i modele")).toBeLessThan(h.indexOf('data-sekcja="asystent-www"'));
  });

  it("błąd odczytu asystenta www nie wywraca strony — reszta ustawień zostaje", async () => {
    (adminApi as jest.Mock).mockReset().mockImplementation(async (s: string) => {
      if (s === "/admin/ai/ustawienia") return USTAWIENIA;
      if (s === "/admin/ai/asystent-www") throw new Error("API niedostępne.");
      return null;
    });
    const h = renderToStaticMarkup(await Strona());
    expect(h).toContain("Poziomy i modele");
    expect(h).toContain('data-sekcja="asystent-www"');
    expect(h).toContain("API niedostępne.");
  });
});
