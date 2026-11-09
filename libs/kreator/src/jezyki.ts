import type { Podstrona, Strona } from './model.ts';

/**
 * Wersje językowe strony (paczka 124, Kreator Pro). Wersja językowa to zwykłe podstrony z prefiksem adresu
 * `<język>/…` (strona główna wersji angielskiej = `en`), połączone z oryginałem wspólnym `klucz`em. Moduł czysty,
 * bez renderera – trafia też do przeglądarki (`@verris/kreator/klient`).
 *
 *  - `Podstrona.jezyk` – język podstrony; brak = wynika z prefiksu adresu (język z `jezykiDodatkowe`), inaczej język strony;
 *  - `Podstrona.klucz` – identyfikator wspólny tłumaczeń tej samej podstrony; brak = adres bez prefiksu języka
 *    (tłumaczenie z przetłumaczonym adresem, np. `en/hair-salon-poznan`, musi mieć klucz oryginału);
 *  - `Podstrona.tlumaczenie.zrodlo` – skrót treści oryginału w chwili tłumaczenia (nieaktualne tłumaczenie = inny skrót).
 */
export const JEZYKI = ['pl', 'en', 'de', 'uk'] as const;
export type Jezyk = (typeof JEZYKI)[number];
export const JEZYKI_DODATKOWE = ['en', 'de', 'uk'] as const;
export type JezykDodatkowy = (typeof JEZYKI_DODATKOWE)[number];

/** Nazwy języków w ich własnym języku – przełącznik języka na stronie. */
export const NAZWY_JEZYKOW: Record<Jezyk, string> = { pl: 'Polski', en: 'English', de: 'Deutsch', uk: 'Українська' };
/** Nazwy po polsku (panel), w mianowniku. */
export const NAZWY_JEZYKOW_PL: Record<Jezyk, string> = { pl: 'polski', en: 'angielski', de: 'niemiecki', uk: 'ukraiński' };
/** Krótkie etykiety (panel, przełącznik na stronie). Ukraiński jako „UA” – „UK” myli się z Wielką Brytanią. */
export const SKROTY_JEZYKOW: Record<Jezyk, string> = { pl: 'PL', en: 'EN', de: 'DE', uk: 'UA' };

/** Pola języków strony; brak (model sprzed walidacji, np. dane testowe edytora) = 'pl' bez języków dodatkowych. */
type StronaJezykow = Partial<Pick<Strona, 'jezyk' | 'jezykiDodatkowe'>>;
export const jezykGlowny = (s: StronaJezykow): Jezyk => s.jezyk ?? 'pl';
const glowny = jezykGlowny;
const dodatkowe = (s: StronaJezykow): JezykDodatkowy[] => s.jezykiDodatkowe ?? [];
type PodstronaJezyka = Pick<Podstrona, 'slug'> & { jezyk?: Jezyk; klucz?: string };

/** Języki strony: główny, potem dodatkowe (bez powtórzeń). */
export function jezykiStrony(s: StronaJezykow): Jezyk[] {
  return [...new Set<Jezyk>([glowny(s), ...dodatkowe(s)])];
}

/** Język dodatkowy z prefiksu adresu (`en`, `en/oferta`) albo null. */
export function prefiksJezyka(s: StronaJezykow, slug: string): JezykDodatkowy | null {
  const pierwszy = slug.split('/')[0];
  return (dodatkowe(s) as string[]).includes(pierwszy) && pierwszy !== glowny(s) ? (pierwszy as JezykDodatkowy) : null;
}

export function jezykPodstrony(s: StronaJezykow, p: PodstronaJezyka): Jezyk {
  return p.jezyk ?? prefiksJezyka(s, p.slug) ?? glowny(s);
}

/** Adres podstrony bez prefiksu jej języka: `en/oferta` → `oferta`, `en` → ''. */
export function slugBezJezyka(s: StronaJezykow, p: PodstronaJezyka): string {
  const j = jezykPodstrony(s, p);
  if (j === glowny(s)) return p.slug;
  if (p.slug === j) return '';
  return p.slug.startsWith(`${j}/`) ? p.slug.slice(j.length + 1) : p.slug;
}

