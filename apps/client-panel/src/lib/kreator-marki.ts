import {
  BriefMarki,
  KATALOG_FONTOW,
  koloryMarki,
  koloryZHex,
  normalizujLitery,
  oklchDoHex,
  rodzinaPoId,
  type CechaMarki,
  type CenaMarki,
  type KierunekMarki,
  type LicznikMarki,
  type MaterialKv,
  type PlikMarki,
  type ProjektLogo,
  type RodzajZnaku,
  type SeriaMarki,
  type StanKreatoraMarki,
  type WariantKoloru,
  type WidokMarki,
  type WersjaMarkiKonta,
  type UkladLogo,
} from '@verris/kreator/klient';
import { zl } from './kreator';
import { plForm } from './pl';

/**
 * Paczka 131 – Kreator marki w panelu klienta: etykiety, liczniki, adresy plików (przez trasy panelu – tokenu sesji
 * nie ma w przeglądarce) i czyste przekształcenia projektu logo w „Dopasuj” (bez AI). Kontrakt HTTP z API:
 * libs/kreator/src/marka/api-kontrakt.ts. Moduł działa w przeglądarce – z biblioteki tylko `@verris/kreator/klient`.
 */

export type {
  AnalizaWgranego,
  CenaMarki,
  DrobnaZmianaBody,
  LicznikMarki,
  PlikMarki,
  PozycjaListyMarek,
  SeriaMarki,
  StanKreatoraMarki,
  StopkaEmailWynik,
  WidokMarki,
  WynikZakupuMarki,
  ZakupPakietuBody,
} from '@verris/kreator/klient';

export const SCIEZKA_MARKI = '/dashboard/kreator-marki';
export const POWROT_MARKI = { href: SCIEZKA_MARKI, opis: 'Wróć do listy marek w panelu', nazwa: 'Kreator marki' } as const;

// ---------------------------------------------------------------------------------------------------------------
// Teksty prawne – zgodne z Regulaminem 1.4.0 §13b (docs/legal/drafts/terms.md); odesłania do ustępów pilnuje
// apps/api/src/test/dokumenty-prawne-1-4-0.spec.ts
// ---------------------------------------------------------------------------------------------------------------

export const OSTRZEZENIE_NAGLOWKA =
  'Logo z kreatora nie jest znakiem zastrzeżonym. Zanim zamówisz druk albo zgłosisz znak do urzędu, sprawdź podobne znaki w TMview. To nie jest badanie prawne (Regulamin §13b ust. 9–10).';
export const TEKST_ZGODY_TMVIEW =
  'Wiem, że Verris nie sprawdza rejestrów znaków towarowych i nie gwarantuje, że podobnego znaku nikt nie używa (Regulamin §13b ust. 8–10). Przed drukiem i zgłoszeniem znaku sprawdzę go w TMview.';
export const TEKST_OSWIADCZENIA_PRAW =
  'Mam prawo używać tego logo i zlecić jego przetworzenie: analizę z pomocą AI, wektoryzację, materiały i propozycje odświeżenia (Regulamin §13b ust. 12).';
export const TEKST_ZGODY_TRESCI_CYFROWEJ =
  'Chcę, żeby Verris udostępnił mi ten zakup od razu, przed upływem 14 dni na odstąpienie od umowy. Wiem, że z chwilą udostępnienia treści cyfrowej tracę prawo odstąpienia od umowy w tym zakresie (Regulamin §13b ust. 13). Potwierdzenie dostanę e-mailem.';
export const INFORMACJA_EKSPORTU =
  'Pliki mają w opisie (metadanych) informację, że powstały z pomocą AI (Regulamin §13b ust. 14). Kroje mają licencję SIL Open Font License – jej tekst jest w paczce. Pobrane logo możesz używać, zmieniać i zgłosić jako znak towarowy (licencja: Regulamin §13b ust. 4–6).';
