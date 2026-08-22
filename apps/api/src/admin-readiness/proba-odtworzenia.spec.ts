import { readFileSync } from 'fs';
import { join } from 'path';
import {
  brakujaceWiersze,
  MAKS_WIEK_PROBY_DNI,
  MINIMALNE_WIERSZE,
  ocenProby,
  odtworzenieMaDane,
  PRZYPOMNIENIE_PRZED_DNI,
  type ProbaOdtworzenia,
} from './proba-odtworzenia';

/**
 * H-20 — czy warstwa DR jest potwierdzona.
 *
 * „Mamy skrypt" i „potrafimy odtworzyć bazę" to dwa różne zdania, a odróżnia je
 * wyłącznie fakt, że ktoś ten skrypt kiedyś uruchomił i zapisał wynik. Te testy
 * pilnują drugiego zdania.
 */

const TERAZ = new Date('2026-08-22T12:00:00.000Z');
const dniTemu = (n: number) => new Date(TERAZ.getTime() - n * 86_400_000);

function proba(over: Partial<ProbaOdtworzenia> = {}): ProbaOdtworzenia {
  return {
    finishedAt: dniTemu(3),
    result: 'OK',
    owner: 'dominik@hvln.pl',
    durationSec: 214,
    objectName: 'verris-2026-08-19-0300.sql.gz',
    rowCounts: { User: 42, Plan: 3 },
    ...over,
  };
}

describe('H-20 — ocena próby odtworzenia', () => {
  it('brak jakiejkolwiek próby BLOKUJE start', () => {
    const o = ocenProby(null, null, TERAZ);
    expect(o.stan).toBe('brak');
    expect(o.blokuje).toBe(true);
    expect(o.komunikat).toMatch(/założenie, nie zabezpieczenie/);
  });

  it('świeża udana próba przechodzi', () => {
    const p = proba();
    const o = ocenProby(p, p, TERAZ);
    expect(o.stan).toBe('aktualna');
    expect(o.blokuje).toBe(false);
    expect(o.wiekDni).toBe(3);
  });

  it('komunikat udanej próby zawiera właściciela i czas trwania', () => {
    // Bez tych dwóch rzeczy zapis nie spełnia D4, a komunikat na pulpicie nie
    // pozwala nikogo zapytać, co dokładnie sprawdzał.
    const p = proba();
    const o = ocenProby(p, p, TERAZ);
    expect(o.komunikat).toContain('dominik@hvln.pl');
    expect(o.komunikat).toContain('214');
  });

  it('próba po terminie BLOKUJE start', () => {
    const p = proba({ finishedAt: dniTemu(MAKS_WIEK_PROBY_DNI + 1) });
    const o = ocenProby(p, p, TERAZ);
    expect(o.stan).toBe('przeterminowana');
    expect(o.blokuje).toBe(true);
    expect(o.dniDoTerminu).toBeLessThan(0);
  });

  it('dokładnie w dniu terminu jeszcze przechodzi', () => {
    // Granica musi być jednoznaczna. „Około miesiąca" nie jest bramką.
    const p = proba({ finishedAt: dniTemu(MAKS_WIEK_PROBY_DNI) });
    expect(ocenProby(p, p, TERAZ).blokuje).toBe(false);
    const q = proba({ finishedAt: dniTemu(MAKS_WIEK_PROBY_DNI + 1) });
    expect(ocenProby(q, q, TERAZ).blokuje).toBe(true);
  });

  it('przypomina przed terminem, ale nie blokuje', () => {
    const p = proba({ finishedAt: dniTemu(MAKS_WIEK_PROBY_DNI - PRZYPOMNIENIE_PRZED_DNI) });
    const o = ocenProby(p, p, TERAZ);
    expect(o.stan).toBe('wkrotce');
    expect(o.blokuje).toBe(false);
    expect(o.komunikat).toMatch(/Termin ważności upływa/);
  });

  it('NIEUDANA ostatnia próba blokuje, choćby wcześniejsza się powiodła', () => {
    // To jest przypadek, którego nie pokazałaby sama „ostatnia udana": wczoraj
    // odtworzenie padło, a miesiąc temu przeszło. Patrzenie tylko na udane
    // powiedziałoby „wszystko w porządku".
    const udana = proba({ finishedAt: dniTemu(20) });
    const nieudana = proba({ finishedAt: dniTemu(1), result: 'FAILED', notes: 'brak dumpa' });
    const o = ocenProby(nieudana, udana, TERAZ);
    expect(o.stan).toBe('nieudana');
    expect(o.blokuje).toBe(true);
    expect(o.komunikat).toContain('brak dumpa');
  });

  it('każdy stan ma jednoznaczne rozstrzygnięcie blokowania', () => {
    const przypadki: Array<[ProbaOdtworzenia | null, boolean]> = [
      [null, true],
      [proba(), false],
      [proba({ finishedAt: dniTemu(60) }), true],
      [proba({ result: 'FAILED' }), true],
      [proba({ finishedAt: dniTemu(MAKS_WIEK_PROBY_DNI - 1) }), false],
    ];
    for (const [p, oczekiwane] of przypadki) {
      expect(ocenProby(p, p, TERAZ).blokuje).toBe(oczekiwane);
    }
  });
});

