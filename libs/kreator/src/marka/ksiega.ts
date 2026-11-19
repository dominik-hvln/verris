/**
 * Kreator marki – księga znaku (koncepcja 3.8): 10 stron A4 – okładka, znak i konstrukcja, pole ochronne,
 * minimalne rozmiary, warianty, kolory (HEX/RGB/CMYK orientacyjnie, kontrast), typografia, błędy użycia,
 * materiały, informacja prawna (TMview, AI, licencje krojów).
 *
 * Jedno źródło dwóch wyjść: `stronyKsiegi()` zwraca bloki z pozycjami w milimetrach (tekst w punktach typograficznych),
 * `ksiegaHtml()` renderuje z nich samodzielny HTML z `@page A4` (druk przez Chromium w API). Gdy Chromium
 * niedostępny, API może złożyć PDF z tych samych bloków (pdf-lib: tekst i prostokąty wektorowo, bloki SVG
 * zrasteryzowane albo przez drawSvgPath dla samych ścieżek).
 */
import type { Marka } from './model.ts';
import type { WariantKoloru } from './typy.ts';
import { esc } from '../render/esc.ts';
import { KATALOG_FONTOW } from '../style/katalog-stylow.ts';
import { hexDoOklch, kontrast, oklchDoHex } from '../style/kolory.ts';
import { formatCmyk, opisKoloru } from './kolory-marki.ts';
import { rodzinaPoId } from './sygnety/katalog.ts';
import { pokolorujSygnet, rysujSygnet, zlozLogo } from './zloz.ts';
import { skrot } from './skrot.ts';
import { MIN_FAVICON_PX, MIN_LOGO_DRUK_MM, MIN_LOGO_PX, MIN_PODPIS_PX } from './reguly-stale.ts';
import type { KsztaltyKv } from './kv/wspolne.ts';
import { mieszaj, zawin } from './kv/wspolne.ts';
import { post } from './kv/social.ts';
import { papierFirmowy, wizytowka } from './kv/druk.ts';

export type BlokKsiegi =
  | { typ: 'svg'; svg: string; x: number; y: number; w: number; h: number; opis?: string }
  | {
      typ: 'tekst';
      wiersze: string[];
      x: number;
      y: number;
      /** Wielkość w pt. */
      rozmiar: number;
      waga: number;
      kolor: string;
      font: 'naglowki' | 'tekst';
      wyrownanie?: 'lewo' | 'srodek' | 'prawo';
      szer?: number;
    }
  | { typ: 'prostokat'; x: number; y: number; w: number; h: number; kolor: string; promien?: number; obrys?: string; przerywany?: boolean };

export interface StronaKsiegi {
  numer: number;
  tytul: string;
  bloki: BlokKsiegi[];
}

export interface OpcjeKsiegi {
  ksztalty?: KsztaltyKv;
  /** Data wydania (np. „19.11.2026”) – z API, żeby wynik był deterministyczny. */
  data?: string;
  wersja?: string;
  /** Reguły @font-face krojów marki (z API, adresy plików lokalnych) – dla Chromium. */
  fontyCss?: string;
}

const W = 210;
const H = 297;
const M = 18;
const PT = 0.3528;

const f2 = (x: number) => String(Math.round(x * 100) / 100);

/** Zawija tekst do szerokości (mm) przy danej wielkości (pt) – szacunek 0,5 em na znak. */
export function zawinMm(tekst: string, szerMm: number, rozmiarPt: number): string[] {
  const naZnak = rozmiarPt * PT * 0.5;
  const maks = Math.max(8, Math.floor(szerMm / naZnak));
  return tekst.split('\n').flatMap((akapit) => (akapit.trim() ? zawin(akapit, maks, 999) : ['']));
}

type EfektBledu = 'rozciagnij' | 'kolor' | 'cien' | 'obrot' | 'kroj';

