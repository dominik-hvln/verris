/**
 * KB-CONTENT — seed startowej Bazy Wiedzy (CMS): kategorie + artykuły SEO z FAQ.
 * Idempotentny: kategorie upsertowane po slug. Artykuły: tworzone gdy slug nie
 * istnieje; dla istniejących AKTUALIZUJEMY tylko pola dodatkowe (faq, relatedSlugs),
 * nie nadpisując ręcznych edycji treści/tytułu w CMS. Publikowane od razu,
 * żeby pomoc.verris.pl miała treść. Treści są edytowalne w panelu admina.
 *
 * USAGE (prod, w kontenerze api):
 *   node apps/api/dist-cli/cli/seed-kb-cms.js
 * lub lokalnie:  pnpm --filter api cli:seed-kb-cms
 */

import { PrismaClient } from '@verris/database';

const prisma = new PrismaClient();

type Cat = { slug: string; name: string; description: string; parentSlug?: string; order: number; icon?: string };
type Faq = { q: string; a: string };
type Art = {
  categorySlug: string;
  slug: string;
  title: string;
  excerpt: string;
  seoTitle?: string;
  seoDescription?: string;
  body: string;
  faq: Faq[];
  relatedSlugs: string[];
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
  { slug: 'wydajnosc', name: 'Wydajność i optymalizacja', description: 'Cache, kompresja, Core Web Vitals i szybkość strony.', order: 12 },
];

const A = (
  categorySlug: string,
  slug: string,
  title: string,
  excerpt: string,
  body: string,
  opts?: { t?: string; d?: string; faq?: Faq[]; related?: string[] },
): Art => ({
  categorySlug,
  slug,
  title,
  excerpt,
  body: body.trim(),
  seoTitle: opts?.t,
  seoDescription: opts?.d,
  faq: opts?.faq ?? [],
  relatedSlugs: opts?.related ?? [],
});

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
    { t: 'Jak założyć konto hostingowe w Verris — rejestracja krok po kroku', d: 'Instrukcja rejestracji konta w Verris: adres e-mail, weryfikacja i pierwsze logowanie. Zacznij korzystać z hostingu w kilka minut.',
      faq: [
        { q: 'Czy założenie konta jest płatne?', a: 'Nie. Rejestracja konta jest bezpłatna — płacisz dopiero za wybraną usługę. Możesz też skorzystać z okresu próbnego.' },
        { q: 'Nie dotarł e-mail aktywacyjny — co zrobić?', a: 'Sprawdź folder spam i zakładkę „Oferty". Jeśli wiadomości nadal nie ma, na ekranie logowania wyślij link aktywacyjny ponownie lub napisz do wsparcia.' },
      ], related: ['pierwsze-kroki-po-rejestracji', 'dwuskladnikowe-logowanie-passkey'] }),

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
    { d: 'Pierwsze kroki po założeniu konta w Verris: wybór usługi, podpięcie domeny, wgranie strony, SSL i bezpieczeństwo.',
      faq: [
        { q: 'Od czego zacząć, jeśli mam już domenę u innego rejestratora?', a: 'Podepnij ją do hostingu (zmiana serwerów nazw lub rekord A), a następnie wgraj stronę i włącz SSL. Instrukcję znajdziesz w artykule „Jak podpiąć domenę do hostingu".' },
        { q: 'Ile trwa uruchomienie strony?', a: 'Samą stronę wgrasz i uruchomisz w kilka minut. Propagacja domeny (jeśli zmieniasz serwery nazw) może potrwać do kilku godzin.' },
      ], related: ['jak-podpiac-domene', 'instalacja-wordpress', 'certyfikat-ssl'] }),

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
    { d: 'Przewodnik po pulpicie klienta Verris — gdzie znajdziesz usługi, rozliczenia, wsparcie i ustawienia konta.',
      faq: [
        { q: 'Gdzie znajdę narzędzia konkretnej usługi?', a: 'Wejdź w usługę z listy „Usługi" — otworzy się jej hub z zakładkami (pliki, bazy, poczta, DNS, SSL). Menu boczne pozostaje globalne.' },
        { q: 'Jak szybko dostać pomoc?', a: 'W sekcji „Wsparcie" założysz zgłoszenie (ticket). System podpowie też pasujące artykuły z bazy wiedzy jeszcze przed wysłaniem.' },
      ], related: ['pierwsze-kroki-po-rejestracji'] }),

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
Po propagacji domena wskaże Twoją stronę. Sprawdzisz to poleceniem w terminalu:

\`\`\`bash
# Sprawdź, na jaki adres wskazuje domena
dig +short twojadomena.pl A
# lub serwery nazw
dig +short twojadomena.pl NS
\`\`\`

Następnie włącz SSL i wymuś HTTPS.`,
    { t: 'Jak podpiąć domenę do hostingu — serwery nazw lub rekord A', d: 'Instrukcja podpięcia domeny do hostingu Verris: zmiana serwerów nazw (NS) lub ustawienie rekordu A. Krok po kroku.',
      faq: [
        { q: 'Serwery nazw czy rekord A — co wybrać?', a: 'Zalecamy serwery nazw (NS) — całą strefą DNS zarządzasz wtedy z panelu Verris. Rekord A wybierz, jeśli musisz zostawić DNS u obecnego dostawcy.' },
        { q: 'Jak długo trwa propagacja?', a: 'Zwykle od kilkunastu minut do kilku godzin, w skrajnych przypadkach do 24–48 h — zależnie od TTL i rejestratora.' },
      ], related: ['rekordy-dns-wyjasnione', 'certyfikat-ssl', 'jak-dodac-subdomene'] }),

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
    { d: 'Jak zarejestrować domenę w Verris: sprawdzenie dostępności, ceny, dane abonenta i automatyczna konfiguracja pod hosting.',
      faq: [
        { q: 'Czy mogę zarejestrować domenę bez wykupu hostingu?', a: 'Tak. Domenę możesz zarejestrować samodzielnie i skonfigurować później, gdy zamówisz hosting lub pocztę.' },
        { q: 'Co się stanie, jeśli nie odnowię domeny?', a: 'Po terminie ważności domena przechodzi w okres kwarantanny i przestaje działać. Włącz przypomnienia i automatyczne odnowienia, aby nie utracić nazwy.' },
      ], related: ['transfer-domeny', 'jak-podpiac-domene'] }),

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
    { t: 'Transfer domeny do Verris — jak przenieść domenę bez przestoju', d: 'Jak przenieść domenę do Verris: odblokowanie, kod authinfo/EPP, zlecenie transferu i utrzymanie ciągłości strony i poczty.',
      faq: [
        { q: 'Czy transfer spowoduje przerwę w działaniu strony?', a: 'Nie musi. Jeśli przed transferem podepniesz domenę do hostingu (rekord A/NS), strona i poczta działają nieprzerwanie w trakcie przenoszenia.' },
        { q: 'Czy transfer przedłuża ważność domeny?', a: 'W większości rozszerzeń (np. .pl, .com) transfer przedłuża ważność o rok. Wyjątkiem są domeny tuż przed wygaśnięciem — przenieś je z zapasem czasu.' },
      ], related: ['rejestracja-domeny', 'migracja-do-verris'] }),

  A('domeny-dns', 'rekordy-dns-wyjasnione', 'Rekordy DNS wyjaśnione (A, AAAA, CNAME, MX, TXT)',
    'Do czego służą najważniejsze rekordy DNS i kiedy ich używać.',
    `## A i AAAA
**A** wskazuje domenę na adres IPv4 serwera, **AAAA** na IPv6. To podstawowe rekordy kierujące ruch do Twojej strony.

## CNAME
**CNAME** to alias — kieruje jedną nazwę na drugą (np. www na domenę główną). Nie używaj CNAME dla domeny głównej z rekordami MX.

## MX
**MX** wskazuje serwery poczty przyjmujące wiadomości dla domeny. Priorytet (niższy = ważniejszy) ustala kolejność.

## TXT (SPF, DKIM, DMARC)
Rekordy **TXT** przechowują m.in. SPF, DKIM i DMARC — kluczowe dla dostarczalności poczty (patrz osobny artykuł). Przykład rekordu SPF:

\`\`\`text
Typ:    TXT
Nazwa:  @
Wartość: v=spf1 include:_spf.verris.pl ~all
\`\`\`

## Propagacja
Zmiany DNS propagują się do kilku–kilkunastu godzin, zależnie od TTL.`,
    { d: 'Rekordy DNS wyjaśnione prosto: A, AAAA, CNAME, MX, TXT (SPF/DKIM/DMARC). Kiedy i jak ich używać.',
      faq: [
        { q: 'Czym różni się rekord A od CNAME?', a: 'Rekord A wskazuje nazwę bezpośrednio na adres IP. CNAME to alias kierujący jedną nazwę na drugą. Dla domeny głównej używaj A, nie CNAME.' },
        { q: 'Dlaczego zmiany DNS nie działają od razu?', a: 'Rekordy są buforowane zgodnie z parametrem TTL. Do czasu wygaśnięcia cache odwiedzający mogą widzieć starą wartość — stąd propagacja trwa od kilku minut do kilku godzin.' },
      ], related: ['jak-podpiac-domene', 'spf-dkim-dmarc'] }),

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
    { d: 'Jak dodać subdomenę w Verris (np. blog.twojadomena.pl): tworzenie, zawartość i SSL. Instrukcja krok po kroku.',
      faq: [
        { q: 'Czy subdomena jest dodatkowo płatna?', a: 'Nie. Subdomeny tworzysz w ramach swojego konta hostingowego bez dodatkowych opłat, w granicach limitów planu.' },
        { q: 'Czy subdomena dostanie certyfikat SSL?', a: 'Tak, wystawimy dla niej darmowy certyfikat. Przy wielu subdomenach rozważ certyfikat wildcard, który obejmuje wszystkie naraz.' },
      ], related: ['jak-podpiac-domene', 'wildcard-ssl'] }),

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
Standardowe uprawnienia to 644 dla plików i 755 dla katalogów. Nie ustawiaj 777. Możesz je ustawić hurtowo przez SSH:

