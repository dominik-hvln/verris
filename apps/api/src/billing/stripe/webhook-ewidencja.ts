/**
 * Z-05 — ewidencja zdarzeń webhooka Stripe'a.
 *
 * Cała logika decyzyjna w czystych funkcjach, bez bazy i bez Nesta. Powód jest
 * praktyczny: to jest ścieżka pieniędzy, a stan „klient zapłacił, saldo się nie
 * pojawiło" powstaje z kombinacji stanu wiersza, czasu i liczby prób. Takie
 * kombinacje da się przejechać testem tylko wtedy, gdy nie trzeba do tego
 * stawiać bazy i symulować awarii Stripe'a.
 *
 * CO BYŁO ŹLE DO 2026-08-22
 * ─────────────────────────
 * Wiersz `StripeWebhookEvent` powstawał PRZED handlerem i nie miał stanu.
 * Kolejność była taka:
 *
 *   1. create(eventId)          ← „widziałem to zdarzenie"
 *   2. handler(event)           ← księgowanie, aktywacja, mail
 *
 * Jeżeli krok 2 rzucił wyjątkiem, krok 1 zostawał. Stripe ponawiał, ponowienie
 * trafiało w unikalny indeks, kod uznawał je za duplikat i odpowiadał 200.
 * Stripe przestawał ponawiać. Klient zapłacił, saldo się nie pojawiło, a system
 * uważał zdarzenie za obsłużone — bo w istocie zapisał „widziałem", nie
 * „obsłużyłem".
 *
 * Odzysk był wyłącznie ręczny, wprost w bazie.
 *
 * CO JEST TERAZ
 * ─────────────
 * Wiersz ma stan i przechodzi przez maszynę:
 *
 *   PENDING ──sukces──▶ PROCESSED        (koniec, ponowienia to duplikaty)
 *      │
 *      └────błąd─────▶ FAILED ──ponowienie──▶ PENDING …
 *
 * `PENDING` znaczy „zajęte, handler w trakcie", nie „obsłużone". Dopiero
 * `PROCESSED` odrzuca ponowienia.
 *
 * DZIERŻAWA — przypadek, o którym najłatwiej zapomnieć
 * ────────────────────────────────────────────────────
 * Jeżeli proces API zostanie ubity MIĘDZY zajęciem a zakończeniem (wdrożenie,
 * OOM, restart węzła), wiersz zostaje w `PENDING` i bez dodatkowej reguły nie
 * wróciłby już nigdy — ta sama pułapka co poprzednio, tylko pod inną nazwą.
 * Dlatego `PENDING` starszy niż dzierżawa jest traktowany jak porzucony
 * i może zostać przejęty.
 */

/** Po tym czasie `PENDING` uznajemy za porzucony przez martwy proces. */
export const DZIERZAWA_MS = 5 * 60 * 1000;

/**
 * Odstępy kolejnych ponowień, w minutach, wg numeru próby.
 * Pierwsze szybko (przejściowy timeout bazy naprawia się sam), potem rzadziej.
 * Ostatnia wartość obowiązuje dla wszystkich dalszych prób.
 */
export const ODSTEPY_PONOWIEN_MIN = [1, 5, 15, 60] as const;

/** Po tylu nieudanych próbach zdarzenie budzi adminów. */
export const PROG_ALERTU_PROB = 3;

/** …albo po tylu milisekundach od pierwszego wpisu, cokolwiek nastąpi pierwsze. */
export const PROG_ALERTU_MS = 15 * 60 * 1000;

/** Ponowny alert o tym samym zdarzeniu nie częściej niż raz na tyle. */
export const ODSTEP_PONOWNEGO_ALERTU_MS = 6 * 60 * 60 * 1000;

/** Treść zdarzenia kasujemy po tylu dniach od przetworzenia. */
export const DNI_PRZECHOWANIA_TRESCI = 90;

export type StanZdarzenia = 'PENDING' | 'PROCESSED' | 'FAILED';

export interface WierszZdarzenia {
  status: StanZdarzenia;
  /** Kiedy wystartowała bieżąca próba. `null` dla wiersza, który nigdy nie ruszył. */
  claimedAt: Date | null;
  attempts: number;
}

