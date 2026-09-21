import { nadajNumerDokumentu, SERIE_PANELU } from './faktura-za-portfel';
import { ADNOTACJA_DOKUMENTU_ROZLICZENIOWEGO } from './invoice-pdf.service';
import {
  ksefDozwolony,
  normalizujTryb,
  rodzajKwalifikujeDoKsef,
  rodzajPrawnyDla,
  toNumerPanelu,
} from './tryb-fakturowania';

/**
 * FAK-01 — panel nie wystawia faktur VAT, dopóki ktoś świadomie nie włączy
 * trybu `panel`. Decyzja: ADR-2026-09-22-faktury-w-programie-ksiegowym.
 */

/** Atrapa: pierwsze zapytanie czyta ustawienie, drugie to numerator. */
function db(trybWBazie: string | null) {
  const wywolania: unknown[][] = [];
  return {
    wywolania,
    $queryRaw: jest.fn(async (...args: unknown[]) => {
      wywolania.push(args);
      const sql = (args[0] as string[]).join('?');
      if (sql.includes('platform_settings')) {
        return trybWBazie === null ? [] : [{ value: trybWBazie }];
      }
      return [{ seq: 7 }];
    }),
    invoice: {} as never,
    walletTransaction: {} as never,
  };
}

/** Seria przekazana numeratorowi — drugi parametr szablonu INSERT. */
function seriaZNumeratora(d: ReturnType<typeof db>): string {
  const insert = d.wywolania.find((a) => (a[0] as string[]).join('?').includes('InvoiceCounter'));
  return insert![1] as string;
}

const SIERPIEN = new Date('2026-08-15T10:00:00.000Z');

describe('FAK-01 — normalizacja trybu (fail-safe)', () => {
  it.each([
    [null, 'zewnetrzny'],
    [undefined, 'zewnetrzny'],
    ['', 'zewnetrzny'],
    ['zewnetrzny', 'zewnetrzny'],
    ['Panel', 'zewnetrzny'],
    [' panel', 'zewnetrzny'],
    ['panel ', 'zewnetrzny'],
    ['1', 'zewnetrzny'],
    ['panel', 'panel'],
  ])('%p → %p', (wejscie, wynik) => {
    expect(normalizujTryb(wejscie as string | null | undefined)).toBe(wynik);
  });
});

describe('FAK-01 — numer i rodzaj dokumentu', () => {
  it('bez ustawienia w bazie: dokument rozliczeniowy z serii VDR', async () => {
    const d = db(null);
    const r = await nadajNumerDokumentu(d as never, SIERPIEN);
    expect(r).toEqual({ numer: 'VDR/2026/08/0007', rodzajPrawny: 'DOKUMENT_ROZLICZENIOWY' });
    expect(seriaZNumeratora(d)).toBe('VDR');
  });

  it('tryb panel: faktura VAT z serii VFV', async () => {
    const r = await nadajNumerDokumentu(db('panel') as never, SIERPIEN);
    expect(r).toEqual({ numer: 'VFV/2026/08/0007', rodzajPrawny: 'FAKTURA_VAT' });
  });

  it('korekta idzie za dokumentem pierwotnym, nie za bieżącym trybem', async () => {
    // Faktura VAT z panelu, panel już w trybie zewnętrznym → nadal VFK.
    const d1 = db('zewnetrzny');
    expect(await nadajNumerDokumentu(d1 as never, SIERPIEN, { rodzajPierwotnej: 'FAKTURA_VAT' })).toEqual({
      numer: 'VFK/2026/08/0007',
      rodzajPrawny: 'FAKTURA_VAT',
    });
    // Dokument rozliczeniowy, panel już w trybie panel → nadal VDK.
    const d2 = db('panel');
    expect(
      await nadajNumerDokumentu(d2 as never, SIERPIEN, { rodzajPierwotnej: 'DOKUMENT_ROZLICZENIOWY' }),
    ).toEqual({ numer: 'VDK/2026/08/0007', rodzajPrawny: 'DOKUMENT_ROZLICZENIOWY' });
    // Korekta nie pyta bazy o tryb — nie ma po co.
    expect(d1.wywolania.some((a) => (a[0] as string[]).join('?').includes('platform_settings'))).toBe(false);
  });

  it('rodzaj prawny wynika z trybu', () => {
    expect(rodzajPrawnyDla('panel')).toBe('FAKTURA_VAT');
    expect(rodzajPrawnyDla('zewnetrzny')).toBe('DOKUMENT_ROZLICZENIOWY');
  });
});

describe('FAK-01 — KSeF', () => {
  it('KSeF z panelu tylko w trybie panel', () => {
    expect(ksefDozwolony('panel', true)).toBe(true);
    expect(ksefDozwolony('panel', false)).toBe(false);
    expect(ksefDozwolony('zewnetrzny', true)).toBe(false);
  });

  it('dokument rozliczeniowy nigdy nie kwalifikuje się do KSeF', () => {
    expect(rodzajKwalifikujeDoKsef('FAKTURA_VAT')).toBe(true);
    expect(rodzajKwalifikujeDoKsef('DOKUMENT_ROZLICZENIOWY')).toBe(false);
    expect(rodzajKwalifikujeDoKsef(null)).toBe(false);
  });
});

describe('FAK-01 — rozpoznanie numeru już nadanego', () => {
  it('ponowna finalizacja nie nadaje drugiego numeru dokumentowi rozliczeniowemu', () => {
    expect(toNumerPanelu('VDR/2026/08/0001', SERIE_PANELU)).toBe(true);
    expect(toNumerPanelu('VDK/2026/08/0001', SERIE_PANELU)).toBe(true);
    expect(toNumerPanelu('VFV/2026/08/0001', SERIE_PANELU)).toBe(true);
    expect(toNumerPanelu('EH-in_123', SERIE_PANELU)).toBe(false);
    expect(toNumerPanelu('VDRX/2026', SERIE_PANELU)).toBe(false);
  });
});

describe('FAK-01 — dokument mówi, czym nie jest', () => {
  it('adnotacja wprost zaprzecza, że to faktura VAT', () => {
    expect(ADNOTACJA_DOKUMENTU_ROZLICZENIOWEGO.join(' ')).toMatch(/nie jest fakturą VAT/);
  });
});
