import { kolorySzkieletowe, wykryjCien, wykryjGradient } from './kolory-obrazu.ts';
import { rasteryzujSciezki } from '../odcisk.ts';
import { walidujSvgSygnetu } from '../walidator-svg.ts';
import { konturyPola, poleKonturu, porownajWektor, rasteryzujWektor, rdp, wektoryzuj, zgodnoscMasek } from './wektoryzacja.ts';

/** Obraz testowy z wygładzaniem krawędzi (nadpróbkowanie 4×4): `kolor(x, y)` zwraca [r,g,b,a] albo null (tło). */
function obraz(szer: number, wys: number, kolor: (x: number, y: number) => [number, number, number, number] | null, tlo: [number, number, number, number] = [255, 255, 255, 255]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(szer * wys * 4);
  const n = 4;
  for (let y = 0; y < wys; y++) {
    for (let x = 0; x < szer; x++) {
      const suma = [0, 0, 0, 0];
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = kolor(x + (sx + 0.5) / n, y + (sy + 0.5) / n) ?? tlo;
          // Mieszanie z premultiplikacją alfy.
          for (let k = 0; k < 3; k++) suma[k] += c[k] * c[3];
          suma[3] += c[3];
        }
      }
      const o = (y * szer + x) * 4;
      const a = suma[3] / (n * n);
      for (let k = 0; k < 3; k++) px[o + k] = suma[3] ? Math.round(suma[k] / suma[3]) : 0;
      px[o + 3] = Math.round(a);
    }
  }
  return px;
}

const GRANAT: [number, number, number, number] = [20, 40, 110, 255];
const POMARANCZ: [number, number, number, number] = [242, 140, 40, 255];

const kolo = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** Litera „O” (pierścień – otwór) i „L” (narożniki proste). */
const pierscien = (x: number, y: number) => {
  const d = Math.hypot(x - 40, y - 40);
  return d <= 30 && d >= 17;
};
const literaL = (x: number, y: number) => (x >= 20 && x <= 34 && y >= 12 && y <= 68) || (x >= 20 && x <= 62 && y >= 54 && y <= 68);

/** Maska źródła z funkcji kształtu (środki pikseli). */
function maskaKsztaltu(szer: number, wys: number, f: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(szer * wys);
  for (let y = 0; y < wys; y++) for (let x = 0; x < szer; x++) m[y * szer + x] = f(x + 0.5, y + 0.5) ? 1 : 0;
  return m;
}

describe('kolorySzkieletowe', () => {
  it('jeden kolor na białym tle: tło wykryte, wygładzone krawędzie nie dają kolorów pośrednich', () => {
    const img = obraz(80, 80, (x, y) => (kolo(40, 40, 28)(x, y) ? GRANAT : null));
    const w = kolorySzkieletowe(img, 80, 80, 4);
    expect(w.tlo).toBe('#FFFFFF');
    expect(w.przezroczysty).toBe(false);
    expect(w.kolory).toHaveLength(1);
    expect(w.kolory[0].hex).toBe('#14286E');
  });

  it('dwa kolory: oba wykryte, kolejność wg udziału', () => {
    const img = obraz(100, 80, (x, y) => (kolo(30, 40, 25)(x, y) ? GRANAT : x > 62 && x < 92 && y > 25 && y < 55 ? POMARANCZ : null));
    const w = kolorySzkieletowe(img, 100, 80, 5);
    expect(w.kolory.map((c) => c.hex)).toEqual(['#14286E', '#F28C28']);
    expect(w.kolory[0].udzial).toBeGreaterThan(w.kolory[1].udzial);
  });

  it('tło przezroczyste: pomija piksele przezroczyste, tło = null', () => {
    const img = obraz(60, 60, (x, y) => (kolo(30, 30, 20)(x, y) ? POMARANCZ : null), [0, 0, 0, 0]);
    const w = kolorySzkieletowe(img, 60, 60, 3);
    expect(w.tlo).toBeNull();
    expect(w.przezroczysty).toBe(true);
    expect(w.kolory.map((c) => c.hex)).toEqual(['#F28C28']);
  });

  it('szum kompresji (±8 na kanał) nie tworzy nowych kolorów ani gradientu', () => {
    const img = obraz(80, 80, (x, y) => (kolo(40, 40, 28)(x, y) ? GRANAT : null));
    let z = 12345;
    for (let i = 0; i < img.length; i++) {
      if (i % 4 === 3) continue;
      z = (z * 1103515245 + 12345) & 0x7fffffff;
      img[i] = Math.max(0, Math.min(255, img[i] + ((z >> 8) % 17) - 8));
    }
    const w = kolorySzkieletowe(img, 80, 80, 4);
    expect(w.kolory).toHaveLength(1);
    expect(w.tlo).not.toBeNull();
    expect(wykryjGradient(img, 80, 80, w).gradient).toBe(false);
  });

  it('jest deterministyczny i odrzuca złe wymiary', () => {
    const img = obraz(40, 40, (x, y) => (kolo(20, 20, 12)(x, y) ? GRANAT : null));
    expect(kolorySzkieletowe(img, 40, 40, 3)).toEqual(kolorySzkieletowe(img, 40, 40, 3));
    expect(() => kolorySzkieletowe(img, 41, 40, 3)).toThrow();
  });
});

