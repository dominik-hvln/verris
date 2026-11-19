import { losZZiarna } from '../../ai/kierunki.ts';
import { KATALOG_FONTOW, type FontKatalogu } from '../../style/katalog-stylow.ts';
import { CHARAKTERY_PALET } from '../../style/kolory.ts';
import type { BriefMarki, ParametrySygnetu } from '../model.ts';
import { KATALOG_SYGNETOW } from '../sygnety/katalog.ts';
import type { RodzinaSygnetu } from '../typy.ts';
import { dopasowanieRodziny, kategorieBriefu, krojeDlaBriefu } from './branze.ts';

/**
 * Preselekcja serii (serwer, nie AI) – koncepcja 8.4. Zamiast prosić model „nie powtarzaj”, serwer dla każdego
 * miejsca w serii (slotu) wybiera:
 *  - dozwolone rodziny sygnetów (1–2) i zawężone zakresy parametrów – z karą za rodziny i przedziały parametrów
 *    częste w znakach już wydanych w tej branży (rejestr odcisków) i bez powtórek rodzin w jednej serii;
 *  - rodzaj znaku z briefu: monogram → rodziny monogramowe, „napis” → bez sygnetu (same kroje i kolory);
 *  - sloty, w których model RYSUJE symbol zaprojektowany dla tej firmy (SVG, walidowany) – paczka 134: domyślnie
 *    4 z 6, każdy z innym podejściem do koncepcji (litera + motyw, motyw branży, skojarzenie z nazwą, litera);
 *    zapasem slotu jest monogram z liter nazwy, nigdy losowa abstrakcja;
 *  - pozostałe sloty z biblioteki TYLKO powiązane z briefem: monogramy (litery nazwy) i rodziny abstrakcyjne, których
 *    `branze` pasują do kategorii briefu (ai/branze.ts) – bez dopasowania abstrakcji nie ma, jest monogram;
 *  - kroje napisu dopasowane do cech i branży (`krojeDlaBriefu`) – sport nie dostaje Playfair;
 *  - zakres barwy akcentu (barwy lubiane z briefu albo rozłożone po kole, z ominięciem odrzuconych),
 *    dozwolone charaktery palety i kategorię kroju – różne w serii;
 *  - ziarno kreatywne (zasada konstrukcji, kierunek skojarzenia, kontrast form).
 * Wszystko deterministycznie z `ziarno` – ta sama seria da się odtworzyć (logi, zamienniki, testy).
 */

export interface PozycjaZiarnaMarki {
  id: string;
  opis: string;
}

/** Zasada konstrukcji znaku. */
export const KONSTRUKCJE_ZNAKU: readonly PozycjaZiarnaMarki[] = [
  { id: 'litera', opis: 'z litery nazwy – litera jako kształt, nie jako napis' },
  { id: 'ksztalt-branzy', opis: 'z kształtu kojarzonego z branżą, przetworzonego (wycinek, rytm, uproszczenie), nigdy dosłownie' },
  { id: 'geometria-nazwy', opis: 'z geometrii nazwy – liczba sylab lub słów jako liczba elementów, rytm' },
  { id: 'negatyw', opis: 'z przestrzeni negatywnej – drugi kształt w wycięciu pierwszego' },
  { id: 'ruch', opis: 'z ruchu – kierunek, obrót, fala, przesunięcie' },
  { id: 'modul', opis: 'z modułu – kafel, podział siatki, powtórzenie jednego elementu' },
  { id: 'slad', opis: 'ze śladu pracy – cięcie, ścieg, pociągnięcie narzędzia' },
  { id: 'miejsce', opis: 'z miejsca – horyzont, łuk, mapa (tylko gdy brief podaje miejsce; inaczej z ruchu)' },
  { id: 'litera-motyw', opis: 'litera nazwy połączona z motywem branży w JEDEN kształt (np. L z toru bieżni, K z nacięcia bochenka)' },
  { id: 'skojarzenie-nazwy', opis: 'z dosłownego albo przenośnego znaczenia nazwy (np. „Lubuski” – winorośl, Odra; „Kłos” – rytm ziaren), przetworzonego' },
];

/** Podejścia do koncepcji symbolu AI (paczka 134) – kolejno dla slotów z symbolem; każdy symbol z innego. */
export const PODEJSCIA_SYMBOLU = ['litera-motyw', 'ksztalt-branzy', 'skojarzenie-nazwy', 'litera', 'negatyw', 'ruch'] as const;

