import type { WersjaKreatora } from '../plany.ts';

/**
 * Neutralny model eksportu strony z kreatora do CMS-a (paczka 124, etap 3 koncepcji). Jeden kształt dla każdego celu:
 * strony z treścią w formacie celu, menu, media do importu, pliki motywu, języki. Cel (dziś 'wordpress') zamienia
 * stronę kreatora na ten model; importer po stronie hostingu (agent węzła) czyta go z paczki jako JSON.
 *
 * Tokeny w treści (podmienia importer albo motyw):
 *  - `verris-kreator://strona/<klucz>[#kotwica]` – adres strony z eksportu,
 *  - `verris-kreator://media/<zasobId>` – adres zdjęcia po imporcie do biblioteki mediów CMS-a.
 */

/** Cele eksportu. Kolejny CMS = nowy identyfikator + implementacja `CelEksportu`. */
export const CELE_CMS = ['wordpress'] as const;
export type CelCms = (typeof CELE_CMS)[number];

/** Wersja formatu paczki (importer odrzuca nieznaną). */
export const WERSJA_FORMATU_EKSPORTU = 1;

export interface OpcjeEksportu {
  /** Wersja kreatora klienta – strona jest dopasowywana do niej jak przy publikacji (dopasujDoPlanu). */
  wersja: WersjaKreatora;
  /** Adres POST formularza kontaktowego (ten sam co na stronie statycznej); brak = formularz wyłączony. */
  adresFormularza?: string;
  /** ISO – deterministyczne testy (rok w stopce, wersja motywu). */
  dataGeneracji?: string;
  /** Pliki fontów, których proxy nie ma (krój bez danego zakresu znaków) – nie trafiają do theme.json. */
  brakujaceFonty?: string[];
}

export interface StronaCms {
  /** Klucz strony w eksporcie (tokeny linków, meta `_verris_klucz`). 'glowna' = strona główna. */
  klucz: string;
  /** Slug podstrony w kreatorze ('' = główna, 'o-nas', 'en/o-nas', 'blog/wpis'). */
  slug: string;
  /** Nazwa w adresie w CMS (ostatni człon sluga albo slug spłaszczony). */
  nazwa: string;
  /** Klucz strony nadrzędnej (np. wersja językowa 'p-en' dla 'en/o-nas'); null = najwyższy poziom. */
  rodzic: string | null;
  /** 'strona' – strona CMS; 'wpis' – wpis bloga (podstrona `blog/<slug>` z sekcji blog). */
  typ: 'strona' | 'wpis';
  tytul: string;
  jezyk: string;
  /** Klucz grupy tłumaczeń – strony z tym samym kluczem to wersje językowe jednej treści (hreflang). */
  grupa: string;
  glowna: boolean;
  seo: { tytul: string; opis: string };
  /** Treść w formacie celu (WordPress: zapis bloków). */
  tresc: string;
  /** Szablon strony w motywie (WordPress: 'strona-kreatora' – bez tytułu nad treścią, treść ma własny nagłówek). */
  szablon?: string;
  wpis?: { data: string; lead: string };
  /** Kolejność w menu/liście stron. */
  kolejnosc: number;
}

export interface PozycjaMenuCms {
  etykieta: string;
  /** Token strony (z kotwicą) albo adres zewnętrzny. */
  adres: string;
  /** Klucz strony, gdy pozycja prowadzi do całej podstrony (CMS może podpiąć ją jako stronę, nie link). */
  strona?: string;
}

export interface MediumCms {
  zasobId: string;
  alt: string;
  /** Ścieżka wariantu w plikach publikacji (assets/img/<zasobId>-<szer>.jpg) – API bierze z niej plik. */
  plikPublikacji: string;
  /** Nazwa pliku w paczce i w bibliotece mediów. */
  nazwaPliku: string;
}

export interface PlikCms {
  /** Ścieżka względem katalogu motywu. */
  sciezka: string;
  tresc: string;
}

export interface MotywCms {
  /** Nazwa katalogu motywu (WordPress: wp-content/themes/<katalog>). */
  katalog: string;
  pliki: PlikCms[];
  /** Pliki fontów (nazwy jak w publikacji) – API dokłada je do assets/fonts motywu. */
  fonty: string[];
}

export interface EksportCms {
  cel: CelCms;
  wersjaFormatu: number;
  /** Nazwa witryny (WordPress: blogname). */
  nazwa: string;
  /** Opis witryny (blogdescription). */
  opis: string;
  /** Język główny strony. */
  jezyk: string;
  /** Wszystkie języki stron w eksporcie (główny pierwszy). */
  jezyki: string[];
  strony: StronaCms[];
  menu: PozycjaMenuCms[];
  media: MediumCms[];
  motyw: MotywCms;
  ostrzezenia: string[];
}

/** Opis celu dla panelu klienta (karta „Przejdź na CMS”). */
export interface OpisCeluCms {
  id: CelCms;
  nazwa: string;
  opis: string;
  kiedyWarto: string[];
  coSieZmienia: string[];
}
