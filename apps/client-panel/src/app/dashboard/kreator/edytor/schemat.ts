import { Sekcja, Strona, sprawdzSpojnosc, type TypSekcji } from '@verris/kreator/klient';
import { plForm } from '@/lib/pl';

/**
 * Formularz sekcji generowany z TYPU sekcji: edytor czyta schemat zod sekcji z @verris/kreator (model.ts) i z niego
 * buduje pola (tekst, długi tekst, liczba, przełącznik, wybór, lista pozycji, obraz, przycisk). Nowe pole w modelu =
 * nowe pole w edytorze bez zmian tutaj (najwyżej etykieta w ETYKIETY). Tu też: wartości domyślne nowych pozycji
 * i nowych sekcji oraz polskie komunikaty walidacji przypięte do ścieżki pola.
 */

// Minimalny widok wnętrza schematów zod 4 (def.type, innerType, shape, element, checks) – tylko to, czego używamy.
interface DefZod {
  type: string;
  innerType?: SchematZod;
  shape?: Record<string, SchematZod>;
  element?: SchematZod;
  entries?: Record<string, string>;
  values?: unknown[];
  defaultValue?: unknown;
  checks?: { _zod: { def: { check: string; maximum?: number; minimum?: number; value?: number; inclusive?: boolean } } }[];
}
interface SchematZod {
  def: DefZod;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  isInt?: boolean;
}

export type OpisPola =
  | { rodzaj: 'tekst'; max: number | null; wymagane: boolean; dlugi: boolean; data: boolean }
  | { rodzaj: 'liczba'; min: number | null; max: number | null; calkowita: boolean; pustaDozwolona: boolean }
  | { rodzaj: 'logiczne' }
  | { rodzaj: 'wybor'; opcje: string[] }
  | { rodzaj: 'wybory'; opcje: string[]; max: number | null }
  | { rodzaj: 'lista'; element: OpisPola; min: number; max: number | null }
  | { rodzaj: 'obraz' }
  | { rodzaj: 'przycisk' }
  | { rodzaj: 'obiekt'; pola: PoleObiektu[] };

export interface PoleObiektu {
  klucz: string;
  opis: OpisPola;
  /** Klucz można pominąć (optional/default) albo dać null (nullable). */
  opcjonalne: boolean;
  /** Klucz wymagany w modelu, choć wartość może być null (np. cena „wycena indywidualna”). */
  wymaganyKlucz?: boolean;
  domyslna?: unknown;
}

/** Pola, których klient nie edytuje w tej paczce (techniczne albo wypełniane przy uploadzie zdjęć / imporcie). */
const UKRYTE = new Set(['ikona', 'zrodloUrl', 'opisDoWyszukania', 'zrodlo', 'autor', 'licencjaUrl', 'typSchema']);

export const ETYKIETY: Record<string, string> = {
  nadtytul: 'Nadtytuł',
  naglowek: 'Nagłówek',
  wyroznienie: 'Wyróżniony fragment nagłówka',
  podtytul: 'Podtytuł',
  przyciski: 'Przyciski',
  przycisk: 'Przycisk',
  obraz: 'Zdjęcie',
  obrazy: 'Zdjęcia',
  fakty: 'Krótkie fakty',
  etykieta: 'Etykieta',
  wartosc: 'Wartość',
  wstep: 'Wstęp',
  pozycje: 'Pozycje',
  tytul: 'Tytuł',
  opis: 'Opis',
  cena: 'Cena (tekstem, np. „od 90 zł”)',
  pakiety: 'Pakiety',
  nazwa: 'Nazwa',
  cenaBrutto: 'Cena brutto (zł)',
  cenaNetto: 'Cena netto (zł)',
  okres: 'Okres',
  cechy: 'Cechy pakietu',
  wyrozniony: 'Wyróżniony pakiet',
  uwaga: 'Uwaga pod cennikiem',
  osoby: 'Osoby',
  imie: 'Imię i nazwisko',
  rola: 'Rola',
  wpisy: 'Wpisy',
  tresc: 'Treść',
  data: 'Data',
  pytania: 'Pytania',
  pytanie: 'Pytanie',
  odpowiedz: 'Odpowiedź',
  kroki: 'Kroki',
  czas: 'Czas trwania',
  akapity: 'Akapity',
  wyrozniki: 'Wyróżniki',
  formularz: 'Formularz kontaktowy',
  pola: 'Pola formularza',
  mapa: 'Mapa dojazdu',
  tekst: 'Tekst',
  produkty: 'Produkty',
  dostepnosc: 'Dostępność',
  sku: 'Kod produktu (SKU)',
  lead: 'Zajawka',
  czasCzytania: 'Czas czytania (min)',
  slug: 'Adres wpisu',
  alt: 'Opis zdjęcia dla niewidomych (alt)',
  podpis: 'Podpis na ramce zdjęcia',
  proporcje: 'Proporcje',
  cel: 'Dokąd prowadzi',
  styl: 'Wygląd',
  // Dane firmy (zakładka „Firma i SEO” – ten sam generator pól na schemacie Firma)
  branza: 'Branża',
  opisKrotki: 'Krótki opis firmy',
  adres: 'Adres',
  ulica: 'Ulica i numer',
  kod: 'Kod pocztowy',
  miasto: 'Miasto',
  obszar: 'Obszar działania',
  telefon: 'Telefon',
  email: 'E-mail',
  godziny: 'Godziny otwarcia',
  dni: 'Dni',
  od: 'Od (GG:MM)',
  do: 'Do (GG:MM)',
  nip: 'NIP',
  social: 'Media społecznościowe',
  typ: 'Serwis',
  url: 'Adres profilu (https://…)',
};