/** Skąd brać skojarzenie (model wybiera konkret z briefu). */
export const SKOJARZENIA_ZNAKU: readonly PozycjaZiarnaMarki[] = [
  { id: 'material', opis: 'materiał lub tworzywo, z którym pracuje firma' },
  { id: 'narzedzie', opis: 'narzędzie lub gest pracy' },
  { id: 'efekt', opis: 'efekt dla klienta – stan „po”' },
  { id: 'rytm', opis: 'czas i rytm – pora, sezon, cykl' },
  { id: 'nazwa', opis: 'brzmienie lub znaczenie nazwy' },
  { id: 'klient', opis: 'sytuacja klienta, z którą przychodzi' },
];

/** Kontrast form. */
export const KONTRASTY_FORM: readonly PozycjaZiarnaMarki[] = [
  { id: 'miekki', opis: 'miękko – łuki, zaokrąglenia, forma organiczna' },
  { id: 'ostry', opis: 'ostro – kąty, cięcia, krawędzie' },
  { id: 'miekko-ostry', opis: 'miękka bryła z jednym ostrym cięciem' },
  { id: 'lekki', opis: 'lekko – cienkie elementy, dużo światła' },
  { id: 'ciezki', opis: 'masywnie – zwarta bryła, mało światła' },
  { id: 'skala', opis: 'kontrast skali – duży element i jeden mały detal' },
];

export interface ZiarnoMarki {
  konstrukcja: string;
  skojarzenie: string;
  kontrast: string;
}

export type KategoriaKroju = FontKatalogu['kategoria'];
export type CharakterPaletyMarki = (typeof CHARAKTERY_PALET)[number];

export interface RodzinaSlotu {
  id: string;
  /** Zawężone zakresy parametrów [min, max] (liczby całkowite, w granicach katalogu). */
  zakresy: Record<string, [number, number]>;
}

export interface SlotSerii {
  /** 'k1'…'k6' – identyfikator kierunku. */
  id: string;
  /**
   * Dozwolone rodziny; pusta lista i `symbolAi: false` = znak sam napis (rodzaj „napis”). W slocie z symbolem AI –
   * zapas (monogram z liter nazwy), gdy model nie narysuje symbolu.
   */
  rodziny: RodzinaSlotu[];
  /** Model rysuje symbol (SVG) zaprojektowany dla tej firmy zamiast rodziny. */
  symbolAi: boolean;
  /** Paczka 134 – kroje napisu dopasowane do briefu (1–3, pierwszy = zastępczy); brak = dowolny z kategorii. */
  kroje?: string[];
  /** Zakres barwy akcentu (OKLCH h): [od, do], od > do = przez 0. */
  barwy: [number, number];
  charaktery: CharakterPaletyMarki[];
  kategoriaKroju: KategoriaKroju;
  ziarno: ZiarnoMarki;
}

export interface PreselekcjaMarki {
  ziarno: number;
  rodzaj: BriefMarki['rodzaj'];
  sloty: SlotSerii[];
  /** Paczka 134 – kategorie branży wykryte w briefie (motywy w M2); pusta – brief bez rozpoznanej branży. */
  kategorie?: string[];
}

/** Znak wydany w branży (rejestr odcisków) – wystarczy rodzina i parametry. */
export interface ZnakWydany {
  rodzina: string;
  parametry?: ParametrySygnetu;
}

export interface OpcjePreselekcji {
  /** Liczba kierunków (domyślnie 6, 1–8). */
  ile?: number;
  /** Slotów z symbolem AI (domyślnie 4 = większość z 6; 0 = bez symboli AI). Zawsze ≥ 1 slot z biblioteki. */
  symboleAi?: number;
  /** Sloty z symbolem AI na końcu serii (odświeżenie – kierunek „nowy”); domyślnie na początku. */
  symboleAiNaKoncu?: boolean;
  /** Katalog rodzin (domyślnie KATALOG_SYGNETOW) – testy. */
  katalog?: readonly RodzinaSygnetu[];
}

const indeks = (los: () => number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(los() * n)));

export const odlegloscBarwy = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Barwa w zakresie [od, do] (zawinięcie przez 0). */
export function barwaWZakresie(h: number, [od, doo]: [number, number]): boolean {
  const x = ((h % 360) + 360) % 360;
  return od <= doo ? x >= od && x <= doo : x >= od || x <= doo;
}

