import { KATALOG_FONTOW } from '../../style/katalog-stylow.ts';
import type { BriefMarki } from '../model.ts';
import type { RodzinaSygnetu } from '../typy.ts';

/**
 * Paczka 134 – związek znaku z briefem (feedback właściciela z serii „Lubuski Sport”: „nie możemy opierać się na
 * gotowych kształtach, bo nie mają one nic wspólnego z nazwą, branżą ani nic takiego”).
 *
 *  - `kategorieBriefu` – kategorie branży wykryte w briefie (branża, opis, uwagi, nazwa) po początkach słów
 *    (bez polskich znaków), np. „Lubuski Sport, sklep rowerowy” → sport;
 *  - `rodzinaPasuje` – rodzina ABSTRAKCYJNA trafia do serii tylko, gdy jej `branze` (kategorie i rdzenie słów z katalogu
 *    `sygnety/*`) pasują do briefu; monogramy (litery nazwy) pasują zawsze;
 *  - `MOTYWY_BRANZ` – słownik motywów do przetworzenia (M2) – punkt wyjścia koncepcji symbolu AI, nie gotowy rysunek;
 *  - `krojeDlaBriefu` – kroje napisu dopasowane do cech i branży (sport – mocne, dynamiczne bezszeryfowe;
 *    nie Playfair dla siłowni), z listą krojów wykluczonych dla branży.
 */