/** Nazwa jednej pozycji listy („Dodaj pozycję”, „Pozycja 2”). */
export const POZYCJA_LISTY: Record<string, string> = {
  pozycje: 'pozycję',
  pakiety: 'pakiet',
  osoby: 'osobę',
  wpisy: 'wpis',
  pytania: 'pytanie',
  kroki: 'krok',
  akapity: 'akapit',
  wyrozniki: 'wyróżnik',
  cechy: 'cechę',
  produkty: 'produkt',
  obrazy: 'zdjęcie',
  fakty: 'fakt',
  przyciski: 'przycisk',
  godziny: 'godziny',
  social: 'profil',
};

/** Etykiety wartości wyborów (enum) – reszta pokazuje się tak, jak jest w modelu. */
export const ETYKIETY_WYBOROW: Record<string, string> = {
  glowny: 'Główny (pełny)',
  drugi: 'Drugi (obrys)',
  jednorazowo: 'Jednorazowo',
  miesiac: 'Miesięcznie',
  rok: 'Rocznie',
  od: 'Cena „od”',
  reczne: 'Wpisane ręcznie',
  google: 'Z wizytówki Google',
  imie: 'Imię',
  email: 'E-mail',
  telefon: 'Telefon',
  wiadomosc: 'Wiadomość',
  termin: 'Preferowany termin',
  usluga: 'Usługa',
  firma: 'Firma',
  dostepny: 'Dostępny',
  ostatnie: 'Ostatnie sztuki',
  niedostepny: 'Niedostępny',
  'na-zamowienie': 'Na zamówienie',
  pn: 'Pon.',
  wt: 'Wt.',
  sr: 'Śr.',
  cz: 'Czw.',
  pt: 'Pt.',
  so: 'Sob.',
  nd: 'Niedz.',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X',
  pinterest: 'Pinterest',
};

function rozpakuj(s: SchematZod): { s: SchematZod; opcjonalne: boolean; nullable: boolean; domyslna?: unknown } {
  let opcjonalne = false;
  let nullable = false;
  let domyslna: unknown;
  let biezacy = s;
  for (let i = 0; i < 6; i++) {
    const t = biezacy.def.type;
    if (t === 'optional') opcjonalne = true;
    else if (t === 'nullable') nullable = true;
    else if (t === 'default') {
      opcjonalne = true;
      domyslna = biezacy.def.defaultValue;
    } else break;
    biezacy = biezacy.def.innerType as SchematZod;
  }
  return { s: biezacy, opcjonalne, nullable, ...(domyslna !== undefined ? { domyslna } : {}) };
}

const sprawdzenie = (s: SchematZod, rodzaj: string, pole: 'maximum' | 'minimum') =>
  s.def.checks?.map((c) => c._zod.def).find((d) => d.check === rodzaj)?.[pole] ?? null;

