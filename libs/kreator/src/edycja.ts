import { Obraz, Strona } from './model.ts';

/**
 * Edycja na stronie (paczka 122): ścieżki pól modelu, które klient może zmienić bezpośrednio w podglądzie,
 * i jedno miejsce, z którego renderer (atrybut `data-k-max`) i edytor panelu (walidacja wiadomości z ramki,
 * przycięcie tekstu) biorą limity – z tego samego schematu zod co walidacja strony (model.ts). Bez liczb
 * przepisanych ręcznie. Moduł czysty, bez renderera – trafia też do przeglądarki (`@verris/kreator/klient`).
 *
 * Ścieżka: kropkowa, w modelu Strona, np. `strony.0.sekcje.2.dane.naglowek`, `strony.0.sekcje.1.dane.pozycje.3.tytul`,
 * `firma.nazwa`, `stopka.tekst`, `strony.1.tytul`.
 */

/** Pola wielowierszowe – Enter w podglądzie wstawia nową linię (zapis jako \n), renderer dzieli je na akapity. */
const WIELOWIERSZOWE = new Set(['odpowiedz']);

/**
 * Teksty z modelu, których NIE zmienia się w podglądzie: techniczne (adresy, kody) i opis zdjęć (alt, podpis –
 * edytuje je okno wyboru zdjęcia). Pola z formatem (regex, e-mail, URL) odpadają same – patrz `czyZwyklyTekst`.
 */
const ZABRONIONE_KLUCZE = new Set(['zrodloUrl', 'sku', 'licencjaUrl', 'opisDoWyszukania', 'alt', 'podpis', 'url', 'id', 'wariant']);

/** Pierwszy człon ścieżki, pod którym są teksty widoczne na stronie (bez SEO, motywu i ustawień). */
const KORZENIE: Record<string, (segmenty: Segment[]) => boolean> = {
  firma: (s) => s.length === 2 && ['nazwa', 'branza', 'obszar', 'opisKrotki'].includes(String(s[1])),
  stopka: (s) => (s.length === 2 && s[1] === 'tekst') || (s.length === 4 && s[1] === 'tlumaczenia' && s[3] === 'tekst'),
  strony: (s) =>
    typeof s[1] === 'number' &&
    ((s.length === 3 && s[2] === 'tytul') ||
      (s[2] === 'sekcje' && typeof s[3] === 'number' && ((s.length === 5 && s[4] === 'wMenu') || (s.length > 5 && s[4] === 'dane')))),
};

export type Segment = string | number;

// Minimalny widok wnętrza schematów zod 4 – to samo, czego używa generator formularza w panelu.
interface DefZod {
  type: string;
  innerType?: SchematZod;
  shape?: Record<string, SchematZod>;
  element?: SchematZod;
  options?: SchematZod[];
  discriminator?: string;
  values?: unknown[];
  format?: string;
  checks?: { _zod: { def: { check: string } } }[];
}
interface SchematZod {
  def: DefZod;
  maxLength?: number | null;
  minLength?: number | null;
}

/** Ścieżka kropkowa → segmenty (liczby jako indeksy). null = niepoprawny zapis. */
export function podzielSciezke(sciezka: string): Segment[] | null {
  if (typeof sciezka !== 'string' || sciezka.length > 200 || !/^[A-Za-z0-9]+(\.[A-Za-z0-9]+)*$/.test(sciezka)) return null;
  const wynik: Segment[] = [];
  for (const c of sciezka.split('.')) {
    if (/^\d+$/.test(c)) {
      if (c.length > 3) return null;
      wynik.push(Number(c));
    } else if (/^[A-Za-z]+$/.test(c)) wynik.push(c);
    else return null;
  }
  return wynik;
}

/** Wartość pod ścieżką (undefined, gdy jej nie ma). Tylko własne klucze – bez prototypów. */
export function wartoscPod(obiekt: unknown, sciezka: string | Segment[]): unknown {
  const seg = typeof sciezka === 'string' ? podzielSciezke(sciezka) : sciezka;
  if (!seg) return undefined;
  let x: unknown = obiekt;
  for (const k of seg) {
    if (x === null || typeof x !== 'object') return undefined;
    if (Array.isArray(x) ? typeof k !== 'number' : !Object.prototype.hasOwnProperty.call(x, k)) return undefined;
    x = (x as Record<string | number, unknown>)[k];
  }
  return x;
}