describe('H-20 — progi wierszy po odtworzeniu', () => {
  it('pełny raport przechodzi', () => {
    expect(odtworzenieMaDane({ User: 42, Plan: 3, Subscription: 0, Invoice: 0, Account: 0 })).toBe(
      true,
    );
  });

  it('PUSTA baza NIE przechodzi — a to był stary wynik „OK"', () => {
    // Sedno poprawki: `psql` kończy się zerem także wtedy, gdy wgrał pusty
    // plik. Skrypt liczył wiersze i tylko je logował, więc odtworzenie
    // niczego meldowało „RESTORE DRILL OK".
    const braki = brakujaceWiersze({ User: 0, Plan: 0, Subscription: 0, Invoice: 0, Account: 0 });
    expect(braki.map((b) => b.tabela).sort()).toEqual(['Plan', 'User']);
    expect(odtworzenieMaDane({ User: 0, Plan: 0 })).toBe(false);
  });

  it('brak liczby traktujemy jak brak dowodu, nie jak zero', () => {
    // Wszystkie tabele obecne poza jedną — brak liczby dla `Plan` ma być
    // zgłoszony jako `-1`, czyli „nie wiemy", a nie pominięty.
    const braki = brakujaceWiersze({
      User: 42,
      Plan: undefined,
      Subscription: 5,
      Invoice: 7,
      Account: 3,
    });
    expect(braki).toHaveLength(1);
    expect(braki[0].tabela).toBe('Plan');
    expect(braki[0].znalezione).toBe(-1);
  });

  it('raport pomijający tabelę też jest brakiem dowodu', () => {
    // Tabela nieobecna w raporcie i tabela z zerem to dwie różne rzeczy, ale
    // w obu przypadkach nie mamy dowodu, że dane są.
    expect(brakujaceWiersze({ User: 42 }).map((b) => b.tabela).sort()).toEqual([
      'Account',
      'Invoice',
      'Plan',
      'Subscription',
    ]);
  });

  it('sprawdza więcej niż jedną tabelę', () => {
    // Sam „User" nie powie nic o tym, czy przetrwały faktury i subskrypcje —
    // a to one bolą przy utracie.
    expect(Object.keys(MINIMALNE_WIERSZE).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(MINIMALNE_WIERSZE)).toEqual(
      expect.arrayContaining(['User', 'Plan', 'Invoice', 'Subscription']),
    );
  });
});

describe('H-20 — skrypt drilla asertuje i zostawia ślad', () => {
  const SKRYPT = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'ops',
    'scripts',
    'restore-drill-isolated.sh',
  );
  const tresc = readFileSync(SKRYPT, 'utf8');
  /** Kod bez komentarzy — po raz szósty ta sama lekcja. */
  const kod = tresc
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

  it('strażnik czyta właściwy plik', () => {
    // Sprawdzamy KOD, nie prozę — komentarze są wycięte, więc szukanie frazy
    // z nagłówka pliku dałoby wieczną czerwień. Szósty raz ta sama lekcja.
    expect(kod).toContain('DRILL_DB');
    expect(kod).toContain('RESTORE DRILL OK');
    expect(kod.length).toBeGreaterThan(1000);
  });

  it('zapisuje ślad wykonania do bazy produkcyjnej', () => {
    expect(kod).toContain('INSERT INTO "RestoreDrill"');
    expect(kod).toContain('zapisz_probe');
  });

  it('zapisuje ślad RÓWNIEŻ przy niepowodzeniu', () => {
    // Brak wpisu nie może znaczyć jednocześnie „nigdy nie było" i „padło".
    expect(kod).toMatch(/zapisz_probe\s+"FAILED"/);
    expect(kod).toContain('trap');
  });

  it('przerywa, gdy odtworzona baza nie ma danych', () => {
    // Wcześniej liczba wierszy szła wyłącznie do logu. Tu sprawdzamy, że jest
    // użyta do decyzji, a nie tylko wypisana.
    expect(kod).toContain('MIN_ROWS');
    expect(kod).toMatch(/if \[\[ -n "\$MISSING" \]\]/);
    expect(kod).toMatch(/fail "RESTORE DRILL NIEUDANY/);
  });

  it('mierzy czas trwania — to jest realne RTO', () => {
    expect(kod).toContain('STARTED_EPOCH');
    expect(kod).toContain('durationSec');
  });

  it('wymaga właściciela próby', () => {
    // D4 to data, wynik I WŁAŚCICIEL. Sama data nie pozwala nikogo zapytać,
    // co dokładnie sprawdzał.
    expect(kod).toContain('DRILL_OWNER');
    expect(kod).toContain('--owner');
  });

  it('nie dotyka bazy produkcyjnej przy odtwarzaniu', () => {
    expect(kod).toContain('DRILL_DB must differ from POSTGRES_DB');
  });
});