const czyObraz = (s: SchematZod) => s.def.type === 'object' && !!s.def.shape && 'alt' in s.def.shape && 'proporcje' in s.def.shape;
const czyPrzycisk = (s: SchematZod) => s.def.type === 'object' && !!s.def.shape && 'etykieta' in s.def.shape && 'cel' in s.def.shape;

/** Opis pola z schematu zod (bez wrapperów optional/default/nullable, które oddaje `rozpakuj`). */
export function opiszSchemat(wejscie: SchematZod, klucz = ''): OpisPola {
  const { s, nullable } = rozpakuj(wejscie);
  const t = s.def.type;
  if (czyObraz(s)) return { rodzaj: 'obraz' };
  if (czyPrzycisk(s)) return { rodzaj: 'przycisk' };
  if (t === 'string') {
    const max = s.maxLength ?? null;
    const data = /^data$/.test(klucz) && (s.def.checks ?? []).some((c) => c._zod.def.check === 'string_format');
    return { rodzaj: 'tekst', max, wymagane: (s.minLength ?? 0) > 0, dlugi: max !== null && max > 160, data };
  }
  if (t === 'number') {
    return { rodzaj: 'liczba', min: s.minValue ?? null, max: s.maxValue ?? null, calkowita: !!s.isInt, pustaDozwolona: nullable };
  }
  if (t === 'boolean') return { rodzaj: 'logiczne' };
  if (t === 'enum') return { rodzaj: 'wybor', opcje: Object.values(s.def.entries ?? {}) };
  if (t === 'array' && s.def.element) {
    const el = rozpakuj(s.def.element).s;
    const max = sprawdzenie(s, 'max_length', 'maximum');
    if (el.def.type === 'enum') return { rodzaj: 'wybory', opcje: Object.values(el.def.entries ?? {}), max };
    return { rodzaj: 'lista', element: opiszSchemat(s.def.element, klucz), min: sprawdzenie(s, 'min_length', 'minimum') ?? 0, max };
  }
  if (t === 'object' && s.def.shape) {
    const pola: PoleObiektu[] = [];
    for (const [k, v] of Object.entries(s.def.shape)) {
      if (UKRYTE.has(k)) continue;
      const r = rozpakuj(v);
      pola.push({
        klucz: k,
        opis: opiszSchemat(v, k),
        opcjonalne: r.opcjonalne || r.nullable,
        ...(r.nullable && !r.opcjonalne ? { wymaganyKlucz: true } : {}),
        ...(r.domyslna !== undefined ? { domyslna: r.domyslna } : {}),
      });
    }
    return { rodzaj: 'obiekt', pola };
  }
  return { rodzaj: 'tekst', max: null, wymagane: false, dlugi: false, data: false };
}

const SCHEMATY_SEKCJI = new Map<TypSekcji, SchematZod>(
  ((Sekcja as unknown as { options: SchematZod[] }).options ?? []).map((o) => [o.def.shape!.typ!.def.values![0] as TypSekcji, o]),
);

/** Pola danych sekcji danego typu (to, co edytor pokazuje w zakładce „Sekcja”). */
export function polaSekcji(typ: TypSekcji): PoleObiektu[] {
  const s = SCHEMATY_SEKCJI.get(typ);
  const dane = s?.def.shape?.dane;
  if (!dane) return [];
  const opis = opiszSchemat(dane);
  return opis.rodzaj === 'obiekt' ? opis.pola : [];
}

export const NAZWY_SEKCJI: Record<TypSekcji, string> = {
  hero: 'Nagłówek strony',
  oferta: 'Oferta',
  cennik: 'Cennik',
  galeria: 'Galeria',
  zespol: 'Zespół',
  opinie: 'Opinie',
  faq: 'Pytania i odpowiedzi',
  kroki: 'Jak to działa',
  onas: 'O nas',
  kontakt: 'Kontakt',
  cta: 'Wezwanie do działania',
  produkty: 'Produkty',
  blog: 'Blog',
};

