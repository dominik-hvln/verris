/**
 * Beta — „Zgłoś uwagę”: czysta logika (bez fetch i DOM), żeby dało się ją sprawdzić testem.
 * Uwaga trafia do zwykłego systemu zgłoszeń (POST /tickets, temat BETA); do treści dokładamy
 * blok kontekstu, z którego obsługa odtworzy sytuację. Bez query stringa i hasha (tokeny,
 * kody z linków), bez nazw infrastruktury.
 */
import type { FlagaBety } from '@verris/contracts';

export const FLAGA_ZGLOS_UWAGE: FlagaBety = 'beta.zglos-uwage';
export const MIN_ZNAKOW_UWAGI = 10;
export const MAX_ZNAKOW_UWAGI = 5000;

export type RodzajUwagi = 'blad' | 'pomysl' | 'niejasne';
export const RODZAJE_UWAGI: { value: RodzajUwagi; label: string }[] = [
  { value: 'blad', label: 'Błąd' },
  { value: 'pomysl', label: 'Pomysł' },
  { value: 'niejasne', label: 'Niejasne' },
];

/** Flaga bety: tylko jawne `true` z /me/feature-flags (brak flagi albo błąd API = wyłączona). */
export function czyZglosUwageWlaczone(flagi: Record<string, boolean>): boolean {
  return flagi[FLAGA_ZGLOS_UWAGE] === true;
}

/** Komunikat walidacji albo null, gdy tekst można wysłać. */
export function bladUwagi(tekst: string): string | null {
  const n = tekst.trim().length;
  if (n === 0) return 'Opisz, co się stało albo co poprawić.';
  if (n < MIN_ZNAKOW_UWAGI) {
    const brak = MIN_ZNAKOW_UWAGI - n;
    return `Napisz co najmniej ${MIN_ZNAKOW_UWAGI} znaków (brakuje ${brak}).`;
  }
  if (n > MAX_ZNAKOW_UWAGI) return `Uwaga może mieć najwyżej ${MAX_ZNAKOW_UWAGI} znaków.`;
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Długi ciąg bez kropki, który nie jest UUID — wygląda na token (reset hasła, zaproszenie, JWT bez kropek). */
const NA_TOKEN = /^[A-Za-z0-9_~%-]{32,}$/;

/**
 * Ścieżka strony do zgłoszenia: bez query stringa i hasha (tam bywają tokeny i kody z linków),
 * segmenty wyglądające na token zastąpione „[ukryte]”. UUID (usługa, zgłoszenie) zostają — pomagają obsłudze.
 */
export function sciezkaBezTokenow(adres: string): string {
  let sciezka = adres.split(/[?#]/, 1)[0] ?? '';
  // Pełny adres (z hostem) → tylko ścieżka.
  sciezka = sciezka.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const segmenty = sciezka.split('/').map((s) => (s && !UUID.test(s) && NA_TOKEN.test(s) ? '[ukryte]' : s));
  const wynik = segmenty.join('/') || '/';
  return wynik.length > 200 ? `${wynik.slice(0, 200)}…` : wynik;
}

/** User agent w skrócie: „Chrome 141 · Windows”. Nieznany — pierwsze 80 znaków. */
export function skrocUserAgent(ua: string): string {
  const przegladarki: [string, RegExp][] = [
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/],
  ];
  const systemy: [string, RegExp][] = [
    ['Android', /Android/],
    ['iOS', /iPhone|iPad|iPod/],
    ['Windows', /Windows/],
    ['macOS', /Mac OS X|Macintosh/],
    ['ChromeOS', /CrOS/],
    ['Linux', /Linux/],
  ];
  const p = przegladarki.map(([n, re]) => [n, re.exec(ua)?.[1]] as const).find(([, w]) => w);
  const s = systemy.find(([, re]) => re.test(ua))?.[0];
  if (!p && !s) return ua.trim().slice(0, 80) || 'nieznana';
  return [p ? `${p[0]} ${p[1]}` : 'przeglądarka nieznana', s].filter(Boolean).join(' · ');
}

/** Data i godzina w strefie Europe/Warsaw, np. „12.10.2026, 14:03”. */
export function czasWarszawa(teraz: Date): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(teraz);
}

export interface KontekstUwagi {
  /** Adres albo ścieżka strony (przytniemy query i hash). */
  sciezka: string;
  wersjaPanelu: string;
  szerokoscOkna: number;
  userAgent: string;
  teraz: Date;
  rodzaj?: RodzajUwagi | null;
  /** Usługa, gdy klient jest na stronie usługi. */
  usluga?: string | null;
}

export function blokKontekstu(k: KontekstUwagi): string {
  const rodzaj = RODZAJE_UWAGI.find((r) => r.value === k.rodzaj)?.label;
  const wiersze = [
    '---',
    'Kontekst (dodany automatycznie):',
    rodzaj ? `• Rodzaj: ${rodzaj.toLowerCase()}` : null,
    `• Strona: ${sciezkaBezTokenow(k.sciezka)}`,
    k.usluga ? `• Usługa: ${k.usluga}` : null,
    `• Wersja panelu: ${k.wersjaPanelu || 'nieznana'}`,
    `• Szerokość okna: ${Math.round(k.szerokoscOkna)} px`,
    `• Przeglądarka: ${skrocUserAgent(k.userAgent)}`,
    `• Czas: ${czasWarszawa(k.teraz)} (Europe/Warsaw)`,
  ];
  return wiersze.filter((w): w is string => w !== null).join('\n');
}

/** Temat zgłoszenia: „Uwaga z bety: <pierwsze słowa>” (do 60 znaków z tekstu). */
export function tematUwagi(tekst: string): string {
  const jednaLinia = tekst.trim().replace(/\s+/g, ' ');
  const slowa = jednaLinia.split(' ').slice(0, 8).join(' ');
  const skrot = slowa.length > 60 ? `${slowa.slice(0, 60).trimEnd()}…` : slowa;
  return `Uwaga z bety: ${skrot}${skrot !== jednaLinia && !skrot.endsWith('…') ? '…' : ''}`;
}

export function trescUwagi(tekst: string, k: KontekstUwagi): string {
  return `${tekst.trim()}\n\n${blokKontekstu(k)}`;
}

/** Numer zgłoszenia jak w panelu: „#ab12cd34”. */
export const numerZgloszenia = (id: string) => `#${id.slice(0, 8)}`;
