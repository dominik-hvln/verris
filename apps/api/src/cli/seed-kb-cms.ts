/**
 * KB-CONTENT — seed startowej Bazy Wiedzy (CMS): kategorie + ~30 artykułów SEO.
 * Idempotentny: kategorie upsertowane po slug; artykuły tworzone tylko gdy slug
 * jeszcze nie istnieje (nie nadpisuje ręcznych edycji w CMS). Publikowane od razu,
 * żeby pomoc.verris.pl miała treść. Treści są edytowalne w panelu admina.
 *
 * USAGE (prod, w kontenerze api):
 *   node apps/api/dist-cli/cli/seed-kb-cms.js
 * lub lokalnie:  pnpm --filter api cli:seed-kb-cms
 */

import { PrismaClient } from '@verris/database';

const prisma = new PrismaClient();

type Cat = { slug: string; name: string; description: string; parentSlug?: string; order: number; icon?: string };
type Art = {
  categorySlug: string;
  slug: string;
  title: string;
  excerpt: string;
  seoTitle?: string;
  seoDescription?: string;
  body: string;
};

const CATEGORIES: Cat[] = [
  { slug: 'pierwsze-kroki', name: 'Pierwsze kroki', description: 'Rejestracja, logowanie i podstawy panelu Verris.', order: 1 },
  { slug: 'domeny-dns', name: 'Domeny i DNS', description: 'Rejestracja, transfer i konfiguracja domen oraz rekordów DNS.', order: 2 },
  { slug: 'hosting-pliki', name: 'Hosting i pliki', description: 'Wgrywanie strony, FTP, wersje PHP i zadania cron.', order: 3 },
  { slug: 'bazy-danych', name: 'Bazy danych', description: 'Tworzenie i obsługa baz MySQL.', order: 4 },
  { slug: 'poczta', name: 'Poczta e-mail', description: 'Skrzynki, konfiguracja, dostarczalność i antyspam.', order: 5 },
  { slug: 'ssl', name: 'SSL i szyfrowanie', description: 'Certyfikaty SSL, HTTPS i wildcard.', order: 6 },
  { slug: 'wordpress', name: 'WordPress', description: 'Instalacja, optymalizacja i bezpieczeństwo WordPress.', order: 7 },
  { slug: 'bezpieczenstwo', name: 'Bezpieczeństwo konta', description: 'Silne hasła, 2FA, passkey i ochrona konta.', order: 8 },
  { slug: 'kopie-zapasowe', name: 'Kopie zapasowe', description: 'Backup i przywracanie danych.', order: 9 },
  { slug: 'rozliczenia', name: 'Rozliczenia i płatności', description: 'Portfel, faktury, odnowienia i autoskalowanie.', order: 10 },
  { slug: 'migracja', name: 'Migracja do Verris', description: 'Przeniesienie konta z cPanel, Plesk i DirectAdmin.', order: 11 },
];

const A = (
  categorySlug: string,
  slug: string,
  title: string,
  excerpt: string,
  body: string,
  seo?: { t?: string; d?: string },
): Art => ({ categorySlug, slug, title, excerpt, body: body.trim(), seoTitle: seo?.t, seoDescription: seo?.d });

