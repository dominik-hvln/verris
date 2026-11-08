/**
 * Ceny verris.pl — jedno źródło dla wszystkich stron (decyzja 1.11.2026: ceny na stronie mają się brać z realnych
 * danych w API, nie z liczb wpisanych w kod). Ten plik jest czysty (bez fetch), więc mogą go używać także
 * komponenty klienckie. Pobieranie z API: lib/ceny-api.ts.
 *
 * Źródła w API: GET /plans (Plan.priceMonthly / priceYearly — kwoty BRUTTO, trialDays) i GET /autoscaling/pricing
 * (AutoscalingPriceRule.pricePerUnit — stawki BRUTTO za godzinę: CPU za 1%, RAM i dysk za 1 GB).
 * Paczka 123: z GET /plans także abonament Verris Kreator Pro (plan `kreator-pro`, productKind KREATOR_PRO).
 */

/** Stawka VAT dla cen na stronie. Netto liczymy tylko tutaj. */
export const VAT = 0.23;

export type CenaPakietu = {
  /** Brutto, zł. */
  miesiecznie: number;
  /** Brutto, zł. */
  rocznie: number;
};

export type StawkiAutoskalowania = {
  /** Brutto za 1% CPU na godzinę (100% = 1 vCPU). */
  cpu: number;
  /** Brutto za 1 GB RAM na godzinę. */
  ram: number;
  /** Brutto za 1 GB dysku na godzinę. */
  dysk: number;
};

export type Ceny = {
  hosting: CenaPakietu & { trialDays: number };
  /** Sama poczta (plan poczta-standard). */
  poczta: CenaPakietu;
  /** Abonament Verris Kreator Pro (plan kreator-pro) – dodatek do hostingu, /kreator-stron. */
  kreatorPro: CenaPakietu;
  stawki: StawkiAutoskalowania;
  /** 'api' — wszystko z API; 'zapas' — przynajmniej część z CENY_ZAPASOWE (API nie odpowiedziało). */
  zrodlo: 'api' | 'zapas';
};

/**
 * Ostatnie znane ceny z API (stan na 1.11.2026: GET /plans i /autoscaling/pricing na api.verris.pl).
 * Używane tylko wtedy, gdy API nie odpowiada — żeby strona nigdy nie była pusta. Przy zmianie cennika w adminie
 * strona i tak pokaże nowe wartości z API; tę stałą warto wtedy zaktualizować, ale nie jest źródłem prawdy.
 */
export const CENY_ZAPASOWE: Ceny = {
  hosting: { miesiecznie: 45, rocznie: 449, trialDays: 0 },
  poczta: { miesiecznie: 9.99, rocznie: 99.99 },
  // Migracja 20261108140100_plan_kreator_pro (apps/api/src/plans/plan-kreator-pro.ts) – stan na 8.11.2026.
  kreatorPro: { miesiecznie: 9.9, rocznie: 99 },
  stawki: { cpu: 0.001323, ram: 0.0882, dysk: 0.0008 },
  zrodlo: 'zapas',
};

/** Kwota netto z brutto, zaokrąglona do grosza. */
export function netto(brutto: number): number {
  return Math.round((brutto / (1 + VAT)) * 100) / 100;
}

/** Stawka netto bez zaokrąglania do grosza (stawki godzinowe są ułamkami grosza). */
export function nettoStawki(brutto: number): number {
  return brutto / (1 + VAT);
}

