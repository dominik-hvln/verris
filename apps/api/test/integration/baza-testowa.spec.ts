import { sprawdzBazeTestowa } from './baza-testowa';

/**
 * X-44 — testy bezpiecznika nazwy bazy.
 *
 * Ten plik jest `.spec.ts`, nie `.int-spec.ts`, i to jest celowe. Bezpiecznik
 * ma chronić przed uruchomieniem paczki integracyjnej na złej bazie — więc
 * NIE może być sprawdzany wyłącznie przez tę paczkę. Gdyby był, do jego
 * wykonania potrzebny byłby Postgres, a więc dokładnie ta konfiguracja,
 * której pomyłkę bezpiecznik ma wyłapać.
 *
 * To ta sama lekcja co OPS-01: naprawa fikstury w pakiecie, którego runner
 * lokalnie nie odpala, nie jest naprawą — jest odłożeniem błędu do CI.
 * Dlatego `baza-testowa.ts` nie importuje niczego. Zero zależności = ten test
 * biegnie wszędzie, zawsze, w milisekundach.
 */
describe('X-44 — bezpiecznik nazwy bazy testowej', () => {
  describe('odrzuca', () => {
    it('brak DATABASE_URL', () => {
      expect(() => sprawdzBazeTestowa(undefined)).toThrow(/BAZĘ TESTOWĄ/);
    });

    it('pusty DATABASE_URL', () => {
      expect(() => sprawdzBazeTestowa('')).toThrow(/BAZĘ TESTOWĄ/);
    });

    // To jest przypadek, dla którego ten bezpiecznik powstał: dokładnie ta
    // wartość stoi domyślnie w libs/database/.env. Ścieżka do skasowania bazy
    // deweloperskiej była ścieżką domyślną.
    it('bazę deweloperską verris_db z libs/database/.env', () => {
      expect(() =>
        sprawdzBazeTestowa(
          'postgresql://verris:haslo@localhost:5433/verris_db?schema=public',
        ),
      ).toThrow(/verris_db/);
    });

    it('bazę produkcyjną', () => {
      expect(() =>
        sprawdzBazeTestowa('postgresql://u:p@10.0.0.5:5432/verris'),
      ).toThrow(/nazwa bazy testowej musi/);
    });

    it('URL bez nazwy bazy', () => {
      expect(() =>
        sprawdzBazeTestowa('postgresql://u:p@localhost:5432/'),
      ).toThrow(/nie umiem nazwać/);
    });

    // Ten przypadek jest podstępny: `new URL('localhost:5432/verris_test')`
    // NIE rzuca wyjątku, a jego pathname to „5432/verris_test" — zawiera
    // słowo „test". Bez sprawdzenia schematu literówka w URL-u przechodziłaby
    // przez bezpiecznik.
    it('napis bez schematu postgresql://, mimo słowa "test" w środku', () => {
      expect(() => sprawdzBazeTestowa('localhost:5432/verris_test')).toThrow(
        /Nie potrafię odczytać/,
      );
    });

    it('URL o obcym schemacie', () => {
      expect(() =>
        sprawdzBazeTestowa('mysql://u:p@localhost:3306/verris_test'),
      ).toThrow(/Nie potrafię odczytać/);
    });

    // Bezpiecznik ma nie dać się obejść pośpiechem ani przypadkiem. Nazwa
    // użytkownika i hosta nie są nazwą bazy — sprawdzamy tylko ścieżkę.
    it('bazę deweloperską, gdy słowo "test" jest w loginie lub hoście', () => {
      expect(() =>
        sprawdzBazeTestowa('postgresql://tester:p@test-host:5432/verris_db'),
      ).toThrow(/verris_db/);
    });
  });

  describe('przepuszcza', () => {
    // Kontrola: gdyby bezpiecznik odrzucał wszystko, testy powyżej też by
    // przechodziły, a paczka integracyjna nie dałaby się uruchomić w ogóle.
    it('verris_test — nazwa używana przez joba "API integration tests"', () => {
      expect(() =>
        sprawdzBazeTestowa(
          'postgresql://verris:verris_password@localhost:5432/verris_test?schema=public',
        ),
      ).not.toThrow();
    });

    it('nazwę z "test" w środku', () => {
      expect(() =>
        sprawdzBazeTestowa('postgresql://u:p@localhost:5432/moja_testowa_baza'),
      ).not.toThrow();
    });

    it('nazwę z "TEST" wielkimi literami', () => {
      expect(() =>
        sprawdzBazeTestowa('postgresql://u:p@localhost:5432/VERRIS_TEST'),
      ).not.toThrow();
    });
  });
});
