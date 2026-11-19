/**
 * Kreator marki – złożenie logo (lockup): sygnet + napis (+ podpis) w układach poziomym, pionowym, sam sygnet
 * i sam napis; warianty kolor / mono / negatyw / biały. Wynik: samodzielny SVG (width/height/viewBox, bez
 * zewnętrznych odwołań, kolory wpisane – pliki otwierają się poprawnie w programach graficznych i drukarni).
 *
 * Proporcje lockupu (koncepcja 3.4, plansze w makiecie):
 * - wysokość sygnetu S = 100 jednostek (wysokość „tuszu” znaku, nie pola 0–100);
 * - poziomy: wersaliki napisu 0,40 S (dwa wiersze: 0,28 S, interlinia 1,5), odstęp sygnet–napis 0,30 S,
 *   podpis wersalikami 0,11 S z rozstrzeleniem 0,2 em, 0,20 S pod linią bazową; blok napisu wyśrodkowany
 *   optycznie na środku sygnetu (od linii wersalików do linii bazowej ostatniego elementu);
 * - pionowy: sygnet na środku, odstęp 0,24 S, wersaliki 0,34 S;
 * - pole ochronne x = ½ S (dla samego napisu – ½ wysokości bloku napisu).
 *
 * Napis: z kształtów (KsztaltNapisu – krój OFL zamieniony na krzywe w API, z kerningiem) albo – w podglądzie panelu –
 * `<text>` z font-family (szerokość szacowana). Tekst z modelu przechodzi przez `esc()` (nazwa firmy to dane klienta).
 *
 * Metadane AI (AI Act art. 50 ust. 2 – oznaczanie treści syntetycznych w formacie odczytywalnym maszynowo
 * [do weryfikacji zakresu obowiązku dla generatora parametrycznego – ocena prawnika, koncepcja 2.3]): blok
 * `<metadata>` z XMP/RDF i polem IPTC `Iptc4xmpExt:DigitalSourceType`:
 *  - symbol od AI → http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia,
 *  - znak z biblioteki Verris dobrany i sparametryzowany przez AI (kompozycja szablonu zaprojektowanego przez
 *    człowieka z wyborem modelu) → …/compositeWithTrainedAlgorithmicMedia,
 *  - logo wgrane przez klienta (bez zmian) → bez DigitalSourceType, tylko informacja o narzędziu.
 *  Słownik: IPTC NewsCodes „Digital Source Type” – https://cv.iptc.org/newscodes/digitalsourcetype/
 *  [do weryfikacji aktualnych kodów i zaleceń IPTC/C2PA dla grafiki wektorowej].
 */
import type { KoloryMarki, ProjektLogo, Sygnet, UkladLogo } from './model.ts';
import type { KsztaltNapisu, OpcjeZlozenia, WariantKoloru, ZlozLogo, ZlozoneLogo } from './typy.ts';
import { esc } from '../render/esc.ts';
import { KATALOG_FONTOW } from '../style/katalog-stylow.ts';
import { rodzinaPoId } from './sygnety/katalog.ts';
import { inicjaly } from './sygnety/litery.ts';
import { walidujSvgSygnetu, wnetrzeSvg } from './walidator-svg.ts';
import { graniceSegmentow, parsujD } from './sciezka-svg.ts';
import { MIN_PODPIS_PX, MIN_LOGO_PX } from './reguly-stale.ts';

export const PROPORCJE = {
  poziomy: { wersaliki: 0.4, wersalikiDwa: 0.28, interlinia: 1.5, odstep: 0.3, podpis: 0.11, podpisOdstep: 0.2 },
  pionowy: { wersaliki: 0.34, wersalikiDwa: 0.26, interlinia: 1.45, odstep: 0.24, podpis: 0.1, podpisOdstep: 0.18 },
  /** Rozstrzelenie podpisu (em). */
  podpisRozstrzelenie: 0.2,
  /** Dodatkowe rozstrzelenie stylu „rozstrzelony” (em). */
  stylRozstrzelony: 0.14,
} as const;