describe('wykrycie gradientu i cienia', () => {
  it('płaskie koło: bez gradientu i bez cienia', () => {
    const img = obraz(80, 80, (x, y) => (kolo(40, 40, 28)(x, y) ? GRANAT : null));
    const k = kolorySzkieletowe(img, 80, 80, 4);
    expect(wykryjGradient(img, 80, 80, k).gradient).toBe(false);
    expect(wykryjCien(img, 80, 80, k).cien).toBe(false);
  });

  it('koło z gradientem liniowym: gradient', () => {
    const img = obraz(80, 80, (x, y) => (kolo(40, 40, 30)(x, y) ? [Math.round(20 + (x / 80) * 220), 60, Math.round(200 - (x / 80) * 150), 255] : null));
    const k = kolorySzkieletowe(img, 80, 80, 4);
    expect(wykryjGradient(img, 80, 80, k).gradient).toBe(true);
  });

  it('koło z rozmytym, przesuniętym cieniem: cień', () => {
    const img = obraz(100, 100, (x, y) => {
      if (kolo(45, 45, 25)(x, y)) return GRANAT;
      const d = Math.hypot(x - 52, y - 52) - 25;
      if (d < 10) {
        const s = Math.max(0, Math.min(1, 1 - d / 10)) * 0.45;
        const v = Math.round(255 * (1 - s));
        return [v, v, v, 255];
      }
      return null;
    });
    const k = kolorySzkieletowe(img, 100, 100, 4);
    expect(wykryjCien(img, 100, 100, k).cien).toBe(true);
  });

  it('PNG z półprzezroczystą poświatą: cień', () => {
    const img = obraz(
      80,
      80,
      (x, y) => {
        if (kolo(40, 40, 20)(x, y)) return POMARANCZ;
        const d = Math.hypot(x - 40, y - 40) - 20;
        return d < 12 ? [0, 0, 0, Math.round(120 * (1 - d / 12))] : null;
      },
      [0, 0, 0, 0],
    );
    const k = kolorySzkieletowe(img, 80, 80, 3);
    expect(wykryjCien(img, 80, 80, k).cien).toBe(true);
  });
});

