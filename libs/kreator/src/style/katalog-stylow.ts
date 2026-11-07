import type { TypSekcji } from '../model.ts';
import type { KierunekProjektu, TypStrony } from '../ai/kontrakt.ts';

/**
 * Katalog kierunków projektowych Verris Kreatora. Serwer (`wybierzKierunki`) wybiera z niego kierunek
 * przed generacją, AI dostaje opis wszystkich stylów w master prompcie, a renderer czyta z motywu
 * identyfikator stylu, fonty i parametry. Pozycje `pro: true` są dostępne w Kreatorze Pro; w wersjach
 * bez Pro serwer ich nie wybiera, a odczyt wyniku zamienia je na `zastepczy`.
 *
 * Fonty: wyłącznie rodziny z KATALOG_FONTOW (Google Fonts, licencja SIL Open Font License 1.1 – sprawdzone
 * 2026-11-07 w repozytorium google/fonts: każda rodzina leży w katalogu `ofl/`; zestaw latin-ext
 * z polskimi znakami (ąćęłńóśźż i wielkie) potwierdzony w tablicy cmap plików serwowanych przez
 * fonts.googleapis.com dla każdej wagi z listy; Fredoka odpadła – nie ma polskich znaków). Renderer kopiuje
 * pliki na hosting klienta (bez hotlinku do Google), więc lista jest zamknięta.
 */

export type CharakterPalety = KierunekProjektu['charakterPalety'];
export type Zaokraglenie = KierunekProjektu['zaokraglenie'];
export type SkalaTypografii = KierunekProjektu['skalaTypografii'];

export interface FontKatalogu {
  rodzina: string;
  kategoria: 'szeryfowy' | 'bezszeryfowy' | 'ozdobny' | 'monospace' | 'odreczny';
  /** Wagi kopiowane na hosting (tylko te renderer może użyć). */
  wagi: number[];
  kursywa: boolean;
  licencja: 'OFL-1.1';
}

const f = (rodzina: string, kategoria: FontKatalogu['kategoria'], wagi: number[], kursywa = false): FontKatalogu => ({
  rodzina,
  kategoria,
  wagi,
  kursywa,
  licencja: 'OFL-1.1',
});

/** Zamknięta lista rodzin dozwolonych w motywie (fonty.naglowki, fonty.tekst, fonty.akcent). */
export const KATALOG_FONTOW: FontKatalogu[] = [
  // Szeryfowe i ozdobne do nagłówków
  f('Fraunces', 'szeryfowy', [400, 600, 700], true),
  f('Playfair Display', 'szeryfowy', [400, 600, 700], true),
  f('Cormorant Garamond', 'szeryfowy', [500, 600, 700], true),
  f('Instrument Serif', 'szeryfowy', [400], true),
  f('DM Serif Display', 'szeryfowy', [400], true),
  f('Libre Baskerville', 'szeryfowy', [400, 700], true),
  f('Lora', 'szeryfowy', [400, 500, 600, 700], true),
  f('Source Serif 4', 'szeryfowy', [400, 600, 700], true),
  f('Newsreader', 'szeryfowy', [400, 500, 600], true),
  f('Young Serif', 'szeryfowy', [400]),
  f('Bodoni Moda', 'szeryfowy', [400, 600, 700], true),
  f('EB Garamond', 'szeryfowy', [400, 500, 600], true),
  f('Gloock', 'szeryfowy', [400]),
  f('Zilla Slab', 'szeryfowy', [400, 500, 700]),
  f('Literata', 'szeryfowy', [400, 600], true),
  f('Abril Fatface', 'ozdobny', [400]),
  f('Alfa Slab One', 'ozdobny', [400]),
  f('Shrikhand', 'ozdobny', [400]),
  // Bezszeryfowe
  f('Inter', 'bezszeryfowy', [400, 500, 600, 700]),
  f('Manrope', 'bezszeryfowy', [400, 500, 700, 800]),
  f('DM Sans', 'bezszeryfowy', [400, 500, 700], true),
  f('IBM Plex Sans', 'bezszeryfowy', [400, 500, 600], true),
  f('Space Grotesk', 'bezszeryfowy', [400, 500, 700]),
  f('Work Sans', 'bezszeryfowy', [400, 500, 600]),
  f('Archivo', 'bezszeryfowy', [400, 500, 700, 800]),
  f('Archivo Black', 'bezszeryfowy', [400]),
  f('Bricolage Grotesque', 'bezszeryfowy', [400, 600, 800]),
  f('Nunito', 'bezszeryfowy', [400, 600, 700, 800]),
  f('Quicksand', 'bezszeryfowy', [400, 500, 700]),
  f('Figtree', 'bezszeryfowy', [400, 500, 600, 700]),
  f('Plus Jakarta Sans', 'bezszeryfowy', [400, 500, 700, 800]),
  f('Sora', 'bezszeryfowy', [400, 600, 700]),
  f('Outfit', 'bezszeryfowy', [400, 500, 700]),
  f('Lexend', 'bezszeryfowy', [400, 500, 600]),
  f('Anton', 'bezszeryfowy', [400]),
  f('Bebas Neue', 'bezszeryfowy', [400]),
  f('Oswald', 'bezszeryfowy', [400, 500, 600, 700]),
  f('Barlow', 'bezszeryfowy', [400, 500, 600], true),
  f('Barlow Condensed', 'bezszeryfowy', [500, 600, 700]),
  f('Syne', 'bezszeryfowy', [500, 700, 800]),
  f('Unbounded', 'bezszeryfowy', [500, 700]),
  f('Schibsted Grotesk', 'bezszeryfowy', [400, 600, 800]),
  f('Hanken Grotesk', 'bezszeryfowy', [400, 500, 700]),
  f('Public Sans', 'bezszeryfowy', [400, 500, 700]),
  f('Libre Franklin', 'bezszeryfowy', [400, 500, 700]),
  f('Karla', 'bezszeryfowy', [400, 500, 700]),
  f('Rubik', 'bezszeryfowy', [400, 500, 700]),
  f('Baloo 2', 'ozdobny', [500, 600, 700]),
  f('Comfortaa', 'ozdobny', [400, 500, 700]),
  f('Familjen Grotesk', 'bezszeryfowy', [400, 600, 700]),
  // Monospace i odręczne (akcenty)
  f('IBM Plex Mono', 'monospace', [400, 500]),
  f('JetBrains Mono', 'monospace', [400, 500, 700]),
  f('Space Mono', 'monospace', [400, 700]),
  f('Caveat', 'odreczny', [500, 700]),
];

