import { describe, expect, it } from 'vitest';
import { KATALOG_SYGNETOW, rodzinaPoId } from './katalog.ts';
import { LITERY_MONOGRAMU } from './litery.ts';
import { analizaCzytelnosci, PROGI_CZYTELNOSCI } from '../reguly.ts';
import { parsujD, graniceSegmentow } from '../sciezka-svg.ts';
import { ParametrySygnetu } from '../model.ts';
import type { RodzinaSygnetu } from '../typy.ts';

const LITERY = ['K', 'AB', 'Ś', 'MW', 'Ż', 'GQ', 'Ł', 'O', 'Ą', 'ĘJ', 'Ć', 'Ń', 'Ó', 'Ź', 'XY', 'RS', '7', 'ü', '', '&'];

function probki(r: RodzinaSygnetu): Record<string, number>[] {
  const def = Object.fromEntries(r.parametry.map((p) => [p.klucz, p.domyslna]));
  const wyn: Record<string, number>[] = [def];
  wyn.push(Object.fromEntries(r.parametry.map((p) => [p.klucz, p.min])));
  wyn.push(Object.fromEntries(r.parametry.map((p) => [p.klucz, p.max])));
  for (const p of r.parametry) {
    wyn.push({ ...def, [p.klucz]: p.min });
    wyn.push({ ...def, [p.klucz]: p.max });
  }
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 8; i++) wyn.push(Object.fromEntries(r.parametry.map((p) => [p.klucz, p.min + Math.floor(rnd() * (p.max - p.min + 1))])));
  return wyn;
}

const ELEMENT = /<path fill="(currentColor|var\(--akcent, currentColor\))" fill-rule="evenodd" d="([^"]+)"\/>/g;

function sprawdzSvg(svg: string, opis: string) {
  expect(svg, opis).not.toMatch(/NaN|Infinity|undefined/);
  expect(svg.replace(ELEMENT, ''), opis).toBe('');
  const d = [...svg.matchAll(ELEMENT)].map((m) => m[2]);
  expect(d.length, opis).toBeGreaterThan(0);
  for (const x of d) {
    const seg = parsujD(x);
    expect(seg, opis).not.toBeNull();
    const g = graniceSegmentow(seg!);
    expect(g.x0, opis).toBeGreaterThanOrEqual(0);
    expect(g.y0, opis).toBeGreaterThanOrEqual(0);
    expect(g.x1, opis).toBeLessThanOrEqual(100);
    expect(g.y1, opis).toBeLessThanOrEqual(100);
  }
}

describe('KATALOG_SYGNETOW', () => {
  it('co najmniej 18 rodzin, unikalne id zgodne z modelem, monogramy i geometryczne', () => {
    expect(KATALOG_SYGNETOW.length).toBeGreaterThanOrEqual(18);
    const id = KATALOG_SYGNETOW.map((r) => r.id);
    expect(new Set(id).size).toBe(id.length);
    for (const i of id) expect(i).toMatch(/^[a-z0-9-]{2,40}$/);
    expect(KATALOG_SYGNETOW.filter((r) => r.monogram).length).toBeGreaterThanOrEqual(5);
    expect(KATALOG_SYGNETOW.filter((r) => !r.monogram).length).toBeGreaterThanOrEqual(13);
    expect(rodzinaPoId('kreg-fala')?.nazwa).toBe('Toń');
  });

  it('parametry: klucze zgodne z ParametrySygnetu, całkowite zakresy, domyślna w zakresie', () => {
    for (const r of KATALOG_SYGNETOW) {
      expect(r.parametry.length, r.id).toBeGreaterThan(0);
      const def = Object.fromEntries(r.parametry.map((p) => [p.klucz, p.domyslna]));
      expect(ParametrySygnetu.safeParse(def).success, r.id).toBe(true);
      for (const p of r.parametry) {
        expect(Number.isInteger(p.min) && Number.isInteger(p.max) && Number.isInteger(p.domyslna), `${r.id}.${p.klucz}`).toBe(true);
        expect(p.min <= p.domyslna && p.domyslna <= p.max, `${r.id}.${p.klucz}`).toBe(true);
        expect(p.opis.length).toBeGreaterThan(3);
      }
    }
  });

  for (const r of KATALOG_SYGNETOW) {
    it(`${r.id}: siatka próbek – poprawne ścieżki w polu 0–100, favicon czytelny w 16 px, deterministycznie`, () => {
      probki(r).forEach((p, i) => {
        const litery = r.monogram ? LITERY[i % LITERY.length] : undefined;
        const opis = `${r.id} ${JSON.stringify(p)} ${litery ?? ''}`;
        const pelny = r.rysuj(p, { litery, ziarno: i, wariant: 'pelny' });
        sprawdzSvg(pelny, opis);
        const fav = r.rysuj(p, { litery, ziarno: i, wariant: 'favicon' });
        sprawdzSvg(fav, opis + ' favicon');
        const a = analizaCzytelnosci(fav);
        expect(a.cienkie, opis + ' – cienkie elementy w faviconie').toBeLessThanOrEqual(PROGI_CZYTELNOSCI.cienkie);
        expect(a.pokrycie, opis).toBeGreaterThan(0.08);
        if (i < 3) expect(r.rysuj(p, { litery, ziarno: i, wariant: 'pelny' })).toBe(pelny);
      });
    });
  }

  it('parametry spoza zakresu są obcinane (bez wyjątku, wynik jak dla granicy)', () => {
    for (const r of KATALOG_SYGNETOW) {
      const p = r.parametry[0];
      const poza = r.rysuj({ [p.klucz]: p.max + 50 }, { litery: 'K', ziarno: 0, wariant: 'pelny' });
      const gran = r.rysuj({ [p.klucz]: p.max }, { litery: 'K', ziarno: 0, wariant: 'pelny' });
      expect(poza, r.id).toBe(gran);
    }
  });

  it('monogramy rysują każdą obsługiwaną literę (A–Z, 0–9, Ą Ć Ę Ł Ń Ó Ś Ź Ż) i różnią się między literami', () => {
    const r = rodzinaPoId('monogram-linia')!;
    const widziane = new Set<string>();
    for (const l of LITERY_MONOGRAMU) {
      const svg = r.rysuj({}, { litery: l, ziarno: 0, wariant: 'pelny' });
      sprawdzSvg(svg, l);
      widziane.add(svg);
    }
    expect(widziane.size).toBe(LITERY_MONOGRAMU.length);
  });

  it('domyślne znaki różnych rodzin są różne', () => {
    const svg = KATALOG_SYGNETOW.map((r) => r.rysuj({}, { litery: 'K', ziarno: 0, wariant: 'pelny' }));
    expect(new Set(svg).size).toBe(svg.length);
  });
});
