/**
 * W6 (3.11.2026, decyzja 12) — model drzew bez bazy: jednostki, przeliczenia, ustawienia, przydział FIFO.
 *
 * Wszystko w liczbach całkowitych:
 * - udział w drzewie w „częściach” — 1 część = 1/10 000 drzewa (setna procenta), drzewo = {@link CZESCI_DRZEWA};
 * - kwoty w groszach;
 * - stawka wkładu: ile części drzewa daje każde 100 zł netto opłaconej usługi.
 *
 * Drzewo jest „posadzone” dopiero, gdy API partnera zwróci certyfikat — liczniki biorą tylko zamówienia POSADZONE
 * ze środowiska produkcyjnego (drzewa z API testowego nie istnieją naprawdę).
 */

export const CZESCI_DRZEWA = 10_000;
export const CZESCI_PROCENTU = 100;
/** Decyzja 12: koszt drzewa ≤ 20 zł. */
export const MAKS_KOSZT_DRZEWA_GROSZE = 2_000;
const STAWKA_VAT_PL = 23;

/** Klucze w `platform_settings` (prefiks eco.drzewa.*). Token API NIE jest w panelu — tylko env (prod-ustaw-klucze.sh). */
export const KLUCZE_DRZEW = {
  WLACZONE: 'eco.drzewa.wlaczone',
  SRODOWISKO: 'eco.drzewa.srodowisko',
  KOSZT_DRZEWA_GROSZE: 'eco.drzewa.kosztDrzewaGrosze',
  WKLAD_NA_100_ZL_NETTO: 'eco.drzewa.wkladNa100ZlNetto',
  ID_SADZENIA: 'eco.drzewa.idSadzenia',
  KREDYTY_NA_DRZEWO: 'eco.drzewa.kredytyNaDrzewo',
  MAKS_DRZEW_NA_ZAMOWIENIE: 'eco.drzewa.maksDrzewNaZamowienie',
} as const;

/**
 * Decyzja 17 (4.11.2026) — certyfikaty partnera wyłącznie na Verris, także przy „własnym drzewie” klienta:
 * do API sadzenia nie wysyłamy żadnych danych klientów (partner nie jest odbiorcą danych osobowych).
 * Klient widzi swoje certyfikaty w panelu (przypisanie trzymamy u siebie).
 */
export const CERTYFIKAT_VERRIS = {
  customerName: 'Verris',
  certificateText: 'Drzewo posadzone dzięki klientom Verris',
} as const;
/** Istniejące ustawienie platformy (PLATFORM_SETTING_KEYS.ECO_POINTS_PER_TREE) — punkty EKO za 100% drzewa. */
export const KLUCZ_PUNKTY_NA_DRZEWO = 'eco.pointsPerTree';
/** Decyzja 16 (4.11.2026): 300 pkt = 1 drzewo (1% drzewa = 3 pkt). */
export const DOMYSLNE_PUNKTY_NA_DRZEWO = 300;

export type SrodowiskoDrzew = 'produkcja' | 'test';

export interface UstawieniaDrzew {
  /** Harmonogram sadzi (wkłady naliczają się zawsze). */
  wlaczone: boolean;
  srodowisko: SrodowiskoDrzew;
  kosztDrzewaGrosze: number;
  /** Części drzewa (1/10 000) za każde 100 zł netto opłaconej usługi; 0 = bez automatycznego wkładu. */
  wkladNa100ZlNetto: number;
  /** treeGroupID — „ID sadzenia” z panelu partnera. */
  idSadzenia: string;
  /** Ile kredytów API partnera kosztuje jedno drzewo (dokumentacja tego nie podaje — ustawiane po teście). */
  kredytyNaDrzewo: number;
  maksDrzewNaZamowienie: number;
  /** Punkty EKO za 100% drzewa (wymiana punktów). */
  punktyNaDrzewo: number;
}

/**
 * Domyślna stawka (decyzja 16: 1,92% drzewa na 100 zł netto zapłacone pieniędzmi): hosting roczny 449 zł brutto = 365,04 zł netto → ⌊36504 × 192 / 10 000⌋ = 700 części = 7,00% drzewa;
 * miesięczny 45 zł brutto = 36,59 zł netto → 70 części = 0,70%.
 */
