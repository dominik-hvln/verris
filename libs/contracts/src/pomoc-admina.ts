/**
 * Słownik pomocy „?” panelu admina (propozycja 10.10, sekcja D). Jedno źródło opisu dla ikonki „?”,
 * listy „Działania”, Cmd+K oraz asystenta AI pracowników: API dopisuje wpis do promptu, gdy pracownik pyta
 * o funkcję, i synchronizuje cały słownik do indeksu wiedzy jako dokumenty STAFF
 * (apps/api/src/ai/wiedza-staff.ts). Treści krótkie: opis i „kiedy” po jednym zdaniu. Bez sekretów,
 * adresów IP i danych klientów.
 */
export interface WpisPomocy {
  tytul: string;
  opis: string;
  kiedy?: string;
  rozniSieOd?: string;
}

export const POMOC = {
  kreator: {
    tytul: "Kreator węzła",
    opis: "Prowadzi krok po kroku przez zakładanie nowego węzła.",
    kiedy: "Tylko dla nowego węzła — operacje na działającym są na jego karcie.",
  },
  "onboard-live": {
    tytul: "Onboard LIVE",
    opis: "Wgrywa aktualne skrypty Verris (worker migracji, guard, agent), hardening i blokadę ruchu wychodzącego, a na końcu robi raport gotowości.",
    kiedy: "Po deployu zmian w skryptach węzła albo gdy raport gotowości jest czerwony.",
    rozniSieOd: "Aktualizacja stosu zmienia wersje DirectAdmina, CloudLinuksa i LiteSpeeda; Onboard LIVE — skrypty i zabezpieczenia Verris.",
  },
  stos: {
    tytul: "Aktualizacja stosu",
    opis: "Aktualizuje DirectAdmin, CloudLinux i LiteSpeed do najnowszych stabilnych wersji.",
    kiedy: "Po zmianie manifestu stosu albo poprawce bezpieczeństwa producenta.",
    rozniSieOd: "Nie wgrywa skryptów Verris — od tego jest Onboard LIVE.",
  },
  "baza-danych": {
    tytul: "Aktualizacja bazy danych",
    opis: "Zleca agentowi upgrade MariaDB do wersji docelowej floty.",
    kiedy: "Gdy wersja na węźle jest niższa niż docelowa — najlepiej po godzinach.",
  },
  profil: {
    tytul: "Profil hostingu",
    opis: "Ponownie stosuje ustawienia hostingu: poczta, FTP, bazy, CageFS, PHP i strony błędów.",
    kiedy: "Po zmianie profilu albo gdy audyt pokazuje różnice w usługach.",
    rozniSieOd: "Nie zmienia pakietów DA — do tego „Napraw pakiety DA” w Audycie.",
  },
  audyt: {
    tytul: "Audyt zgodności",
    opis: "Porównuje węzeł z planem i dokumentacją DirectAdmina i CloudLinuksa, a przy różnicach proponuje naprawę.",
    kiedy: "Po instalacji, po aktualizacji i przy problemach z kontami.",
  },
  uslugi: {
    tytul: "Usługi hostingowe i pakiety DA",
    opis: "Instaluje i uruchamia brakujące usługi (poczta, FTP, baza, WWW) oraz przywraca limity pakietów DA z planów Verris.",
    kiedy: "Gdy brakuje usługi albo pakiet w DA pokazuje „Bez ograniczeń”.",
  },
  "sonda-da": {
    tytul: "Sonda API DirectAdmina",
    opis: "Sprawdza na jednym koncie, czy odpowiedzi API DirectAdmina mają kształt, którego używa panel. Niczego nie zmienia.",
    kiedy: "Po aktualizacji DirectAdmina.",
  },
  "nowe-konta": {
    tytul: "Przyjmuje nowe konta",
    opis: "Wyłączone — na tym węźle nie powstają nowe konta; istniejące działają bez zmian.",
    kiedy: "Gdy węzeł się zapełnia albo przed pracami.",
    rozniSieOd: "Tryb serwisowy dodatkowo pokazuje klientom powód; wycofanie kończy się przeniesieniem kont.",
  },
  serwis: {
    tytul: "Tryb serwisowy",
    opis: "Blokuje zakładanie kont na czas prac i pokazuje klientom powód zamiast błędu.",
    kiedy: "Na czas planowanych prac na węźle.",
    rozniSieOd: "„Komunikaty o pracach” w Product Ops to zapowiedzi dla klientów (zapowiedziane 48 h wcześniej nie liczą się do SLA) — węzła nie zmieniają.",
  },
  offline: {
    tytul: "Offline",
    opis: "Wyłącza węzeł z użycia: nie dostaje kont i nie liczy się do gotowości startu.",
    kiedy: "Gdy serwera fizycznie nie ma albo jest wyłączony na dłużej.",
  },
  wycofanie: {
    tytul: "Wycofanie",
    opis: "Zamyka węzeł dla nowych kont i pokazuje plan przeniesienia kont. Danych nie przenosi.",
    kiedy: "Przed wymianą albo likwidacją serwera.",
    rozniSieOd: "Wstrzymanie nowych kont jest chwilowe; wycofanie prowadzi do opróżnienia węzła.",
  },
  directadmin: {
    tytul: "DirectAdmin API",
    opis: "Adres, login i klucz API DirectAdmina węzła; test sprawdza połączenie.",
    kiedy: "Po akceptacji nowego węzła albo zmianie klucza.",
  },
  "kopie-offsite": {
    tytul: "Kopie offsite",
    opis: "Jedna konfiguracja Storage Boxa i szyfrowania dla całej floty — bez niej Onboard LIVE się zatrzymuje.",
    kiedy: "Raz przed pierwszym węzłem; zmiana hasła lub soli odcina dostęp do starszych kopii.",
  },
  // Fala 1B — działania na kartach z gotowych endpointów API.
  "dane-nabywcy": {
    tytul: "Dane nabywcy",
    opis: "Zmienia kraj i NIP klienta, które trafiają na kolejne faktury.",
    kiedy: "Gdy klient zgłosi błędny NIP albo kraj, a sam nie może go już zmienić.",
    rozniSieOd: "Wystawionej faktury nie poprawia — do tego służy korekta.",
  },
  komunikacja: {
    tytul: "Komunikacja",
    opis: "Maile wysłane do klienta z dziennika poczty; linki jednorazowe są zamaskowane.",
    kiedy: "Gdy klient mówi, że nie dostał maila (reset hasła, faktura, aktywacja).",
  },
  upo: {
    tytul: "Pobierz UPO",
    opis: "Pobiera z KSeF urzędowe poświadczenie przyjęcia faktury (XML).",
    kiedy: "Do archiwum albo gdy księgowa lub klient prosi o dowód przesłania.",
  },
  "dokoncz-fakture": {
    tytul: "Dokończ wystawienie",
    opis: "Nadaje numer i tworzy PDF opłaconej faktury, której automat nie dokończył.",
    kiedy: "Gdy opłacona faktura wisi bez PDF-u mimo ponowień automatu.",
  },
  "nieudane-platnosci": {
    tytul: "Nieudane płatności",
    opis: "Odrzucone i niedokończone płatności: Paynow, auto-doładowanie z karty i odnowienia kartą. Ponowić z panelu można tylko auto-doładowanie — obciąża zapisaną kartę klienta kwotą z jego reguły.",
    kiedy: "Przy porannym przeglądzie Finansów i gdy klient pisze, że płatność nie przeszła.",
    rozniSieOd: "Płatność Paynow ponawia klient w swoim panelu; odnowienie kartą ponawia operator kart.",
  },
  windykacja: {
    tytul: "Przypomnienia i zawieszenia",
    opis: "Kiedy klient dostał przypomnienia o odnowieniu i kiedy harmonogram zawiesi albo zakończy usługę, jeśli nie zapłaci. Progi są w kodzie — tu tylko podgląd.",
    kiedy: "Zanim odpowiesz klientowi „kiedy wyłączycie mi stronę” albo przed obietnicą zapłaty.",
  },
  "wplata-przelewem": {
    tytul: "Zaksięguj przelew",
    opis: "Wpłata na rachunek trafia na portfel klienta tą samą ścieżką co płatność online: kredyty, dokument za wpłatę i mail do klienta. Referencja z wyciągu chroni przed podwójnym zaksięgowaniem.",
    kiedy: "Gdy przelew klienta jest na wyciągu, a portfel go jeszcze nie ma.",
    rozniSieOd: "Korekta salda nie jest wpłatą — nie tworzy dokumentu i nie wysyła maila.",
  },
  "korekta-salda": {
    tytul: "Korekta salda",
    opis: "Dopisanie albo odjęcie kredytów z portfela z powodem w dzienniku. Klient widzi „Korekta salda — obsługa Verris”, bez powodu i nazwiska. Saldo nie zejdzie poniżej zera.",
    kiedy: "Pomyłka w księdze, rekompensata albo cofnięcie błędnego uznania.",
    rozniSieOd: "Wpłatę z wyciągu księguje się przez „Zaksięguj przelew”.",
  },
  "kopie-floty": {
    tytul: "Kopie floty",
    opis: "Kopia każdego konta poza serwerem: ostatni przebieg każdego węzła, konta z nieudaną albo starą kopią, harmonogram, retencja i kopia bazy panelu.",
    kiedy: "Przy porannym przeglądzie floty i po alercie o koncie bez świeżej kopii — zanim klient będzie jej potrzebował.",
  },
  "proby-odtworzenia": {
    tytul: "Próby odtworzenia kopii",
    opis: "Historia testów odtworzenia bazy z kopii: data, wynik, czas i kto odpowiada.",
    kiedy: "Przed startem i po zmianach w kopiach — kopia bez udanej próby nie jest dowodem.",
  },
  "zadania-w-tle": {
    tytul: "Zadania w tle",
    opis: "Automaty API (odnowienia, faktury, sondy, retencja): kiedy biegły, ile trwały, ostatni błąd i następny termin.",
    kiedy: "Gdy coś „samo się nie zrobiło” albo przyszedł alert, że zadanie nie biegnie od dwóch terminów.",
    rozniSieOd: "Kolejka zadań to operacje na węzłach; tu są harmonogramy samego API.",
  },
  "zawies-skrzynke": {
    tytul: "Zawieś skrzynkę",
    opis: "Wyłącza skrzynkę zespołu: znika z map poczty, więc nie przyjmuje maili, aliasów ani logowania IMAP.",
    kiedy: "Gdy pracownik odchodzi albo hasło mogło wyciec.",
  },
  // Fala 1B — działania z patchy 9–11 porządków (usługa, faktura, klient), których brakowało w słowniku.
  zakladanie: {
    tytul: "Ponów albo odrzuć zakładanie",
    opis: "Ponawia nieudane zakładanie konta na węźle albo usuwa martwe zadanie z kolejki, z powodem w dzienniku.",
    kiedy: "Gdy usługa utknęła w zakładaniu: ponów po usunięciu przyczyny, odrzuć, gdy konta nie da się założyć.",
  },
  "zlecenia-migracji": {
    tytul: "Zlecenia migracji",
    opis: "Migracje tej usługi z krokami: ponowienie kroku, który padł, i zamknięcie uwagi przy migracji.",
    kiedy: "Gdy migracja stoi na błędzie albo czeka na decyzję zespołu.",
  },
  // F2.2 — pasek akcji konta na karcie usługi.
  "akcje-konta": {
    tytul: "Akcje na koncie",
    opis: "Reset hasła skrzynki, FTP i bazy, ponowny certyfikat SSL, zmiana PHP, kopia i skan malware na koncie klienta bez wchodzenia na nie.",
    kiedy: "Gdy klient prosi o pomoc albo konto trzeba szybko zabezpieczyć — zawsze z powodem i numerem zgłoszenia.",
    rozniSieOd: "Wejście na konto klienta otwiera cały jego panel; tu są tylko wybrane akcje, a nowych haseł nikt z obsługi nie widzi.",
  },
  "blokada-wysylki": {
    tytul: "Blokada wysyłki konta",
    opis: "Zatrzymuje na serwerze całą wysyłkę poczty konta (skrzynki i skrypty PHP), a zwolnienie przywraca poprzedni stan.",
    kiedy: "Gdy z konta idzie spam albo IP serwera trafiło na listę RBL — przed zawieszeniem usługi.",
    rozniSieOd: "Zawieszenie wyłącza całą usługę; blokada zatrzymuje tylko wysyłkę, a strona i odbiór poczty działają.",
  },
  "kolejka-poczty": {
    tytul: "Kolejka poczty konta",
    opis: "Pokazuje nagłówki wiadomości konta czekających na wysyłkę (nadawca, odbiorcy, temat, wiek) bez treści.",
    kiedy: "Gdy klient pyta, czemu mail nie doszedł, albo trzeba usunąć spam konta, zanim wyjdzie.",
    rozniSieOd: "Dziennik poczty pokazuje to, co już wyszło albo zostało odrzucone; kolejka — to, co jeszcze czeka.",
  },
  "limit-wysylki": {
    tytul: "Limit wysyłki konta",
    opis: "Ile wiadomości na dobę może wysłać całe konto (skrzynki i skrypty PHP). Klient widzi ten sam limit w panelu.",
    kiedy: "Przy kampanii klienta (wyższy) albo podejrzanym skoku wysyłki (niższy) — zamiast pełnej blokady.",
    rozniSieOd: "Blokada zatrzymuje całą wysyłkę; limit tylko ogranicza liczbę wiadomości na dobę.",
  },
  "nadawcy-wezla": {
    tytul: "Nadawcy i odrzucenia",
    opis: "Kto z węzła wysyła najwięcej poczty na zewnątrz i jakie serwery ją odrzucają (kody SMTP), bez adresów i treści. Obok sprawdzenie IP węzła na listach RBL.",
    kiedy: "Po alercie RBL, przy rosnącej kolejce albo skargach na niedostarczoną pocztę — żeby znaleźć konto, z którego idzie spam.",
  },
  "kolejka-wezla": {
    tytul: "Kolejka poczty węzła",
    opis: "Nagłówki wszystkich wiadomości czekających na wysyłkę z węzła, z wyszukiwaniem i wypchnięciem kolejki.",
    kiedy: "Gdy kolejka rośnie, poczta stoi po awarii albo trzeba znaleźć konto, z którego idzie spam.",
  },
  "edycja-dns": {
    tytul: "Edycja DNS",
    opis: "Dodaje, zmienia i usuwa rekordy strefy domeny klienta z powodem w dzienniku.",
    kiedy: "Gdy klient prosi o zmianę rekordu — zła wartość może wyłączyć stronę albo pocztę, więc tylko od L3.",
  },
  korekta: {
    tytul: "Wystaw korektę",
    opis: "Wystawia fakturę korygującą (seria VFK) do opłaconej faktury: zwrot, rabat albo poprawka danych nabywcy.",
    kiedy: "Gdy opłaconą fakturę trzeba zmienić — anulować jej już nie można.",
    rozniSieOd: "Anulowanie dotyczy tylko dokumentu nieopłaconego.",
  },
  "anuluj-fakture": {
    tytul: "Anuluj dokument",
    opis: "Unieważnia nieopłacony dokument; bez uprawnienia można wysłać wniosek.",
    kiedy: "Gdy dokument wystawiono przez pomyłkę i nikt go jeszcze nie opłacił.",
    rozniSieOd: "Opłaconą fakturę zmienia się korektą.",
  },
  "ksef-ponow": {
    tytul: "Ponów wysyłkę do KSeF",
    opis: "Wysyła ponownie fakturę odrzuconą przez KSeF.",
    kiedy: "Po poprawieniu danych, które spowodowały odrzucenie.",
  },
  "blokada-poczty": {
    tytul: "Blokada wysyłki poczty",
    opis: "Wysyłka z konta klienta została zablokowana, bo szło z niego podejrzanie dużo poczty.",
    kiedy: "Zdejmij dopiero po usunięciu przyczyny, czyli zmianie hasła skrzynki albo usunięciu skryptu.",
  },
  reseller: {
    tytul: "Reseller",
    opis: "Klient sprzedaje usługi pod własną marką z ustalonym narzutem.",
    kiedy: "Gdy klient zgłosił się jako reseller albo trzeba zmienić jego narzut.",
  },
  "program-partnerski": {
    tytul: "Program partnerski",
    opis: "Akceptacja albo odrzucenie zgłoszenia klienta do programu poleceń.",
    kiedy: "Gdy zgłoszenie czeka na decyzję.",
  },
  "zgloszenie-w-imieniu": {
    tytul: "Nowe zgłoszenie w imieniu klienta",
    opis: "Zakłada zgłoszenie z Twoją wiadomością do klienta, a klient dostaje mail od „Obsługa Verris” bez Twojego nazwiska.",
    kiedy: "Gdy sprawa przyszła telefonem albo to my piszemy pierwsi, na przykład o awarii lub nadużyciu.",
    rozniSieOd: "Notatka o kliencie zostaje w zespole, a zgłoszenie trafia do klienta.",
  },
  "notatka-zgloszenia": {
    tytul: "Notatka wewnętrzna w zgłoszeniu",
    opis: "Wpis w wątku widoczny tylko dla zespołu, bez maila i bez zmiany stanu zgłoszenia.",
    kiedy: "Do przekazania sprawy dalej, ale pisz tak, jakby klient mógł to przeczytać, bo notatki są w jego eksporcie RODO.",
  },
  "eskalacja-zgloszenia": {
    tytul: "Eskalacja zgłoszenia",
    opis: "Podnosi priorytet do pilnego z powodem w dzienniku, a cofnięcie przywraca poprzedni priorytet.",
    kiedy: "Gdy sprawa przerasta Twój szczebel albo grozi utratą klienta.",
  },
  domeny: {
    tytul: "Domeny",
    opis: "Wszystkie domeny platformy z rejestratorem, datą wygaśnięcia i blokadą, a obok nieudane rejestracje i transfery.",
    kiedy: "Gdy klient pyta o domenę albo trzeba wyłapać wygasające domeny i niezrealizowane zamówienia.",
  },
  "kod-epp": {
    tytul: "Kod EPP",
    opis: "Pokazuje kod transferu domeny od rejestratora, a w dzienniku zostaje tylko fakt pokazania z powodem.",
    kiedy: "Gdy klient przenosi domenę do innego rejestratora i nie umie sam pobrać kodu z panelu.",
  },
  "synchronizacja-domeny": {
    tytul: "Synchronizacja z rejestratorem",
    opis: "Pobiera od rejestratora datę wygaśnięcia, blokadę transferu i ukrycie WHOIS, a domenę usuniętą u niego oznacza jako odeszłą.",
    kiedy: "Gdy dane na karcie nie zgadzają się z rejestratorem, na przykład po zmianie w jego panelu.",
  },
  "odnowienie-domeny": {
    tytul: "Odnowienie domeny",
    opis: "Odnawia domenę u rejestratora z portfela klienta (od L3) albo na koszt Verris (tylko L4 i administrator, z powodem).",
    kiedy: "Gdy automatyczne odnowienie się nie udało, a domena zaraz wygaśnie.",
    rozniSieOd: "Na koszt Verris nie pobiera nic z portfela klienta — używaj, gdy błąd był po naszej stronie.",
  },
  "ponowienie-rejestracji": {
    tytul: "Ponowienie rejestracji lub transferu",
    opis: "Składa nieudane zamówienie jeszcze raz na dane tego samego abonenta i znów pobiera opłatę z portfela klienta.",
    kiedy: "Gdy rejestr miał przerwę albo transfer odrzucono przez zły kod, a klient nadal chce domenę.",
  },
  // D11 — tablica migracji obsługi (wzorzec kolejki migracji z Jiry).
  "tablica-migracji": {
    tytul: "Tablica migracji",
    opis: "Migracje w etapach: Nowa, Testy u nas, Do zmiany DNS, Po przełączeniu, Zamknięta; dalej przechodzą dopiero po checkliście.",
    kiedy: "Gdy prowadzisz przeniesienia stron klientów i pilnujesz terminów.",
    rozniSieOd: "Status automatu (w toku, ukończona) mówi, czy dane są przeniesione; etap tablicy mówi, co z migracją robi zespół.",
  },
  "termin-migracji": {
    tytul: "Terminy migracji",
    opis: "Termin migracji (domyślnie 3 dni od zlecenia), wygaśnięcie hostingu u starego dostawcy i domeny; dzwonek ostrzega dobę, a przy wygaśnięciu 3 doby wcześniej.",
    kiedy: "Gdy klientowi kończy się stary hosting albo domena i DNS trzeba przełączyć wcześniej.",
  },
  przerywacz: {
    tytul: "Przerywacz",
    opis: "Pilna migracja, która przerywa kolejkę i stoi na górze tablicy.",
    kiedy: "Gdy stary hosting wygasa za chwilę albo strona klienta nie działa.",
  },
  "checklista-migracji": {
    tytul: "Checklista migracji",
    opis: "Przed zmianą DNS: TTL 300 i wynik testu na tymczasowym adresie. Przy zamknięciu: podsumowanie, optymalizacja i test przed i po, wysłane raportem.",
    kiedy: "Na każdym etapie — bez kompletu etap nie pójdzie dalej.",
  },
  "raport-pomigracyjny": {
    tytul: "Raport pomigracyjny",
    opis: "Mail do klienta z szablonu: podsumowanie, optymalizacja i wynik testu przed i po; w aktywności klienta jako działanie obsługi.",
    kiedy: "Po przełączeniu DNS, gdy checklista zamknięcia jest gotowa — bez wysłanego raportu migracji nie zamkniesz.",
  },
  "kontakty-migracji": {
    tytul: "Kontakty i oś czasu",
    opis: "Rozmowy i maile z klientem w sprawie migracji z datą i numerem zgłoszenia, obok zdarzeń automatu i zmian etapu.",
    kiedy: "Po każdym telefonie albo mailu — pisz tak, jakby klient to czytał, bo trafia do eksportu jego danych.",
  },
  "zasoby-508": {
    tytul: "Zasoby i diagnoza 508",
    opis: "Ile razy konto odbiło się od limitu (CPU, procesy wejściowe EP, procesy NPROC, pamięć, I/O) w dobie i w 7 dni, obok inodów, błędów 5xx strony i wolnych zapytań SQL.",
    kiedy: "Gdy klient zgłasza błąd 508, wolną stronę albo przerwy — najpierw sprawdź, który limit się kończy.",
    rozniSieOd: "Zużycie konta pokazuje średnie obciążenie; faulty — momenty, w których limit faktycznie odciął stronę.",
  },
  "przekroczenia-limitow": {
    tytul: "Przekroczenia limitów",
    opis: "Konta, które w dobie albo w 7 dni odbijały się od limitów zasobów, we flocie albo na jednym węźle — od najgorszego.",
    kiedy: "Przy przeglądzie węzła, przed rozmową o autoskalowaniu i gdy klienci zgłaszają błędy 508.",
  },
  // F3.2 (D5, G-12) — bezpieczeństwo węzła i konta.
  "blokady-ip": {
    tytul: "Zablokowało mi IP",
    opis: "Sprawdza, czy adres klienta jest zablokowany na serwerze po nieudanych logowaniach (poczta, FTP, SSH, panel), i zdejmuje blokadę.",
    kiedy: "Gdy klient nagle nie może odebrać poczty ani połączyć się przez FTP — zwykle po zmianie hasła w telefonie.",
    rozniSieOd: "Obsługa odblokowuje tylko adres z logowań klienta albo z jego zgłoszenia; dowolny adres i białą listę zmienia NOC na karcie węzła.",
  },
  "blokady-ip-wezla": {
    tytul: "Blokady IP węzła",
    opis: "Wszystkie zablokowane adresy węzła z powodem i czasem, odblokowanie dowolnego adresu i biała lista adresów, których serwer nigdy nie blokuje.",
    kiedy: "Przy awarii po stronie dużego klienta (np. biuro za jednym IP) albo gdy trzeba zwolnić adres partnera — z powodem w dzienniku.",
  },
  pulpity: {
    tytul: "Pulpit roli",
    opis: "Pulpit dopasowany do pracy: konsultant widzi swoje zgłoszenia i terminy, NOC flotę i alerty, finanse płatności i KSeF.",
    kiedy: "Na start zmiany — co trzeba zrobić najpierw; zakładki u góry przełączają między pulpitami Twojej roli.",
  },
  "komunikaty-serwisowe": {
    tytul: "Komunikaty serwisowe",
    opis: "Mail do wszystkich klientów węzła albo planu z podglądem odbiorców, wysyłany kolejką po 60 na minutę.",
    kiedy: "Przy awarii albo przed pracami serwisowymi — zamiast odpowiadać każdemu osobno.",
    rozniSieOd: "To wiadomość serwisowa bez zgody marketingowej, więc bez rabatów i reklam; kampanie marketingowe są osobno.",
  },
  "mail-do-klienta": {
    tytul: "Napisz do klienta",
    opis: "Mail z gotowego szablonu od obsługi Verris, bez Twojego nazwiska; odpowiedź klienta wraca do zgłoszeń.",
    kiedy: "Gdy trzeba poinformować klienta albo poprosić o działanie, a nie ma jeszcze zgłoszenia.",
    rozniSieOd: "Zgłoszenie w imieniu klienta otwiera wątek w obsłudze; ten mail tylko informuje (z numerem zgłoszenia trafia do jego wątku).",
  },
  "uslugi-wezla": {
    tytul: "Usługi węzła",
    opis: "Stan usług serwera z listy (WWW, poczta, bazy, DNS, FTP, panel, fail2ban) z watchdogiem agenta i restart z powodem w dzienniku.",
    kiedy: "Gdy watchdog albo klienci zgłaszają, że coś nie działa — usługę, która stoi, uruchamia NOC.",
    rozniSieOd: "Restart działającej usługi wspólnej przerywa pracę wszystkich kont, więc robi go administrator albo zespół składa wniosek.",
  },
  "logi-wezla": {
    tytul: "Logi węzła",
    opis: "Ostatnie linie logu serwera z białej listy (system, SSH, FTP, poczta, WWW i ruch jednej strony, panel serwera, cron) z filtrami: tekst, domena, użytkownik, zakres czasu. Bez dowolnych ścieżek.",
    kiedy: "Przy diagnozie awarii usługi, poczty, nieudanych logowań SSH/FTP albo ruchu na stronie klienta, zamiast logowania na serwer.",
    rozniSieOd: "Zespół widzi adresy e-mail i IP zamaskowane we wszystkich logach; pełne — tylko administrator. Przeszukiwane jest ostatnie ~4 MB pliku: starszy zakres czasu może nie zwrócić linii.",
  },
  kwarantanna: {
    tytul: "Kwarantanna plików",
    opis: "Przenosi pliki wykryte przez skaner poza stronę; kopia z sumą kontrolną zostaje na koncie, więc da się je przywrócić.",
    kiedy: "Gdy skaner wykrył złośliwy kod, a klient nie może sam zareagować — przed zawieszeniem usługi.",
    rozniSieOd: "Trwałe usunięcie z kwarantanny zostaje decyzją klienta w jego panelu.",
  },
  "malware-floty": {
    tytul: "Złośliwe pliki we flocie",
    opis: "Konta z wykrytym złośliwym kodem albo plikami w kwarantannie, we wszystkich węzłach albo na jednym, z datą ostatniego wyniku.",
    kiedy: "Przy porannym przeglądzie bezpieczeństwa i przy zgłoszeniu abuse — kwarantanna jest na karcie usługi.",
  },
  "trafienia-waf": {
    tytul: "Trafienia WAF",
    opis: "Ostatnie żądania do stron konta zablokowane albo wykryte przez zaporę aplikacji, z regułą, ścieżką i adresem — bez treści żądań.",
    kiedy: "Gdy formularz albo panel strony zwraca 403 — sprawdź, która reguła blokuje, zanim poprosisz administratora o zmianę trybu.",
  },
  // F3.5 — cykl życia usługi (karta usługi, sekcja „Operacje”).
  "anulacja-uslugi": {
    tytul: "Anulacja na koniec okresu",
    opis: "Usługa działa do końca opłaconego okresu i się nie odnawia; do tego dnia anulację można cofnąć (rezygnację klienta — tylko z numerem jego zgłoszenia albo przez administratora i nie w ostatniej dobie okresu).",
    kiedy: "Gdy klient prosi w zgłoszeniu o rezygnację, a nie chce tracić opłaconego okresu.",
    rozniSieOd: "„Zakończ i usuń konto” kończy usługę od razu i jest nieodwracalne (tylko administrator).",
  },
  "data-odnowienia": {
    tytul: "Data odnowienia i przedłużenie gratis",
    opis: "Przesuwa koniec bieżącego okresu: później to przedłużenie bez opłaty (koszt Verris), wcześniej — tylko na prośbę klienta.",
    kiedy: "Rekompensata po awarii albo wyrównanie dat odnowień klienta — poniżej kierownika zmiany przez wniosek.",
  },
  "obietnica-zaplaty": {
    tytul: "Obietnica zapłaty",
    opis: "Wstrzymuje automatyczne zawieszenie zaległej usługi na 1–7 dni; potem normalny cykl.",
    kiedy: "Klient potwierdził w zgłoszeniu, że przelew jest w drodze; jedna na zaległość, kolejną daje administrator.",
  },
  "dodatki-uslugi": {
    tytul: "Dodatki od obsługi",
    opis: "Dodaje dodatek z katalogu do usługi klienta: z portfela klienta (na jego zgłoszenie) albo gratis.",
    kiedy: "Klient zamówił dodatek w zgłoszeniu albo dostaje go jako rekompensatę — poniżej kierownika zmiany przez wniosek.",
  },
  "poczta-bez-klienta": {
    tytul: "Poczta bez klienta",
    opis: "Maile do support@ i abuse@ od nadawców spoza kont klientów (albo spoza zgłoszenia z wątku), od subkont bez prawa do zgłoszeń, ponad 5 nowych zgłoszeń z jednego konta w godzinę (pętla autoodpowiedzi) i spam. Pozostałe maile klientów od razu trafiają do zgłoszeń.",
    kiedy: "Załóż zgłoszenie klientowi po jego adresie, dopisz mail do zgłoszenia jako notatkę albo odrzuć. Maile z abuse@ widzi i obsługuje tylko zespół nadużyć; do zgłoszenia klienta trafia notatka z odsyłaczem do wpisu, bez treści i danych zgłaszającego. Blokadę całej domeny zakłada zespół nadużyć albo administrator. Pliki pokazujemy dopiero po „Pokaż” — nie są skanowane antywirusem.",
  },
  "raporty-obslugi": {
    tytul: "Raporty obsługi",
    opis: "Terminy SLA zgłoszeń z wybranego okresu (dotrzymane i po terminie, według priorytetu), oceny klientów oraz praca zespołu: odpowiedzi, mediana czasu odpowiedzi od pierwszej nieodpowiedzianej wiadomości klienta, zamknięte.",
    kiedy: "Przegląd zmiany lub tygodnia — notatki wewnętrzne i automatyczne wiadomości się nie liczą.",
  },
  makra: {
    tytul: "Makra",
    opis: "Szablon odpowiedzi z akcjami: po wysłaniu odpowiedzi ustawia stan, dopisuje tagi i przypisuje zgłoszenie — jednym kliknięciem w zgłoszeniu.",
    kiedy: "Powtarzalne sytuacje (rozwiązane, czekamy na dane, przekazanie dalej). Bez akcji szablon zostaje zwykłą podpowiedzią.",
  },
  "sla-zgloszen": {
    tytul: "Terminy SLA zgłoszeń",
    opis: "Godziny na pierwszą odpowiedź i na rozwiązanie dla każdego priorytetu, liczone zegarowo przez całą dobę od utworzenia zgłoszenia.",
    kiedy: "Zmiana działa dla nowych zgłoszeń i przy zmianie priorytetu; terminów już liczonych nie przesuwa.",
  },
} satisfies Record<string, WpisPomocy>;

export type PomocId = keyof typeof POMOC;