function rozpakuj(s: SchematZod): { s: SchematZod; opcjonalne: boolean } {
  let opcjonalne = false;
  let b = s;
  for (let i = 0; i < 8 && ['optional', 'default', 'nullable', 'prefault'].includes(b.def.type) && b.def.innerType; i++) {
    if (b.def.type !== 'nullable') opcjonalne = true;
    b = b.def.innerType;
  }
  return { s: b, opcjonalne };
}

interface Lisc {
  schemat: SchematZod;
  opcjonalne: boolean;
  wObrazie: boolean;
}

/** Schemat pola pod ścieżką; unia sekcji wybierana po `typ` z danych (limity zależą od typu sekcji). */
function lisc(model: unknown, seg: Segment[]): Lisc | null {
  let s = Strona as unknown as SchematZod;
  let dane: unknown = model;
  let wObrazie = false;
  for (const k of seg) {
    let r = rozpakuj(s);
    if (r.s.def.type === 'union' && r.s.def.options) {
      const d = r.s.def.discriminator;
      const wartosc = d && dane && typeof dane === 'object' ? (dane as Record<string, unknown>)[d] : undefined;
      const opcja = r.s.def.options.find((o) => rozpakuj(o).s.def.shape?.[d ?? '']?.def.values?.includes(wartosc));
      if (!opcja) return null;
      r = rozpakuj(opcja);
    }
    if ((r.s as unknown) === Obraz) wObrazie = true;
    if (typeof k === 'number') {
      if (r.s.def.type !== 'array' || !r.s.def.element) return null;
      s = r.s.def.element;
    } else {
      if (r.s.def.type !== 'object' || !r.s.def.shape || !Object.prototype.hasOwnProperty.call(r.s.def.shape, k)) return null;
      s = r.s.def.shape[k]!;
    }
    dane = dane && typeof dane === 'object' ? (dane as Record<string | number, unknown>)[k] : undefined;
  }
  const r = rozpakuj(s);
  if ((r.s as unknown) === Obraz) wObrazie = true;
  return { schemat: r.s, opcjonalne: r.opcjonalne, wObrazie };
}

/** Zwykły tekst: string bez formatu (regex, e-mail, URL, data) – tylko taki da się bezpiecznie pisać w podglądzie. */
function czyZwyklyTekst(s: SchematZod): boolean {
  return s.def.type === 'string' && !s.def.format && !(s.def.checks ?? []).some((c) => c._zod.def.check === 'string_format');
}

export interface PoleTekstowe {
  /** Limit znaków ze schematu (zod `.max`). */
  max: number;
  /** Pole wymagane (min 1) – pustego nie da się zapisać. */
  wymagane: boolean;
  /** Pole opcjonalne – pusty tekst usuwa klucz. */
  opcjonalne: boolean;
  /** Wiele linii (Enter = nowa linia). */
  wiele: boolean;
}

/**
 * Opis pola tekstowego pod ścieżką, jeśli wolno je edytować w podglądzie; null = nie (złe miejsce, pole techniczne,
 * pole z formatem, zdjęcie, liczba). Nie sprawdza, czy wartość istnieje – do tego `wartoscPod`.
 */
export function poleTekstowe(model: unknown, sciezka: string): PoleTekstowe | null {
  const seg = podzielSciezke(sciezka);
  if (!seg || seg.length < 2) return null;
  const korzen = KORZENIE[String(seg[0])];
  if (!korzen || !korzen(seg)) return null;
  if (seg.some((k) => typeof k === 'string' && ZABRONIONE_KLUCZE.has(k))) return null;
  const l = lisc(model, seg);
  if (!l || l.wObrazie || !czyZwyklyTekst(l.schemat) || typeof l.schemat.maxLength !== 'number') return null;
  const klucz = [...seg].reverse().find((k): k is string => typeof k === 'string') ?? '';
  return { max: l.schemat.maxLength, wymagane: (l.schemat.minLength ?? 0) > 0, opcjonalne: l.opcjonalne, wiele: WIELOWIERSZOWE.has(klucz) };
}