export const OPISY_SEKCJI: Record<TypSekcji, string> = {
  hero: 'Pierwszy ekran: nagłówek, krótki opis i najważniejszy przycisk.',
  oferta: 'Usługi albo produkty z krótkim opisem i ceną, jeśli ją podasz.',
  cennik: 'Pakiety z cenami brutto, opisem i listą cech.',
  galeria: 'Zdjęcia realizacji, wnętrza albo produktów.',
  zespol: 'Osoby, które klient spotka – imię, rola i kilka słów.',
  opinie: 'Opinie klientów – wpisujesz je Ty, AI ich nie wymyśla.',
  faq: 'Odpowiedzi na pytania, które klienci zadają najczęściej.',
  kroki: 'Jak wygląda współpraca – od kontaktu do efektu.',
  onas: 'Historia firmy, podejście i to, co Was wyróżnia.',
  kontakt: 'Formularz, dane kontaktowe i mapa dojazdu.',
  cta: 'Krótki pas z zaproszeniem do kontaktu albo zakupu.',
  produkty: 'Katalog produktów z ceną i przyciskiem zakupu.',
  blog: 'Zajawki wpisów bloga z datą i czasem czytania.',
};

const NAGLOWKI_NOWYCH: Partial<Record<TypSekcji, string>> = {
  oferta: 'Oferta',
  cennik: 'Cennik',
  galeria: 'Galeria',
  zespol: 'Zespół',
  opinie: 'Opinie klientów',
  faq: 'Najczęstsze pytania',
  kroki: 'Jak to działa',
  onas: 'O nas',
  kontakt: 'Kontakt',
  cta: 'Porozmawiajmy',
  produkty: 'Produkty',
  blog: 'Blog',
};

const dzisIso = () => new Date().toISOString().slice(0, 10);

/**
 * Wartość nowego pola/pozycji: wymagane teksty dostają widoczny znacznik do uzupełnienia („[Tytuł]”, jak w makiecie),
 * nie wymyśloną treść – AI i edytor nie podają danych za klienta.
 */
export function wartoscDomyslna(opis: OpisPola, klucz: string, ctx: { naglowek?: string } = {}): unknown {
  switch (opis.rodzaj) {
    case 'tekst':
      if (!opis.wymagane) return opis.data ? dzisIso() : undefined;
      if (klucz === 'naglowek' && ctx.naglowek) return ctx.naglowek;
      if (klucz === 'cel') return '#kontakt';
      if (klucz === 'slug') return 'nowy-wpis';
      if (opis.data) return dzisIso();
      return `[${(ETYKIETY[klucz] ?? klucz).replace(/\s*\(.*\)$/, '')}]`;
    case 'liczba':
      return opis.pustaDozwolona ? null : Math.max(0, opis.min ?? 0);
    case 'logiczne':
      return false;
    case 'wybor':
      return opis.opcje[0];
    case 'wybory':
      return [];
    case 'lista':
      return Array.from({ length: opis.min }, () => wartoscDomyslna(opis.element, klucz, ctx));
    case 'obraz':
      return { alt: '', zrodlo: 'placeholder', proporcje: '4:3' };
    case 'przycisk':
      return { etykieta: 'Skontaktuj się', cel: '#kontakt', styl: 'glowny' };
    case 'obiekt': {
      const wynik: Record<string, unknown> = {};
      for (const p of opis.pola) {
        if (p.domyslna !== undefined) wynik[p.klucz] = structuredClone(p.domyslna);
        else if (!p.opcjonalne || p.wymaganyKlucz) wynik[p.klucz] = wartoscDomyslna(p.opis, p.klucz, ctx);
      }
      return wynik;
    }
  }
}

/** Nowa sekcja danego typu z unikalnym id na podstronie i pierwszym wariantem (darmowym, gdy jest). */
export function nowaSekcja(typ: TypSekcji, wariant: string, zajeteId: Set<string>): Sekcja {
  let n = 1;
  let id: string = typ;
  while (zajeteId.has(id)) id = `${typ}-${++n}`;
  const dane = wartoscDomyslna({ rodzaj: 'obiekt', pola: polaSekcji(typ) }, '', { naglowek: NAGLOWKI_NOWYCH[typ] ?? 'Nowa sekcja' });
  return { id, typ, wariant, tlo: 'domyslne', ukryta: false, dane } as unknown as Sekcja;
}

// ---------------------------------------------------------------------------
// Walidacja z komunikatami po polsku, przypiętymi do ścieżki pola
// ---------------------------------------------------------------------------

interface ProblemZod {
  code: string;
  path: (string | number)[];
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
}