const S = 100;

// ───────────────────────── sygnet ─────────────────────────

/** Wnętrze SVG sygnetu (same `<path>` w polu 0–100, kolory currentColor / var(--akcent)). Pusty napis = brak znaku. */
export function rysujSygnet(sygnet: Sygnet, o: { wariant?: 'pelny' | 'favicon'; nazwa?: string } = {}): string {
  if (sygnet.typ === 'brak') return '';
  if (sygnet.typ === 'biblioteka') {
    const r = rodzinaPoId(sygnet.rodzina);
    if (!r) return '';
    const litery = sygnet.litery?.trim() ? sygnet.litery : inicjaly(o.nazwa ?? '');
    return r.rysuj(sygnet.parametry, { litery, ziarno: sygnet.ziarno ?? 0, wariant: o.wariant ?? 'pelny' });
  }
  // symbol od AI / wgrany: zawsze ponowna walidacja (model mógł zostać zapisany starszą wersją walidatora)
  const w = walidujSvgSygnetu(sygnet.svg, { tryb: sygnet.typ === 'ai' ? 'ai' : 'wgrany' });
  return w.ok ? wnetrzeSvg(w.svg) : '';
}

/** Granice „tuszu” sygnetu w polu 0–100. */
export function graniceSygnetu(wnetrze: string): { x0: number; y0: number; x1: number; y1: number } | null {
  const re = /\sd="([^"]*)"/g;
  let m: RegExpExecArray | null;
  let g: { x0: number; y0: number; x1: number; y1: number } | null = null;
  while ((m = re.exec(wnetrze))) {
    const seg = parsujD(m[1]);
    if (!seg) continue;
    const b = graniceSegmentow(seg);
    if (!Number.isFinite(b.x0)) continue;
    g = g ? { x0: Math.min(g.x0, b.x0), y0: Math.min(g.y0, b.y0), x1: Math.max(g.x1, b.x1), y1: Math.max(g.y1, b.y1) } : b;
  }
  return g;
}

/** Podstawia kolory kanałów (eksport: pliki bez CSS). */
export function pokolorujSygnet(wnetrze: string, glowny: string, akcent: string): string {
  return wnetrze
    .replace(/fill="var\(--akcent, currentColor\)"/g, `fill="${akcent}"`)
    .replace(/fill="currentColor"/g, `fill="${glowny}"`);
}

// ───────────────────────── napis ─────────────────────────

/** Wiersze napisu po zastosowaniu stylu (API kształtuje dokładnie te teksty). „dwa” tylko dla ≥ 2 słów. */
export function wierszeNapisu(nazwa: string, styl: ProjektLogo['napis']['styl']): string[] {
  const t = nazwa.trim().replace(/\s+/g, ' ');
  const duze = (x: string) => x.toLocaleUpperCase('pl-PL');
  switch (styl) {
    case 'wersaliki':
    case 'rozstrzelony':
      return [duze(t)];
    case 'male':
      return [t.toLocaleLowerCase('pl-PL')];
    case 'dwa': {
      const slowa = t.split(' ');
      if (slowa.length < 2) return [t];
      // podział możliwie po równo (liczba znaków)
      let najlepszy = 1;
      let roznica = Infinity;
      for (let i = 1; i < slowa.length; i++) {
        const a = slowa.slice(0, i).join(' ').length;
        const b = slowa.slice(i).join(' ').length;
        if (Math.abs(a - b) < roznica) {
          roznica = Math.abs(a - b);
          najlepszy = i;
        }
      }
      return [slowa.slice(0, najlepszy).join(' '), slowa.slice(najlepszy).join(' ')];
    }
    default:
      return [t];
  }
}

export const tekstPodpisu = (podpis: string) => podpis.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pl-PL');

/** Rozstrzelenie napisu w tysięcznych em (z modelu + styl „rozstrzelony”). */
export function rozstrzelenieNapisu(n: ProjektLogo['napis']): number {
  return n.rozstrzelenie + (n.styl === 'rozstrzelony' ? PROPORCJE.stylRozstrzelony * 1000 : 0);
}

