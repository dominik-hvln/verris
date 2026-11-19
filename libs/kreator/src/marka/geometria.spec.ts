import { describe, expect, it } from 'vitest';
import { doD, kolo, obrys, odejmij, operacja, pole, poleKsztaltu, polacz, prostokat, przetnij, wsun, zaokraglij } from './geometria.ts';
import { parsujD, segmentyDoD, splaszcz } from './sciezka-svg.ts';
import { rasteryzujSciezki } from './odcisk.ts';

const kw = (x: number, y: number, a: number) => prostokat(x, y, a, a);

describe('operacje boolowskie', () => {
  it('suma, różnica i iloczyn kwadratów mają poprawne pola', () => {
    const a = [kw(0, 0, 10)];
    const b = [kw(5, 5, 10)];
    expect(poleKsztaltu(polacz(a, b))).toBeCloseTo(175, 6);
    expect(poleKsztaltu(odejmij(a, b))).toBeCloseTo(75, 6);
    expect(poleKsztaltu(przetnij(a, b))).toBeCloseTo(25, 6);
  });

  it('wycięcie w środku daje otwór (pole ujemne), wynik renderuje się tak samo w evenodd i nonzero', () => {
    const k = odejmij([kw(0, 0, 100)], [kw(40, 40, 20)]);
    expect(k.length).toBe(2);
    expect(k.filter((c) => pole(c) < 0).length).toBe(1);
    const d = [doD(k)];
    const e = rasteryzujSciezki(d, 50, { regula: 'evenodd' });
    const n = rasteryzujSciezki(d, 50, { regula: 'nonzero' });
    expect([...e]).toEqual([...n]);
    expect(e[25 * 50 + 25]).toBe(0);
  });

  it('krawędzie współliniowe (styk kwadratów) – suma bez szwu', () => {
    const k = polacz([kw(0, 0, 10)], [kw(10, 0, 10)]);
    expect(k.length).toBe(1);
    expect(poleKsztaltu(k)).toBeCloseTo(200, 6);
  });

  it('reguła parzystości wejścia (evenodd) – zagnieżdżone kontury dają pierścień', () => {
    const k = operacja([kw(0, 0, 10), kw(2, 2, 6)], [], (a) => a, { parzystoscA: true });
    expect(poleKsztaltu(k)).toBeCloseTo(64, 6);
  });
});

describe('obrys linii', () => {
  it('odcinek z okrągłymi końcami ma pole prostokąta + koła', () => {
    const k = polacz(obrys([[0, 0], [20, 0]], 4));
    expect(poleKsztaltu(k)).toBeCloseTo(20 * 4 + Math.PI * 4, 0);
  });

  it('zamknięta, gładka i samoprzecinająca się krzywa (ósemka) – kontur bez wypełnionych pętli', () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 200; i++) {
      const t = (2 * Math.PI * i) / 200;
      pts.push([50 + 40 * Math.cos(t), 50 + 20 * Math.sin(2 * t)]);
    }
    const k = polacz(obrys(pts, 4, { zamknieta: true }));
    // środek pętli (x ≈ 28, y = 50) pusty
    const r = rasteryzujSciezki([doD(k)], 100);
    expect(r[50 * 100 + 28]).toBe(0);
    expect(poleKsztaltu(k)).toBeGreaterThan(0);
  });

  it('kwadrat zaokrąglony i wsunięcie wielokąta wypukłego', () => {
    expect(Math.abs(pole(zaokraglij(kw(0, 0, 10), 2)))).toBeCloseTo(100 - (4 - Math.PI) * 4, 0);
    expect(Math.abs(pole(wsun(kw(0, 0, 10), 1)))).toBeCloseTo(64, 6);
    // cięciwy w tolerancji 0,03 jednostki – pole wielokąta wpisanego w ok. 0,5 % od koła
    expect(Math.abs(pole(kolo(0, 0, 10))) / (Math.PI * 100)).toBeGreaterThan(0.99);
  });
});

describe('sciezka-svg', () => {
  it('parsuje wszystkie polecenia (względne i bezwzględne, łuki, sklejone flagi)', () => {
    const seg = parsujD('M10 10h20v20H10zm40 0l10 10q5 5 10 0t10 0c1 1 2 2 3 3s4 4 5 5a5 5 0 0110 0A5 5 0 1 0 90 30Z');
    expect(seg).not.toBeNull();
    const d = segmentyDoD(seg!);
    expect(d).toMatch(/^[MLCZ0-9 .-]+$/);
    expect(splaszcz(seg!).length).toBe(2);
  });
  it('błąd składni → null', () => {
    expect(parsujD('M10')).toBeNull();
    expect(parsujD('L10 10')).toBeNull();
    expect(parsujD('M0 0 X')).toBeNull();
    expect(parsujD('M1e999 0')).toBeNull();
  });
});
