/**
 * Kreator marki – bezszwowy wzór z sygnetu (koncepcja 3.8): kafel z sygnetami w układzie „przesunięcia o pół”
 * (half-drop), znaki przecinające krawędź kafla są powielone z przesunięciem ±rozmiar kafla, więc kafel łączy się
 * bez szwu. Gęstości: „bez” (brak wzoru), „rzadki”, „gęsty”.
 */
import { pokolorujSygnet } from './zloz.ts';

export type GestoscWzoru = 'bez' | 'rzadki' | 'gesty';

export interface UstawieniaWzoru {
  /** Rozmiar kafla (jednostki użytkownika). */
  kafel: number;
  /** Wielkość pojedynczego znaku. */
  znak: number;
  /** Pozycje środków znaków w kaflu (ułamki 0–1) i obrót. */
  pozycje: { x: number; y: number; obrot: number }[];
}

export const USTAWIENIA_WZORU: Record<Exclude<GestoscWzoru, 'bez'>, UstawieniaWzoru> = {
  rzadki: {
    kafel: 240,
    znak: 46,
    pozycje: [
      { x: 0.25, y: 0.25, obrot: 0 },
      { x: 0.75, y: 0.75, obrot: 0 },
    ],
  },
  gesty: {
    kafel: 160,
    znak: 40,
    pozycje: [
      { x: 0.25, y: 0.25, obrot: 0 },
      { x: 0.75, y: 0.75, obrot: 0 },
      { x: 0.75, y: 0.25, obrot: 0 },
      { x: 0.25, y: 0.75, obrot: 0 },
    ],
  },
};

const f2 = (x: number) => String(Math.round(x * 100) / 100);

/** Zawartość kafla (znaki z kopiami na krawędziach) w jednym kolorze (oba kanały = `kolor`). */
export function zawartoscKafla(wnetrzeSygnetu: string, gestosc: Exclude<GestoscWzoru, 'bez'>, kolor: string, akcent = kolor): string {
  const u = USTAWIENIA_WZORU[gestosc];
  const T = u.kafel;
  const s = u.znak / 100;
  const znak = pokolorujSygnet(wnetrzeSygnetu, kolor, akcent);
  const czesci: string[] = [];
  for (const p of u.pozycje) {
    for (const dx of [-T, 0, T])
      for (const dy of [-T, 0, T]) {
        const cx = p.x * T + dx;
        const cy = p.y * T + dy;
        const r = u.znak / 2;
        // tylko kopie, które zachodzą na kafel
        if (cx + r < 0 || cx - r > T || cy + r < 0 || cy - r > T) continue;
        const obr = p.obrot ? ` rotate(${p.obrot} 50 50)` : '';
        czesci.push(`<g transform="translate(${f2(cx - r)} ${f2(cy - r)}) scale(${s})${obr}">${znak}</g>`);
      }
  }
  return czesci.join('');
}

/**
 * Definicja `<pattern>` do użycia wewnątrz innego SVG (KV): `fill="url(#id)"`. `skala` zmienia wielkość wzoru
 * względem jednostek dokumentu. Zwraca null dla gęstości „bez”.
 */
export function wzorPattern(
  id: string,
  wnetrzeSygnetu: string,
  gestosc: GestoscWzoru,
  kolor: string,
  o: { skala?: number; akcent?: string } = {},
): string | null {
  if (gestosc === 'bez' || !wnetrzeSygnetu) return null;
  const u = USTAWIENIA_WZORU[gestosc];
  const s = o.skala ?? 1;
  return (
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f2(u.kafel * s)}" height="${f2(u.kafel * s)}">` +
    `<g transform="scale(${s})">${zawartoscKafla(wnetrzeSygnetu, gestosc, kolor, o.akcent ?? kolor)}</g></pattern>`
  );
}

/** Samodzielny SVG kafla wzoru (do pobrania / jako tło CSS). `tlo` – opcjonalny kolor tła kafla. */
export function kafelWzoruSvg(wnetrzeSygnetu: string, gestosc: GestoscWzoru, kolor: string, tlo?: string): { svg: string; rozmiar: number } | null {
  if (gestosc === 'bez' || !wnetrzeSygnetu) return null;
  const T = USTAWIENIA_WZORU[gestosc].kafel;
  const t = tlo ? `<rect width="${T}" height="${T}" fill="${tlo}"/>` : '';
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}">${t}${zawartoscKafla(wnetrzeSygnetu, gestosc, kolor)}</svg>`,
    rozmiar: T,
  };
}
