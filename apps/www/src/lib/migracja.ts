import type { ReactNode } from 'react';

/** Trzy kroki migracji — wspólne dla /przenies-strone, /hosting/wordpress i /hosting/sklep (jedna treść, jeden JSON-LD HowTo). */
export const KROKI_MIGRACJI: { label: string; title: string; text: ReactNode }[] = [
  {
    label: '01',
    title: 'Zamów hosting Verris',
    text: 'Załóż konto i wybierz rozliczenie — 45 zł/mies lub 449 zł/rok brutto. Płatność kartą, BLIK-iem albo przelewem online. Twoja obecna strona dalej działa.',
  },
  {
    label: '02',
    title: 'Wybierz sposób migracji',
    text: 'Przekaż dostępy do obecnego hostingu, a my bezpłatnie przeniesiemy pliki, bazy danych i pocztę. Wolisz mieć wszystko pod kontrolą? Uruchom darmowy migrator w panelu.',
  },
  {
    label: '03',
    title: 'Przełącz DNS i gotowe',
    text: 'Sprawdzasz stronę na nowym serwerze, zmieniasz rekordy DNS — i to wszystko. Stara strona działa do momentu przełączenia, więc odwiedzający nie zobaczą żadnej przerwy.',
  },
];

/**
 * Makieta 14.10 (plansza Migracja) — przeprowadzka w panelu w 6 krokach. Treść tylko z tym, co kreator i worker
 * migracji robią dziś (apps/client-panel …/migrations, apps/api …/subscriptions/migra*, notatka
 * „migrator-uproszczenie” 14.10). Z makiety celowo pominięte (jeszcze nie zbudowane): rozpoznanie typu panelu z DNS,
 * przełączenie domeny jednym kliknięciem, samoczynna synchronizacja różnic tuż przed przełączeniem.
 */
export type KrokPrzeprowadzki = { etykieta: string; tytul: string; tekst: string; zaCiebie: string };

export const KROKI_PRZEPROWADZKI: KrokPrzeprowadzki[] = [
  {
    etykieta: 'Domena',
    tytul: 'Wybierz domenę z listy',
    tekst: 'Domenę docelową wybierasz z domen swojego konta w Verris — nie da się jej pomylić ani wpisać cudzej.',
    zaCiebie: 'pokazujemy tylko domeny Twojej usługi; jeśli strona działała wcześniej pod innym adresem, podajesz go w kreatorze.',
  },
  {
    etykieta: 'Skąd',
    tytul: 'Sprawdzamy, gdzie dziś jest strona',
    tekst: 'Odczytujemy rekordy DNS domeny i podpowiadamy adres starego serwera — poprawisz go, jeśli jest inny.',
    zaCiebie: 'odczyt rekordów A, MX i NS oraz nazwy serwera, na którym stoi strona.',
  },
  {
    etykieta: 'Dostęp',
    tytul: 'Podajesz dostęp do starego hostingu',
    tekst: 'Login do starego panelu (np. cPanel albo Plesk), a jeśli go nie masz — dane FTP lub SFTP.',
    zaCiebie: 'test dostępów przed startem, z czytelnym komunikatem, jeśli coś nie pasuje.',
  },
  {
    etykieta: 'Wybór',
    tytul: 'Zaznaczasz, co przenosimy',
    tekst: 'Po zalogowaniu do panelu widzisz listę stron, baz i skrzynek. Do skrzynek pocztowych wpisujesz ich hasła.',
    zaCiebie: 'zakładamy u nas bazy i brakujące skrzynki, a dane bazy odczytujemy z plików konfiguracji strony.',
  },
  {
    etykieta: 'Postęp',
    tytul: 'Każdy etap widzisz na żywo',
    tekst: 'Pliki, baza, konfiguracja strony i poczta — postęp odświeża się w panelu, a po zakończeniu dostajesz raport mailem.',
    zaCiebie: 'porównujemy liczbę plików i wierszy w bazie ze źródłem, żeby nic nie zginęło po drodze.',
  },
  {
    etykieta: 'Przełącz',
    tytul: 'Przełączasz domenę, kiedy jesteś gotowy',
    tekst: 'Stara strona działa do końca. Przed zmianą DNS możesz dosłać różnice, a plan przełączenia w panelu sprawdza rekordy na bieżąco.',
    zaCiebie: 'synchronizacja zmian, które powstały w trakcie przeprowadzki, i sprawdzanie DNS po przełączeniu.',
  },
];

/** CMS-y, z których plików konfiguracji worker odczytuje dane bazy (apps/api …/migracja-konfiguracja-cms.ts). */
export const CMS_Z_ODCZYTEM_BAZY = 'WordPressa, Joomli, PrestaShopu, Magento i Drupala';

/** Retencja haseł źródła (MIGRATION_SECRET_TTL_* w migration-orchestrator.service.ts). */
export const HASLA_KASOWANE_PO_DNIACH = 7;
