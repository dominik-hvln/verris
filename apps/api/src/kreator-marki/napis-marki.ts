import { Injectable, Logger } from '@nestjs/common';
import { create, type FontkitFont } from 'fontkit';
import { KATALOG_FONTOW, plikFontu, type KsztaltNapisu, type ZakresFontu } from '@verris/kreator';
import { FontsProxyService } from '../fonts-proxy/fonts-proxy.service.js';

/**
 * Kreator marki (paczka 131) – znak słowny na krzywych: tekst z kroju OFL z katalogu (KATALOG_FONTOW) kształtowany
 * z kerningiem przez fontkit (MIT; `font.layout` stosuje GPOS/kern – https://github.com/foliojs/fontkit#fontlayoutstring-features--null)
 * i zamieniany na jedną ścieżkę SVG (KsztaltNapisu: jednostki 1000/em, linia bazowa y = 0, y w dół).
 *
 * Pliki krojów: te same woff2 co strony z kreatora (proxy fontów: `<rodzina>-<waga>-<latin|latin-ext>.woff2` –
 * podzbiory Google Fonts wg unicode-range). Polskie litery (ą, ę, ł, ń, ś, ź, ż) są w podzbiorze latin-ext, „ó”
 * w latin – znak idzie do kroju bieżącego odcinka, jeśli ma glif, inaczej do pierwszego, który go ma. Kerning działa
 * w obrębie odcinka jednego pliku; na styku podzbiorów (np. „Łó”) pary kerningowej nie ma – ograniczenie podzbiorów
 * Google Fonts [do weryfikacji wizualnej na planszach; pełne pliki krojów usunęłyby je].
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escXml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

const r1 = (x: number) => {
  const v = Math.round(x * 10) / 10;
  return Object.is(v, -0) ? '0' : String(v);
};

/** Najbliższa waga dostępna w katalogu (pliki istnieją tylko dla wag z KATALOG_FONTOW). */
export function wagaZKatalogu(rodzina: string, waga: number): number | null {
  const f = KATALOG_FONTOW.find((x) => x.rodzina === rodzina);
  if (!f) return null;
  return [...f.wagi].sort((a, b) => Math.abs(a - waga) - Math.abs(b - waga) || b - a)[0] ?? null;
}

/**
 * Kształt napisu z wczytanych krojów (kolejność = preferencja: latin, latin-ext). Rozstrzelenie w tysięcznych em
 * dokładane po każdym znaku poza ostatnim (jak letter-spacing w podglądzie). Pusty tekst / brak glifów = null.
 */
export function ksztaltZKrojow(tekst: string, kroje: FontkitFont[], rozstrzelenie = 0): KsztaltNapisu | null {
  const znaki = [...tekst.normalize('NFC')];
  if (!znaki.length || !kroje.length) return null;
  // odcinki: znak zostaje w kroju bieżącego odcinka, jeśli ten ma glif
  const odcinki: { k: number; t: string }[] = [];
  for (const z of znaki) {
    const cp = z.codePointAt(0)!;
    const biezacy = odcinki[odcinki.length - 1];
    if (biezacy && (z === ' ' || kroje[biezacy.k]!.hasGlyphForCodePoint(cp))) {
      biezacy.t += z;
      continue;
    }
    const k = kroje.findIndex((f) => f.hasGlyphForCodePoint(cp));
    odcinki.push({ k: k < 0 ? 0 : k, t: z });
  }
  const glowny = kroje[0]!;
  const s0 = 1000 / glowny.unitsPerEm;
  const czesci: string[] = [];
  let x = 0;
  let glifow = 0;
  for (const o of odcinki) {
    const f = kroje[o.k]!;
    const s = 1000 / f.unitsPerEm;
    const run = f.layout(o.t);
    run.glyphs.forEach((g, i) => {
      const p = run.positions[i]!;
      const gx = x + p.xOffset * s;
      const gy = -p.yOffset * s;
      for (const c of g.path.commands) {
        const a = c.args;
        const pt = (j: number) => `${r1(gx + a[j]! * s)} ${r1(gy - a[j + 1]! * s)}`;
        if (c.command === 'moveTo') czesci.push(`M${pt(0)}`);
        else if (c.command === 'lineTo') czesci.push(`L${pt(0)}`);
        else if (c.command === 'quadraticCurveTo') czesci.push(`Q${pt(0)} ${pt(2)}`);
        else if (c.command === 'bezierCurveTo') czesci.push(`C${pt(0)} ${pt(2)} ${pt(4)}`);
        else if (c.command === 'closePath') czesci.push('Z');
      }
      x += p.xAdvance * s + rozstrzelenie;
      glifow++;
    });
  }
  if (!glifow) return null;
  const szerokosc = Math.max(0, x - rozstrzelenie);
  const cap = glowny.capHeight > 0 ? glowny.capHeight * s0 : 700;
  return { d: czesci.join(''), szerokosc: Math.round(szerokosc * 10) / 10, wysokoscWersalikow: Math.round(cap * 10) / 10, zejscie: Math.round(Math.abs(glowny.descent) * s0 * 10) / 10 };
}