/** Przybliżona szerokość znaku w em (typowy krój bezszeryfowy / szeryfowy, waga 600) – tylko podgląd `<text>`. */
export function szerokoscZnaku(z: string): number {
  if (z === ' ') return 0.27;
  if ('iljI.,:;!|\'’`'.includes(z)) return 0.28;
  if ('frtJ()[]-'.includes(z)) return 0.38;
  if ('mwMW'.includes(z)) return z === z.toUpperCase() ? 0.92 : 0.85;
  if (/[0-9]/.test(z)) return 0.6;
  if (z !== z.toLowerCase()) return 0.7;
  return 0.56;
}

interface Wiersz {
  /** Rysuje wiersz z linią bazową w (x, y) w kolorze. */
  rysuj: (x: number, y: number, kolor: string) => string;
  szer: number;
  wersaliki: number;
}

const rodzajFontu = (font: string) => {
  const k = KATALOG_FONTOW.find((f) => f.rodzina === font)?.kategoria;
  return k === 'szeryfowy' ? 'serif' : k === 'monospace' ? 'monospace' : k === 'odreczny' ? 'cursive' : 'sans-serif';
};

const f2 = (x: number) => String(Math.round(x * 100) / 100);

function wiersz(
  tekst: string,
  ksztalt: KsztaltNapisu | null | undefined,
  wersaliki: number,
  font: { rodzina: string; waga: number; rozstrzelenie: number },
): Wiersz {
  if (ksztalt && ksztalt.wysokoscWersalikow > 0) {
    const s = wersaliki / ksztalt.wysokoscWersalikow;
    return {
      szer: ksztalt.szerokosc * s,
      wersaliki,
      rysuj: (x, y, kolor) => `<path fill="${kolor}" transform="translate(${f2(x)} ${f2(y)}) scale(${s.toFixed(5)})" d="${esc(ksztalt.d)}"/>`,
    };
  }
  // podgląd: <text>; wielkość kroju z typowej wysokości wersalików 0,7 em, szerokość szacowana z tabeli szerokości
  // znaków (z zapasem – lepiej szerszy viewBox niż ucięty napis)
  const rozmiar = wersaliki / 0.7;
  const odstep = (font.rozstrzelenie / 1000) * rozmiar;
  const znaki = [...tekst];
  const szacunek = znaki.reduce((s, z) => s + szerokoscZnaku(z) * rozmiar + odstep, 0) - odstep;
  return {
    szer: Math.max(szacunek, rozmiar),
    wersaliki,
    rysuj: (x, y, kolor) =>
      `<text x="${f2(x)}" y="${f2(y)}" fill="${kolor}" font-family="${esc(`'${font.rodzina}', ${rodzajFontu(font.rodzina)}`)}" font-weight="${font.waga}" font-size="${f2(rozmiar)}"${odstep ? ` letter-spacing="${f2(odstep)}"` : ''}>${esc(tekst)}</text>`,
  };
}

// ───────────────────────── kolory wariantów ─────────────────────────

export interface KoloryWariantu {
  znak: string;
  akcent: string;
  napis: string;
  podpis: string;
  tlo?: string;
}

export function koloryWariantu(k: KoloryMarki, w: WariantKoloru): KoloryWariantu {
  switch (w) {
    case 'mono':
      return { znak: k.paleta.tekst, akcent: k.paleta.tekst, napis: k.paleta.tekst, podpis: k.paleta.tekst };
    case 'negatyw':
      return { znak: '#FFFFFF', akcent: k.akcentJasny, napis: '#FFFFFF', podpis: '#FFFFFF', tlo: k.glowny };
    case 'bialy':
      return { znak: '#FFFFFF', akcent: '#FFFFFF', napis: '#FFFFFF', podpis: '#FFFFFF' };
    default:
      return { znak: k.glowny, akcent: k.akcent, napis: k.glowny, podpis: k.glowny };
  }
}

