/**
 * Kreator marki – reguły jakości liczone automatycznie (koncepcja 3.4): kontrast, czytelność w 16 px, minimalne
 * rozmiary, napis dwuwierszowy, krój z katalogu. Serwer odrzuca kierunek z błędami (dobiera zamiennik bez AI),
 * ostrzeżenia pokazuje panel.
 *
 * Czytelność w 16 px – heurystyka geometryczna na rastrze 100×100 (1 px = 1 jednostka pola znaku):
 * - „cienkie elementy”: otwarcie morfologiczne kołem o promieniu 2,5 (usuwa wszystko węższe niż ok. 5–6 jednostek,
 *   czyli niecały 1 px faviconu 16 px); udział utraconego tuszu > 10 % = znak się rozsypie;
 * - „zlewające się szczeliny”: domknięcie kołem o promieniu 2 – udział domkniętego tła > 8 % = prześwity znikną;
 * - liczba elementów (spójnych składowych tuszu w 32×32) > 9 = za drobny.
 */
import type { ProjektLogo } from './model.ts';
import { KATALOG_FONTOW, czyFontWKatalogu } from '../style/katalog-stylow.ts';
import { kontrast } from '../style/kolory.ts';
import { rodzinaPoId } from './sygnety/katalog.ts';
import { rasteryzujSciezki, sciezkiZSvg } from './odcisk.ts';
import { MIN_KONTRAST_AKCENTU_JASNEGO, MIN_KONTRAST_NAPISU, MIN_KONTRAST_ZNAKU } from './kolory-marki.ts';
import { rysujSygnet, wierszeNapisu } from './zloz.ts';
import { MIN_FAVICON_PX, MIN_LOGO_DRUK_MM, MIN_LOGO_PX, MIN_PODPIS_PX } from './reguly-stale.ts';

export { MIN_FAVICON_PX, MIN_LOGO_DRUK_MM, MIN_LOGO_PX, MIN_PODPIS_PX };

export const MINIMALNE_ROZMIARY = {
  logoEkranPx: MIN_LOGO_PX,
  logoDrukMm: MIN_LOGO_DRUK_MM,
  podpisOdPx: MIN_PODPIS_PX,
  faviconPx: MIN_FAVICON_PX,
} as const;

export const PROGI_CZYTELNOSCI = { cienkie: 0.1, szczeliny: 0.08, elementy: 9 } as const;

export interface AnalizaCzytelnosci {
  /** Udział tuszu cieńszego niż ok. 5–6 jednostek (0–1). */
  cienkie: number;
  /** Udział szczelin węższych niż ok. 4 jednostki (względem tuszu, 0–1). */
  szczeliny: number;
  /** Liczba spójnych elementów w rastrze 32×32. */
  elementy: number;
  /** Pokrycie pola (0–1). */
  pokrycie: number;
}

function binarny(d: string[], n: number): Uint8Array {
  const r = rasteryzujSciezki(d, n, { nadprobkowanie: 3 });
  return r.map((v) => (v >= 128 ? 1 : 0));
}

function morfologia(b: Uint8Array, n: number, r: number, erozja: boolean): Uint8Array {
  const R = Math.ceil(r);
  const off: [number, number][] = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r + 0.01) off.push([dx, dy]);
  const w = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let v = erozja ? 1 : 0;
      for (const [dx, dy] of off) {
        const xx = x + dx;
        const yy = y + dy;
        const q = xx < 0 || yy < 0 || xx >= n || yy >= n ? 0 : b[yy * n + xx];
        if (erozja && !q) {
          v = 0;
          break;
        }
        if (!erozja && q) {
          v = 1;
          break;
        }
      }
      w[y * n + x] = v;
    }
  return w;
}

const suma = (b: Uint8Array) => {
  let s = 0;
  for (const v of b) s += v;
  return s;
};

function skladowe(b: Uint8Array, n: number): number {
  const odw = new Uint8Array(n * n);
  let ile = 0;
  const stos: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (!b[i] || odw[i]) continue;
    ile++;
    stos.push(i);
    odw[i] = 1;
    while (stos.length) {
      const p = stos.pop()!;
      const x = p % n;
      const y = (p - x) / n;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const q = yy * n + xx;
          if (b[q] && !odw[q]) {
            odw[q] = 1;
            stos.push(q);
          }
        }
    }
  }
  return ile;
}

/** Analiza czytelności znaku (wnętrze SVG albo pełny SVG z `<path>` w polu 0–100). */
export function analizaCzytelnosci(svg: string): AnalizaCzytelnosci {
  const d = sciezkiZSvg(svg);
  const n = 100;
  const b = binarny(d, n);
  const tusz = Math.max(1, suma(b));
  const otwarte = morfologia(morfologia(b, n, 2.5, true), n, 2.5, false);
  const domkniete = morfologia(morfologia(b, n, 2, false), n, 2, true);
  return {
    cienkie: Math.max(0, 1 - suma(otwarte) / tusz),
    szczeliny: Math.max(0, (suma(domkniete) - suma(b)) / tusz),
    elementy: skladowe(binarny(d, 32), 32),
    pokrycie: suma(b) / (n * n),
  };
}