export const DOMYSLNE_USTAWIENIA_DRZEW: UstawieniaDrzew = {
  wlaczone: false,
  srodowisko: 'test',
  kosztDrzewaGrosze: MAKS_KOSZT_DRZEWA_GROSZE,
  wkladNa100ZlNetto: 192,
  idSadzenia: '',
  kredytyNaDrzewo: 1,
  maksDrzewNaZamowienie: 10,
  punktyNaDrzewo: DOMYSLNE_PUNKTY_NA_DRZEWO,
};

export const ZAKRESY_DRZEW = {
  kosztDrzewaGrosze: [1, MAKS_KOSZT_DRZEWA_GROSZE],
  wkladNa100ZlNetto: [0, 2_000],
  kredytyNaDrzewo: [1, 1_000],
  maksDrzewNaZamowienie: [1, 100],
  punktyNaDrzewo: [1, 1_000_000],
} as const;

function liczba(v: string | undefined, dom: number, [min, max]: readonly [number, number]): number {
  if (v === undefined || !/^-?\d+$/.test(v.trim())) return dom;
  const n = Number(v.trim());
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : dom;
}

/** Odczyt ustawień z mapy klucz → wartość (wartość spoza zakresu = domyślna, nigdy ponad 20 zł za drzewo). */
export function odczytajUstawieniaDrzew(map: Map<string, string>): UstawieniaDrzew {
  const d = DOMYSLNE_USTAWIENIA_DRZEW;
  return {
    wlaczone: map.get(KLUCZE_DRZEW.WLACZONE) === '1',
    srodowisko: map.get(KLUCZE_DRZEW.SRODOWISKO) === 'produkcja' ? 'produkcja' : 'test',
    kosztDrzewaGrosze: liczba(map.get(KLUCZE_DRZEW.KOSZT_DRZEWA_GROSZE), d.kosztDrzewaGrosze, ZAKRESY_DRZEW.kosztDrzewaGrosze),
    wkladNa100ZlNetto: liczba(map.get(KLUCZE_DRZEW.WKLAD_NA_100_ZL_NETTO), d.wkladNa100ZlNetto, ZAKRESY_DRZEW.wkladNa100ZlNetto),
    idSadzenia: (map.get(KLUCZE_DRZEW.ID_SADZENIA) ?? '').trim(),
    kredytyNaDrzewo: liczba(map.get(KLUCZE_DRZEW.KREDYTY_NA_DRZEWO), d.kredytyNaDrzewo, ZAKRESY_DRZEW.kredytyNaDrzewo),
    maksDrzewNaZamowienie: liczba(
      map.get(KLUCZE_DRZEW.MAKS_DRZEW_NA_ZAMOWIENIE),
      d.maksDrzewNaZamowienie,
      ZAKRESY_DRZEW.maksDrzewNaZamowienie,
    ),
    punktyNaDrzewo: liczba(map.get(KLUCZ_PUNKTY_NA_DRZEWO), d.punktyNaDrzewo, ZAKRESY_DRZEW.punktyNaDrzewo),
  };
}

/** Kwota (string/Decimal z bazy, zł z groszami) → grosze, bez arytmetyki zmiennoprzecinkowej na kwotach. */
export function groszeZKwoty(kwota: string | number | { toString(): string }): number {
  const s = String(kwota).trim();
  const m = s.match(/^(-?)(\d+)(?:\.(\d{1,}))?$/);
  if (!m) return 0;
  const ulamek = (m[3] ?? '').padEnd(2, '0');
  // Zaokrąglenie do grosza połowa w górę (Decimal(10,2) z bazy ma zawsze ≤ 2 miejsca, to tylko zabezpieczenie).
  let grosze = Number(m[2]) * 100 + Number(ulamek.slice(0, 2));
  if (ulamek.length > 2 && Number(ulamek[2]) >= 5) grosze += 1;
  return m[1] === '-' ? -grosze : grosze;
}

