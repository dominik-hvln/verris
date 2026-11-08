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
}

export const DOMYSLNA_KONFIGURACJA_KREATORA: KonfiguracjaKreatora = {
  modelGeneracji: 'claude-sonnet-5-5',
  modelZmian: 'claude-sonnet-5-5',
  wlaczony: false,
  kontaTestowe: [],
  bibliotekiZdjec: [...DOSTAWCY_ZDJEC],
};

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