export function kluczPodstrony(s: StronaJezykow, p: PodstronaJezyka): string {
  return p.klucz ?? slugBezJezyka(s, p);
}

/** Adres strony głównej w języku (`''` dla głównego, `en` dla angielskiego). */
export function slugGlownej(s: StronaJezykow, jezyk: Jezyk): string {
  return jezyk === glowny(s) ? '' : jezyk;
}

/** Pełny adres podstrony w języku z adresu bez prefiksu. */
export function slugWJezyku(s: StronaJezykow, jezyk: Jezyk, sciezka: string): string {
  if (jezyk === glowny(s)) return sciezka;
  return sciezka ? `${jezyk}/${sciezka}` : jezyk;
}

export function podstronyWJezyku<P extends PodstronaJezyka>(s: StronaJezykow & { strony: P[] }, jezyk: Jezyk): P[] {
  return s.strony.filter((p) => jezykPodstrony(s, p) === jezyk);
}

/** Wszystkie wersje językowe podstrony (ta sama wartość klucza), w kolejności języków strony. */
export function wersjeJezykowe<P extends PodstronaJezyka>(s: StronaJezykow & { strony: P[] }, p: PodstronaJezyka): { jezyk: Jezyk; podstrona: P }[] {
  const klucz = kluczPodstrony(s, p);
  const wynik: { jezyk: Jezyk; podstrona: P }[] = [];
  for (const j of jezykiStrony(s)) {
    const x = s.strony.find((q) => jezykPodstrony(s, q) === j && kluczPodstrony(s, q) === klucz);
    if (x) wynik.push({ jezyk: j, podstrona: x });
  }
  return wynik;
}

/** Oryginał (podstrona w języku głównym o tym samym kluczu) tłumaczenia albo null. */
export function oryginalPodstrony<P extends PodstronaJezyka>(s: StronaJezykow & { strony: P[] }, p: PodstronaJezyka): P | null {
  if (jezykPodstrony(s, p) === glowny(s)) return null;
  const klucz = kluczPodstrony(s, p);
  return s.strony.find((q) => jezykPodstrony(s, q) === glowny(s) && kluczPodstrony(s, q) === klucz) ?? null;
}

/** JSON z kluczami w stałej kolejności (bez `undefined`) – skrót nie zależy od kolejności pól z edytora. */
function kanoniczny(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(kanoniczny).join(',')}]`;
  if (x && typeof x === 'object') {
    const wpisy = Object.entries(x as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${wpisy.map(([k, v]) => `${JSON.stringify(k)}:${kanoniczny(v)}`).join(',')}}`;
  }
  return JSON.stringify(x) ?? 'null';
}

/**
 * Skrót treści podstrony (tytuł, SEO, sekcje) do wykrywania nieaktualnych tłumaczeń – FNV-1a 64-bit jako 16 znaków hex.
 * Nie kryptograficzny: wystarczy, że zmiana treści oryginału zmienia skrót. Działa tak samo w API i w przeglądarce.
 */
