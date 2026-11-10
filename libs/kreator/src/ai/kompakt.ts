import { z } from 'zod';
import { Sekcja, Strona, WERSJA_MODELU } from '../model.ts';

/**
 * Zapis kompaktowy modelu (paczka 127): bez pól równych wartości domyślnej schematu (tlo 'domyslne', ukryta false,
 * styl przycisku 'glowny', zrodlo 'placeholder', proporcje '4:3', puste tablice z domyślnym [], jezyk 'pl'…) i bez
 * `wersjaModelu`, którą uzupełnia serwer. Walidacja zod uzupełnia domyślne z powrotem, więc
 * `Strona.parse(kompaktujStrone(s))` daje ten sam model co `s` (pilnuje test). Model AI pisze odpowiedź w tym zapisie
 * (mniej tokenów wyjścia), a serwer wysyła mu w nim stronę i sekcje (mniej tokenów wejścia).
 *
 * Wartości domyślne czytamy z JSON Schema tego samego schematu, którym walidujemy (`z.toJSONSchema`, `io: 'input'`),
 * więc lista domyślnych nie rozjedzie się z modelem.
 */

interface Wezel {
  type?: string | string[];
  properties?: Record<string, Wezel>;
  items?: Wezel;
  const?: unknown;
  default?: unknown;
  anyOf?: Wezel[];
  oneOf?: Wezel[];
}

/** Pola, które uzupełnia serwer – model ich nie pisze, my ich nie wysyłamy. */
export const POLA_SERWERA = ['wersjaModelu'] as const;

const schematy = new Map<z.ZodType, Wezel>();
function schemat(s: z.ZodType): Wezel {
  let w = schematy.get(s);
  if (!w) {
    w = z.toJSONSchema(s, { io: 'input' }) as Wezel;
    schematy.set(s, w);
  }
  return w;
}

const rowne = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function pasuje(w: Wezel, v: unknown): boolean {
  if (w.const !== undefined) return rowne(w.const, v);
  const typy = Array.isArray(w.type) ? w.type : w.type ? [w.type] : [];
  if (!typy.length) return true;
  if (v === null) return typy.includes('null');
  if (Array.isArray(v)) return typy.includes('array');
  if (typeof v === 'object') {
    if (!typy.includes('object')) return false;
    const typ = w.properties?.typ?.const;
    return typ === undefined || (v as { typ?: unknown }).typ === typ;
  }
  if (typeof v === 'number') return typy.includes('number') || typy.includes('integer');
  return typy.includes(typeof v);
}

function kompaktuj(w: Wezel, v: unknown): unknown {
  const warianty = w.oneOf ?? w.anyOf;
  if (warianty) {
    const g = warianty.find((x) => pasuje(x, v));
    return g ? kompaktuj(g, v) : v;
  }
  if (Array.isArray(v)) return w.items ? v.map((x) => kompaktuj(w.items!, x)) : v;
  if (v && typeof v === 'object' && w.properties) {
    const wynik: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const p = w.properties[k];
      if (x === undefined) continue;
      if (p?.default !== undefined && rowne(x, p.default)) continue;
      wynik[k] = p ? kompaktuj(p, x) : x;
    }
    return wynik;
  }
  return v;
}

/** Dowolna wartość wg schematu zod – pola z wartością domyślną pominięte. */
export function kompaktujWg(s: z.ZodType, wartosc: unknown): unknown {
  return kompaktuj(schemat(s), wartosc);
}

/** Strona bez pól domyślnych i bez `wersjaModelu`. */
export function kompaktujStrone(strona: unknown): unknown {
  const k = kompaktujWg(Strona, strona);
  if (k && typeof k === 'object') for (const p of POLA_SERWERA) delete (k as Record<string, unknown>)[p];
  return k;
}

export function kompaktujSekcje(sekcja: unknown): unknown {
  return kompaktujWg(Sekcja, sekcja);
}

/**
 * Odpowiedź modelu przed walidacją: `wersjaModelu` uzupełnia serwer, `strategia` (plan strony z generacji –
 * master prompt, „Jak pracujesz”) nie należy do modelu strony i znika. Nie mutuje wejścia.
 */
export function uzupelnijSerwerowe(dane: unknown): unknown {
  if (!dane || typeof dane !== 'object' || Array.isArray(dane)) return dane;
  const { strategia: _strategia, ...reszta } = dane as Record<string, unknown>;
  return { ...reszta, wersjaModelu: reszta.wersjaModelu ?? WERSJA_MODELU };
}

/** JSON do bloku danych: zapis kompaktowy, „<” jako < (nadal poprawny JSON, nie zamknie znacznika). */
export function jsonDanych(wartosc: unknown): string {
  return JSON.stringify(wartosc).replace(/</g, '\\u003c');
}
