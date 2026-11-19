/**
 * Key Visual – materiały do druku (mm): wizytówka 85×55 mm ze spadem 3 mm i liniami cięcia (przód/tył),
 * papier firmowy A4, naklejka okrągła Ø 60 mm ze spadem 2 mm. Kolory w RGB – odpowiedniki CMYK orientacyjne
 * (kolory-marki.ts); drukarnia przelicza swoim profilem. Tekst danych kontaktowych jako `<text>` – API przy
 * eksporcie PDF osadza kroje OFL (Chromium) albo zamienia hasło na krzywe.
 */
import type { MaterialSvg, WejscieKv } from './wspolne.ts';
import { atrFontu, dokument, f2, koloryKv, logoKv, mieszaj } from './wspolne.ts';
import { esc } from '../../render/esc.ts';
import { pokolorujSygnet, rysujSygnet } from '../zloz.ts';
import { wzorPattern } from '../wzor.ts';
import { skrot } from '../skrot.ts';

export const WIZYTOWKA = { szer: 85, wys: 55, spad: 3, margines: 4, pasCiecia: 6 } as const;
export const A4 = { szer: 210, wys: 297 } as const;
export const NAKLEJKA = { srednica: 60, spad: 2 } as const;

export interface OpcjeDruku {
  /** Linie cięcia poza formatem (domyślnie true). */
  linieCiecia?: boolean;
}

export interface Wizytowka {
  przod: MaterialSvg;
  tyl: MaterialSvg;
  /** Format netto (po obcięciu) i spad. */
  formatMm: { szer: number; wys: number; spad: number };
}

/** Linie cięcia (znaczniki narożne) wokół formatu netto (x, y, w, h) – w pasie poza spadem. */
export function linieCiecia(x: number, y: number, w: number, h: number, spad: number, dl = 4): string {
  const o = spad + 1;
  const l: string[] = [];
  for (const [cx, kx] of [
    [x, -1],
    [x + w, 1],
  ] as const)
    for (const [cy, ky] of [
      [y, -1],
      [y + h, 1],
    ] as const) {
      l.push(`M${f2(cx + kx * o)} ${f2(cy)}h${f2(kx * dl)}`);
      l.push(`M${f2(cx)} ${f2(cy + ky * o)}v${f2(ky * dl)}`);
    }
  return `<path d="${l.join('')}" stroke="#000000" stroke-width="0.25" fill="none"/>`;
}

function arkusz(we: WejscieKv, nazwa: string, material: MaterialSvg['material'], netto: [number, number], spad: number, tresc: (x0: number, y0: number) => string, o: OpcjeDruku): MaterialSvg {
  const pas = o.linieCiecia === false ? 0 : WIZYTOWKA.pasCiecia;
  const W = netto[0] + 2 * (spad + pas);
  const H = netto[1] + 2 * (spad + pas);
  const x0 = spad + pas;
  const y0 = spad + pas;
  const ciecie = pas ? linieCiecia(x0, y0, netto[0], netto[1], spad) : '';
  return { material, svg: dokument(we, W, H, 'mm', tresc(x0, y0) + ciecie, nazwa), szerokosc: W, wysokosc: H, jednostka: 'mm' };
}

export function wizytowka(we: WejscieKv, o: OpcjeDruku = {}): Wizytowka {
  const m = we.marka;
  const k = m.projekt.kolory;
  const { szer, wys, spad, margines } = WIZYTOWKA;
  const kol = koloryKv(m, true);
  const sygnet = rysujSygnet(m.projekt.sygnet, { nazwa: m.brief.nazwa });
  const przod = arkusz(we, `${m.brief.nazwa} – wizytówka, przód`, 'wizytowka', [szer, wys], spad, (x0, y0) => {
    const id = `wzw-${skrot(sygnet + kol.wzor)}`;
    const p = wzorPattern(id, sygnet, m.kv.wzor === 'bez' ? 'bez' : 'rzadki', kol.wzor, { skala: 0.12 });
    const tlo = `<rect x="${f2(x0 - spad)}" y="${f2(y0 - spad)}" width="${f2(szer + 2 * spad)}" height="${f2(wys + 2 * spad)}" fill="${k.glowny}"/>`;
    const wz = p ? `<defs>${p}</defs><rect x="${f2(x0 - spad)}" y="${f2(y0 - spad)}" width="${f2(szer + 2 * spad)}" height="${f2(wys + 2 * spad)}" fill="url(#${id})"/>` : '';
    return tlo + wz + logoKv(we, 'pionowy', 'negatyw', x0 + szer / 2, y0 + wys / 2 - 12, 24, 'srodek', szer - 2 * margines - 6).el;
  }, o);
  const d = m.kontakt;
  const tyl = arkusz(we, `${m.brief.nazwa} – wizytówka, tył`, 'wizytowka', [szer, wys], spad, (x0, y0) => {
    const czesci: string[] = [];
    czesci.push(`<rect x="${f2(x0 - spad)}" y="${f2(y0 - spad)}" width="${f2(szer + 2 * spad)}" height="${f2(wys + 2 * spad)}" fill="#FFFFFF"/>`);
    // pas akcentu przy lewej krawędzi (ze spadem)
    czesci.push(`<rect x="${f2(x0 - spad)}" y="${f2(y0 - spad)}" width="${f2(spad + 1.6)}" height="${f2(wys + 2 * spad)}" fill="${k.akcent}"/>`);
    const xt = x0 + margines + 2;
    const fN = m.projekt.fonty.naglowki;
    const fT = m.projekt.fonty.tekst;
    let y = y0 + margines + 4.2;
    if (d.imie) czesci.push(`<text x="${f2(xt)}" y="${f2(y)}" fill="${k.glowny}" ${atrFontu(fN, 600)} font-size="4.2">${esc(d.imie)}</text>`);
    y += 4;
    if (d.stanowisko) czesci.push(`<text x="${f2(xt)}" y="${f2(y)}" fill="${mieszaj(k.glowny, '#FFFFFF', 0.25)}" ${atrFontu(fT, 400)} font-size="2.6">${esc(d.stanowisko)}</text>`);
    const linie = [d.telefon && `tel. ${d.telefon}`, d.email, d.www, d.adres].filter((x): x is string => !!x);
    let yk = y0 + wys - margines - (linie.length - 1) * 3.6;
    for (const l of linie) {
      czesci.push(`<text x="${f2(xt)}" y="${f2(yk)}" fill="${k.paleta.tekst}" ${atrFontu(fT, 400)} font-size="2.5">${esc(l)}</text>`);
      yk += 3.6;
    }
    if (sygnet) {
      const r = 11;
      czesci.push(`<g transform="translate(${f2(x0 + szer - margines - r)} ${f2(y0 + wys - margines - r)}) scale(${r / 100})">${pokolorujSygnet(sygnet, k.glowny, k.akcent)}</g>`);
    }
    return czesci.join('');
  }, o);
  return { przod, tyl, formatMm: { szer, wys, spad } };
}

