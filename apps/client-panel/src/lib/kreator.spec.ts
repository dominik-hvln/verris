import { CENA_KREATORA_PRO, PLANY_KREATORA } from '@verris/kreator/klient';
import { blokadaNowejStrony, limitMb, moznaDodacPodstrone, nettoZBrutto, opisAbonamentuPro, opisCenyPro, opisMiejscaZdjec, oszczednoscRoczna, rozmiar, zl, type AbonamentKreatoraPro, type StanKreatora } from './kreator';

const stan = (wersja: 'proba' | 'hosting' | 'pro', zuzycie: Partial<StanKreatora['zuzycie']> = {}): StanKreatora =>
  ({
    dostep: true,
    powod: null,
    wersja,
    plan: PLANY_KREATORA[wersja],
    zuzycie: { miesiac: '2026-11', generacje: 0, zmiany: 0, stron: 0, ...zuzycie },
  }) as StanKreatora;

it('cena Pro zawsze z netto i brutto, w formacie z decyzji właściciela', () => {
  expect(opisCenyPro(CENA_KREATORA_PRO)).toBe('9,90 zł brutto/mies. (8,05 zł netto) albo 99 zł brutto/rok (80,49 zł netto)');
  expect(zl(99)).toBe('99 zł');
  expect(nettoZBrutto(123)).toBe(100);
  expect(nettoZBrutto(9.9)).toBe(8.05);
  expect(nettoZBrutto(99)).toBe(80.49);
});

it('nowa strona: blokada przy limicie stron i generacji (jak POST /kreator/strony), odmiana liczebników', () => {
  expect(blokadaNowejStrony(stan('hosting'))).toBeNull();
  expect(blokadaNowejStrony(stan('proba', { stron: 1 }))).toBe('Masz już 1 stronę – w tej wersji kreatora limit to 1 strona. Usuń jedną z nich albo przejdź na Kreator Pro.');
  expect(blokadaNowejStrony(stan('hosting', { stron: 3 }))).toContain('limit to 3 strony');
  expect(blokadaNowejStrony(stan('pro', { stron: 10 }))).not.toContain('Kreator Pro');
  expect(blokadaNowejStrony(stan('hosting', { generacje: 3 }))).toContain('Wykorzystano miesięczny limit (3 generacje)');
  expect(blokadaNowejStrony({ ...stan('hosting'), dostep: false, powod: 'Zamów hosting.' })).toBe('Zamów hosting.');
});

it('limit podstron z planu; Pro bez limitu', () => {
  expect(moznaDodacPodstrone(PLANY_KREATORA.hosting, 4)).toBe(true);
  expect(moznaDodacPodstrone(PLANY_KREATORA.hosting, 5)).toBe(false);
  expect(moznaDodacPodstrone(PLANY_KREATORA.pro, 500)).toBe(true);
});

describe('paczka 121 – abonament Kreator Pro na karcie kreatora', () => {
  const abonament = (o: Partial<AbonamentKreatoraPro> = {}): AbonamentKreatoraPro => ({
    id: 's1', status: 'ACTIVE', interval: 'MONTH', aktywnyDo: '2026-12-08T10:00:00.000Z', odnowienie: 'portfel', bezOdnowienia: false, cena: '9.90', ...o,
  });

  it('oszczędność roczna: 12 × 9,90 − 99 = 19,80 zł; nigdy ujemna', () => {
    expect(oszczednoscRoczna(CENA_KREATORA_PRO)).toBe(19.8);
    expect(oszczednoscRoczna({ ...CENA_KREATORA_PRO, rokBrutto: 200 })).toBe(0);
  });

  it('aktywny: „Kreator Pro aktywny do <data>” i sposób odnawiania (portfel / karta, cykl, kwota)', () => {
    expect(opisAbonamentuPro(abonament())).toEqual({
      naglowek: 'Kreator Pro aktywny do 8 grudnia 2026',
      odnawianie: 'Odnawia się automatycznie co miesiąc, z portfela (9,90 zł brutto).',
    });
    expect(opisAbonamentuPro(abonament({ interval: 'YEAR', odnowienie: 'karta', cena: '99.00' })).odnawianie).toBe(
      'Odnawia się automatycznie co rok, z karty (99 zł brutto).',
    );
  });

  it('po anulowaniu odnowienia: nadal aktywny do daty, bez odnawiania; zawieszony i czekający na płatność – własne nagłówki', () => {
    expect(opisAbonamentuPro(abonament({ bezOdnowienia: true }))).toEqual({
      naglowek: 'Kreator Pro aktywny do 8 grudnia 2026',
      odnawianie: 'Odnowienie anulowane – abonament nie przedłuży się.',
    });
    expect(opisAbonamentuPro(abonament({ status: 'SUSPENDED' })).naglowek).toBe('Kreator Pro wstrzymany – brak płatności');
    expect(opisAbonamentuPro(abonament({ status: 'PENDING_PAYMENT' })).naglowek).toBe('Zamówienie Kreatora Pro czeka na płatność');
  });
});

describe('paczka 123 – karta Pro i miejsce na zdjęcia', () => {
  const abonament = (o: Partial<AbonamentKreatoraPro> = {}): AbonamentKreatoraPro => ({
    id: 's1', status: 'ACTIVE', interval: 'MONTH', aktywnyDo: '2026-12-08T10:00:00.000Z', odnowienie: 'portfel', bezOdnowienia: false, cena: '9.90', ...o,
  });

  it('odnowienie wyłączone przez brak hostingu: „Odnowienie wyłączone – brak hostingu”', () => {
    expect(opisAbonamentuPro(abonament({ bezOdnowienia: true, powodBezOdnowienia: 'brak-hostingu' })).odnawianie).toMatch(/^Odnowienie wyłączone – brak hostingu\./);
  });

  it('zaplanowana zmiana okresu widoczna przy odnawianiu', () => {
    expect(opisAbonamentuPro(abonament({ nastepnyOkres: 'YEAR' })).odnawianie).toBe(
      'Odnawia się automatycznie co miesiąc, z portfela (9,90 zł brutto). Od następnego odnowienia: rozliczenie roczne.',
    );
  });

  it('rozmiary po polsku: MB z przecinkiem, GB od 1024 MB; limity planów', () => {
    expect([rozmiar(0), rozmiar(3.5 * 1048576), rozmiar(123 * 1048576), rozmiar(1.25 * 1024 ** 3)]).toEqual(['0 MB', '3,5 MB', '123 MB', '1,3 GB']);
    expect([limitMb(PLANY_KREATORA.proba.miejsceZdjecMb), limitMb(PLANY_KREATORA.hosting.miejsceZdjecMb), limitMb(PLANY_KREATORA.pro.miejsceZdjecMb)]).toEqual(['50 MB', '500 MB', '2 GB']);
    expect(opisMiejscaZdjec(3.5 * 1048576, 500)).toBe('Zajęte 3,5 MB z 500 MB.');
  });
});
