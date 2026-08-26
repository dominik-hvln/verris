/**
 * `M-16` — tryby wystawiania faktur poza KSeF i wynikające z nich terminy.
 *
 * DLACZEGO OSOBNY PLIK BEZ ZALEŻNOŚCI. Cała wiedza o terminach ustawowych
 * siedzi tutaj, bez Prismy, Nesta i sieci — dzięki temu strażnik ją WYKONUJE,
 * a nie czyta źródło. Ten sam powód co przy `blad-sieci.ts` (X-38)
 * i `onboarding-kroki.ts` (PANEL-01).
 *
 * CO BYŁO PRZED. `ksef.service.ts` traktował każdą niedostępność KSeF tak samo:
 * faktura zostawała w `PENDING` i była ponawiana co 10 minut. Komentarz w kodzie
 * zapewniał, że to zgodne z przepisami. Cztery różne tryby mają jednak trzy
 * różne terminy liczone od trzech różnych zdarzeń — a faktura czekająca, bo KSeF
 * padł, i faktura czekająca, bo cykl nie zdążył, miały w bazie ten sam status.
 * Bez rozróżnienia nie da się nawet stwierdzić, czy termin minął.
 *
 * ŹRÓDŁA (odczyt 2026-08-26):
 *   - ksef.podatki.gov.pl — tryb offline / niedostępność KSeF
 *   - ksiegowosc.infor.pl/ksef/7037541 — porównanie czterech trybów
 * Przepisy w tym obszarze zmieniały się kilkakrotnie. Terminy poniżej wymagają
 * potwierdzenia u księgowej przed wdrożeniem produkcyjnym — ten plik jest
 * miejscem, w którym taka korekta jest jedną zmianą, a nie polowaniem po kodzie.
 */

export type TrybWystawienia =
  /** KSeF odpowiada — normalna wysyłka, bez terminu awaryjnego. */
  | 'ONLINE'
  /** Problem po NASZEJ stronie (sieć, łącze). */
  | 'OFFLINE24'
  /** Planowane prace serwisowe KSeF, ogłoszone w BIP MF. */
  | 'NIEDOSTEPNOSC'
  /** Awaria KSeF ogłoszona w BIP MF. */
  | 'AWARIA'
  /** Awaria całkowita — sytuacje nadzwyczajne, ogłoszone w mediach. */
  | 'AWARIA_CALKOWITA'
  /**
   * NASZ ODCZYT, nie kategoria prawna: KSeF nie odpowiada, a nikt jeszcze nie
   * zaklasyfikował zdarzenia. Rozróżnienie OFFLINE24 / NIEDOSTEPNOSC / AWARIA
   * zależy od ogłoszenia w BIP MF, którego nie czytamy. Do czasu klasyfikacji
   * liczymy termin NAJKRÓTSZY z możliwych — patrz `terminPrzeslania`.
   */
  | 'NIESKLASYFIKOWANY';

export interface OpisTrybu {
  tryb: TrybWystawienia;
  etykieta: string;
  /** Ile dni roboczych na przesłanie do KSeF; `null` = brak obowiązku. */
  dniRobocze: number | null;
  /** Od jakiego zdarzenia liczy się termin. */
  odZdarzenia: 'wystawienia' | 'zakonczenia-przerwy' | 'nie-dotyczy';
  /** Czy faktura przekazywana nabywcy musi nieść kody QR. */
  wymagaKodowQr: boolean;
}

export const TRYBY: Record<TrybWystawienia, OpisTrybu> = {
  ONLINE: {
    tryb: 'ONLINE',
    etykieta: 'Online',
    dniRobocze: null,
    odZdarzenia: 'nie-dotyczy',
    wymagaKodowQr: false,
  },
  OFFLINE24: {
    tryb: 'OFFLINE24',
    etykieta: 'Offline24 — problem po naszej stronie',
    dniRobocze: 1,
    odZdarzenia: 'wystawienia',
    wymagaKodowQr: true,
  },
  NIEDOSTEPNOSC: {
    tryb: 'NIEDOSTEPNOSC',
    etykieta: 'Niedostępność — prace serwisowe KSeF',
    dniRobocze: 1,
    odZdarzenia: 'zakonczenia-przerwy',
    wymagaKodowQr: true,
  },
  AWARIA: {
    tryb: 'AWARIA',
    etykieta: 'Awaria KSeF ogłoszona w BIP MF',
    dniRobocze: 7,
    odZdarzenia: 'zakonczenia-przerwy',
    wymagaKodowQr: true,
  },
  AWARIA_CALKOWITA: {
    tryb: 'AWARIA_CALKOWITA',
    etykieta: 'Awaria całkowita',
    dniRobocze: null,
    odZdarzenia: 'nie-dotyczy',
    wymagaKodowQr: false,
  },
  NIESKLASYFIKOWANY: {
    tryb: 'NIESKLASYFIKOWANY',
    etykieta: 'KSeF nie odpowiada — do zaklasyfikowania',
    // Najkrótszy z możliwych terminów, liczony od wystawienia. Zaniżenie jest
    // bezpieczne: zaalarmujemy za wcześnie. Zawyżenie przegapiłoby termin.
    dniRobocze: 1,
    odZdarzenia: 'wystawienia',
    wymagaKodowQr: true,
  },
};