export const ODRZUCONY_BRIEF =
  'Nie przygotujemy logo na wzór cudzej marki. Opisz, co Ci się w niej podoba – np. prosty znak, grube litery, dwa kolory – bez nazwy marki.';

/** Wyszukiwarka znaków towarowych urzędów UE i krajowych (m.in. UPRP, EUIPO). [do weryfikacji adresu przed startem] */
export const ADRES_TMVIEW = 'https://www.tmdn.org/tmview/';
export const KROKI_TMVIEW = [
  'Otwórz TMview i wpisz nazwę z logo w polu wyszukiwania (bez podpisu, np. bez „biuro rachunkowe”).',
  'Zawęź wyniki do urzędów, na których rynku działasz – co najmniej Polska (UPRP) i Unia Europejska (EUIPO).',
  'Sprawdź klasy towarów i usług (klasyfikacja nicejska) – ważne są znaki w klasach podobnych do Twojej działalności.',
  'Wyszukaj też obrazem: wgraj plik PNG z logo (opcja wyszukiwania po obrazie) i przejrzyj podobne znaki.',
  'Jeśli znajdziesz podobny znak w tej samej branży – zmień projekt albo zapytaj rzecznika patentowego.',
];

// ---------------------------------------------------------------------------------------------------------------
// Słowniki
// ---------------------------------------------------------------------------------------------------------------

export const ETYKIETY_CECH: Record<CechaMarki, string> = {
  spokojna: 'Spokojna',
  energiczna: 'Energiczna',
  elegancka: 'Elegancka',
  przyjazna: 'Przyjazna',
  nowoczesna: 'Nowoczesna',
  klasyczna: 'Klasyczna',
  rzemieslnicza: 'Rzemieślnicza',
  techniczna: 'Techniczna',
  luksusowa: 'Luksusowa',
  zabawna: 'Zabawna',
  ekspercka: 'Ekspercka',
  lokalna: 'Lokalna',
  naturalna: 'Naturalna',
  odwazna: 'Odważna',
  minimalistyczna: 'Minimalistyczna',
  ciepla: 'Ciepła',
};

export const ETYKIETY_RODZAJU: Record<RodzajZnaku, { nazwa: string; opis: string }> = {
  'znak-i-napis': { nazwa: 'Znak i napis', opis: 'Sygnet obok nazwy' },
  napis: { nazwa: 'Sam napis', opis: 'Logotyp z kroju' },
  monogram: { nazwa: 'Monogram', opis: 'Inicjały jako znak' },
};

export const ETYKIETY_WERSJI_MARKI: Record<WersjaMarkiKonta, string> = {
  proba: 'Okres próbny',
  hosting: 'W cenie hostingu',
  pakiet: 'Pakiet marki',
};

export const ETYKIETY_STYLU: Record<ProjektLogo['napis']['styl'], string> = {
  jeden: 'Jeden wiersz',
  dwa: 'Dwa wiersze',
  wersaliki: 'Wersaliki',
  male: 'Małe litery',
  rozstrzelony: 'Rozstrzelony',
};

export const ETYKIETY_UKLADU: Record<UkladLogo, string> = {
  poziomy: 'Poziomy',
  pionowy: 'Pionowy',
  sygnet: 'Sam znak',
  napis: 'Sam napis',
};

export const ETYKIETY_WARIANTU: Record<WariantKoloru, { nazwa: string; opis: string }> = {
  kolor: { nazwa: 'Kolor', opis: 'podstawowy' },
  mono: { nazwa: 'Jednobarwny', opis: 'pieczątka, grawer, faks' },
  negatyw: { nazwa: 'Negatyw', opis: 'na kolorze marki' },
  bialy: { nazwa: 'Biały', opis: 'na zdjęciach i ciemnym tle' },
};

export const ETYKIETY_CHARAKTERU: Record<ProjektLogo['kolory']['charakter'], string> = {
  jasna: 'Jasna',
  ciemna: 'Ciemna',
  kontrastowa: 'Kontrastowa',
  pastelowa: 'Pastelowa',
  ziemista: 'Ziemista',
};

