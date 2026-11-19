/**
 * Szacunek kosztu operacji AI kreatora marki (koncepcja, rozdz. 8.3). Stawki Sonnet 5.5 z pomiaru kreatora stron:
 * 2 USD / 1 mln tokenów wejścia, 10 USD / 1 mln wyjścia, zapis cache 1 h = 2 × wejście, odczyt cache = 0,05 × wejście.
 * Obraz w analizie logo – ok. (szer × wys) / 750 tokenów (https://platform.claude.com/docs/en/build-with-claude/vision
 * – wzór z dokumentacji, [do weryfikacji dla modeli 5.x]); API skaluje logo do 512 px dłuższego boku.
 * To tylko szacunek do decyzji o limitach – rozliczenie robi API z `usage` odpowiedzi.
 */

export interface StawkiModelu {
  /** USD za 1 mln tokenów. */
  wejscie: number;
  wyjscie: number;
  zapisCache1h: number;
  odczytCache: number;
}

export const STAWKI_SONNET_55: StawkiModelu = { wejscie: 2, wyjscie: 10, zapisCache1h: 4, odczytCache: 0.1 };

/** Haiku 4.5 (ZNANE_MODELE_AI w API: 1 / 5 USD) – szacunek samooceny, gdy model zmian to Haiku. */
export const STAWKI_HAIKU_45: StawkiModelu = { wejscie: 1, wyjscie: 5, zapisCache1h: 2, odczytCache: 0.1 };

export interface ZuzycieTokenow {
  /** Tokeny prefiksu odczytane z cache. */
  odczytCache: number;
  /** Tokeny prefiksu zapisane do cache (pierwsze zapytanie w godzinie). */
  zapisCache?: number;
  /** Tokeny wejścia poza cache (wiadomość, obraz). */
  wejscie: number;
  wyjscie: number;
}

export function kosztUsd(z: ZuzycieTokenow, s: StawkiModelu = STAWKI_SONNET_55): number {
  return (z.odczytCache * s.odczytCache + (z.zapisCache ?? 0) * s.zapisCache1h + z.wejscie * s.wejscie + z.wyjscie * s.wyjscie) / 1_000_000;
}

/** Tokeny obrazu (wzór z dokumentacji vision): szer × wys / 750, po skalowaniu do `maksBok`. */
export function tokenyObrazu(szer: number, wys: number, maksBok = 512): number {
  const s = Math.min(1, maksBok / Math.max(szer, wys));
  return Math.ceil((Math.round(szer * s) * Math.round(wys * s)) / 750);
}

/**
 * Realne wyjście (tokeny, bez myślenia) na operację – szacunek z fikstur testowych w zapisie kompaktowym (polski tekst
 * ≈ 3,5 znaku na token, JSON i SVG ≈ 3 znaki na token). Paczka 134: kierunek z symbolem AI (SVG ≤ 12 elementów
 * + koncepcja + uzasadnienie) ok. 270, kierunek z biblioteki z koncepcją ok. 140, strategia ok. 60; samoocena wizją
 * ok. 25 na kierunek. Test operacje-marki.spec.ts mierzy fikstury i pilnuje, że szacunek ich nie zaniża.
 */
export const WYJSCIE_SZACUNEK = {
  /** 6 kierunków (4 symbole AI + 2 z biblioteki) + strategia. */
  seria: 4 * 270 + 2 * 140 + 60,
  /** Ponowienie 2 symboli (próg > 1 odrzuconego). */
  ponowienie: 2 * 270,
  odswiezenie: 3 * 170,
  analizaLogo: 180,
  kv: 70,
  drobna: 45,
  /** Samoocena 6 propozycji (tani model, obraz 768×512). */
  samoocena: 6 * 25,
} as const;

/** Tokeny wejścia samooceny poza obrazem: system (~350) + brief i koncepcje 6 kierunków (~450). */
export const WEJSCIE_SAMOOCENY = 800;
