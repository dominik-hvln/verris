import type { TypSekcji } from './model.ts';

/**
 * Katalogi, z których AI składa stronę. AI wybiera identyfikatory; renderer je implementuje
 * (każdy wariant i efekt ma kod w `render/`). Pozycje `pro: true` są w pełni dostępne w Kreatorze Pro;
 * w pozostałych wersjach edytor pokazuje je jako podgląd „Pro”, a publikacja zamienia na `zastepczy`.
 */
export interface WariantSekcji {
  id: string;
  opis: string;
  pro?: boolean;
  /** Wariant darmowy używany zamiast tego przy publikacji bez Kreatora Pro. */
  zastepczy?: string;
}

export const KATALOG_WARIANTOW: Record<TypSekcji, WariantSekcji[]> = {
  hero: [
    { id: 'hero-podzielony', opis: 'Tekst po lewej, duży obraz po prawej, fakty pod przyciskami' },
    { id: 'hero-edytorski', opis: 'Bardzo duża typografia na całą szerokość, mały obraz z boku, dużo światła' },
    { id: 'hero-centralny', opis: 'Wyśrodkowany nagłówek i przyciski, obraz szeroki pod spodem' },
    { id: 'hero-pelnoekranowy', opis: 'Obraz na całym ekranie z przyciemnieniem i tekstem na nim' },
    { id: 'hero-z-formularzem', opis: 'Nagłówek po lewej, krótki formularz kontaktowy po prawej (landing)' },
    { id: 'hero-mozaika', opis: 'Kolaż 3 obrazów w asymetrycznej siatce obok tekstu', pro: true, zastepczy: 'hero-podzielony' },
  ],
  oferta: [
    { id: 'oferta-siatka', opis: 'Karty w siatce 2–3 kolumny, opcjonalne ikony' },
    { id: 'oferta-lista-cen', opis: 'Lista jak karta menu: nazwa, kropki, cena; grupy w kolumnach' },
    { id: 'oferta-kolumny', opis: 'Nagłówek sekcji z boku, pozycje w jednej kolumnie z liniami' },
    { id: 'oferta-naprzemienna', opis: 'Pozycje naprzemiennie z obrazami lewo/prawo', pro: true, zastepczy: 'oferta-siatka' },
  ],
  cennik: [
    { id: 'cennik-kolumny', opis: 'Pakiety obok siebie, wyróżniony środkowy' },
    { id: 'cennik-lista', opis: 'Pakiety jeden pod drugim w poziomych pasach' },
    { id: 'cennik-tabela', opis: 'Tabela porównawcza cech pakietów', pro: true, zastepczy: 'cennik-kolumny' },
  ],
  galeria: [
    { id: 'galeria-siatka', opis: 'Równa siatka kwadratów' },
    { id: 'galeria-mozaika', opis: 'Mozaika z kaflami różnej wielkości' },
    { id: 'galeria-karuzela', opis: 'Przewijana karuzela z przyciskami i powiększeniem', pro: true, zastepczy: 'galeria-mozaika' },
  ],
  zespol: [
    { id: 'zespol-karty', opis: 'Zdjęcie, imię, rola i krótki opis w kartach' },
    { id: 'zespol-lukowe', opis: 'Zdjęcia w kształcie łuku, podpisy pod spodem' },
    { id: 'zespol-lista', opis: 'Lista z małymi zdjęciami i dłuższym opisem' },
  ],
  opinie: [
    { id: 'opinie-cytat', opis: 'Jeden duży cytat z przełączaniem' },
    { id: 'opinie-siatka', opis: 'Kilka opinii w siatce' },
    { id: 'opinie-karuzela', opis: 'Przewijana taśma opinii', pro: true, zastepczy: 'opinie-siatka' },
  ],
  faq: [
    { id: 'faq-akordeon', opis: 'Rozwijane pytania w jednej kolumnie' },
    { id: 'faq-dwie-kolumny', opis: 'Nagłówek i kontakt po lewej, pytania po prawej' },
  ],
  kroki: [
    { id: 'kroki-kolumny', opis: 'Numerowane kroki w kolumnach z dużymi cyframi' },
    { id: 'kroki-os-czasu', opis: 'Pionowa oś czasu z etapami i czasem trwania' },
    { id: 'kroki-ciemne', opis: 'Kroki na ciemnym tle w poziomym pasie' },
  ],
  onas: [
    { id: 'onas-obraz-tekst', opis: 'Obraz z boku, tekst i wyróżniki' },
    { id: 'onas-manifest', opis: 'Duży tekst manifestu przez całą szerokość' },
    { id: 'onas-wyrozniki', opis: 'Krótki wstęp i siatka wyróżników' },
  ],
  kontakt: [
    { id: 'kontakt-podzielony', opis: 'Dane kontaktowe i mapa po lewej, formularz po prawej' },
    { id: 'kontakt-minimalny', opis: 'Duży adres e-mail i telefon, krótki formularz pod spodem' },
    { id: 'kontakt-karta', opis: 'Formularz w karcie na tle w kolorze akcentu' },
  ],
  cta: [
    { id: 'cta-pasek', opis: 'Wąski pas z nagłówkiem i przyciskiem' },
    { id: 'cta-pelny', opis: 'Duża sekcja na ciemnym tle z dwoma przyciskami' },
    { id: 'cta-karta', opis: 'Karta z zaokrągleniem na tle sekcji' },
  ],
  produkty: [
    { id: 'produkty-siatka', opis: 'Siatka produktów z ceną i przyciskiem', pro: true },
    { id: 'produkty-lista', opis: 'Lista produktów z dużym zdjęciem i opisem', pro: true },
  ],
  blog: [
    { id: 'blog-karty', opis: 'Zajawki wpisów w kartach', pro: true },
    { id: 'blog-edytorski', opis: 'Lista wpisów jak w czasopiśmie: data, tytuł, lead', pro: true },
  ],
};

