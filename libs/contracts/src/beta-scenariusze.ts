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
}

export const SCENARIUSZE_BETA: ScenariuszBeta[] = [
  {
    id: 's01',
    tytul: 'Konto i bezpieczeństwo',
    czas: 'ok. 5 min',
    cel: 'Pierwsze minuty z Verris: czy założenie i zabezpieczenie konta jest proste i nie budzi wątpliwości.',
    weryfikacja: [
      'Mail z linkiem potwierdzającym przychodzi w ciągu kilku minut.',
      'Po wylogowaniu logowanie prosi o drugi składnik (kod albo passkey).',
      'W ustawieniach bezpieczeństwa widać włączoną metodę.',
    ],
    kroki: [
      { id: 's01.k1', tekst: 'Załóż konto przyciskiem z maila z zaproszeniem.' },
      { id: 's01.k2', tekst: 'Potwierdź adres e-mail linkiem z wiadomości.' },
      { id: 's01.k3', tekst: 'Włącz weryfikację dwuetapową albo klucz dostępu (passkey).' },
      { id: 's01.k4', tekst: 'Wyloguj się i zaloguj ponownie — także drugim składnikiem.' },
    ],
    uwagi: [
      'Czy mail z potwierdzeniem przyszedł szybko? Sprawdź też Oferty i Spam.',
      'Czy komunikaty błędów w formularzu mówią, co poprawić?',
      'Czy wiesz, co zrobić, gdy zgubisz telefon z 2FA?',
    ],
  },
  {
    id: 's02',
    tytul: 'Kod testera, portfel i zakup hostingu',
    czas: 'ok. 5 min',
    cel: 'Ścieżka zakupu tak, jak przejdzie ją każdy klient — z tą różnicą, że płacisz kredytami z kodu.',
    weryfikacja: [
      'Przed zakupem portfel pokazuje 150 K, po zakupie — 150 K minus cena usługi.',
      'Usługa ma stan „Aktywna”, a jej przegląd otwiera się bez błędów.',
      'Faktura za zakup jest w „Płatnościach”.',
    ],
    kroki: [
      { id: 's02.k1', tekst: 'W „Płatnościach” wpisz kod testera w polu kodu promocyjnego.' },
      { id: 's02.k2', tekst: 'Sprawdź, że w portfelu jest 150 K.' },
      { id: 's02.k3', tekst: 'Zamów hosting z portfela i podaj swoją domenę.' },
      { id: 's02.k4', tekst: 'Poczekaj, aż usługa będzie aktywna, i otwórz jej przegląd.' },
      { id: 's02.k5', tekst: 'Znajdź fakturę za zakup w „Płatnościach”.' },
    ],
    uwagi: [
      'Czy przed zakupem było jasne, co dostajesz i ile to kosztuje?',
      'Czy saldo portfela po zakupie się zgadza?',
      'Ile minut minęło od zamówienia do działającej usługi?',
    ],
  },
  {
    id: 's03',
    tytul: 'Przeniesienie strony albo nowy WordPress',
    czas: '15–30 min',
    cel: 'Najważniejszy test: czy strona po przeniesieniu działa tak jak wcześniej — bez naszej pomocy.',
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
    id: 's05',
    tytul: 'Poczta: skrzynka, wysyłka, odbiór, telefon',
    czas: 'ok. 15 min',
    cel: 'Poczta w domenie firmy musi działać od razu — i trafiać do odebranych, nie do spamu.',
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
    cel: 'Klient ma rozumieć, ile zasobów zużywa strona i co się stanie w szczycie ruchu — zanim zobaczy rachunek.',
    weryfikacja: [
      'Wiesz, ile dysku, procesora i pamięci zużywasz teraz.',
      'Widzisz, gdzie ustawić limit wydatków na dodatkową moc i jaki jest teraz.',
      'Wynik z kalkulatora zgadza się ze stawkami w cenniku.',
    ],
    kroki: [
      { id: 's09.k1', tekst: 'Otwórz „Zużycie i prognoza” i sprawdź dysk, procesor i pamięć.' },
      { id: 's09.k2', tekst: 'Przeczytaj prognozę: kiedy (i czy) zabraknie zasobów.' },
      { id: 's09.k3', tekst: 'Sprawdź ustawienia autoskalowania i limit wydatków na dodatkową moc.' },
      { id: 's09.k4', tekst: 'Policz w kalkulatorze, ile kosztowałby dzień z dużym ruchem.' },
    ],
    uwagi: [
      'Czy wykresy i prognoza mówią coś zrozumiałego dla nie-informatyka?',
      'Czy wiesz, ile maksymalnie zapłacisz za autoskalowanie w miesiącu?',
    ],
  },
  {
    id: 's10',
    tytul: 'Pomoc i zgłoszenia',
    czas: 'ok. 5 min',
    cel: 'Sprawdzamy całą drogę do człowieka: od bazy wiedzy po odpowiedź w zgłoszeniu.',
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
    tytul: 'Wszystko jeszcze raz — z telefonu',
    czas: 'ok. 15 min',
    cel: 'Połowa klientów zajrzy do panelu z telefonu, często w pośpiechu.',
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
];

/** Wszystkie identyfikatory kroków (walidacja zapisu w API). */
export const KROKI_BETA_IDS: ReadonlySet<string> = new Set(SCENARIUSZE_BETA.flatMap((s) => s.kroki.map((k) => k.id)));
export const SCENARIUSZE_BETA_IDS: ReadonlySet<string> = new Set(SCENARIUSZE_BETA.map((s) => s.id));
export const LICZBA_KROKOW_BETA = KROKI_BETA_IDS.size;
export const MAKS_DLUGOSC_UWAGI_BETA = 2000;

/** Postęp testera: kroki odhaczone (id → kiedy) i uwagi do scenariuszy (id → tekst). */
export interface PostepBetaDto {
  tester: boolean;
  kroki: Record<string, string>;
  uwagi: Record<string, string>;
  zaktualizowano: string | null;
}

/** Ile kroków odhaczono — tylko znane identyfikatory (stare, usunięte z listy nie liczą się). */
export function policzPostepBeta(kroki: Record<string, unknown> | null | undefined): { zrobione: number; wszystkie: number } {
  const zrobione = Object.keys(kroki ?? {}).filter((id) => KROKI_BETA_IDS.has(id)).length;
  return { zrobione, wszystkie: LICZBA_KROKOW_BETA };
}