/** Samodzielny SVG z kolorowym tłem i logo wpisanym centralnie (do bloków); `efekt` – przykład błędnego użycia. */
function logoNaTle(
  m: Marka,
  o: OpcjeKsiegi,
  uklad: 'poziomy' | 'pionowy' | 'sygnet',
  wariant: WariantKoloru,
  tlo: string | null,
  w: number,
  h: number,
  wysLogo: number,
  efekt?: EfektBledu,
): string {
  let projekt = m.projekt;
  let ksztalty = o.ksztalty;
  if (efekt === 'kolor') {
    const g = hexDoOklch(projekt.kolory.glowny);
    const a = hexDoOklch(projekt.kolory.akcent);
    projekt = {
      ...projekt,
      kolory: { ...projekt.kolory, glowny: oklchDoHex({ ...g, h: (g.h + 140) % 360, c: Math.max(g.c, 0.12) }), akcent: oklchDoHex({ ...a, h: (a.h + 140) % 360 }) },
    };
  }
  if (efekt === 'kroj') {
    projekt = { ...projekt, napis: { ...projekt.napis, font: 'Caveat', waga: 700 } };
    ksztalty = undefined;
  }
  const z = zlozLogo(projekt, m.brief.nazwa, m.brief.podpis, {
    uklad,
    wariant,
    napis: ksztalty?.napis,
    napis2: ksztalty?.napis2,
    podpis: ksztalty?.podpis,
    metadaneAi: false,
    tlo: false,
  });
  const s = Math.min(wysLogo / z.wysokosc, (w * 0.86) / z.szerokosc);
  let lw = z.szerokosc * s;
  let lh = z.wysokosc * s;
  if (efekt === 'rozciagnij') {
    lw = Math.min(w * 0.95, lw * 1.45);
    lh *= 0.7;
  }
  const wn = /^<svg\b[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>$/.exec(z.svg);
  const vb = wn?.[1] ?? '0 0 100 100';
  const tresc = (wn?.[2] ?? '').replace(/<title>[\s\S]*?<\/title>/, '');
  const t = tlo ? `<rect width="${w}" height="${h}" fill="${tlo}"/>` : '';
  const idC = `c${skrot(tresc)}`;
  const defs = efekt === 'cien' ? `<defs><filter id="${idC}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="1.2" dy="1.4" stdDeviation="0.9" flood-color="#000000" flood-opacity="0.45"/></filter></defs>` : '';
  const g = efekt === 'cien' ? ` filter="url(#${idC})"` : efekt === 'obrot' ? ` transform="rotate(-14 ${f2(w / 2)} ${f2(h / 2)})"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(w)}mm" height="${f2(h)}mm" viewBox="0 0 ${f2(w)} ${f2(h)}">${defs}${t}` +
    `<g${g}><svg x="${f2((w - lw) / 2)}" y="${f2((h - lh) / 2)}" width="${f2(lw)}" height="${f2(lh)}" viewBox="${vb}"${efekt === 'rozciagnij' ? ' preserveAspectRatio="none"' : ''}>${tresc}</svg></g></svg>`
  );
}

function tekst(wiersze: string[] | string, x: number, y: number, rozmiar: number, kolor: string, o: Partial<Extract<BlokKsiegi, { typ: 'tekst' }>> = {}): BlokKsiegi {
  const w = typeof wiersze === 'string' ? (o.szer ? zawinMm(wiersze, o.szer, rozmiar) : [wiersze]) : wiersze;
  return { typ: 'tekst', wiersze: w, x, y, rozmiar, kolor, waga: o.waga ?? 400, font: o.font ?? 'tekst', wyrownanie: o.wyrownanie, szer: o.szer };
}

const wysTekstu = (b: BlokKsiegi) => (b.typ === 'tekst' ? b.wiersze.length * b.rozmiar * PT * 1.35 : 0);