/** Netto z brutto (23% VAT), w groszach, zaokrąglenie połowa w górę — jak `rozbicieWgStawki`. */
export function nettoZBruttoGrosze(bruttoGrosze: number, stawkaVat = STAWKA_VAT_PL): number {
  if (bruttoGrosze <= 0) return 0;
  const licznik = bruttoGrosze * 100;
  const mianownik = 100 + stawkaVat;
  return Math.floor((2 * licznik + mianownik) / (2 * mianownik));
}

/** Wkład opłaconej usługi w częściach drzewa: ⌊netto[gr] × stawka / 10 000⌋ (stawka = części na 100 zł netto). */
export function wkladZUslugiCzesci(nettoGrosze: number, wkladNa100ZlNetto: number): number {
  if (nettoGrosze <= 0 || wkladNa100ZlNetto <= 0) return 0;
  return Math.floor((nettoGrosze * wkladNa100ZlNetto) / 10_000);
}

/** Wymiana punktów na procent drzewa do puli: koszt w punktach = ⌈procent × punktyNaDrzewo / 100⌉. */
export function punktyZaProcent(procent: number, punktyNaDrzewo: number): number {
  return Math.ceil((procent * punktyNaDrzewo) / 100);
}

/** Koszt wkładu w groszach (do raportów): części × koszt drzewa / 10 000, w górę do grosza. */
export function kosztCzesciGrosze(czesci: number, kosztDrzewaGrosze: number): number {
  return Math.ceil((czesci * kosztDrzewaGrosze) / CZESCI_DRZEWA);
}

/** „7,00%” — części jako procent drzewa. */
export function procentDrzewa(czesci: number): string {
  const c = Math.max(0, Math.floor(czesci));
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}%`;
}

function odmiana(n: number, jeden: string, kilka: string, wiele: string): string {
  if (n === 1) return jeden;
  const d = n % 10;
  const s = n % 100;
  return d >= 2 && d <= 4 && (s < 12 || s > 14) ? kilka : wiele;
}

/**
 * Liczba posadzonych drzew słownie do odznaki: „1 posadzone drzewo”, „3 posadzone drzewa”, „12 posadzonych drzew”,
 * a przy ułamku (udział w drzewach zbiorczych) „1,07 posadzonego drzewa” — ułamek obcinamy do setnych, nie zaokrąglamy w górę.
 */
export function opisPosadzonychDrzew(czesci: number): string {
  const setne = Math.floor(Math.max(0, czesci) / 100);
  const cale = Math.floor(setne / 100);
  const reszta = setne % 100;
  if (reszta === 0) return `${cale} ${odmiana(cale, 'posadzone drzewo', 'posadzone drzewa', 'posadzonych drzew')}`;
  return `${cale},${String(reszta).padStart(2, '0')} posadzonego drzewa`;
}

/** Odstęp do ponowienia po odrzuceniu przez API: 1 h, 2 h, 4 h … maks. 24 h. */
export function odstepPonowieniaMs(proby: number): number {
  const godz = Math.min(24, 2 ** Math.max(0, proby - 1));
  return godz * 3_600_000;
}

export interface WkladDoPrzydzialu {
  id: string;
  czesci: number;
}

export interface PlanPrzydzialu {
  /** Wkłady przydzielane w całości. */
  cale: string[];
  /** Wkład na granicy drzewa: `przydzielone` zostaje w wierszu, `reszta` przechodzi do nowego wiersza w puli. */
  podzial: { id: string; przydzielone: number; reszta: number } | null;
}

/**
 * Przydział FIFO wkładów (już posortowanych od najstarszego) do zamówienia na `cel` części (wielokrotność drzewa).
 * Rzuca, gdy w puli jest mniej niż `cel` — wołający sprawdza sumę wcześniej.
 */
export function planujPrzydzial(wklady: WkladDoPrzydzialu[], cel: number): PlanPrzydzialu {
  const cale: string[] = [];
  let suma = 0;
  for (const w of wklady) {
    if (suma === cel) break;
    if (suma + w.czesci <= cel) {
      cale.push(w.id);
      suma += w.czesci;
      continue;
    }
    const przydzielone = cel - suma;
    return { cale, podzial: { id: w.id, przydzielone, reszta: w.czesci - przydzielone } };
  }
  if (suma !== cel) throw new Error(`W puli brakuje części: ${suma} z ${cel}.`);
  return { cale, podzial: null };
}