\`\`\`bash
# Pliki: 644, katalogi: 755 (uruchom w katalogu strony)
find . -type f -exec chmod 644 {} \\;
find . -type d -exec chmod 755 {} \\;
\`\`\``,
    { t: 'Jak wgrać stronę na serwer — menedżer plików i FTP', d: 'Publikacja strony na hostingu Verris: wbudowany menedżer plików oraz FTP/SFTP. Gdzie umieścić pliki i jakie uprawnienia ustawić.',
      faq: [
        { q: 'Gdzie mam wgrać pliki strony?', a: 'Do katalogu public_html domeny głównej. Subdomeny i domeny dodatkowe mają własne, osobne katalogi.' },
        { q: 'Czy mogę wgrać całą stronę jako archiwum ZIP?', a: 'Tak. Prześlij plik ZIP przez menedżer plików i rozpakuj go na miejscu — to szybsze niż wysyłanie setek pojedynczych plików przez FTP.' },
      ], related: ['konta-ftp', 'wersja-php', 'uprawnienia-plikow-chmod'] }),

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
    { d: 'Jak utworzyć konto FTP/SFTP w Verris: login, hasło, katalog domowy i dane do połączenia. Bezpieczny dostęp do plików.',
      faq: [
        { q: 'FTP czy SFTP — co jest bezpieczniejsze?', a: 'SFTP. Szyfruje całe połączenie (port 22), podczas gdy zwykły FTP przesyła login i hasło jawnie. Zawsze wybieraj SFTP, jeśli klient go obsługuje.' },
        { q: 'Czy mogę ograniczyć konto FTP do jednego folderu?', a: 'Tak. Przy tworzeniu konta ustaw katalog domowy na wybrany folder — użytkownik nie wyjdzie poza niego. To wygodne dla współpracowników.' },
      ], related: ['jak-wgrac-strone', 'uprawnienia-plikow-chmod'] }),

  A('hosting-pliki', 'wersja-php', 'Jak zmienić wersję PHP',
    'Wybierz wersję PHP dopasowaną do aplikacji (CloudLinux PHP Selector).',
    `## Po co zmieniać wersję PHP
Różne aplikacje wymagają różnych wersji PHP. Nowsze wersje są szybsze i bezpieczniejsze, ale starsze skrypty mogą wymagać konkretnej wersji.

## Zmiana w panelu
W hubie usługi wybierz **Wersja PHP** i ustaw żądaną wersję dla konta. Zmiana działa od razu.

## Rozszerzenia i limity
Możesz włączać rozszerzenia PHP oraz dostosować podstawowe parametry (limit pamięci, czas wykonania) w granicach planu. Przykład ustawień w pliku \`.user.ini\`:

\`\`\`ini
memory_limit = 256M
upload_max_filesize = 64M
post_max_size = 64M
max_execution_time = 120
\`\`\`

## Zalecenie
Dla WordPress i nowych projektów wybierz najnowszą stabilną wersję obsługiwaną przez aplikację.`,
    { d: 'Jak zmienić wersję PHP na hostingu Verris (CloudLinux PHP Selector): wybór wersji, rozszerzenia i limity.',
      faq: [
        { q: 'Którą wersję PHP wybrać dla WordPress?', a: 'Najnowszą stabilną wersję obsługiwaną przez Twoje wtyczki i motyw (zwykle PHP 8.2 lub 8.3). Nowsze wersje są szybsze i bezpieczniejsze.' },
        { q: 'Zmiana wersji PHP zepsuła stronę — co zrobić?', a: 'Wróć do poprzedniej wersji w panelu (zmiana jest natychmiastowa) i zaktualizuj wtyczki/motyw do wersji zgodnej z nowszym PHP, zanim spróbujesz ponownie.' },
      ], related: ['optymalizacja-wordpress', 'limity-php-user-ini'] }),

  A('hosting-pliki', 'zadania-cron', 'Zadania cron (harmonogram)',
    'Uruchamiaj skrypty cyklicznie — kopie, importy, powiadomienia.',
    `## Czym jest cron
Cron to harmonogram uruchamiający polecenia w zadanym czasie — np. skrypt WordPress co godzinę albo backup w nocy.

## Dodanie zadania
W sekcji **Cron** wybierz gotowy preset (co godzinę, codziennie, co tydzień) lub ustaw własny harmonogram, a następnie wpisz polecenie do wykonania.

## Format harmonogramu
Cron używa pięciu pól: minuta, godzina, dzień miesiąca, miesiąc, dzień tygodnia.

\`\`\`cron
# min godz dzień mies dzień_tyg  polecenie
0 3 * * *   /usr/local/bin/php /home/user/backup.php
*/15 * * * * /usr/local/bin/php /home/user/public_html/wp-cron.php
\`\`\`

## Typowe przykłady
- Wywołanie **wp-cron** WordPress
- Import/eksport danych
- Czyszczenie plików tymczasowych

## Wskazówka
Nie ustawiaj zbyt częstych zadań (np. co minutę), jeśli nie są konieczne — obciążają serwer.`,
    { d: 'Zadania cron na hostingu Verris: presety harmonogramu, własne wyrażenia i typowe przykłady (wp-cron, backup, import).',
      faq: [
        { q: 'Co oznaczają gwiazdki w harmonogramie cron?', a: 'Pięć pól to kolejno: minuta, godzina, dzień miesiąca, miesiąc, dzień tygodnia. Gwiazdka oznacza „każdy". Np. „0 3 * * *" to codziennie o 3:00.' },
        { q: 'Jak podpiąć wp-cron zamiast domyślnego mechanizmu WordPress?', a: 'Wyłącz wewnętrzny wp-cron w wp-config.php (define WP_CRON tak jak w artykule o WordPress) i dodaj zadanie cron wywołujące wp-cron.php co 15 minut.' },
      ], related: ['wersja-php', 'optymalizacja-wordpress'] }),

  A('hosting-pliki', 'uprawnienia-plikow-chmod', 'Uprawnienia plików (chmod) — 644, 755 i błąd 403',
    'Poprawne uprawnienia plików i katalogów oraz jak naprawić błąd 403/500.',
    `## Jak działa chmod
Uprawnienia określają, kto może czytać, zapisywać i wykonywać plik. Zapis liczbowy to suma: odczyt (4), zapis (2), wykonanie (1) — osobno dla właściciela, grupy i innych.

## Zalecane wartości
- **Pliki:** 644 (właściciel zapis+odczyt, reszta odczyt)
- **Katalogi:** 755 (wejście do katalogu wymaga bitu wykonania)
- **Pliki z hasłami** (np. wp-config.php): 600 lub 640

## Hurtowe ustawienie
\`\`\`bash
# W katalogu strony:
find . -type f -exec chmod 644 {} \\;
find . -type d -exec chmod 755 {} \\;
chmod 600 wp-config.php
\`\`\`

## Błąd 403 / 500
Zbyt luźne uprawnienia (np. 777) lub zapisywalny plik konfiguracyjny bywają blokowane przez serwer. Ustaw 644/755 i sprawdź, czy właścicielem plików jest Twój użytkownik. **Nigdy nie ustawiaj 777.**`,
    { t: 'Uprawnienia plików chmod na hostingu — 644, 755 i błąd 403', d: 'Jak ustawić poprawne uprawnienia plików i katalogów (chmod 644/755), zabezpieczyć wp-config.php i naprawić błąd 403/500.',
      faq: [
        { q: 'Dlaczego nie powinienem ustawiać 777?', a: 'Uprawnienia 777 pozwalają każdemu zapisywać do pliku, co jest poważną luką bezpieczeństwa. Wiele serwerów blokuje takie pliki błędem 403. Używaj 644 dla plików i 755 dla katalogów.' },
        { q: 'Jakie uprawnienia dla wp-config.php?', a: 'Zalecane 600 lub 640 — plik zawiera dane dostępu do bazy, więc nie powinien być czytelny dla innych użytkowników serwera.' },
      ], related: ['jak-wgrac-strone', 'bezpieczenstwo-wordpress'] }),

  A('hosting-pliki', 'limity-php-user-ini', 'Limity PHP — upload, pamięć i czas wykonania (.user.ini)',
    'Zwiększ limit uploadu, pamięci i czasu wykonania skryptów PHP.',
    `## Kiedy zmienić limity
Błędy typu „file exceeds upload_max_filesize", „Allowed memory size exhausted" czy „Maximum execution time exceeded" oznaczają, że domyślne limity są za niskie dla Twojej aplikacji.

## Plik .user.ini
W katalogu \`public_html\` utwórz lub edytuj plik \`.user.ini\`:

\`\`\`ini
; Rozmiar wysyłanych plików
upload_max_filesize = 128M
post_max_size = 128M
; Pamięć i czas
memory_limit = 256M
max_execution_time = 300
max_input_vars = 3000
\`\`\`

## WordPress
Alternatywnie w \`wp-config.php\` przed linią „That's all":

\`\`\`php
@ini_set( 'memory_limit', '256M' );
define( 'WP_MEMORY_LIMIT', '256M' );
\`\`\`

## Uwaga
Zmiany w \`.user.ini\` mogą zacząć działać z opóźnieniem kilku minut (cache). Limity obowiązują w granicach Twojego planu.`,
    { t: 'Limity PHP — upload, pamięć i czas wykonania (.user.ini)', d: 'Jak zwiększyć upload_max_filesize, memory_limit i max_execution_time na hostingu przez plik .user.ini oraz w wp-config.php.',
      faq: [
        { q: 'Zmiana w .user.ini nie działa — dlaczego?', a: 'Plik .user.ini jest buforowany. Odczekaj kilka minut albo sprawdź w phpinfo, czy wartość się zaktualizowała. Upewnij się też, że plik jest w katalogu public_html.' },
        { q: 'Jak sprawdzić aktualne limity PHP?', a: 'Utwórz plik z zawartością <?php phpinfo(); ?> i otwórz go w przeglądarce (potem usuń), albo sprawdź wartości w panelu w sekcji Wersja PHP.' },
      ], related: ['wersja-php', 'optymalizacja-wordpress'] }),

  // ---------------- Bazy danych
  A('bazy-danych', 'bazy-mysql', 'Jak utworzyć bazę danych MySQL',
    'Załóż bazę i użytkownika, aby podłączyć aplikację lub CMS.',
    `## Tworzenie bazy
W hubie usługi otwórz **Bazy danych** i wybierz **Utwórz bazę**. Podaj nazwę bazy oraz utwórz użytkownika z hasłem.

## Dane do połączenia
Aplikacja (np. WordPress) potrzebuje: **hosta** (zwykle localhost), **nazwy bazy**, **użytkownika** i **hasła**. Przykład dla WordPress (\`wp-config.php\`):

\`\`\`php
define( 'DB_NAME', 'user_wordpress' );
define( 'DB_USER', 'user_wpadmin' );
define( 'DB_PASSWORD', 'twoje-silne-haslo' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' );
\`\`\`

## Zarządzanie
Bazę obsłużysz przez wbudowane narzędzie (np. phpMyAdmin) — import, eksport, zapytania SQL.

## Bezpieczeństwo
Nadawaj użytkownikowi dostęp tylko do jego bazy i używaj silnych haseł. Regularnie rób kopie zapasowe baz.`,
    { t: 'Jak utworzyć bazę danych MySQL na hostingu', d: 'Tworzenie bazy MySQL i użytkownika w Verris, dane do połączenia dla WordPress i innych aplikacji oraz zarządzanie przez phpMyAdmin.',
      faq: [
        { q: 'Jaki host bazy danych wpisać w konfiguracji?', a: 'Zwykle „localhost", bo baza działa na tym samym serwerze co strona. Do połączeń z zewnątrz użyj zdalnego dostępu MySQL i adresu serwera.' },
        { q: 'Jak wykonać kopię bazy danych?', a: 'Najprościej wyeksportować ją przez phpMyAdmin (zakładka Eksport) do pliku .sql, lub przez SSH poleceniem mysqldump. Kopie baz obejmuje też backup 1-klik.' },
      ], related: ['zdalny-dostep-mysql', 'backup-1-klik'] }),

  A('bazy-danych', 'zdalny-dostep-mysql', 'Zdalny dostęp do bazy MySQL',
    'Zezwól na połączenie z bazą z zewnętrznego adresu IP.',
    `## Kiedy potrzebny
Zdalny dostęp przydaje się, gdy łączysz się z bazą z komputera lub innej usługi (np. lokalne narzędzie, aplikacja zewnętrzna).

## Konfiguracja
W sekcji baz danych dodaj **dozwolony host** (adres IP), z którego będą przychodzić połączenia. Bez tego serwer odrzuci zdalne logowanie.

## Połączenie
Po dodaniu hosta połączysz się np. z wiersza poleceń:

\`\`\`bash
mysql -h serwer.verris.pl -u user_nazwa -p nazwa_bazy
\`\`\`

## Bezpieczeństwo
Ogranicz dostęp do konkretnego IP zamiast otwierać na cały świat. Używaj silnego hasła i, jeśli to możliwe, połączenia szyfrowanego.`,
    { d: 'Zdalny dostęp do bazy MySQL w Verris: dodanie dozwolonego hosta (IP) i bezpieczna konfiguracja połączenia.',
      faq: [
        { q: 'Dlaczego zdalne połączenie z bazą jest odrzucane?', a: 'Najczęściej brakuje dozwolonego hosta. Dodaj swój publiczny adres IP na liście dostępu w sekcji baz danych — bez tego serwer blokuje logowanie z zewnątrz.' },
        { q: 'Czy mogę otworzyć bazę na wszystkie adresy IP?', a: 'Technicznie tak (host „%"), ale odradzamy — to duże ryzyko. Ogranicz dostęp do konkretnych, znanych adresów IP.' },
      ], related: ['bazy-mysql'] }),

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
    { t: 'Jak założyć skrzynkę e-mail w swojej domenie', d: 'Zakładanie skrzynki e-mail w Verris: adres w domenie, hasło, pojemność i dostęp przez webmail lub program pocztowy.',
      faq: [
        { q: 'Ile skrzynek mogę założyć?', a: 'Zależy od planu — limit i pojemność skrzynek znajdziesz w opisie usługi. W większości planów tworzysz wiele skrzynek w ramach dostępnej przestrzeni.' },
        { q: 'Jak dostać się do poczty bez konfigurowania programu?', a: 'Skorzystaj z webmaila — zaloguj się w przeglądarce pełnym adresem e-mail i hasłem skrzynki. To najszybszy sposób sprawdzenia poczty.' },
      ], related: ['konfiguracja-poczty-imap-smtp', 'spf-dkim-dmarc', 'filtr-antyspam'] }),

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
    { d: 'Konfiguracja poczty w programie pocztowym: ustawienia IMAP i SMTP dla Verris (serwery, porty, szyfrowanie).',
      faq: [
        { q: 'IMAP czy POP3 — co wybrać?', a: 'IMAP. Synchronizuje pocztę między wszystkimi urządzeniami (telefon, komputer, webmail). POP3 pobiera wiadomości tylko na jedno urządzenie i zwykle je usuwa z serwera.' },
        { q: 'Który port SMTP wybrać — 465 czy 587?', a: 'Oba działają. 465 używa SSL od razu, 587 używa STARTTLS. Jeśli jeden jest blokowany przez sieć, wypróbuj drugi. Zawsze włącz uwierzytelnianie.' },
      ], related: ['zakladanie-skrzynki', 'spf-dkim-dmarc'] }),

  A('poczta', 'spf-dkim-dmarc', 'SPF, DKIM i DMARC — dostarczalność poczty',
    'Trzy rekordy, które chronią Twoją pocztę przed folderem spam.',
    `## Dlaczego to ważne
SPF, DKIM i DMARC potwierdzają, że wiadomości z Twojej domeny są autentyczne. Bez nich poczta częściej trafia do spamu lub jest odrzucana.

## SPF
Rekord TXT wskazujący serwery uprawnione do wysyłki w imieniu domeny:

\`\`\`text
Typ: TXT   Nazwa: @   Wartość: v=spf1 include:_spf.verris.pl ~all
\`\`\`

## DKIM
Podpis kryptograficzny dodawany do wiadomości; odbiorca weryfikuje go rekordem TXT z kluczem publicznym (generowanym w panelu poczty).

## DMARC
Polityka mówiąca, co zrobić z wiadomościami, które nie przejdą SPF/DKIM. Zacznij od polityki monitorującej:

\`\`\`text
Typ: TXT   Nazwa: _dmarc   Wartość: v=DMARC1; p=none; rua=mailto:dmarc@twojadomena.pl
\`\`\`

## W panelu
W dashboardzie dostarczalności sprawdzisz stan SPF/DKIM/DMARC oraz reputację. Postępuj zgodnie z podpowiedziami, aby ustawić rekordy.`,
    { t: 'SPF, DKIM, DMARC — jak poprawić dostarczalność poczty', d: 'Wyjaśnienie SPF, DKIM i DMARC oraz jak je ustawić, aby poczta z Twojej domeny nie trafiała do spamu.',
      faq: [
        { q: 'Poczta trafia do spamu — od czego zacząć?', a: 'Ustaw poprawny SPF, włącz DKIM w panelu poczty i dodaj rekord DMARC (na start z polityką p=none). To trzy najważniejsze kroki poprawy dostarczalności.' },
        { q: 'Od jakiej polityki DMARC zacząć?', a: 'Od p=none — tylko monitoruje i raportuje, nie odrzuca poczty. Po kilku tygodniach obserwacji raportów możesz zaostrzyć do quarantine, a potem reject.' },
      ], related: ['konfiguracja-poczty-imap-smtp', 'rekordy-dns-wyjasnione', 'filtr-antyspam'] }),

  A('poczta', 'forwardery-autorespondery', 'Forwardery i autorespondery',
    'Przekierowania wiadomości i automatyczne odpowiedzi.',
    `## Forwarder (przekierowanie)
Forwarder przesyła pocztę z jednego adresu na inny — np. z biuro@twojadomena.pl na Twoją skrzynkę główną. Możesz kierować do wielu odbiorców.

## Autoresponder
Automatyczna odpowiedź (np. na urlopie) wysyłana do nadawców w zadanym okresie. Ustaw temat, treść i daty obowiązywania.

## Catch-all
Opcjonalnie możesz włączyć catch-all — przechwytywanie poczty na nieistniejące adresy w domenie. Uważaj, bo zwiększa ilość spamu.`,
    { d: 'Forwardery (przekierowania) i autorespondery w poczcie Verris oraz opcja catch-all. Jak je skonfigurować.',
      faq: [
        { q: 'Czy forwarder zostawia kopię wiadomości na skrzynce?', a: 'Zależy od konfiguracji — możesz przekierowywać z zachowaniem kopii lub bez. Jeśli chcesz mieć archiwum, włącz zachowanie kopii w ustawieniach forwardera.' },
        { q: 'Czy warto włączać catch-all?', a: 'Tylko jeśli naprawdę potrzebujesz łapać pocztę na dowolny adres w domenie. Catch-all zauważalnie zwiększa ilość spamu — zwykle lepiej utworzyć konkretne aliasy.' },
      ], related: ['zakladanie-skrzynki', 'filtr-antyspam'] }),

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
    { d: 'Filtr antyspamowy w Verris: włączanie, czułość, białe i czarne listy. Mniej spamu bez utraty ważnych wiadomości.',
      faq: [
        { q: 'Ważne maile trafiają do spamu — co zrobić?', a: 'Zmniejsz czułość filtra i dodaj zaufanych nadawców do białej listy. Sprawdź też, czy nadawca ma poprawny SPF/DKIM — braki po jego stronie zwiększają punktację spamu.' },
        { q: 'Czy filtr usuwa spam automatycznie?', a: 'Domyślnie oznacza i przenosi wiadomości do folderu spam, a nie kasuje. Dzięki temu możesz odzyskać błędnie zakwalifikowaną pocztę.' },
      ], related: ['spf-dkim-dmarc', 'forwardery-autorespondery'] }),

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
    { t: 'Darmowy certyfikat SSL (Let’s Encrypt) — jak włączyć HTTPS', d: 'Jak włączyć darmowy certyfikat SSL Let’s Encrypt w Verris i uruchomić HTTPS na stronie. Automatyczne odnawianie.',
      faq: [
        { q: 'Czy certyfikat SSL jest płatny?', a: 'Nie. Dla domen podpiętych do hostingu wystawiamy darmowy certyfikat Let’s Encrypt, który odnawia się automatycznie. Certyfikaty premium (np. wildcard) to osobna opcja.' },
        { q: 'Certyfikat się nie wystawia — dlaczego?', a: 'Najczęściej domena nie wskazuje jeszcze na serwer. Sprawdź rekord A / serwery nazw i poczekaj na propagację, a następnie wygeneruj certyfikat ponownie.' },
      ], related: ['wymus-https', 'wildcard-ssl', 'jak-podpiac-domene'] }),

  A('ssl', 'wymus-https', 'Jak wymusić HTTPS',
    'Przekieruj cały ruch z HTTP na bezpieczne HTTPS.',
    `## Po co wymuszać HTTPS
Gdy masz certyfikat, warto przekierować HTTP → HTTPS, aby użytkownicy zawsze łączyli się szyfrowanie i by uniknąć ostrzeżeń przeglądarki.

## W panelu
W sekcji **Narzędzia WWW** włącz **Wymuś HTTPS** i opcjonalnie kanonizację www/bez-www. Wprowadzimy odpowiedni wpis w .htaccess.

## Ręcznie w .htaccess
Jeśli wolisz zrobić to sam, dodaj na początku pliku \`.htaccess\`:

\`\`\`apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
\`\`\`

## WordPress
Ustaw adres witryny na https:// w ustawieniach ogólnych, aby uniknąć mieszanej zawartości.

## Weryfikacja
Sprawdź, czy kłódka pojawia się na wszystkich podstronach i czy nie ma ostrzeżeń o „mixed content".`,
    { d: 'Jak wymusić HTTPS na hostingu Verris: przekierowanie HTTP→HTTPS, kanonizacja www i ustawienia dla WordPress.',
      faq: [
        { q: 'Widzę ostrzeżenie „mixed content" — co to znaczy?', a: 'Strona ładuje się przez HTTPS, ale niektóre zasoby (obrazy, skrypty) przez HTTP. W WordPress ustaw adres witryny na https:// i podmień linki do zasobów na https.' },
        { q: 'Przekierowanie na HTTPS powoduje pętlę — jak naprawić?', a: 'Zwykle wynika z podwójnego przekierowania (np. serwer + wtyczka). Zostaw tylko jedną regułę: w .htaccess albo w panelu, nie w obu miejscach naraz.' },
      ], related: ['certyfikat-ssl', 'bezpieczenstwo-wordpress'] }),

  A('ssl', 'wildcard-ssl', 'Certyfikat wildcard (*.domena)',
    'Jeden certyfikat dla wszystkich subdomen.',
    `## Kiedy warto
Certyfikat **wildcard** zabezpiecza domenę i wszystkie jej subdomeny (np. blog., sklep., panel.) jednym certyfikatem — wygodne, gdy masz ich wiele.

## Wystawienie (DNS-01)
Wildcard wymaga walidacji metodą **DNS-01** — dodania rekordu TXT. W panelu przeprowadzimy Cię przez proces; przy domenach z DNS u nas dzieje się to automatycznie.

## Podgląd certyfikatu
W panelu zobaczysz datę wygaśnięcia, listę nazw (SAN) i informację, czy certyfikat jest typu wildcard.`,
    { d: 'Certyfikat SSL wildcard (*.domena) w Verris: jeden certyfikat dla wszystkich subdomen, walidacja DNS-01 i podgląd w panelu.',
      faq: [
        { q: 'Kiedy potrzebuję certyfikatu wildcard?', a: 'Gdy masz wiele subdomen (blog., sklep., panel.) i nie chcesz wystawiać osobnego certyfikatu dla każdej. Wildcard obejmuje wszystkie subdomeny jednym certyfikatem.' },
        { q: 'Dlaczego wildcard wymaga rekordu TXT?', a: 'Walidacja DNS-01 potwierdza, że kontrolujesz całą domenę (a nie tylko jeden host), dodając tymczasowy rekord TXT. Przy DNS u nas robimy to automatycznie.' },
      ], related: ['certyfikat-ssl', 'jak-dodac-subdomene'] }),

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
    { t: 'Instalacja WordPress jednym kliknięciem — hosting Verris', d: 'Jak zainstalować WordPress w Verris instalatorem 1-klik: automatyczna baza, dane administratora, SSL i pierwsze kroki.',
      faq: [
        { q: 'Czy muszę ręcznie tworzyć bazę danych?', a: 'Nie. Instalator 1-klik tworzy bazę i użytkownika automatycznie oraz łączy je z WordPress. Wystarczy, że podasz dane administratora witryny.' },
        { q: 'Gdzie zaloguję się do WordPress po instalacji?', a: 'Pod adresem twojadomena.pl/wp-admin, loginem i hasłem administratora podanym podczas instalacji.' },
      ], related: ['optymalizacja-wordpress', 'bezpieczenstwo-wordpress', 'certyfikat-ssl'] }),

  A('wordpress', 'optymalizacja-wordpress', 'Optymalizacja i cache WordPress',
    'Przyspiesz stronę: cache, obrazy, baza i wersja PHP.',
    `## Cache
Zainstaluj wtyczkę cache i włącz cache strony oraz przeglądarki. Jeśli dostępny jest Redis, użyj go jako object cache.

## wp-cron przez systemowy cron
Domyślny wp-cron uruchamia się przy każdej wizycie i spowalnia stronę. Wyłącz go w \`wp-config.php\` i podepnij systemowy cron:

\`\`\`php
define( 'DISABLE_WP_CRON', true );
\`\`\`

Następnie dodaj zadanie cron wywołujące \`wp-cron.php\` co 15 minut (patrz artykuł o cronie).

## Obrazy
Kompresuj obrazy i używaj formatów nowej generacji (WebP). Włącz leniwe ładowanie (lazy load).

## Wersja PHP
Ustaw najnowszą stabilną wersję PHP — potrafi znacząco przyspieszyć witrynę.

## Baza danych
Okresowo czyść bazę (rewizje, spam, transient) i utrzymuj porządek we wtyczkach — każda dodatkowa spowalnia stronę.`,
    { d: 'Optymalizacja WordPress w Verris: cache, Redis, wp-cron przez systemowy cron, kompresja obrazów, wersja PHP i porządek w bazie.',
      faq: [
        { q: 'Dlaczego warto wyłączyć domyślny wp-cron?', a: 'Domyślnie wp-cron uruchamia się przy każdej wizycie, co obciąża serwer przy dużym ruchu. Podpięcie go pod systemowy cron (co 15 min) jest wydajniejsze i bardziej niezawodne.' },
        { q: 'Która wtyczka cache jest najlepsza?', a: 'Dobrze sprawdzają się popularne wtyczki cache stron. Najważniejsze to włączyć cache strony i przeglądarki oraz — jeśli dostępny — object cache na Redis.' },
      ], related: ['wersja-php', 'zadania-cron', 'core-web-vitals'] }),

  A('wordpress', 'bezpieczenstwo-wordpress', 'Bezpieczeństwo WordPress',
    'Zabezpiecz witrynę przed atakami i przejęciem.',
    `## Podstawy
- Aktualizuj rdzeń, motywy i wtyczki.
- Używaj silnych haseł i 2FA do panelu.
- Instaluj wtyczki tylko z zaufanych źródeł.

## Ochrona logowania i plików
Ogranicz próby logowania i rozważ zmianę domyślnego adresu /wp-admin. Zablokuj dostęp do wrażliwych plików w \`.htaccess\`:

\`\`\`apache
# Zablokuj dostęp do wp-config.php
<Files wp-config.php>
  Require all denied
</Files>

# Wyłącz wykonywanie PHP w katalogu uploads
<Directory "/home/user/public_html/wp-content/uploads">
  <FilesMatch "\\.php$">
    Require all denied
  </FilesMatch>
</Directory>
\`\`\`

WAF na hostingu dodatkowo blokuje typowe ataki.

## Kopie zapasowe
Włącz automatyczne kopie zapasowe — w razie problemu przywrócisz stronę w kilka minut.

## Po włamaniu
Jeśli podejrzewasz włamanie, zmień hasła, przywróć czystą kopię i zaktualizuj wszystkie komponenty.`,
    { d: 'Bezpieczeństwo WordPress: aktualizacje, silne hasła, 2FA, blokada wp-config.php i PHP w uploads, WAF i kopie zapasowe.',
      faq: [
        { q: 'Jak zabezpieczyć plik wp-config.php?', a: 'Ustaw uprawnienia 600 i zablokuj dostęp z sieci regułą w .htaccess (Require all denied). Plik zawiera dane bazy, więc nie powinien być publicznie dostępny.' },
        { q: 'Podejrzewam, że stronę zhakowano — co zrobić najpierw?', a: 'Zmień wszystkie hasła (WordPress, baza, FTP), przywróć czystą kopię zapasową sprzed infekcji i zaktualizuj rdzeń oraz wszystkie wtyczki i motywy.' },
      ], related: ['dwuskladnikowe-logowanie-passkey', 'backup-1-klik', 'uprawnienia-plikow-chmod'] }),

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
    { t: 'Dwuskładnikowe logowanie (2FA) i passkey w Verris', d: 'Jak zabezpieczyć konto Verris: passkey (Face ID, klucz sprzętowy) oraz 2FA TOTP z kodami odzyskiwania.',
      faq: [
        { q: 'Passkey czy kod TOTP — co wybrać?', a: 'Passkey — jest wygodniejszy (odcisk palca, Face ID) i odporny na phishing. Kody TOTP to dobra alternatywa, jeśli Twoje urządzenie nie obsługuje passkeys.' },
        { q: 'Straciłem dostęp do drugiego składnika — jak się zalogować?', a: 'Użyj zapisanych kodów odzyskiwania. Jeśli ich nie masz, skontaktuj się ze wsparciem — zweryfikujemy tożsamość, zanim przywrócimy dostęp.' },
      ], related: ['silne-haslo'] }),

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
    { d: 'Jak ustawić silne hasło: długość, złożoność, unikalność i menedżer haseł. Zasady bezpieczeństwa konta.',
      faq: [
        { q: 'Jak długie powinno być hasło?', a: 'Minimum 12 znaków, im dłuższe tym lepiej. Długość ma większe znaczenie niż skomplikowane znaki — dobra jest długa, losowa fraza z menedżera haseł.' },
        { q: 'Czy muszę zmieniać hasło co jakiś czas?', a: 'Regularna wymuszona zmiana nie jest już zalecana, jeśli hasło jest silne i unikalne. Zmień je natychmiast tylko wtedy, gdy podejrzewasz wyciek.' },
      ], related: ['dwuskladnikowe-logowanie-passkey'] }),

  // ---------------- Kopie zapasowe
  A('kopie-zapasowe', 'backup-1-klik', 'Kopia zapasowa jednym kliknięciem',
    'Wykonaj backup strony i bazy w każdej chwili.',
    `## Backup na żądanie
W hubie usługi wybierz **Kopia zapasowa** i wykonaj backup plików oraz bazy danych jednym kliknięciem. Kopie przechowujemy również poza węzłem (offsite) dla bezpieczeństwa.

## Harmonogram
Włącz automatyczne kopie (np. codziennie) i ustaw retencję — ile kopii przechowywać. Starsze będą automatycznie usuwane.

## Zanim wprowadzisz zmiany
Przed aktualizacją WordPress lub większą zmianą zrób kopię — łatwo cofniesz ewentualny błąd.`,
    { t: 'Kopia zapasowa jednym kliknięciem — backup strony i bazy', d: 'Jak wykonać kopię zapasową w Verris: backup plików i bazy 1-klik, kopie offsite, harmonogram i retencja.',
      faq: [
        { q: 'Gdzie przechowywane są kopie zapasowe?', a: 'Kopie trzymamy również poza węzłem (offsite), więc pozostają dostępne nawet w razie awarii serwera, na którym działa Twoja strona.' },
        { q: 'Jak często robić kopie?', a: 'Włącz automatyczny backup codzienny, a dodatkowo rób kopię ręczną przed każdą większą zmianą lub aktualizacją. Ustaw retencję zależnie od tego, jak daleko wstecz chcesz sięgać.' },
      ], related: ['przywracanie-backupu', 'bezpieczenstwo-wordpress'] }),

  A('kopie-zapasowe', 'przywracanie-backupu', 'Jak przywrócić kopię zapasową',
    'Odtwórz stronę lub bazę z wcześniejszej kopii.',
    `## Wybór kopii
W sekcji kopii zapasowych zobaczysz listę backupów z datami. Wybierz odpowiednią kopię do przywrócenia.

## Przywracanie
Możesz przywrócić pliki, bazę lub całość. Operacja nadpisze bieżącą zawartość — w razie wątpliwości najpierw wykonaj świeżą kopię.

## Po przywróceniu
Sprawdź działanie strony i poczty. Jeśli przywracasz po awarii/włamaniu, dodatkowo zmień hasła i zaktualizuj komponenty.`,
    { d: 'Jak przywrócić kopię zapasową w Verris: wybór backupu, przywracanie plików/bazy i weryfikacja po odtworzeniu.',
      faq: [
        { q: 'Czy przywrócenie kopii nadpisze obecną stronę?', a: 'Tak. Przywracanie zastępuje bieżące pliki/bazę zawartością z kopii. Jeśli nie masz pewności, najpierw wykonaj świeży backup stanu obecnego.' },
        { q: 'Czy mogę przywrócić tylko bazę bez plików?', a: 'Tak. Możesz wybrać przywrócenie samych plików, samej bazy lub całości — zależnie od tego, co wymaga odtworzenia.' },
      ], related: ['backup-1-klik'] }),

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
    { t: 'Portfel i płatności w Verris — jak działa rozliczanie', d: 'Portfel Verris: doładowania kartą/przelewem, płatności za usługi, historia operacji i przypomnienia o niskim saldzie.',
      faq: [
        { q: 'Jak doładować portfel?', a: 'W sekcji rozliczeń wybierz doładowanie i zapłać kartą lub przelewem. Środki pojawią się na saldzie i posłużą do opłacania usług oraz odnowień.' },
        { q: 'Co się stanie, gdy zabraknie środków na odnowienie?', a: 'Wyślemy przypomnienie o niskim saldzie z wyprzedzeniem. Doładuj portfel przed terminem, aby usługa nie została zawieszona.' },
      ], related: ['faktury', 'autoskalowanie-bezpiecznik-kosztow'] }),

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
    { d: 'Faktury w Verris: uzupełnienie danych firmy (NIP, adres), automatyczne wystawianie i pobieranie PDF z panelu.',
      faq: [
        { q: 'Gdzie pobiorę fakturę?', a: 'W sekcji rozliczeń — każdą opłaconą usługę fakturujemy automatycznie, a plik PDF jest gotowy do pobrania.' },
        { q: 'Zmieniły się dane mojej firmy — czy poprawię starą fakturę?', a: 'Zaktualizuj dane w ustawieniach; zostaną użyte na kolejnych fakturach. W sprawie korekty już wystawionego dokumentu napisz do wsparcia.' },
      ], related: ['portfel-i-platnosci'] }),

  A('rozliczenia', 'autoskalowanie-bezpiecznik-kosztow', 'Autoskalowanie i bezpiecznik kosztów',
    'Wydajność rośnie w szczycie, a Ty kontrolujesz wydatki.',
    `## Czym jest autoskalowanie
Gdy strona ma większy ruch, usługa może chwilowo zwiększyć zasoby (CPU/RAM), aby działała płynnie. Po szczycie wraca do bazowego poziomu.

## Bezpiecznik kosztów
Ustaw miesięczny limit wydatków na autoskalowanie. Po jego osiągnięciu skalowanie się zatrzyma, więc nie przekroczysz budżetu.

## Podgląd
W panelu zobaczysz historię skalowania i bieżące zużycie. Otrzymasz też rekomendacje zmiany planu, jeśli skalujesz często.`,
    { d: 'Autoskalowanie w Verris i bezpiecznik kosztów: więcej mocy w szczycie ruchu przy pełnej kontroli miesięcznego budżetu.',
      faq: [
        { q: 'Czy autoskalowanie może niespodziewanie podnieść rachunek?', a: 'Nie, jeśli ustawisz bezpiecznik kosztów. Po osiągnięciu miesięcznego limitu skalowanie się zatrzymuje, więc masz pełną kontrolę nad budżetem.' },
        { q: 'Kiedy lepiej zmienić plan zamiast skalować?', a: 'Jeśli skalujesz często i regularnie osiągasz limit, tańszy i stabilniejszy bywa wyższy plan. Panel podpowie rekomendację na podstawie Twojego zużycia.' },
      ], related: ['portfel-i-platnosci'] }),

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
    { t: 'Migracja hostingu do Verris z cPanel, Plesk i DirectAdmin', d: 'Jak przenieść hosting do Verris: migracja automatyczna lub z pomocą pracownika — pliki, bazy, poczta, domeny i subdomeny bez przestoju.',
      faq: [
        { q: 'Czy migracja spowoduje przerwę w działaniu strony?', a: 'Nie musi. Przenosimy najpierw dane i testujemy stronę na naszym serwerze, a domenę przełączasz dopiero po weryfikacji — dzięki temu unikasz przestoju.' },
        { q: 'Co, jeśli automatyczna migracja się nie powiedzie?', a: 'Dostaniesz powiadomienie e-mail, a zgłoszenie trafi z wysokim priorytetem do naszego zespołu, który ręcznie dokończy przeniesienie.' },
      ], related: ['transfer-domeny', 'jak-podpiac-domene'] }),

  // ---------------- Wydajność
  A('wydajnosc', 'przyspieszanie-strony', 'Jak przyspieszyć stronę — cache, kompresja i obrazy',
    'Praktyczne ustawienia .htaccess: kompresja GZIP i cache przeglądarki.',
    `## Od czego zależy szybkość
Na czas ładowania wpływają: rozmiar zasobów (obrazy, JS, CSS), liczba zapytań, cache oraz wersja PHP. Największe zyski dają zwykle kompresja i cache przeglądarki.

## Kompresja GZIP/Brotli
Dodaj do \`.htaccess\`, aby serwer wysyłał skompresowane zasoby:

\`\`\`apache
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/json image/svg+xml
</IfModule>
\`\`\`

## Cache przeglądarki
Ustaw długi czas cache dla statycznych plików:

\`\`\`apache
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
</IfModule>
\`\`\`

## Obrazy
Kompresuj grafikę i używaj formatu WebP. Włącz leniwe ładowanie (lazy load), aby obrazy poza ekranem ładowały się dopiero przy przewijaniu.

## Wersja PHP i cache aplikacji
Ustaw najnowszą stabilną wersję PHP i włącz cache w CMS (np. WordPress).`,
    { t: 'Jak przyspieszyć stronę — GZIP, cache przeglądarki i obrazy (.htaccess)', d: 'Praktyczne przyspieszenie strony na hostingu: kompresja GZIP, cache przeglądarki w .htaccess, WebP i lazy load. Gotowe fragmenty kodu.',
      faq: [
        { q: 'Co najbardziej przyspiesza stronę?', a: 'Zwykle włączenie kompresji GZIP/Brotli, cache przeglądarki dla statycznych plików oraz optymalizacja obrazów (WebP + lazy load). To najprostsze zmiany o dużym efekcie.' },
        { q: 'Czy te ustawienia .htaccess są bezpieczne?', a: 'Tak. Reguły mod_deflate i mod_expires to standardowe, powszechnie stosowane dyrektywy. Dodaj je na końcu .htaccess i sprawdź działanie strony po zapisaniu.' },
      ], related: ['core-web-vitals', 'optymalizacja-wordpress', 'wersja-php'] }),

  A('wydajnosc', 'core-web-vitals', 'Core Web Vitals — jak poprawić LCP, CLS i INP',
    'Popraw wskaźniki Google i pozycję strony w wynikach wyszukiwania.',
    `## Czym są Core Web Vitals
To trzy wskaźniki jakości wrażeń użytkownika, brane pod uwagę przez Google:
- **LCP** (largest contentful paint) — czas wyświetlenia największego elementu; cel < 2,5 s.
- **CLS** (cumulative layout shift) — stabilność układu; cel < 0,1.
- **INP** (interaction to next paint) — responsywność na interakcje; cel < 200 ms.

## Poprawa LCP
Optymalizuj największy obraz/hero, używaj cache i WebP, wczytuj kluczowy zasób priorytetowo:

\`\`\`html
<link rel="preload" as="image" href="/img/hero.webp">
\`\`\`

## Poprawa CLS
Zawsze podawaj wymiary obrazów i osadzeń, aby układ nie „skakał":

\`\`\`html
<img src="/img/foto.webp" width="1200" height="630" alt="opis">
\`\`\`

## Poprawa INP
Ogranicz ciężki JavaScript, dziel skrypty i usuwaj nieużywane wtyczki.

## Pomiar
Zmierz stronę w PageSpeed Insights lub w narzędziu Lighthouse w przeglądarce i poprawiaj najsłabszy wskaźnik jako pierwszy.`,
    { t: 'Core Web Vitals — jak poprawić LCP, CLS i INP', d: 'Jak poprawić Core Web Vitals (LCP, CLS, INP) i szybkość strony: preload obrazu hero, wymiary grafik, lżejszy JavaScript. Lepsze SEO.',
      faq: [
        { q: 'Czy Core Web Vitals wpływają na pozycję w Google?', a: 'Tak, są jednym z sygnałów rankingowych związanych z jakością strony. Nie zastąpią dobrej treści, ale przy porównywalnych stronach mogą przechylić szalę.' },
        { q: 'Jak zmierzyć Core Web Vitals mojej strony?', a: 'Użyj PageSpeed Insights (dane z pola i laboratorium) lub zakładki Lighthouse w narzędziach deweloperskich przeglądarki. Poprawiaj najpierw najsłabszy wskaźnik.' },
      ], related: ['przyspieszanie-strony', 'optymalizacja-wordpress'] }),
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