export type Decyzja =
  /** Wiersza nie ma — zakładamy i przetwarzamy. */
  | { rodzaj: 'przetwarzaj' }
  /** Zdarzenie już przetworzone — to prawdziwy duplikat, odpowiadamy 200. */
  | { rodzaj: 'duplikat' }
  /** Poprzednia próba padła albo została porzucona — przejmujemy i przetwarzamy. */
  | { rodzaj: 'przejmij'; powod: 'poprzednia-proba-nieudana' | 'dzierzawa-wygasla' }
  /**
   * Inna dostawa tego samego zdarzenia jest właśnie obsługiwana.
   * NIE wolno odpowiedzieć 200 — Stripe uznałby zdarzenie za dostarczone,
   * a druga dostawa może przecież paść.
   */
  | { rodzaj: 'wTrakcie' };

/**
 * Co zrobić z zdarzeniem, którego wiersz już istnieje.
 *
 * @param wiersz  stan z bazy, albo `null` gdy wiersza nie ma
 * @param teraz   czas odniesienia (wstrzykiwany, żeby test nie zależał od zegara)
 */
export function decyzja(wiersz: WierszZdarzenia | null, teraz: Date): Decyzja {
  if (!wiersz) return { rodzaj: 'przetwarzaj' };

  switch (wiersz.status) {
    case 'PROCESSED':
      return { rodzaj: 'duplikat' };

    case 'FAILED':
      return { rodzaj: 'przejmij', powod: 'poprzednia-proba-nieudana' };

    case 'PENDING': {
      const start = wiersz.claimedAt?.getTime() ?? 0;
      const wiek = teraz.getTime() - start;
      return wiek >= DZIERZAWA_MS
        ? { rodzaj: 'przejmij', powod: 'dzierzawa-wygasla' }
        : { rodzaj: 'wTrakcie' };
    }
  }
}

/** Kiedy najwcześniej ponowić po nieudanej próbie numer `proba` (licząc od 1). */
export function nastepnaProba(proba: number, teraz: Date): Date {
  const i = Math.min(Math.max(proba, 1), ODSTEPY_PONOWIEN_MIN.length) - 1;
  return new Date(teraz.getTime() + ODSTEPY_PONOWIEN_MIN[i] * 60 * 1000);
}

export interface StanAlertu {
  status: StanZdarzenia;
  attempts: number;
  /** Kiedy zdarzenie wpłynęło po raz pierwszy. */
  createdAt: Date;
  /** Kiedy ostatnio o nim alarmowaliśmy. */
  alertedAt: Date | null;
}

/**
 * Czy zdarzenie ma obudzić adminów.
 *
 * Dwa progi naraz, bo pokrywają dwa różne kształty awarii: „handler wywala się
 * natychmiast, trzy razy pod rząd" (próg prób) i „handler wisi na timeoucie,
 * więc prób jest mało, ale mija czas" (próg czasu). Alarm tylko na jednym
 * z nich przespałby ten drugi.
 */
export function czyAlarmowac(s: StanAlertu, teraz: Date): boolean {
  if (s.status === 'PROCESSED') return false;
  if (s.alertedAt && teraz.getTime() - s.alertedAt.getTime() < ODSTEP_PONOWNEGO_ALERTU_MS) {
    return false;
  }
  const dosycProb = s.attempts >= PROG_ALERTU_PROB;
  const dosycCzasu = teraz.getTime() - s.createdAt.getTime() >= PROG_ALERTU_MS;
  return dosycProb || dosycCzasu;
}

/** Granica czasu, przed którą treść przetworzonych zdarzeń podlega skasowaniu. */
export function granicaCzyszczeniaTresci(teraz: Date): Date {
  return new Date(teraz.getTime() - DNI_PRZECHOWANIA_TRESCI * 24 * 60 * 60 * 1000);
}

/** Wiersze, które scheduler ma podjąć w tym przebiegu. */
export interface KryteriaPodjecia {
  nieudaneDo: Date;
  porzuconePrzed: Date;
}

export function kryteriaPodjecia(teraz: Date): KryteriaPodjecia {
  return {
    nieudaneDo: teraz,
    porzuconePrzed: new Date(teraz.getTime() - DZIERZAWA_MS),
  };
}
