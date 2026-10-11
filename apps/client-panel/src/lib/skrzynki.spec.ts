import { zdradzaInfrastrukture } from '@verris/contracts';
import { komunikatSkrzynekZBledem, skrzynkiDomenyNieznane } from './skrzynki';

/**
 * Noc 12.10 — regresja z prod 11.10 (d3): błąd odczytu skrzynek domeny dodatkowej dał „SKRZYNKI 0” i zniknęły
 * skrzynki domeny głównej. Teraz lista ma skrzynki odczytanych domen + `domenyZBledem`, a klient widzi krótką
 * informację o nieodczytanej domenie (bez nazwy panelu serwera).
 */
describe('skrzynki — domeny, których nie udało się odczytać', () => {
  it('jedna domena: krótka informacja po polsku z nazwą domeny', () => {
    expect(komunikatSkrzynekZBledem(['test2.d3.hvln.pl'])).toBe(
      'Nie udało się wczytać skrzynek domeny test2.d3.hvln.pl — spróbuj ponownie za chwilę.',
    );
  });

  it('kilka domen: „domen a, b”; brak domen z błędem → brak komunikatu', () => {
    expect(komunikatSkrzynekZBledem(['a.pl', 'b.pl'])).toBe('Nie udało się wczytać skrzynek domen a.pl, b.pl — spróbuj ponownie za chwilę.');
    expect(komunikatSkrzynekZBledem([])).toBeNull();
    expect(komunikatSkrzynekZBledem(undefined)).toBeNull();
  });

  it('white label: komunikat nie zdradza panelu serwera ani węzła', () => {
    expect(zdradzaInfrastrukture(komunikatSkrzynekZBledem(['test2.d3.hvln.pl'])!)).toBe(false);
    expect(komunikatSkrzynekZBledem(['test2.d3.hvln.pl'])).not.toMatch(/serwer|węz/i);
  });

  it('strona domeny: domena z błędem → nieznane (nie „0 skrzynek”); domena główna odczytana → znane', () => {
    const mail = {
      rows: [{ id: 'import@d3.hvln.pl', email: 'import@d3.hvln.pl', quotaMb: 1024 }],
      fetchError: null,
      domenyZBledem: ['test2.d3.hvln.pl'],
    };
    expect(skrzynkiDomenyNieznane(mail, 'test2.d3.hvln.pl')).toBe(true);
    expect(skrzynkiDomenyNieznane(mail, 'd3.hvln.pl')).toBe(false);
    expect(skrzynkiDomenyNieznane({ rows: [], fetchError: null, domenyZBledem: [] }, 'pusta.pl')).toBe(false);
    expect(skrzynkiDomenyNieznane({ rows: [], fetchError: 'Chwilowo nie możemy pobrać danych.' }, 'd3.hvln.pl')).toBe(true);
    expect(skrzynkiDomenyNieznane(null, 'd3.hvln.pl')).toBe(true);
  });
});
