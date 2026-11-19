import { losZZiarna } from '../../ai/kierunki.ts';
import { oklabDoHex, rgbDoOklab } from '../../style/kolory.ts';

/**
 * Analiza wgranego logo (ścieżka „Mam logo – Key Visual” i „Odświeżenie”) – czyste funkcje na pikselach RGBA
 * (Uint8 / Uint8Clamped, 4 bajty na piksel, wiersz po wierszu – tak oddaje je dekoder PNG w API).
 *
 *  - `kolorySzkieletowe` – kolory dominujące: k-means w OKLab (odległość euklidesowa ≈ różnica postrzegana;
 *    https://bottosson.github.io/posts/oklab/), z pominięciem przezroczystości, tła (kolor ramki obrazu) i pikseli
 *    krawędzi (wygładzanie krawędzi daje kolory pośrednie, których w logo nie ma);
 *  - `wykryjGradient`, `wykryjCien` – heurystyki problemów do druku i do wycinania z folii (to liczy serwer,
 *    nie model – model dostaje wynik jako fakt);
 *  - kontrast kolorów z tłem liczy `kontrast` z style/kolory.ts (WCAG 2.x).
 *
 * Deterministyczne: ten sam obraz = ten sam wynik (k-means++ z ziarnem stałym).
 */

export type Piksele = Uint8Array | Uint8ClampedArray;
type Lab = [number, number, number];

export interface KolorObrazu {
  hex: string;
  /** Udział w pikselach logo (bez tła i przezroczystości), 0–1. */
  udzial: number;
  lab: Lab;
}

export interface KoloryObrazu {
  /** Kolory logo od największego udziału. */
  kolory: KolorObrazu[];
  /** Kolor tła (ramka obrazu) albo null – tło przezroczyste / brak jednolitej ramki. */
  tlo: string | null;
  /** Obraz ma przezroczystość (kanał alfa < 255 w ≥ 1% pikseli). */
  przezroczysty: boolean;
  /** Liczba pikseli logo (bez tła), na których liczono kolory. */
  pikseleLogo: number;
}

/** Próg ΔE OKLab: kolory bliższe to „ten sam kolor” (≈ 2–3 JND). */
export const PROG_TEGO_SAMEGO = 0.035;
const PROG_ALFA = 128;
const MAKS_PROBEK = 60_000;

export const odlegloscLab = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Siatka OKLab obrazu (null = piksel przezroczysty). */
export function siatkaLab(piksele: Piksele, szer: number, wys: number): (Lab | null)[] {
  if (piksele.length < szer * wys * 4) throw new Error('Za mało danych pikseli dla podanych wymiarów (RGBA).');
  const wynik: (Lab | null)[] = new Array(szer * wys);
  const pamiec = new Map<number, Lab>();
  for (let i = 0; i < szer * wys; i++) {
    const o = i * 4;
    if (piksele[o + 3] < PROG_ALFA) {
      wynik[i] = null;
      continue;
    }
    const klucz = (piksele[o] << 16) | (piksele[o + 1] << 8) | piksele[o + 2];
    let lab = pamiec.get(klucz);
    if (!lab) {
      lab = rgbDoOklab(piksele[o], piksele[o + 1], piksele[o + 2]);
      pamiec.set(klucz, lab);
    }
    wynik[i] = lab;
  }
  return wynik;
}

/** Kolor tła = dominujący kolor ramki (≥ 60% pikseli ramki w promieniu PROG_TEGO_SAMEGO); ramka przezroczysta → null. */
export function tloRamki(lab: (Lab | null)[], szer: number, wys: number): Lab | null {
  const ramka: Lab[] = [];
  let przezroczyste = 0;
  const dodaj = (x: number, y: number) => {
    const p = lab[y * szer + x];
    if (p) ramka.push(p);
    else przezroczyste++;
  };
  for (let x = 0; x < szer; x++) {
    dodaj(x, 0);
    if (wys > 1) dodaj(x, wys - 1);
  }
  for (let y = 1; y < wys - 1; y++) {
    dodaj(0, y);
    if (szer > 1) dodaj(szer - 1, y);
  }
  const wszystkie = ramka.length + przezroczyste;
  if (!ramka.length || przezroczyste / wszystkie > 0.4) return null;
  // Mediana kanałów jako kandydat, potem średnia pikseli bliskich kandydatowi.
  const med = (k: number) => ramka.map((p) => p[k]).sort((a, b) => a - b)[ramka.length >> 1];
  const kandydat: Lab = [med(0), med(1), med(2)];
  const bliskie = ramka.filter((p) => odlegloscLab(p, kandydat) < PROG_TEGO_SAMEGO);
  if (bliskie.length / wszystkie < 0.6) return null;
  return [0, 1, 2].map((k) => bliskie.reduce((s, p) => s + p[k], 0) / bliskie.length) as Lab;
}