/** Kategorie branż (identyfikatory – także w `branze` rodzin) i rdzenie słów do wykrycia w briefie (bez ogonków). */
export const KATEGORIE_BRANZ: Readonly<Record<string, readonly string[]>> = {
  sport: ['sport', 'fitnes', 'silowni', 'silownia', 'trening', 'trener', 'biega', 'biegow', 'maraton', 'rower', 'kolars', 'narci', 'narty', 'narciar', 'pilk', 'pilkars', 'tenis', 'plywa', 'crossfit', 'boks', 'sztuki walki', 'karate', 'judo', 'wspinac', 'kajak', 'gym', 'druzyn', 'klub sportow', 'turniej', 'zawody sportow', 'outdoor', 'surf', 'jezdziec', 'jeździec', 'golf', 'siatkow', 'koszykow'],
  gastronomia: ['restaura', 'gastro', 'kawiar', 'kawa$', 'kawy$', 'bistro', 'bar$', 'pizz', 'pierog', 'catering', 'kuchni', 'jedzeni', 'lodziar', 'lody$', 'cukierni', 'piekar', 'pieczyw', 'chleb', 'burger', 'food', 'obiad', 'kebab', 'sushi', 'herbaciar', 'winiar', 'browar', 'piwo', 'pub$', 'bulk', 'wypiek', 'ciast', 'tort', 'cafe'],
  uroda: ['kosmet', 'beauty', 'urod$', 'urody$', 'uroda$', 'fryzjer', 'barber', 'salon fryz', 'salon kosmet', 'salon urod', 'paznok', 'manicur', 'makijaz', 'spa$', 'masaz', 'brwi', 'rzes$', 'rzesy$', 'przedluzanie rzes', 'wizaz', 'stylist', 'perfum'],
  prawo: ['kancelar', 'prawn', 'prawnik', 'adwokat', 'radca', 'notar', 'komornik', 'mediac', 'windykac'],
  finanse: ['finans', 'ksiegow', 'rachunk', 'biuro rachunk', 'podatk', 'kadr', 'plac$', 'bank', 'inwest', 'kredyt', 'ubezpiecz', 'leasing', 'audyt', 'bilans', 'doradztwo podatk', 'faktur'],
  it: ['it$', 'informaty', 'program', 'oprogramow', 'aplikac', 'software', 'serwis komputer', 'komputer', 'internet', 'hosting', 'siec', 'cyber', 'dane$', 'danych', 'analit', 'saas', 'technolog', 'web'],
  budownictwo: ['budow', 'budowla', 'remont', 'wykonczen', 'dach', 'murar', 'deweloper', 'instalac', 'elektry', 'hydraul', 'stolar', 'okna', 'drzwi', 'posadz', 'architekt', 'projektow wnetrz', 'wnetrz'],
  turystyka: ['turyst', 'podroz', 'wakac', 'hotel', 'pensjonat', 'noclegi', 'nocleg', 'agroturyst', 'camping', 'kemping', 'wycieczk', 'przewodnik', 'schronisk', 'apartament', 'gor$', 'gorsk', 'mazur', 'morze', 'jezior'],
  zdrowie: ['zdrow', 'lekarz', 'lekar', 'medy', 'klinik', 'gabinet', 'fizjo', 'rehabilit', 'stomatolog', 'dentyst', 'psycholog', 'terapi', 'terapeut', 'dietety', 'diet', 'apteka', 'weteryn', 'opiek', 'pielegn', 'joga', 'jogi$', 'pilates'],
  edukacja: ['eduk', 'szkol', 'szkoł', 'kurs', 'nauka', 'nauczan', 'korepet', 'jezyk', 'akademi', 'przedszkol', 'uczeln', 'lekcj', 'tutor', 'egzamin', 'nauki jazdy', 'osk$'],
  rzemioslo: ['rzemies', 'rekodziel', 'pracowni', 'manufaktur', 'stolar', 'krawiec', 'krawiec', 'szewc', 'kowal$', 'kowalstw', 'ceramik', 'garncar', 'zlotnik', 'jubiler', 'handmade', 'recznie', 'tapicer', 'warsztat'],
  nieruchomosci: ['nieruchom', 'mieszkan', 'deweloper', 'posrednict', 'wynajem', 'zarzadzanie nieruchom', 'osiedl', 'apartament'],
  motoryzacja: ['motoryz', 'samochod', 'auto$', 'autoserw', 'autokomis', 'warsztat samoch', 'mechani', 'wulkaniz', 'opon', 'blachar', 'lakier', 'myjni', 'detailing', 'motocykl', 'czesci samoch', 'diagnostyk', 'holowan', 'nauka jazdy', 'nauki jazdy'],
  rolnictwo: ['rolni', 'gospodarstw', 'farm$', 'uprawa', 'sad$', 'sadown', 'pasiek', 'pszczel', 'miod', 'zboz', 'hodowl', 'warzyw', 'owoc', 'ogrod', 'szklarni', 'nasion', 'winnic', 'winorosl'],
  eko: ['eko$', 'eko-', 'ekolog', 'natur', 'recykl', 'odnawial', 'fotowolt', 'zero waste', 'bio$', 'organiczn', 'roslin', 'las$', 'lesn', 'ogrod'],
  woda: ['woda', 'wodn', 'basen', 'plywal', 'zegl', 'rejs', 'kajak', 'morsk', 'jezior', 'rzek', 'odra', 'hydraul', 'pralni', 'surf'],
  logistyka: ['logist', 'transport', 'spedyc', 'kurier', 'przeprowadz', 'magazyn', 'przewoz', 'flota', 'taxi', 'taksow'],
  energia: ['energ', 'fotowolt', 'prad', 'elektr', 'solar', 'pompy ciepla', 'oze$'],
  handel: ['sklep', 'handel', 'hurtown', 'butik', 'moda', 'odziez', 'e-commerce', 'ecommerce', 'sprzedaz', 'outlet', 'market$', 'supermarket', 'wyposazeni'],
  marketing: ['marketing', 'reklam', 'agencj', 'social media', 'branding', 'kreatyw', 'studio graf', 'studio reklam', 'grafik', 'fotograf', 'wideo', 'film', 'media'],
  wydarzenia: ['event', 'wydarzen', 'slub', 'wesel', 'imprez', 'konferenc', 'koncert', 'festiwal', 'animac', 'dekorac', 'kwiaciar'],
  doradztwo: ['doradz', 'konsult', 'coach', 'mentor', 'szkolen', 'hr$', 'rekrutac', 'zarzadzan', 'strateg'],
  kultura: ['kultur', 'muzeum', 'galeri', 'teatr', 'sztuk', 'muzyk', 'ksiegarni', 'wydawnict', 'bibliotek', 'fundacj', 'stowarzysz'],
  dzieci: ['dzieci', 'dzieck', 'przedszkol', 'zlobek', 'zlobk', 'malucha', 'niemowl', 'zabawk'],
  druk: ['druk', 'drukarn', 'poligraf', 'nadruk', 'plakat', 'reklama zewn'],
  sprzatanie: ['sprzat', 'czystosc', 'pralni', 'dezynfek'],
};