export const ETYKIETY_GRUP: Record<PlikMarki['grupa'], string> = {
  logo: 'Logo',
  ikony: 'Favicon i ikony aplikacji',
  kv: 'Grafiki do social mediów',
  druk: 'Do druku',
  kroje: 'Kroje',
  stopka: 'Stopka e-mail',
};
const KOLEJNOSC_GRUP: PlikMarki['grupa'][] = ['logo', 'ikony', 'kroje', 'stopka', 'kv', 'druk'];

export const ETYKIETY_MATERIALOW: Record<MaterialKv, { nazwa: string; opis: string }> = {
  wzor: { nazwa: 'Wzór z sygnetu', opis: 'SVG bez szwów – tło stron, opakowań, prezentacji' },
  post: { nazwa: 'Post', opis: '1080 × 1080 px' },
  story: { nazwa: 'Story', opis: '1080 × 1920 px' },
  'okladka-facebook': { nazwa: 'Okładka na Facebooku', opis: 'wymiary sprawdzamy przy każdej aktualizacji szablonu' },
  'baner-linkedin': { nazwa: 'Baner LinkedIn', opis: 'strona firmowa' },
  wizytowka: { nazwa: 'Wizytówka', opis: '85 × 55 mm, spad 3 mm' },
  'papier-firmowy': { nazwa: 'Papier firmowy', opis: 'A4' },
  'stopka-email': { nazwa: 'Stopka e-mail', opis: 'HTML do programów pocztowych' },
  favicon: { nazwa: 'Favicon', opis: 'ikona w karcie przeglądarki' },
  'ksiega-znaku': { nazwa: 'Księga znaku', opis: 'PDF z zasadami marki' },
  'zaproszenie-teams': { nazwa: 'Tło spotkań online', opis: 'Teams, Meet, Zoom' },
  naklejka: { nazwa: 'Naklejka', opis: 'okrągła, do druku' },
};
/** Materiały z podglądem graficznym w kroku „Materiały” (GET material/:m.svg). */
export const MATERIALY_PODGLADU: MaterialKv[] = ['post', 'story', 'wzor', 'okladka-facebook', 'baner-linkedin', 'wizytowka', 'papier-firmowy', 'zaproszenie-teams', 'naklejka'];

export const ETYKIETY_ODSWIEZENIA: Record<'ewolucja' | 'odswiezenie' | 'nowy', string> = {
  ewolucja: 'Ewolucja',
  odswiezenie: 'Odświeżenie',
  nowy: 'Nowy kierunek',
};

// ---------------------------------------------------------------------------------------------------------------
// Liczby i limity
// ---------------------------------------------------------------------------------------------------------------

export const serii = (n: number) => `${n} ${plForm(n, 'seria', 'serie', 'serii')}`;
export const marek = (n: number) => `${n} ${plForm(n, 'marka', 'marki', 'marek')}`;
export const zmianAiMarki = (n: number) => `${n} ${plForm(n, 'zmiana AI', 'zmiany AI', 'zmian AI')}`;

export function pozostaloZ(l: LicznikMarki): number {
  return Math.max(0, l.limit - l.uzyte);
}

/** „Zostały 2 z 3 serii”, „Została 1 z 3 serii”, „Zostało 0 z 3 serii” (po „z” dopełniacz: 1 serii / 3 serii). */
export function opisPozostalo(l: LicznikMarki, rodzaj: 'serie' | 'zmiany' | 'marki'): string {
  const n = pozostaloZ(l);
  const czas = plForm(n, 'Została', 'Zostały', 'Zostało');
  const z =
    rodzaj === 'serie'
      ? plForm(l.limit, 'serii', 'serii', 'serii')
      : rodzaj === 'zmiany'
        ? plForm(l.limit, 'zmiany AI', 'zmian AI', 'zmian AI')
        : plForm(l.limit, 'marki', 'marek', 'marek');
  return `${czas} ${n} z ${l.limit} ${z}`;
}

