import {
  dodajDniRobocze,
  czyDzienRoboczy,
  stanTerminu,
  terminNieznany,
  terminPrzeslania,
  TRYBY,
  wymagaKodowQr,
  type TrybWystawienia,
} from './ksef-tryby';

/**
 * `M-16` — strażnik terminów KSeF.
 *
 * Pilnuje trzech rzeczy, których kod przed poprawką nie umiał:
 *  1. cztery tryby mają RÓŻNE terminy liczone od RÓŻNYCH zdarzeń,
 *  2. „brak obowiązku" to nie to samo co „nie wiemy, jaki termin",
 *  3. tryb niesklasyfikowany dostaje termin NAJKRÓTSZY, nie najdłuższy.
 */

// Poniedziałek 2026-08-24, 10:00 UTC — zakotwiczone na stałe, bo test liczący
// dni robocze od `new Date()` przechodziłby lub nie w zależności od dnia
// tygodnia, w którym akurat biegnie CI.
const PONIEDZIALEK = new Date('2026-08-24T10:00:00Z');
const PIATEK = new Date('2026-08-28T10:00:00Z');

describe('M-16 — dni robocze', () => {
  it('sobota i niedziela nie są dniami roboczymi', () => {
    expect(czyDzienRoboczy(new Date('2026-08-29T10:00:00Z'))).toBe(false); // sobota
    expect(czyDzienRoboczy(new Date('2026-08-30T10:00:00Z'))).toBe(false); // niedziela
    expect(czyDzienRoboczy(PONIEDZIALEK)).toBe(true);
    expect(czyDzienRoboczy(PIATEK)).toBe(true);
  });

  it('jeden dzień roboczy od piątku wypada we wtorek, nie w sobotę', () => {
    const termin = dodajDniRobocze(PIATEK, 1);
    expect(termin.toISOString().slice(0, 10)).toBe('2026-08-31'); // poniedziałek
  });

  it('siedem dni roboczych przeskakuje dwa weekendy', () => {
    const termin = dodajDniRobocze(PONIEDZIALEK, 7);
    // pon 24.08 + 7 dni roboczych = wtorek 02.09
    expect(termin.toISOString().slice(0, 10)).toBe('2026-09-02');
  });

  it('termin upływa z końcem dnia, nie o godzinie wystawienia', () => {
    const termin = dodajDniRobocze(PONIEDZIALEK, 1);
    expect(termin.toISOString()).toMatch(/T23:59:59/);
  });
});

describe('M-16 — terminy per tryb', () => {
  it('ONLINE nie ma terminu awaryjnego', () => {
    expect(terminPrzeslania({ tryb: 'ONLINE', wystawiono: PONIEDZIALEK })).toBeNull();
    expect(terminNieznany({ tryb: 'ONLINE', wystawiono: PONIEDZIALEK })).toBe(false);
  });

  it('AWARIA_CALKOWITA nie rodzi obowiązku przesłania', () => {
    const w = { tryb: 'AWARIA_CALKOWITA' as const, wystawiono: PONIEDZIALEK };
    expect(terminPrzeslania(w)).toBeNull();
    expect(stanTerminu(w, new Date('2027-01-01T00:00:00Z'))).toBe('brak-obowiazku');
  });

  it('OFFLINE24 liczy się od WYSTAWIENIA — następny dzień roboczy', () => {
    const termin = terminPrzeslania({ tryb: 'OFFLINE24', wystawiono: PONIEDZIALEK });
    expect(termin?.toISOString().slice(0, 10)).toBe('2026-08-25');
  });

  it('AWARIA liczy się od ZAKOŃCZENIA PRZERWY, nie od wystawienia', () => {
    const odWystawienia = terminPrzeslania({
      tryb: 'AWARIA',
      wystawiono: PONIEDZIALEK,
      przerwaZakonczona: new Date('2026-09-07T10:00:00Z'), // dwa tygodnie później
    });
    // 7 dni roboczych od 07.09 (poniedziałek) = wtorek 16.09
    expect(odWystawienia?.toISOString().slice(0, 10)).toBe('2026-09-16');
  });

  it('NIEDOSTEPNOSC i AWARIA mają różne terminy mimo tego samego zdarzenia', () => {
    const przerwa = new Date('2026-08-24T10:00:00Z');
    const n = terminPrzeslania({ tryb: 'NIEDOSTEPNOSC', wystawiono: PONIEDZIALEK, przerwaZakonczona: przerwa });
    const a = terminPrzeslania({ tryb: 'AWARIA', wystawiono: PONIEDZIALEK, przerwaZakonczona: przerwa });
    expect(n!.getTime()).toBeLessThan(a!.getTime());
  });
});

