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

/**
 * Przycisk widzi tester (zrealizował kod z zaproszenia — GET /me/beta) bez włączania flagi dla wszystkich;
 * flaga `beta.zglos-uwage` dalej włącza go każdemu klientowi.
 */
export function czyPokazacZglosUwage(flagi: Record<string, boolean>, tester: boolean): boolean {
  return tester || czyZglosUwageWlaczone(flagi);
}

/** Element strony wskazany przez testera — opis dla obsługi (bez wartości pól formularzy). */
export interface OpisElementu {
  /** Np. „przycisk „Zapisz””, „pole „Adres e-mail””. */
  opis: string;
  /** Najbliższy nagłówek sekcji albo strony. */
  sekcja: string | null;
  /** Ścieżka w drzewie strony (do znalezienia elementu w narzędziach przeglądarki). */
  selektor: string;
  /** Położenie w oknie w chwili wskazania (px). */
  ramka: { x: number; y: number; szer: number; wys: number };
  okno: { szer: number; wys: number };
}

const RODZAJ_ELEMENTU: Record<string, string> = {
  button: 'przycisk',
  a: 'link',
  input: 'pole',
  textarea: 'pole',
  select: 'lista wyboru',
  img: 'obraz',
  svg: 'ikona',
  label: 'etykieta',
  h1: 'nagłówek',
  h2: 'nagłówek',
  h3: 'nagłówek',
  h4: 'nagłówek',
  table: 'tabela',
  tr: 'wiersz tabeli',
  td: 'komórka tabeli',
  th: 'nagłówek tabeli',
  li: 'pozycja listy',
  p: 'tekst',
  span: 'tekst',
  nav: 'menu',
  form: 'formularz',
};
const RODZAJ_ROLI: Record<string, string> = {
  button: 'przycisk',
  link: 'link',
  tab: 'zakładka',
  switch: 'przełącznik',
  checkbox: 'pole wyboru',
  combobox: 'lista wyboru',
  dialog: 'okno',
  menuitem: 'pozycja menu',
};

const jednaLinia = (t: string | null | undefined, max = 60): string => {
  const s = (t ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
};

/** Nazwa elementu jak dla czytnika ekranu — dla pól etykieta, nigdy wpisana wartość (hasła, dane). */
function nazwaElementu(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return jednaLinia(aria);
  const ref = el.getAttribute('aria-labelledby');
  if (ref) {
    const t = ref
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (jednaLinia(t)) return jednaLinia(t);
  }
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const id = el.getAttribute('id');
    const etykieta =
      (id ? [...el.ownerDocument.querySelectorAll('label')].find((l) => l.htmlFor === id) : null) ?? el.closest('label');
    if (etykieta?.textContent && jednaLinia(etykieta.textContent)) return jednaLinia(etykieta.textContent);
    return jednaLinia(el.getAttribute('placeholder') ?? el.getAttribute('name') ?? '');
  }
  const alt = el.getAttribute('alt') ?? el.getAttribute('title');
  if (alt) return jednaLinia(alt);
  // Tekst elementu bez zawartości pól formularzy (textContent nie obejmuje wartości inputów).
  return jednaLinia(el.textContent);
}

/** Najbliższy nagłówek: w obrębie sekcji/karty nad elementem, a gdy go nie ma — nagłówek strony. */
function sekcjaElementu(el: Element): string | null {
  for (let a: Element | null = el; a && a !== el.ownerDocument.body; a = a.parentElement) {
    const h = a.matches('h1,h2,h3,h4') ? a : a.querySelector('h1,h2,h3,h4');
    if (h && jednaLinia(h.textContent)) return jednaLinia(h.textContent);
  }
  const h1 = el.ownerDocument.querySelector('h1');
  return h1 && jednaLinia(h1.textContent) ? jednaLinia(h1.textContent) : null;
}

/** id z React useId („:r1:”, „«r1»”) zmienia się między renderami — nie nadaje się do selektora. */
const ID_STALE = /^[A-Za-z][\w-]*$/;

/** Ścieżka do elementu: do 6 poziomów, tag + :nth-of-type; stałe id kończy ścieżkę. */
export function selektorElementu(el: Element): string {
  const czesci: string[] = [];
  for (let a: Element | null = el; a && czesci.length < 6; a = a.parentElement) {
    const tag = a.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') break;
    const id = a.getAttribute('id');
    if (id && ID_STALE.test(id)) {
      czesci.unshift(`${tag}#${id}`);
      break;
    }
    const rodzenstwo = a.parentElement ? [...a.parentElement.children].filter((c) => c.tagName === a!.tagName) : [];
    czesci.unshift(rodzenstwo.length > 1 ? `${tag}:nth-of-type(${rodzenstwo.indexOf(a) + 1})` : tag);
  }
  return czesci.join(' > ');
}

export function opisElementu(el: Element, okno: { szer: number; wys: number }): OpisElementu {
  // Ikona w przycisku albo linku — opisujemy przycisk/link, nie samą ikonę.
  // Pole formularza w <label> zostaje polem.
  const cel = el.matches('input,textarea,select')
    ? el
    : (el.closest('button,a,[role="button"],[role="link"],[role="tab"],[role="menuitem"],label') ?? el);
  const tag = cel.tagName.toLowerCase();
  const rola = cel.getAttribute('role');
  const rodzaj = (rola && RODZAJ_ROLI[rola]) || RODZAJ_ELEMENTU[tag] || 'element';
  const nazwa = nazwaElementu(cel);
  const r = cel.getBoundingClientRect();
  return {
    opis: nazwa ? `${rodzaj} „${nazwa}”` : rodzaj,
    sekcja: sekcjaElementu(cel),
    selektor: selektorElementu(cel),
    ramka: { x: Math.round(r.left), y: Math.round(r.top), szer: Math.round(r.width), wys: Math.round(r.height) },
    okno: { szer: Math.round(okno.szer), wys: Math.round(okno.wys) },
  };
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
  /** Element wskazany na stronie. */
  element?: OpisElementu | null;
  /** Do zgłoszenia dołączony zrzut ekranu (z zaznaczonym elementem, jeśli wskazany). */
  zrzut?: boolean;
}

export function blokKontekstu(k: KontekstUwagi): string {
  const rodzaj = RODZAJE_UWAGI.find((r) => r.value === k.rodzaj)?.label;
  const wiersze = [
    '---',
    'Kontekst (dodany automatycznie):',
    rodzaj ? `• Rodzaj: ${rodzaj.toLowerCase()}` : null,
    `• Strona: ${sciezkaBezTokenow(k.sciezka)}`,
    k.usluga ? `• Usługa: ${k.usluga}` : null,
    k.element ? `• Wskazany element: ${k.element.opis}${k.element.sekcja ? ` (sekcja „${k.element.sekcja}”)` : ''}` : null,
    k.element
      ? `• Położenie: x ${k.element.ramka.x}, y ${k.element.ramka.y}, ${k.element.ramka.szer}×${k.element.ramka.wys} px w oknie ${k.element.okno.szer}×${k.element.okno.wys} px`
      : null,
    k.element ? `• Selektor: ${k.element.selektor}` : null,
    k.zrzut ? `• Zrzut ekranu: w załączniku${k.element ? ' (element zaznaczony ramką)' : ''}` : null,
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