describe('marching squares i RDP', () => {
  it('kwadrat 3×3 w polu 5×5 daje jeden domknięty kontur o polu ≈ 9 – 0,5', () => {
    const pole = new Array(25).fill(0);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) pole[y * 5 + x] = 1;
    const k = konturyPola(pole, 5, 5);
    expect(k).toHaveLength(1);
    // Kontur przez środki krawędzi między pikselami 1 a 0: kwadrat 3×3 ze ściętymi narożnikami (−4 × 1/8).
    expect(Math.abs(poleKonturu(k[0]))).toBeCloseTo(8.5, 5);
  });

  it('pierścień daje dwa kontury o przeciwnych orientacjach (otwór)', () => {
    const pole = Array.from(maskaKsztaltu(80, 80, pierscien));
    const k = konturyPola(pole, 80, 80);
    expect(k).toHaveLength(2);
    const pola = k.map(poleKonturu);
    expect(Math.sign(pola[0])).not.toBe(Math.sign(pola[1]));
  });

  it('RDP zostawia końce odcinka prostego i wierzchołek załamania', () => {
    const p: [number, number][] = [[0, 0], [1, 0.05], [2, -0.02], [3, 0], [3, 1], [3.02, 2], [3, 3]];
    expect(rdp(p, 0.2)).toEqual([0, 3, 6]);
  });
});