export interface OcenaProjektu {
  ok: boolean;
  bledy: string[];
  ostrzezenia: string[];
}

/** Ocena projektu logo – komunikaty po polsku dla panelu (błąd = projekt nie przechodzi). */
export function ocenProjekt(projekt: ProjektLogo, nazwa: string): OcenaProjektu {
  const bledy: string[] = [];
  const ostrzezenia: string[] = [];
  const k = projekt.kolory;
  const f1 = (x: number) => x.toFixed(2).replace('.', ',');

  // kontrast
  const kZnak = kontrast(k.glowny, '#FFFFFF');
  if (kZnak < MIN_KONTRAST_ZNAKU) bledy.push(`Kolor główny ma za mały kontrast z bielą (${f1(kZnak)}:1, wymagane co najmniej 3:1).`);
  else if (kZnak < MIN_KONTRAST_NAPISU)
    ostrzezenia.push(`Napis w kolorze głównym ma kontrast ${f1(kZnak)}:1 z bielą – zalecamy co najmniej 4,5:1, żeby był czytelny jak tekst.`);
  const kAkc = kontrast(k.akcent, '#FFFFFF');
  if (kAkc < MIN_KONTRAST_ZNAKU) bledy.push(`Kolor akcentu ma za mały kontrast z bielą (${f1(kAkc)}:1, wymagane co najmniej 3:1 dla grafiki).`);
  const kJ = kontrast(k.akcentJasny, k.glowny);
  if (kJ < MIN_KONTRAST_AKCENTU_JASNEGO)
    bledy.push(`Jasny akcent ginie na kolorze głównym (${f1(kJ)}:1, wymagane co najmniej 3:1) – negatyw logo będzie nieczytelny.`);

  // krój
  const font = KATALOG_FONTOW.find((f) => f.rodzina === projekt.napis.font);
  if (!czyFontWKatalogu(projekt.napis.font)) bledy.push('Krój napisu spoza katalogu (dozwolone tylko kroje na licencji SIL OFL z katalogu).');
  else if (font && !font.wagi.includes(projekt.napis.waga))
    ostrzezenia.push(`Krój ${font.rodzina} nie ma grubości ${projekt.napis.waga} – użyjemy najbliższej dostępnej.`);
  for (const f of [projekt.fonty.naglowki, projekt.fonty.tekst])
    if (!czyFontWKatalogu(f)) bledy.push(`Krój „${f}” spoza katalogu.`);

  // napis
  const slowa = nazwa.trim().split(/\s+/).filter(Boolean);
  if (projekt.napis.styl === 'dwa' && slowa.length < 2) bledy.push('Napis w dwóch wierszach wymaga nazwy z co najmniej dwóch słów.');
  if (wierszeNapisu(nazwa, projekt.napis.styl).some((w) => [...w].length > 22) && projekt.uklad !== 'pionowy')
    ostrzezenia.push('Długa nazwa – w małych rozmiarach rozważ układ pionowy albo napis w dwóch wierszach.');

  // sygnet
  const s = projekt.sygnet;
  if (s.typ === 'biblioteka') {
    const r = rodzinaPoId(s.rodzina);
    if (!r) bledy.push('Nieznana rodzina znaku.');
    else {
      for (const p of r.parametry) {
        const v = s.parametry[p.klucz];
        if (v !== undefined && (v < p.min || v > p.max)) ostrzezenia.push(`Parametr „${p.opis}” poza zakresem – przyjęto wartość graniczną.`);
      }
    }
  }
  if (s.typ !== 'brak') {
    const pelny = rysujSygnet(s, { nazwa });
    if (!pelny) bledy.push(s.typ === 'biblioteka' ? 'Nie udało się narysować znaku.' : 'Symbol nie przeszedł walidacji SVG.');
    else {
      const fav = rysujSygnet(s, { nazwa, wariant: 'favicon' });
      const a = analizaCzytelnosci(fav);
      if (a.cienkie > PROGI_CZYTELNOSCI.cienkie)
        (s.typ === 'biblioteka' ? bledy : ostrzezenia).push('Znak ma zbyt cienkie elementy – w faviconie 16 px się rozsypie.');
      if (a.szczeliny > PROGI_CZYTELNOSCI.szczeliny) ostrzezenia.push('Prześwity w znaku są wąskie – w małym rozmiarze mogą się zlać.');
      if (a.elementy > PROGI_CZYTELNOSCI.elementy) ostrzezenia.push('Znak składa się z wielu drobnych elementów – w faviconie będzie nieczytelny.');
      if (a.pokrycie < 0.08) ostrzezenia.push('Znak jest bardzo lekki – w małym rozmiarze może być słabo widoczny.');
    }
  } else if (projekt.uklad === 'sygnet') bledy.push('Układ „sam znak” wymaga sygnetu.');

  return { ok: bledy.length === 0, bledy, ostrzezenia };
}

/** Co pokazać przy danej wysokości logo (px na ekranie). */
export function elementyDlaWysokosci(px: number): { sygnetSam: boolean; podpis: boolean } {
  return { sygnetSam: px < MIN_LOGO_PX, podpis: px >= MIN_PODPIS_PX };
}