function komunikat(p: ProblemZod): string {
  const min = Number(p.minimum ?? 0);
  const max = Number(p.maximum ?? 0);
  if (p.code === 'too_small') {
    if (p.origin === 'string') return min <= 1 ? 'Uzupełnij to pole.' : `Wpisz co najmniej ${min} ${plForm(min, 'znak', 'znaki', 'znaków')}.`;
    if (p.origin === 'array') return `Dodaj co najmniej ${min} ${plForm(min, 'pozycję', 'pozycje', 'pozycji')}.`;
    return `Najmniejsza wartość to ${min}.`;
  }
  if (p.code === 'too_big') {
    if (p.origin === 'string') return `Najwyżej ${max} ${plForm(max, 'znak', 'znaki', 'znaków')} – skróć tekst.`;
    if (p.origin === 'array') return `Najwyżej ${max} ${plForm(max, 'pozycja', 'pozycje', 'pozycji')}.`;
    return `Największa wartość to ${max.toLocaleString('pl-PL')}.`;
  }
  // Własne komunikaty schematu są po polsku („Niedozwolony adres linku”); domyślne zod – po angielsku.
  if (/[ąćęłńóśźż]|Niedozwolon|Adres/i.test(p.message)) return p.message;
  if (p.code === 'invalid_format') return 'Nieprawidłowy format.';
  if (p.code === 'invalid_type' && p.path.length) return 'Uzupełnij to pole.';
  return 'Nieprawidłowa wartość.';
}

export interface WynikWalidacjiEdytora {
  ok: boolean;
  /** Ścieżka pola („strony.0.sekcje.2.dane.naglowek”) → komunikat. */
  bledy: Map<string, string>;
}

/** Walidacja modelu w edytorze: ten sam schemat i te same reguły spójności co API (walidujStrone). */
export function walidujWEdytorze(model: unknown): WynikWalidacjiEdytora {
  const bledy = new Map<string, string>();
  const w = Strona.safeParse(model);
  if (!w.success) {
    for (const p of w.error.issues as unknown as ProblemZod[]) {
      const sciezka = p.path.join('.');
      if (!bledy.has(sciezka)) bledy.set(sciezka, komunikat(p));
    }
    return { ok: false, bledy };
  }
  for (const b of sprawdzSpojnosc(w.data)) {
    const i = b.indexOf(': ');
    bledy.set(i > 0 ? b.slice(0, i) : '', i > 0 ? b.slice(i + 2) : b);
  }
  return { ok: bledy.size === 0, bledy };
}

/** Pierwszy błąd pod daną ścieżką (np. całej sekcji – do kropki przy liście sekcji). */
export function bladPod(bledy: Map<string, string>, prefiks: string): string | null {
  for (const [k, v] of bledy) if (k === prefiks || k.startsWith(`${prefiks}.`)) return v;
  return null;
}

// ---------------------------------------------------------------------------
// Niemutujące zmiany modelu
// ---------------------------------------------------------------------------

export type Sciezka = (string | number)[];

export function pobierz(obj: unknown, sciezka: Sciezka): unknown {
  let x: unknown = obj;
  for (const k of sciezka) {
    if (x === null || typeof x !== 'object') return undefined;
    x = (x as Record<string | number, unknown>)[k];
  }
  return x;
}

/** Kopia z nową wartością pod ścieżką; `undefined` usuwa klucz obiektu (pole opcjonalne wyczyszczone). */
export function ustaw<T>(obj: T, sciezka: Sciezka, wartosc: unknown): T {
  if (!sciezka.length) return wartosc as T;
  const [k, ...reszta] = sciezka;
  const kopia = (Array.isArray(obj) ? [...obj] : { ...(obj as object) }) as Record<string | number, unknown>;
  const nowa = ustaw(kopia[k as string] ?? (typeof reszta[0] === 'number' ? [] : {}), reszta, wartosc);
  if (nowa === undefined && !Array.isArray(kopia)) delete kopia[k as string];
  else kopia[k as string] = nowa;
  return kopia as T;
}

export function przesun<T>(lista: T[], z: number, na: number): T[] {
  if (na < 0 || na >= lista.length || z === na) return lista;
  const kopia = [...lista];
  const [el] = kopia.splice(z, 1);
  kopia.splice(na, 0, el as T);
  return kopia;
}