/** Waga rodziny dla briefu: charakter (cechy) i dopasowanie branży; kara 0,5^n za n znaków tej rodziny wydanych w branży. */
export function wagaRodziny(r: RodzinaSygnetu, brief: Pick<BriefMarki, 'branza' | 'opis' | 'cechy' | 'rodzaj'> & Partial<Pick<BriefMarki, 'nazwa' | 'uwagi'>>, wydane: readonly ZnakWydany[], kategorie?: readonly string[]): number {
  let w = 1;
  const cechy = new Set<string>(brief.cechy ?? []);
  w += r.charakter.filter((c) => cechy.has(c)).length * 2;
  w += Math.min(3, dopasowanieRodziny(r, brief, kategorie)) * 1.5;
  const ile = wydane.filter((z) => z.rodzina === r.id).length;
  return w * Math.max(0.05, 0.5 ** ile);
}

/**
 * Zawężenie zakresu parametru: zakres katalogu dzielony na 3 przedziały (przy wąskich – cały), wybór przedziału
 * z karą za przedziały, w które wpadają parametry znaków wydanych w branży, i za przedziały już użyte w serii.
 */
function zawezZakresy(r: RodzinaSygnetu, wydane: readonly ZnakWydany[], uzyte: Map<string, number>, los: () => number): Record<string, [number, number]> {
  const wynik: Record<string, [number, number]> = {};
  for (const p of r.parametry) {
    const szer = p.max - p.min;
    if (szer < 3) {
      wynik[p.klucz] = [p.min, p.max];
      continue;
    }
    const krok = (szer + 1) / 3;
    const przedzialy: [number, number][] = [0, 1, 2].map((i) => [p.min + Math.round(i * krok), Math.min(p.max, p.min + Math.round((i + 1) * krok) - 1)]);
    const wagi = przedzialy.map(([a, b], i) => {
      const wBranzy = wydane.filter((z) => z.rodzina === r.id && typeof z.parametry?.[p.klucz] === 'number' && z.parametry[p.klucz] >= a && z.parametry[p.klucz] <= b).length;
      const wSerii = uzyte.get(`${r.id}.${p.klucz}.${i}`) ?? 0;
      return 0.5 ** wBranzy * 0.4 ** wSerii;
    });
    const suma = wagi.reduce((s, x) => s + x, 0);
    let x = los() * suma;
    let i = 0;
    for (; i < 2; i++) {
      x -= wagi[i];
      if (x < 0) break;
    }
    uzyte.set(`${r.id}.${p.klucz}.${i}`, (uzyte.get(`${r.id}.${p.klucz}.${i}`) ?? 0) + 1);
    wynik[p.klucz] = przedzialy[i];
  }
  return wynik;
}

/** Losowanie ważone bez zwracania. */
function wybierzWazone<T>(los: () => number, pozycje: { x: T; waga: number }[]): T | undefined {
  const suma = pozycje.reduce((s, p) => s + p.waga, 0);
  if (!pozycje.length || suma <= 0) return pozycje[0]?.x;
  let r = los() * suma;
  for (const p of pozycje) {
    r -= p.waga;
    if (r < 0) return p.x;
  }
  return pozycje[pozycje.length - 1].x;
}

/** Kategorie kroju napisu w serii (monospace i odręczne – tylko jako akcent, nie jako napis logo). */
const KATEGORIE_KROJU: KategoriaKroju[] = ['bezszeryfowy', 'szeryfowy', 'bezszeryfowy', 'ozdobny', 'szeryfowy', 'bezszeryfowy'];

/**
 * Barwy pasujące do cech marki (OKLCH h, tabela barw z M2) – podpowiedź, nie reguła: zajmują najwyżej połowę slotów,
 * reszta serii idzie po kole, żeby klient zobaczył też kierunek, którego się nie spodziewał.
 */
export const BARWY_CECH: Readonly<Record<string, readonly number[]>> = {
  spokojna: [208, 241, 149],
  energiczna: [28, 59, 341],
  elegancka: [264, 8, 301],
  przyjazna: [59, 149, 208],
  nowoczesna: [241, 301, 182],
  klasyczna: [264, 28, 149],
  rzemieslnicza: [35, 76, 110],
  techniczna: [241, 264, 208],
  luksusowa: [264, 76, 8],
  zabawna: [341, 59, 97],
  ekspercka: [264, 241, 182],
  lokalna: [149, 35, 76],
  naturalna: [110, 149, 59],
  odwazna: [28, 341, 264],
  minimalistyczna: [264, 241, 35],
  ciepla: [35, 59, 76],
};

/**
 * Zakres barw dla slotów: najpierw barwy lubiane z briefu (±20°), bez nich – barwy cech marki (±25°), obie najwyżej
 * w połowie slotów; pozostałe rozłożone po kole od losowego przesunięcia (±30°). Odrzucone barwy omijane (≥ 45°).
 */
