/**
 * Kreator marki – favicon i ikony aplikacji (koncepcja 3.8): favicon.svg z wariantem dla trybu ciemnego
 * (`prefers-color-scheme` w SVG – obsługiwane przez Chromium i Firefox, Safari używa favicon.ico/PNG
 * [do weryfikacji aktualnego wsparcia]), favicon.ico (16/32/48 px – API rasteryzuje SVG), apple-touch-icon 180 px,
 * ikony 192 i 512 px (w tym „maskable” z marginesem bezpiecznym 20 %) i manifest aplikacji webowej.
 *
 * Źródła: Web App Manifest – https://www.w3.org/TR/appmanifest/ (pola name, short_name, icons, theme_color,
 * background_color, display); maskable icons – strefa bezpieczna = koło o promieniu 40 % (W3C, „purpose”).
 */
import type { KoloryMarki } from './model.ts';
import { esc } from '../render/esc.ts';
import { pokolorujSygnet } from './zloz.ts';
import { skrot } from './skrot.ts';

export interface IkonaAplikacji {
  plik: string;
  rozmiar: number;
  /** Margines wokół znaku (ułamek boku). */
  margines: number;
  /** Tło w kolorze głównym (ikony na ekranie telefonu nie mogą być przezroczyste – iOS daje czarne tło). */
  tlo: boolean;
  zaokraglenie: number;
  purpose?: 'any' | 'maskable';
}

export const IKONY_APLIKACJI: IkonaAplikacji[] = [
  { plik: 'apple-touch-icon.png', rozmiar: 180, margines: 0.16, tlo: true, zaokraglenie: 0 },
  { plik: 'icon-192.png', rozmiar: 192, margines: 0.16, tlo: true, zaokraglenie: 0.22, purpose: 'any' },
  { plik: 'icon-512.png', rozmiar: 512, margines: 0.16, tlo: true, zaokraglenie: 0.22, purpose: 'any' },
  { plik: 'icon-512-maskable.png', rozmiar: 512, margines: 0.24, tlo: true, zaokraglenie: 0, purpose: 'maskable' },
];

/** Rozmiary w favicon.ico (API składa ICO z PNG). */
export const ROZMIARY_ICO = [16, 32, 48] as const;

const f2 = (x: number) => String(Math.round(x * 100) / 100);

/**
 * favicon.svg: znak (wariant „favicon”) w kolorach marki; w trybie ciemnym przeglądarki – biały z jasnym akcentem.
 * `kafel: true` – znak biały na zaokrąglonym kwadracie w kolorze głównym (bez potrzeby wariantu ciemnego).
 */
export function faviconSvg(wnetrzeFavicon: string, k: KoloryMarki, o: { kafel?: boolean } = {}): string {
  if (o.kafel) {
    const znak = pokolorujSygnet(wnetrzeFavicon, '#FFFFFF', k.akcentJasny);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 100 100">` +
      `<rect width="100" height="100" rx="22" fill="${k.glowny}"/><g transform="translate(14 14) scale(0.72)">${znak}</g></svg>`
    );
  }
  // klasy z unikalnym przedrostkiem – SVG osadzony w HTML (panel) nie nadpisze innych
  const p = `f${skrot(wnetrzeFavicon + k.glowny + k.akcent)}`;
  const znak = wnetrzeFavicon
    .replace(/fill="var\(--akcent, currentColor\)"/g, `class="${p}a"`)
    .replace(/fill="currentColor"/g, `class="${p}g"`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 100 100">` +
    `<style>.${p}g{fill:${k.glowny}}.${p}a{fill:${k.akcent}}@media (prefers-color-scheme:dark){.${p}g{fill:#FFFFFF}.${p}a{fill:${k.akcentJasny}}}</style>` +
    `${znak}</svg>`
  );
}

/** SVG ikony aplikacji do rasteryzacji (API: sharp) – tło w kolorze głównym, znak biały z jasnym akcentem. */
export function ikonaSvg(wnetrzeFavicon: string, k: KoloryMarki, ikona: IkonaAplikacji): string {
  const R = ikona.rozmiar;
  const m = R * ikona.margines;
  const s = (R - 2 * m) / 100;
  const tlo = ikona.tlo ? `<rect width="${R}" height="${R}" rx="${f2(R * ikona.zaokraglenie)}" fill="${k.glowny}"/>` : '';
  const znak = ikona.tlo ? pokolorujSygnet(wnetrzeFavicon, '#FFFFFF', k.akcentJasny) : pokolorujSygnet(wnetrzeFavicon, k.glowny, k.akcent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${R}" height="${R}" viewBox="0 0 ${R} ${R}">${tlo}<g transform="translate(${f2(m)} ${f2(m)}) scale(${f2(s)})">${znak}</g></svg>`;
}

/** Manifest aplikacji webowej (site.webmanifest) – JSON. */
export function manifestAplikacji(nazwa: string, k: KoloryMarki, o: { krotkaNazwa?: string; sciezka?: string } = {}): string {
  const sciezka = (o.sciezka ?? '/').replace(/[^A-Za-z0-9/_.-]/g, '');
  const krotka = (o.krotkaNazwa ?? nazwa).slice(0, 12);
  return JSON.stringify(
    {
      name: nazwa,
      short_name: krotka,
      start_url: sciezka,
      display: 'standalone',
      theme_color: k.glowny,
      background_color: k.paleta.tlo,
      icons: IKONY_APLIKACJI.filter((i) => i.purpose).map((i) => ({
        src: `${sciezka}${i.plik}`,
        sizes: `${i.rozmiar}x${i.rozmiar}`,
        type: 'image/png',
        purpose: i.purpose,
      })),
    },
    null,
    2,
  );
}

/** Znaczniki `<head>` dla strony (Kreator stron / eksport). */
export function znacznikiFavicon(sciezka = '/', kolor?: string): string {
  const p = esc(sciezka);
  return [
    `<link rel="icon" href="${p}favicon.ico" sizes="32x32">`,
    `<link rel="icon" href="${p}favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="${p}apple-touch-icon.png">`,
    `<link rel="manifest" href="${p}site.webmanifest">`,
    ...(kolor ? [`<meta name="theme-color" content="${esc(kolor)}">`] : []),
  ].join('\n');
}