export function skrotTresci(p: Pick<Podstrona, 'tytul' | 'seo' | 'sekcje'>): string {
  const t = kanoniczny({ tytul: p.tytul, seo: p.seo, sekcje: p.sekcje });
  let h = 0xcbf29ce484222325n;
  const mnoznik = 0x100000001b3n;
  const maska = 0xffffffffffffffffn;
  for (const bajt of new TextEncoder().encode(t)) {
    h ^= BigInt(bajt);
    h = (h * mnoznik) & maska;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * Czy tłumaczenie może być nieaktualne: oryginał zmienił się od tłumaczenia (inny skrót treści). Podstrona bez
 * zapisanego skrótu (dopisana ręcznie) i podstrona bez oryginału – nie oznaczamy.
 */
export function tlumaczenieNieaktualne(s: StronaJezykow & { strony: Podstrona[] }, p: Podstrona): boolean {
  if (!p.tlumaczenie) return false;
  const o = oryginalPodstrony(s, p);
  return !!o && skrotTresci(o) !== p.tlumaczenie.zrodlo;
}

/**
 * Podstrona w języku `jezyk` z oryginału: adres z prefiksem języka (albo przetłumaczony – `sciezka`), wspólny klucz,
 * skrót treści oryginału. Bez `tresc` – kopia treści oryginału („Skopiuj bez tłumaczenia”).
 */
export function podstronaWJezyku(
  s: StronaJezykow,
  oryginal: Podstrona,
  jezyk: JezykDodatkowy,
  tresc?: Pick<Podstrona, 'tytul' | 'seo' | 'sekcje'> & { sciezka?: string },
  data?: string,
): Podstrona {
  const klucz = kluczPodstrony(s, oryginal);
  const zrodlo = tresc ?? oryginal;
  const sciezka = klucz === '' ? '' : (tresc?.sciezka ?? klucz);
  return {
    slug: slugWJezyku(s, jezyk, sciezka),
    jezyk,
    klucz,
    tytul: zrodlo.tytul,
    seo: structuredClone(zrodlo.seo),
    sekcje: structuredClone(zrodlo.sekcje),
    tlumaczenie: { zrodlo: skrotTresci(oryginal), ...(data ? { data } : {}) },
  };
}

/**
 * Wstawia (albo podmienia – ten sam język i klucz) podstrony wersji językowej i dopisuje język do `jezykiDodatkowe`.
 * Kolejność: podstrony języka głównego, potem każdy język dodatkowy w kolejności oryginałów. Czysta funkcja.
 */
export function wstawWersjeJezykowa<S extends Strona>(strona: S, jezyk: JezykDodatkowy, nowe: Podstrona[]): S {
  const kopia = structuredClone(strona);
  if (!kopia.jezykiDodatkowe.includes(jezyk) && jezyk !== kopia.jezyk) kopia.jezykiDodatkowe = [...kopia.jezykiDodatkowe, jezyk];
  const klucze = new Set(nowe.map((p) => kluczPodstrony(kopia, p)));
  const pozostale = kopia.strony.filter((p) => !(jezykPodstrony(kopia, p) === jezyk && klucze.has(kluczPodstrony(kopia, p))));
  const wszystkie = [...pozostale, ...structuredClone(nowe)];
  const kolejnosc = new Map(podstronyWJezyku(kopia, kopia.jezyk).map((p, i) => [kluczPodstrony(kopia, p), i] as const));
  const jezyki = jezykiStrony(kopia);
  const miejsce = (p: Podstrona) => [jezyki.indexOf(jezykPodstrony(kopia, p)), kolejnosc.get(kluczPodstrony(kopia, p)) ?? Number.MAX_SAFE_INTEGER] as const;
  kopia.strony = wszystkie
    .map((p, i) => ({ p, i, m: miejsce(p) }))
    .sort((a, b) => a.m[0] - b.m[0] || a.m[1] - b.m[1] || a.i - b.i)
    .map((x) => x.p);
  return kopia;
}

/** Usuwa wersję językową (wszystkie jej podstrony, tłumaczenie stopki) i język z `jezykiDodatkowe`. Czysta funkcja. */
export function usunWersjeJezykowa<S extends Strona>(strona: S, jezyk: JezykDodatkowy): S {
  const kopia = structuredClone(strona);
  kopia.strony = kopia.strony.filter((p) => jezykPodstrony(kopia, p) !== jezyk);
  kopia.jezykiDodatkowe = kopia.jezykiDodatkowe.filter((j) => j !== jezyk);
  if (kopia.stopka.tlumaczenia) {
    delete kopia.stopka.tlumaczenia[jezyk];
    if (!Object.keys(kopia.stopka.tlumaczenia).length) delete kopia.stopka.tlumaczenia;
  }
  return kopia;
}