/** Piksel „płaski”: różnica do 4 sąsiadów < próg – nie leży na krawędzi (wygładzanie, kolory pośrednie). */
function plaski(lab: (Lab | null)[], szer: number, wys: number, i: number): boolean {
  const p = lab[i];
  if (!p) return false;
  const x = i % szer;
  const y = (i - x) / szer;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= szer || ny >= wys) continue;
    const q = lab[ny * szer + nx];
    if (!q || odlegloscLab(p, q) > PROG_TEGO_SAMEGO) return false;
  }
  return true;
}

/** k-means++ (deterministyczny) + iteracje Lloyda; zwraca środki i liczności. */
function kSrednich(probki: Lab[], k: number, ziarno = 7): { srodki: Lab[]; licznosci: number[] } {
  const los = losZZiarna(ziarno);
  const srodki: Lab[] = [probki[Math.floor(los() * probki.length)]];
  const d2 = probki.map((p) => odlegloscLab(p, srodki[0]) ** 2);
  while (srodki.length < k) {
    const suma = d2.reduce((s, x) => s + x, 0);
    if (suma <= 1e-12) break;
    let r = los() * suma;
    let wybrany = probki.length - 1;
    for (let i = 0; i < probki.length; i++) {
      r -= d2[i];
      if (r <= 0) {
        wybrany = i;
        break;
      }
    }
    const s = probki[wybrany];
    srodki.push(s);
    for (let i = 0; i < probki.length; i++) d2[i] = Math.min(d2[i], odlegloscLab(probki[i], s) ** 2);
  }
  const przypisanie = new Int32Array(probki.length).fill(-1);
  let licznosci = new Array<number>(srodki.length).fill(0);
  for (let it = 0; it < 24; it++) {
    let zmiany = 0;
    const sumy = srodki.map(() => [0, 0, 0]);
    licznosci = new Array<number>(srodki.length).fill(0);
    for (let i = 0; i < probki.length; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < srodki.length; c++) {
        const d = odlegloscLab(probki[i], srodki[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (przypisanie[i] !== best) {
        przypisanie[i] = best;
        zmiany++;
      }
      licznosci[best]++;
      for (let k2 = 0; k2 < 3; k2++) sumy[best][k2] += probki[i][k2];
    }
    for (let c = 0; c < srodki.length; c++) if (licznosci[c]) srodki[c] = sumy[c].map((s) => s / licznosci[c]) as Lab;
    if (!zmiany) break;
  }
  return { srodki, licznosci };
}

export interface OpcjeKolorow {
  /** Minimalny udział koloru (domyślnie 1%) – mniejsze to szum, resztki krawędzi, kompresja JPG. */
  minUdzial?: number;
}

/**
 * Kolory dominujące logo (do `k`, zwykle 2–5). Pomija piksele przezroczyste, tło (kolor ramki) i krawędzie;
 * skupienia bliższe niż PROG_TEGO_SAMEGO łączy, a o udziale < `minUdzial` odrzuca.
 */
export function kolorySzkieletowe(piksele: Piksele, szer: number, wys: number, k: number, opcje: OpcjeKolorow = {}): KoloryObrazu {
  const lab = siatkaLab(piksele, szer, wys);
  const przezroczyste = lab.reduce((s, p) => s + (p ? 0 : 1), 0);
  const tlo = tloRamki(lab, szer, wys);
  const logo: number[] = [];
  for (let i = 0; i < lab.length; i++) {
    const p = lab[i];
    if (p && !(tlo && odlegloscLab(p, tlo) < PROG_TEGO_SAMEGO * 1.5)) logo.push(i);
  }
  const wynikPusty: KoloryObrazu = { kolory: [], tlo: tlo ? oklabDoHex(...tlo) : null, przezroczysty: przezroczyste / lab.length >= 0.01, pikseleLogo: logo.length };
  if (!logo.length) return wynikPusty;

  const plaskie = logo.filter((i) => plaski(lab, szer, wys, i));
  const zrodlo = plaskie.length >= Math.max(30, logo.length * 0.2) ? plaskie : logo;
  const krok = Math.max(1, Math.ceil(zrodlo.length / MAKS_PROBEK));
  const probki: Lab[] = [];
  for (let i = 0; i < zrodlo.length; i += krok) probki.push(lab[zrodlo[i]]!);

  const { srodki, licznosci } = kSrednich(probki, Math.max(1, Math.min(8, Math.floor(k))));
  // Łączenie bliskich skupień (ważone licznością).
  const grupy = srodki.map((s, i) => ({ lab: s, n: licznosci[i] })).filter((g) => g.n > 0);
  for (let polaczono = true; polaczono; ) {
    polaczono = false;
    for (let a = 0; a < grupy.length && !polaczono; a++) {
      for (let b = a + 1; b < grupy.length; b++) {
        if (odlegloscLab(grupy[a].lab, grupy[b].lab) < PROG_TEGO_SAMEGO) {
          const n = grupy[a].n + grupy[b].n;
          grupy[a] = { lab: [0, 1, 2].map((q) => (grupy[a].lab[q] * grupy[a].n + grupy[b].lab[q] * grupy[b].n) / n) as Lab, n };
          grupy.splice(b, 1);
          polaczono = true;
          break;
        }
      }
    }
  }
  const suma = grupy.reduce((s, g) => s + g.n, 0);
  const minUdzial = opcje.minUdzial ?? 0.01;
  const kolory = grupy
    .map((g) => ({ hex: oklabDoHex(...g.lab), udzial: g.n / suma, lab: g.lab }))
    .filter((c) => c.udzial >= minUdzial)
    .sort((a, b) => b.udzial - a.udzial || a.hex.localeCompare(b.hex));
  const sumaPo = kolory.reduce((s, c) => s + c.udzial, 0) || 1;
  return { ...wynikPusty, kolory: kolory.map((c) => ({ ...c, udzial: Math.round((c.udzial / sumaPo) * 1000) / 1000 })) };
}

/** Najbliższy kolor z listy (indeks i odległość). */
export function najblizszy(p: Lab, lista: Lab[]): { i: number; d: number } {
  let i = -1;
  let d = Infinity;
  for (let j = 0; j < lista.length; j++) {
    const x = odlegloscLab(p, lista[j]);
    if (x < d) {
      d = x;
      i = j;
    }
  }
  return { i, d };
}

/**
 * Narastanie (rampa) w pikselu `i`: kolor zmienia się w tę samą stronę po obu stronach piksela, w poziomie albo
 * w pionie, na odcinku ±`krok` px (każdy przyrost ≥ `min` ΔE, kierunek zgodny – cos ≥ 0,7). Płaski kolor ma przyrost 0,
 * szum kompresji – przypadkowy kierunek, krawędź – skok tylko z jednej strony. Rampa = gradient albo rozmyty cień.
 */
function rampa(lab: (Lab | null)[], szer: number, wys: number, i: number, krok: number, min: number): boolean {
  const p = lab[i];
  if (!p) return false;
  const x = i % szer;
  const y = (i - x) / szer;
  for (const [dx, dy] of [[krok, 0], [0, krok]] as const) {
    const ax = x - dx;
    const ay = y - dy;
    const bx = x + dx;
    const by = y + dy;
    if (ax < 0 || ay < 0 || bx >= szer || by >= wys) continue;
    const a = lab[ay * szer + ax];
    const b = lab[by * szer + bx];
    if (!a || !b) continue;
    const d1: Lab = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const d2: Lab = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
    const n1 = Math.hypot(...d1);
    const n2 = Math.hypot(...d2);
    if (n1 < min || n2 < min || n1 > PROG_TEGO_SAMEGO * 3 || n2 > PROG_TEGO_SAMEGO * 3) continue;
    if ((d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]) / (n1 * n2) >= 0.7) return true;
  }
  return false;
}

/**
 * Gradient: w pikselach logo (bez tła) udział pikseli na rampie (kolor narasta w jednym kierunku o ≥ 0,004 ΔE na
 * 3 px) ≥ 25%. Wynik nie zależy od liczby kolorów k (k-means rozbiłby gradient na kilka „płaskich” kolorów).
 */
export function wykryjGradient(piksele: Piksele, szer: number, wys: number, kolory: KoloryObrazu): { gradient: boolean; udzial: number } {
  const lab = siatkaLab(piksele, szer, wys);
  const tlo = kolory.tlo ? labZHex(kolory.tlo) : null;
  let logo = 0;
  let narasta = 0;
  for (let i = 0; i < lab.length; i++) {
    const p = lab[i];
    if (!p || (tlo && odlegloscLab(p, tlo) < PROG_TEGO_SAMEGO * 1.5)) continue;
    logo++;
    if (rampa(lab, szer, wys, i, 3, 0.004)) narasta++;
  }
  const udzial = logo ? narasta / logo : 0;
  return { gradient: logo >= 30 && udzial >= 0.25, udzial: Math.round(udzial * 1000) / 1000 };
}

function labZHex(hex: string): Lab {
  const n = parseInt(hex.slice(1), 16);
  return rgbDoOklab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

const SASIEDZI = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Cień (rozmyty, przesunięty) albo poświata. Tło jednolite: piksele ciemniejsze od tła (≥ 0,03 L) w barwie tła
 * (chroma względem tła < 0,03) leżące na rampie (rozmycie) – wygładzanie krawędzi daje ich ok. tyle, ile pikseli
 * obwodu, cień – wielokrotność obwodu (próg 2,5×). Szary element logo bez rozmycia nie jest rampą.
 * PNG z przezroczystością: półprzezroczyste piksele (alfa 16–239) ≥ 6% pikseli pełnych i > 3× obwód.
 */
export function wykryjCien(piksele: Piksele, szer: number, wys: number, kolory: KoloryObrazu): { cien: boolean; miara: number } {
  if (kolory.przezroczysty) {
    let pol = 0;
    let pelne = 0;
    let obwod = 0;
    const alfa = (x: number, y: number) => piksele[(y * szer + x) * 4 + 3];
    for (let y = 0; y < wys; y++) {
      for (let x = 0; x < szer; x++) {
        const a = alfa(x, y);
        if (a >= 16 && a < 240) pol++;
        if (a < 240) continue;
        pelne++;
        if (SASIEDZI.some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < szer && y + dy < wys && alfa(x + dx, y + dy) < 240)) obwod++;
      }
    }
    const miara = obwod ? pol / obwod : 0;
    return { cien: pelne > 0 && pol / pelne >= 0.06 && miara > 3, miara: Math.round(miara * 100) / 100 };
  }
  if (!kolory.tlo) return { cien: false, miara: 0 };
  const lab = siatkaLab(piksele, szer, wys);
  const tlo = labZHex(kolory.tlo);
  let cieniste = 0;
  let obwod = 0;
  for (let i = 0; i < lab.length; i++) {
    const p = lab[i];
    if (!p) continue;
    const x = i % szer;
    const y = (i - x) / szer;
    if (odlegloscLab(p, tlo) < PROG_TEGO_SAMEGO) {
      const przyKsztalcie = SASIEDZI.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        const q = nx >= 0 && ny >= 0 && nx < szer && ny < wys ? lab[ny * szer + nx] : null;
        return q !== null && odlegloscLab(q, tlo) >= PROG_TEGO_SAMEGO;
      });
      if (przyKsztalcie) obwod++;
      continue;
    }
    const ciemniejszy = tlo[0] - p[0] >= 0.03;
    const chromaWzgl = Math.hypot(p[1] - tlo[1], p[2] - tlo[2]);
    if (ciemniejszy && chromaWzgl < 0.03 && rampa(lab, szer, wys, i, 2, 0.004)) cieniste++;
  }
  const miara = obwod ? cieniste / obwod : 0;
  return { cien: miara > 2.5 && cieniste >= 40, miara: Math.round(miara * 100) / 100 };
}
