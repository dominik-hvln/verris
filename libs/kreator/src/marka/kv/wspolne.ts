/**
 * Key Visual – wspólne narzędzia szablonów: wejście (Marka + opcjonalne kształty napisów i hasła + zdjęcie),
 * kolory tła/tekstu zależne od `kv.tloCiemne`, osadzanie złożonego logo jako zagnieżdżonego `<svg>`, hasło
 * (ścieżki albo `<text>`), zdjęcie (tylko KV – nigdy w logo, licencja Pexels zakazuje użycia w znaku towarowym).
 */
import type { Marka, MaterialKv, UkladLogo } from '../model.ts';
import type { KsztaltNapisu, WariantKoloru } from '../typy.ts';
import { esc } from '../../render/esc.ts';
import { KATALOG_FONTOW } from '../../style/katalog-stylow.ts';
import { metadaneAi, rysujSygnet, zlozLogo, zrodloMetadanych } from '../zloz.ts';
import { wzorPattern } from '../wzor.ts';
import { skrot } from '../skrot.ts';

export interface KsztaltyKv {
  napis?: KsztaltNapisu | null;
  napis2?: KsztaltNapisu | null;
  podpis?: KsztaltNapisu | null;
  /** Wiersze hasła zamienione na krzywe (API; krój nagłówków). */
  haslo?: KsztaltNapisu[];
}

export interface WejscieKv {
  marka: Marka;
  ksztalty?: KsztaltyKv;
  /** Zdjęcie KV: https://… albo data:image/(png|jpeg|webp);base64 – API podstawia lokalną kopię przed renderem. */
  zdjecieUrl?: string;
}

export interface MaterialSvg {
  material: MaterialKv;
  svg: string;
  szerokosc: number;
  wysokosc: number;
  jednostka: 'px' | 'mm';
}

export const f2 = (x: number) => String(Math.round(x * 100) / 100);

/** Dozwolony adres zdjęcia (bez cudzysłowów i nawiasów – trafia do atrybutu href). */
export function bezpiecznyUrlZdjecia(url: string | undefined): string | null {
  if (!url) return null;
  if (/^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#]*$/.test(url) && !/["'<>\s()]/.test(url)) return url;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(url)) return url;
  return null;
}

/** Mieszanie kolorów w sRGB (t = 0 → a, 1 → b). */
export function mieszaj(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export interface KoloryKv {
  tlo: string;
  tekst: string;
  akcent: string;
  wzor: string;
  wariantLogo: WariantKoloru;
}

export function koloryKv(m: Marka, ciemne = m.kv.tloCiemne): KoloryKv {
  const k = m.projekt.kolory;
  if (ciemne)
    return { tlo: k.glowny, tekst: '#FFFFFF', akcent: k.akcentJasny, wzor: mieszaj(k.glowny, '#FFFFFF', 0.1), wariantLogo: 'negatyw' };
  return { tlo: k.paleta.tlo, tekst: k.glowny, akcent: k.akcent, wzor: mieszaj(k.paleta.tlo, k.glowny, 0.08), wariantLogo: 'kolor' };
}

/** Osadza samodzielny SVG jako zagnieżdżony `<svg>` w (x, y) o wysokości `h` (szerokość z proporcji). */
export function osadz(svg: string, x: number, y: number, h: number): { el: string; szer: number } {
  const m = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/.exec(svg.trim());
  if (!m) return { el: '', szer: 0 };
  const vb = /viewBox="([^"]+)"/.exec(m[1])?.[1].split(/\s+/).map(Number) ?? [0, 0, 100, 100];
  const szer = (vb[2] / vb[3]) * h;
  return {
    el: `<svg x="${f2(x)}" y="${f2(y)}" width="${f2(szer)}" height="${f2(h)}" viewBox="${vb.map(f2).join(' ')}">${m[2].replace(/<title>[\s\S]*?<\/title>|<metadata>[\s\S]*?<\/metadata>/g, '')}</svg>`,
    szer,
  };
}

/** Logo marki w KV (wariant zależny od tła; negatyw bez prostokąta tła). */
export function logoKv(
  we: WejscieKv,
  uklad: UkladLogo,
  wariant: WariantKoloru,
  x: number,
  y: number,
  h: number,
  wyrownanie: 'lewo' | 'srodek' | 'prawo' = 'lewo',
  maksSzer = Infinity,
): { el: string; szer: number } {
  const m = we.marka;
  const z = zlozLogo(m.projekt, m.brief.nazwa, m.brief.podpis, {
    uklad,
    wariant,
    napis: we.ksztalty?.napis,
    napis2: we.ksztalty?.napis2,
    podpis: we.ksztalty?.podpis,
    metadaneAi: false,
    tlo: false,
  });
  let probny = osadz(z.svg, 0, 0, h);
  let hh = h;
  if (probny.szer > maksSzer) {
    // za szerokie (długa nazwa) – zmniejszamy, wyśrodkowane w pionie w przewidzianym miejscu
    hh = (h * maksSzer) / probny.szer;
    probny = osadz(z.svg, 0, 0, hh);
  }
  const x0 = wyrownanie === 'srodek' ? x - probny.szer / 2 : wyrownanie === 'prawo' ? x - probny.szer : x;
  return osadz(z.svg, x0, y + (h - hh) / 2, hh);
}

