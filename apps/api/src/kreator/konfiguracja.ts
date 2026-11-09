/**
 * Verris Kreator (paczka 119) – konfiguracja w ustawieniach platformy (JSON pod KLUCZ_KONFIGURACJI_KREATORA,
 * edycja: admin → GET/PUT /admin/kreator/konfiguracja). Decyzja właściciela 7.11.2026: tylko Anthropic,
 * Claude Sonnet 5.5 do generacji i zmian. Domyślnie WYŁĄCZONY dla wszystkich – przed włączeniem kreator mają
 * wyłącznie konta z listy `kontaTestowe` (e-maile albo identyfikatory kont).
 */
import { DOSTAWCY_ZDJEC, type NazwaDostawcy } from './biblioteka/dostawca.js';

export const KLUCZ_KONFIGURACJI_KREATORA = 'kreator.konfiguracja';

/** Funkcja w AiInteractionLog – koszt kreatora w raporcie kosztów AI i w budżecie platformy. */
export const FUNKCJA_AI_KREATORA = 'kreator';
/** Paczka 124 – funkcja w AiInteractionLog dla zdjęć AI (koszt obrazów; budżet platformy liczy wszystkie funkcje). */
export const FUNKCJA_AI_OBRAZU = 'kreator-obraz';

export interface KonfiguracjaKreatora {
  modelGeneracji: string;
  modelZmian: string;
  wlaczony: boolean;
  /** E-maile (małe litery) albo identyfikatory kont z dostępem przed włączeniem dla wszystkich. */
  kontaTestowe: string[];
  /**
   * Paczka 122 – biblioteki zdjęć w edytorze, w tej kolejności. Faktycznie włączone = te z listy, które mają klucz
   * API (PIXABAY_API_KEY, PEXELS_API_KEY); Openverse działa bez klucza.
   */
  bibliotekiZdjec: NazwaDostawcy[];
  /** Paczka 124 – generowanie zdjęć przez AI (zakładka „Wygeneruj” w wyborze zdjęcia). */
  obrazyAi: KonfiguracjaObrazowAi;
}

/**
 * Generowanie zdjęć AI. `wlaczone` domyślnie false: dostawca obrazów to nowy podprocesor – włączyć dopiero po publikacji
 * zmiany Polityki prywatności (docs/legal/drafts/DO_ZATWIERDZENIA_zdjecia-ai.md). Bez klucza dostawcy generowanie
 * i tak stoi (BFL_API_KEY albo AI_API_KEY dla OpenAI).
 */
export type KonfiguracjaObrazowAi = {
  wlaczone: boolean;
  dostawca: DostawcaObrazowAi;
  model: string;
  /** Koszt jednego obrazu w USD – do ustawienia wg cennika dostawcy (raport kosztów i budżet platformy). */
  cenaZaObrazUsd: number;
};

export const DOSTAWCY_OBRAZOW_AI = ['bfl', 'openai'] as const;
export type DostawcaObrazowAi = (typeof DOSTAWCY_OBRAZOW_AI)[number];

/**
 * Model i cena domyślna dostawcy. Do sprawdzenia z dokumentacją i cennikiem przy wdrożeniu (stan wiedzy, bez dostępu
 * do sieci): BFL FLUX1.1 [pro] (`flux-pro-1.1`) ok. 0,04 USD za obraz; OpenAI `gpt-image-1`, jakość „medium”,
 * 1024×1024 ok. 0,04 USD, 1536×1024 ok. 0,06 USD – przyjmujemy wyższą.
 */
export const DOMYSLNE_OBRAZY_AI: Record<DostawcaObrazowAi, { model: string; cenaZaObrazUsd: number; modelRe: RegExp }> = {
  bfl: { model: 'flux-pro-1.1', cenaZaObrazUsd: 0.04, modelRe: /^flux-[a-z0-9.-]{1,40}$/ },
  openai: { model: 'gpt-image-1', cenaZaObrazUsd: 0.06, modelRe: /^(gpt-image|dall-e)[a-z0-9.-]{0,40}$/ },
};
export const MAKS_CENY_OBRAZU_USD = 5;

