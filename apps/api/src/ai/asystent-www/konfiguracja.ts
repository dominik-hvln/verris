/**
 * Asystent AI na verris.pl (1.11.2026) — konfiguracja w ustawieniach platformy (JSON pod KLUCZ_ASYSTENTA_WWW,
 * edycja: admin → Ustawienia → Asystent AI). Decyzja Dominika: Anthropic — Sonnet 5.5 do odpowiedzi,
 * tańszy Haiku 4.5 jako strażnik (klasyfikacja pytania). Domyślnie WYŁĄCZONY: włącza admin po zatwierdzeniu
 * dokumentów (podprocesor AI w polityce prywatności — docs/legal/drafts/DO_ZATWIERDZENIA_asystent-ai.md).
 */
export const KLUCZ_ASYSTENTA_WWW = 'ai.asystentWww';

/** Funkcje w AiInteractionLog — dzienny i miesięczny limit kosztu liczony z ich sumy. */
export const FUNKCJA_ODPOWIEDZ = 'asystent_www';
export const FUNKCJA_STRAZNIK = 'asystent_www_straznik';
export const FUNKCJE_ASYSTENTA = [FUNKCJA_ODPOWIEDZ, FUNKCJA_STRAZNIK];

export interface KonfiguracjaAsystenta {
  wlaczony: boolean;
  model: string;
  modelStraznika: string;
  /** USD; 0 = bez limitu. */
  limitDziennyUsd: number;
  limitMiesiecznyUsd: number;
}

export const DOMYSLNA_KONFIGURACJA_ASYSTENTA: KonfiguracjaAsystenta = {
  wlaczony: false,
  model: 'claude-sonnet-5-5',
  modelStraznika: 'claude-haiku-4-5-20251001',
  limitDziennyUsd: 10,
  limitMiesiecznyUsd: 150,
};

/** Twarde limity rozmowy (projekt claude/asystent-ai-www.md). */
export const LIMITY_ASYSTENTA = {
  maksZnakowPytania: 1000,
  maksWymianWRozmowie: 12,
  /** Captcha od tej wiadomości w rozmowie (1-based). */
  captchaOdWiadomosci: 4,
  maksWiadomosciIpNaDobe: 60,
  retencjaDni: 30,
} as const;

const MODEL_RE = /^[A-Za-z0-9._:-]{2,80}$/;

function limit(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10_000 ? Math.round(n * 100) / 100 : d;
}

/** Ustawienie z bazy (JSON) → pełna, bezpieczna konfiguracja; śmieci wracają do domyślnych. */
export function odczytajKonfiguracjeAsystenta(surowe: string | null | undefined): KonfiguracjaAsystenta {
  let v: Partial<Record<keyof KonfiguracjaAsystenta, unknown>>;
  try {
    v = surowe ? (JSON.parse(surowe) as typeof v) : {};
  } catch {
    v = {};
  }
  const d = DOMYSLNA_KONFIGURACJA_ASYSTENTA;
  return {
    wlaczony: v.wlaczony === true,
    model: typeof v.model === 'string' && MODEL_RE.test(v.model) ? v.model : d.model,
    modelStraznika: typeof v.modelStraznika === 'string' && MODEL_RE.test(v.modelStraznika) ? v.modelStraznika : d.modelStraznika,
    limitDziennyUsd: limit(v.limitDziennyUsd, d.limitDziennyUsd),
    limitMiesiecznyUsd: limit(v.limitMiesiecznyUsd, d.limitMiesiecznyUsd),
  };
}