/** KB-UNIFY-1 — zasil/odśwież indeks AI (podpowiedzi w ticketach) treścią artykułu (z FAQ). */
async function indexAi(a: Art): Promise<void> {
  const ref = `kb-cms:${a.slug}`;
  const faqText = a.faq.map((f) => `${f.q}\n${f.a}`).join('\n\n');
  const plain = toPlain(`${a.title}\n\n${a.excerpt}\n\n${a.body}\n\n${faqText}`);
  const chunks = chunkText(plain);
  const existing = await prisma.aiKnowledgeDoc.findFirst({ where: { sourceRef: ref } });
  let docId: string;
  if (existing) {
    // odśwież dokument i jego chunki (treść mogła się zmienić — nowe FAQ/kod)
    await prisma.aiKnowledgeDoc.update({
      where: { id: existing.id },
      data: { title: a.title, charCount: plain.length, status: 'ACTIVE', audience: 'ALL' },
    });
    await prisma.aiKnowledgeChunk.deleteMany({ where: { docId: existing.id } });
    docId = existing.id;
  } else {
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
    docId = doc.id;
  }
  await prisma.aiKnowledgeChunk.createMany({
    data: chunks.map((content, ordinal) => ({ docId, ordinal, content, embedding: [], tokens: 0 })),
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

  // 2) artykuły — nowe: pełny create; istniejące: patch tylko pól dodatkowych (faq, relatedSlugs)
  let created = 0;
  let updated = 0;
  for (const a of ARTICLES) {
    const categoryId = idBySlug.get(a.categorySlug);
    if (!categoryId) {
      console.warn(`Pomijam artykuł ${a.slug}: brak kategorii ${a.categorySlug}`);
      continue;
    }
    const exists = await prisma.kbArticle.findUnique({ where: { slug: a.slug } });
    if (exists) {
      // Slugi pochodzące z seeda traktujemy jako źródło prawdy: odświeżamy treść,
      // SEO, FAQ, powiązania oraz bloki kodu. Nadpisujemy TYLKO artykuły nadal
      // autorstwa „Zespół Verris" (ręczne edycje w CMS zwykle zmieniają autora),
      // aby re-seed nie kasował pracy redaktora. Status/publikację zostawiamy.
      const author = (exists as { authorName?: string | null }).authorName ?? null;
      if (author === 'Zespół Verris' || author === null) {
        await prisma.kbArticle.update({
          where: { slug: a.slug },
          data: {
            title: a.title,
            excerpt: a.excerpt,
            bodyMarkdown: a.body,
            seoTitle: a.seoTitle ?? null,
            seoDescription: a.seoDescription ?? null,
            faq: a.faq as unknown as object,
            relatedSlugs: a.relatedSlugs,
          },
        });
        await indexAi(a).catch(() => {});
        updated++;
      }
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
        faq: a.faq as unknown as object,
        relatedSlugs: a.relatedSlugs,
        authorName: 'Zespół Verris',
        publishedAt: new Date(),
      },
    });
    await indexAi(a).catch(() => {});
    created++;
  }

  console.log(`KB seed: kategorie=${idBySlug.size}, artykuły nowe=${created}, uzupełnione(FAQ/powiązania)=${updated}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('KB seed error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