// ───────────────────────── metadane ─────────────────────────

const TYP_ZRODLA = {
  ai: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  kompozycja: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
} as const;

/** Blok `<metadata>` (XMP/RDF, IPTC DigitalSourceType) – „wygenerowano z pomocą AI”. */
export function metadaneAi(zrodlo: 'ai' | 'kompozycja' | 'brak'): string {
  const typ = zrodlo === 'brak' ? '' : ` Iptc4xmpExt:DigitalSourceType="${TYP_ZRODLA[zrodlo]}"`;
  const opis =
    zrodlo === 'brak'
      ? 'Materiał przygotowany w Verris Kreator marki.'
      : 'Wygenerowano z pomocą AI – Verris Kreator marki.';
  return (
    '<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" ' +
    'xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:xmp="http://ns.adobe.com/xap/1.0/">' +
    `<rdf:Description rdf:about=""${typ} xmp:CreatorTool="Verris Kreator marki"><dc:description>${opis}</dc:description></rdf:Description>` +
    '</rdf:RDF></metadata>'
  );
}

export function zrodloMetadanych(s: Sygnet): 'ai' | 'kompozycja' | 'brak' {
  return s.typ === 'ai' ? 'ai' : s.typ === 'wgrany' ? 'brak' : 'kompozycja';
}

// ───────────────────────── złożenie ─────────────────────────

/** Układ, który faktycznie da się pokazać na danej wysokości (reguły minimalnych rozmiarów). */
export function ukladDlaWysokosci(uklad: UkladLogo, maSygnet: boolean, wysokoscPx?: number): { uklad: UkladLogo; podpis: boolean } {
  if (wysokoscPx === undefined) return { uklad, podpis: true };
  if (wysokoscPx < MIN_LOGO_PX && maSygnet && uklad !== 'sygnet') return { uklad: 'sygnet', podpis: false };
  return { uklad, podpis: wysokoscPx >= MIN_PODPIS_PX };
}