export function papierFirmowy(we: WejscieKv): MaterialSvg {
  const m = we.marka;
  const k = m.projekt.kolory;
  const d = m.kontakt;
  const fT = m.projekt.fonty.tekst;
  const czesci: string[] = [`<rect width="${A4.szer}" height="${A4.wys}" fill="#FFFFFF"/>`];
  czesci.push(logoKv(we, 'poziomy', 'kolor', 20, 16, 14, 'lewo', 90).el);
  czesci.push(`<rect x="20" y="38" width="16" height="0.8" fill="${k.akcent}"/>`);
  // stopka: dane firmy w dwóch kolumnach
  czesci.push(`<rect x="20" y="${A4.wys - 24}" width="${A4.szer - 40}" height="0.25" fill="${mieszaj(k.glowny, '#FFFFFF', 0.6)}"/>`);
  const lewa = [m.brief.nazwa, d.adres].filter((x): x is string => !!x);
  const prawa = [d.telefon && `tel. ${d.telefon}`, d.email, d.www].filter((x): x is string => !!x);
  lewa.forEach((t, i) =>
    czesci.push(`<text x="20" y="${f2(A4.wys - 18 + i * 4)}" fill="${i ? k.paleta.tekstPrzygaszony : k.glowny}" ${atrFontu(fT, i ? 400 : 600)} font-size="2.8">${esc(t)}</text>`),
  );
  prawa.forEach((t, i) =>
    czesci.push(`<text x="${A4.szer - 20}" y="${f2(A4.wys - 18 + i * 4)}" fill="${k.paleta.tekstPrzygaszony}" ${atrFontu(fT, 400)} font-size="2.8" text-anchor="end">${esc(t)}</text>`),
  );
  return { material: 'papier-firmowy', svg: dokument(we, A4.szer, A4.wys, 'mm', czesci.join(''), `${m.brief.nazwa} – papier firmowy`), szerokosc: A4.szer, wysokosc: A4.wys, jednostka: 'mm' };
}

export function naklejka(we: WejscieKv, o: OpcjeDruku = {}): MaterialSvg {
  const m = we.marka;
  const k = m.projekt.kolory;
  const { srednica, spad } = NAKLEJKA;
  const W = srednica + 2 * spad;
  const c = W / 2;
  const czesci = [
    `<circle cx="${c}" cy="${c}" r="${f2(srednica / 2 + spad)}" fill="${k.glowny}"/>`,
    `<circle cx="${c}" cy="${c}" r="${f2(srednica / 2 - 3)}" fill="none" stroke="${k.akcentJasny}" stroke-width="0.6"/>`,
    logoKv(we, m.projekt.sygnet.typ === 'brak' ? 'napis' : 'pionowy', 'negatyw', c, c - 13, 26, 'srodek', srednica * 0.66).el,
  ];
  // linia cięcia (kontur wykrojnika) – osobny kolor, do wyłączenia przed drukiem
  if (o.linieCiecia !== false) czesci.push(`<circle cx="${c}" cy="${c}" r="${srednica / 2}" fill="none" stroke="#FF00FF" stroke-width="0.25" stroke-dasharray="1 1"/>`);
  return { material: 'naklejka', svg: dokument(we, W, W, 'mm', czesci.join(''), `${m.brief.nazwa} – naklejka`), szerokosc: W, wysokosc: W, jednostka: 'mm' };
}