function barwySlotow(brief: Pick<BriefMarki, 'barwyLubiane' | 'barwyOdrzucone' | 'cechy'>, ile: number, los: () => number): [number, number][] {
  const odrzucone = brief.barwyOdrzucone ?? [];
  const lubiane = brief.barwyLubiane ?? [];
  const zCech = [...new Set((brief.cechy ?? []).flatMap((c) => BARWY_CECH[c] ?? []))];
  const podpowiedzi = lubiane.length ? lubiane : zCech;
  const limit = lubiane.length ? Math.max(lubiane.length, Math.ceil(ile / 2)) : Math.min(zCech.length, Math.ceil(ile / 2));
  const przesuniecie = Math.floor(los() * 360);
  const wynik: [number, number][] = [];
  for (let i = 0; i < ile; i++) {
    const zPodpowiedzi = i < limit;
    let srodek = zPodpowiedzi ? podpowiedzi[i % podpowiedzi.length] : (przesuniecie + Math.round((i * 360) / ile)) % 360;
    for (let proba = 0; proba < 12 && odrzucone.some((o) => odlegloscBarwy(o, srodek) < 45); proba++) srodek = (srodek + 30) % 360;
    const polowa = zPodpowiedzi ? (lubiane.length ? 20 : 25) : 30;
    wynik.push([(srodek - polowa + 360) % 360, (srodek + polowa) % 360]);
  }
  return wynik;
}

/**
 * Ziarna kreatywne serii: sloty z symbolem AI dostają kolejne podejścia z PODEJSCIA_SYMBOLU (przesunięte losowo),
 * pozostałe – konstrukcje bez powtórek (o ile lista wystarcza). Kontrasty form bez powtórek.
 */
function ziarnaSerii(los: () => number, symbol: readonly boolean[], rodzaj: BriefMarki['rodzaj']): ZiarnoMarki[] {
  const konstrukcje = KONSTRUKCJE_ZNAKU.filter((k) =>
    rodzaj === 'monogram' ? ['litera', 'negatyw', 'modul', 'ruch', 'geometria-nazwy'].includes(k.id) : !['litera-motyw', 'skojarzenie-nazwy'].includes(k.id),
  );
  const pula = [...konstrukcje];
  const kontrasty = [...KONTRASTY_FORM];
  const przes = indeks(los, PODEJSCIA_SYMBOLU.length);
  let nrSymbolu = 0;
  return symbol.map((jestSymbol) => {
    const k = jestSymbol
      ? PODEJSCIA_SYMBOLU[(przes + nrSymbolu++) % PODEJSCIA_SYMBOLU.length]
      : (pula.length ? pula.splice(indeks(los, pula.length), 1)[0] : konstrukcje[indeks(los, konstrukcje.length)]).id;
    const c = kontrasty.length ? kontrasty.splice(indeks(los, kontrasty.length), 1)[0] : KONTRASTY_FORM[indeks(los, KONTRASTY_FORM.length)];
    const skoj = k === 'skojarzenie-nazwy' || k === 'litera-motyw' || k === 'litera' ? 'nazwa' : SKOJARZENIA_ZNAKU[indeks(los, SKOJARZENIA_ZNAKU.length)].id;
    return { konstrukcja: k, skojarzenie: skoj, kontrast: c.id };
  });
}