/** Źródło plików krojów (FontsProxyService.plikKreatora) – w testach atrapa z plikiem z fixture. */
export interface ZrodloKrojow {
  plikKreatora(nazwa: string): Promise<{ buf: Buffer; type: string }>;
}

const MAKS_CACHE = 2_000;
const MAKS_KROJOW = 120;
const ZAKRESY: ZakresFontu[] = ['latin', 'latin-ext'];

/**
 * Kształty napisów z cache w pamięci (LRU po kolejności wstawienia – jak cache CSS proxy fontów). Jedna replika API
 * liczy kształt raz; Redis niepotrzebny, bo wynik jest deterministyczny i tani do odtworzenia (pliki krojów proxy
 * i tak trzyma w pamięci 30 dni).
 */
@Injectable()
export class NapisMarkiService {
  private readonly logger = new Logger(NapisMarkiService.name);
  private readonly kroje = new Map<string, Promise<FontkitFont | null>>();
  private readonly cache = new Map<string, KsztaltNapisu | null>();

  constructor(private readonly fonty: FontsProxyService) {}

  /** Zamiennik źródła krojów w testach. */
  static zeZrodlem(zrodlo: ZrodloKrojow): NapisMarkiService {
    return new NapisMarkiService(zrodlo as unknown as FontsProxyService);
  }

  private krojPliku(nazwa: string): Promise<FontkitFont | null> {
    let p = this.kroje.get(nazwa);
    if (!p) {
      p = this.fonty
        .plikKreatora(nazwa)
        .then(({ buf }) => create(buf))
        .catch((e: unknown) => {
          this.logger.warn(`Krój ${nazwa}: ${e instanceof Error ? e.message : String(e)}`);
          this.kroje.delete(nazwa);
          return null;
        });
      if (this.kroje.size >= MAKS_KROJOW) this.kroje.delete(this.kroje.keys().next().value!);
      this.kroje.set(nazwa, p);
    }
    return p;
  }

  /** Kroje rodziny w wadze (latin, latin-ext) – null, gdy rodziny nie ma w katalogu albo pliki są niedostępne. */
  async krojeRodziny(rodzina: string, waga: number): Promise<FontkitFont[] | null> {
    const w = wagaZKatalogu(rodzina, waga);
    if (w === null) return null;
    const lista = await Promise.all(ZAKRESY.map((z) => this.krojPliku(plikFontu(rodzina, w, false, z))));
    const ok = lista.filter((f): f is FontkitFont => !!f);
    return ok.length ? ok : null;
  }