function grupuj(calkowite: string): string {
  return calkowite.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** „45 zł”, „36,59 zł”, „1 347 zł” — pełne złote bez groszy, inaczej dwa miejsca po przecinku. */
export function zl(kwota: number): string {
  const grosze = Math.round(kwota * 100);
  const cale = Math.trunc(grosze / 100);
  const reszta = Math.abs(grosze % 100);
  const tekst = reszta === 0 ? grupuj(String(cale)) : `${grupuj(String(cale))},${String(reszta).padStart(2, '0')}`;
  return `${tekst} zł`;
}

/** Kwota zawsze z groszami: „45,00 zł”. Do rachunków i podsumowań. */
export function zlGrosze(kwota: number): string {
  const [c, g] = (Math.round(kwota * 100) / 100).toFixed(2).split('.');
  return `${grupuj(c)},${g} zł`;
}

/**
 * Stawka godzinowa tak, jak jest w cenniku: wszystkie cyfry (do 6 znaczących — API trzyma stawki z dokładnością
 * 0,000001 zł), bez zer na końcu, przecinek dziesiętny, bez „zł” — „0,001283”, „0,0882”, „0,0008”, netto „0,0717073”.
 * Uwaga 6.11.2026: stawek nie wolno skracać (wcześniej 4 cyfry znaczące: 0,123456 → „0,1235”).
 */
export function stawka(x: number): string {
  return x.toLocaleString('pl-PL', { maximumSignificantDigits: 6, useGrouping: false });
}

/**
 * Kwota za godzinę z dodatkową mocą (to jeszcze nie jest kwota do zapłaty): od 1 zł do grosza („1,23”), poniżej
 * 1 zł z dokładnością stawek, ale co najmniej dwa miejsca („0,001283”, „0,06615”, „0,40”) — żeby 1% procesora
 * nie pokazywał się jako „0,00 zł”. Bez „zł”.
 */
export function kwotaGodzinowa(x: number): string {
  if (Math.abs(x) >= 1) return x.toFixed(2).replace('.', ',');
  const t = stawka(x);
  const miejsca = t.split(',')[1]?.length ?? 0;
  return miejsca >= 2 ? t : x.toFixed(2).replace('.', ',');
}

/** Rabat za płatność roczną względem 12 × miesięczna, w pełnych procentach w dół (449 vs 540 → 16). */
export function rabatRocznyProcent(c: CenaPakietu): number {
  const rok = c.miesiecznie * 12;
  if (rok <= 0 || c.rocznie >= rok) return 0;
  return Math.floor(((rok - c.rocznie) / rok) * 100);
}

/** Ile miesięcznie wychodzi przy płatności rocznej (brutto, zł, do grosza). */
export function miesiecznieZRocznej(c: CenaPakietu): number {
  return Math.round((c.rocznie / 12) * 100) / 100;
}

/** Cena do wyświetlenia w wariancie okresu i brutto/netto (PrzelacznikCeny, pasek na telefonie). */
export function opisCeny(c: CenaPakietu, rocznie: boolean, nettoWidok: boolean): { cena: string; okres: string; podpis: string } {
  if (rocznie) {
    const mies = miesiecznieZRocznej(c);
    return nettoWidok
      ? { cena: zl(netto(c.rocznie)), okres: '/ rok', podpis: `netto · ${zl(c.rocznie)} brutto · ok. ${zl(netto(mies))} netto miesięcznie` }
      : { cena: zl(c.rocznie), okres: '/ rok', podpis: `brutto · ${zl(netto(c.rocznie))} netto · ok. ${zl(mies)} miesięcznie` };
  }
  return nettoWidok
    ? { cena: zl(netto(c.miesiecznie)), okres: '/ mies.', podpis: `netto · ${zl(c.miesiecznie)} brutto · bez zobowiązania` }
    : { cena: zl(c.miesiecznie), okres: '/ mies.', podpis: `brutto · ${zl(netto(c.miesiecznie))} netto · bez zobowiązania` };
}


/**
 * Zdanie z ceną pakietu do treści stron (zasada: brutto i netto obok siebie):
 * „45 zł/mies. albo 449 zł/rok brutto (36,59 zł albo 365,04 zł netto)”.
 */
export function cenaPakietu(c: CenaPakietu): string {
  return `${zl(c.miesiecznie)}/mies. albo ${zl(c.rocznie)}/rok brutto (${zl(netto(c.miesiecznie))} albo ${zl(netto(c.rocznie))} netto)`;
}

/*
 * Decyzja Dominika 6.11.2026: rabatu na start już nie ma — pierwszy okres kosztuje tyle co odnowienie, a przy pierwszym
 * zakupie klient dostaje darmowe kredyty na autoskalowanie (teksty i kwoty z API: lib/kredyty-startowe.ts).
 */

/** Krótko: cena odnowienia znana z góry. */
export const ODNOWIENIE_Z_CENNIKA = 'cena odnowienia znana z góry';

/** Krótko, do przycisków i nagłówków: „od 45 zł/mies.”. */
export function odCeny(c: CenaPakietu): string {
  return `od ${zl(c.miesiecznie)}/mies.`;
}

/**
 * Znacznik ceny w statycznych treściach z lib (poradniki, funkcje): tekst trzyma `{cena}`, a strona przy
 * renderowaniu wstawia aktualną cenę z API przez zCena(). Dzięki temu treści w lib nie mają kwot na sztywno.
 */
export const ZNACZNIK_CENY = '{cena}';

export function zCena(tekst: string, c: CenaPakietu): string {
  return tekst.split(ZNACZNIK_CENY).join(cenaPakietu(c));
}

/** Koszt godzin dodatkowej mocy (brutto): vCPU (1 = 100% CPU), GB RAM, GB dysku. */
export function kosztMocy(s: StawkiAutoskalowania, vcpu: number, ramGb: number, dyskGb: number, godziny: number): number {
  return (vcpu * 100 * s.cpu + ramGb * s.ram + dyskGb * s.dysk) * godziny;
}

/** Średnia liczba godzin w miesiącu (365 × 24 / 12) — do przeliczeń „za miesiąc” stawek godzinowych. */
export const GODZIN_W_MIESIACU = 730;

// --- Parsowanie odpowiedzi API (eksportowane dla testów i lib/ceny-api.ts) ---

type PlanApi = { slug?: unknown; productKind?: unknown; priceMonthly?: unknown; priceYearly?: unknown; trialDays?: unknown };
type RegulaApi = { resource?: unknown; pricePerUnit?: unknown; isActive?: unknown };

const liczba = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function pakiet(p: PlanApi | undefined): CenaPakietu | null {
  if (!p) return null;
  const m = liczba(p.priceMonthly);
  const r = liczba(p.priceYearly);
  return m !== null && r !== null && m > 0 && r > 0 ? { miesiecznie: m, rocznie: r } : null;
}

/**
 * GET /plans → hosting (slug verris-hosting, albo pierwszy HOSTING), poczta (poczta-standard, albo pierwszy EMAIL)
 * i Kreator Pro (kreator-pro, albo pierwszy KREATOR_PRO).
 */
export function parsujPlany(dane: unknown): {
  hosting: (CenaPakietu & { trialDays: number }) | null;
  poczta: CenaPakietu | null;
  kreatorPro: CenaPakietu | null;
} {
  const lista = Array.isArray(dane) ? (dane as PlanApi[]) : [];
  const hostingPlan = lista.find((p) => p.slug === 'verris-hosting') ?? lista.find((p) => p.productKind === 'HOSTING');
  const pocztaPlan = lista.find((p) => p.slug === 'poczta-standard') ?? lista.find((p) => p.productKind === 'EMAIL');
  const kreatorPlan = lista.find((p) => p.slug === 'kreator-pro') ?? lista.find((p) => p.productKind === 'KREATOR_PRO');
  const h = pakiet(hostingPlan);
  const trial = liczba(hostingPlan?.trialDays);
  return {
    hosting: h ? { ...h, trialDays: trial !== null ? Math.floor(trial) : 0 } : null,
    poczta: pakiet(pocztaPlan),
    kreatorPro: pakiet(kreatorPlan),
  };
}

/** GET /autoscaling/pricing → stawki CPU/RAM/DISK (tylko aktywne reguły; brak którejś → null). */
export function parsujStawki(dane: unknown): StawkiAutoskalowania | null {
  const lista = Array.isArray(dane) ? (dane as RegulaApi[]) : [];
  const z = (zasob: string) => {
    const r = lista.find((x) => x.resource === zasob && x.isActive !== false);
    return r ? liczba(r.pricePerUnit) : null;
  };
  const cpu = z('CPU');
  const ram = z('RAM');
  const dysk = z('DISK');
  return cpu !== null && ram !== null && dysk !== null ? { cpu, ram, dysk } : null;
}

/** Składa ceny z odpowiedzi API; brakujące części biorą wartości zapasowe i oznaczają wynik jako 'zapas'. */
export function zlozCeny(plany: unknown, stawki: unknown): Ceny {
  const p = parsujPlany(plany);
  const s = parsujStawki(stawki);
  return {
    hosting: p.hosting ?? CENY_ZAPASOWE.hosting,
    poczta: p.poczta ?? CENY_ZAPASOWE.poczta,
    kreatorPro: p.kreatorPro ?? CENY_ZAPASOWE.kreatorPro,
    stawki: s ?? CENY_ZAPASOWE.stawki,
    zrodlo: p.hosting && p.poczta && p.kreatorPro && s ? 'api' : 'zapas',
  };
}