/** Motywy branż do PRZETWORZENIA (M2) – punkt wyjścia koncepcji, nigdy dosłowny rysunek przedmiotu. */
export const MOTYWY_BRANZ: Readonly<Record<string, string>> = {
  sport: 'tor i linia mety, ruch i pęd (pochylenie, przesunięcie), start, rytm kroku, szczyt, łuk trajektorii; nie: piłka, puchar, sylwetka biegacza',
  gastronomia: 'łuk pieca, para jako fala, nacięcie bochenka, talerz jako koło z cięciem, rytm ziaren; nie: widelec z nożem, czapka kucharza',
  uroda: 'linia profilu, kropla, lustro jako elipsa, łagodny łuk brwi, blask jako jeden promień; nie: sylwetka kobiety, nożyczki',
  prawo: 'równowaga dwóch mas, oś pionowa, kolumna jako rytm pionów, pieczęć; nie: waga, paragraf, młotek',
  finanse: 'równowaga dwóch kolumn (winien–ma), kratka księgi, stopnie, domknięty kwadrat, porządek siatki; nie: wykres ze strzałką, moneta, skarbonka',
  it: 'moduł i siatka, nawias, kursor, przepływ między węzłami, piksel; nie: koło zębate, chmura, globus',
  budownictwo: 'kąt dachu jako cięcie, warstwy muru, pion i poziom, otwór drzwi w literze; nie: dom z kominem, kask, kielnia',
  turystyka: 'horyzont, ścieżka, łuk drogi, słońce nad linią, punkt na mapie; nie: walizka, samolot, palma',
  zdrowie: 'osłona (dwa łuki), oddech jako fala, kontur dłoni uproszczony do łuku, plus w przestrzeni negatywnej; nie: serce, krzyż apteczny, ząb dosłownie',
  edukacja: 'otwarta forma (strona jako dwa łuki), stopnie, iskra jako jeden punkt, ścieżka w górę; nie: czapka absolwenta, żarówka, sowa',
  rzemioslo: 'ślad narzędzia (cięcie, ścieg), słoje drewna, pieczęć warsztatu, ręczny rytm; nie: młotek z kluczem',
  nieruchomosci: 'okno, próg, klucz jako przestrzeń negatywna, rzut kondygnacji, kąt dachu w literze; nie: dom z kominem',
  motoryzacja: 'tor jazdy, łuk zakrętu, bieżnik jako rytm, prędkość jako pochylenie; nie: samochód z boku, klucz płaski',
  rolnictwo: 'bruzdy pola, kłos przetworzony do rytmu, plaster miodu jako moduł, słońce nad polem; nie: traktor, krowa',
  eko: 'jedna krzywa wzrostu, koło podzielone na dwie części, kiełek z litery; nie: liść z kroplą, globus, strzałki recyklingu',
  woda: 'fala, kropla w przestrzeni negatywnej, nurt jako dwie linie, odbicie; nie: kran',
  logistyka: 'kierunek (szewron), trasa między punktami, kaskada, ruch w przód; nie: ciężarówka, paczka',
  energia: 'promień, wycinek koła, impuls, wschód nad linią; nie: błyskawica, żarówka',
  handel: 'próg i wejście, metka jako kształt, koszyk jako łuk; nie: wózek sklepowy',
  marketing: 'kadr, przesunięcie, dwa kolory w jednym kształcie, cytat jako forma; nie: megafon, żarówka',
  wydarzenia: 'połączenie dwóch form, rozbłysk, splot; nie: obrączki dosłownie, balony',
  doradztwo: 'dwie formy w rozmowie, ścieżka z punktu A do B, węzeł; nie: uścisk dłoni',
  kultura: 'kadr, scena jako łuk, rytm pionów, otwarta księga jako dwa łuki',
  dzieci: 'proste, okrągłe formy, klocek, tęcza jako łuki; nie: misie i postaci',
  druk: 'arkusz, rejestracja kolorów (przesunięte formy), raster z kropek',
  sprzatanie: 'błysk jako jeden promień, czysta linia, kropla; nie: wiadro, miotła',
};