/**
 * Dzień roboczy = poniedziałek–piątek.
 *
 * ŚWIĘTA USTAWOWE NIE SĄ UWZGLĘDNIONE — i to jest świadome. Pominięcie święta
 * oznacza, że policzony termin wypada WCZEŚNIEJ niż ustawowy, więc alarm
 * odezwie się przedwcześnie. Odwrotny błąd — termin późniejszy niż faktyczny —
 * byłby przegapieniem obowiązku. Jeśli dokładny kalendarz będzie potrzebny,
 * to jest jedyne miejsce do zmiany.
 */
export function czyDzienRoboczy(d: Date): boolean {
  const dzien = d.getUTCDay();
  return dzien >= 1 && dzien <= 5;
}

export function dodajDniRobocze(od: Date, ile: number): Date {
  const wynik = new Date(od.getTime());
  let zostalo = ile;
  while (zostalo > 0) {
    wynik.setUTCDate(wynik.getUTCDate() + 1);
    if (czyDzienRoboczy(wynik)) zostalo -= 1;
  }
  // Termin upływa z końcem dnia roboczego, nie o godzinie wystawienia.
  wynik.setUTCHours(23, 59, 59, 999);
  return wynik;
}

export interface WejscieTerminu {
  tryb: TrybWystawienia;
  /** Data wystawienia faktury (pole `P_1`). */
  wystawiono: Date;
  /** Kiedy skończyła się przerwa — wymagane dla trybów liczonych od niej. */
  przerwaZakonczona?: Date | null;
}

/**
 * Zwraca moment, do którego faktura musi trafić do KSeF.
 *
 * `null` znaczy „brak obowiązku terminowego" (ONLINE, AWARIA_CALKOWITA) — nie
 * „nie wiemy". Brak wiedzy sygnalizuje `terminNieznany`, bo pomylenie tych
 * dwóch rzeczy jest dokładnie tą wadą, którą naprawiały X-35, X-39 i PANEL-01.
 */
export function terminPrzeslania(w: WejscieTerminu): Date | null {
  const opis = TRYBY[w.tryb];
  if (opis.dniRobocze == null) return null;
  if (opis.odZdarzenia === 'zakonczenia-przerwy') {
    if (!w.przerwaZakonczona) return null;
    return dodajDniRobocze(w.przerwaZakonczona, opis.dniRobocze);
  }
  return dodajDniRobocze(w.wystawiono, opis.dniRobocze);
}

/** `true` = termin istnieje, ale nie da się go policzyć z posiadanych danych. */
export function terminNieznany(w: WejscieTerminu): boolean {
  const opis = TRYBY[w.tryb];
  if (opis.dniRobocze == null) return false;
  return opis.odZdarzenia === 'zakonczenia-przerwy' && !w.przerwaZakonczona;
}

export type StanTerminu = 'brak-obowiazku' | 'nieznany' | 'w-terminie' | 'po-terminie';

export function stanTerminu(w: WejscieTerminu, teraz: Date): StanTerminu {
  if (terminNieznany(w)) return 'nieznany';
  const termin = terminPrzeslania(w);
  if (termin === null) return 'brak-obowiazku';
  return teraz.getTime() > termin.getTime() ? 'po-terminie' : 'w-terminie';
}

/** Czy fakturę wystawioną w tym trybie wolno przekazać nabywcy bez kodów QR. */
export function wymagaKodowQr(tryb: TrybWystawienia): boolean {
  return TRYBY[tryb].wymagaKodowQr;
}