describe('wektoryzuj – jakość (rasteryzacja wyniku vs źródło)', () => {
  it('koło: IoU ≥ 0,98, mało węzłów, same krzywe', () => {
    const f = kolo(50, 50, 36);
    const img = obraz(100, 100, (x, y) => (f(x, y) ? GRANAT : null));
    const w = wektoryzuj(img, 100, 100, { kolory: ['#14286E'], tlo: '#FFFFFF' });
    expect(w.sciezki).toHaveLength(1);
    expect(w.sciezki[0].kanal).toBe('glowny');
    expect(w.wezly).toBeLessThanOrEqual(8);
    expect(w.sciezki[0].d).not.toContain('L');
    const iou = zgodnoscMasek(maskaKsztaltu(100, 100, f), rasteryzujWektor(w.sciezki[0].d, 100, 100, w.przeksztalcenie));
    expect(iou).toBeGreaterThan(0.98);
    expect(w.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100"><path fill="currentColor" fill-rule="evenodd" d="M[^"]+Z"\/><\/svg>$/);
  });

  it('litera „O” (otwór evenodd) i „L” (narożniki proste): IoU ≥ 0,97', () => {
    for (const f of [pierscien, literaL]) {
      const img = obraz(80, 80, (x, y) => (f(x, y) ? GRANAT : null));
      const w = wektoryzuj(img, 80, 80, { kolory: ['#14286E'], tlo: '#FFFFFF' });
      const iou = zgodnoscMasek(maskaKsztaltu(80, 80, f), rasteryzujWektor(w.sciezki[0].d, 80, 80, w.przeksztalcenie));
      expect(iou).toBeGreaterThan(0.97);
    }
    const imgL = obraz(80, 80, (x, y) => (literaL(x, y) ? GRANAT : null));
    const wL = wektoryzuj(imgL, 80, 80, { kolory: ['#14286E'], tlo: '#FFFFFF' });
    // „L” to sześć prostych odcinków.
    expect(wL.sciezki[0].d).not.toContain('C');
    expect(wL.wezly).toBeLessThanOrEqual(8);
    const imgO = obraz(80, 80, (x, y) => (pierscien(x, y) ? GRANAT : null));
    expect(wektoryzuj(imgO, 80, 80, { kolory: ['#14286E'], tlo: '#FFFFFF' }).sciezki[0].kontury).toBe(2);
  });

  it('litera „D” (łuk + proste + otwór): IoU ≥ 0,97 i mniej niż 20 węzłów', () => {
    const D = (x: number, y: number) => {
      const zew = (x >= 20 && x <= 40 && y >= 10 && y <= 70) || (x > 40 && (x - 40) ** 2 / 30 ** 2 + (y - 40) ** 2 / 30 ** 2 <= 1);
      const wew = (x >= 32 && x <= 40 && y >= 22 && y <= 58) || (x > 40 && (x - 40) ** 2 / 18 ** 2 + (y - 40) ** 2 / 18 ** 2 <= 1);
      return zew && !wew;
    };
    const img = obraz(80, 80, (x, y) => (D(x, y) ? GRANAT : null));
    const w = wektoryzuj(img, 80, 80, { kolory: ['#14286E'], tlo: '#FFFFFF' });
    expect(zgodnoscMasek(maskaKsztaltu(80, 80, D), rasteryzujWektor(w.sciezki[0].d, 80, 80, w.przeksztalcenie))).toBeGreaterThan(0.97);
    expect(w.sciezki[0].kontury).toBe(2);
    expect(w.wezly).toBeLessThan(20);
  });

  it('dwa stykające się kolory: dwie ścieżki, kanały główny i akcent, IoU każdej ≥ 0,96', () => {
    const lewy = (x: number, y: number) => kolo(50, 50, 38)(x, y) && x < 50;
    const prawy = (x: number, y: number) => kolo(50, 50, 38)(x, y) && x >= 50;
    const img = obraz(100, 100, (x, y) => (lewy(x, y) ? GRANAT : prawy(x, y) ? POMARANCZ : null));
    const k = kolorySzkieletowe(img, 100, 100, 4);
    const w = wektoryzuj(img, 100, 100, { kolory: k.kolory.map((c) => c.hex), tlo: k.tlo });
    expect(w.sciezki.map((s) => s.kanal)).toEqual(['glowny', 'akcent']);
    expect(w.svg).toContain('fill="var(--akcent, currentColor)"');
    for (const r of porownajWektor(img, 100, 100, w, k.tlo)) expect(r.iou).toBeGreaterThan(0.96);
  });

  it('obrys treści wpisany w viewBox 0 0 100 100 z marginesem, liczby z 1 miejscem', () => {
    const img = obraz(120, 60, (x, y) => (x > 10 && x < 110 && y > 20 && y < 40 ? GRANAT : null));
    const w = wektoryzuj(img, 120, 60, { kolory: ['#14286E'], tlo: '#FFFFFF' });
    const liczby = (w.sciezki[0].d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    expect(Math.min(...liczby)).toBeGreaterThanOrEqual(1.9);
    expect(Math.max(...liczby)).toBeLessThanOrEqual(98.1);
    expect(w.sciezki[0].d).not.toMatch(/\.\d\d/);
  });

  it('wynik przechodzi walidator biblioteki (tryb „wgrany”) i zgadza się z jej rasteryzatorem', () => {
    const lewy = (x: number, y: number) => pierscien(x, y) && x < 40;
    const img = obraz(80, 80, (x, y) => (lewy(x, y) ? GRANAT : pierscien(x, y) ? POMARANCZ : literaL(x, y) ? GRANAT : null));
    const k = kolorySzkieletowe(img, 80, 80, 4);
    const w = wektoryzuj(img, 80, 80, { kolory: k.kolory.map((c) => c.hex), tlo: k.tlo });
    const v = walidujSvgSygnetu(w.svg, { tryb: 'wgrany' });
    expect(v.bledy).toEqual([]);
    expect(v.ok).toBe(true);
    // Rasteryzacja tej samej ścieżki: własna (środki pikseli) vs biblioteki (nadpróbkowanie 4×4, próg 50%).
    const d = w.sciezki[0].d;
    const moja = rasteryzujWektor(d, 100, 100);
    const a1 = rasteryzujSciezki([d], 100).map((x) => (x >= 128 ? 1 : 0));
    expect(zgodnoscMasek(moja, Uint8Array.from(a1))).toBeGreaterThan(0.97);
  });

  it('pusty obraz – brak ścieżek', () => {
    const img = obraz(20, 20, () => null);
    expect(wektoryzuj(img, 20, 20, { kolory: ['#14286E'], tlo: '#FFFFFF' }).sciezki).toEqual([]);
  });
});