const RODZINY_FONTOW = new Set(KATALOG_FONTOW.map((x) => x.rodzina));
export function czyFontWKatalogu(rodzina: string): boolean {
  return RODZINY_FONTOW.has(rodzina);
}

export interface ParaFontow {
  naglowki: string;
  tekst: string;
  /** Opcjonalny font akcentu (nadtytuły, liczby, cytaty). */
  akcent?: string;
}

/** Zakres barwy OKLCH w stopniach; `od > do` oznacza zawinięcie przez 0 (np. 340–20 = czerwienie). */
export type ZakresBarwy = readonly [od: number, koniec: number];

export interface StylProjektu {
  id: string;
  nazwa: string;
  /** Opis dla AI (master prompt) i dla klienta (wybór stylu). */
  opis: string;
  /** Rdzenie słów branż (małe litery, bez końcówek), dopasowanie po zawieraniu w opisie i branży. */
  branze: string[];
  /** Tony komunikacji, do których pasuje (wartości `BriefStrony.ton`). */
  tony: string[];
  typyStron: TypStrony[];
  /** Rodzina wizualna – trzy propozycje Pro biorą style z różnych rodzin. */
  rodzina: 'ciepla' | 'stonowana' | 'klasyczna' | 'techniczna' | 'ekspresyjna';
  pary: ParaFontow[];
  charaktery: CharakterPalety[];
  barwy: ZakresBarwy[];
  zaokraglenie: Zaokraglenie;
  skalaTypografii: SkalaTypografii;
  gestosc: 'zwarta' | 'normalna' | 'przestronna';
  animacje: 'brak' | 'subtelne' | 'wyraziste';
  /** Rekomendowane warianty z KATALOG_WARIANTOW (pierwszy = najbardziej typowy). */
  warianty: Partial<Record<TypSekcji, string[]>>;
  /** Rekomendowane efekty z KATALOG_EFEKTOW. */
  efekty: string[];
  pro: boolean;
  /** Styl darmowy używany zamiast tego bez Kreatora Pro. */
  zastepczy?: string;
}