/** Cena „149 zł brutto (121,14 zł netto)” – zawsze obie kwoty (ceny z ustawień admina, przez API). */
export function opisCeny(c: CenaMarki): string {
  return `${zl(c.brutto)} brutto (${zl(c.netto)} netto)`;
}

/**
 * Czy można zacząć nową markę (te same reguły co POST /kreator-marki/marki i POST …/serie): liczba marek na koncie
 * i miesięczny limit serii. `kupDruga` = blokada znika po zakupie kolejnej marki.
 */
export function blokadaNowejMarki(stan: Pick<StanKreatoraMarki, 'dostepny' | 'limity' | 'drugaMarka' | 'wersja'>): { powod: string; kupDruga: boolean } | null {
  if (!stan.dostepny) return { powod: 'Kreator marki nie jest dostępny na tym koncie.', kupDruga: false };
  const { marki, serie } = stan.limity;
  if (marki.uzyte >= marki.limit) {
    return {
      powod: `Masz już ${marki.uzyte} ${plForm(marki.uzyte, 'markę', 'marki', 'marek')} – limit konta to ${marek(marki.limit)}. ${stan.drugaMarka.dostepna ? 'Kup kolejną markę albo usuń jedną z istniejących.' : 'Usuń jedną z istniejących, żeby zacząć nową.'}`,
      kupDruga: stan.drugaMarka.dostepna,
    };
  }
  if (serie.uzyte >= serie.limit) {
    return {
      powod: `Wykorzystano limit propozycji (${serii(serie.limit)}).${stan.wersja === 'pakiet' ? '' : ' Pakiet marki dodaje kolejne serie.'} Do tego czasu możesz zmieniać istniejące marki bez limitu.`,
      kupDruga: false,
    };
  }
  return null;
}

/** Powód blokady pliku w eksporcie – krótko na etykiecie i dłużej w opisie. */
export function opisBlokady(b: NonNullable<PlikMarki['blokada']>): { etykieta: string; opis: string } {
  switch (b) {
    case 'PAKIET_WYMAGANY':
      return { etykieta: 'w Pakiecie marki', opis: 'Ten plik jest w Pakiecie marki.' };
    case 'TMVIEW_WYMAGANY':
      return { etykieta: 'po sprawdzeniu w TMview', opis: 'Pliki do druku pobierzesz po potwierdzeniu, że sprawdzisz znak w TMview.' };
    default:
      return { etykieta: 'po opłaceniu hostingu', opis: 'W okresie próbnym projektujesz i oglądasz markę. Pliki pobierzesz po opłaceniu hostingu.' };
  }
}

export interface GrupaPlikow {
  grupa: PlikMarki['grupa'];
  nazwa: string;
  pliki: PlikMarki[];
}

/** Pliki marki w grupach w stałej kolejności (logo → ikony → kroje → stopka → social → druk); puste grupy pominięte. */
export function grupujPliki(pliki: PlikMarki[]): GrupaPlikow[] {
  return KOLEJNOSC_GRUP.map((g) => ({ grupa: g, nazwa: ETYKIETY_GRUP[g], pliki: pliki.filter((p) => p.grupa === g) })).filter((g) => g.pliki.length > 0);
}