export function stronyKsiegi(m: Marka, o: OpcjeKsiegi = {}): StronaKsiegi[] {
  const k = m.projekt.kolory;
  const p = k.paleta;
  const nazwa = m.brief.nazwa;
  const szary = p.tekstPrzygaszony;
  const strony: StronaKsiegi[] = [];
  const nowa = (tytul: string, wstep: string): BlokKsiegi[] => {
    const b: BlokKsiegi[] = [
      tekst(`Księga znaku – ${nazwa}`, M, 12, 8, szary),
      tekst(String(strony.length + 1), W - M, H - 14, 8, szary, { wyrownanie: 'prawo' }),
      tekst(tytul, M, 26, 22, k.glowny, { waga: 700, font: 'naglowki' }),
    ];
    if (wstep) b.push(tekst(wstep, M, 40, 10, p.tekst, { szer: W - 2 * M }));
    strony.push({ numer: strony.length + 1, tytul, bloki: b });
    return b;
  };

  // 1. Okładka
  {
    const b: BlokKsiegi[] = [{ typ: 'prostokat', x: 0, y: 0, w: W, h: H, kolor: p.tlo }];
    b.push({ typ: 'svg', svg: logoNaTle(m, o, 'poziomy', 'kolor', null, 170, 90, 40), x: 20, y: 70, w: 170, h: 90 });
    b.push({ typ: 'prostokat', x: M, y: 200, w: 24, h: 1.2, kolor: k.akcent });
    b.push(tekst('Księga znaku', M, 208, 30, k.glowny, { waga: 700, font: 'naglowki' }));
    b.push(tekst(nazwa, M, 224, 12, p.tekst));
    b.push(tekst([o.wersja ? `Wersja ${o.wersja}` : 'Wersja 1.0', o.data ?? ''].filter(Boolean).join(' · '), M, 231, 9, szary));
    b.push(tekst('Przygotowano w Verris Kreator marki z pomocą AI.', M, H - 20, 8, szary));
    strony.push({ numer: 1, tytul: 'Okładka', bloki: b });
  }

  // 2. Znak i konstrukcja
  {
    const s = m.projekt.sygnet;
    const r = s.typ === 'biblioteka' ? rodzinaPoId(s.rodzina) : undefined;
    const opis =
      s.typ === 'biblioteka'
        ? `Znak „${r?.nazwa ?? s.rodzina}” powstał z biblioteki kształtów Verris: ${r?.opis ?? ''} To wektor zbudowany z parametrów – te same parametry zawsze dają ten sam znak, więc plik można odtworzyć w dowolnym rozmiarze bez utraty jakości.`
        : s.typ === 'ai'
          ? 'Symbol zaproponował asystent AI; przed użyciem przeszedł walidację (wyłącznie wypełnione kształty, dwa kanały koloru, czytelność w małym rozmiarze).'
          : s.typ === 'wgrany'
            ? 'Znak pochodzi z pliku dostarczonego przez właściciela marki i został przeniesiony bez zmian kształtu.'
            : 'Marka używa samego znaku słownego (napisu) – bez sygnetu.';
    const b = nowa('Znak i konstrukcja', opis);
    const sygnet = rysujSygnet(s, { nazwa });
    if (sygnet) {
      const siatka = Array.from({ length: 11 }, (_, i) => `<path d="M${i * 10} 0V100M0 ${i * 10}H100" stroke="${mieszaj(p.tlo, k.glowny, 0.18)}" stroke-width="0.25" fill="none"/>`).join('');
      b.push({
        typ: 'svg',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="110mm" height="110mm" viewBox="-5 -5 110 110"><rect x="-5" y="-5" width="110" height="110" fill="${p.tlo}"/>${siatka}${pokolorujSygnet(sygnet, k.glowny, k.akcent)}</svg>`,
        x: 50,
        y: 70,
        w: 110,
        h: 110,
      });
    }
    b.push(
      tekst(
        'Proporcje logo poziomego: wysokość wersalików napisu = 0,4 wysokości znaku, odstęp znak–napis = 0,3 wysokości znaku, ' +
          'podpis wersalikami 0,11 wysokości znaku z rozstrzeleniem. Blok napisu jest wyśrodkowany optycznie na znaku. ' +
          'Nie składaj logo ręcznie – korzystaj z plików z pakietu.',
        M,
        192,
        9.5,
        p.tekst,
        { szer: W - 2 * M },
      ),
    );
    b.push({ typ: 'svg', svg: logoNaTle(m, o, 'poziomy', 'kolor', p.tlo, W - 2 * M, 60, 30), x: M, y: 214, w: W - 2 * M, h: 60 });
  }

  // 3. Pole ochronne
  {
    const b = nowa(
      'Pole ochronne',
      'Wokół logo zostaw wolne pole o szerokości x = połowa wysokości znaku. W tym polu nie umieszczaj tekstu, innych logo ani krawędzi strony. Pole ochronne dotyczy wszystkich wariantów i układów.',
    );
    const z = zlozLogo(m.projekt, nazwa, m.brief.podpis, { uklad: 'poziomy', wariant: 'kolor', napis: o.ksztalty?.napis, napis2: o.ksztalty?.napis2, podpis: o.ksztalty?.podpis, metadaneAi: false });
    const x = z.poleOchronne;
    const vbW = z.szerokosc + 2 * x;
    const vbH = z.wysokosc + 2 * x;
    const tresc = /^<svg\b[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>$/.exec(z.svg);
    const vb0 = (tresc?.[1] ?? '0 0 100 100').split(' ').map(Number);
    const ramka =
      `<rect x="${f2(vb0[0] - x)}" y="${f2(vb0[1] - x)}" width="${f2(vbW)}" height="${f2(vbH)}" fill="none" stroke="#D2453C" stroke-width="${f2(vbW / 300)}" stroke-dasharray="${f2(vbW / 80)} ${f2(vbW / 120)}"/>` +
      `<rect x="${f2(vb0[0] - x)}" y="${f2(vb0[1] - x)}" width="${f2(x)}" height="${f2(x)}" fill="#D2453C" fill-opacity="0.12"/>` +
      `<text x="${f2(vb0[0] - x / 2)}" y="${f2(vb0[1] - x / 2)}" font-size="${f2(x * 0.4)}" fill="#D2453C" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">x</text>`;
    const sw = W - 2 * M;
    const sh = (sw * vbH) / vbW;
    b.push({
      typ: 'svg',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(sw)}mm" height="${f2(sh)}mm" viewBox="${f2(vb0[0] - x * 1.1)} ${f2(vb0[1] - x * 1.1)} ${f2(vbW + x * 0.2)} ${f2(vbH + x * 0.2)}">${(tresc?.[2] ?? '').replace(/<title>[\s\S]*?<\/title>/, '')}${ramka}</svg>`,
      x: M,
      y: 80,
      w: sw,
      h: Math.min(sh, 120),
    });
  }

  // 4. Minimalne rozmiary
  {
    const b = nowa(
      'Minimalne rozmiary',
      `Logo poziome stosuj od ${MIN_LOGO_PX} px wysokości na ekranie i od ${MIN_LOGO_DRUK_MM} mm w druku. Poniżej ${MIN_PODPIS_PX} px usuń podpis, a poniżej ${MIN_LOGO_PX} px używaj samego znaku. Najmniejszy rozmiar znaku: favicon ${MIN_FAVICON_PX} px (osobny, pogrubiony wariant).`,
    );
    b.push({ typ: 'svg', svg: logoNaTle(m, o, 'poziomy', 'kolor', null, 80, 8, 8), x: M, y: 80, w: 80, h: 8 });
    b.push(tekst(`Druk: ${MIN_LOGO_DRUK_MM} mm`, M, 92, 9, szary));
    b.push({ typ: 'svg', svg: logoNaTle(m, o, 'poziomy', 'kolor', null, 90, 14, 14), x: M, y: 110, w: 90, h: 14 });
    b.push(tekst(`Ekran: od ${MIN_PODPIS_PX} px z podpisem`, M, 128, 9, szary));
    const fav = rysujSygnet(m.projekt.sygnet, { nazwa, wariant: 'favicon' });
    if (fav) {
      for (const [i, mm] of [4.2, 8.5, 17].entries()) {
        b.push({ typ: 'svg', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${mm}mm" height="${mm}mm" viewBox="0 0 100 100">${pokolorujSygnet(fav, k.glowny, k.akcent)}</svg>`, x: M + i * 26, y: 150 + (17 - mm), w: mm, h: mm });
      }
      b.push(tekst('Favicon 16, 32 i 64 px – wariant uproszczony, grubszy', M, 172, 9, szary));
    }
  }

  // 5. Warianty
  {
    const b = nowa('Warianty logo', 'Wersja kolorowa jest podstawowa. Jednobarwną stosuj do pieczątek, graweru i druku jednym kolorem, negatyw – na kolorze marki i ciemnych tłach, białą – na zdjęciach.');
    const sw = (W - 2 * M - 6) / 2;
    const sh = 46;
    const warianty: [WariantKoloru, string, string][] = [
      ['kolor', '#FFFFFF', 'Kolorowe – podstawowe'],
      ['mono', '#FFFFFF', 'Jednobarwne'],
      ['negatyw', k.glowny, 'Negatyw – na kolorze marki'],
      ['bialy', mieszaj(p.tekst, '#5A6470', 0.4), 'Białe – na zdjęciach i ciemnym tle'],
    ];
    warianty.forEach(([w, tlo, opis], i) => {
      const x = M + (i % 2) * (sw + 6);
      const y = 62 + Math.floor(i / 2) * (sh + 14);
      b.push({ typ: 'svg', svg: logoNaTle(m, o, 'poziomy', w, tlo, sw, sh, 16), x, y, w: sw, h: sh });
      b.push({ typ: 'prostokat', x, y, w: sw, h: sh, kolor: 'none', obrys: mieszaj(p.tlo, p.tekst, 0.15) });
      b.push(tekst(opis, x, y + sh + 2, 8.5, szary));
    });
    if (m.projekt.sygnet.typ !== 'brak') {
      const y = 62 + 2 * (sh + 14) + 4;
      b.push({ typ: 'svg', svg: logoNaTle(m, o, 'pionowy', 'kolor', '#FFFFFF', sw, 62, 44), x: M, y, w: sw, h: 62 });
      b.push({ typ: 'svg', svg: logoNaTle(m, o, 'sygnet', 'negatyw', k.glowny, sw, 62, 36), x: M + sw + 6, y, w: sw, h: 62 });
      b.push(tekst('Pionowe', M, y + 64, 8.5, szary));
      b.push(tekst('Sam znak – awatar, ikona aplikacji', M + sw + 6, y + 64, 8.5, szary));
    }
  }

  // 6. Kolory
  {
    const b = nowa(
      'Kolory',
      'Odpowiedniki CMYK są orientacyjne (prosta konwersja bez profilu ICC). Przed drukiem poproś drukarnię o przeliczenie kolorów jej profilem i wydruk próbny. Kontrast liczony wg WCAG 2.2.',
    );
    const kolory: [string, string, string][] = [
      ['Główny', k.glowny, `${kontrast(k.glowny, '#FFFFFF').toFixed(2).replace('.', ',')}:1 z bielą`],
      ['Akcent', k.akcent, `${kontrast(k.akcent, '#FFFFFF').toFixed(2).replace('.', ',')}:1 z bielą – grafika`],
      ['Akcent jasny', k.akcentJasny, `${kontrast(k.akcentJasny, k.glowny).toFixed(2).replace('.', ',')}:1 na głównym`],
      ['Tło', p.tlo, `${kontrast(p.tekst, p.tlo).toFixed(2).replace('.', ',')}:1 z tekstem`],
      ['Tekst', p.tekst, `${kontrast(p.tekst, '#FFFFFF').toFixed(2).replace('.', ',')}:1 z bielą`],
    ];
    kolory.forEach(([nazwaK, hex, kon], i) => {
      const y = 64 + i * 40;
      const d = opisKoloru(hex);
      b.push({ typ: 'prostokat', x: M, y, w: 48, h: 32, kolor: hex, promien: 2, obrys: mieszaj(p.tlo, p.tekst, 0.12) });
      b.push(tekst(nazwaK, M + 56, y + 1, 11, p.tekst, { waga: 700 }));
      b.push(tekst([`HEX ${d.hex}`, `RGB ${d.rgb.join(' ')}`, `CMYK (orientacyjnie) ${formatCmyk(d.cmyk)}`, `OKLCH ${d.oklch.l} ${d.oklch.c} ${d.oklch.h}`, kon], M + 56, y + 7, 8.5, szary));
    });
  }

  // 7. Typografia
  {
    const fN = m.projekt.fonty.naglowki;
    const fT = m.projekt.fonty.tekst;
    const fNap = m.projekt.napis.font;
    const b = nowa(
      'Typografia',
      'Kroje pochodzą z Google Fonts i są udostępnione na licencji SIL Open Font License 1.1 – można ich używać komercyjnie, także w logo i drukach. Przy przekazywaniu plików krojów dołącz tekst licencji (jest w pakiecie).',
    );
    const rodz = (f: string) => KATALOG_FONTOW.find((x) => x.rodzina === f);
    const wpis = (f: string, rola: string, y: number, font: 'naglowki' | 'tekst') => {
      b.push(tekst('Aą', M, y, 48, k.glowny, { font, waga: 600 }));
      b.push(tekst(f, M + 50, y + 4, 14, p.tekst, { font, waga: 700 }));
      b.push(tekst(`${rola} · grubości ${rodz(f)?.wagi.join(', ') ?? '–'}`, M + 50, y + 12, 9, szary));
      b.push(tekst('Zażółć gęślą jaźń 0123456789', M + 50, y + 19, 12, p.tekst, { font }));
    };
    wpis(fN, fN === fNap ? 'nagłówki i napis logo' : 'nagłówki', 66, 'naglowki');
    wpis(fT, 'tekst, dokumenty, strona', 112, 'tekst');
    if (fNap !== fN) b.push(tekst(`Napis w logo: ${fNap} (zamieniony na krzywe – nie wymaga instalowania kroju).`, M, 160, 9.5, p.tekst, { szer: W - 2 * M }));
    b.push(
      tekst(
        `${m.brief.opis.replace(/\.?$/, '.')} Tak wygląda akapit tekstu w kroju marki – stosuj go w ofertach, na stronie i w dokumentach.`,
        M,
        172,
        10.5,
        p.tekst,
        { szer: W - 2 * M - 30 },
      ),
    );
  }

  // 8. Błędy użycia
  {
    const b = nowa('Czego nie robić', 'Logo zawsze w całości, w oryginalnych proporcjach i kolorach z tej księgi.');
    const sw = (W - 2 * M - 12) / 3;
    const sh = 40;
    const bledy: [string, string, EfektBledu | undefined][] = [
      ['Nie rozciągaj ani nie ściskaj', '#FFFFFF', 'rozciagnij'],
      ['Nie zmieniaj kolorów', '#FFFFFF', 'kolor'],
      ['Nie dodawaj cienia ani efektów', '#FFFFFF', 'cien'],
      ['Nie obracaj', '#FFFFFF', 'obrot'],
      ['Nie stawiaj na tle o słabym kontraście', k.akcent, undefined],
      ['Nie zmieniaj kroju napisu', '#FFFFFF', 'kroj'],
    ];
    bledy.forEach(([opis, tlo, efekt], i) => {
      const x = M + (i % 3) * (sw + 6);
      const y = 60 + Math.floor(i / 3) * (sh + 22);
      b.push({ typ: 'svg', svg: logoNaTle(m, o, 'poziomy', 'kolor', tlo, sw, sh, 13, efekt), x, y, w: sw, h: sh });
      b.push({ typ: 'prostokat', x, y, w: sw, h: sh, kolor: 'none', obrys: mieszaj(p.tlo, p.tekst, 0.15) });
      // znak „źle”
      b.push({
        typ: 'svg',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="6mm" height="6mm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#D2453C"/><path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/></svg>`,
        x: x + 2,
        y: y + 2,
        w: 6,
        h: 6,
      });
      b.push(tekst(opis, x, y + sh + 2, 8.5, p.tekst, { szer: sw }));
    });
  }

  // 9. Materiały
  {
    const b = nowa('Materiały', 'Wzory materiałów z pakietu: grafiki do mediów społecznościowych, wizytówka do druku (ze spadem 3 mm i liniami cięcia) i papier firmowy.');
    const we = { marka: m, ksztalty: o.ksztalty };
    const pst = post(we);
    const wiz = wizytowka(we, { linieCiecia: false });
    const pap = papierFirmowy(we);
    b.push({ typ: 'svg', svg: pst.svg, x: M, y: 60, w: 80, h: 80, opis: 'Post 1080 × 1080' });
    b.push(tekst('Post 1080 × 1080 px', M, 142, 8.5, szary));
    const ww = 80;
    const wh = (ww * wiz.przod.wysokosc) / wiz.przod.szerokosc;
    b.push({ typ: 'svg', svg: wiz.przod.svg, x: M + 94, y: 60, w: ww, h: wh });
    b.push({ typ: 'svg', svg: wiz.tyl.svg, x: M + 94, y: 60 + wh + 6, w: ww, h: wh });
    b.push(tekst('Wizytówka 85 × 55 mm – przód i tył', M + 94, 60 + 2 * wh + 8, 8.5, szary));
    const pw = 70;
    const ph = (pw * A4H) / A4W;
    b.push({ typ: 'svg', svg: pap.svg, x: M, y: 152, w: pw, h: ph });
    b.push({ typ: 'prostokat', x: M, y: 152, w: pw, h: ph, kolor: 'none', obrys: mieszaj(p.tlo, p.tekst, 0.15) });
    b.push(tekst('Papier firmowy A4', M, 152 + ph + 2, 8.5, szary));
  }

  // 10. Informacja prawna
  {
    const b = nowa('Informacje prawne i sprawdzenie znaku', '');
    const akapity = [
      'Znak przygotowano w Verris Kreator marki z pomocą AI: asystent dobrał i sparametryzował kształt z biblioteki Verris albo zaproponował symbol sprawdzony walidatorem. Pliki zawierają metadane „wygenerowano z pomocą AI” (IPTC DigitalSourceType).',
      'Verris nie wydaje tego samego znaku (tej samej rodziny z tymi samymi parametrami) innej firmie w Kreatorze marki – to zobowiązanie dotyczy wyłącznie znaków z Kreatora marki Verris. Nie sprawdzamy podobieństwa do znaków zarejestrowanych przez inne podmioty i nie gwarantujemy, że takich nie ma.',
      'Zanim zarejestrujesz znak towarowy albo zamówisz duży nakład druków, sprawdź podobne znaki w bazie TMview (www.tmdn.org/tmview): 1) wyszukaj nazwę marki, 2) zawęź wyniki do klas towarów i usług Twojej branży, 3) użyj wyszukiwania obrazem – wgraj plik PNG znaku, 4) sprawdź status i właściciela podobnych znaków. To nie jest badanie prawne – w razie wątpliwości skonsultuj się z rzecznikiem patentowym.',
      'Grafika wygenerowana automatycznie może nie podlegać ochronie prawa autorskiego. Ochronę oznaczenia może dać rejestracja znaku towarowego w Urzędzie Patentowym RP albo w EUIPO.',
      'Kroje pism: SIL Open Font License 1.1 – dozwolone użycie komercyjne, osadzanie w dokumentach i logo; przy przekazywaniu plików krojów dołącz licencję. Zdjęcia użyte w materiałach (jeśli są) nie mogą stać się częścią znaku.',
    ];
    let y = 42;
    for (const a of akapity) {
      const t = tekst(a, M, y, 10, p.tekst, { szer: W - 2 * M });
      b.push(t);
      y += wysTekstu(t) + 5;
    }
  }
  return strony;
}

const A4W = 210;
const A4H = 297;

/** Ustawia wymiary głównego `<svg>` bloku na 100 % pola (HTML). */
function svgWPolu(svg: string): string {
  return svg.replace(/^<svg\b([^>]*)>/, (_m, atr: string) => `<svg${atr.replace(/\s(width|height)="[^"]*"/g, '')} width="100%" height="100%">`);
}

/** Samodzielny HTML księgi z @page A4 (Chromium → PDF). */
export function ksiegaHtml(m: Marka, o: OpcjeKsiegi = {}): string {
  const strony = stronyKsiegi(m, o);
  const fN = m.projekt.fonty.naglowki;
  const fT = m.projekt.fonty.tekst;
  const stos = (f: string) => `'${f.replace(/['"<>\\]/g, '')}', Arial, sans-serif`;
  const blok = (b: BlokKsiegi): string => {
    switch (b.typ) {
      case 'prostokat':
        return `<div class="b" style="left:${f2(b.x)}mm;top:${f2(b.y)}mm;width:${f2(b.w)}mm;height:${f2(b.h)}mm;background:${b.kolor === 'none' ? 'transparent' : b.kolor};${b.promien ? `border-radius:${b.promien}mm;` : ''}${b.obrys ? `box-shadow:inset 0 0 0 0.25mm ${b.obrys};` : ''}"></div>`;
      case 'svg':
        return `<div class="b" style="left:${f2(b.x)}mm;top:${f2(b.y)}mm;width:${f2(b.w)}mm;height:${f2(b.h)}mm">${svgWPolu(b.svg)}</div>`;
      case 'tekst': {
        const lewo = b.wyrownanie === 'prawo' ? `right:${f2(A4W - b.x)}mm;text-align:right` : `left:${f2(b.x)}mm`;
        return `<div class="b t ${b.font === 'naglowki' ? 'n' : ''}" style="${lewo};top:${f2(b.y)}mm;font-size:${b.rozmiar}pt;font-weight:${b.waga};color:${b.kolor}">${b.wiersze.map(esc).join('<br>')}</div>`;
      }
    }
  };
  const css =
    `@page{size:A4;margin:0}html,body{margin:0;padding:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}` +
    `.s{position:relative;width:${A4W}mm;height:${A4H}mm;overflow:hidden;page-break-after:always;break-after:page}` +
    `.b{position:absolute}.b svg{display:block}.t{white-space:nowrap;line-height:1.35;font-family:${stos(fT)}}.t.n{font-family:${stos(fN)};line-height:1.15}`;
  // CSS z API – bez „<”, żeby nie dało się zamknąć elementu <style>
  const fonty = (o.fontyCss ?? '').replace(/</g, '');
  return (
    `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(`Księga znaku – ${m.brief.nazwa}`)}</title>` +
    `<style>${fonty}${css}</style></head><body>` +
    strony.map((s) => `<section class="s" aria-label="${esc(s.tytul)}">${s.bloki.map(blok).join('')}</section>`).join('') +
    `</body></html>`
  );
}
