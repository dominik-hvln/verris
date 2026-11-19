/**
 * @jest-environment jsdom
 */
/**
 * Paczka 130 — Admin → Kreator marki (/settings/kreator-marki). Konfiguracja modułu (włącznik, dostępność, konta
 * testowe, limity, Pakiet marki i druga marka z cenami brutto i netto, symbole AI, modele, rozmiar wgrania) i użycie
 * „brak danych” do fazy 2. Na starym kodzie test pada (brak strony, akcji i komponentu).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("@/components/potwierdz", () => ({ potwierdz: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/settings/kreator-marki" }));

import { revalidatePath } from "next/cache";
import { adminApi } from "@/lib/api";
import { potwierdz } from "@/components/potwierdz";
import { STRONY } from "@/lib/uprawnienia-stron";
import { KreatorMarkiForm } from "./kreator-marki-form";
import { bladPola, nettoZBrutto } from "./ceny";
import type { UstawieniaMarki } from "./actions";
import Strona from "./page";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const api = adminApi as jest.Mock;

const KONF: UstawieniaMarki["konfiguracja"] = {
  wlaczony: false,
  dostepnosc: "lista",
  kontaTestowe: ["ola@przyklad.pl"],
  wCenieHostingu: { marek: 1, seriiMies: 3, zmianAiMies: 50 },
  pakiet: { cenaBrutto: 149, serie: 10, zmianyAi: 300, aktualizacjeSzablonowMies: 12 },
  drugaMarka: { cenaBrutto: 49 },
  pakietWKreatorzeProRocznym: false,
  symboleAi: true,
  modelGeneracji: "claude-sonnet-5-5",
  modelZmian: "claude-sonnet-5-5",
  maksRozmiarWgraniaMb: 10,
};

const ustawienia = (z: Partial<UstawieniaMarki> = {}, konf: Partial<UstawieniaMarki["konfiguracja"]> = {}): UstawieniaMarki => {
  const k = { ...KONF, ...konf };
  return {
    konfiguracja: k,
    ceny: { pakiet: { brutto: k.pakiet.cenaBrutto, netto: nettoZBrutto(k.pakiet.cenaBrutto) }, drugaMarka: { brutto: k.drugaMarka.cenaBrutto, netto: nettoZBrutto(k.drugaMarka.cenaBrutto) } },
    kluczAnthropic: true,
    dokumenty: { regulamin: { wersja: "1.3.0", wymieniaKreatorMarki: false }, polityka: { wersja: "1.3.0", wymieniaKreatorMarki: false } },
    modele: [
      { model: "claude-haiku-4-5-20251001", nazwa: "Claude Haiku 4.5", cenaWej: 1, cenaWyj: 5, mnoznikOdczytuCache: 0.1 },
      { model: "claude-sonnet-5-5", nazwa: "Claude Sonnet 5.5", cenaWej: 2, cenaWyj: 10, mnoznikOdczytuCache: 0.05 },
    ],
    konta: [{ wpis: "ola@przyklad.pl", email: "ola@przyklad.pl", istnieje: true }],
    uzycie: { miesiac: "2026-11", zrodlo: "brak-danych", marki: 0, kontaZMarka: 0, serie: 0, zmianyAi: 0, kosztUsd: 0, pakiety: 0, drugieMarki: 0 },
    ...z,
  };
};

const tekst = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("strona Admin → Kreator marki", () => {
  it("render: ostrzeżenie o dokumentach, dostęp, limity, ceny brutto i netto, AI, użycie „brak danych”, bez natywnej listy wyboru", async () => {
    api.mockReset().mockResolvedValue(ustawienia());
    const h = renderToStaticMarkup(await Strona());
    const t = tekst(h);
    expect(api).toHaveBeenCalledWith("/admin/kreator-marki/konfiguracja");
    for (const s of ["dostep", "limity", "ceny", "ai", "uzycie"]) expect(h).toContain(`data-sekcja="${s}"`);
    expect(h).toContain('data-ostrzezenie="dokumenty"');
    expect(h).toContain("DO_ZATWIERDZENIA_kreator-marki.md");
    expect(t).toContain("Regulamin (1.3.0) i Polityka prywatności (1.3.0) nie opisują jeszcze Kreatora marki");
    expect(t).toContain("Tylko konta z listy");
    expect(t).toContain("ola@przyklad.pl");
    expect(t).toContain("149,00 zł brutto · 121,14 zł netto");
    expect(t).toContain("49,00 zł brutto · 39,84 zł netto");
    expect(t).toContain("Claude Sonnet 5.5");
    expect(h).toContain("data-brak-danych");
    expect(h).not.toMatch(/<select/);
    expect(h).not.toContain('data-ostrzezenie="brak-klucza"');
  });

  it("dokumenty opisują moduł, brak klucza Anthropic: bez ostrzeżenia prawnego, z ostrzeżeniem o kluczu", async () => {
    const gotowe = { regulamin: { wersja: "1.4.0", wymieniaKreatorMarki: true }, polityka: { wersja: "1.4.0", wymieniaKreatorMarki: true } };
    api.mockReset().mockResolvedValue(ustawienia({ dokumenty: gotowe, kluczAnthropic: false }));
    const h = renderToStaticMarkup(await Strona());
    expect(h).not.toContain('data-ostrzezenie="dokumenty"');
    expect(h).toContain('data-ostrzezenie="brak-klucza"');
  });

  it("odmowa API – komunikat zamiast formularza", async () => {
    api.mockReset().mockRejectedValue(new Error("Forbidden"));
    const h = renderToStaticMarkup(await Strona());
    expect(h).toContain("Nie udało się pobrać danych z API");
    expect(h).not.toContain('data-sekcja="dostep"');
  });

  it("nawigacja: strona tylko dla administratora", () => {
    expect(STRONY["/settings/kreator-marki"]).toEqual({ perm: "ADMIN", tytul: "Kreator marki" });
  });
});

describe("ceny i walidacja pól", () => {
  it("netto z brutto jak na fakturze: 149 → 121,14; 49 → 39,84; 99 → 80,49; 199 → 161,79", () => {
    expect([149, 49, 99, 199, 0].map(nettoZBrutto)).toEqual([121.14, 39.84, 80.49, 161.79, 0]);
  });

  it("zakresy: ceny do grosza (149,99 dobrze, 149,999 źle), liczby całkowite w limitach", () => {
    expect(bladPola("cenaBrutto", 149.99)).toBeNull();
    expect(bladPola("cenaBrutto", 149.999)).toContain("2 miejsca po przecinku");
    expect(bladPola("cenaBrutto", -1)).not.toBeNull();
    expect(bladPola("marek", 1.5)).toBe("Liczba całkowita od 0 do 20.");
    expect(bladPola("maksRozmiarWgraniaMb", 0)).toBe("Liczba całkowita od 1 do 25.");
    expect(bladPola("zmianAiMies", Number.NaN)).not.toBeNull();
  });
});

describe("KreatorMarkiForm – zapis i konta testowe", () => {
  let root: Root;
  let k: HTMLElement;
  beforeEach(() => {
    api.mockReset();
    (revalidatePath as jest.Mock).mockReset();
    (potwierdz as jest.Mock).mockReset();
    k = document.createElement("div");
    document.body.appendChild(k);
    root = createRoot(k);
    Element.prototype.scrollIntoView ??= () => undefined;
  });
  afterEach(() => {
    act(() => root.unmount());
    k.remove();
  });

  const przycisk = (t: string) => Array.from(k.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(t) || b.getAttribute("aria-label") === t)!;
  const wlacznik = () => k.querySelector<HTMLInputElement>('[data-sekcja="dostep"] input[type=checkbox]')!;
  const pole = (etykieta: string) => {
    const l = Array.from(k.querySelectorAll("label")).find((x) => (x.textContent ?? "").includes(etykieta))!;
    return l.querySelector<HTMLInputElement>("input")!;
  };
  function wpisz(p: HTMLInputElement, v: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(p, v);
    p.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const render = (u = ustawienia()) => act(() => root.render(<KreatorMarkiForm initial={u} />));

  it("włączenie dla wszystkich z ostrzeżeniem o dokumentach, cena Pakietu z podglądem netto, limit → PUT bez listy kont", async () => {
    (potwierdz as jest.Mock).mockResolvedValue(true);
    api.mockImplementation(async (_s: string, o: { body: Partial<UstawieniaMarki["konfiguracja"]> }) => ustawienia({}, o.body));
    render();

    await act(async () => wlacznik().click());
    expect(potwierdz).not.toHaveBeenCalled(); // „tylko lista kont” – bez pytania
    expect(wlacznik().checked).toBe(true);

    const dostepnosc = k.querySelectorAll<HTMLButtonElement>('[data-sekcja="dostep"] button')[0]!;
    await act(async () => dostepnosc.click());
    const opcja = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((o) => (o.textContent ?? "").includes("Wszyscy klienci"))!;
    await act(async () => opcja.click());
    expect(potwierdz).toHaveBeenCalledWith(expect.stringContaining("DO_ZATWIERDZENIA_kreator-marki.md"), expect.anything());

    act(() => wpisz(pole("Pakiet marki – cena jednorazowa"), "199"));
    expect(k.textContent).toContain("199,00 zł brutto · 161,79 zł netto");
    act(() => wpisz(pole("Zmiany AI / mies."), "80"));
    expect(k.textContent).toContain("Niezapisane zmiany");

    await act(async () => przycisk("Zapisz ustawienia Kreatora marki").click());
    expect(api).toHaveBeenCalledWith("/admin/kreator-marki/konfiguracja", {
      method: "PUT",
      body: {
        wlaczony: true,
        dostepnosc: "wszyscy",
        wCenieHostingu: { marek: 1, seriiMies: 3, zmianAiMies: 80 },
        pakiet: { cenaBrutto: 199, serie: 10, zmianyAi: 300, aktualizacjeSzablonowMies: 12 },
        drugaMarka: { cenaBrutto: 49 },
        pakietWKreatorzeProRocznym: false,
        symboleAi: true,
        modelGeneracji: "claude-sonnet-5-5",
        modelZmian: "claude-sonnet-5-5",
        maksRozmiarWgraniaMb: 10,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/kreator-marki");
    expect(k.textContent).toContain("Zapisano – działa od razu.");
  });

  it("odmowa w potwierdzeniu – dostępność zostaje „lista”; zły limit – bez wywołania API", async () => {
    (potwierdz as jest.Mock).mockResolvedValue(false);
    render(ustawienia({}, { wlaczony: true }));
    const dostepnosc = k.querySelectorAll<HTMLButtonElement>('[data-sekcja="dostep"] button')[0]!;
    await act(async () => dostepnosc.click());
    const opcja = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((o) => (o.textContent ?? "").includes("testerzy"))!;
    await act(async () => opcja.click());
    expect(potwierdz).toHaveBeenCalledTimes(1);
    expect(k.textContent).not.toContain("Niezapisane zmiany");

    act(() => wpisz(pole("Marki na koncie"), "1.5"));
    expect(k.textContent).toContain("Liczba całkowita od 0 do 20.");
    await act(async () => przycisk("Zapisz ustawienia Kreatora marki").click());
    expect(api).not.toHaveBeenCalled();
    expect(k.textContent).toContain("Popraw pola zaznaczone na czerwono.");
  });

  it("konta testowe: dodanie (POST), usunięcie (DELETE z zakodowanym adresem), zły adres bez API", async () => {
    render();
    const email = k.querySelector<HTMLInputElement>('input[type="email"]')!;
    act(() => wpisz(email, "to-nie-email"));
    await act(async () => przycisk("Dodaj konto testowe").click());
    expect(api).not.toHaveBeenCalled();
    expect(k.textContent).toContain("Podaj poprawny adres e-mail konta klienta.");

    api.mockResolvedValueOnce(ustawienia({ konta: [...ustawienia().konta, { wpis: "nowy@przyklad.pl", email: "nowy@przyklad.pl", istnieje: true }] }));
    act(() => wpisz(email, "Nowy@Przyklad.pl"));
    await act(async () => przycisk("Dodaj konto testowe").click());
    expect(api).toHaveBeenCalledWith("/admin/kreator-marki/konta-testowe", { method: "POST", body: { email: "Nowy@Przyklad.pl" } });
    expect(k.querySelectorAll('[aria-label="Konta testowe Kreatora marki"] li')).toHaveLength(2);

    api.mockResolvedValueOnce(ustawienia({ konta: [] }));
    await act(async () => przycisk("Usuń ola@przyklad.pl z kont testowych").click());
    expect(api).toHaveBeenLastCalledWith("/admin/kreator-marki/konta-testowe/ola%40przyklad.pl", { method: "DELETE" });
    expect(k.textContent).toContain("Brak kont testowych.");
  });
});
