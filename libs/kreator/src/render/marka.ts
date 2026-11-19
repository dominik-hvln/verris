import type { Strona } from '../model.ts';
import { czystySvgMarki, MAKS_SVG_FAVICONU } from '../marka-strony/svg.ts';
import { czyCiemny } from './kolor.ts';
import type { PlikStrony } from './kontekst.ts';

/**
 * Marka na stronie (paczka 130): logo z migawki marki w nagłówku i stopce (inline SVG zamiast inicjału), favicon,
 * pliki logo do publikacji, ZIP i motywu WordPressa. Każde SVG przechodzi przez `czystySvgMarki` (biała lista,
 * serializacja od nowa) – druga linia obrony po walidacji modelu. Bez marki (albo z logo wyłączonym) – inicjał.
 */

/** Pliki marki w katalogu strony (te same ścieżki w publikacji, ZIP i motywie WordPressa). */
export const PLIKI_MARKI = {
  logo: 'assets/marka/logo.svg',
  logoNegatyw: 'assets/marka/logo-negatyw.svg',
  favicon: 'assets/marka/favicon.svg',
} as const;

export interface MarkaRenderu {
  nazwa: string;
  kolory: { glowny: string; akcent: string };
  /** Inline SVG do nagłówka (negatyw, gdy tło nagłówka jest ciemne i migawka go ma) – null = inicjał. */
  naglowek: string | null;
  /** Sygnet do nagłówka na wąskim ekranie. */
  naglowekSygnet: string | null;
  /** Inline SVG do stopki (zawsze ciemne tło): negatyw albo logo poziome w kolorze tekstu na ciemnym. */
  stopka: string | null;
  /** Czy logo w nagłówku/stopce to negatyw (kolory z pliku, bez nadpisywania kolorem kanału). */
  negatywNaglowek: boolean;
  negatywStopka: boolean;
  /** Favicon SVG jako plik (kolory na stałe) – null = favicon z inicjału. */
  favicon: string | null;
  faviconPng: string | null;
  obrazOg: string | null;
  pliki: PlikStrony[];
}

/** Przygotowanie marki raz na render (wszystkie podstrony). `ostrzezenia` – SVG, którego nie dało się użyć. */
export function przygotujMarke(strona: Strona, ostrzezenia: string[]): MarkaRenderu | null {
  const m = strona.marka;
  if (!m) return null;
  const plik = { plik: { glowny: m.kolory.glowny, akcent: m.kolory.akcent } };
  const inline = (svg: string | undefined, prefiksId: string) => (svg ? czystySvgMarki(svg, { prefiksId }) : null);
  const ciemnyNaglowek = czyCiemny(strona.motyw.paleta.tlo);

  let naglowek: string | null = null;
  let naglowekSygnet: string | null = null;
  let stopka: string | null = null;
  let negatywNaglowek = false;
  let negatywStopka = false;
  const pliki: PlikStrony[] = [];
  if (m.uzyj.logo) {
    const negatywN = ciemnyNaglowek ? inline(m.logoNegatyw, 'mkn') : null;
    naglowek = negatywN ?? inline(m.logoPoziome, 'mkn');
    negatywNaglowek = !!negatywN;
    naglowekSygnet = inline(m.sygnet, 'mkns');
    const negatywS = inline(m.logoNegatyw, 'mks');
    stopka = negatywS ?? inline(m.logoPoziome, 'mks');
    negatywStopka = !!negatywS;
    if (!naglowek) ostrzezenia.push('Logo marki nie przeszło kontroli bezpieczeństwa – na stronie jest inicjał firmy.');
    const logoPlik = czystySvgMarki(m.logoPoziome, plik);
    if (logoPlik) pliki.push({ sciezka: PLIKI_MARKI.logo, tresc: `${logoPlik}\n`, typ: 'image/svg+xml' });
    const negatywPlik = m.logoNegatyw ? czystySvgMarki(m.logoNegatyw, plik) : null;
    if (negatywPlik) pliki.push({ sciezka: PLIKI_MARKI.logoNegatyw, tresc: `${negatywPlik}\n`, typ: 'image/svg+xml' });
  }
  const favicon = m.uzyj.favicon ? czystySvgMarki(m.favicon, plik, MAKS_SVG_FAVICONU) : null;
  if (favicon) pliki.push({ sciezka: PLIKI_MARKI.favicon, tresc: `${favicon}\n`, typ: 'image/svg+xml' });
  return {
    nazwa: m.nazwa,
    kolory: m.kolory,
    naglowek,
    naglowekSygnet: naglowek ? naglowekSygnet : null,
    stopka,
    negatywNaglowek,
    negatywStopka,
    favicon,
    faviconPng: m.uzyj.favicon ? (m.faviconPng ?? null) : null,
    obrazOg: m.uzyj.logo ? (m.obrazOg ?? null) : null,
    pliki,
  };
}

/** Reguły CSS logo marki (kolory kanałów z modelu – wartości #RRGGBB sprawdzone schematem). */
export function cssMarki(m: MarkaRenderu, ciemnyNaglowek: boolean): string {
  return (
    `.logo-marka{gap:0;--akcent:${m.kolory.akcent}}` +
    `.logo-svg{display:block;flex:none;height:2.75rem;line-height:0}` +
    `.logo-svg svg{display:block;height:100%;width:auto;max-width:min(16rem,60vw)}` +
    `.logo-syg{display:none}` +
    `.naglowek .logo-marka{color:${ciemnyNaglowek ? 'var(--s-tekst)' : m.kolory.glowny}}` +
    `.stopka .logo-marka{color:var(--s-tekst);--akcent:currentColor}` +
    `.stopka .logo-marka.negatyw{--akcent:${m.kolory.akcent}}` +
    `.stopka .logo-svg{height:3rem}` +
    `@media (max-width:30rem){.logo-marka.z-sygnetem .logo-poz{display:none}.logo-marka.z-sygnetem .logo-syg{display:block}}\n`
  );
}