/** Typy sekcji dostępne tylko w Kreatorze Pro. */
export const SEKCJE_PRO: TypSekcji[] = ['produkty', 'blog'];

export interface Efekt {
  id: string;
  nazwa: string;
  opis: string;
  pro: boolean;
}

/** Moduły zachowań renderera (vanilla JS + CSS, bez zewnętrznych bibliotek, szanują prefers-reduced-motion). */
export const KATALOG_EFEKTOW: Efekt[] = [
  { id: 'menu-mobilne', nazwa: 'Menu mobilne', opis: 'Dostępne menu na telefonie (zawsze włączone)', pro: false },
  { id: 'przyklejony-naglowek', nazwa: 'Przyklejony nagłówek', opis: 'Nagłówek zostaje u góry i zmniejsza się przy przewijaniu', pro: false },
  { id: 'pojawianie', nazwa: 'Płynne pojawianie', opis: 'Sekcje łagodnie wchodzą przy przewijaniu', pro: false },
  { id: 'pasek-cta-mobile', nazwa: 'Przycisk na telefonie', opis: 'Na telefonie stały przycisk „Zadzwoń” / „Umów” na dole ekranu', pro: false },
  { id: 'mikrointerakcje', nazwa: 'Mikrointerakcje', opis: 'Dopracowane stany najechania i fokusu przycisków i linków', pro: false },
  { id: 'lightbox', nazwa: 'Powiększanie zdjęć', opis: 'Galeria otwiera zdjęcia na pełnym ekranie z nawigacją', pro: true },
  { id: 'karuzela', nazwa: 'Karuzele', opis: 'Przewijane galerie, opinie i produkty (gest i przyciski)', pro: true },
  { id: 'przelacznik-cen', nazwa: 'Przełącznik cen', opis: 'Cennik z przełączaniem miesięcznie / rocznie', pro: true },
  { id: 'paralaksa', nazwa: 'Paralaksa', opis: 'Obrazy przesuwają się wolniej niż treść', pro: true },
  { id: 'tasma', nazwa: 'Taśma haseł', opis: 'Przesuwający się pas z hasłami lub usługami', pro: true },
  { id: 'wejscie-naglowka', nazwa: 'Animowany nagłówek', opis: 'Nagłówek główny pojawia się słowo po słowie', pro: true },
  { id: 'postep-czytania', nazwa: 'Postęp czytania', opis: 'Pasek postępu na wpisach bloga', pro: true },
];

export const EFEKTY_ZAWSZE = ['menu-mobilne'];
