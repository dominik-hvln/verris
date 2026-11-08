import { dataPl, koniecOkresu, MAKS_NAZWA_POZYCJI, nazwaAbonamentu, nazwaPozycjiUslugi, nazwyPozycji } from './pozycja-uslugi.js';

describe('nazwa pozycji dokumentu za usługę', () => {
  it('zakup: plan, liczba miesięcy, domena i okres od dnia zapłaty (strefa Europe/Warsaw)', () => {
    expect(
      nazwaPozycjiUslugi({ plan: 'Hosting Start', interval: 'YEAR', domena: 'przyklad.pl', od: new Date('2026-10-12T22:30:00Z'), rodzaj: 'zakup' }),
    ).toBe('Hosting Start – 12 mies. (przyklad.pl), okres 13.10.2026–13.10.2027');
    expect(nazwaPozycjiUslugi({ plan: 'Poczta', interval: 'MONTH', od: new Date('2026-01-31T10:00:00Z'), rodzaj: 'zakup' })).toBe(
      'Poczta – 1 mies., okres 31.01.2026–03.03.2026',
    );
  });

  it('odnowienie: jak na proformie', () => {
    expect(
      nazwaPozycjiUslugi({ plan: 'Hosting Start', interval: 'MONTH', domena: 'a.pl', od: new Date('2026-11-05T10:00:00Z'), rodzaj: 'odnowienie' }),
    ).toBe('Hosting Start – odnowienie miesięczne (a.pl), okres 05.11.2026–05.12.2026');
  });

  it('Kreator Pro (paczka 121): „abonament miesięczny/roczny” przy zakupie i odnowieniu, z okresem, bez domeny', () => {
    expect(nazwaAbonamentu('Verris Kreator Pro', 'MONTH')).toBe('Verris Kreator Pro – abonament miesięczny');
    expect(
      nazwaPozycjiUslugi({ plan: 'Verris Kreator Pro', interval: 'MONTH', od: new Date('2026-11-08T10:00:00Z'), rodzaj: 'zakup', produkt: 'KREATOR_PRO' }),
    ).toBe('Verris Kreator Pro – abonament miesięczny, okres 08.11.2026–08.12.2026');
    expect(
      nazwaPozycjiUslugi({ plan: 'Verris Kreator Pro', interval: 'YEAR', od: new Date('2026-11-08T10:00:00Z'), rodzaj: 'odnowienie', produkt: 'KREATOR_PRO' }),
    ).toBe('Verris Kreator Pro – abonament roczny, okres 08.11.2026–08.11.2027');
    // Inne produkty bez zmian.
    expect(nazwaPozycjiUslugi({ plan: 'Newsletter Start', interval: 'MONTH', od: new Date('2026-11-08T10:00:00Z'), rodzaj: 'zakup', produkt: 'EMAIL_MARKETING' })).toBe(
      'Newsletter Start – 1 mies., okres 08.11.2026–08.12.2026',
    );
  });

  it('dzień i miesiąc zawsze dwucyfrowe; nazwa przycięta do limitu', () => {
    expect(dataPl(new Date('2026-03-01T12:00:00Z'))).toBe('01.03.2026');
    expect(nazwaPozycjiUslugi({ plan: 'x'.repeat(400), interval: 'YEAR', od: new Date(), rodzaj: 'zakup' })).toHaveLength(MAKS_NAZWA_POZYCJI);
    expect(koniecOkresu(new Date('2026-10-13T00:00:00Z'), 'YEAR').toISOString()).toBe('2027-10-13T00:00:00.000Z');
  });

  it('nazwy pozycji z JSON-a: łączone średnikiem, puste i obce wartości pomijane', () => {
    expect(nazwyPozycji([{ name: 'A' }, { name: ' ' }, { name: 'B' }, null, 5])).toBe('A; B');
    expect(nazwyPozycji([])).toBeNull();
    expect(nazwyPozycji(null)).toBeNull();
  });
});