const ARTICLES: Art[] = [
  // ---------------- Pierwsze kroki
  A('pierwsze-kroki', 'jak-zalozyc-konto', 'Jak założyć konto w Verris',
    'Rejestracja krok po kroku i aktywacja konta klienta.',
    `## Rejestracja konta
Aby zacząć korzystać z Verris, wejdź na panel klienta i wybierz **Załóż konto**. Podaj adres e-mail i ustaw silne hasło.

## Weryfikacja adresu e-mail
Po rejestracji wyślemy wiadomość z linkiem aktywacyjnym. Kliknij go, aby potwierdzić adres — bez tego nie zalogujesz się do panelu. Jeśli mail nie dotarł, sprawdź folder spam lub wyślij link ponownie.

## Pierwsze logowanie
Zaloguj się adresem e-mail i hasłem. Zalecamy od razu włączyć dwuskładnikowe logowanie lub passkey (patrz: Bezpieczeństwo konta).

## Co dalej
Po zalogowaniu wybierz usługę (hosting, poczta lub VPS) i przejdź przez kreator „Pierwsze kroki", który przeprowadzi Cię przez konfigurację.`,
    { t: 'Jak założyć konto hostingowe w Verris — rejestracja krok po kroku', d: 'Instrukcja rejestracji konta w Verris: adres e-mail, weryfikacja i pierwsze logowanie. Zacznij korzystać z hostingu w kilka minut.' }),

  A('pierwsze-kroki', 'pierwsze-kroki-po-rejestracji', 'Pierwsze kroki po rejestracji',
    'Co zrobić zaraz po założeniu konta, aby szybko uruchomić stronę.',
    `## Wybierz usługę
Na pulpicie wybierz produkt: **Hosting**, **Poczta** lub **VPS**. Każdy ma dedykowany hub z narzędziami.

## Podłącz domenę
Jeśli masz domenę, podepnij ją do hostingu. Jeśli nie — możesz ją zarejestrować w panelu (patrz: Domeny i DNS).

## Wgraj stronę
Skorzystaj z menedżera plików w panelu lub połącz się przez FTP/SFTP. Możesz też zainstalować WordPress jednym kliknięciem.

## Włącz SSL
Certyfikat Let's Encrypt wystawiamy za darmo. Po podpięciu domeny włącz SSL i wymuś HTTPS.

## Zadbaj o bezpieczeństwo
Ustaw 2FA lub passkey i sprawdź, czy masz włączone kopie zapasowe.`,
    { d: 'Pierwsze kroki po założeniu konta w Verris: wybór usługi, podpięcie domeny, wgranie strony, SSL i bezpieczeństwo.' }),

  A('pierwsze-kroki', 'pulpit-klienta', 'Pulpit klienta — co gdzie znajdziesz',
    'Przewodnik po panelu: usługi, rozliczenia, wsparcie i ustawienia.',
    `## Układ panelu
Menu boczne zawiera globalne sekcje: usługi, rozliczenia, wsparcie i ustawienia konta. Po wejściu w usługę zobaczysz jej hub z narzędziami (pliki, bazy, poczta, DNS, SSL).

## Najważniejsze sekcje
- **Usługi** — lista Twoich hostingów, poczty i VPS ze stanem zdrowia.
- **Rozliczenia** — portfel, faktury, odnowienia.
- **Wsparcie** — zgłoszenia (tickety) i baza wiedzy.
- **Ustawienia** — dane, bezpieczeństwo, powiadomienia.

## Asystent i podpowiedzi
W panelu znajdziesz kontekstowe podpowiedzi „co dalej" oraz asystenta, który pomaga rozwiązywać typowe sytuacje.`,
    { d: 'Przewodnik po pulpicie klienta Verris — gdzie znajdziesz usługi, rozliczenia, wsparcie i ustawienia konta.' }),

  // ---------------- Domeny i DNS
  A('domeny-dns', 'jak-podpiac-domene', 'Jak podpiąć domenę do hostingu',
    'Skieruj domenę na serwer, zmieniając serwery nazw lub rekord A.',
    `## Dwie metody
Domenę podłączysz na dwa sposoby: zmieniając **serwery nazw (NS)** na nasze albo ustawiając **rekord A** na adres IP serwera.

## Zmiana serwerów nazw (zalecane)
W panelu rejestratora domeny wpisz serwery nazw Verris. Dzięki temu całą strefą DNS zarządzasz z naszego panelu. Zmiana propaguje się zwykle do kilku godzin.

## Rekord A
Jeśli wolisz zostawić DNS u rejestratora, ustaw rekord **A** domeny na adres IP hostingu (znajdziesz go w zakładce usługi). Dla subdomeny www dodaj rekord **CNAME** lub drugi **A**.

## Weryfikacja
Po propagacji domena wskaże Twoją stronę. Następnie włącz SSL i wymuś HTTPS.`,
    { t: 'Jak podpiąć domenę do hostingu — serwery nazw lub rekord A', d: 'Instrukcja podpięcia domeny do hostingu Verris: zmiana serwerów nazw (NS) lub ustawienie rekordu A. Krok po kroku.' }),

  A('domeny-dns', 'rejestracja-domeny', 'Jak zarejestrować domenę',
    'Sprawdź dostępność i zarejestruj domenę bezpośrednio w panelu.',
    `## Sprawdź dostępność
W panelu wpisz wybraną nazwę i rozszerzenie (np. .pl, .com). System pokaże, czy domena jest wolna i ile kosztuje rejestracja oraz odnowienie.

## Rejestracja
Wybierz domenę, uzupełnij dane abonenta i opłać z portfela lub kartą. Domena zostanie automatycznie skonfigurowana pod Twój hosting.

## Dane abonenta i RODO
Dane rejestracyjne są wymagane przez rejestr. Dbamy o ich bezpieczeństwo zgodnie z RODO.

## Odnowienia
Domeny odnawiają się w cyklu rocznym. Włącz przypomnienia, aby nie utracić nazwy.`,
    { d: 'Jak zarejestrować domenę w Verris: sprawdzenie dostępności, ceny, dane abonenta i automatyczna konfiguracja pod hosting.' }),

  A('domeny-dns', 'transfer-domeny', 'Jak przenieść domenę (transfer) do Verris',
    'Przenieś domenę od innego rejestratora bez utraty strony i poczty.',
    `## Przygotowanie
U obecnego rejestratora **odblokuj domenę** i pobierz **kod authinfo/EPP**. Upewnij się, że domena nie wygasa w najbliższych dniach.

## Zlecenie transferu
W panelu wybierz transfer, podaj domenę i kod authinfo. Potwierdź zlecenie i opłać (transfer zwykle przedłuża ważność o rok).

## Bez przerwy w działaniu
Przed transferem możesz podpiąć domenę do hostingu (rekord A/NS), aby strona i poczta działały nieprzerwanie w trakcie przenoszenia.

## Czas
Transfer domen .pl trwa zwykle kilka–kilkanaście godzin, domen globalnych do 5 dni (wymóg rejestru).`,
    { t: 'Transfer domeny do Verris — jak przenieść domenę bez przestoju', d: 'Jak przenieść domenę do Verris: odblokowanie, kod authinfo/EPP, zlecenie transferu i utrzymanie ciągłości strony i poczty.' }),

  A('domeny-dns', 'rekordy-dns-wyjasnione', 'Rekordy DNS wyjaśnione (A, AAAA, CNAME, MX, TXT)',
    'Do czego służą najważniejsze rekordy DNS i kiedy ich używać.',
    `## A i AAAA
**A** wskazuje domenę na adres IPv4 serwera, **AAAA** na IPv6. To podstawowe rekordy kierujące ruch do Twojej strony.

## CNAME
**CNAME** to alias — kieruje jedną nazwę na drugą (np. www na domenę główną). Nie używaj CNAME dla domeny głównej z rekordami MX.

## MX
**MX** wskazuje serwery poczty przyjmujące wiadomości dla domeny. Priorytet (niższy = ważniejszy) ustala kolejność.

## TXT (SPF, DKIM, DMARC)
Rekordy **TXT** przechowują m.in. SPF, DKIM i DMARC — kluczowe dla dostarczalności poczty (patrz osobny artykuł).

## Propagacja
Zmiany DNS propagują się do kilku–kilkunastu godzin, zależnie od TTL.`,
    { d: 'Rekordy DNS wyjaśnione prosto: A, AAAA, CNAME, MX, TXT (SPF/DKIM/DMARC). Kiedy i jak ich używać.' }),

  A('domeny-dns', 'jak-dodac-subdomene', 'Jak dodać subdomenę',
    'Utwórz subdomenę (np. blog.twojadomena.pl) w kilka chwil.',
    `## Czym jest subdomena
Subdomena to wydzielona część domeny, np. **blog.twojadomena.pl** albo **sklep.twojadomena.pl**. Możesz na niej postawić osobną stronę lub aplikację.

## Tworzenie w panelu
W zakładce Domeny & DNS wybierz **Dodaj subdomenę**, wpisz nazwę i zapisz. Utworzymy dla niej katalog i rekord DNS.

## Osobna zawartość
Do katalogu subdomeny wgraj pliki przez menedżer plików lub FTP. Możesz też zainstalować tam WordPress.

## SSL
Dla subdomeny również wystawimy darmowy certyfikat SSL. Jeśli masz ich wiele, rozważ certyfikat wildcard.`,
    { d: 'Jak dodać subdomenę w Verris (np. blog.twojadomena.pl): tworzenie, zawartość i SSL. Instrukcja krok po kroku.' }),

  // ---------------- Hosting i pliki
  A('hosting-pliki', 'jak-wgrac-strone', 'Jak wgrać stronę na serwer (menedżer plików i FTP)',
    'Dwie metody publikacji: wbudowany menedżer plików i klient FTP/SFTP.',
    `## Menedżer plików w panelu
Najprościej wgrać stronę bez dodatkowych programów: w hubie usługi otwórz **Menedżer plików**, wejdź do katalogu **public_html** i prześlij pliki (możesz wgrać archiwum ZIP i rozpakować).

## FTP / SFTP
Do większych projektów użyj klienta (np. FileZilla). Utwórz konto FTP w panelu i połącz się, podając host, login, hasło i port. Zalecamy SFTP dla bezpieczeństwa.

## Gdzie umieścić pliki
Zawartość strony głównej trafia do **public_html**. Dla subdomen i domen dodatkowych używane są osobne katalogi.

## Uprawnienia
Standardowe uprawnienia to 644 dla plików i 755 dla katalogów. Nie ustawiaj 777.`,
    { t: 'Jak wgrać stronę na serwer — menedżer plików i FTP', d: 'Publikacja strony na hostingu Verris: wbudowany menedżer plików oraz FTP/SFTP. Gdzie umieścić pliki i jakie uprawnienia ustawić.' }),

  A('hosting-pliki', 'konta-ftp', 'Jak utworzyć konto FTP',
    'Dodaj konto FTP/SFTP z ograniczonym dostępem do katalogu.',
    `## Tworzenie konta
W hubie usługi otwórz sekcję **FTP** i wybierz **Dodaj konto**. Podaj login, hasło i katalog domowy (możesz ograniczyć dostęp do jednego folderu).

## Dane do połączenia
- **Host:** adres serwera lub domena
- **Port:** 21 (FTP) lub 22 (SFTP)
- **Login / hasło:** ustawione przy tworzeniu

## Bezpieczeństwo
Używaj SFTP zamiast zwykłego FTP. Twórz osobne konta dla współpracowników i usuwaj je, gdy nie są już potrzebne.`,
    { d: 'Jak utworzyć konto FTP/SFTP w Verris: login, hasło, katalog domowy i dane do połączenia. Bezpieczny dostęp do plików.' }),

  A('hosting-pliki', 'wersja-php', 'Jak zmienić wersję PHP',
    'Wybierz wersję PHP dopasowaną do aplikacji (CloudLinux PHP Selector).',
    `## Po co zmieniać wersję PHP
Różne aplikacje wymagają różnych wersji PHP. Nowsze wersje są szybsze i bezpieczniejsze, ale starsze skrypty mogą wymagać konkretnej wersji.

## Zmiana w panelu
W hubie usługi wybierz **Wersja PHP** i ustaw żądaną wersję dla konta. Zmiana działa od razu.

## Rozszerzenia i limity
Możesz włączać rozszerzenia PHP oraz dostosować podstawowe parametry (limit pamięci, czas wykonania) w granicach planu.

## Zalecenie
Dla WordPress i nowych projektów wybierz najnowszą stabilną wersję obsługiwaną przez aplikację.`,
    { d: 'Jak zmienić wersję PHP na hostingu Verris (CloudLinux PHP Selector): wybór wersji, rozszerzenia i limity.' }),

  A('hosting-pliki', 'zadania-cron', 'Zadania cron (harmonogram)',
    'Uruchamiaj skrypty cyklicznie — kopie, importy, powiadomienia.',
    `## Czym jest cron
Cron to harmonogram uruchamiający polecenia w zadanym czasie — np. skrypt WordPress co godzinę albo backup w nocy.

## Dodanie zadania
W sekcji **Cron** wybierz gotowy preset (co godzinę, codziennie, co tydzień) lub ustaw własny harmonogram, a następnie wpisz polecenie do wykonania.

## Typowe przykłady
- Wywołanie **wp-cron** WordPress
- Import/eksport danych
- Czyszczenie plików tymczasowych

## Wskazówka
Nie ustawiaj zbyt częstych zadań (np. co minutę), jeśli nie są konieczne — obciążają serwer.`,
    { d: 'Zadania cron na hostingu Verris: presety harmonogramu, własne wyrażenia i typowe przykłady (wp-cron, backup, import).' }),

  // ---------------- Bazy danych
  A('bazy-danych', 'bazy-mysql', 'Jak utworzyć bazę danych MySQL',
    'Załóż bazę i użytkownika, aby podłączyć aplikację lub CMS.',
    `## Tworzenie bazy
W hubie usługi otwórz **Bazy danych** i wybierz **Utwórz bazę**. Podaj nazwę bazy oraz utwórz użytkownika z hasłem.

## Dane do połączenia
Aplikacja (np. WordPress) potrzebuje: **hosta** (zwykle localhost), **nazwy bazy**, **użytkownika** i **hasła**.

## Zarządzanie
Bazę obsłużysz przez wbudowane narzędzie (np. phpMyAdmin) — import, eksport, zapytania SQL.

## Bezpieczeństwo
Nadawaj użytkownikowi dostęp tylko do jego bazy i używaj silnych haseł. Regularnie rób kopie zapasowe baz.`,
    { t: 'Jak utworzyć bazę danych MySQL na hostingu', d: 'Tworzenie bazy MySQL i użytkownika w Verris, dane do połączenia dla WordPress i innych aplikacji oraz zarządzanie przez phpMyAdmin.' }),

  A('bazy-danych', 'zdalny-dostep-mysql', 'Zdalny dostęp do bazy MySQL',
    'Zezwól na połączenie z bazą z zewnętrznego adresu IP.',
    `## Kiedy potrzebny
Zdalny dostęp przydaje się, gdy łączysz się z bazą z komputera lub innej usługi (np. lokalne narzędzie, aplikacja zewnętrzna).

## Konfiguracja
W sekcji baz danych dodaj **dozwolony host** (adres IP), z którego będą przychodzić połączenia. Bez tego serwer odrzuci zdalne logowanie.

## Bezpieczeństwo
Ogranicz dostęp do konkretnego IP zamiast otwierać na cały świat. Używaj silnego hasła i, jeśli to możliwe, połączenia szyfrowanego.`,
    { d: 'Zdalny dostęp do bazy MySQL w Verris: dodanie dozwolonego hosta (IP) i bezpieczna konfiguracja połączenia.' }),

  // ---------------- Poczta
  A('poczta', 'zakladanie-skrzynki', 'Jak założyć skrzynkę e-mail',
    'Utwórz adres w swojej domenie i ustaw hasło.',
    `## Tworzenie skrzynki
W hubie poczty wybierz **Dodaj skrzynkę**, wpisz nazwę (np. kontakt@twojadomena.pl), ustaw hasło i pojemność.

## Dostęp do poczty
Z poczty korzystasz przez webmail w przeglądarce lub program pocztowy (patrz: konfiguracja IMAP/SMTP).

## Dobre praktyki
- Twórz osobne skrzynki dla różnych ról (kontakt, biuro, faktury).
- Ustaw silne hasła i włącz filtr antyspamowy.
- Skonfiguruj SPF, DKIM i DMARC dla lepszej dostarczalności.`,
    { t: 'Jak założyć skrzynkę e-mail w swojej domenie', d: 'Zakładanie skrzynki e-mail w Verris: adres w domenie, hasło, pojemność i dostęp przez webmail lub program pocztowy.' }),

  A('poczta', 'konfiguracja-poczty-imap-smtp', 'Konfiguracja poczty (IMAP/SMTP) w programie',
    'Ustawienia serwerów poczty przychodzącej i wychodzącej.',
    `## Poczta przychodząca (IMAP)
- **Serwer:** mail.twojadomena.pl
- **Port:** 993 (SSL/TLS)
- **Login:** pełny adres e-mail

## Poczta wychodząca (SMTP)
- **Serwer:** mail.twojadomena.pl
- **Port:** 465 (SSL) lub 587 (STARTTLS)
- **Uwierzytelnianie:** włączone, login = adres e-mail

## IMAP czy POP3
Zalecamy **IMAP** — poczta synchronizuje się między urządzeniami. POP3 pobiera wiadomości na jedno urządzenie.

## Problemy z połączeniem
Sprawdź, czy używasz szyfrowania (SSL/TLS) i poprawnego portu oraz czy hasło jest aktualne.`,
    { d: 'Konfiguracja poczty w programie pocztowym: ustawienia IMAP i SMTP dla Verris (serwery, porty, szyfrowanie).' }),

  A('poczta', 'spf-dkim-dmarc', 'SPF, DKIM i DMARC — dostarczalność poczty',
    'Trzy rekordy, które chronią Twoją pocztę przed folderem spam.',
    `## Dlaczego to ważne
SPF, DKIM i DMARC potwierdzają, że wiadomości z Twojej domeny są autentyczne. Bez nich poczta częściej trafia do spamu lub jest odrzucana.

## SPF
Rekord TXT wskazujący serwery uprawnione do wysyłki w imieniu domeny.

## DKIM
Podpis kryptograficzny dodawany do wiadomości; odbiorca weryfikuje go rekordem TXT z kluczem publicznym.

## DMARC
Polityka mówiąca, co zrobić z wiadomościami, które nie przejdą SPF/DKIM (monitoruj, kwarantanna, odrzuć). Zacznij od polityki monitorującej.

## W panelu
W dashboardzie dostarczalności sprawdzisz stan SPF/DKIM/DMARC oraz reputację. Postępuj zgodnie z podpowiedziami, aby ustawić rekordy.`,
    { t: 'SPF, DKIM, DMARC — jak poprawić dostarczalność poczty', d: 'Wyjaśnienie SPF, DKIM i DMARC oraz jak je ustawić, aby poczta z Twojej domeny nie trafiała do spamu.' }),

  A('poczta', 'forwardery-autorespondery', 'Forwardery i autorespondery',
    'Przekierowania wiadomości i automatyczne odpowiedzi.',
    `## Forwarder (przekierowanie)
Forwarder przesyła pocztę z jednego adresu na inny — np. z biuro@twojadomena.pl na Twoją skrzynkę główną. Możesz kierować do wielu odbiorców.

## Autoresponder
Automatyczna odpowiedź (np. na urlopie) wysyłana do nadawców w zadanym okresie. Ustaw temat, treść i daty obowiązywania.

## Catch-all
Opcjonalnie możesz włączyć catch-all — przechwytywanie poczty na nieistniejące adresy w domenie. Uważaj, bo zwiększa ilość spamu.`,
    { d: 'Forwardery (przekierowania) i autorespondery w poczcie Verris oraz opcja catch-all. Jak je skonfigurować.' }),

  A('poczta', 'filtr-antyspam', 'Filtr antyspamowy',
    'Ogranicz spam bez utraty ważnych wiadomości.',
    `## Jak działa
Filtr ocenia wiadomości i oznacza lub przenosi podejrzane do folderu spam. Czułość możesz dostroić per domena.

## Ustawienia
W panelu włącz filtr i ustaw próg. Zbyt agresywny może przenosić poprawne maile — zaczynaj od ustawień domyślnych.

## Białe i czarne listy
Dodaj zaufanych nadawców do białej listy, a uporczywych spamerów do czarnej.

## Uzupełnienie
Antyspam działa najlepiej razem z poprawnymi SPF/DKIM/DMARC.`,
    { d: 'Filtr antyspamowy w Verris: włączanie, czułość, białe i czarne listy. Mniej spamu bez utraty ważnych wiadomości.' }),

  // ---------------- SSL
  A('ssl', 'certyfikat-ssl', 'Darmowy certyfikat SSL (Let’s Encrypt)',
    'Włącz HTTPS na stronie bez dodatkowych opłat.',
    `## Za darmo i automatycznie
Dla domen podpiętych do hostingu wystawiamy certyfikat **Let's Encrypt** bez opłat. Odnawia się automatycznie.

## Włączenie
W hubie usługi otwórz **SSL** i wygeneruj certyfikat dla domeny (i www). Po chwili strona będzie dostępna przez HTTPS.

## Warunek
Domena musi wskazywać na serwer (rekord A / serwery nazw), aby walidacja się powiodła.

## Następny krok
Po wystawieniu certyfikatu wymuś HTTPS, aby cały ruch był szyfrowany.`,
    { t: 'Darmowy certyfikat SSL (Let’s Encrypt) — jak włączyć HTTPS', d: 'Jak włączyć darmowy certyfikat SSL Let’s Encrypt w Verris i uruchomić HTTPS na stronie. Automatyczne odnawianie.' }),

  A('ssl', 'wymus-https', 'Jak wymusić HTTPS',
    'Przekieruj cały ruch z HTTP na bezpieczne HTTPS.',
    `## Po co wymuszać HTTPS
Gdy masz certyfikat, warto przekierować HTTP → HTTPS, aby użytkownicy zawsze łączyli się szyfrowanie i by uniknąć ostrzeżeń przeglądarki.

## W panelu
W sekcji **Narzędzia WWW** włącz **Wymuś HTTPS** i opcjonalnie kanonizację www/bez-www. Wprowadzimy odpowiedni wpis w .htaccess.

## WordPress
Ustaw adres witryny na https:// w ustawieniach ogólnych, aby uniknąć mieszanej zawartości.

## Weryfikacja
Sprawdź, czy kłódka pojawia się na wszystkich podstronach i czy nie ma ostrzeżeń o „mixed content".`,
    { d: 'Jak wymusić HTTPS na hostingu Verris: przekierowanie HTTP→HTTPS, kanonizacja www i ustawienia dla WordPress.' }),

  A('ssl', 'wildcard-ssl', 'Certyfikat wildcard (*.domena)',
    'Jeden certyfikat dla wszystkich subdomen.',
    `## Kiedy warto
Certyfikat **wildcard** zabezpiecza domenę i wszystkie jej subdomeny (np. blog., sklep., panel.) jednym certyfikatem — wygodne, gdy masz ich wiele.

## Wystawienie (DNS-01)
Wildcard wymaga walidacji metodą **DNS-01** — dodania rekordu TXT. W panelu przeprowadzimy Cię przez proces; przy domenach z DNS u nas dzieje się to automatycznie.

## Podgląd certyfikatu
W panelu zobaczysz datę wygaśnięcia, listę nazw (SAN) i informację, czy certyfikat jest typu wildcard.`,
    { d: 'Certyfikat SSL wildcard (*.domena) w Verris: jeden certyfikat dla wszystkich subdomen, walidacja DNS-01 i podgląd w panelu.' }),

  // ---------------- WordPress
  A('wordpress', 'instalacja-wordpress', 'Instalacja WordPress jednym kliknięciem',
    'Postaw WordPress w minutę bez ręcznej konfiguracji.',
    `## Instalator 1-klik
W hubie usługi wybierz **Zainstaluj WordPress**, wskaż domenę/katalog i podaj dane administratora. Bazę danych utworzymy automatycznie.

## Po instalacji
Zaloguj się do panelu WordPress (adres /wp-admin), wybierz motyw i wtyczki. Pamiętaj o SSL i wymuszeniu HTTPS.

## Aktualizacje
Regularnie aktualizuj rdzeń, motywy i wtyczki — to podstawa bezpieczeństwa.

## Wydajność
Włącz cache (np. wtyczka + Redis, jeśli dostępny) i optymalizuj obrazy.`,
    { t: 'Instalacja WordPress jednym kliknięciem — hosting Verris', d: 'Jak zainstalować WordPress w Verris instalatorem 1-klik: automatyczna baza, dane administratora, SSL i pierwsze kroki.' }),

  A('wordpress', 'optymalizacja-wordpress', 'Optymalizacja i cache WordPress',
    'Przyspiesz stronę: cache, obrazy, baza i wersja PHP.',
    `## Cache
Zainstaluj wtyczkę cache i włącz cache strony oraz przeglądarki. Jeśli dostępny jest Redis, użyj go jako object cache.

## Obrazy
Kompresuj obrazy i używaj formatów nowej generacji (WebP). Włącz leniwe ładowanie (lazy load).

## Wersja PHP
Ustaw najnowszą stabilną wersję PHP — potrafi znacząco przyspieszyć witrynę.

## Baza danych
Okresowo czyść bazę (rewizje, spam, transient) i utrzymuj porządek we wtyczkach — każda dodatkowa spowalnia stronę.`,
    { d: 'Optymalizacja WordPress w Verris: cache, Redis, kompresja obrazów, wersja PHP i porządek w bazie danych.' }),

  A('wordpress', 'bezpieczenstwo-wordpress', 'Bezpieczeństwo WordPress',
    'Zabezpiecz witrynę przed atakami i przejęciem.',
    `## Podstawy
- Aktualizuj rdzeń, motywy i wtyczki.
- Używaj silnych haseł i 2FA do panelu.
- Instaluj wtyczki tylko z zaufanych źródeł.

## Ochrona logowania
Ogranicz próby logowania i rozważ zmianę domyślnego adresu /wp-admin. WAF na hostingu dodatkowo blokuje typowe ataki.

## Kopie zapasowe
Włącz automatyczne kopie zapasowe — w razie problemu przywrócisz stronę w kilka minut.

## Po włamaniu
Jeśli podejrzewasz włamanie, zmień hasła, przywróć czystą kopię i zaktualizuj wszystkie komponenty.`,
    { d: 'Bezpieczeństwo WordPress: aktualizacje, silne hasła, 2FA, ochrona logowania, WAF i kopie zapasowe. Jak chronić witrynę.' }),

  // ---------------- Bezpieczeństwo konta
  A('bezpieczenstwo', 'dwuskladnikowe-logowanie-passkey', 'Dwuskładnikowe logowanie i passkey',
    'Zabezpiecz konto Verris drugim składnikiem lub kluczem passkey.',
    `## Dlaczego 2FA
Drugi składnik chroni konto nawet, gdy ktoś pozna Twoje hasło. To jedno z najważniejszych zabezpieczeń.

## Passkey (zalecane)
Passkey to logowanie kluczem (odcisk palca, Face ID, klucz sprzętowy) — wygodne i odporne na phishing. Dodasz je w ustawieniach bezpieczeństwa.

## 2FA (TOTP)
Alternatywnie użyj aplikacji uwierzytelniającej (kody TOTP). Zapisz kody odzyskiwania w bezpiecznym miejscu.

## Zarządzanie
W ustawieniach zobaczysz aktywne passkeys i sesje. Możesz je odwoływać i wylogować urządzenia.`,
    { t: 'Dwuskładnikowe logowanie (2FA) i passkey w Verris', d: 'Jak zabezpieczyć konto Verris: passkey (Face ID, klucz sprzętowy) oraz 2FA TOTP z kodami odzyskiwania.' }),

  A('bezpieczenstwo', 'silne-haslo', 'Jak ustawić silne hasło',
    'Zasady tworzenia haseł, które trudno złamać.',
    `## Cechy dobrego hasła
- Co najmniej 12 znaków.
- Wielkie i małe litery, cyfry, znaki specjalne.
- Unikalne dla każdego serwisu.

## Menedżer haseł
Używaj menedżera haseł — wygeneruje i zapamięta silne, unikalne hasła. Nie zapisuj haseł w plikach tekstowych.

## Czego unikać
Nie używaj dat, imion, słów ze słownika ani powtarzalnych sekwencji. Nie wysyłaj haseł w wiadomościach.

## Dodatkowo
Włącz 2FA lub passkey — hasło to tylko pierwsza warstwa ochrony.`,
    { d: 'Jak ustawić silne hasło: długość, złożoność, unikalność i menedżer haseł. Zasady bezpieczeństwa konta.' }),

  // ---------------- Kopie zapasowe
  A('kopie-zapasowe', 'backup-1-klik', 'Kopia zapasowa jednym kliknięciem',
    'Wykonaj backup strony i bazy w każdej chwili.',
    `## Backup na żądanie
W hubie usługi wybierz **Kopia zapasowa** i wykonaj backup plików oraz bazy danych jednym kliknięciem. Kopie przechowujemy również poza węzłem (offsite) dla bezpieczeństwa.

## Harmonogram
Włącz automatyczne kopie (np. codziennie) i ustaw retencję — ile kopii przechowywać. Starsze będą automatycznie usuwane.

## Zanim wprowadzisz zmiany
Przed aktualizacją WordPress lub większą zmianą zrób kopię — łatwo cofniesz ewentualny błąd.`,
    { t: 'Kopia zapasowa jednym kliknięciem — backup strony i bazy', d: 'Jak wykonać kopię zapasową w Verris: backup plików i bazy 1-klik, kopie offsite, harmonogram i retencja.' }),

  A('kopie-zapasowe', 'przywracanie-backupu', 'Jak przywrócić kopię zapasową',
    'Odtwórz stronę lub bazę z wcześniejszej kopii.',
    `## Wybór kopii
W sekcji kopii zapasowych zobaczysz listę backupów z datami. Wybierz odpowiednią kopię do przywrócenia.

## Przywracanie
Możesz przywrócić pliki, bazę lub całość. Operacja nadpisze bieżącą zawartość — w razie wątpliwości najpierw wykonaj świeżą kopię.

## Po przywróceniu
Sprawdź działanie strony i poczty. Jeśli przywracasz po awarii/włamaniu, dodatkowo zmień hasła i zaktualizuj komponenty.`,
    { d: 'Jak przywrócić kopię zapasową w Verris: wybór backupu, przywracanie plików/bazy i weryfikacja po odtworzeniu.' }),

  // ---------------- Rozliczenia
  A('rozliczenia', 'portfel-i-platnosci', 'Portfel i płatności',
    'Doładuj portfel i płać za usługi wygodnie.',
    `## Portfel Verris
Portfel to Twoje saldo w panelu — z niego pobierane są opłaty za usługi, odnowienia i dodatki. Doładujesz go kartą lub przelewem.

## Płatności za usługi
Usługi rozliczamy z portfela lub kartą (płatność cykliczna). Wybierzesz metodę przy zamawianiu.

## Historia i faktury
W sekcji rozliczeń znajdziesz historię operacji i faktury do pobrania.

## Niski stan salda
Gdy saldo jest niskie, wyślemy przypomnienie, aby usługi nie zostały zawieszone.`,
    { t: 'Portfel i płatności w Verris — jak działa rozliczanie', d: 'Portfel Verris: doładowania kartą/przelewem, płatności za usługi, historia operacji i przypomnienia o niskim saldzie.' }),

  A('rozliczenia', 'faktury', 'Faktury i dane do faktury',
    'Uzupełnij dane firmy i pobieraj faktury z panelu.',
    `## Dane do faktury
W ustawieniach uzupełnij nazwę, NIP i adres. Będą użyte na fakturach za usługi.

## Pobieranie faktur
Faktury znajdziesz w sekcji rozliczeń — do pobrania w PDF. Wystawiamy je automatycznie po opłaceniu.

## KSeF
Jeśli korzystasz z Krajowego Systemu e-Faktur, poinformujemy o statusie zgodnie z obowiązującymi przepisami.

## Zmiana danych
Dane firmowe możesz zaktualizować w każdej chwili — kolejne faktury uwzględnią zmiany.`,
    { d: 'Faktury w Verris: uzupełnienie danych firmy (NIP, adres), automatyczne wystawianie i pobieranie PDF z panelu.' }),

  A('rozliczenia', 'autoskalowanie-bezpiecznik-kosztow', 'Autoskalowanie i bezpiecznik kosztów',
    'Wydajność rośnie w szczycie, a Ty kontrolujesz wydatki.',
    `## Czym jest autoskalowanie
Gdy strona ma większy ruch, usługa może chwilowo zwiększyć zasoby (CPU/RAM), aby działała płynnie. Po szczycie wraca do bazowego poziomu.

## Bezpiecznik kosztów
Ustaw miesięczny limit wydatków na autoskalowanie. Po jego osiągnięciu skalowanie się zatrzyma, więc nie przekroczysz budżetu.

## Podgląd
W panelu zobaczysz historię skalowania i bieżące zużycie. Otrzymasz też rekomendacje zmiany planu, jeśli skalujesz często.`,
    { d: 'Autoskalowanie w Verris i bezpiecznik kosztów: więcej mocy w szczycie ruchu przy pełnej kontroli miesięcznego budżetu.' }),

  // ---------------- Migracja
  A('migracja', 'migracja-do-verris', 'Jak przenieść hosting do Verris (cPanel/Plesk/DirectAdmin)',
    'Przenieś pliki, bazy, pocztę i domeny — automatycznie lub z pomocą pracownika.',
    `## Dwa tryby
Migrację uruchomisz na dwa sposoby:
- **Automatyczna** — podajesz dane dostępowe u obecnego dostawcy, a system przeniesie pliki, bazy i pocztę.
- **Z pomocą pracownika** — zlecasz przeniesienie naszemu zespołowi.

## Co przenosimy
Pliki strony, bazy danych, konta poczty (wraz z wiadomościami), domeny i subdomeny oraz konfigurację DNS.

## Bez przestoju
Zalecamy najpierw przenieść dane, przetestować stronę na naszym serwerze, a dopiero potem przełączyć domenę — dzięki temu unikniesz przerwy.

## Gdy coś pójdzie nie tak
Przy migracji automatycznej, jeśli wystąpi problem, wyślemy powiadomienie, a zgłoszenie trafi z wysokim priorytetem do naszego zespołu, który dokończy przeniesienie.

## Skąd wziąć dane
W panelu obecnego dostawcy (cPanel/Plesk/DirectAdmin) znajdziesz dane FTP/SFTP, dostęp do bazy i ustawienia poczty. Nasze kreatory podpowiadają, gdzie ich szukać.`,
    { t: 'Migracja hostingu do Verris z cPanel, Plesk i DirectAdmin', d: 'Jak przenieść hosting do Verris: migracja automatyczna lub z pomocą pracownika — pliki, bazy, poczta, domeny i subdomeny bez przestoju.' }),
];

function toPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkText(text: string, size = 900, overlap = 150): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const dot = text.slice(start, end).lastIndexOf('. ');
      if (dot > size * 0.5) end = start + dot + 1;
    }
    out.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = end - overlap;
  }
  return out.filter(Boolean);
}

/** KB-UNIFY-1 — zasil indeks AI (podpowiedzi w ticketach) treścią artykułu. */
async function indexAi(a: Art): Promise<void> {
  const ref = `kb-cms:${a.slug}`;
  const existing = await prisma.aiKnowledgeDoc.findFirst({ where: { sourceRef: ref } });
  if (existing) return;
  const plain = toPlain(`${a.title}\n\n${a.excerpt}\n\n${a.body}`);
  const doc = await prisma.aiKnowledgeDoc.create({
    data: {
      title: a.title,
      sourceType: 'MARKDOWN',
      sourceRef: ref,
      audience: 'ALL',
      status: 'ACTIVE',
      charCount: plain.length,
    },
  });
  const chunks = chunkText(plain);
  await prisma.aiKnowledgeChunk.createMany({
    data: chunks.map((content, ordinal) => ({ docId: doc.id, ordinal, content, embedding: [], tokens: 0 })),
  });
}

async function upsertCategory(c: Cat, parentId: string | null): Promise<string> {
  const existing = await prisma.kbCategory.findUnique({ where: { slug: c.slug } });
  if (existing) {
    await prisma.kbCategory.update({
      where: { slug: c.slug },
      data: { name: c.name, description: c.description, order: c.order, parentId, icon: c.icon ?? null },
    });
    return existing.id;
  }
  const created = await prisma.kbCategory.create({
    data: { slug: c.slug, name: c.name, description: c.description, order: c.order, parentId, icon: c.icon ?? null },
  });
  return created.id;
}

