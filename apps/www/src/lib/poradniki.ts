import { CMS_Z_ODCZYTEM_BAZY, HASLA_KASOWANE_PO_DNIACH } from './migracja';

/**
 * Poradniki przeprowadzki /przenies-strone/[zrodlo] (makieta 14.10, plansza Poradnik).
 *
 * Strony według RODZAJU starego panelu, nie według marek hostingów — nie wiemy na pewno, jakiego panelu używa
 * który dostawca (brief 14.10). Kroki opisują to, co dziś robi kreator przeprowadzki w panelu Verris i zespół
 * (lib/migracja.ts, apps/api …/subscriptions/migra*). Kroki po stronie starego panelu opisane ogólnie: nazwy
 * sekcji różnią się między wersjami i językami paneli, więc zawsze z zastrzeżeniem „zwykle”.
 */
export type ZrodloSlug = 'z-cpanel' | 'z-directadmin' | 'z-plesk' | 'z-ftp';

export type KrokPoradnika = { tytul: string; tekst: string };

export type Poradnik = {
  slug: ZrodloSlug;
  /** Nazwa źródła w zdaniu: „z panelu cPanel”, „przez FTP”. */
  zrodlo: string;
  /** Krótka nazwa na przełączniku i w okruszkach. */
  krotko: string;
  /** Kafelek na /przenies-strone#poradniki. */
  kafelek: { tytul: string; tekst: string };
  title: string;
  description: string;
  h1: string;
  lead: string;
  /** Co przygotować przed startem. */
  przygotuj: string[];
  /** Co wyszukamy sami po podaniu dostępu. */
  wykrywamy: string;
  /** Kroki HowTo (6). */
  kroki: KrokPoradnika[];
  /** Opcjonalna własna kopia w starym panelu — ogólnie, bez zrzutów. */
  wlasnaKopia: string;
  faq: [string, string][];
};

const ZAMOW_KROK: KrokPoradnika = {
  tytul: 'Zamów hosting Verris',
  tekst:
    'Wybierz rozliczenie — 45 zł/mies albo 449 zł/rok brutto, ta sama cena przy odnowieniu. Przeniesienie strony jest w cenie hostingu. Twoja obecna strona dalej działa.',
};

const KONIEC_KROKI: KrokPoradnika[] = [
  {
    tytul: 'Śledź postęp i sprawdź stronę',
    tekst:
      'Pliki, baza, konfiguracja strony i poczta — postęp każdego etapu widzisz w panelu. Porównujemy liczbę plików i wierszy w bazie ze źródłem, a po zakończeniu dostajesz raport mailem.',
  },
  {
    tytul: 'Przełącz domenę, kiedy jesteś gotowy',
    tekst:
      'Przed zmianą DNS możesz dosłać różnice, które powstały w trakcie przeprowadzki. Rekordy zmieniasz według planu przełączenia w panelu, który sprawdza DNS na bieżąco. Stara strona działa do końca.',
  },
];

const FAQ_WSPOLNE: [string, string][] = [
  [
    'Czy strona przestanie działać podczas przeprowadzki?',
    'Nie. Kopiujemy dane obok działającej strony, a domenę przełączasz sam, kiedy wszystko sprawdzisz. Po zmianie DNS przez kilkanaście minut do kilku godzin część odwiedzających może jeszcze trafiać na starą wersję.',
  ],
  [
    'Co z moimi hasłami do starego hostingu?',
    `Trzymamy je zaszyfrowane tylko na czas przeniesienia i kasujemy automatycznie ${HASLA_KASOWANE_PO_DNIACH} dni po zakończeniu (po błędzie albo anulowaniu — po 3 dniach).`,
  ],
  [
    'Ile kosztuje przeniesienie strony?',
    'Nic. Kreator w panelu i pomoc zespołu są w cenie hostingu: 45 zł/mies albo 449 zł/rok brutto.',
  ],
  [
    'Kiedy mogę wypowiedzieć stary hosting?',
    'Gdy domena wskazuje już na Verris, nowa poczta przychodzi bez problemu, a formularze i płatności na stronie działają. Dopiero wtedy wyłącz odnawianie u starego dostawcy.',
  ],
];

