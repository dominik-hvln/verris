import { KOLOR_AKCENTU } from '../geometria.ts';
import { analizaCzytelnosci } from '../reguly.ts';
import { parsujD } from '../sciezka-svg.ts';

/**
 * Symbol od AI (koncepcja 3.3 i 8.2) – kontrola limitów PRZED walidatorem bezpieczeństwa biblioteki
 * (`walidujSvgSygnetu`): model pisze tylko wnętrze SVG w układzie 0 0 100 100, akcent jako fill='A'.
 * Tu tylko limity, normalizacja kolorów i składanie dokumentu; białą listę elementów i atrybutów, spłaszczenie
 * i geometrię sprawdza walidator biblioteki, a czytelność – `kontrolaSymbolu` (raster 100×100 i 32×32).
 *
 * Paczka 134 (feedback właściciela: znak ma wynikać z briefu – litera + motyw, skojarzenie z nazwą): limity podniesione
 * do 12 elementów i 220 węzłów (łuki A i krzywe C/Q dozwolone; po normalizacji łuk to 1–4 krzywe), kolory spoza
 * tokenów (#000, black, #333…) → kolor główny zamiast odrzucenia, biel → wycięcie (walidator odejmuje).
 */

export const LIMITY_SYMBOLU_AI = { elementy: 12, wezly: 220, znaki: 9000 } as const;

const DOZWOLONE = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'g']);

export type WynikSymbolu = { ok: true; svg: string; elementy: number; wezly: number; ostrzezenia: string[] } | { ok: false; powod: string };