export const DOMYSLNA_KONFIGURACJA_KREATORA: KonfiguracjaKreatora = {
  modelGeneracji: 'claude-sonnet-5-5',
  modelZmian: 'claude-sonnet-5-5',
  wlaczony: false,
  kontaTestowe: [],
  bibliotekiZdjec: [...DOSTAWCY_ZDJEC],
  obrazyAi: { wlaczone: false, dostawca: 'bfl', model: DOMYSLNE_OBRAZY_AI.bfl.model, cenaZaObrazUsd: DOMYSLNE_OBRAZY_AI.bfl.cenaZaObrazUsd },
};

/** Ustawienia zdjęć AI z JSON-a: nieznany dostawca → BFL, model spoza wzorca dostawcy → domyślny, cena 0..5 USD. */
export function odczytajObrazyAi(v: unknown): KonfiguracjaObrazowAi {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const dostawca: DostawcaObrazowAi = (DOSTAWCY_OBRAZOW_AI as readonly unknown[]).includes(o.dostawca) ? (o.dostawca as DostawcaObrazowAi) : 'bfl';
  const d = DOMYSLNE_OBRAZY_AI[dostawca];
  const model = typeof o.model === 'string' && d.modelRe.test(o.model) ? o.model : d.model;
  const cena = typeof o.cenaZaObrazUsd === 'number' && Number.isFinite(o.cenaZaObrazUsd) && o.cenaZaObrazUsd >= 0 && o.cenaZaObrazUsd <= MAKS_CENY_OBRAZU_USD
    ? Math.round(o.cenaZaObrazUsd * 1e4) / 1e4
    : d.cenaZaObrazUsd;
  return { wlaczone: o.wlaczone === true, dostawca, model, cenaZaObrazUsd: cena };
}

/** Tylko modele Anthropic (prefiks claude-) – kreator wysyła prompt caching w formacie Messages API. */
export const MODEL_KREATORA_RE = /^claude-[A-Za-z0-9._:-]{2,76}$/;
const MAKS_KONT_TESTOWYCH = 200;

/** Ustawienie z bazy (JSON) → pełna, bezpieczna konfiguracja; śmieci wracają do wartości domyślnych. */
export function odczytajKonfiguracjeKreatora(surowe: string | null | undefined): KonfiguracjaKreatora {
  let v: Partial<Record<keyof KonfiguracjaKreatora, unknown>>;
  try {
    const p: unknown = surowe ? JSON.parse(surowe) : {};
    v = p && typeof p === 'object' && !Array.isArray(p) ? (p as typeof v) : {};
  } catch {
    v = {};
  }
  const d = DOMYSLNA_KONFIGURACJA_KREATORA;
  const model = (x: unknown, dom: string) => (typeof x === 'string' && MODEL_KREATORA_RE.test(x) ? x : dom);
  const konta = Array.isArray(v.kontaTestowe)
    ? [
        ...new Set(
          v.kontaTestowe
            .filter((k): k is string => typeof k === 'string')
            .map((k) => k.trim().toLowerCase())
            .filter((k) => k.length > 0 && k.length <= 120),
        ),
      ].slice(0, MAKS_KONT_TESTOWYCH)
    : [];
  const biblioteki = Array.isArray(v.bibliotekiZdjec)
    ? [...new Set(v.bibliotekiZdjec.filter((b): b is NazwaDostawcy => (DOSTAWCY_ZDJEC as readonly unknown[]).includes(b)))]
    : [...d.bibliotekiZdjec];
  return {
    modelGeneracji: model(v.modelGeneracji, d.modelGeneracji),
    modelZmian: model(v.modelZmian, d.modelZmian),
    wlaczony: v.wlaczony === true,
    kontaTestowe: konta,
    bibliotekiZdjec: biblioteki,
    obrazyAi: odczytajObrazyAi(v.obrazyAi),
  };
}

/** Czy konto ma kreator przed włączeniem dla wszystkich (lista po e-mailu albo identyfikatorze konta). */
export function kontoTestowe(konf: KonfiguracjaKreatora, konto: { id: string; email?: string | null }): boolean {
  return konf.kontaTestowe.includes(konto.id.toLowerCase()) || (!!konto.email && konf.kontaTestowe.includes(konto.email.toLowerCase()));
}

/** Miesiąc rozliczeniowy kreatora 'YYYY-MM' w UTC (tak jak limity AI w ai-provider.service.ts). */
export function miesiacUtc(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
