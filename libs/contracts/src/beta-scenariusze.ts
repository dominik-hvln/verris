/**
 * Testy przed startem (PB-26, docs/ops/BETA_TESTY.md) — scenariusze dla testera. Jedno źródło dla strony
 * „Testy (beta)” w panelu klienta (odhaczanie i uwagi), widoku postępu w panelu admina i przewodnika PDF.
 * Identyfikatory kroków są zapisywane w bazie (BetaPostep.kroki) — nie zmieniaj istniejących, tylko dopisuj nowe.
 */
export interface KrokBeta {
  id: string;
  tekst: string;
}

export interface ScenariuszBeta {
  id: string;
  tytul: string;
  /** Orientacyjny czas, dla testera. */
  czas: string;
  /** Po co ten scenariusz — jedno, dwa zdania. */
  cel: string;
  /** Kiedy uznać scenariusz za zaliczony — sprawdzalne kryteria (przewodnik PDF i strona w panelu). */
  weryfikacja: string[];
  kroki: KrokBeta[];
  /** Na co zwrócić uwagę (pytania do siebie w trakcie). */
  uwagi: string[];
  /** Blok dla osób technicznych — nie wlicza się do postępu ani do „Kontynuuj”. */
  opcjonalny?: boolean;
  /**
   * P4-12 — scenariusz dotyczy też testera, który sprawdza tylko pocztę (zakres „Poczta” w /beta). Panel oznacza
   * te scenariusze, a zaproszenie dla zakresu „tylko poczta” wymienia tylko je.
   */
  poczta?: boolean;
}