export function liczbaPlikow(n: number): string {
  return `${n} ${plForm(n, 'plik', 'pliki', 'plików')}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Adresy (trasy panelu app/api/kreator-marki/** – proxy do API z tokenem sesji)
// ---------------------------------------------------------------------------------------------------------------

const PROXY = '/api/kreator-marki';
const e = encodeURIComponent;

export const ADRES_WGRYWANIA = `${PROXY}/wgraj`;
export const adresPliku = (markaId: string, plik: string) => `${PROXY}/marki/${e(markaId)}/pliki/${e(plik)}`;
export const adresZip = (markaId: string) => `${PROXY}/marki/${e(markaId)}/eksport.zip`;
export const adresLogo = (markaId: string, uklad: UkladLogo = 'poziomy', wariant: WariantKoloru = 'kolor', wersja?: number) =>
  `${PROXY}/marki/${e(markaId)}/logo.svg?uklad=${uklad}&wariant=${wariant}${wersja !== undefined ? `&v=${wersja}` : ''}`;
export const adresMaterialu = (markaId: string, material: MaterialKv, rozszerzenie: 'svg' | 'png' = 'svg', wersja?: string | number) =>
  `${PROXY}/marki/${e(markaId)}/material/${material}.${rozszerzenie}${wersja !== undefined ? `?v=${e(String(wersja))}` : ''}`;
export const adresNapisu = (p: { font: string; waga: number; tekst: string; rozstrzelenie: number }) =>
  `${PROXY}/napis?font=${e(p.font)}&waga=${p.waga}&tekst=${e(p.tekst)}&rozstrzelenie=${Math.round(p.rozstrzelenie)}`;
export const adresMarki = (markaId: string, krok?: KrokMarki) => `${SCIEZKA_MARKI}/${e(markaId)}${krok ? `?krok=${krok}` : ''}`;
/** Edytor strony z otwartą zakładką Motyw (tam jest sekcja „Marka”). */
export const adresStronyZMarka = (stronaId: string) => `/dashboard/kreator/${e(stronaId)}?zakladka=motyw`;

// ---------------------------------------------------------------------------------------------------------------
// Fonty (pliki z fonts-proxy API przez trasę panelu – CSP panelu: font-src 'self')
// Nazwy plików: ten sam wzór co libs/kreator/src/render/fonty.ts `plikFontu` (pilnuje test).
// ---------------------------------------------------------------------------------------------------------------

export const ZAKRESY_FONTOW_PANELU = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
} as const;

export function slugRodzinyPanelu(rodzina: string): string {
  return rodzina
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function plikFontuPanelu(rodzina: string, waga: number, zakres: keyof typeof ZAKRESY_FONTOW_PANELU = 'latin'): string {
  return `${slugRodzinyPanelu(rodzina)}-${waga}-${zakres}.woff2`;
}

/** Najbliższa waga dostępna w katalogu (pliki istnieją tylko dla wag z KATALOG_FONTOW). */
export function najblizszaWaga(rodzina: string, waga: number): number {
  const wagi = KATALOG_FONTOW.find((f) => f.rodzina === rodzina)?.wagi;
  if (!wagi?.length) return waga;
  return wagi.reduce((a, b) => (Math.abs(b - waga) < Math.abs(a - waga) ? b : a));
}

/** Reguły @font-face (latin + latin-ext) dla kroju z katalogu; spoza katalogu – pusty napis. */
export function regulyFontu(rodzina: string, waga: number): string {
  if (!KATALOG_FONTOW.some((f) => f.rodzina === rodzina)) return '';
  const w = najblizszaWaga(rodzina, waga);
  const nazwa = rodzina.replace(/[^\p{L}\p{N} -]/gu, '');
  return (Object.keys(ZAKRESY_FONTOW_PANELU) as (keyof typeof ZAKRESY_FONTOW_PANELU)[])
    .map(
      (z) =>
        `@font-face{font-family:'${nazwa}';font-style:normal;font-weight:${w};font-display:swap;src:url("${PROXY}/fonty/${plikFontuPanelu(rodzina, w, z)}") format("woff2");unicode-range:${ZAKRESY_FONTOW_PANELU[z]}}`,
    )
    .join('\n');
}

/** Stos fontu do `style.fontFamily` (podgląd kroju na liście, typografia marki). */
export function stosFontuPanelu(rodzina: string): string {
  const k = KATALOG_FONTOW.find((f) => f.rodzina === rodzina)?.kategoria;
  const zapas = k === 'szeryfowy' || k === 'ozdobny' ? 'serif' : k === 'monospace' ? 'monospace' : k === 'odreczny' ? 'cursive' : 'sans-serif';
  return `'${rodzina.replace(/[^\p{L}\p{N} -]/gu, '')}', ${zapas}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Barwy (wybierak w briefie i w „Dopasuj”)
// ---------------------------------------------------------------------------------------------------------------

export const normalizujBarwe = (h: number) => ((Math.round(h) % 360) + 360) % 360;

/** Nazwa barwy OKLCH (h) po polsku – do etykiet chipów i czytnika ekranu. */
export function nazwaBarwy(h: number): string {
  const x = normalizujBarwe(h);
  if (x < 40 || x >= 355) return 'czerwień';
  if (x < 70) return 'pomarańcz';
  if (x < 110) return 'żółć';
  if (x < 165) return 'zieleń';
  if (x < 205) return 'morski';
  if (x < 235) return 'błękit';
  if (x < 275) return 'niebieski';
  if (x < 315) return 'fiolet';
  return 'róż';
}

/** Próbka barwy (średnia jasność, wyraźne nasycenie). */
export function kolorBarwy(h: number, l = 0.64, c = 0.14): string {
  return oklchDoHex({ l, c, h: normalizujBarwe(h) });
}

/** Szybki wybór jak w makiecie – nazwa i barwa OKLCH. */
export const PRESETY_BARW: { nazwa: string; barwa: number }[] = [
  { nazwa: 'Granat', barwa: 262 },
  { nazwa: 'Morski', barwa: 190 },
  { nazwa: 'Zieleń', barwa: 145 },
  { nazwa: 'Piasek', barwa: 78 },
  { nazwa: 'Pomarańcz', barwa: 52 },
  { nazwa: 'Czerwień', barwa: 27 },
  { nazwa: 'Róż', barwa: 350 },
  { nazwa: 'Fiolet', barwa: 300 },
];

export const normalizujHex = (s: string): string | null => {
  const t = s.trim().replace(/^#?/, '#');
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t.toUpperCase() : null;
};

// ---------------------------------------------------------------------------------------------------------------
// „Dopasuj” – przekształcenia projektu (bez AI; API ocenia i zapisuje przy PUT …/projekt)
// ---------------------------------------------------------------------------------------------------------------

/** Kolory z barwy i charakteru (zawsze z wymaganym kontrastem – koloryMarki). */
export function zmienKolory(p: ProjektLogo, barwa: number, charakter: ProjektLogo['kolory']['charakter'], akcentBarwa?: number): ProjektLogo {
  return { ...p, kolory: koloryMarki(normalizujBarwe(barwa), charakter, akcentBarwa === undefined ? {} : { akcentBarwa: normalizujBarwe(akcentBarwa) }) };
}

/**
 * Własne HEX: kolor główny i akcent. Biblioteka podnosi kontrast do progu (napis 4,5:1, akcent 3:1) – zwracamy też,
 * czy kolor został skorygowany, żeby panel to powiedział zamiast po cichu zmienić wybór klienta.
 */
export function zmienKoloryHex(p: ProjektLogo, glowny: string, akcent: string): { projekt: ProjektLogo; skorygowane: { glowny: boolean; akcent: boolean } } {
  const k = koloryZHex(glowny, akcent, p.kolory.charakter);
  return {
    projekt: { ...p, kolory: k },
    skorygowane: { glowny: k.glowny.toUpperCase() !== glowny.toUpperCase(), akcent: k.akcent.toUpperCase() !== akcent.toUpperCase() },
  };
}

/** Krój napisu – waga przechodzi na najbliższą dostępną w nowym kroju. */
export function zmienKroj(p: ProjektLogo, font: string): ProjektLogo {
  return { ...p, napis: { ...p.napis, font, waga: najblizszaWaga(font, p.napis.waga) } };
}

/** Parametr rodziny sygnetu – przycięty do zakresu z katalogu. */
export function zmienParametr(p: ProjektLogo, klucz: string, wartosc: number): ProjektLogo {
  if (p.sygnet.typ !== 'biblioteka') return p;
  const def = rodzinaPoId(p.sygnet.rodzina)?.parametry.find((x) => x.klucz === klucz);
  if (!def) return p;
  const v = Math.min(def.max, Math.max(def.min, Math.round(wartosc)));
  return { ...p, sygnet: { ...p.sygnet, parametry: { ...p.sygnet.parametry, [klucz]: v } } };
}

/** Litery monogramu (1–2 obsługiwane znaki); puste = inicjały z nazwy (pole usunięte). */
export function zmienLitery(p: ProjektLogo, tekst: string): ProjektLogo {
  if (p.sygnet.typ !== 'biblioteka') return p;
  const litery = normalizujLitery(tekst, 2).join('');
  const reszta = { ...p.sygnet };
  delete reszta.litery;
  return { ...p, sygnet: litery ? { ...reszta, litery } : reszta };
}

/** „Dwa wiersze” tylko dla nazw z co najmniej dwóch słów (ta sama reguła co ocenProjekt). */
export function stylDozwolony(styl: ProjektLogo['napis']['styl'], nazwa: string): boolean {
  return styl !== 'dwa' || nazwa.trim().split(/\s+/).filter(Boolean).length >= 2;
}

/** Nazwa kierunku na karcie: rodzina z biblioteki, symbol od AI albo sam napis. */
export function nazwaKierunku(k: Pick<KierunekMarki, 'projekt' | 'zrodloZnaku'>): string {
  const s = k.projekt.sygnet;
  if (s.typ === 'biblioteka') return rodzinaPoId(s.rodzina)?.nazwa ?? 'Znak z biblioteki';
  if (s.typ === 'ai') return 'Symbol od AI';
  if (s.typ === 'wgrany') return 'Twój znak';
  return 'Sam napis';
}

/** Oznaczenie pochodzenia znaku na karcie propozycji. */
export function oznaczenieZnaku(k: Pick<KierunekMarki, 'zrodloZnaku' | 'projekt'>): string | null {
  if (k.projekt.sygnet.typ === 'brak') return null;
  if (k.zrodloZnaku === 'ai') return 'Symbol od AI – sprawdzony walidatorem';
  if (k.projekt.sygnet.typ === 'wgrany') return 'Znak z Twojego logo';
  return 'Szablon kształtu z biblioteki Verris';
}

// ---------------------------------------------------------------------------------------------------------------
// Kroki ekranu marki
// ---------------------------------------------------------------------------------------------------------------

export type KrokMarki = 'brief' | 'analiza' | 'propozycje' | 'dopasuj' | 'zasady' | 'materialy' | 'eksport';
export const KROKI_MARKI: KrokMarki[] = ['brief', 'analiza', 'propozycje', 'dopasuj', 'zasady', 'materialy', 'eksport'];

export interface OpisKroku {
  id: KrokMarki;
  nazwa: string;
  dostepny: boolean;
}

/** Kroki widoczne dla źródła marki i czy można do nich przejść (dane z WidokMarki). */
export function krokiMarki(w: Pick<WidokMarki, 'zrodlo' | 'serie' | 'marka' | 'analiza'>): OpisKroku[] {
  const jestMarka = !!w.marka;
  const sa = w.serie.length > 0;
  const nazwaPropozycji = w.zrodlo === 'odswiezenie' ? 'Kierunki' : 'Propozycje';
  const kroki: OpisKroku[] =
    w.zrodlo === 'nowa'
      ? [{ id: 'brief', nazwa: 'Brief', dostepny: true }]
      : [{ id: 'analiza', nazwa: 'Analiza', dostepny: !!w.analiza }];
  if (w.zrodlo !== 'wgrane') kroki.push({ id: 'propozycje', nazwa: nazwaPropozycji, dostepny: sa });
  if (w.zrodlo !== 'wgrane') kroki.push({ id: 'dopasuj', nazwa: 'Dopasuj', dostepny: jestMarka });
  kroki.push({ id: 'zasady', nazwa: 'Zasady marki', dostepny: jestMarka });
  kroki.push({ id: 'materialy', nazwa: 'Materiały', dostepny: jestMarka });
  kroki.push({ id: 'eksport', nazwa: 'Eksport', dostepny: jestMarka });
  return kroki;
}

/** Krok na wejściu: zadany (gdy dostępny), inaczej najdalszy sensowny etap. */
export function krokPoczatkowy(w: Pick<WidokMarki, 'zrodlo' | 'serie' | 'marka' | 'analiza'>, zadany?: string | null): KrokMarki {
  const kroki = krokiMarki(w);
  const z = kroki.find((k) => k.id === zadany && k.dostepny);
  if (z) return z.id;
  if (w.marka) return w.zrodlo === 'wgrane' ? 'materialy' : 'dopasuj';
  if (w.serie.length) return 'propozycje';
  return w.zrodlo === 'nowa' ? 'brief' : 'analiza';
}

/** Najnowsza seria danego rodzaju (API dopisuje serie na końcu). */
export function ostatniaSeria(serie: SeriaMarki[]): SeriaMarki | null {
  return serie.length ? serie[serie.length - 1]! : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Brief – walidacja w panelu (te same reguły co zod BriefMarki w API; komunikaty po polsku przy polach)
// ---------------------------------------------------------------------------------------------------------------

export type PoleBriefu = 'nazwa' | 'podpis' | 'branza' | 'opis' | 'uwagi' | 'cechy';

export function bledyBriefu(dane: unknown): Partial<Record<PoleBriefu, string>> {
  const w = BriefMarki.safeParse(dane);
  if (w.success) return {};
  const bledy: Partial<Record<PoleBriefu, string>> = {};
  const komunikaty: Record<PoleBriefu, string> = {
    nazwa: 'Wpisz nazwę do logo (do 60 znaków).',
    podpis: 'Podpis może mieć do 60 znaków.',
    branza: 'Wpisz branżę (do 80 znaków).',
    opis: 'Napisz jedno zdanie o firmie (do 240 znaków).',
    uwagi: 'Uwagi mogą mieć do 300 znaków.',
    cechy: 'Wybierz najwyżej 3 cechy.',
  };
  for (const i of w.error.issues) {
    const pole = i.path[0] as PoleBriefu;
    if (pole in komunikaty && !bledy[pole]) bledy[pole] = komunikaty[pole];
  }
  return bledy;
}

// ---------------------------------------------------------------------------------------------------------------
// Wgrywanie logo
// ---------------------------------------------------------------------------------------------------------------

export const TYPY_LOGO = ['image/svg+xml', 'application/pdf', 'image/png', 'image/jpeg'] as const;
export const AKCEPTOWANE_LOGO = '.svg,.pdf,.png,.jpg,.jpeg,image/svg+xml,application/pdf,image/png,image/jpeg';

/** Odmowa przed wysłaniem (API i tak sprawdza zawartość pliku). */
export function bladPlikuLogo(plik: { name: string; size: number; type: string }, maksMb: number): string | null {
  const nazwa = plik.name.toLowerCase();
  const rozszerzenieOk = /\.(svg|pdf|png|jpe?g)$/.test(nazwa);
  if (!rozszerzenieOk && !(TYPY_LOGO as readonly string[]).includes(plik.type)) return 'Wgraj logo w formacie SVG, PDF, PNG albo JPG.';
  if (plik.size === 0) return 'Plik jest pusty.';
  if (plik.size > maksMb * 1048576) {
    return `Plik jest za duży (${(plik.size / 1048576).toFixed(1).replace('.', ',')} MB, limit ${maksMb} MB).`;
  }
  return null;
}

/** Tekst z odpowiedzi błędu trasy panelu (JSON { message } albo tekst). */
export function komunikatBledu(tresc: unknown, domyslny: string): string {
  if (tresc && typeof tresc === 'object' && 'message' in tresc) {
    const m = (tresc as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return domyslny;
}

export type { MaterialKv };