export const zlozLogo: ZlozLogo = (projekt, nazwa, podpis, o: OpcjeZlozenia): ZlozoneLogo => {
  const wnetrzeZnaku = rysujSygnet(projekt.sygnet, { nazwa });
  const gz = wnetrzeZnaku ? graniceSygnetu(wnetrzeZnaku) : null;
  let uklad: UkladLogo = o.uklad;
  if (!gz && uklad !== 'napis') uklad = 'napis';
  const progi = ukladDlaWysokosci(uklad, !!gz, o.wysokoscPx);
  uklad = progi.uklad;
  const zPodpisem = !!podpis?.trim() && projekt.napis.podpis && progi.podpis && uklad !== 'sygnet';
  const kol = koloryWariantu(projekt.kolory, o.wariant);
  const czesci: string[] = [];
  const P = uklad === 'pionowy' ? PROPORCJE.pionowy : PROPORCJE.poziomy;

  // sygnet: tusz skalowany do wysokości S (szerokie znaki ograniczone do 1,6 S)
  let sygnetSzer = 0;
  let rysujZnak = (_x: number, _y: number) => '';
  if (gz && uklad !== 'napis') {
    const iw = gz.x1 - gz.x0;
    const ih = gz.y1 - gz.y0;
    const s = Math.min(S / ih, (1.6 * S) / iw);
    sygnetSzer = iw * s;
    const sygnetWys = ih * s;
    const pokolorowany = pokolorujSygnet(wnetrzeZnaku, kol.znak, kol.akcent);
    rysujZnak = (x, y) =>
      `<g transform="translate(${f2(x - gz.x0 * s)} ${f2(y + (S - sygnetWys) / 2 - gz.y0 * s)}) scale(${s.toFixed(5)})">${pokolorowany}</g>`;
  }

  // napis
  const wiersze = wierszeNapisu(nazwa, projekt.napis.styl);
  const dwa = wiersze.length === 2;
  const wers = dwa ? P.wersalikiDwa * S : P.wersaliki * S;
  const fontN = { rodzina: projekt.napis.font, waga: projekt.napis.waga, rozstrzelenie: rozstrzelenieNapisu(projekt.napis) };
  const ksztalty = [o.napis, o.napis2];
  const wN = wiersze.map((t, i) => wiersz(t, ksztalty[i], wers, fontN));
  const wP = zPodpisem
    ? wiersz(tekstPodpisu(podpis!), o.podpis, P.podpis * S, { rodzina: projekt.fonty.tekst, waga: 600, rozstrzelenie: PROPORCJE.podpisRozstrzelenie * 1000 })
    : null;
  // wysokość bloku: od linii wersalików 1. wiersza do linii bazowej ostatniego elementu
  const bazy: number[] = [wers];
  if (dwa) bazy.push(wers + wers * P.interlinia);
  let blokWys = bazy[bazy.length - 1];
  let bazaPodpisu = 0;
  if (wP) {
    bazaPodpisu = blokWys + P.podpisOdstep * S + wP.wersaliki;
    blokWys = bazaPodpisu;
  }
  const blokSzer = Math.max(...wN.map((w) => w.szer), wP?.szer ?? 0);
  const rysujBlok = (x: number, y: number, wyrownanie: 'lewo' | 'srodek') => {
    const xs = (szer: number) => (wyrownanie === 'srodek' ? x + (blokSzer - szer) / 2 : x);
    wN.forEach((w, i) => czesci.push(w.rysuj(xs(w.szer), y + bazy[i], kol.napis)));
    if (wP) czesci.push(wP.rysuj(xs(wP.szer), y + bazaPodpisu, kol.podpis));
  };

  let szer: number;
  let wys: number;
  let x: number;
  if (uklad === 'sygnet') {
    czesci.push(rysujZnak(0, 0));
    szer = sygnetSzer;
    wys = S;
    x = S / 2;
  } else if (uklad === 'napis') {
    rysujBlok(0, 0, 'lewo');
    szer = blokSzer;
    wys = blokWys;
    x = blokWys / 2;
  } else if (uklad === 'pionowy') {
    szer = Math.max(sygnetSzer, blokSzer);
    czesci.push(rysujZnak((szer - sygnetSzer) / 2, 0));
    rysujBlok((szer - blokSzer) / 2, S + P.odstep * S, 'srodek');
    wys = S + P.odstep * S + blokWys;
    x = S / 2;
  } else {
    const odst = P.odstep * S;
    czesci.push(rysujZnak(0, 0));
    // wyrównanie optyczne: środek bloku (wersaliki → baza) na środku sygnetu
    const yBloku = (S - blokWys) / 2;
    rysujBlok(sygnetSzer + odst, yBloku, 'lewo');
    szer = sygnetSzer + odst + blokSzer;
    wys = Math.max(S, blokWys);
    x = S / 2;
  }

  // ramka: przy tle (negatyw) – margines = pole ochronne; zejście liter (p, g, ą) mieści się w polu
  const tlo = o.wariant === 'negatyw' && o.tlo !== false && kol.tlo;
  const m = tlo ? x : uklad === 'sygnet' ? 0 : wers * 0.3;
  const vb = [-m, -m, szer + 2 * m, wys + 2 * m];
  const skala = o.wysokoscPx ? o.wysokoscPx / vb[3] : 1;
  const tytul = esc(nazwa);
  const meta = o.metadaneAi === false ? '' : metadaneAi(zrodloMetadanych(projekt.sygnet));
  const tloEl = tlo ? `<rect x="${f2(vb[0])}" y="${f2(vb[1])}" width="${f2(vb[2])}" height="${f2(vb[3])}" fill="${kol.tlo}"/>` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(vb[2] * skala)}" height="${f2(vb[3] * skala)}" viewBox="${vb.map(f2).join(' ')}" role="img" aria-label="${tytul}">` +
    `<title>${tytul}</title>${meta}${tloEl}${czesci.join('')}</svg>`;
  return { svg, szerokosc: vb[2], wysokosc: vb[3], poleOchronne: x };
};