export const SCENARIUSZE_BETA: ScenariuszBeta[] = [
  {
    id: 's01',
    tytul: 'Konto i bezpieczeństwo',
    czas: 'ok. 5 min',
    cel: 'Pierwsze minuty z Verris: czy założenie i zabezpieczenie konta jest proste i nie budzi wątpliwości.',
    poczta: true,
    weryfikacja: [
      'Mail z linkiem potwierdzającym przychodzi w ciągu kilku minut.',
      'Po wylogowaniu logowanie prosi o drugi składnik (kod albo passkey).',
      'W ustawieniach bezpieczeństwa widać włączoną metodę.',
    ],
    kroki: [
      { id: 's01.k1', tekst: 'Załóż konto przyciskiem z maila z zaproszeniem.' },
      { id: 's01.k2', tekst: 'Potwierdź adres e-mail linkiem z wiadomości.' },
      { id: 's01.k3', tekst: 'Włącz weryfikację dwuetapową albo klucz dostępu (passkey).' },
      { id: 's01.k4', tekst: 'Wyloguj się i zaloguj ponownie – także drugim składnikiem.' },
    ],
    uwagi: [
      'Czy mail z potwierdzeniem przyszedł szybko? Sprawdź też Oferty i Spam.',
      'Czy komunikaty błędów w formularzu mówią, co poprawić?',
      'Czy wiesz, co zrobić, gdy zgubisz telefon z 2FA?',
    ],
  },
  {
    id: 's02',
    tytul: 'Kod testera, portfel i pierwsza usługa',
    czas: 'ok. 5 min',
    cel: 'Ścieżka zamówienia tak, jak przejdzie ją każdy klient – z tą różnicą, że płacisz kredytami z kodu. Testujesz tylko pocztę? Zamów „Poczta e-mail” zamiast hostingu.',
    poczta: true,
    weryfikacja: [
      'Przed zakupem portfel pokazuje 150 K, po zakupie – 150 K minus cena usługi.',
      'Usługa ma stan „Aktywna”, a jej przegląd otwiera się bez błędów.',
      'W „Płatnościach” → „Faktury” nie ma faktury za tę usługę: kredyty z kodu testera to nie zakup, więc nie ma za nie faktury.',
    ],
    kroki: [
      { id: 's02.k1', tekst: 'W „Płatnościach” wpisz kod testera w polu kodu promocyjnego.' },
      { id: 's02.k2', tekst: 'Sprawdź, że w portfelu jest 150 K.' },
      { id: 's02.k3', tekst: 'Zamów z portfela hosting albo samą pocztę („Poczta e-mail”) i podaj swoją domenę.' },
      { id: 's02.k4', tekst: 'Poczekaj, aż usługa będzie aktywna, i otwórz jej przegląd.' },
      { id: 's02.k5', tekst: 'Zajrzyj do „Płatności” → „Faktury” i sprawdź, czy panel jasno mówi, że za kredyty z kodu faktury nie ma.' },
    ],
    uwagi: [
      'Czy przed zakupem było jasne, co dostajesz i ile to kosztuje?',
      'Czy saldo portfela po zakupie się zgadza?',
      'Czy było jasne, kiedy dostaniesz fakturę (przy wpłacie pieniędzy), a kiedy nie (kredyty z kodu)?',
      'Ile minut minęło od zamówienia do działającej usługi?',
    ],
  },
  {
    id: 's03',
    tytul: 'Przeniesienie strony albo nowy WordPress',
    czas: '15–30 min',
    cel: 'Najważniejszy test: czy strona po przeniesieniu działa tak jak wcześniej – bez naszej pomocy.',
    weryfikacja: [
      'Sprawdzone podstrony działają bez błędów i bez brakujących obrazków.',
      'Wiadomość z formularza dociera na Twój adres.',
      'Zmiana zapisana w WordPressie jest widoczna na stronie.',
    ],
    kroki: [
      { id: 's03.k1', tekst: 'Przenieś stronę kreatorem migracji z dotychczasowego hostingu (albo zainstaluj WordPressa w „Aplikacjach 1-click”).' },
      { id: 's03.k2', tekst: 'Otwórz stronę u nas: strona główna, kilka podstron, obrazki, wyszukiwarka.' },
      { id: 's03.k3', tekst: 'Wyślij formularz kontaktowy i sprawdź, czy wiadomość dotarła.' },
      { id: 's03.k4', tekst: 'Zaloguj się do panelu WordPressa i zapisz drobną zmianę.' },
      { id: 's03.k5', tekst: 'Sklep: dodaj produkt do koszyka i przejdź płatność testową.' },
    ],
    uwagi: [
      'Czy wiedziałeś(-aś), jakie dane podać w kreatorze migracji?',
      'Czy było jasne, kiedy przeniesienie się skończyło i czy się udało?',
      'Czy strona ładuje się co najmniej tak szybko jak wcześniej?',
    ],
  },
  {
    id: 's04',
    tytul: 'Domena, DNS i certyfikat SSL',
    czas: '10 min + czas DNS',
    cel: 'Przełączenie domeny to moment, w którym klienci najczęściej potrzebują pomocy.',
    weryfikacja: [
      'Strona otwiera się pod Twoją domeną z kłódką, bez ostrzeżeń przeglądarki.',
      'Certyfikat jest widoczny w panelu razem z datą ważności.',
      'Nowy rekord DNS jest na liście w panelu.',
    ],
    kroki: [
      { id: 's04.k1', tekst: 'Podepnij domenę według podpowiedzi w „Domenach i DNS” (serwery nazw albo rekordy A).' },
      { id: 's04.k2', tekst: 'Po zmianie DNS sprawdź stronę pod swoją domeną.' },
      { id: 's04.k3', tekst: 'Sprawdź kłódkę w przeglądarce i zakładkę „Certyfikaty SSL”.' },
      { id: 's04.k4', tekst: 'Dodaj albo zmień rekord DNS (np. TXT) i sprawdź, czy się zapisał.' },
    ],
    uwagi: [
      'Czy instrukcja DNS była zrozumiała bez szukania w internecie?',
      'Czy panel pokazał, kiedy domena zaczęła działać?',
      'Czy certyfikat włączył się sam, bez Twojej akcji?',
    ],
  },
  {
    // Paczka 123 (8.11.2026) – Verris Kreator. Po domenie (s04): publikacja wymaga domeny dodanej do hostingu.
    id: 's17',
    tytul: 'Kreator stron',
    czas: 'ok. 20 min',
    cel: 'Nowa funkcja: strona firmowa z opisu, poprawiona na podglądzie i opublikowana na domenie. Sprawdzamy, czy da się to zrobić bez instrukcji – i bezpiecznie wycofać.',
    weryfikacja: [
      'Strona z kreatora otwiera się pod Twoją domeną (w okresie próbnym – pod linkiem podglądu) ze zmienionym tekstem i zdjęciem.',
      'Na stronie nie ma danych, których nie podałeś(-aś): cen, opinii klientów, telefonu ani adresu.',
      'Po wycofaniu publikacji pod domeną jest znów poprzednia strona (albo nic, jeśli katalog był pusty).',
    ],
    kroki: [
      { id: 's17.k1', tekst: 'W „Kreatorze stron” kliknij „Nowa strona”, opisz firmę (swoją albo wymyśloną) i poczekaj na gotową stronę.' },
      { id: 's17.k2', tekst: 'Włącz „Edycję na stronie”, kliknij nagłówek na podglądzie i zmień jego tekst.' },
      { id: 's17.k3', tekst: 'Kliknij zdjęcie na podglądzie i podmień je: wgraj własne albo wybierz z biblioteki, ustaw kadr i opis zdjęcia.' },
      {
        id: 's17.k4',
        tekst:
          'Kliknij „Publikuj” i opublikuj stronę na swojej domenie (w okresie próbnym – podgląd pod linkiem), a potem otwórz ją w przeglądarce. Na domenie jest już strona? Kreator zapyta o zastąpienie, a obecne pliki trafią do kopii.',
      },
      { id: 's17.k5', tekst: 'W oknie publikacji kliknij „Wycofaj publikację” i sprawdź, co jest teraz pod Twoją domeną.' },
    ],
    uwagi: [
      'Czy opis firmy było łatwo napisać? Czego zabrakło w formularzu?',
      'Czy AI coś wymyśliło (cenę, opinię, liczbę klientów, nagrodę)? Zapisz dokładnie co i gdzie.',
      'Czy przed publikacją było jasne, co stanie się z plikami, które już były na domenie?',
      'Czy edycja tekstu i zdjęć działała tak, jak się spodziewałeś(-aś) – także na telefonie?',
    ],
  },
  {
    id: 's05',
    tytul: 'Poczta: skrzynka, wysyłka, odbiór, telefon',
    czas: 'ok. 15 min',
    cel: 'Poczta w domenie firmy musi działać od razu – i trafiać do odebranych, nie do spamu.',
    poczta: true,
    weryfikacja: [
      'Mail wysłany do Gmaila (albo innej poczty) trafia do odebranych, nie do spamu.',
      'Odpowiedź widać w webmailu i w telefonie.',
      'Przekierowanie albo autoodpowiedź zadziałały na wiadomości testowej.',
    ],
    kroki: [
      { id: 's05.k1', tekst: 'Załóż skrzynkę w swojej domenie w zakładce „Poczta”.' },
      { id: 's05.k2', tekst: 'Wyślij maila na prywatny adres (np. Gmail) i odpisz na niego.' },
      { id: 's05.k3', tekst: 'Zaloguj się do webmaila i znajdź odpowiedź.' },
      { id: 's05.k4', tekst: 'Skonfiguruj skrzynkę w telefonie.' },
      { id: 's05.k5', tekst: 'Ustaw przekierowanie albo autoodpowiedź i sprawdź, że działa.' },
    ],
    uwagi: [
      'Czy wysłany mail trafił do odebranych, a nie do spamu?',
      'Czy dane do konfiguracji telefonu łatwo było znaleźć?',
      'Czy webmail był zrozumiały?',
    ],
  },
  {
    id: 's12',
    tytul: 'Przeniesienie poczty ze starego hostingu',
    czas: 'ok. 15 min + czas kopiowania',
    cel: 'Dla wielu firm poczta jest ważniejsza niż strona. Sprawdzamy, czy skrzynki przechodzą w całości – z folderami i starymi wiadomościami.',
    poczta: true,
    weryfikacja: [
      'Liczba wiadomości w Odebranych, Wysłanych i własnych folderach zgadza się ze starą skrzynką.',
      'Foldery i podfoldery mają te same nazwy co u poprzedniego dostawcy.',
      'Po zmianie DNS nowe maile przychodzą do skrzynki u nas.',
    ],
    kroki: [
      { id: 's12.k1', tekst: 'Przed migracją zapisz, ile wiadomości masz w głównych folderach starej skrzynki.' },
      { id: 's12.k2', tekst: 'W „Migracjach” uruchom kreator i dodaj skrzynki do przeniesienia (dane IMAP ze starego hostingu).' },
      { id: 's12.k3', tekst: 'Po zakończeniu porównaj w webmailu u nas foldery i liczbę wiadomości.' },
      { id: 's12.k4', tekst: 'Po zmianie DNS wyślij maila z zewnątrz i sprawdź, że trafił do skrzynki u nas.' },
    ],
    uwagi: [
      'Czy wiesz, skąd wziąć dane IMAP i hasło do starej skrzynki?',
      'Czy było jasne, kiedy przełączyć DNS, żeby nie zgubić maili?',
      'Czy coś zginęło: załączniki, foldery, oznaczenia przeczytanych?',
    ],
  },
  {
    id: 's06',
    tytul: 'Kopie zapasowe i odtwarzanie',
    czas: 'ok. 10 min',
    cel: 'Kopie robimy co noc poza serwerem. Sprawdzamy, czy umiesz z nich skorzystać sam, zanim będzie to pilne.',
    weryfikacja: [
      'Odtworzony plik ma tę samą treść co przed usunięciem.',
      'Strona działa po odtworzeniu bazy.',
      'Kopia zrobiona ręcznie jest na liście z dzisiejszą datą.',
    ],
    kroki: [
      { id: 's06.k1', tekst: 'Otwórz „Kopie zapasowe” i znajdź najnowszą kopię strony.' },
      { id: 's06.k2', tekst: 'Usuń testowy plik w „Menedżerze plików” i odtwórz go z kopii.' },
      { id: 's06.k3', tekst: 'Odtwórz bazę danych z kopii (na stronie testowej albo stagingu).' },
      { id: 's06.k4', tekst: 'Zrób kopię ręcznie i sprawdź, że pojawiła się na liście.' },
    ],
    uwagi: [
      'Czy było jasne, z którego dnia i godziny jest kopia?',
      'Czy odtworzenie nadpisało coś, czego się nie spodziewałeś(-aś)?',
      'Ile trwało odtworzenie?',
    ],
  },
  {
    id: 's07',
    tytul: 'Staging i narzędzia strony',
    czas: 'ok. 10 min',
    cel: 'Rzeczy, po które sięgają bardziej zaawansowani: kopia testowa, wersja PHP, bazy, FTP, cron.',
    weryfikacja: [
      'Zmiana zrobiona na stagingu nie pojawia się na prawdziwej stronie.',
      'Po zmianie wersji PHP strona działa.',
      'Połączenie FTP pokazuje pliki strony.',
    ],
    kroki: [
      { id: 's07.k1', tekst: 'Utwórz staging (kopię testową) strony i zmień w niej coś widocznego.' },
      { id: 's07.k2', tekst: 'Zmień wersję PHP w „PHP i serwer” i sprawdź, że strona działa.' },
      { id: 's07.k3', tekst: 'Otwórz bazę w phpMyAdmin z „Baz danych”.' },
      { id: 's07.k4', tekst: 'Utwórz konto FTP i połącz się nim (np. FileZillą).' },
    ],
    uwagi: [
      'Czy staging wyraźnie różni się od wersji produkcyjnej (nie pomylisz ich)?',
      'Czy coś wymagało wiedzy, której zwykły klient nie ma?',
    ],
  },
  {
    id: 's08',
    tytul: 'Asystent AI w panelu',
    czas: 'ok. 10 min',
    cel: 'Asystent ma odpowiadać na pytania o Twoją usługę tak, żeby nie trzeba było pisać do pomocy.',
    weryfikacja: [
      'Rady asystenta prowadzą do ekranów, które naprawdę są w panelu.',
      'Na pytanie o Twoją usługę dostajesz dane Twojego konta, a nie ogólnik.',
      'Na pytanie spoza jego wiedzy asystent mówi, że nie wie, albo kieruje do pomocy.',
    ],
    kroki: [
      { id: 's08.k1', tekst: 'Zapytaj asystenta, jak podpiąć domenę do Twojego hostingu.' },
      { id: 's08.k2', tekst: 'Zapytaj o coś związanego z Twoją usługą (np. ile miejsca zostało, kiedy odnowienie).' },
      { id: 's08.k3', tekst: 'Zadaj pytanie, na które odpowiedź powinna brzmieć „nie wiem” albo „napisz do pomocy”.' },
      { id: 's08.k4', tekst: 'Wykonaj radę asystenta krok po kroku i sprawdź, czy prowadzi do celu.' },
    ],
    uwagi: [
      'Czy odpowiedź była konkretna dla Twojego konta, czy ogólna?',
      'Czy asystent coś wymyślił (nieistniejący przycisk, zła ścieżka)? Zapisz dokładnie.',
      'Czy było widać, że odpowiada AI?',
    ],
  },
  {
    id: 's09',
    tytul: 'Zużycie, prognoza i autoskalowanie',
    czas: 'ok. 5 min',
    cel: 'Klient ma rozumieć, ile zasobów zużywa strona i co się stanie w szczycie ruchu – zanim zobaczy rachunek.',
    weryfikacja: [
      'Wiesz, ile dysku, procesora i pamięci zużywasz teraz.',
      'Widzisz, czy masz ustawiony limit kosztu na 30 dni (domyślnie bez limitu) i gdzie go zmienić.',
      'Wynik z kalkulatora zgadza się ze stawkami w cenniku.',
    ],
    kroki: [
      { id: 's09.k1', tekst: 'Otwórz „Zużycie i prognoza” i sprawdź dysk, procesor i pamięć.' },
      { id: 's09.k2', tekst: 'Przeczytaj prognozę: kiedy (i czy) zabraknie zasobów.' },
      { id: 's09.k3', tekst: 'Sprawdź ustawienia autoskalowania i limit kosztu na 30 dni (suma dopłat z ostatnich 30 dni).' },
      { id: 's09.k4', tekst: 'Policz w kalkulatorze, ile kosztowałby dzień z dużym ruchem.' },
    ],
    uwagi: [
      'Czy wykresy i prognoza mówią coś zrozumiałego dla nie-informatyka?',
      'Czy wiesz, że bez limitu płacisz za faktyczne użycie, i umiesz ustawić własny limit kosztu?',
    ],
  },
  {
    id: 's13',
    tytul: 'Płatności, faktury i odnowienie',
    czas: 'ok. 10 min',
    cel: 'Pieniądze muszą się zgadzać co do grosza: doładowanie, faktura z Twoimi danymi i jasna data odnowienia.',
    poczta: true,
    weryfikacja: [
      'Faktura ma Twoje dane (firma z NIP albo imię i nazwisko), kwotę brutto i stawkę VAT.',
      'Saldo portfela rośnie dokładnie o kwotę doładowania.',
      'Data odnowienia w usłudze zgadza się z okresem, za który zapłacono.',
    ],
    kroki: [
      { id: 's13.k1', tekst: 'W „Płatnościach” uzupełnij dane do faktury (firma z NIP albo osoba prywatna).' },
      { id: 's13.k2', tekst: 'Doładuj portfel najmniejszą możliwą kwotą BLIK-iem albo kartą.' },
      { id: 's13.k3', tekst: 'Pobierz fakturę za doładowanie i sprawdź dane, kwoty i VAT.' },
      { id: 's13.k4', tekst: 'W usłudze, w zakładce „Subskrypcja i płatności”, sprawdź datę odnowienia i z czego zostanie opłacone.' },
    ],
    uwagi: [
      'Czy wiesz, ile i kiedy zapłacisz przy odnowieniu?',
      'Czy coś na fakturze Cię zdziwiło (nazwa usługi, okres, kwota)?',
    ],
  },
  {
    id: 's14',
    tytul: 'Dostęp dla współpracownika',
    czas: 'ok. 10 min',
    cel: 'Firmy i agencje dają dostęp księgowej, pracownikowi albo grafikowi. Taka osoba ma widzieć tylko to, do czego ją zaprosisz.',
    poczta: true,
    weryfikacja: [
      'Zaproszona osoba widzi tylko usługi i sekcje, do których dostała dostęp.',
      'Nie widzi płatności ani portfela, jeśli nie dostała do nich uprawnień.',
      'Po odebraniu dostępu nie może już wejść do Twojej usługi.',
    ],
    kroki: [
      { id: 's14.k1', tekst: 'W „IAM i subkonta” przyciskiem „Zaproś osobę” zaproś drugi adres e-mail – tylko z dostępem do poczty.' },
      { id: 's14.k2', tekst: 'Przyjmij zaproszenie jako ta osoba i sprawdź, co widzi w panelu.' },
      { id: 's14.k3', tekst: 'Odbierz jej dostęp i sprawdź, że już nie może wejść do usługi.' },
    ],
    uwagi: [
      'Czy nazwy uprawnień były zrozumiałe?',
      'Czy widać, kto i kiedy coś zmienił na Twoim koncie?',
    ],
  },
  {
    id: 's10',
    tytul: 'Pomoc i zgłoszenia',
    czas: 'ok. 5 min',
    cel: 'Sprawdzamy całą drogę do człowieka: od bazy wiedzy po odpowiedź w zgłoszeniu.',
    poczta: true,
    weryfikacja: [
      'Odpowiedź pojawia się w zgłoszeniu i dostajesz o niej powiadomienie.',
      'Zgłoszenie da się ocenić po odpowiedzi.',
    ],
    kroki: [
      { id: 's10.k1', tekst: 'Znajdź w bazie wiedzy odpowiedź na jedno własne pytanie.' },
      { id: 's10.k2', tekst: 'Wyślij zgłoszenie w „Centrum pomocy” z prawdziwym pytaniem (temat „Testy (beta)”).' },
      { id: 's10.k3', tekst: 'Oceń odpowiedź w zgłoszeniu.' },
    ],
    uwagi: [
      'Ile czekałeś(-aś) na pierwszą odpowiedź?',
      'Czy odpowiedź rozwiązała problem bez dopytywania?',
    ],
  },
  {
    id: 's11',
    tytul: 'Wszystko jeszcze raz – z telefonu',
    czas: 'ok. 15 min',
    cel: 'Połowa klientów zajrzy do panelu z telefonu, często w pośpiechu.',
    poczta: true,
    weryfikacja: [
      'Wszystkie sprawdzone ekrany da się obsłużyć na telefonie bez przewijania w bok.',
      'Zmiana zrobiona na telefonie jest widoczna na komputerze.',
    ],
    kroki: [
      { id: 's11.k1', tekst: 'Zaloguj się do panelu na telefonie.' },
      { id: 's11.k2', tekst: 'Sprawdź stan usługi, pocztę, kopie i zgłoszenia.' },
      { id: 's11.k3', tekst: 'Zmień coś drobnego (np. przekierowanie poczty albo rekord DNS).' },
    ],
    uwagi: [
      'Czy coś się nie mieści albo trzeba przewijać w bok?',
      'Czy przyciski łatwo trafić palcem?',
      'Czego brakowało w porównaniu z komputerem?',
    ],
  },
  {
    id: 's15',
    tytul: 'Deploy z Gita i budowanie strony',
    czas: 'ok. 20 min',
    cel: 'Dla programistów i agencji: strona z repozytorium, budowana na serwerze, z sekretami poza kodem.',
    opcjonalny: true,
    weryfikacja: [
      'Log budowania pokazuje wynik i czas, a strona działa po wdrożeniu.',
      'Zmiana wypchnięta do repozytorium pojawia się na stronie (webhook albo „Pobierz zmiany teraz”).',
      'Adresy /.git/config i /.env na Twojej domenie nie otwierają się (błąd 403 albo 404).',
    ],
    kroki: [
      { id: 's15.k1', tekst: 'W usłudze, w zakładce „Deploy (Git)”, sklonuj swoje repozytorium (publiczne albo z kluczem wdrożeniowym konta).' },
      { id: 's15.k2', tekst: 'Wybierz sposób budowania (npm albo composer), dodaj zmienną środowiskową i zapisz ustawienia.' },
      { id: 's15.k3', tekst: 'Wypchnij zmianę do repozytorium i sprawdź, czy strona się zaktualizowała.' },
      { id: 's15.k4', tekst: 'Otwórz w przeglądarce /.git/config i /.env na swojej domenie – nie powinny się otworzyć.' },
    ],
    uwagi: [
      'Czy log budowania pomógł znaleźć przyczynę błędu?',
      'Czego zabrakło w porównaniu z Twoim zwykłym wdrażaniem (np. Vercel, Netlify, własny serwer)?',
    ],
  },
  {
    id: 's16',
    tytul: 'Aplikacja Node.js albo Python, SSH i cron',
    czas: 'ok. 20 min',
    cel: 'Rzeczy dla bardziej technicznych: aplikacja Node.js albo Python, dostęp SSH i zadania uruchamiane cyklicznie.',
    opcjonalny: true,
    weryfikacja: [
      'Aplikacja odpowiada pod swoim adresem i działa po restarcie.',
      'Logujesz się przez SSH kluczem i widzisz tylko pliki swojego konta.',
      'Zadanie cron wykonuje się o czasie (widać to w pliku, który zapisuje).',
    ],
    kroki: [
      { id: 's16.k1', tekst: 'W „Aplikacjach 1-click” utwórz aplikację Node.js albo Python i otwórz ją w przeglądarce.' },
      { id: 's16.k2', tekst: 'Zrestartuj ją przyciskiem „Restart” i sprawdź, że dalej działa.' },
      { id: 's16.k3', tekst: 'W „FTP i SSH” włącz dostęp SSH i zaloguj się swoim kluczem.' },
      { id: 's16.k4', tekst: 'W „Zadaniach cron” dodaj zadanie co 5 minut, które dopisuje linię do pliku, i sprawdź plik po 15 minutach.' },
    ],
    uwagi: [
      'Czy instrukcja uruchomienia aplikacji wystarczyła bez szukania w internecie?',
      'Czy w SSH czegoś brakowało (np. git, composer, npm)?',
    ],
  },
];

