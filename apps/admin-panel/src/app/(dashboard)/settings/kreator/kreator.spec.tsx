/**
 * @jest-environment jsdom
 */
/**
 * Paczka 123 — Admin → Kreator stron (/settings/kreator). Wcześniej konfigurację kreatora (włącznik, konta testowe,
 * modele, biblioteki zdjęć) dało się zmienić tylko wywołaniem API, a kosztów cache i przychodu z Kreatora Pro nie
 * było nigdzie. Na starym kodzie test pada (brak strony, akcji i komponentów).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("@/components/potwierdz", () => ({ potwierdz: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/settings/kreator" }));

import { revalidatePath } from "next/cache";
import { adminApi } from "@/lib/api";
import { potwierdz } from "@/components/potwierdz";
import { KreatorForm } from "./kreator-form";
import { WykresDni } from "./podsumowanie";
import type { PodsumowanieKreatora, UstawieniaKreatora } from "./actions";
import Strona from "./page";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const api = adminApi as jest.Mock;

const ustawienia = (z: Partial<UstawieniaKreatora> = {}, konf: Partial<UstawieniaKreatora["konfiguracja"]> = {}): UstawieniaKreatora => ({
  konfiguracja: {
    modelGeneracji: "claude-sonnet-5-5",
    modelZmian: "claude-sonnet-5-5",
    wlaczony: false,
    kontaTestowe: ["ola@przyklad.pl", "stary@przyklad.pl"],
    bibliotekiZdjec: ["pixabay", "openverse", "pexels"],
    ...konf,
  },
  kluczAnthropic: true,
  regulamin: { wersja: "1.2.0", wymieniaKreator: false },
  modele: [
    { model: "claude-haiku-4-5-20251001", nazwa: "Claude Haiku 4.5", cenaWej: 1, cenaWyj: 5, mnoznikOdczytuCache: 0.1 },
    { model: "claude-sonnet-5-5", nazwa: "Claude Sonnet 5.5", cenaWej: 2, cenaWyj: 10, mnoznikOdczytuCache: 0.05 },
  ],
  mnoznikiZapisuCache: { "5m": 1.25, "1h": 2 },
  konta: [
    { wpis: "ola@przyklad.pl", email: "ola@przyklad.pl", istnieje: true },
    { wpis: "stary@przyklad.pl", email: null, istnieje: false },
  ],
  biblioteki: [
    { id: "pixabay", nazwa: "Pixabay", wymagaKlucza: true, gotowa: true },
    { id: "openverse", nazwa: "Openverse", wymagaKlucza: false, gotowa: true },
    { id: "pexels", nazwa: "Pexels", wymagaKlucza: true, gotowa: false },
  ],
  miesiac: { miesiac: "2026-11", generacje: 4, zmiany: 31, kosztUsd: 1.2345, cacheZapis: 12000, cacheOdczyt: 90000 },
  ...z,
});

const dni = Array.from({ length: 30 }, (_, i) => ({
  dzien: new Date(Date.UTC(2026, 9, 10 + i)).toISOString().slice(0, 10),
  wywolania: i === 29 ? 5 : 0,
  generacje: i === 29 ? 3 : 0,
  zmiany: i === 29 ? 2 : 0,
  kosztUsd: i === 29 ? 0.051 : 0,
}));

const PODSUMOWANIE: PodsumowanieKreatora = {
  miesiac: "2026-11",
  konta: { zeStronami: 4, aktywneWMiesiacu: 3 },
  strony: { razem: 7, opublikowane: 2, generowane: 1, bledne: 1 },
  generacje: 4,
  zmiany: 31,
  koszt: {
    wywolania: 5,
    tokeny: { wej: 1000, wyj: 500, zapis5m: 0, zapis1h: 10000, odczyt: 40000 },
    wejscieUsd: 0.002,
    wyjscieUsd: 0.005,
    cacheZapisUsd: 0.04,
    cacheOdczytUsd: 0.004,
    razemUsd: 0.051,
    bezCacheUsd: 0.1,
    oszczednoscUsd: 0.056,
    zapisanyUsd: 0.051,
  },
  pro: { aktywne: 2, miesieczne: 1, roczne: 1, miesiecznieBrutto: 18.15, miesiecznieNetto: 14.76 },
  dni,
  magazyn: { zdjecia: 12, bajty: 3_500_000 },
  bledy: [{ id: "s1", at: "2026-11-08T10:00:00.000Z", email: "jan@przyklad.pl", opis: "Nie udało się wygenerować strony – spróbuj ponownie." }],
};

function apiStrony(o: { podsumowanie?: unknown; konfiguracja?: unknown } = {}) {
  api.mockReset().mockImplementation(async (s: string) => {
    if (s === "/admin/kreator/konfiguracja") {
      if (o.konfiguracja instanceof Error) throw o.konfiguracja;
      return o.konfiguracja ?? ustawienia();
    }
    if (s === "/admin/kreator/podsumowanie") {
      if (o.podsumowanie instanceof Error) throw o.podsumowanie;
      return o.podsumowanie ?? PODSUMOWANIE;
    }
    throw new Error(`nieoczekiwane ${s}`);
  });
}

describe("strona Admin → Kreator stron", () => {
  it("render: dostęp z ostrzeżeniem o Regulaminie, konta testowe, modele, biblioteki ze stanem klucza, koszty i błędy", async () => {
    apiStrony();
    const h = renderToStaticMarkup(await Strona());
    expect(h).toContain("Kreator stron");
    for (const s of ["dostep", "ai", "zdjecia", "zuzycie", "bledy"]) expect(h).toContain(`data-sekcja="${s}"`);
    // Dostęp
    expect(h).toContain('data-ostrzezenie="regulamin"');
    expect(h).toContain("DO_ZATWIERDZENIA_kreator-pro.md");
    expect(h).toContain("Kreator włączony dla wszystkich klientów");
    expect(h).toContain("ola@przyklad.pl");
    expect(h).toContain("brak takiego konta");
    expect(h).not.toContain('data-ostrzezenie="brak-klucza"');
    // AI i cache
    expect(h).toContain("Claude Sonnet 5.5");
    expect(h).toContain("odczyt cache ×0,05");
    expect(h).toContain("Cache promptu.");
    expect(h).not.toMatch(/<select/);
    // Zdjęcia: stan klucza, nigdy wartość
    expect(h).toContain("klucz skonfigurowany");
    expect(h).toContain("bez klucza");
    expect(h).toContain("brak klucza PEXELS_API_KEY");
    expect(h).toContain("12 zdjęć w bibliotekach kont");
    // Zużycie i koszty
    expect(h).toContain("listopad 2026");
    expect(h).toContain("$0.0510");
    expect(h).toContain("$0.0400");
    expect(h).toContain("$0.0040");
    expect(h).toContain("$0.0560");
    expect(h).toContain("2 abonamenty");
    expect(h).toContain("14,76 zł netto / 18,15 zł brutto miesięcznie");
    // Błędy generacji – e-mail i komunikat, bez treści stron
    expect(h).toContain("jan@przyklad.pl");
    expect(h).toContain("Nie udało się wygenerować strony");
  });

  it("Regulamin opisuje kreator, brak klucza Anthropic: bez ostrzeżenia prawnego, z ostrzeżeniem o kluczu", async () => {
    apiStrony({ konfiguracja: ustawienia({ regulamin: { wersja: "1.3.0", wymieniaKreator: true }, kluczAnthropic: false }) });
    const h = renderToStaticMarkup(await Strona());
    expect(h).not.toContain('data-ostrzezenie="regulamin"');
    expect(h).toContain('data-ostrzezenie="brak-klucza"');
  });

  it("błąd podsumowania nie wywraca strony – konfiguracja zostaje, sekcja z „Spróbuj ponownie”", async () => {
    apiStrony({ podsumowanie: new Error("API niedostępne") });
    const h = renderToStaticMarkup(await Strona());
    expect(h).toContain('data-sekcja="dostep"');
    expect(h).toContain("Nie udało się wczytać podsumowania kreatora.");
  });

  it("odmowa API (np. 403 dla nie-administratora) – komunikat zamiast formularza", async () => {
    apiStrony({ konfiguracja: new Error("Forbidden") });
    const h = renderToStaticMarkup(await Strona());
    expect(h).toContain("Nie udało się pobrać danych z API");
    expect(h).not.toContain('data-sekcja="dostep"');
  });
});

describe("KreatorForm – zapis i konta testowe", () => {
  let root: Root;
  let k: HTMLElement;
  beforeEach(() => {
    api.mockReset();
    (revalidatePath as jest.Mock).mockReset();
    (potwierdz as jest.Mock).mockReset();
    k = document.createElement("div");
    document.body.appendChild(k);
    root = createRoot(k);
  });
  afterEach(() => {
    act(() => root.unmount());
    k.remove();
  });

  const przycisk = (tekst: string) => Array.from(k.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(tekst) || b.getAttribute("aria-label") === tekst)!;
  const wlacznik = () => k.querySelector<HTMLInputElement>('[data-sekcja="dostep"] input[type=checkbox]')!;
  function wpisz(pole: HTMLInputElement, v: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pole, v);
    pole.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const render = (u = ustawienia()) => act(() => root.render(<KreatorForm initial={u} magazyn={null} />));

  it("włączenie dla wszystkich (z potwierdzeniem przy Regulaminie bez kreatora), wyłączenie Pexels i kolejność → PUT z polami DTO", async () => {
    (potwierdz as jest.Mock).mockResolvedValue(true);
    api.mockImplementation(async (_s: string, o: { body: Partial<UstawieniaKreatora["konfiguracja"]> }) => ustawienia({}, o.body));
    render();

    await act(async () => wlacznik().click());
    expect(potwierdz).toHaveBeenCalledTimes(1);
    expect(wlacznik().checked).toBe(true);
    expect(k.textContent).toContain("Niezapisane zmiany");

    const pexels = k.querySelector<HTMLInputElement>('[data-biblioteka="pexels"] input[type=checkbox]')!;
    act(() => pexels.click());
    act(() => przycisk("Openverse wyżej").click());

    await act(async () => przycisk("Zapisz ustawienia kreatora").click());
    expect(api).toHaveBeenCalledWith("/admin/kreator/konfiguracja", {
      method: "PUT",
      body: { wlaczony: true, modelGeneracji: "claude-sonnet-5-5", modelZmian: "claude-sonnet-5-5", bibliotekiZdjec: ["openverse", "pixabay"] },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/kreator");
    expect(k.textContent).toContain("Zapisano – działa od razu.");
    expect(k.textContent).not.toContain("Niezapisane zmiany");
  });

  it("odmowa w potwierdzeniu – przełącznik zostaje wyłączony; Regulamin z kreatorem – bez pytania", async () => {
    (potwierdz as jest.Mock).mockResolvedValue(false);
    render();
    await act(async () => wlacznik().click());
    expect(wlacznik().checked).toBe(false);

    act(() => root.render(<KreatorForm key="2" initial={ustawienia({ regulamin: { wersja: "1.3.0", wymieniaKreator: true } })} magazyn={null} />));
    (potwierdz as jest.Mock).mockClear();
    await act(async () => wlacznik().click());
    expect(potwierdz).not.toHaveBeenCalled();
    expect(wlacznik().checked).toBe(true);
  });

  it("błąd zapisu: komunikat z API po polsku", async () => {
    api.mockRejectedValue(new Error("Nieznany model – wybierz model Anthropic z listy (ceny modeli są w Konfiguracji asystenta)."));
    render();
    await act(async () => przycisk("Zapisz ustawienia kreatora").click());
    expect(k.textContent).toContain("Nieznany model – wybierz model Anthropic z listy");
    expect(k.textContent).not.toContain("Zapisano");
  });

  it("dodanie nieistniejącego konta → błąd z API, lista bez zmian; zły adres – bez wywołania API", async () => {
    render();
    const pole = k.querySelector<HTMLInputElement>('input[type="email"]')!;

    act(() => wpisz(pole, "to-nie-email"));
    await act(async () => przycisk("Dodaj konto testowe").click());
    expect(api).not.toHaveBeenCalled();
    expect(k.textContent).toContain("Podaj poprawny adres e-mail konta klienta.");

    api.mockRejectedValue(new Error("Nie ma konta z adresem nikt@przyklad.pl – konto testowe musi już istnieć w Verris."));
    act(() => wpisz(pole, "nikt@przyklad.pl"));
    await act(async () => przycisk("Dodaj konto testowe").click());
    expect(api).toHaveBeenCalledWith("/admin/kreator/konta-testowe", { method: "POST", body: { email: "nikt@przyklad.pl" } });
    expect(k.textContent).toContain("Nie ma konta z adresem nikt@przyklad.pl");
    expect(k.querySelectorAll('[aria-label="Konta testowe"] li')).toHaveLength(2);
  });

  it("dodanie istniejącego konta i usunięcie wpisu – lista z odpowiedzi API, adres zakodowany w ścieżce", async () => {
    const zNowym = ustawienia({
      konta: [...ustawienia().konta, { wpis: "nowy@przyklad.pl", email: "nowy@przyklad.pl", istnieje: true }],
    });
    api.mockResolvedValueOnce(zNowym);
    render();
    act(() => wpisz(k.querySelector<HTMLInputElement>('input[type="email"]')!, "Nowy@Przyklad.pl"));
    await act(async () => przycisk("Dodaj konto testowe").click());
    expect(k.querySelectorAll('[aria-label="Konta testowe"] li')).toHaveLength(3);
    expect(k.textContent).toContain("Dodano nowy@przyklad.pl");

    api.mockResolvedValueOnce(ustawienia({ konta: [ustawienia().konta[0]!] }));
    await act(async () => przycisk("Usuń stary@przyklad.pl z kont testowych").click());
    expect(api).toHaveBeenLastCalledWith("/admin/kreator/konta-testowe/stary%40przyklad.pl", { method: "DELETE" });
    expect(k.querySelectorAll('[aria-label="Konta testowe"] li')).toHaveLength(1);
  });
});

describe("WykresDni", () => {
  it("30 słupków z dymkiem; bez wywołań – komunikat zamiast pustego wykresu", () => {
    const h = renderToStaticMarkup(<WykresDni dni={dni} />);
    expect(h.match(/<rect /g)).toHaveLength(30);
    expect(h).toContain("08.11: $0.0510 · 3 wywołania generacji, 2 zmiany AI");
    expect(renderToStaticMarkup(<WykresDni dni={dni.map((d) => ({ ...d, wywolania: 0, kosztUsd: 0 }))} />)).toContain("Brak wywołań AI kreatora");
  });
});