  /** Surowy plik kroju (eksport kroje.zip) – null, gdy niedostępny. */
  async plikKroju(nazwa: string): Promise<Buffer | null> {
    try {
      return (await this.fonty.plikKreatora(nazwa)).buf;
    } catch (e) {
      this.logger.warn(`Plik kroju ${nazwa}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /** Kształt napisu (KsztaltujNapis z typy.ts) – null, gdy krój spoza katalogu albo niedostępny. */
  async ksztaltuj(tekst: string, rodzina: string, waga: number, rozstrzelenie = 0): Promise<KsztaltNapisu | null> {
    const t = tekst.normalize('NFC').slice(0, 200);
    if (!t.trim()) return null;
    const klucz = `${rodzina}|${waga}|${rozstrzelenie}|${t}`;
    if (this.cache.has(klucz)) {
      const v = this.cache.get(klucz)!;
      this.cache.delete(klucz);
      this.cache.set(klucz, v);
      return v;
    }
    const kroje = await this.krojeRodziny(rodzina, waga);
    const wynik = kroje ? ksztaltZKrojow(t, kroje, rozstrzelenie) : null;
    // brak krojów (proxy nie odpowiedziało) – nie zapamiętujemy, żeby kolejna próba mogła się udać
    if (kroje) {
      if (this.cache.size >= MAKS_CACHE) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(klucz, wynik);
    }
    return wynik;
  }

  /**
   * Zamienia elementy `<text>` w SVG wygenerowanym przez bibliotekę marki (KV, księga, podgląd logo) na ścieżki:
   * atrybuty x, y, fill, font-family (pierwsza rodzina), font-weight, font-size, letter-spacing, text-anchor.
   * Tekst bez kroju w katalogu zostaje `<text>` (rasteryzacja użyje kroju zastępczego). SVG pochodzi z naszej
   * biblioteki (zaufany szablon) – parser obsługuje tylko ten wzorzec, bez zagnieżdżonych `<tspan>`.
   */
  async tekstNaKrzywe(svg: string): Promise<string> {
    const re = /<text\b([^>]*)>([^<]*)<\/text>/g;
    const trafienia = [...svg.matchAll(re)];
    if (!trafienia.length) return svg;
    const zamiany = await Promise.all(trafienia.map((m) => this.tekstJakoSciezka(m[1]!, m[2]!)));
    let i = 0;
    return svg.replace(re, (cale) => zamiany[i++] ?? cale);
  }

  private async tekstJakoSciezka(atrybuty: string, tresc: string): Promise<string | null> {
    const atr = (n: string) => new RegExp(`\\s${n}="([^"]*)"`).exec(atrybuty)?.[1];
    const tekst = odkoduj(tresc);
    const rodzina = odkoduj(atr('font-family') ?? '').split(',')[0]!.trim().replace(/^['"]|['"]$/g, '');
    const waga = Number(atr('font-weight') ?? 400) || 400;
    const rozmiar = Number(atr('font-size') ?? 16);
    const x = Number(atr('x') ?? 0);
    const y = Number(atr('y') ?? 0);
    const odstep = Number(atr('letter-spacing') ?? 0);
    if (!rodzina || !Number.isFinite(rozmiar) || rozmiar <= 0) return null;
    const k = await this.ksztaltuj(tekst, rodzina, waga, Number.isFinite(odstep) && rozmiar ? (odstep / rozmiar) * 1000 : 0);
    if (!k) return null;
    const s = rozmiar / 1000;
    const kotwica = atr('text-anchor');
    const dx = kotwica === 'middle' ? -(k.szerokosc * s) / 2 : kotwica === 'end' ? -k.szerokosc * s : 0;
    const fill = atr('fill');
    const opacity = atr('opacity') ?? atr('fill-opacity');
    const transform = atr('transform');
    const p = `<path${fill ? ` fill="${fill}"` : ''}${opacity ? ` fill-opacity="${opacity}"` : ''} transform="${transform ? `${transform} ` : ''}translate(${r1(x + dx)} ${r1(y)}) scale(${s.toFixed(5)})" d="${k.d}"/>`;
    return p;
  }
}

function odkoduj(t: string): string {
  return t
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
