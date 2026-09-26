/**
 * Asystent AI w dwóch poziomach (decyzja właściciela 2026-09-25): SZYBKI — dymki, czat z bazą wiedzy;
 * ANALIZA — prognozy, diagnozy, szkice odpowiedzi obsługi. Dostawcę i model każdego poziomu admin wybiera
 * w panelu (Ustawienia → Asystent AI), więc nowszy model to zmiana ustawienia, nie kodu.
 *
 * Ceny w USD za 1 mln tokenów, stan na 2026-09-25 z oficjalnych cenników (developers.openai.com/api/docs/models,
 * platform.claude.com/docs/en/about-claude/pricing). Admin może je poprawić w panelu, gdy dostawca zmieni cennik.
 */
export type DostawcaAi = 'openai' | 'anthropic';
export type PoziomAi = 'szybki' | 'analiza';

export interface ZnanyModelAi {
  dostawca: DostawcaAi;
  model: string;
  nazwa: string;
  cenaWej: number;
  cenaWyj: number;
}

export const ZNANE_MODELE_AI: ZnanyModelAi[] = [
  { dostawca: 'openai', model: 'gpt-5.6-luna', nazwa: 'GPT-5.6 Luna', cenaWej: 0.2, cenaWyj: 1.2 },
  { dostawca: 'anthropic', model: 'claude-haiku-4-5-20251001', nazwa: 'Claude Haiku 4.5', cenaWej: 1, cenaWyj: 5 },
  { dostawca: 'anthropic', model: 'claude-sonnet-5', nazwa: 'Claude Sonnet 5', cenaWej: 2, cenaWyj: 10 },
  { dostawca: 'anthropic', model: 'claude-opus-5-5', nazwa: 'Claude Opus 5.5', cenaWej: 4, cenaWyj: 20 },
];

export interface KonfiguracjaAi {
  szybki: { dostawca: DostawcaAi; model: string };
  analiza: { dostawca: DostawcaAi; model: string };
  /** Miesięczny limit kosztu AI na jedno konto klienta (USD). 0 = bez limitu. Obsługa nie ma limitu. */
  limitKlientaUsd: number;
  /** Ceny modeli (USD / 1 mln tokenów) — domyślnie z ZNANE_MODELE_AI, admin może nadpisać i dopisać nowe. */
  ceny: Record<string, { wej: number; wyj: number }>;
}

export const DOMYSLNA_KONFIGURACJA_AI: KonfiguracjaAi = {
  szybki: { dostawca: 'openai', model: 'gpt-5.6-luna' },
  analiza: { dostawca: 'anthropic', model: 'claude-sonnet-5' },
  limitKlientaUsd: 2,
  ceny: Object.fromEntries(ZNANE_MODELE_AI.map((m) => [m.model, { wej: m.cenaWej, wyj: m.cenaWyj }])),
};

const MODEL_RE = /^[A-Za-z0-9._:-]{2,80}$/;

/** Ustawienie z bazy (JSON) → pełna, bezpieczna konfiguracja; śmieci wracają do wartości domyślnych. */
export function odczytajKonfiguracjeAi(surowe: string | null | undefined): KonfiguracjaAi {
  let v: Partial<KonfiguracjaAi>;
  try {
    v = surowe ? (JSON.parse(surowe) as Partial<KonfiguracjaAi>) : {};
  } catch {
    v = {};
  }
  const poziom = (p: unknown, d: KonfiguracjaAi['szybki']) => {
    const o = (p ?? {}) as { dostawca?: unknown; model?: unknown };
    const dostawca = o.dostawca === 'openai' || o.dostawca === 'anthropic' ? o.dostawca : d.dostawca;
    const model = typeof o.model === 'string' && MODEL_RE.test(o.model) ? o.model : d.model;
    return { dostawca, model };
  };
  const ceny: KonfiguracjaAi['ceny'] = { ...DOMYSLNA_KONFIGURACJA_AI.ceny };
  for (const [m, c] of Object.entries((v.ceny ?? {}) as Record<string, { wej?: unknown; wyj?: unknown }>)) {
    const wej = Number(c?.wej);
    const wyj = Number(c?.wyj);
    if (MODEL_RE.test(m) && Number.isFinite(wej) && Number.isFinite(wyj) && wej >= 0 && wyj >= 0 && wej < 1000 && wyj < 1000) {
      ceny[m] = { wej, wyj };
    }
  }
  const limit = Number(v.limitKlientaUsd);
  return {
    szybki: poziom(v.szybki, DOMYSLNA_KONFIGURACJA_AI.szybki),
    analiza: poziom(v.analiza, DOMYSLNA_KONFIGURACJA_AI.analiza),
    limitKlientaUsd: Number.isFinite(limit) && limit >= 0 && limit <= 1000 ? Math.round(limit * 100) / 100 : DOMYSLNA_KONFIGURACJA_AI.limitKlientaUsd,
    ceny,
  };
}

/** Koszt wywołania w USD; nieznany model (brak ceny) liczymy po najdroższym znanym — lepiej przeszacować limit. */
export function kosztUsd(konf: KonfiguracjaAi, model: string, wej: number, wyj: number): number {
  const cena = konf.ceny[model] ?? { wej: 20, wyj: 100 };
  return (wej * cena.wej + wyj * cena.wyj) / 1_000_000;
}