export const PORADNIKI: Poradnik[] = [
  {
    slug: 'z-cpanel',
    zrodlo: 'z panelu cPanel',
    krotko: 'cPanel',
    kafelek: { tytul: 'Z panelu cPanel', tekst: 'Strony, bazy i skrzynki wyszukamy sami po zalogowaniu.' },
    title: 'Jak przenieść stronę z cPanel — krok po kroku | Verris',
    description:
      'Przeniesienie strony, bazy i poczty z hostingu z panelem cPanel do Verris bez przerwy w działaniu. Co przygotować i jak przełączyć domenę. 0 zł.',
    h1: 'Jak przenieść stronę z cPanel do Verris',
    lead: 'Spokojnie, to prostsze, niż brzmi. Podajesz login do starego panelu cPanel, a my przenosimy stronę, bazy i pocztę. Stara strona działa do chwili, gdy sam przełączysz domenę.',
    przygotuj: [
      'Adres panelu cPanel, login i hasło — zwykle są w mailu powitalnym od dostawcy albo w jego panelu klienta.',
      'Hasła skrzynek pocztowych, które chcesz przenieść.',
      'Dostęp do miejsca, w którym zarządzasz DNS domeny (u rejestratora albo u obecnego dostawcy).',
    ],
    wykrywamy:
      'Po zalogowaniu do cPanel sami wyszukamy strony, bazy danych i skrzynki pocztowe na koncie. Ty tylko zaznaczasz, co przenosimy.',
    kroki: [
      ZAMOW_KROK,
      {
        tytul: 'Sprawdź dostęp do cPanel',
        tekst:
          'Zaloguj się do starego panelu i upewnij się, że strona działa. Skopiuj adres panelu, login i hasło.',
      },
      {
        tytul: 'Uruchom przeprowadzkę w panelu Verris',
        tekst:
          'W panelu Verris wybierz „Przenieś stronę”, wskaż domenę z listy domen konta i wpisz dane do cPanel. Przed startem sprawdzimy, czy dostęp działa.',
      },
      {
        tytul: 'Zaznacz strony, bazy i skrzynki',
        tekst:
          'Z listy wyszukanej na starym koncie zaznacz, co przenosimy, i wpisz hasła skrzynek. Bazy i brakujące skrzynki zakładamy u nas sami.',
      },
      ...KONIEC_KROKI,
    ],
    wlasnaKopia:
      'Chcesz mieć dodatkowo własną kopię? W cPanel zwykle służy do tego sekcja „Kopia zapasowa” (Backup) — pobierzesz tam kopię katalogu domowego i baz danych. Nazwy sekcji zależą od wersji i języka panelu. Do przeprowadzki ta kopia nie jest potrzebna.',
    faq: [
      [
        'Czy muszę znać dane bazy danych?',
        'Zwykle nie. Bazy wyszukamy po zalogowaniu do cPanel, a dane połączenia odczytamy z plików konfiguracji strony.',
      ],
      ...FAQ_WSPOLNE,
    ],
  },
  {
    slug: 'z-directadmin',
    zrodlo: 'z panelu DirectAdmin',
    krotko: 'DirectAdmin',
    kafelek: { tytul: 'Z panelu DirectAdmin', tekst: 'Login do panelu i wybierasz, co przenosimy.' },
    title: 'Jak przenieść stronę z DirectAdmin — krok po kroku | Verris',
    description:
      'Przeniesienie strony, bazy i poczty z hostingu z panelem DirectAdmin do Verris bez przerwy w działaniu. Co przygotować i jak przełączyć domenę. 0 zł.',
    h1: 'Jak przenieść stronę z DirectAdmin do Verris',
    lead: 'Podajesz login do starego panelu DirectAdmin, a my przenosimy stronę, bazy i pocztę. Stara strona działa do chwili, gdy sam przełączysz domenę.',
    przygotuj: [
      'Adres panelu DirectAdmin, login i hasło — zwykle są w mailu powitalnym od dostawcy albo w jego panelu klienta.',
      'Hasła skrzynek pocztowych, które chcesz przenieść.',
      'Dostęp do miejsca, w którym zarządzasz DNS domeny (u rejestratora albo u obecnego dostawcy).',
    ],
    wykrywamy:
      'Po zalogowaniu do DirectAdmin sami wyszukamy strony, bazy danych i skrzynki pocztowe na koncie. Ty tylko zaznaczasz, co przenosimy.',
    kroki: [
      ZAMOW_KROK,
      {
        tytul: 'Sprawdź dostęp do DirectAdmin',
        tekst:
          'Zaloguj się do starego panelu i upewnij się, że strona działa. Skopiuj adres panelu, login i hasło.',
      },
      {
        tytul: 'Uruchom przeprowadzkę w panelu Verris',
        tekst:
          'W panelu Verris wybierz „Przenieś stronę”, wskaż domenę z listy domen konta i wpisz dane do DirectAdmin. Przed startem sprawdzimy, czy dostęp działa.',
      },
      {
        tytul: 'Zaznacz strony, bazy i skrzynki',
        tekst:
          'Z listy wyszukanej na starym koncie zaznacz, co przenosimy, i wpisz hasła skrzynek. Bazy i brakujące skrzynki zakładamy u nas sami.',
      },
      ...KONIEC_KROKI,
    ],
    wlasnaKopia:
      'Chcesz mieć dodatkowo własną kopię? W DirectAdmin zwykle służy do tego sekcja kopii zapasowych konta (Create/Restore Backups). Nazwy sekcji zależą od wersji, skórki i języka panelu. Do przeprowadzki ta kopia nie jest potrzebna.',
    faq: [
      [
        'Czy muszę znać dane bazy danych?',
        'Zwykle nie. Bazy wyszukamy po zalogowaniu do DirectAdmin, a dane połączenia odczytamy z plików konfiguracji strony.',
      ],
      ...FAQ_WSPOLNE,
    ],
  },
  {
    slug: 'z-plesk',
    zrodlo: 'z panelu Plesk',
    krotko: 'Plesk',
    kafelek: { tytul: 'Z panelu Plesk', tekst: 'Strony i bazy wyszukamy sami, listę skrzynek podasz w kreatorze.' },
    title: 'Jak przenieść stronę z Plesk — krok po kroku | Verris',
    description:
      'Przeniesienie strony, bazy i poczty z hostingu z panelem Plesk do Verris bez przerwy w działaniu. Co przygotować i jak przełączyć domenę. 0 zł.',
    h1: 'Jak przenieść stronę z Plesk do Verris',
    lead: 'Podajesz login do starego panelu Plesk, a my przenosimy stronę, bazy i pocztę. Stara strona działa do chwili, gdy sam przełączysz domenę.',
    przygotuj: [
      'Adres panelu Plesk, login i hasło — zwykle są w mailu powitalnym od dostawcy albo w jego panelu klienta.',
      'Listę skrzynek pocztowych do przeniesienia i ich hasła — w Plesku skrzynki dopisujesz w kreatorze sam.',
      'Dostęp do miejsca, w którym zarządzasz DNS domeny (u rejestratora albo u obecnego dostawcy).',
    ],
    wykrywamy:
      'Po zalogowaniu do Pleska sami wyszukamy strony i bazy danych. Skrzynki pocztowe dopisujesz w kreatorze — adres i hasło każdej z nich.',
    kroki: [
      ZAMOW_KROK,
      {
        tytul: 'Sprawdź dostęp do Pleska',
        tekst:
          'Zaloguj się do starego panelu, sprawdź listę domen i skrzynek. Skopiuj adres panelu, login i hasło.',
      },
      {
        tytul: 'Uruchom przeprowadzkę w panelu Verris',
        tekst:
          'W panelu Verris wybierz „Przenieś stronę”, wskaż domenę z listy domen konta i wpisz dane do Pleska. Przed startem sprawdzimy, czy dostęp działa.',
      },
      {
        tytul: 'Zaznacz strony i bazy, dopisz skrzynki',
        tekst:
          'Z listy wyszukanej na starym koncie zaznacz strony i bazy, a skrzynki pocztowe dopisz razem z hasłami. Bazy i skrzynki zakładamy u nas sami.',
      },
      ...KONIEC_KROKI,
    ],
    wlasnaKopia:
      'Chcesz mieć dodatkowo własną kopię? W Plesku zwykle służy do tego menedżer kopii zapasowych (Backup Manager) w ustawieniach strony. Nazwy sekcji zależą od wersji i języka panelu. Do przeprowadzki ta kopia nie jest potrzebna.',
    faq: [
      [
        'Dlaczego skrzynki z Pleska wpisuję sam?',
        'Strony i bazy odczytujemy z Pleska automatycznie, a listy skrzynek jeszcze nie. Wystarczy, że dopiszesz adresy i hasła skrzynek w kreatorze — resztę robimy my.',
      ],
      ...FAQ_WSPOLNE,
    ],
  },
  {
    slug: 'z-ftp',
    zrodlo: 'przez FTP',
    krotko: 'tylko FTP',
    kafelek: { tytul: 'Przez FTP', tekst: `Dane bazy odczytamy z plików ${CMS_Z_ODCZYTEM_BAZY}.` },
    title: 'Jak przenieść stronę przez FTP — krok po kroku | Verris',
    description:
      'Przeniesienie strony przez FTP lub SFTP, gdy stary hosting ma własny panel. Dane bazy odczytamy z plików strony. Bez przerwy w działaniu, za 0 zł.',
    h1: 'Jak przenieść stronę przez FTP do Verris',
    lead: 'Twój obecny hosting ma własny panel, a nie cPanel, DirectAdmin czy Plesk? Przeniesiemy stronę przez FTP albo SFTP. Stara strona działa do chwili, gdy sam przełączysz domenę.',
    przygotuj: [
      'Dane FTP lub SFTP: adres serwera, login i hasło — zwykle w panelu klienta starego dostawcy.',
      'Nazwę bazy danych strony — przy samym FTP podajesz ją w kreatorze.',
      'Adresy i hasła skrzynek pocztowych, które chcesz przenieść.',
      'Dostęp do miejsca, w którym zarządzasz DNS domeny.',
    ],
    wykrywamy: `Połączenie wybierzemy sami (SFTP, FTPS albo FTP). Katalog strony wskażesz na podglądzie katalogów, a login i hasło bazy odczytamy z plików konfiguracji ${CMS_Z_ODCZYTEM_BAZY}.`,
    kroki: [
      ZAMOW_KROK,
      {
        tytul: 'Znajdź dane FTP i nazwę bazy',
        tekst:
          'W panelu starego dostawcy znajdź adres serwera FTP, login i hasło oraz nazwę bazy danych strony.',
      },
      {
        tytul: 'Uruchom przeprowadzkę w panelu Verris',
        tekst:
          'W panelu Verris wybierz „Przenieś stronę”, wskaż domenę z listy domen konta i podaj dane FTP. Przed startem sprawdzimy, czy dostęp działa.',
      },
      {
        tytul: 'Wskaż katalog strony i dopisz skrzynki',
        tekst: `Wybierz katalog strony i podaj nazwę bazy — login i hasło bazy odczytamy z plików ${CMS_Z_ODCZYTEM_BAZY}. Skrzynki pocztowe dopisz razem z hasłami.`,
      },
      ...KONIEC_KROKI,
    ],
    wlasnaKopia:
      'Chcesz mieć dodatkowo własną kopię? Pobierz pliki strony programem do FTP (np. FileZilla), a bazę wyeksportuj narzędziem, które daje stary dostawca (często phpMyAdmin). Do przeprowadzki ta kopia nie jest potrzebna.',
    faq: [
      [
        'Czy muszę znać dane bazy danych?',
        `Tylko nazwę bazy. Login i hasło odczytamy z plików konfiguracji ${CMS_Z_ODCZYTEM_BAZY}. Przy innych stronach podasz je w kreatorze.`,
      ],
      ...FAQ_WSPOLNE,
    ],
  },
];

export function poradnik(slug: string): Poradnik | undefined {
  return PORADNIKI.find((p) => p.slug === slug);
}
