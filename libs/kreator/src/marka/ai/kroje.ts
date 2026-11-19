import { KATALOG_FONTOW, KATALOG_STYLOW, type FontKatalogu } from '../../style/katalog-stylow.ts';

/**
 * Kroje w kreatorze marki – ten sam zamknięty KATALOG_FONTOW (OFL, polskie znaki) co strony. Tu tylko to, czego
 * katalog nie ma, a czego potrzebuje projektant znaku: krótki charakter kroju w napisie logo (blok M2 promptu)
 * i dobór kroju tekstu do kroju napisu. Test pilnuje, że każdy krój z katalogu ma opis (nowy krój = nowy opis).
 */

export const CHARAKTER_KROJOW: Readonly<Record<string, string>> = {
  Fraunces: 'miękki szeryf z charakterem, ciepły, rzemieślniczy',
  'Playfair Display': 'kontrastowy szeryf, elegancki, wydawniczy',
  'Cormorant Garamond': 'lekki szeryf renesansowy, luksusowy, delikatny w małych rozmiarach',
  'Instrument Serif': 'wąski szeryf, redakcyjny, współczesny',
  'DM Serif Display': 'gruby kontrastowy szeryf, wyrazisty w krótkich nazwach',
  'Libre Baskerville': 'klasyczny szeryf, spokojny, ekspercki',
  Lora: 'szeryf z łagodnymi łukami, przyjazny, czytelny',
  'Source Serif 4': 'rzeczowy szeryf, ekspercki, neutralny',
  Newsreader: 'szeryf prasowy, rzetelny, kulturalny',
  'Young Serif': 'okrągły szeryf w stylu retro, ciepły, lokalny',
  'Bodoni Moda': 'didot o wysokim kontraście, moda i luksus, tylko większe rozmiary',
  'EB Garamond': 'garamond, tradycyjny, literacki',
  Gloock: 'ciężki szeryf o ostrym kontraście, odważny',
  'Zilla Slab': 'szeryf blokowy, techniczny, solidny',
  Literata: 'szeryf książkowy, spokojny, łagodny',
  'Abril Fatface': 'gruby didot dekoracyjny, plakatowy',
  'Alfa Slab One': 'ciężki szeryf blokowy, warsztatowy, głośny',
  Shrikhand: 'gruby kursywowy display, zabawny, retro',
  Inter: 'neutralny grotesk, techniczny, bez charakteru – raczej do tekstu',
  Manrope: 'geometryczno-groteskowy, nowoczesny, czysty',
  'DM Sans': 'geometryczny o niskim kontraście, przyjazny, prosty',
  'IBM Plex Sans': 'grotesk inżynierski z ostrymi zakończeniami, techniczny',
  'Space Grotesk': 'grotesk z ekscentrycznymi detalami, technologiczny',
  'Work Sans': 'grotesk z lekko szerokimi literami, otwarty',
  Archivo: 'grotesk z szerokimi wagami, rzeczowy, mocny',
  'Archivo Black': 'bardzo gruby grotesk, krótkie nazwy, siła',
  'Bricolage Grotesque': 'grotesk z optycznymi nieregularnościami, odważny, artystyczny',
  Nunito: 'zaokrąglone zakończenia, miękki, rodzinny',
  Quicksand: 'cienki zaokrąglony, delikatny, lekki',
  Figtree: 'geometryczny, pogodny, czytelny',
  'Plus Jakarta Sans': 'geometryczny o wysokich literach, nowoczesny, startupowy',
  Sora: 'geometryczny szeroki, technologiczny, otwarty',
  Outfit: 'geometryczny okrągły, prosty, przyjazny',
  Lexend: 'szeroki, bardzo czytelny, spokojny',
  Anton: 'wąski ciężki grotesk, plakatowy, tylko wersaliki',
  'Bebas Neue': 'wąskie wersaliki, sportowy, plakatowy',
  Oswald: 'wąski grotesk, zwarty, dynamiczny',
  Barlow: 'lekko zaokrąglony grotesk, techniczny, drogowy',
  'Barlow Condensed': 'wąski grotesk, zwarty, przemysłowy',
  Syne: 'ekscentryczny grotesk o rozpiętych wagach, artystyczny',
  Unbounded: 'szeroki zaokrąglony display, futurystyczny, głośny',
  'Schibsted Grotesk': 'grotesk prasowy, rzeczowy, zdecydowany',
  'Hanken Grotesk': 'cichy grotesk, minimalistyczny',
  'Public Sans': 'neutralny grotesk urzędowy, przejrzysty',
  'Libre Franklin': 'klasyczny grotesk amerykański, solidny',
  Karla: 'grotesk o nieregularnym rysunku, swobodny',
  Rubik: 'lekko zaokrąglone narożniki, przyjazny, zwarty',
  'Baloo 2': 'gruby zaokrąglony, dziecięcy, zabawny',
  Comfortaa: 'cienki geometryczny zaokrąglony, miękki, dekoracyjny',
  'Familjen Grotesk': 'grotesk z kaligraficznym rysem, ciepły',
  'IBM Plex Mono': 'monospace inżynierski – akcent, nie napis główny',
  'JetBrains Mono': 'monospace programistyczny – akcent',
  'Space Mono': 'monospace retro-tech – akcent',
  Caveat: 'odręczny, swobodny – tylko krótki podpis lub akcent',
};

const FONTY = new Map(KATALOG_FONTOW.map((f) => [f.rodzina, f] as const));
const FONTY_MALYMI = new Map(KATALOG_FONTOW.map((f) => [f.rodzina.toLocaleLowerCase('pl-PL'), f] as const));

/** Krój z katalogu po nazwie (bez względu na wielkość liter) albo undefined. */
export function krojZKatalogu(nazwa: string | undefined): FontKatalogu | undefined {
  if (!nazwa) return undefined;
  return FONTY.get(nazwa) ?? FONTY_MALYMI.get(nazwa.trim().toLocaleLowerCase('pl-PL'));
}

/** Najbliższa dostępna waga kroju (przy remisie – cięższa: napis logo lepiej znosi grubszy rysunek). */
export function wagaKroju(font: FontKatalogu, waga: number | undefined): number {
  const cel = waga ?? 600;
  return [...font.wagi].sort((a, b) => Math.abs(a - cel) - Math.abs(b - cel) || b - a)[0];
}

/**
 * Krój tekstu (strona, materiały) do kroju napisu: para z katalogu stylów kreatora stron, gdy krój napisu jest
 * w niej krojem nagłówków; inaczej – napis szeryfowy/ozdobny → Inter, napis bezszeryfowy tekstowy (waga 400, ≥ 3 wagi, nie wąski) → ten sam krój,
 * pozostałe → Inter.
 */
export function krojTekstuDla(napis: string): string {
  for (const s of KATALOG_STYLOW) {
    const para = s.pary.find((p) => p.naglowki === napis);
    if (para) return para.tekst;
  }
  const f = FONTY.get(napis);
  if (f && f.kategoria === 'bezszeryfowy' && f.wagi.includes(400) && f.wagi.length >= 3 && !/Condensed|Anton|Bebas|Unbounded|Syne/.test(napis)) return napis;
  return 'Inter';
}