export const KATALOG_STYLOW: StylProjektu[] = [
  {
    id: 'cieply-nowoczesny',
    nazwa: 'Ciepły nowoczesny',
    opis: 'Kremowe tła, głęboki akcent (butelkowa zieleń, terakota, śliwka), szeryf z charakterem w nagłówkach i czytelny bezszeryf w tekście. Miękkie zaokrąglenia, spokojny rytm, zdjęcia ludzi i wnętrz. Dla usług, w których liczy się zaufanie i atmosfera.',
    branze: ['fryzjer', 'salon', 'kosmety', 'beauty', 'spa', 'masaż', 'masaz', 'fizjoterap', 'kawiar', 'piekar', 'florys', 'kwiaci', 'ceramik', 'pracowni', 'butik', 'psycholog', 'terapeut', 'dietety', 'coach', 'doula'],
    tony: ['ciepły', 'przyjazny', 'osobisty', 'spokojny'],
    typyStron: ['wizytowka', 'landing', 'portfolio'],
    rodzina: 'ciepla',
    pary: [
      { naglowki: 'Fraunces', tekst: 'Inter' },
      { naglowki: 'Young Serif', tekst: 'DM Sans' },
      { naglowki: 'Lora', tekst: 'Figtree' },
    ],
    charaktery: ['jasna', 'ziemista'],
    barwy: [[140, 175], [20, 45], [330, 355]],
    zaokraglenie: 'miekkie',
    skalaTypografii: 'wyrazista',
    gestosc: 'normalna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-podzielony', 'hero-edytorski'],
      oferta: ['oferta-lista-cen', 'oferta-siatka'],
      galeria: ['galeria-mozaika', 'galeria-siatka'],
      onas: ['onas-obraz-tekst', 'onas-wyrozniki'],
      zespol: ['zespol-lukowe', 'zespol-karty'],
      opinie: ['opinie-cytat'],
      kontakt: ['kontakt-podzielony'],
      cta: ['cta-karta', 'cta-pasek'],
      kroki: ['kroki-kolumny'],
      faq: ['faq-akordeon'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'pasek-cta-mobile', 'mikrointerakcje'],
    pro: false,
  },
  {
    id: 'minimal-skandynawski',
    nazwa: 'Minimal skandynawski',
    opis: 'Dużo bieli i światła, jedna chłodna lub złamana barwa akcentu, cienkie linie podziału, geometryczny bezszeryf. Lekkie zaokrąglenia, przestronne odstępy, treść ograniczona do konkretu. Pasuje wszędzie tam, gdzie prostota buduje profesjonalizm.',
    branze: ['architekt', 'wnętrz', 'wnetrz', 'projekt', 'meble', 'stolar', 'fotograf', 'studio', 'design', 'konsult', 'księgow', 'ksiegow', 'biuro', 'agencj', 'nieruchomo', 'sprzątan', 'sprzatan'],
    tony: ['spokojny', 'ekspercki', 'rzeczowy', 'minimalistyczny'],
    typyStron: ['wizytowka', 'portfolio', 'landing', 'inna'],
    rodzina: 'stonowana',
    pary: [
      { naglowki: 'Manrope', tekst: 'Inter' },
      { naglowki: 'Hanken Grotesk', tekst: 'Hanken Grotesk' },
      { naglowki: 'Instrument Serif', tekst: 'Figtree' },
    ],
    charaktery: ['jasna', 'pastelowa'],
    barwy: [[200, 250], [90, 130], [15, 40]],
    zaokraglenie: 'lekkie',
    skalaTypografii: 'spokojna',
    gestosc: 'przestronna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-centralny', 'hero-edytorski'],
      oferta: ['oferta-kolumny', 'oferta-siatka'],
      galeria: ['galeria-siatka'],
      onas: ['onas-manifest', 'onas-obraz-tekst'],
      zespol: ['zespol-lista'],
      opinie: ['opinie-cytat'],
      kontakt: ['kontakt-minimalny'],
      cta: ['cta-pasek'],
      kroki: ['kroki-kolumny'],
      faq: ['faq-dwie-kolumny'],
      cennik: ['cennik-lista'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'mikrointerakcje'],
    pro: false,
  },
  {
    id: 'klasyczny-zaufanie',
    nazwa: 'Klasyczny – zaufanie',
    opis: 'Granat, butelkowa zieleń albo bordo na jasnym tle, klasyczny szeryf w nagłówkach, porządna siatka i wyraźna hierarchia. Bez fajerwerków: powaga, stabilność, czytelność. Dla zawodów zaufania publicznego i usług finansowych.',
    branze: ['adwokat', 'kancelari', 'radc', 'prawn', 'notariu', 'księgow', 'ksiegow', 'biuro rachunk', 'doradc', 'podatk', 'ubezpiecz', 'finans', 'kredyt', 'audyt', 'rzeczoznaw', 'tłumacz', 'tlumacz', 'nieruchomo', 'zarządc', 'zarzadc'],
    tony: ['ekspercki', 'formalny', 'rzeczowy', 'poważny', 'powazny'],
    typyStron: ['wizytowka', 'landing', 'inna'],
    rodzina: 'klasyczna',
    pary: [
      { naglowki: 'Libre Baskerville', tekst: 'Source Serif 4' },
      { naglowki: 'Source Serif 4', tekst: 'IBM Plex Sans' },
      { naglowki: 'EB Garamond', tekst: 'Public Sans' },
    ],
    charaktery: ['jasna', 'kontrastowa'],
    barwy: [[240, 265], [150, 175], [10, 25]],
    zaokraglenie: 'ostre',
    skalaTypografii: 'spokojna',
    gestosc: 'normalna',
    animacje: 'brak',
    warianty: {
      hero: ['hero-podzielony', 'hero-centralny'],
      oferta: ['oferta-kolumny', 'oferta-siatka'],
      onas: ['onas-obraz-tekst', 'onas-wyrozniki'],
      zespol: ['zespol-lista', 'zespol-karty'],
      opinie: ['opinie-cytat'],
      kontakt: ['kontakt-podzielony'],
      cta: ['cta-pasek'],
      kroki: ['kroki-os-czasu'],
      faq: ['faq-dwie-kolumny', 'faq-akordeon'],
      cennik: ['cennik-lista'],
    },
    efekty: ['przyklejony-naglowek', 'mikrointerakcje'],
    pro: false,
  },
  {
    id: 'techniczny-precyzyjny',
    nazwa: 'Techniczny – precyzyjny',
    opis: 'Grotesk o technicznym rysunku, monospace w liczbach i etykietach, siatka widoczna w liniach, chłodne tło i jeden sygnałowy akcent (pomarańcz, żółć, cyjan). Ostre narożniki, zwarta gęstość. Dla firm, które sprzedają konkret i wykonanie.',
    branze: ['budow', 'remont', 'instalac', 'elektry', 'hydraulik', 'mechanik', 'warsztat', 'serwis', 'informaty', 'program', 'software', 'it ', 'automaty', 'spawal', 'cnc', 'produkc', 'transport', 'logisty', 'fotowolt', 'pomp ciepła', 'klimatyz', 'dach', 'okna'],
    tony: ['rzeczowy', 'ekspercki', 'techniczny', 'konkretny'],
    typyStron: ['wizytowka', 'landing', 'inna'],
    rodzina: 'techniczna',
    pary: [
      { naglowki: 'Space Grotesk', tekst: 'IBM Plex Sans', akcent: 'IBM Plex Mono' },
      { naglowki: 'Archivo', tekst: 'Inter', akcent: 'JetBrains Mono' },
      { naglowki: 'Schibsted Grotesk', tekst: 'Public Sans', akcent: 'IBM Plex Mono' },
    ],
    charaktery: ['jasna', 'kontrastowa', 'ciemna'],
    barwy: [[25, 60], [75, 95], [195, 215]],
    zaokraglenie: 'ostre',
    skalaTypografii: 'wyrazista',
    gestosc: 'zwarta',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-podzielony', 'hero-z-formularzem'],
      oferta: ['oferta-siatka', 'oferta-kolumny'],
      galeria: ['galeria-siatka'],
      onas: ['onas-wyrozniki'],
      zespol: ['zespol-karty'],
      opinie: ['opinie-siatka'],
      kontakt: ['kontakt-podzielony', 'kontakt-karta'],
      cta: ['cta-pelny', 'cta-pasek'],
      kroki: ['kroki-kolumny', 'kroki-ciemne'],
      faq: ['faq-akordeon'],
      cennik: ['cennik-kolumny'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'pasek-cta-mobile', 'mikrointerakcje'],
    pro: false,
  },
  {
    id: 'pastelowy-przyjazny',
    nazwa: 'Pastelowy – przyjazny',
    opis: 'Jasne pastelowe tła sekcji, zaokrąglony bezszeryf, duże przyciski i pełne zaokrąglenia. Ciepły, prosty język. Dla miejsc, w których klient ma poczuć się swobodnie: dzieci, edukacja, zwierzęta, zdrowie bez stresu.',
    branze: ['przedszkol', 'żłob', 'zlob', 'szkoła', 'szkola', 'korepetyc', 'nauka', 'kurs', 'język', 'jezyk', 'weteryn', 'zwierz', 'psy', 'groomer', 'logoped', 'dziec', 'zabaw', 'urodzin', 'animacj', 'cukiern', 'lody'],
    tony: ['przyjazny', 'ciepły', 'radosny', 'młodzieżowy', 'mlodziezowy', 'swobodny'],
    typyStron: ['wizytowka', 'landing', 'inna'],
    rodzina: 'ciepla',
    pary: [
      { naglowki: 'Nunito', tekst: 'Nunito' },
      { naglowki: 'Baloo 2', tekst: 'Figtree' },
      { naglowki: 'Comfortaa', tekst: 'Karla' },
    ],
    charaktery: ['pastelowa', 'jasna'],
    barwy: [[260, 300], [180, 200], [345, 360], [0, 15], [95, 130]],
    zaokraglenie: 'pelne',
    skalaTypografii: 'wyrazista',
    gestosc: 'normalna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-podzielony', 'hero-centralny'],
      oferta: ['oferta-siatka'],
      galeria: ['galeria-mozaika', 'galeria-siatka'],
      onas: ['onas-wyrozniki', 'onas-obraz-tekst'],
      zespol: ['zespol-lukowe', 'zespol-karty'],
      opinie: ['opinie-siatka'],
      kontakt: ['kontakt-karta', 'kontakt-podzielony'],
      cta: ['cta-karta'],
      kroki: ['kroki-kolumny'],
      faq: ['faq-akordeon'],
      cennik: ['cennik-kolumny'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'pasek-cta-mobile', 'mikrointerakcje'],
    pro: false,
  },
  {
    id: 'gastronomiczny',
    nazwa: 'Gastronomiczny',
    opis: 'Karta menu jako oś strony: lista z cenami w stylu menu, apetyczne zdjęcia, ciepłe ciemne lub kremowe tła, wyrazisty szeryf albo kondensowany grotesk w nagłówkach. Godziny otwarcia i rezerwacja zawsze pod ręką.',
    branze: ['restaurac', 'bistro', 'pizz', 'kawiar', 'kawa', 'bar ', 'pub', 'piwiar', 'winiar', 'catering', 'food', 'burger', 'sushi', 'ramen', 'kuchni', 'piekar', 'cukiern', 'lodzi', 'pierog', 'garmaż', 'garmaz'],
    tony: ['ciepły', 'swobodny', 'apetyczny', 'przyjazny', 'radosny'],
    typyStron: ['wizytowka', 'landing'],
    rodzina: 'ekspresyjna',
    pary: [
      { naglowki: 'DM Serif Display', tekst: 'DM Sans' },
      { naglowki: 'Oswald', tekst: 'Karla' },
      { naglowki: 'Playfair Display', tekst: 'Work Sans' },
    ],
    charaktery: ['ziemista', 'ciemna', 'jasna'],
    barwy: [[15, 45], [50, 75], [130, 150], [350, 360], [0, 10]],
    zaokraglenie: 'lekkie',
    skalaTypografii: 'monumentalna',
    gestosc: 'normalna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-pelnoekranowy', 'hero-podzielony'],
      oferta: ['oferta-lista-cen', 'oferta-kolumny'],
      galeria: ['galeria-mozaika'],
      onas: ['onas-obraz-tekst', 'onas-manifest'],
      zespol: ['zespol-karty'],
      opinie: ['opinie-cytat'],
      kontakt: ['kontakt-podzielony'],
      cta: ['cta-pelny'],
      kroki: ['kroki-kolumny'],
      faq: ['faq-akordeon'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'pasek-cta-mobile', 'mikrointerakcje'],
    pro: false,
  },
  {
    id: 'edytorski',
    nazwa: 'Edytorski',
    opis: 'Układ jak w dobrym magazynie: bardzo duży szeryf w nagłówkach, kursywa w wyróżnieniach, szerokie marginesy, liczby i nadtytuły jak w spisie treści. Mało koloru, dużo typografii. Dla marek, które mają coś do opowiedzenia.',
    branze: ['fotograf', 'pisarz', 'autor', 'wydawn', 'dziennik', 'redakc', 'galeri', 'muze', 'kultur', 'teatr', 'architekt', 'projekt', 'moda', 'stylist', 'ślub', 'slub', 'konsult', 'coach', 'blog'],
    tony: ['elegancki', 'ekspercki', 'spokojny', 'refleksyjny', 'luksusowy'],
    typyStron: ['portfolio', 'blog', 'wizytowka'],
    rodzina: 'klasyczna',
    pary: [
      { naglowki: 'Instrument Serif', tekst: 'Inter' },
      { naglowki: 'Newsreader', tekst: 'Newsreader' },
      { naglowki: 'Fraunces', tekst: 'Source Serif 4' },
    ],
    charaktery: ['jasna', 'kontrastowa'],
    barwy: [[20, 40], [210, 240], [100, 140]],
    zaokraglenie: 'ostre',
    skalaTypografii: 'monumentalna',
    gestosc: 'przestronna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-edytorski', 'hero-mozaika'],
      oferta: ['oferta-kolumny', 'oferta-naprzemienna'],
      galeria: ['galeria-mozaika', 'galeria-karuzela'],
      onas: ['onas-manifest'],
      zespol: ['zespol-lista'],
      opinie: ['opinie-cytat'],
      kontakt: ['kontakt-minimalny'],
      cta: ['cta-pasek'],
      kroki: ['kroki-os-czasu'],
      faq: ['faq-dwie-kolumny'],
      blog: ['blog-edytorski'],
      cennik: ['cennik-lista'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'wejscie-naglowka', 'lightbox', 'postep-czytania', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'minimal-skandynawski',
  },
  {
    id: 'organiczny',
    nazwa: 'Organiczny',
    opis: 'Zielenie, oliwki i piaskowe tła, miękkie kształty i łuki w zdjęciach, naturalny szeryf z miękkim bezszeryfem. Spokojne animacje. Dla marek blisko natury: ekologia, zioła, ogrody, joga, rolnictwo.',
    branze: ['ogrod', 'ziel', 'roślin', 'roslin', 'eko', 'bio', 'zioł', 'ziol', 'joga', 'medytac', 'agroturyst', 'gospodarst', 'rolni', 'pszcz', 'miód', 'miod', 'natura', 'las', 'naturopat', 'kosmetyki natur', 'mydł', 'mydl'],
    tony: ['spokojny', 'ciepły', 'naturalny', 'łagodny', 'lagodny'],
    typyStron: ['wizytowka', 'landing', 'sklep', 'blog'],
    rodzina: 'ciepla',
    pary: [
      { naglowki: 'Lora', tekst: 'Nunito' },
      { naglowki: 'Fraunces', tekst: 'Karla' },
      { naglowki: 'Young Serif', tekst: 'Outfit' },
    ],
    charaktery: ['ziemista', 'jasna', 'pastelowa'],
    barwy: [[100, 150], [70, 95], [30, 50]],
    zaokraglenie: 'pelne',
    skalaTypografii: 'wyrazista',
    gestosc: 'przestronna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-mozaika', 'hero-podzielony'],
      oferta: ['oferta-naprzemienna', 'oferta-siatka'],
      galeria: ['galeria-mozaika', 'galeria-karuzela'],
      onas: ['onas-obraz-tekst', 'onas-manifest'],
      zespol: ['zespol-lukowe'],
      opinie: ['opinie-karuzela', 'opinie-cytat'],
      kontakt: ['kontakt-karta'],
      cta: ['cta-karta'],
      kroki: ['kroki-os-czasu'],
      faq: ['faq-akordeon'],
      produkty: ['produkty-siatka'],
      blog: ['blog-karty'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'paralaksa', 'lightbox', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'cieply-nowoczesny',
  },
  {
    id: 'luksusowy-ciemny',
    nazwa: 'Luksusowy ciemny',
    opis: 'Głęboka czerń lub grafit, złoty, szampański albo winny akcent, cienki elegancki szeryf w dużych rozmiarach, dużo powietrza i powolne, płynne animacje. Mało słów, dobre zdjęcia. Dla usług premium i marek, które sprzedają doświadczenie.',
    branze: ['jubiler', 'zegark', 'premium', 'luksus', 'apartament', 'hotel', 'butik', 'barber', 'tatuaż', 'tatuaz', 'medycyn estety', 'klinik estety', 'perfum', 'wino', 'whisky', 'samochod', 'detailing', 'jacht', 'ślub', 'slub', 'event'],
    tony: ['luksusowy', 'elegancki', 'ekskluzywny', 'tajemniczy'],
    typyStron: ['wizytowka', 'landing', 'portfolio', 'sklep'],
    rodzina: 'ekspresyjna',
    pary: [
      { naglowki: 'Cormorant Garamond', tekst: 'Manrope' },
      { naglowki: 'Bodoni Moda', tekst: 'Inter' },
      { naglowki: 'Playfair Display', tekst: 'Hanken Grotesk' },
    ],
    charaktery: ['ciemna'],
    barwy: [[70, 90], [40, 60], [350, 360], [0, 15]],
    zaokraglenie: 'ostre',
    skalaTypografii: 'monumentalna',
    gestosc: 'przestronna',
    animacje: 'wyraziste',
    warianty: {
      hero: ['hero-pelnoekranowy', 'hero-edytorski'],
      oferta: ['oferta-naprzemienna', 'oferta-kolumny'],
      galeria: ['galeria-karuzela', 'galeria-mozaika'],
      onas: ['onas-manifest'],
      zespol: ['zespol-lukowe'],
      opinie: ['opinie-cytat'],
      kontakt: ['kontakt-minimalny'],
      cta: ['cta-pelny'],
      kroki: ['kroki-ciemne'],
      faq: ['faq-dwie-kolumny'],
      cennik: ['cennik-lista'],
      produkty: ['produkty-lista'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'paralaksa', 'wejscie-naglowka', 'lightbox', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'klasyczny-zaufanie',
  },
  {
    id: 'rzemieslniczy',
    nazwa: 'Rzemieślniczy',
    opis: 'Faktura papieru i ziemiste kolory, slabowy szeryf albo mocny szeryf z odręcznym akcentem, zdjęcia procesu pracy i rąk. Prosty, szczery język. Dla manufaktur, warsztatów i małych producentów, którzy pokazują, jak powstaje produkt.',
    branze: ['stolar', 'kowal', 'ceramik', 'manufaktur', 'rękodzieł', 'rekodziel', 'krawc', 'szewc', 'browar', 'piekar', 'palarnia', 'serowar', 'wędlin', 'wedlin', 'rzeźni', 'rzezni', 'garncar', 'skór', 'skor', 'lutnik', 'rower'],
    tony: ['szczery', 'ciepły', 'swobodny', 'rzemieślniczy', 'rzemieslniczy'],
    typyStron: ['wizytowka', 'sklep', 'portfolio', 'landing'],
    rodzina: 'ciepla',
    pary: [
      { naglowki: 'Zilla Slab', tekst: 'Karla', akcent: 'Caveat' },
      { naglowki: 'Alfa Slab One', tekst: 'Work Sans' },
      { naglowki: 'Fraunces', tekst: 'Libre Franklin', akcent: 'Caveat' },
    ],
    charaktery: ['ziemista', 'jasna'],
    barwy: [[20, 45], [50, 70], [140, 160], [200, 220]],
    zaokraglenie: 'lekkie',
    skalaTypografii: 'wyrazista',
    gestosc: 'normalna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-mozaika', 'hero-podzielony'],
      oferta: ['oferta-naprzemienna', 'oferta-kolumny'],
      galeria: ['galeria-mozaika', 'galeria-karuzela'],
      onas: ['onas-obraz-tekst', 'onas-manifest'],
      zespol: ['zespol-karty'],
      opinie: ['opinie-cytat'],
      kontakt: ['kontakt-podzielony'],
      cta: ['cta-karta'],
      kroki: ['kroki-os-czasu'],
      faq: ['faq-akordeon'],
      produkty: ['produkty-lista', 'produkty-siatka'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'lightbox', 'tasma', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'cieply-nowoczesny',
  },
  {
    id: 'kontrastowy-odwazny',
    nazwa: 'Kontrastowy odważny',
    opis: 'Czarno-białe tło z jednym nasyconym kolorem (neonowa zieleń, czerwień, kobalt), ogromne bezszeryfowe nagłówki, taśmy z hasłami, ostre bloki koloru. Dużo energii i pewności siebie. Dla marek, które mają się wyróżnić od pierwszego ekranu.',
    branze: ['agencj', 'marketing', 'reklam', 'studio', 'kreatyw', 'muzyk', 'zespół muz', 'dj', 'klub', 'event', 'festiwal', 'startup', 'aplikac', 'gaming', 'esport', 'streetwear', 'tatuaż', 'tatuaz', 'barber'],
    tony: ['odważny', 'odwazny', 'młodzieżowy', 'mlodziezowy', 'bezpośredni', 'bezposredni', 'energiczny'],
    typyStron: ['landing', 'portfolio', 'wizytowka'],
    rodzina: 'ekspresyjna',
    pary: [
      { naglowki: 'Archivo Black', tekst: 'Archivo' },
      { naglowki: 'Bricolage Grotesque', tekst: 'Inter' },
      { naglowki: 'Anton', tekst: 'Space Grotesk' },
    ],
    charaktery: ['kontrastowa', 'ciemna'],
    barwy: [[125, 145], [20, 35], [255, 275], [320, 340]],
    zaokraglenie: 'ostre',
    skalaTypografii: 'monumentalna',
    gestosc: 'zwarta',
    animacje: 'wyraziste',
    warianty: {
      hero: ['hero-edytorski', 'hero-pelnoekranowy'],
      oferta: ['oferta-siatka', 'oferta-naprzemienna'],
      galeria: ['galeria-mozaika', 'galeria-karuzela'],
      onas: ['onas-manifest'],
      zespol: ['zespol-karty'],
      opinie: ['opinie-karuzela'],
      kontakt: ['kontakt-karta'],
      cta: ['cta-pelny'],
      kroki: ['kroki-ciemne'],
      faq: ['faq-akordeon'],
      cennik: ['cennik-kolumny', 'cennik-tabela'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'tasma', 'wejscie-naglowka', 'karuzela', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'techniczny-precyzyjny',
  },
  {
    id: 'retro-plakat',
    nazwa: 'Retro plakat',
    opis: 'Inspiracja polską szkołą plakatu i szyldami z lat 60.: ozdobny krój w nagłówkach, ciepłe przybrudzone kolory (musztarda, ceglasty, butelkowy), grube linie i odznaki. Z przymrużeniem oka, ale czytelnie.',
    branze: ['bar ', 'pub', 'piwiar', 'browar', 'barber', 'kino', 'antykwar', 'vintage', 'second hand', 'płyt', 'plyt', 'winyl', 'księgarn', 'ksiegarn', 'kawiar', 'lodzi', 'food truck', 'zakład', 'zaklad', 'retro'],
    tony: ['zabawny', 'swobodny', 'nostalgiczny', 'odważny', 'odwazny'],
    typyStron: ['wizytowka', 'landing', 'sklep'],
    rodzina: 'ekspresyjna',
    pary: [
      { naglowki: 'Abril Fatface', tekst: 'Karla' },
      { naglowki: 'Shrikhand', tekst: 'Work Sans' },
      { naglowki: 'Bebas Neue', tekst: 'Rubik' },
    ],
    charaktery: ['ziemista', 'kontrastowa'],
    barwy: [[40, 60], [20, 35], [150, 175], [195, 215]],
    zaokraglenie: 'pelne',
    skalaTypografii: 'monumentalna',
    gestosc: 'normalna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-centralny', 'hero-mozaika'],
      oferta: ['oferta-lista-cen', 'oferta-siatka'],
      galeria: ['galeria-mozaika'],
      onas: ['onas-manifest'],
      zespol: ['zespol-lukowe'],
      opinie: ['opinie-cytat'],
      kontakt: ['kontakt-karta'],
      cta: ['cta-karta', 'cta-pelny'],
      kroki: ['kroki-kolumny'],
      faq: ['faq-akordeon'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'tasma', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'gastronomiczny',
  },
  {
    id: 'sportowy-dynamiczny',
    nazwa: 'Sportowy dynamiczny',
    opis: 'Kondensowany, pochylony charakter nagłówków, ukośne cięcia i mocne zdjęcia w ruchu, ciemne tła z jaskrawym akcentem. Krótkie, motywujące zdania i wyraźne wezwania do działania. Dla sportu, fitnessu i aktywnego wypoczynku.',
    branze: ['siłown', 'silown', 'fitness', 'trener', 'crossfit', 'sztuk walki', 'boks', 'mma', 'karate', 'basen', 'pływ', 'plyw', 'bieg', 'rower', 'klub sport', 'piłk', 'pilk', 'tenis', 'squash', 'wspinacz', 'surf', 'narty', 'snowboard', 'dietety'],
    tony: ['energiczny', 'motywujący', 'motywujacy', 'bezpośredni', 'bezposredni', 'młodzieżowy', 'mlodziezowy'],
    typyStron: ['landing', 'wizytowka'],
    rodzina: 'ekspresyjna',
    pary: [
      { naglowki: 'Barlow Condensed', tekst: 'Barlow' },
      { naglowki: 'Oswald', tekst: 'Inter' },
      { naglowki: 'Unbounded', tekst: 'Rubik' },
    ],
    charaktery: ['ciemna', 'kontrastowa'],
    barwy: [[25, 45], [75, 100], [130, 150], [190, 210]],
    zaokraglenie: 'ostre',
    skalaTypografii: 'monumentalna',
    gestosc: 'zwarta',
    animacje: 'wyraziste',
    warianty: {
      hero: ['hero-pelnoekranowy', 'hero-z-formularzem'],
      oferta: ['oferta-siatka', 'oferta-naprzemienna'],
      galeria: ['galeria-karuzela', 'galeria-mozaika'],
      onas: ['onas-wyrozniki'],
      zespol: ['zespol-karty'],
      opinie: ['opinie-karuzela', 'opinie-siatka'],
      kontakt: ['kontakt-karta'],
      cta: ['cta-pelny'],
      kroki: ['kroki-ciemne'],
      faq: ['faq-akordeon'],
      cennik: ['cennik-kolumny', 'cennik-tabela'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'tasma', 'karuzela', 'przelacznik-cen', 'pasek-cta-mobile', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'techniczny-precyzyjny',
  },
  {
    id: 'medyczny-spokojny',
    nazwa: 'Medyczny spokojny',
    opis: 'Czyste jasne tła, chłodne łagodne barwy (morska zieleń, błękit, szałwia), bardzo czytelny bezszeryf o dużej wysokości x, miękkie zaokrąglenia. Spokój i przejrzystość: godziny, zakres usług i rejestracja na pierwszym planie. Bez obietnic efektów leczenia.',
    branze: ['stomatolog', 'dentyst', 'lekarz', 'przychodni', 'klinik', 'gabinet', 'fizjoterap', 'rehabilit', 'ortoped', 'pediatr', 'ginekolog', 'okulist', 'optyk', 'laborator', 'psychiatr', 'psycholog', 'psychoterap', 'dietety', 'położn', 'polozn', 'weteryn', 'apteka'],
    tony: ['spokojny', 'ekspercki', 'łagodny', 'lagodny', 'rzeczowy', 'opiekuńczy', 'opiekunczy'],
    typyStron: ['wizytowka', 'landing'],
    rodzina: 'stonowana',
    pary: [
      { naglowki: 'Lexend', tekst: 'Inter' },
      { naglowki: 'Plus Jakarta Sans', tekst: 'Plus Jakarta Sans' },
      { naglowki: 'Newsreader', tekst: 'Figtree' },
    ],
    charaktery: ['jasna', 'pastelowa'],
    barwy: [[165, 200], [215, 240], [130, 150]],
    zaokraglenie: 'miekkie',
    skalaTypografii: 'spokojna',
    gestosc: 'przestronna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-podzielony', 'hero-z-formularzem'],
      oferta: ['oferta-siatka', 'oferta-lista-cen'],
      galeria: ['galeria-siatka'],
      onas: ['onas-wyrozniki', 'onas-obraz-tekst'],
      zespol: ['zespol-karty', 'zespol-lista'],
      opinie: ['opinie-siatka'],
      kontakt: ['kontakt-podzielony'],
      cta: ['cta-karta'],
      kroki: ['kroki-os-czasu', 'kroki-kolumny'],
      faq: ['faq-dwie-kolumny', 'faq-akordeon'],
      cennik: ['cennik-lista', 'cennik-tabela'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'pasek-cta-mobile', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'klasyczny-zaufanie',
  },
  {
    id: 'architektoniczny',
    nazwa: 'Architektoniczny',
    opis: 'Ścisła siatka modułowa, cienkie linie i duże zdjęcia realizacji w równych proporcjach, beton, piasek i grafit z jednym akcentem. Typografia geometryczna, numeracja projektów, opisy w punktach. Dla pracowni, deweloperów i wykonawców pokazujących realizacje.',
    branze: ['architekt', 'deweloper', 'budow', 'wykończ', 'wykoncz', 'wnętrz', 'wnetrz', 'projektant', 'urbanist', 'konstruk', 'geodet', 'ogrod', 'krajobraz', 'nieruchomo', 'stolar', 'meble', 'okna', 'schody'],
    tony: ['ekspercki', 'rzeczowy', 'minimalistyczny', 'elegancki', 'spokojny'],
    typyStron: ['portfolio', 'wizytowka', 'landing'],
    rodzina: 'techniczna',
    pary: [
      { naglowki: 'Syne', tekst: 'Inter' },
      { naglowki: 'Familjen Grotesk', tekst: 'IBM Plex Sans', akcent: 'IBM Plex Mono' },
      { naglowki: 'Sora', tekst: 'Work Sans' },
    ],
    charaktery: ['jasna', 'kontrastowa', 'ciemna'],
    barwy: [[40, 70], [200, 230], [15, 30]],
    zaokraglenie: 'ostre',
    skalaTypografii: 'wyrazista',
    gestosc: 'przestronna',
    animacje: 'subtelne',
    warianty: {
      hero: ['hero-mozaika', 'hero-edytorski'],
      oferta: ['oferta-kolumny', 'oferta-naprzemienna'],
      galeria: ['galeria-mozaika', 'galeria-karuzela'],
      onas: ['onas-manifest', 'onas-wyrozniki'],
      zespol: ['zespol-lista'],
      opinie: ['opinie-cytat'],
      kontakt: ['kontakt-minimalny'],
      cta: ['cta-pasek'],
      kroki: ['kroki-os-czasu'],
      faq: ['faq-dwie-kolumny'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'lightbox', 'paralaksa', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'minimal-skandynawski',
  },
  {
    id: 'kreatywny-kolaz',
    nazwa: 'Kreatywny kolaż',
    opis: 'Asymetryczne kolaże zdjęć, nakładające się bloki koloru, mieszanie szeryfu z groteskiem, dwie wyraziste barwy. Swoboda i osobowość przy zachowanej czytelności. Dla twórców, studiów kreatywnych, szkół artystycznych i marek lifestyle.',
    branze: ['artyst', 'ilustrat', 'grafik', 'malar', 'rzeźb', 'rzezb', 'studio', 'kreatyw', 'szkoła tańc', 'szkola tanc', 'taniec', 'muzyk', 'teatr', 'fotograf', 'influenc', 'lifestyle', 'moda', 'concept store', 'galeri', 'warsztaty'],
    tony: ['kreatywny', 'swobodny', 'odważny', 'odwazny', 'zabawny', 'radosny'],
    typyStron: ['portfolio', 'landing', 'blog', 'sklep'],
    rodzina: 'ekspresyjna',
    pary: [
      { naglowki: 'Gloock', tekst: 'Space Grotesk' },
      { naglowki: 'Bricolage Grotesque', tekst: 'DM Sans', akcent: 'Instrument Serif' },
      { naglowki: 'Syne', tekst: 'Karla' },
    ],
    charaktery: ['pastelowa', 'kontrastowa', 'jasna'],
    barwy: [[280, 320], [330, 355], [40, 60], [160, 185]],
    zaokraglenie: 'miekkie',
    skalaTypografii: 'monumentalna',
    gestosc: 'normalna',
    animacje: 'wyraziste',
    warianty: {
      hero: ['hero-mozaika', 'hero-edytorski'],
      oferta: ['oferta-naprzemienna', 'oferta-siatka'],
      galeria: ['galeria-mozaika', 'galeria-karuzela'],
      onas: ['onas-manifest', 'onas-obraz-tekst'],
      zespol: ['zespol-lukowe'],
      opinie: ['opinie-karuzela'],
      kontakt: ['kontakt-karta'],
      cta: ['cta-karta'],
      kroki: ['kroki-kolumny'],
      faq: ['faq-akordeon'],
      blog: ['blog-karty'],
      produkty: ['produkty-siatka'],
    },
    efekty: ['przyklejony-naglowek', 'pojawianie', 'lightbox', 'karuzela', 'tasma', 'wejscie-naglowka', 'mikrointerakcje'],
    pro: true,
    zastepczy: 'pastelowy-przyjazny',
  },
];

const PO_ID = new Map(KATALOG_STYLOW.map((s) => [s.id, s]));

export function stylPoId(id: string): StylProjektu | undefined {
  return PO_ID.get(id);
}

/** Styl dozwolony w danej wersji: Pro bez zmian, bez Pro styl Pro zamieniony na zastępczy. */
export function stylDlaWersji(id: string, funkcjePro: boolean): StylProjektu | undefined {
  const s = PO_ID.get(id);
  if (!s || funkcjePro || !s.pro) return s;
  return s.zastepczy ? PO_ID.get(s.zastepczy) : undefined;
}