/** Dzieli hasło na wiersze (do `maks` znaków w wierszu, najwyżej `wierszy`). */
export function zawin(tekst: string, maks: number, wierszy = 4): string[] {
  const slowa = tekst.trim().split(/\s+/).filter(Boolean);
  const w: string[] = [];
  let cur = '';
  for (const s of slowa) {
    if (!cur) cur = s;
    else if ((cur + ' ' + s).length <= maks) cur += ' ' + s;
    else {
      w.push(cur);
      cur = s;
    }
  }
  if (cur) w.push(cur);
  if (w.length > wierszy) {
    const reszta = w.slice(wierszy - 1).join(' ');
    return [...w.slice(0, wierszy - 1), reszta.length > maks ? reszta.slice(0, maks - 1).trimEnd() + '…' : reszta];
  }
  return w;
}

const rodzaj = (font: string) => {
  const k = KATALOG_FONTOW.find((f) => f.rodzina === font)?.kategoria;
  return k === 'szeryfowy' ? 'serif' : k === 'monospace' ? 'monospace' : 'sans-serif';
};

export function atrFontu(font: string, waga: number): string {
  return `font-family="${esc(`'${font}', ${rodzaj(font)}`)}" font-weight="${waga}"`;
}

/**
 * Hasło: kształty (API) albo `<text>` (podgląd). `wersaliki` = wysokość wersalików w jednostkach dokumentu;
 * interlinia 1,25 × wielkość kroju. Zwraca elementy i wysokość bloku.
 */
export function haslo(
  we: WejscieKv,
  x: number,
  y: number,
  wersaliki: number,
  kolor: string,
  o: { maksZnakow: number; wierszy?: number; wyrownanie?: 'lewo' | 'srodek' | 'prawo' },
): { el: string; wys: number } {
  const tekst = we.marka.kv.haslo;
  const rozmiar = wersaliki / 0.7;
  const krok = rozmiar * 1.2;
  const kszt = we.ksztalty?.haslo;
  const wyr = o.wyrownanie ?? 'lewo';
  if (kszt?.length) {
    const el = kszt
      .slice(0, o.wierszy ?? 4)
      .map((k, i) => {
        const s = wersaliki / (k.wysokoscWersalikow || 700);
        const sz = k.szerokosc * s;
        const xx = wyr === 'srodek' ? x - sz / 2 : wyr === 'prawo' ? x - sz : x;
        return `<path fill="${kolor}" transform="translate(${f2(xx)} ${f2(y + wersaliki + i * krok)}) scale(${s.toFixed(5)})" d="${esc(k.d)}"/>`;
      })
      .join('');
    return { el, wys: wersaliki + (kszt.length - 1) * krok };
  }
  if (!tekst) return { el: '', wys: 0 };
  const wiersze = zawin(tekst, o.maksZnakow, o.wierszy ?? 4);
  const anchor = wyr === 'srodek' ? ' text-anchor="middle"' : wyr === 'prawo' ? ' text-anchor="end"' : '';
  const font = we.marka.projekt.fonty.naglowki;
  const el = wiersze
    .map((w, i) => `<text x="${f2(x)}" y="${f2(y + wersaliki + i * krok)}" fill="${kolor}" ${atrFontu(font, 700)} font-size="${f2(rozmiar)}"${anchor}>${esc(w)}</text>`)
    .join('');
  return { el, wys: wersaliki + (wiersze.length - 1) * krok };
}

/** Tło: kolor + (opcjonalnie) wzór z sygnetu w odcieniu bliskim tłu. */
export function tloKv(we: WejscieKv, w: number, h: number, kol: KoloryKv, skalaWzoru = 1): string {
  const m = we.marka;
  const sygnet = rysujSygnet(m.projekt.sygnet, { nazwa: m.brief.nazwa });
  // id unikalny dla treści – kilka materiałów osadzonych w jednym HTML (panel, księga) nie dzieli wzoru
  const id = `wz-${skrot(sygnet + kol.wzor + skalaWzoru + m.kv.wzor)}`;
  const p = wzorPattern(id, sygnet, m.kv.wzor, kol.wzor, { skala: skalaWzoru });
  return (
    `<rect width="${f2(w)}" height="${f2(h)}" fill="${kol.tlo}"/>` +
    (p ? `<defs>${p}</defs><rect width="${f2(w)}" height="${f2(h)}" fill="url(#${id})"/>` : '')
  );
}

/** Zdjęcie przycięte do prostokąta (clipPath), z przyciemnieniem od dołu dla czytelności tekstu. */
export function zdjecie(url: string, x: number, y: number, w: number, h: number, kolorPrzyciemnienia: string): string {
  const id = `zd-${skrot(url + x + y + w + h + kolorPrzyciemnienia)}`;
  return (
    `<defs><clipPath id="${id}-k"><rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}"/></clipPath>` +
    `<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="${kolorPrzyciemnienia}" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="${kolorPrzyciemnienia}" stop-opacity="0.75"/></linearGradient></defs>` +
    `<g clip-path="url(#${id}-k)"><image href="${esc(url)}" x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" preserveAspectRatio="xMidYMid slice"/>` +
    `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="url(#${id}-g)"/></g>`
  );
}

export function dokument(we: WejscieKv, w: number, h: number, jednostka: 'px' | 'mm', tresc: string, tytul: string): string {
  const u = jednostka === 'mm' ? 'mm' : '';
  const meta = metadaneAi(zrodloMetadanych(we.marka.projekt.sygnet));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(w)}${u}" height="${f2(h)}${u}" viewBox="0 0 ${f2(w)} ${f2(h)}" role="img" aria-label="${esc(tytul)}">` +
    `<title>${esc(tytul)}</title>${meta}${tresc}</svg>`
  );
}