/** Preselekcja serii kierunków „Nowa marka” (i odświeżenia – kierunek „nowy”). */
export function preselekcjaSerii(
  brief: Pick<BriefMarki, 'branza' | 'opis' | 'rodzaj' | 'cechy' | 'barwyLubiane' | 'barwyOdrzucone'> & Partial<Pick<BriefMarki, 'nazwa' | 'uwagi' | 'podpis'>>,
  wydaneWBranzy: readonly ZnakWydany[],
  ziarno: number,
  opcje: OpcjePreselekcji = {},
): PreselekcjaMarki {
  const los = losZZiarna(ziarno >>> 0);
  const ile = Math.max(1, Math.min(8, Math.floor(opcje.ile ?? 6)));
  const rodzaj = brief.rodzaj ?? 'znak-i-napis';
  const katalog = opcje.katalog ?? KATALOG_SYGNETOW;
  const kategorie = kategorieBriefu(brief);
  // Pula: monogramy zawsze (litery nazwy), abstrakcje tylko z dopasowaniem branży (paczka 134).
  const pula =
    rodzaj === 'napis'
      ? []
      : katalog.filter((r) => (rodzaj === 'monogram' ? r.monogram : r.monogram || dopasowanieRodziny(r, brief, kategorie) > 0));
  const wagi = pula.map((r) => ({ x: r, waga: wagaRodziny(r, brief, wydaneWBranzy, kategorie) }));
  const monogramy = wagi.filter((w) => w.x.monogram);
  const abstrakcje = wagi.filter((w) => !w.x.monogram);
  const symboleAi = rodzaj === 'znak-i-napis' ? Math.max(0, Math.min(opcje.symboleAi ?? 4, ile - 1)) : 0;
  const symbol = Array.from({ length: ile }, (_, i) => (opcje.symboleAiNaKoncu ? i >= ile - symboleAi : i < symboleAi));
  const barwy = barwySlotow(brief, ile, los);
  const ziarna = ziarnaSerii(los, symbol, rodzaj);
  const uzyteRodziny = new Map<string, number>();
  const uzyteZakresy = new Map<string, number>();
  const charaktery = [...CHARAKTERY_PALET];
  const przesuniecieKroju = indeks(los, KATEGORIE_KROJU.length);
  const kroje = krojeDlaBriefu({ ...brief, cechy: brief.cechy ?? [] }, kategorie);

  /** Losowanie rodziny z listy: najpierw nieużyte w serii, waga × 0,3 za każde użycie. */
  const losuj = (lista: typeof wagi, bez: readonly string[], mnoznik = 1) =>
    wybierzWazone(
      los,
      lista.filter((w) => !bez.includes(w.x.id)).map((w) => ({ x: w.x, waga: w.waga * 0.3 ** (uzyteRodziny.get(w.x.id) ?? 0) * mnoznik })),
    );
  const dodaj = (rodziny: RodzinaSlotu[], r: RodzinaSygnetu | undefined, waga: number) => {
    if (!r) return;
    uzyteRodziny.set(r.id, (uzyteRodziny.get(r.id) ?? 0) + waga);
    rodziny.push({ id: r.id, zakresy: zawezZakresy(r, wydaneWBranzy, uzyteZakresy, los) });
  };

  let abstrakcjiWSerii = 0;
  const sloty: SlotSerii[] = [];
  for (let i = 0; i < ile; i++) {
    const rodziny: RodzinaSlotu[] = [];
    if (pula.length) {
      if (symbol[i]) {
        // Zapas symbolu AI = monogram z liter nazwy (nigdy losowa abstrakcja).
        dodaj(rodziny, losuj(monogramy.length ? monogramy : wagi, []), 0.5);
      } else {
        // Biblioteka: najwyżej połowa slotów z biblioteki to abstrakcje pasujące do branży, reszta – monogramy;
        // druga rodzina slotu (zapas) – zawsze monogram.
        const slotowBiblioteki = ile - symboleAi;
        const abstrakcja = rodzaj !== 'monogram' && abstrakcje.length > 0 && abstrakcjiWSerii < Math.max(1, Math.floor(slotowBiblioteki / 2));
        const glowna = abstrakcja ? losuj(abstrakcje, []) : losuj(monogramy.length ? monogramy : wagi, []);
        if (abstrakcja && glowna) abstrakcjiWSerii++;
        dodaj(rodziny, glowna, 1);
        if (monogramy.length > 1 || (glowna && !glowna.monogram)) dodaj(rodziny, losuj(monogramy.length ? monogramy : wagi, rodziny.map((r) => r.id), 0.8), 0.5);
      }
    }
    const ch1 = charaktery[(i * 2) % charaktery.length];
    const ch2 = charaktery[(i * 2 + 1) % charaktery.length];
    // Kroje slotu: trzy kolejne z listy dopasowanej do briefu (każdy slot zaczyna od innego); bez sygnału – kategoria.
    const krojeSlotu = kroje.length ? [0, 1, 2].map((d) => kroje[(i + d) % kroje.length]).filter((f, j, a) => a.indexOf(f) === j) : undefined;
    const kategoria = krojeSlotu ? (KATALOG_FONTOW.find((f) => f.rodzina === krojeSlotu[0])?.kategoria ?? 'bezszeryfowy') : KATEGORIE_KROJU[(przesuniecieKroju + i) % KATEGORIE_KROJU.length];
    sloty.push({
      id: `k${i + 1}`,
      rodziny,
      symbolAi: symbol[i],
      ...(krojeSlotu ? { kroje: krojeSlotu } : {}),
      barwy: barwy[i],
      charaktery: ch1 === ch2 ? [ch1] : [ch1, ch2],
      kategoriaKroju: kategoria,
      ziarno: ziarna[i],
    });
  }
  return { ziarno: ziarno >>> 0, rodzaj, sloty, kategorie };
}