/** Wszystkie identyfikatory kroków (walidacja zapisu w API). */
export const KROKI_BETA_IDS: ReadonlySet<string> = new Set(SCENARIUSZE_BETA.flatMap((s) => s.kroki.map((k) => k.id)));
export const SCENARIUSZE_BETA_IDS: ReadonlySet<string> = new Set(SCENARIUSZE_BETA.map((s) => s.id));
/** Kroki scenariuszy obowiązkowych — tylko one liczą się do postępu (blok techniczny jest opcjonalny). */
export const KROKI_BETA_WYMAGANE: ReadonlySet<string> = new Set(
  SCENARIUSZE_BETA.filter((s) => !s.opcjonalny).flatMap((s) => s.kroki.map((k) => k.id)),
);
export const LICZBA_KROKOW_BETA = KROKI_BETA_WYMAGANE.size;
/** P4-12 — scenariusze dla testera, który sprawdza tylko pocztę (oznaczenie w panelu, lista w zaproszeniu). */
export const SCENARIUSZE_BETA_POCZTA: readonly ScenariuszBeta[] = SCENARIUSZE_BETA.filter((s) => s.poczta);
export const MAKS_DLUGOSC_UWAGI_BETA = 2000;

/** Postęp testera: kroki odhaczone (id → kiedy) i uwagi do scenariuszy (id → tekst). */
export interface PostepBetaDto {
  tester: boolean;
  kroki: Record<string, string>;
  uwagi: Record<string, string>;
  zaktualizowano: string | null;
  /** P4-12 — zaproszenie ze zgłoszenia tylko z zakresem „Poczta”: pulpit liczy kroki scenariuszy poczty. */
  tylkoPoczta?: boolean;
}

/** Ile kroków odhaczono — tylko kroki scenariuszy obowiązkowych (opcjonalne i usunięte z listy nie liczą się). */
export function policzPostepBeta(kroki: Record<string, unknown> | null | undefined): { zrobione: number; wszystkie: number } {
  const zrobione = Object.keys(kroki ?? {}).filter((id) => KROKI_BETA_WYMAGANE.has(id)).length;
  return { zrobione, wszystkie: LICZBA_KROKOW_BETA };
}
