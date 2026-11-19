import { KOLOR_AKCENTU } from '../geometria.ts';
import { parsujD } from '../sciezka-svg.ts';

/**
 * Symbol od AI (koncepcja 3.3 i 8.2) – kontrola limitów PRZED walidatorem bezpieczeństwa biblioteki
 * (`walidujSvgSygnetu`): model pisze tylko wnętrze SVG w układzie 0 0 100 100, najwyżej 8 elementów
 * i 120 węzłów ścieżek, akcent jako fill='A'. Przekroczenie limitu = odrzucenie bez rundy naprawy (zamiennik
 * z biblioteki – tańsze niż ponowne pisanie SVG). Tu tylko limity i składanie dokumentu; białą listę elementów
 * i atrybutów, spłaszczenie i geometrię sprawdza walidator biblioteki.
 */

export const LIMITY_SYMBOLU_AI = { elementy: 8, wezly: 120, znaki: 6000 } as const;

const DOZWOLONE = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'g']);

export type WynikSymbolu = { ok: true; svg: string; elementy: number; wezly: number; ostrzezenia: string[] } | { ok: false; powod: string };

/** Liczba węzłów: segmenty ścieżki bez Z (po normalizacji – łuk to 1–4 krzywe) + wierzchołki wielokątów + 4 na kształt podstawowy. */
function wezlyElementu(tag: string, atrybuty: string): number | null {
  if (tag === 'path') {
    const d = /\bd\s*=\s*(['"])([\s\S]*?)\1/.exec(atrybuty)?.[2];
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
  if (/\d\.\d/.test(s)) ostrzezenia.push('symbol: liczby niecałkowite (dozwolone, ale dłuższe)');
  // Akcent: fill='A' / stroke='A' → kanał akcentu biblioteki.
  s = s.replace(/\b(fill|stroke)\s*=\s*(['"])A\2/g, `$1="${KOLOR_AKCENTU}"`).replace(/'/g, '"');
  return {
    ok: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor">${s}</svg>`,
    elementy,
    wezly,
    ostrzezenia,
  };
}
