/**
 * X-44 — bezpiecznik nazwy bazy.
 *
 * Do 2026-08-27 jedynym zabezpieczeniem przed uruchomieniem paczki
 * integracyjnej na bazie z danymi było `if (!process.env.DATABASE_URL)`.
 * Sprawdzało ono, że zmienna jest NIEPUSTA — nie, że wskazuje na bazę
 * testową. Treść błędu mówiła „wskazującego na BAZĘ TESTOWĄ", ale nikt tego
 * nie egzekwował. Napis w komunikacie nie jest kontrolą.
 *
 * Koszt pomyłki nie jest teoretyczny: `wyczyscBaze()` startuje od
 * TRUNCATE ... CASCADE na Invoice, InvoiceCounter, WalletTransaction,
 * UsageMetric, Account, Subscription, Server, Plan i User. Jeden
 * `export DATABASE_URL=…/verris_db` w złym terminalu kasował całą bazę
 * deweloperską — bez ostrzeżenia i bez pytania. A `verris_db` to dokładnie
 * to, co stoi domyślnie w `libs/database/.env`: ścieżka do wypadku była
 * ścieżką domyślną.
 *
 * Wymuszamy więc konwencję: nazwa bazy musi zawierać `test`. CI już ją
 * spełnia (`verris_test` w jobie „API integration tests"), więc to nie jest
 * nowe wymaganie wobec pipeline'u — to spisanie tego, co i tak było prawdą,
 * i odebranie człowiekowi możliwości zrobienia inaczej.
 *
 * Świadomie BEZ furtki typu `FORCE=1`. Furtka, którą da się wpisać w
 * pośpiechu, jest tym samym co brak bezpiecznika — a ten ma ratować właśnie
 * przed pośpiechem.
 */

/**
 * Zwraca nazwę bazy z URL-a albo `null`, jeśli nie da się jej ustalić NA PEWNO.
 *
 * Ostrożność w parserze jest tu ważniejsza niż wygoda. `new URL()` samo w
 * sobie nie wystarcza: `new URL('localhost:5432/verris_test')` NIE rzuca
 * wyjątku — traktuje `localhost:` jako schemat, a `5432/verris_test` jako
 * ścieżkę. Bez sprawdzenia schematu literówka w URL-u przechodziłaby przez
 * bezpiecznik tylko dlatego, że gdzieś dalej w napisie stało słowo „test".
 */
function nazwaBazy(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    return null;
  }

  if (!parsed.pathname.startsWith('/')) {
    return null;
  }

  const nazwa = parsed.pathname.slice(1);
  return nazwa.length > 0 ? nazwa : null;
}

export function sprawdzBazeTestowa(url: string | undefined): void {
  if (!url) {
    throw new Error(
      'Testy integracyjne wymagają DATABASE_URL wskazującego na BAZĘ TESTOWĄ. ' +
        'Nigdy nie uruchamiaj ich przeciwko bazie z danymi — zaczynają od TRUNCATE.',
    );
  }

  const nazwa = nazwaBazy(url);

  if (nazwa === null) {
    throw new Error(
      'Nie potrafię odczytać nazwy bazy z DATABASE_URL, więc nie potwierdzę, ' +
        'że to baza testowa. Oczekuję postaci ' +
        'postgresql://użytkownik:hasło@host:port/nazwa_bazy. Ta paczka zaczyna ' +
        'od TRUNCATE — nie uruchamiam jej na bazie, której nie umiem nazwać.',
    );
  }

  if (!/test/i.test(nazwa)) {
    throw new Error(
      `DATABASE_URL wskazuje na bazę "${nazwa}", a nazwa bazy testowej musi ` +
        'zawierać "test". Testy integracyjne zaczynają od ' +
        'TRUNCATE ... CASCADE na Invoice, WalletTransaction, Account, ' +
        'Subscription, Server, Plan i User — na bazie deweloperskiej ' +
        'skasowałyby wszystko. Utwórz osobną bazę (np. verris_test) i wskaż ' +
        'na nią DATABASE_URL.',
    );
  }
}
