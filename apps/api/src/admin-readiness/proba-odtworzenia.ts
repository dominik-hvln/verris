/**
 * H-20 — kiedy próba odtworzenia z kopii jest jeszcze dowodem.
 *
 * CO BYŁO
 * ───────
 * `ops/scripts/restore-drill-isolated.sh` istniał jako procedura ręczna.
 * Runbook wymagał wykonania drilla przed startem sprzedaży. W repozytorium nie
 * było ŻADNEGO śladu, że kiedykolwiek się odbył.
 *
 * Reguła audytu jest w tej sprawie jednoznaczna: backupy i DR wymagają poziomu
 * D4 — data, wynik, właściciel. Procedura bez zapisu wykonania nie liczy się
 * wcale, bo „mamy skrypt" i „potrafimy odtworzyć bazę" to dwa różne zdania,
 * a odróżnia je wyłącznie fakt, że ktoś ten skrypt kiedyś uruchomił.
 *
 * DRUGA RZECZ, RÓWNIE WAŻNA
 * ─────────────────────────
 * Dowód się starzeje. Odtworzenie sprzed roku nie mówi nic o kopii zrobionej
 * wczoraj — schemat się zmienił, migracje doszły, format dumpa mógł się
 * zmienić razem z wersją Postgresa. Dlatego próba ma termin ważności, a jego
 * upływ jest twardą bramką go-live, nie ostrzeżeniem.
 *
 * Ostrzeżenie zamiast bramki to dokładnie ten mechanizm, który macierz wytknęła
 * przy H-19 („ostrzeżenie nie blokuje go-live — dodać twardą bramkę") i który
 * naprawiałem w X-23 przy jobie bezpieczeństwa. Trzeci raz w tym projekcie.
 */

/** Po tylu dniach próba przestaje być dowodem i staje się wspomnieniem. */
export const MAKS_WIEK_PROBY_DNI = 30;

/** Na tyle dni przed terminem zaczynamy przypominać, zamiast alarmować. */
export const PRZYPOMNIENIE_PRZED_DNI = 7;

/**
 * Minimalne liczby wierszy w tabelach kontrolnych.
 *
 * `psql` kończy się kodem zero także wtedy, gdy wgrał pusty plik — a wtedy
 * „odtworzenie się powiodło" znaczy „mamy pustą bazę". Dlatego liczby, a nie
 * kod wyjścia.
 *
 * Progi są celowo minimalne: chodzi o odróżnienie „są dane" od „nie ma nic",
 * nie o pilnowanie wielkości bazy. Próg równy realnej liczbie kont zacząłby
 * czerwienić się przy pierwszym usunięciu konta.
 */
export const MINIMALNE_WIERSZE: Readonly<Record<string, number>> = {
  User: 1,
  Plan: 1,
  Subscription: 0,
  Invoice: 0,
  Account: 0,
};

export type StanProby = 'brak' | 'nieudana' | 'przeterminowana' | 'wkrotce' | 'aktualna';

export interface ProbaOdtworzenia {
  finishedAt: Date;
  result: 'OK' | 'FAILED';
  owner: string;
  durationSec: number;
  objectName: string;
  rowCounts: unknown;
  notes?: string | null;
}

export interface OcenaProby {
  stan: StanProby;
  /** Wiek ostatniej UDANEJ próby w dniach. `null`, gdy takiej nie było. */
  wiekDni: number | null;
  /** Ile dni zostało do utraty ważności. Ujemne = po terminie. */
  dniDoTerminu: number | null;
  /** Czy to blokuje start sprzedaży. */
  blokuje: boolean;
  komunikat: string;
}

function dni(od: Date, do_: Date): number {
  return Math.floor((do_.getTime() - od.getTime()) / 86_400_000);
}

/**
 * Ocena stanu na podstawie ostatnich prób.
 *
 * Bierzemy ostatnią próbę W OGÓLE i ostatnią UDANĄ, bo to dwie różne
 * informacje. Sama ostatnia udana nie pokazałaby, że wczorajsza próba padła —
 * a to jest dokładnie ten sygnał, po którym trzeba działać natychmiast.
 */