describe('M-16 — „brak obowiązku" to nie „nie wiemy"', () => {
  it('AWARIA bez daty zakończenia przerwy daje termin NIEZNANY, nie brak obowiązku', () => {
    const w = { tryb: 'AWARIA' as const, wystawiono: PONIEDZIALEK, przerwaZakonczona: null };
    expect(terminPrzeslania(w)).toBeNull();
    // Kluczowe rozróżnienie: null z terminPrzeslania znaczy dwie różne rzeczy,
    // dlatego stan czyta się przez stanTerminu, a nie przez `=== null`.
    expect(terminNieznany(w)).toBe(true);
    expect(stanTerminu(w, PIATEK)).toBe('nieznany');
  });

  it('ONLINE też daje null, ale to jest brak obowiązku', () => {
    const w = { tryb: 'ONLINE' as const, wystawiono: PONIEDZIALEK };
    expect(terminPrzeslania(w)).toBeNull();
    expect(stanTerminu(w, PIATEK)).toBe('brak-obowiazku');
  });
});

describe('M-16 — tryb niesklasyfikowany', () => {
  it('dostaje NAJKRÓTSZY możliwy termin, nie najdłuższy', () => {
    const nieskl = terminPrzeslania({ tryb: 'NIESKLASYFIKOWANY', wystawiono: PONIEDZIALEK })!;
    const awaria = terminPrzeslania({
      tryb: 'AWARIA',
      wystawiono: PONIEDZIALEK,
      przerwaZakonczona: PONIEDZIALEK,
    })!;
    // Zaniżenie alarmuje za wcześnie; zawyżenie przegapiłoby obowiązek.
    expect(nieskl.getTime()).toBeLessThan(awaria.getTime());
    expect(nieskl.getTime()).toBe(
      terminPrzeslania({ tryb: 'OFFLINE24', wystawiono: PONIEDZIALEK })!.getTime(),
    );
  });

  it('nie jest kategorią prawną — wymaga zaklasyfikowania', () => {
    // Gdyby ktoś kiedyś nadał mu `dniRobocze: null`, faktura po awarii
    // przestałaby być pilnowana i nikt by tego nie zauważył.
    expect(TRYBY.NIESKLASYFIKOWANY.dniRobocze).not.toBeNull();
  });
});

describe('M-16 — przekroczenie terminu i kody QR', () => {
  it('wykrywa przekroczenie terminu', () => {
    const w = { tryb: 'OFFLINE24' as const, wystawiono: PONIEDZIALEK };
    expect(stanTerminu(w, new Date('2026-08-25T12:00:00Z'))).toBe('w-terminie');
    expect(stanTerminu(w, new Date('2026-08-26T00:00:01Z'))).toBe('po-terminie');
  });

  it('każdy tryb przekazywany nabywcy poza KSeF wymaga kodów QR', () => {
    const pozaKsef: TrybWystawienia[] = ['OFFLINE24', 'NIEDOSTEPNOSC', 'AWARIA', 'NIESKLASYFIKOWANY'];
    for (const t of pozaKsef) expect(wymagaKodowQr(t)).toBe(true);
    expect(wymagaKodowQr('ONLINE')).toBe(false);
    expect(wymagaKodowQr('AWARIA_CALKOWITA')).toBe(false);
  });

  it('kontrola strażnika — każdy tryb ma spójny opis', () => {
    for (const [klucz, opis] of Object.entries(TRYBY)) {
      expect(opis.tryb).toBe(klucz);
      expect(opis.etykieta.length).toBeGreaterThan(0);
      if (opis.dniRobocze === null) {
        expect(opis.odZdarzenia).toBe('nie-dotyczy');
        expect(opis.wymagaKodowQr).toBe(false);
      } else {
        expect(opis.dniRobocze).toBeGreaterThan(0);
        expect(opis.odZdarzenia).not.toBe('nie-dotyczy');
      }
    }
  });
});