/** Liczba węzłów: segmenty ścieżki bez Z (po normalizacji – łuk to 1–4 krzywe) + wierzchołki wielokątów + 4 na kształt podstawowy. */
function wezlyElementu(tag: string, atrybuty: string): number | null {
  if (tag === 'path') {
    const d = /(?:^|\s)d\s*=\s*(['"])([\s\S]*?)\1/.exec(atrybuty)?.[2];
    if (!d) return null;
    const seg = parsujD(d, 1000);
    return seg ? seg.filter((s) => s.t !== 'Z' && s.t !== 'M').length + seg.filter((s) => s.t === 'M').length : null;
  }
  if (tag === 'polygon') {
    const p = /\bpoints\s*=\s*(['"])([\s\S]*?)\1/.exec(atrybuty)?.[2] ?? '';
    return Math.ceil((p.match(/-?\d*\.?\d+/g) ?? []).length / 2);
  }
  if (tag === 'g') return 0;
  return 4;
}

const BIALE = new Set(['white', '#fff', '#ffffff']);

/**
 * Kolor od modelu → token walidatora: 'A' → akcent, none/currentColor/akcent bez zmian, biel → wycięcie (#ffffff),
 * każdy inny kolor (czerń, szarość, hex z palety) → kolor główny. Kolor symbolu i tak nadaje marka – model nie wybiera
 * barw w SVG, więc „#111” to ten sam zamiar co currentColor, a nie powód do odrzucenia znaku.
 */
function tokenKoloru(v: string): { wartosc: string; zmieniony: boolean } {
  const t = v.trim().toLowerCase();
  if (v.trim() === 'A') return { wartosc: KOLOR_AKCENTU, zmieniony: false };
  if (t === 'none' || t === 'transparent' || t === 'currentcolor' || /^var\(\s*--akcent/.test(t)) return { wartosc: v, zmieniony: false };
  if (BIALE.has(t)) return { wartosc: '#ffffff', zmieniony: false };
  return { wartosc: 'currentColor', zmieniony: true };
}

/** Wnętrze od modelu → samodzielny SVG albo powód odrzucenia. */
export function przygotujSymbolAi(wnetrze: string): WynikSymbolu {
  let s = wnetrze.trim();
  if (s.length > LIMITY_SYMBOLU_AI.znaki) return { ok: false, powod: `symbol: ${s.length} znaków (limit ${LIMITY_SYMBOLU_AI.znaki})` };
  // Model mógł dopisać <svg …> – zostawiamy wnętrze (viewBox narzucamy sami).
  const svg = /^<svg\b[^>]*>([\s\S]*)<\/svg>$/i.exec(s);
  if (svg) {
    const vb = /viewBox\s*=\s*['"]([^'"]+)['"]/i.exec(s)?.[1]?.trim().split(/[\s,]+/).map(Number);
    if (vb && vb.join(' ') !== '0 0 100 100') return { ok: false, powod: 'symbol: viewBox inny niż 0 0 100 100' };
    s = svg[1].trim();
  }
  const ostrzezenia: string[] = [];
  let elementy = 0;
  let wezly = 0;
  for (const m of s.matchAll(/<\s*([a-zA-Z][\w:-]*)\b([^>]*)>/g)) {
    const tag = m[1].toLowerCase();
    if (!DOZWOLONE.has(tag)) return { ok: false, powod: `symbol: element <${tag}> niedozwolony` };
    if (tag !== 'g') elementy++;
    const w = wezlyElementu(tag, m[2]);
    if (w === null) return { ok: false, powod: `symbol: niepoprawna ścieżka w <${tag}>` };
    wezly += w;
  }
  if (!elementy) return { ok: false, powod: 'symbol: brak kształtów' };
  if (elementy > LIMITY_SYMBOLU_AI.elementy) return { ok: false, powod: `symbol: ${elementy} elementów (limit ${LIMITY_SYMBOLU_AI.elementy})` };
  if (wezly > LIMITY_SYMBOLU_AI.wezly) return { ok: false, powod: `symbol: ${wezly} węzłów (limit ${LIMITY_SYMBOLU_AI.wezly})` };
  if (s.replace(/<[^>]*>/g, '').trim()) return { ok: false, powod: 'symbol: tekst poza elementami' };
  if (/\d\.\d\d/.test(s)) ostrzezenia.push('symbol: liczby z więcej niż 1 miejscem po przecinku (dozwolone, ale dłuższe)');
  let zmienioneKolory = 0;
  s = s.replace(/\b(fill|stroke)\s*=\s*(['"])(.*?)\2/g, (_m, atr: string, _q: string, v: string) => {
    const k = tokenKoloru(v);
    if (k.zmieniony) zmienioneKolory++;
    return `${atr}="${k.wartosc}"`;
  });
  if (zmienioneKolory) ostrzezenia.push(`symbol: ${zmienioneKolory} × kolor spoza tokenów → kolor główny`);
  s = s.replace(/'/g, '"');
  return {
    ok: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor">${s}</svg>`,
    elementy,
    wezly,
    ostrzezenia,
  };
}

/**
 * Progi kontroli jakości symbolu AI (raster znormalizowanego symbolu w polu 4–96): pusty / plama / zbyt cienki /
 * zbyt drobny / zlewające się prześwity. Łagodniejsze niż ostrzeżenia `ocenProjekt` – odrzucamy tylko znaki, które
 * w 16–32 px na pewno się rozsypią albo nie mają formy.
 */
export const PROGI_SYMBOLU_AI = { pokrycieMin: 0.06, pokrycieMax: 0.82, cienkie: 0.12, elementy: 8, szczeliny: 0.25 } as const;

/** Problemy czytelności symbolu (pusta lista = dobry). `svg` – wynik walidatora (same `<path>` w polu 0–100). */
export function kontrolaSymbolu(svg: string): string[] {
  const a = analizaCzytelnosci(svg);
  const p = PROGI_SYMBOLU_AI;
  const bledy: string[] = [];
  if (a.pokrycie < p.pokrycieMin) bledy.push(`pusty albo zbyt lekki (pokrycie ${Math.round(a.pokrycie * 100)}%)`);
  if (a.pokrycie > p.pokrycieMax) bledy.push(`pełna plama bez formy (pokrycie ${Math.round(a.pokrycie * 100)}%)`);
  if (a.cienkie > p.cienkie) bledy.push(`zbyt cienkie elementy – rozsypie się w 16 px (${Math.round(a.cienkie * 100)}% tuszu)`);
  if (a.elementy > p.elementy) bledy.push(`zbyt wiele drobnych elementów w 32 px (${a.elementy})`);
  if (a.szczeliny > p.szczeliny) bledy.push(`wąskie prześwity zleją się w 16 px (${Math.round(a.szczeliny * 100)}%)`);
  return bledy;
}