async function main() {
  const idBySlug = new Map<string, string>();

  // 1) kategorie najwyższego poziomu, potem podkategorie (parentId)
  for (const c of CATEGORIES.filter((x) => !x.parentSlug)) {
    idBySlug.set(c.slug, await upsertCategory(c, null));
  }
  for (const c of CATEGORIES.filter((x) => x.parentSlug)) {
    const parentId = idBySlug.get(c.parentSlug!) ?? null;
    idBySlug.set(c.slug, await upsertCategory(c, parentId));
  }

  // 2) artykuły — tylko gdy slug nie istnieje (nie nadpisujemy edycji)
  let created = 0;
  let skipped = 0;
  for (const a of ARTICLES) {
    const categoryId = idBySlug.get(a.categorySlug);
    if (!categoryId) {
      console.warn(`Pomijam artykuł ${a.slug}: brak kategorii ${a.categorySlug}`);
      continue;
    }
    const exists = await prisma.kbArticle.findUnique({ where: { slug: a.slug } });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.kbArticle.create({
      data: {
        slug: a.slug,
        categoryId,
        title: a.title,
        excerpt: a.excerpt,
        bodyMarkdown: a.body,
        status: 'PUBLISHED',
        seoTitle: a.seoTitle ?? null,
        seoDescription: a.seoDescription ?? null,
        authorName: 'Zespół Verris',
        publishedAt: new Date(),
      },
    });
    await indexAi(a).catch(() => {});
    created++;
  }

  console.log(`KB seed: kategorie=${idBySlug.size}, artykuły nowe=${created}, pominięte(istniały)=${skipped}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('KB seed error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
