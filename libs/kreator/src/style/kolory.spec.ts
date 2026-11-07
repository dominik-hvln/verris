import { generujPalete, hexDoOklch, kontrast, korygujPalete, oklchDoHex, sprawdzKontrastPalety, PARY_KONTRASTU } from './kolory.ts';
import type { CharakterPalety } from './katalog-stylow.ts';
import type { Paleta } from '../model.ts';

const CHARAKTERY: CharakterPalety[] = ['jasna', 'ciemna', 'kontrastowa', 'pastelowa', 'ziemista'];

describe('kolory – podstawy', () => {
  it('kontrast WCAG: czerń/biel = 21, ten sam kolor = 1, znana para #767676/#FFF ≈ 4,54', () => {
    expect(kontrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(kontrast('#123456', '#123456')).toBe(1);
    expect(kontrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('OKLCH → hex: biel, czerń i obieg hex → OKLCH → hex', () => {
    expect(oklchDoHex({ l: 1, c: 0, h: 0 })).toBe('#FFFFFF');
    expect(oklchDoHex({ l: 0, c: 0, h: 0 })).toBe('#000000');
    for (const hex of ['#1E4636', '#9C4026', '#F6F0E8', '#3366CC', '#FFCC00']) {
      expect(oklchDoHex(hexDoOklch(hex))).toBe(hex);
    }
  });

  it('kolor spoza gamutu traci nasycenie zamiast się „przycinać” do złej barwy', () => {
    const hex = oklchDoHex({ l: 0.7, c: 0.4, h: 145 });
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(Math.abs(hexDoOklch(hex).h - 145)).toBeLessThan(6);
  });
});

describe('generujPalete – właściwość AA', () => {
  it('360 barw × 5 charakterów: każda para tekst/tło ≥ 4,5', () => {
    const porazki: string[] = [];
    for (const ch of CHARAKTERY) {
      for (let h = 0; h < 360; h++) {
        const p = generujPalete(h, ch);
        for (const b of sprawdzKontrastPalety(p)) porazki.push(`${ch} ${h}: ${b}`);
      }
    }
    expect(porazki).toEqual([]);
  });

  it('deterministyczna i z poprawnymi hexami', () => {
    expect(generujPalete(150, 'jasna')).toEqual(generujPalete(150, 'jasna'));
    expect(Object.values(generujPalete(30, 'ziemista')).every((x) => /^#[0-9A-F]{6}$/.test(x))).toBe(true);
  });

  it('charakter ciemny daje ciemne tło i jasny tekst', () => {
    const p = generujPalete(220, 'ciemna');
    expect(hexDoOklch(p.tlo).l).toBeLessThan(0.3);
    expect(hexDoOklch(p.tekst).l).toBeGreaterThan(0.8);
  });
});

describe('korygujPalete', () => {
  it('naprawia za słaby kontrast, zmieniając tylko kolory tekstu', () => {
    const zla: Paleta = {
      tlo: '#FFFFFF', powierzchnia: '#F2F2F2', tekst: '#AAAAAA', tekstPrzygaszony: '#CCCCCC', akcent: '#FFD400',
      naAkcencie: '#FFFFFF', akcentTekst: '#FFD400', linia: '#EEEEEE', ciemne: '#333333', naCiemnym: '#555555',
    };
    expect(sprawdzKontrastPalety(zla).length).toBeGreaterThan(0);
    const { paleta, zmienione } = korygujPalete(zla);
    expect(sprawdzKontrastPalety(paleta)).toEqual([]);
    expect(paleta.tlo).toBe('#FFFFFF');
    expect(paleta.akcent).toBe('#FFD400');
    expect(new Set(zmienione)).toEqual(new Set(PARY_KONTRASTU.map((p) => p.tekst)));
  });

  it('dobra paleta zostaje bez zmian', () => {
    const p = generujPalete(10, 'kontrastowa');
    expect(korygujPalete(p)).toEqual({ paleta: p, zmienione: [] });
  });
});