/** Tekst bez ogonków, małe litery (wykrywanie kategorii – klient pisze „siłownia” albo „silownia”). */
export function normalizujTekst(t: string | undefined): string {
  return (t ?? '')
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Wzorzec dopasowania: rdzeń na początku słowa; „x$” – całe słowo; fraza z odstępem – od początku słowa. */
function wzorzec(rdzen: string): RegExp {
  const caly = rdzen.endsWith('$');
  const r = normalizujTekst(caly ? rdzen.slice(0, -1) : rdzen).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${r}${caly ? '(?![\\p{L}\\p{N}])' : ''}`, 'u');
}

const WZORCE = new Map<string, RegExp>();
const wz = (r: string) => {
  let w = WZORCE.get(r);
  if (!w) WZORCE.set(r, (w = wzorzec(r)));
  return w;
};

type ZrodloBriefu = Partial<Pick<BriefMarki, 'nazwa' | 'branza' | 'opis' | 'uwagi' | 'podpis'>>;

const tekstBriefu = (b: ZrodloBriefu) => normalizujTekst([b.branza, b.podpis, b.opis, b.uwagi, b.nazwa].filter(Boolean).join(' | '));

/** Kategorie branży wykryte w briefie (kolejność: najpierw z pola „branża”, potem z reszty). */
export function kategorieBriefu(b: ZrodloBriefu): string[] {
  const branza = normalizujTekst([b.branza, b.podpis].filter(Boolean).join(' '));
  const reszta = tekstBriefu(b);
  const wynik: string[] = [];
  for (const zrodlo of [branza, reszta])
    for (const [k, rdzenie] of Object.entries(KATEGORIE_BRANZ)) if (!wynik.includes(k) && rdzenie.some((r) => wz(r).test(zrodlo))) wynik.push(k);
  return wynik;
}

/**
 * Siła dopasowania rodziny do briefu: kategorie wspólne (×2) + rdzenie słów rodziny znalezione w briefie (×1).
 * 0 = brak związku z briefem (rodzina abstrakcyjna nie trafia do serii).
 */
export function dopasowanieRodziny(r: Pick<RodzinaSygnetu, 'branze'>, b: ZrodloBriefu, kategorie: readonly string[] = kategorieBriefu(b)): number {
  const tekst = tekstBriefu(b);
  let w = 0;
  for (const x of r.branze ?? []) {
    if (KATEGORIE_BRANZ[x]) {
      if (kategorie.includes(x)) w += 2;
    } else if (x.length >= 3 && wz(x).test(tekst)) w += 1;
  }
  return w;
}

/** Monogram (litery nazwy) pasuje zawsze; rodzina abstrakcyjna – tylko z dopasowaniem branży. */
export function rodzinaPasuje(r: Pick<RodzinaSygnetu, 'branze' | 'monogram'>, b: ZrodloBriefu, kategorie?: readonly string[]): boolean {
  return r.monogram || dopasowanieRodziny(r, b, kategorie) > 0;
}

// ───────────────────────── kroje do charakteru ─────────────────────────

/** Kroje pasujące do cech marki (słownik CECHY_MARKI). */
export const KROJE_CECH: Readonly<Record<string, readonly string[]>> = {
  energiczna: ['Archivo Black', 'Bebas Neue', 'Oswald', 'Anton', 'Barlow Condensed', 'Unbounded', 'Archivo', 'Rubik'],
  odwazna: ['Archivo Black', 'Anton', 'Gloock', 'Unbounded', 'Bricolage Grotesque', 'Alfa Slab One', 'Syne'],
  nowoczesna: ['Manrope', 'Sora', 'Plus Jakarta Sans', 'Space Grotesk', 'Outfit', 'Figtree', 'Unbounded'],
  techniczna: ['IBM Plex Sans', 'Space Grotesk', 'Barlow', 'Manrope', 'Zilla Slab', 'Sora'],
  minimalistyczna: ['Manrope', 'Hanken Grotesk', 'DM Sans', 'Work Sans', 'Outfit'],
  elegancka: ['Playfair Display', 'Cormorant Garamond', 'Instrument Serif', 'Bodoni Moda', 'DM Serif Display'],
  luksusowa: ['Bodoni Moda', 'Cormorant Garamond', 'Playfair Display', 'Gloock', 'Instrument Serif'],
  klasyczna: ['Libre Baskerville', 'EB Garamond', 'Source Serif 4', 'Lora', 'Newsreader'],
  ekspercka: ['Source Serif 4', 'Libre Baskerville', 'IBM Plex Sans', 'Schibsted Grotesk', 'Public Sans', 'Newsreader'],
  rzemieslnicza: ['Fraunces', 'Young Serif', 'Zilla Slab', 'Alfa Slab One', 'Lora'],
  ciepla: ['Fraunces', 'Young Serif', 'Lora', 'Nunito', 'Familjen Grotesk'],
  przyjazna: ['Nunito', 'DM Sans', 'Figtree', 'Outfit', 'Rubik', 'Lexend'],
  zabawna: ['Baloo 2', 'Rubik', 'Shrikhand', 'Comfortaa', 'Unbounded'],
  naturalna: ['Lora', 'Fraunces', 'Literata', 'Familjen Grotesk', 'Work Sans'],
  spokojna: ['Lexend', 'Lora', 'Literata', 'Work Sans', 'DM Sans'],
  lokalna: ['Young Serif', 'Zilla Slab', 'Archivo', 'Fraunces', 'Libre Franklin'],
};

const SZERYFY_DELIKATNE = ['Playfair Display', 'Cormorant Garamond', 'Bodoni Moda', 'EB Garamond', 'Instrument Serif'];
const ZABAWNE = ['Shrikhand', 'Comfortaa', 'Baloo 2', 'Quicksand'];

/** Kroje dla kategorii branży: `plus` – pasują, `minus` – wykluczone (nie trafią do slotu). */
export const KROJE_BRANZ: Readonly<Record<string, { plus: readonly string[]; minus: readonly string[] }>> = {
  sport: { plus: ['Bebas Neue', 'Archivo Black', 'Oswald', 'Anton', 'Barlow Condensed', 'Archivo', 'Unbounded', 'Barlow', 'Space Grotesk'], minus: [...SZERYFY_DELIKATNE, ...ZABAWNE, 'Libre Baskerville', 'Lora', 'Literata', 'Newsreader', 'Abril Fatface'] },
  gastronomia: { plus: ['Fraunces', 'Young Serif', 'DM Serif Display', 'Lora', 'Familjen Grotesk'], minus: ['IBM Plex Sans', 'Space Grotesk', 'Public Sans'] },
  prawo: { plus: ['Libre Baskerville', 'Source Serif 4', 'EB Garamond', 'Newsreader', 'Cormorant Garamond'], minus: [...ZABAWNE, 'Unbounded', 'Bebas Neue', 'Anton', 'Alfa Slab One', 'Abril Fatface', 'Syne'] },
  finanse: { plus: ['Source Serif 4', 'IBM Plex Sans', 'Manrope', 'Libre Baskerville', 'Public Sans', 'Schibsted Grotesk'], minus: [...ZABAWNE, 'Abril Fatface', 'Unbounded', 'Syne', 'Alfa Slab One', 'Bebas Neue', 'Anton'] },
  uroda: { plus: ['Cormorant Garamond', 'Playfair Display', 'Instrument Serif', 'DM Sans', 'Outfit'], minus: ['Alfa Slab One', 'Anton', 'Archivo Black', 'Zilla Slab', 'Barlow Condensed'] },
  it: { plus: ['Space Grotesk', 'IBM Plex Sans', 'Manrope', 'Sora', 'Plus Jakarta Sans'], minus: [...SZERYFY_DELIKATNE, 'Shrikhand', 'Abril Fatface'] },
  budownictwo: { plus: ['Archivo', 'Barlow Condensed', 'Oswald', 'Zilla Slab', 'Archivo Black'], minus: [...SZERYFY_DELIKATNE, ...ZABAWNE] },
  motoryzacja: { plus: ['Barlow Condensed', 'Oswald', 'Archivo Black', 'Bebas Neue', 'Unbounded'], minus: [...SZERYFY_DELIKATNE, ...ZABAWNE] },
  edukacja: { plus: ['Nunito', 'Lexend', 'Rubik', 'Figtree', 'Literata'], minus: ['Bodoni Moda', 'Anton', 'Abril Fatface'] },
  dzieci: { plus: ['Nunito', 'Baloo 2', 'Rubik', 'Lexend'], minus: ['Bodoni Moda', 'Anton', 'Gloock', 'Cormorant Garamond'] },
  zdrowie: { plus: ['Lexend', 'DM Sans', 'Figtree', 'Nunito', 'Source Serif 4'], minus: ['Shrikhand', 'Alfa Slab One', 'Anton', 'Abril Fatface'] },
  turystyka: { plus: ['Young Serif', 'Fraunces', 'DM Sans', 'Outfit'], minus: [] },
  rzemioslo: { plus: ['Fraunces', 'Young Serif', 'Zilla Slab', 'Alfa Slab One'], minus: ['Space Grotesk', 'IBM Plex Sans'] },
  rolnictwo: { plus: ['Lora', 'Fraunces', 'Familjen Grotesk', 'Work Sans', 'Young Serif'], minus: ['Space Grotesk', 'Bodoni Moda'] },
  eko: { plus: ['Lora', 'Fraunces', 'Familjen Grotesk', 'Work Sans'], minus: ['Bodoni Moda', 'Anton'] },
  nieruchomosci: { plus: ['Manrope', 'Libre Baskerville', 'Instrument Serif', 'Schibsted Grotesk'], minus: [...ZABAWNE] },
};

/**
 * Kroje napisu dla briefu, od najlepiej pasujących: +2 za każdą cechę briefu, +3 za kategorię branży, kroje
 * wykluczone dla branży odpadają. Pusta lista = brief bez sygnału (preselekcja wraca do rotacji kategorii).
 * Tylko kroje z wagą ≥ 500 (napis logo) i bez monospace/odręcznych.
 */
export function krojeDlaBriefu(b: Pick<BriefMarki, 'cechy'> & ZrodloBriefu, kategorie: readonly string[] = kategorieBriefu(b)): string[] {
  const minus = new Set(kategorie.flatMap((k) => KROJE_BRANZ[k]?.minus ?? []));
  const wynik: { f: string; w: number; i: number }[] = [];
  KATALOG_FONTOW.forEach((f, i) => {
    // Napis logo: grubość ≥ 500 albo krój jednowagowy (display: Bebas Neue, Anton, Archivo Black – grube z natury).
    if (f.kategoria === 'monospace' || f.kategoria === 'odreczny' || !(f.wagi.some((x) => x >= 500) || f.wagi.length === 1) || minus.has(f.rodzina)) return;
    let w = 0;
    for (const c of b.cechy ?? []) if (KROJE_CECH[c]?.includes(f.rodzina)) w += 2;
    for (const k of kategorie) if (KROJE_BRANZ[k]?.plus.includes(f.rodzina)) w += 3;
    if (w > 0) wynik.push({ f: f.rodzina, w, i });
  });
  // Tylko kroje z co najmniej połową najlepszej oceny – słaby sygnał (np. jedna cecha) nie wpuszcza krojów spoza charakteru.
  const max = Math.max(0, ...wynik.map((x) => x.w));
  return wynik
    .filter((x) => x.w * 2 >= max)
    .sort((a, b2) => b2.w - a.w || a.i - b2.i)
    .map((x) => x.f);
}

/** Kroje wykluczone dla kategorii briefu (do testów i zamienników). */
export function krojeWykluczone(kategorie: readonly string[]): Set<string> {
  return new Set(kategorie.flatMap((k) => KROJE_BRANZ[k]?.minus ?? []));
}