export function ocenProby(
  ostatnia: ProbaOdtworzenia | null,
  ostatniaUdana: ProbaOdtworzenia | null,
  teraz: Date,
): OcenaProby {
  if (!ostatnia) {
    return {
      stan: 'brak',
      wiekDni: null,
      dniDoTerminu: null,
      blokuje: true,
      komunikat:
        'Nigdy nie wykonano próby odtworzenia z kopii. Backupy bez potwierdzonego ' +
        'odtworzenia to założenie, nie zabezpieczenie.',
    };
  }

  if (ostatnia.result === 'FAILED') {
    const wiek = dni(ostatnia.finishedAt, teraz);
    return {
      stan: 'nieudana',
      wiekDni: ostatniaUdana ? dni(ostatniaUdana.finishedAt, teraz) : null,
      dniDoTerminu: null,
      blokuje: true,
      komunikat:
        `Ostatnia próba odtworzenia (${wiek} dni temu) ZAKOŃCZYŁA SIĘ BŁĘDEM. ` +
        (ostatnia.notes ? `Powód: ${ostatnia.notes}. ` : '') +
        'Dopóki nie przejdzie, warstwa DR jest niepotwierdzona.',
    };
  }

  const wiek = dni(ostatnia.finishedAt, teraz);
  const doTerminu = MAKS_WIEK_PROBY_DNI - wiek;

  if (doTerminu < 0) {
    return {
      stan: 'przeterminowana',
      wiekDni: wiek,
      dniDoTerminu: doTerminu,
      blokuje: true,
      komunikat:
        `Ostatnia udana próba odtworzenia ma ${wiek} dni — termin ważności to ` +
        `${MAKS_WIEK_PROBY_DNI} dni. Odtworzenie sprzed schematu, którego już nie ma, ` +
        'nie dowodzi niczego o dzisiejszej kopii.',
    };
  }

  if (doTerminu <= PRZYPOMNIENIE_PRZED_DNI) {
    return {
      stan: 'wkrotce',
      wiekDni: wiek,
      dniDoTerminu: doTerminu,
      blokuje: false,
      komunikat:
        `Udana próba sprzed ${wiek} dni. Termin ważności upływa za ${doTerminu} ` +
        `${doTerminu === 1 ? 'dzień' : 'dni'} — zaplanuj kolejną.`,
    };
  }

  return {
    stan: 'aktualna',
    wiekDni: wiek,
    dniDoTerminu: doTerminu,
    blokuje: false,
    komunikat:
      `Udana próba sprzed ${wiek} ${wiek === 1 ? 'dnia' : 'dni'} ` +
      `(${ostatnia.objectName}, ${ostatnia.durationSec} s, ${ostatnia.owner}).`,
  };
}

export interface BrakiWierszy {
  tabela: string;
  wymagane: number;
  znalezione: number;
}

/**
 * Które tabele kontrolne nie mają minimum wierszy.
 *
 * Zwraca też tabele NIEOBECNE w raporcie — brak liczby to nie to samo co zero,
 * ale w obu przypadkach nie mamy dowodu, że dane są.
 */
export function brakujaceWiersze(
  policzone: Record<string, number | null | undefined>,
): BrakiWierszy[] {
  const braki: BrakiWierszy[] = [];
  for (const [tabela, wymagane] of Object.entries(MINIMALNE_WIERSZE)) {
    const znalezione = policzone[tabela];
    if (typeof znalezione !== 'number' || Number.isNaN(znalezione)) {
      braki.push({ tabela, wymagane, znalezione: -1 });
    } else if (znalezione < wymagane) {
      braki.push({ tabela, wymagane, znalezione });
    }
  }
  return braki;
}

/** Czy raport z odtworzenia dowodzi, że baza nie jest pusta. */
export function odtworzenieMaDane(policzone: Record<string, number | null | undefined>): boolean {
  return brakujaceWiersze(policzone).length === 0;
}