/** Czy ścieżka wskazuje obiekt Obraz w danych sekcji (wymiana zdjęcia z podglądu). */
export function poleObrazu(model: unknown, sciezka: string): boolean {
  const seg = podzielSciezke(sciezka);
  if (!seg || seg[0] !== 'strony' || typeof seg[1] !== 'number' || seg[2] !== 'sekcje' || typeof seg[3] !== 'number' || seg[4] !== 'dane') return false;
  const l = lisc(model, seg);
  return !!l && (l.schemat as unknown) === Obraz;
}

/** Bez znaków sterujących (poza \n w polach wielowierszowych), twarde spacje → spacje, przycięcie do limitu. */
export function oczyscTekst(wartosc: string, pole: Pick<PoleTekstowe, 'max' | 'wiele'>): { tekst: string; przycieto: boolean } {
  let t = String(wartosc).replace(/\r\n?/g, '\n').replace(/[\u00a0\u202f\u2007]/g, ' ');
  t = pole.wiele ? t.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n') : t.replace(/\n+/g, ' ');
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(pole.wiele ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b\u2028\u2029\ufeff]/g : /[\u0000-\u001f\u007f-\u009f\u200b\u2028\u2029\ufeff]/g, '');
  t = t.trim();
  if (t.length <= pole.max) return { tekst: t, przycieto: false };
  let c = t.slice(0, pole.max);
  if (/[\ud800-\udbff]$/.test(c)) c = c.slice(0, -1);
  return { tekst: c.trimEnd(), przycieto: true };
}

function ustawPod<T>(obj: T, seg: Segment[], wartosc: unknown): T {
  if (!seg.length) return wartosc as T;
  const [k, ...reszta] = seg as [Segment, ...Segment[]];
  const kopia = (Array.isArray(obj) ? [...obj] : { ...(obj as object) }) as Record<string | number, unknown>;
  const nowa = ustawPod(kopia[k], reszta, wartosc);
  if (nowa === undefined && !Array.isArray(kopia)) delete kopia[k];
  else kopia[k] = nowa;
  return kopia as T;
}

export type WynikEdycjiTekstu<T> =
  | {
      ok: true;
      model: T;
      wartosc: string;
      przycieto: boolean;
      zmiana: boolean;
      /** Zmieniło się coś poza tym tekstem (np. zniknęło wyróżnienie nagłówka) – podgląd trzeba przerysować. */
      przerysuj: boolean;
    }
  | { ok: false; powod: 'sciezka' | 'pusty' };

/**
 * Zmiana tekstu z podglądu: tylko istniejące pole tekstowe (wartość pod ścieżką jest tekstem), oczyszczenie i limit
 * ze schematu, pusty tekst usuwa pole opcjonalne, a wymaganego nie zapisuje. Nagłówek hero zachowuje wyróżnienie,
 * jeśli fragment nadal w nim występuje – inaczej wyróżnienie znika (model zostaje spójny: sprawdzSpojnosc).
 * Czysta funkcja – nie mutuje modelu.
 */
export function zastosujTekst<T>(model: T, sciezka: string, wartosc: unknown): WynikEdycjiTekstu<T> {
  const pole = typeof wartosc === 'string' ? poleTekstowe(model, sciezka) : null;
  const seg = podzielSciezke(sciezka);
  if (!pole || !seg || typeof wartoscPod(model, seg) !== 'string') return { ok: false, powod: 'sciezka' };
  const { tekst, przycieto } = oczyscTekst(wartosc as string, pole);
  if (!tekst && (pole.wymagane || !pole.opcjonalne)) return { ok: false, powod: 'pusty' };
  if (tekst === wartoscPod(model, seg)) return { ok: true, model, wartosc: tekst, przycieto, zmiana: false, przerysuj: false };
  let nowy = ustawPod(model, seg, tekst || undefined);
  let przerysuj = !tekst;
  const hero = seg.length === 6 && seg[4] === 'dane' && seg[5] === 'naglowek' ? seg.slice(0, 4) : null;
  if (hero && (wartoscPod(nowy, [...hero, 'typ']) as unknown) === 'hero') {
    const wyr = wartoscPod(nowy, [...hero, 'dane', 'wyroznienie']);
    if (typeof wyr === 'string' && !tekst.includes(wyr)) {
      nowy = ustawPod(nowy, [...hero, 'dane', 'wyroznienie'], undefined);
      przerysuj = true;
    }
  }
  return { ok: true, model: nowy, wartosc: tekst, przycieto, zmiana: true, przerysuj };
}
