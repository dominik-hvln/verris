/**
 * KB-CONTENT — seed startowej Bazy Wiedzy (CMS): kategorie + artykuły SEO z FAQ.
 * Idempotentny: kategorie upsertowane po slug. Artykuły: tworzone gdy slug nie
 * istnieje; istniejące odświeżamy w całości (treść, SEO, FAQ), ale TYLKO gdy autorem
 * jest nadal „Zespół Verris” — ręczne edycje w CMS zostają. Publikowane od razu,
 * żeby pomoc.verris.pl miała treść. Treści są edytowalne w panelu admina.
 *
 * USAGE (prod, w kontenerze api — przez entrypoint, bo to on składa DATABASE_URL z POSTGRES_*;
 * samo `exec … node …` dostaje pusty DATABASE_URL):
 *   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api \
 *     /usr/local/bin/api-entrypoint.sh node apps/api/dist-cli/cli/seed-kb-cms.js
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
  /** Paczka 130 – szkic (DRAFT): nie trafia na pomoc.verris.pl ani do indeksu AI, dopóki redaktor go nie opublikuje. */
  status?: 'DRAFT' | 'PUBLISHED';
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
  { slug: 'migracja', name: 'Migracja do Verris', description: 'Przeniesienie strony, poczty i domen od innego dostawcy hostingu (np. z cPanel lub Plesk).', order: 11 },
  { slug: 'wydajnosc', name: 'Wydajność i optymalizacja', description: 'Cache, kompresja, Core Web Vitals i szybkość strony.', order: 12 },
  { slug: 'api-integracje', name: 'API i integracje', description: 'Tokeny API, publiczne API v1 i webhooki.', order: 13 },
  { slug: 'kreator-stron', name: 'Kreator stron', description: 'Verris Kreator: strona z opisu firmy, edycja tekstu i zdjęć, publikacja na domenie i Kreator Pro.', order: 14 },
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

/** Szkic artykułu (status DRAFT) – dla funkcji, które jeszcze nie są w sprzedaży (paczka 130: Kreator marki). */
const D = (...a: Parameters<typeof A>): Art => ({ ...A(...a), status: 'DRAFT' });

const ARTICLES: Art[] = [
  // ---------------- Pierwsze kroki
  A('pierwsze-kroki', 'jak-zalozyc-konto', 'Jak założyć konto w Verris',
    'Rejestracja krok po kroku i aktywacja konta klienta.',
    `## Rejestracja konta
Aby zacząć korzystać z Verris, wejdź na panel klienta i wybierz **Załóż konto**. Podaj adres e-mail i ustaw silne hasło.

## Weryfikacja adresu e-mail
Po rejestracji wyślemy wiadomość z linkiem aktywacyjnym. Kliknij go, aby potwierdzić adres – bez tego nie zalogujesz się do panelu. Jeśli mail nie dotarł, sprawdź folder spam lub wyślij link ponownie.

## Pierwsze logowanie
Zaloguj się adresem e-mail i hasłem. Zalecamy od razu włączyć dwuskładnikowe logowanie lub passkey (patrz: Bezpieczeństwo konta).

## Co dalej
Po zalogowaniu zamów pakiet hostingu i przejdź przez kreator „Pierwsze kroki", który przeprowadzi Cię przez konfigurację.`,
    { t: 'Jak założyć konto hostingowe w Verris – rejestracja krok po kroku', d: 'Instrukcja rejestracji konta w Verris: adres e-mail, weryfikacja i pierwsze logowanie. Zacznij korzystać z hostingu w kilka minut.',
      faq: [
        { q: 'Czy założenie konta jest płatne?', a: 'Nie. Rejestracja konta jest bezpłatna – płacisz dopiero za wybraną usługę. Możesz też skorzystać z okresu próbnego.' },
        { q: 'Nie dotarł e-mail aktywacyjny – co zrobić?', a: 'Sprawdź folder spam i zakładkę „Oferty". Jeśli wiadomości nadal nie ma, na ekranie logowania wyślij link aktywacyjny ponownie lub napisz do wsparcia.' },
      ], related: ['pierwsze-kroki-po-rejestracji', 'dwuskladnikowe-logowanie-passkey'] }),

  A('pierwsze-kroki', 'pierwsze-kroki-po-rejestracji', 'Pierwsze kroki po rejestracji',
    'Co zrobić zaraz po założeniu konta, aby szybko uruchomić stronę.',
    `## Zamów hosting
Na pulpicie zamów pakiet hostingu. Każda usługa ma własny hub z narzędziami: pliki, bazy, poczta, DNS i SSL.

## Podłącz domenę
Jeśli masz domenę, podepnij ją do hostingu. Jeśli nie – zarejestruj ją (patrz: Domeny i DNS).

## Wgraj stronę
Skorzystaj z menedżera plików w panelu lub połącz się przez FTP (najlepiej szyfrowane FTPS). Możesz też zainstalować WordPress jednym kliknięciem.

## Włącz SSL
Certyfikat Let's Encrypt wystawiamy za darmo. Po podpięciu domeny włącz SSL i wymuś HTTPS.

## Zadbaj o bezpieczeństwo
Ustaw 2FA lub passkey i sprawdź, czy masz włączone kopie zapasowe.`,
    { d: 'Pierwsze kroki po założeniu konta w Verris: wybór usługi, podpięcie domeny, wgranie strony, SSL i bezpieczeństwo.',
      faq: [
        { q: 'Od czego zacząć, jeśli mam już domenę u innego rejestratora?', a: 'Podepnij ją do hostingu (zmiana serwerów nazw lub rekord A), a następnie wgraj stronę i włącz SSL. Instrukcję znajdziesz w artykule „Jak podpiąć domenę do hostingu".' },
        { q: 'Ile trwa uruchomienie strony?', a: 'Samą stronę wgrasz i uruchomisz w kilka minut. Propagacja domeny (jeśli zmieniasz serwery nazw) może potrwać do kilku godzin.' },
      ], related: ['jak-podpiac-domene', 'instalacja-wordpress', 'certyfikat-ssl'] }),

  A('pierwsze-kroki', 'pulpit-klienta', 'Pulpit klienta – co gdzie znajdziesz',
    'Przewodnik po panelu: usługi, rozliczenia, wsparcie i ustawienia.',
    `## Układ panelu
Menu boczne zawiera globalne sekcje: usługi, rozliczenia, wsparcie i ustawienia konta. Po wejściu w usługę zobaczysz jej hub z narzędziami (pliki, bazy, poczta, DNS, SSL).

## Najważniejsze sekcje
- **Usługi** – lista Twoich usług hostingowych ze stanem zdrowia.
- **Rozliczenia** – portfel, faktury, odnowienia.
- **Wsparcie** – zgłoszenia (tickety) i baza wiedzy.
- **Ustawienia** – dane, bezpieczeństwo, powiadomienia.

## Asystent i podpowiedzi
W panelu znajdziesz kontekstowe podpowiedzi „co dalej" oraz asystenta, który pomaga rozwiązywać typowe sytuacje.`,
    { d: 'Przewodnik po pulpicie klienta Verris – gdzie znajdziesz usługi, rozliczenia, wsparcie i ustawienia konta.',
      faq: [
        { q: 'Gdzie znajdę narzędzia konkretnej usługi?', a: 'Wejdź w usługę z listy „Usługi" – otworzy się jej hub z zakładkami (pliki, bazy, poczta, DNS, SSL). Menu boczne pozostaje globalne.' },
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
    { t: 'Jak podpiąć domenę do hostingu – serwery nazw lub rekord A', d: 'Instrukcja podpięcia domeny do hostingu Verris: zmiana serwerów nazw (NS) lub ustawienie rekordu A. Krok po kroku.',
      faq: [
        { q: 'Serwery nazw czy rekord A – co wybrać?', a: 'Zalecamy serwery nazw (NS) – całą strefą DNS zarządzasz wtedy z panelu Verris. Rekord A wybierz, jeśli musisz zostawić DNS u obecnego dostawcy.' },
        { q: 'Jak długo trwa propagacja?', a: 'Zwykle od kilkunastu minut do kilku godzin, w skrajnych przypadkach do 24–48 h – zależnie od TTL i rejestratora.' },
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
    { t: 'Transfer domeny do Verris – jak przenieść domenę bez przestoju', d: 'Jak przenieść domenę do Verris: odblokowanie, kod authinfo/EPP, zlecenie transferu i utrzymanie ciągłości strony i poczty.',
      faq: [
        { q: 'Czy transfer spowoduje przerwę w działaniu strony?', a: 'Nie musi. Jeśli przed transferem podepniesz domenę do hostingu (rekord A/NS), strona i poczta działają nieprzerwanie w trakcie przenoszenia.' },
        { q: 'Czy transfer przedłuża ważność domeny?', a: 'W większości rozszerzeń (np. .pl, .com) transfer przedłuża ważność o rok. Wyjątkiem są domeny tuż przed wygaśnięciem – przenieś je z zapasem czasu.' },
      ], related: ['rejestracja-domeny', 'migracja-do-verris'] }),

  A('domeny-dns', 'rekordy-dns-wyjasnione', 'Rekordy DNS wyjaśnione (A, AAAA, CNAME, MX, TXT)',
    'Do czego służą najważniejsze rekordy DNS i kiedy ich używać.',
    `## A i AAAA
**A** wskazuje domenę na adres IPv4 serwera, **AAAA** na IPv6. To podstawowe rekordy kierujące ruch do Twojej strony.

## CNAME
**CNAME** to alias – kieruje jedną nazwę na drugą (np. www na domenę główną). Nie używaj CNAME dla domeny głównej z rekordami MX.

## MX
**MX** wskazuje serwery poczty przyjmujące wiadomości dla domeny. Priorytet (niższy = ważniejszy) ustala kolejność.

## TXT (SPF, DKIM, DMARC)
Rekordy **TXT** przechowują m.in. SPF, DKIM i DMARC – kluczowe dla dostarczalności poczty (patrz osobny artykuł). Przykład rekordu SPF:

\`\`\`text
Typ:    TXT
Nazwa:  @
Wartość: v=spf1 a mx ~all
\`\`\`

## Propagacja
Zmiany DNS propagują się do kilku–kilkunastu godzin, zależnie od TTL.`,
    { d: 'Rekordy DNS wyjaśnione prosto: A, AAAA, CNAME, MX, TXT (SPF/DKIM/DMARC). Kiedy i jak ich używać.',
      faq: [
        { q: 'Czym różni się rekord A od CNAME?', a: 'Rekord A wskazuje nazwę bezpośrednio na adres IP. CNAME to alias kierujący jedną nazwę na drugą. Dla domeny głównej używaj A, nie CNAME.' },
        { q: 'Dlaczego zmiany DNS nie działają od razu?', a: 'Rekordy są buforowane zgodnie z parametrem TTL. Do czasu wygaśnięcia cache odwiedzający mogą widzieć starą wartość – stąd propagacja trwa od kilku minut do kilku godzin.' },
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
    'Dwie metody publikacji: wbudowany menedżer plików i klient FTP/FTPS.',
    `## Menedżer plików w panelu
Najprościej wgrać stronę bez dodatkowych programów: w hubie usługi otwórz **Menedżer plików**, wejdź do katalogu **public_html** i prześlij pliki (możesz wgrać archiwum ZIP i rozpakować).

## FTP / FTPS
Do większych projektów użyj klienta (np. FileZilla). Utwórz konto FTP w panelu i połącz się, podając host, login i hasło (port 21). W kliencie wybierz szyfrowanie **FTP przez TLS (FTPS)** – wtedy login i hasło nie idą jawnie.

## Gdzie umieścić pliki
Zawartość strony głównej trafia do **public_html**. Dla subdomen i domen dodatkowych używane są osobne katalogi.

## Uprawnienia
Standardowe uprawnienia to 644 dla plików i 755 dla katalogów. Nie ustawiaj 777. Zmienisz je w menedżerze plików (opcja **Uprawnienia**) albo w kliencie FTP.`,
    { t: 'Jak wgrać stronę na serwer – menedżer plików i FTP', d: 'Publikacja strony na hostingu Verris: wbudowany menedżer plików oraz FTP/FTPS. Gdzie umieścić pliki i jakie uprawnienia ustawić.',
      faq: [
        { q: 'Gdzie mam wgrać pliki strony?', a: 'Do katalogu public_html domeny głównej. Subdomeny i domeny dodatkowe mają własne, osobne katalogi.' },
        { q: 'Czy mogę wgrać całą stronę jako archiwum ZIP?', a: 'Tak. Prześlij plik ZIP przez menedżer plików i rozpakuj go na miejscu – to szybsze niż wysyłanie setek pojedynczych plików przez FTP.' },
      ], related: ['konta-ftp', 'wersja-php', 'uprawnienia-plikow-chmod'] }),

  A('hosting-pliki', 'konta-ftp', 'Jak utworzyć konto FTP',
    'Dodaj konto FTP z ograniczonym dostępem do katalogu.',
    `## Tworzenie konta
W hubie usługi otwórz sekcję **FTP** i wybierz **Dodaj konto**. Podaj login, hasło i katalog domowy (możesz ograniczyć dostęp do jednego folderu).

## Dane do połączenia
- **Host:** adres serwera lub domena
- **Port:** 21, szyfrowanie: FTP przez TLS (FTPS)
- **Login / hasło:** ustawione przy tworzeniu

## Bezpieczeństwo
Wybieraj w kliencie szyfrowane FTPS zamiast zwykłego FTP. Twórz osobne konta dla współpracowników i usuwaj je, gdy nie są już potrzebne.`,
    { d: 'Jak utworzyć konto FTP w Verris: login, hasło, katalog domowy i dane do połączenia. Bezpieczny dostęp do plików przez FTPS.',
      faq: [
        { q: 'Zwykły FTP czy FTPS – co wybrać?', a: 'FTPS (FTP przez TLS). Szyfruje połączenie, podczas gdy zwykły FTP przesyła login i hasło jawnie. W FileZilli wybierz „Wymagaj FTP przez TLS”.' },
        { q: 'Czy mogę ograniczyć konto FTP do jednego folderu?', a: 'Tak. Przy tworzeniu konta ustaw katalog domowy na wybrany folder – użytkownik nie wyjdzie poza niego. To wygodne dla współpracowników.' },
      ], related: ['jak-wgrac-strone', 'uprawnienia-plikow-chmod'] }),

  A('hosting-pliki', 'wersja-php', 'Jak zmienić wersję PHP',
    'Wybierz wersję PHP dopasowaną do aplikacji – osobno dla każdej domeny.',
    `## Po co zmieniać wersję PHP
Różne aplikacje wymagają różnych wersji PHP. Nowsze wersje są szybsze i bezpieczniejsze, ale starsze skrypty mogą wymagać konkretnej wersji.

## Zmiana w panelu
W hubie usługi wybierz **Wersja PHP** i ustaw żądaną wersję dla domeny. Zmiana działa od razu.

## Limity
Podstawowe parametry (limit pamięci, czas wykonania, rozmiar uploadu) dostosujesz w pliku \`.user.ini\` w granicach planu:

\`\`\`ini
memory_limit = 256M
upload_max_filesize = 64M
post_max_size = 64M
max_execution_time = 120
\`\`\`

## Zalecenie
Dla WordPress i nowych projektów wybierz najnowszą stabilną wersję obsługiwaną przez aplikację.`,
    { d: 'Jak zmienić wersję PHP na hostingu Verris: wybór wersji dla domeny i limity w pliku .user.ini.',
      faq: [
        { q: 'Którą wersję PHP wybrać dla WordPress?', a: 'Najnowszą stabilną wersję obsługiwaną przez Twoje wtyczki i motyw (zwykle PHP 8.2 lub 8.3). Nowsze wersje są szybsze i bezpieczniejsze.' },
        { q: 'Zmiana wersji PHP zepsuła stronę – co zrobić?', a: 'Wróć do poprzedniej wersji w panelu (zmiana jest natychmiastowa) i zaktualizuj wtyczki/motyw do wersji zgodnej z nowszym PHP, zanim spróbujesz ponownie.' },
      ], related: ['optymalizacja-wordpress', 'limity-php-user-ini'] }),

  A('hosting-pliki', 'zadania-cron', 'Zadania cron (harmonogram)',
    'Uruchamiaj skrypty cyklicznie – kopie, importy, powiadomienia.',
    `## Czym jest cron
Cron to harmonogram uruchamiający polecenia w zadanym czasie – np. skrypt WordPress co godzinę albo backup w nocy.

## Dodanie zadania
W sekcji **Cron** wybierz gotowy preset (co godzinę, codziennie, co tydzień) lub ustaw własny harmonogram, a następnie wpisz polecenie do wykonania.

## Format harmonogramu
Cron używa pięciu pól: minuta, godzina, dzień miesiąca, miesiąc, dzień tygodnia.

\`\`\`cron
# min godz dzień mies dzień_tyg  polecenie
0 3 * * *   /usr/local/bin/php84 -q $HOME/domains/twojadomena.pl/public_html/backup.php
*/15 * * * * /usr/local/bin/php84 -q $HOME/domains/twojadomena.pl/public_html/wp-cron.php
\`\`\`

## Wersja PHP w poleceniu
\`/usr/local/bin/php84\` uruchamia skrypt w PHP 8.4, \`/usr/local/bin/php83\` w PHP 8.3 itd. – dostępne są wszystkie wersje z listy w panelu. Polecenie dla wybranej wersji, domeny i pliku wstawi pomocnik **Skrypt PHP w wybranej wersji** w zakładce Cron.

## Typowe przykłady
- Wywołanie **wp-cron** WordPress
- Import/eksport danych
- Czyszczenie plików tymczasowych

## Wskazówka
Nie ustawiaj zbyt częstych zadań (np. co minutę), jeśli nie są konieczne – obciążają serwer.`,
    { d: 'Zadania cron na hostingu Verris: presety harmonogramu, własne wyrażenia i typowe przykłady (wp-cron, backup, import).',
      faq: [
        { q: 'Co oznaczają gwiazdki w harmonogramie cron?', a: 'Pięć pól to kolejno: minuta, godzina, dzień miesiąca, miesiąc, dzień tygodnia. Gwiazdka oznacza „każdy". Np. „0 3 * * *" to codziennie o 3:00.' },
        { q: 'Jak podpiąć wp-cron zamiast domyślnego mechanizmu WordPress?', a: 'Wyłącz wewnętrzny wp-cron w wp-config.php (define WP_CRON tak jak w artykule o WordPress) i dodaj zadanie cron wywołujące wp-cron.php co 15 minut.' },
      ], related: ['wersja-php', 'optymalizacja-wordpress'] }),

  A('hosting-pliki', 'uprawnienia-plikow-chmod', 'Uprawnienia plików (chmod) – 644, 755 i błąd 403',
    'Poprawne uprawnienia plików i katalogów oraz jak naprawić błąd 403/500.',
    `## Jak działa chmod
Uprawnienia określają, kto może czytać, zapisywać i wykonywać plik. Zapis liczbowy to suma: odczyt (4), zapis (2), wykonanie (1) – osobno dla właściciela, grupy i innych.

## Zalecane wartości
- **Pliki:** 644 (właściciel zapis+odczyt, reszta odczyt)
- **Katalogi:** 755 (wejście do katalogu wymaga bitu wykonania)
- **Pliki z hasłami** (np. wp-config.php): 600 lub 640

## Jak zmienić
W menedżerze plików zaznacz plik lub katalog i wybierz **Uprawnienia**, albo użyj opcji uprawnień w kliencie FTP (np. FileZilla: prawy przycisk → Uprawnienia pliku, z możliwością zastosowania do podkatalogów).

## Błąd 403 / 500
Zbyt luźne uprawnienia (np. 777) lub zapisywalny plik konfiguracyjny bywają blokowane przez serwer. Ustaw 644/755 i sprawdź, czy właścicielem plików jest Twój użytkownik. **Nigdy nie ustawiaj 777.**`,
    { t: 'Uprawnienia plików chmod na hostingu – 644, 755 i błąd 403', d: 'Jak ustawić poprawne uprawnienia plików i katalogów (chmod 644/755), zabezpieczyć wp-config.php i naprawić błąd 403/500.',
      faq: [
        { q: 'Dlaczego nie powinienem ustawiać 777?', a: 'Uprawnienia 777 pozwalają każdemu zapisywać do pliku, co jest poważną luką bezpieczeństwa. Wiele serwerów blokuje takie pliki błędem 403. Używaj 644 dla plików i 755 dla katalogów.' },
        { q: 'Jakie uprawnienia dla wp-config.php?', a: 'Zalecane 600 lub 640 – plik zawiera dane dostępu do bazy, więc nie powinien być czytelny dla innych użytkowników serwera.' },
      ], related: ['jak-wgrac-strone', 'bezpieczenstwo-wordpress'] }),

  A('hosting-pliki', 'limity-php-user-ini', 'Limity PHP – upload, pamięć i czas wykonania (.user.ini)',
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
    { t: 'Limity PHP – upload, pamięć i czas wykonania (.user.ini)', d: 'Jak zwiększyć upload_max_filesize, memory_limit i max_execution_time na hostingu przez plik .user.ini oraz w wp-config.php.',
      faq: [
        { q: 'Zmiana w .user.ini nie działa – dlaczego?', a: 'Plik .user.ini jest buforowany. Odczekaj kilka minut albo sprawdź w phpinfo, czy wartość się zaktualizowała. Upewnij się też, że plik jest w katalogu public_html.' },
        { q: 'Jak sprawdzić aktualne limity PHP?', a: 'Utwórz plik z zawartością <?php phpinfo(); ?>, otwórz go w przeglądarce i od razu usuń – pokazuje on konfigurację serwera każdemu, kto zna adres.' },
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
Bazę obsłużysz przez wbudowane narzędzie (np. phpMyAdmin) – import, eksport, zapytania SQL.

## Bezpieczeństwo
Nadawaj użytkownikowi dostęp tylko do jego bazy i używaj silnych haseł. Regularnie rób kopie zapasowe baz.`,
    { t: 'Jak utworzyć bazę danych MySQL na hostingu', d: 'Tworzenie bazy MySQL i użytkownika w Verris, dane do połączenia dla WordPress i innych aplikacji oraz zarządzanie przez phpMyAdmin.',
      faq: [
        { q: 'Jaki host bazy danych wpisać w konfiguracji?', a: 'Zwykle „localhost", bo baza działa na tym samym serwerze co strona. Do połączeń z zewnątrz użyj zdalnego dostępu MySQL i adresu serwera.' },
        { q: 'Jak wykonać kopię bazy danych?', a: 'Najprościej wyeksportować ją przez phpMyAdmin (zakładka Eksport) do pliku .sql. Bazy obejmuje też kopia zapasowa jednym kliknięciem.' },
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
        { q: 'Dlaczego zdalne połączenie z bazą jest odrzucane?', a: 'Najczęściej brakuje dozwolonego hosta. Dodaj swój publiczny adres IP na liście dostępu w sekcji baz danych – bez tego serwer blokuje logowanie z zewnątrz.' },
        { q: 'Czy mogę otworzyć bazę na wszystkie adresy IP?', a: 'Technicznie tak (host „%"), ale odradzamy – to duże ryzyko. Ogranicz dostęp do konkretnych, znanych adresów IP.' },
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
        { q: 'Ile skrzynek mogę założyć?', a: 'Zależy od planu – limit i pojemność skrzynek znajdziesz w opisie usługi. W większości planów tworzysz wiele skrzynek w ramach dostępnej przestrzeni.' },
        { q: 'Jak dostać się do poczty bez konfigurowania programu?', a: 'Skorzystaj z webmaila – zaloguj się w przeglądarce pełnym adresem e-mail i hasłem skrzynki. To najszybszy sposób sprawdzenia poczty.' },
      ], related: ['konfiguracja-poczty-imap-smtp', 'spf-dkim-dmarc', 'filtr-antyspam'] }),

  A('poczta', 'konfiguracja-poczty-imap-smtp', 'Konfiguracja poczty (IMAP/SMTP) w programie',
    'Ustawienia serwerów poczty przychodzącej i wychodzącej.',
    `## Poczta przychodząca (IMAP)
- **Serwer:** mail.twojadomena.pl
- **Port:** 993 (SSL/TLS)
- **Login:** pełny adres e-mail

## Poczta wychodząca (SMTP)
- **Serwer:** mail.twojadomena.pl
- **Port:** 465 (SSL); gdy sieć blokuje 465 – 587 (STARTTLS)
- **Uwierzytelnianie:** włączone, login = adres e-mail

## IMAP czy POP3
Zalecamy **IMAP** – poczta synchronizuje się między urządzeniami. POP3 pobiera wiadomości na jedno urządzenie.

## Problemy z połączeniem
Sprawdź, czy używasz szyfrowania (SSL/TLS) i poprawnego portu oraz czy hasło jest aktualne.`,
    { d: 'Konfiguracja poczty w programie pocztowym: ustawienia IMAP i SMTP dla Verris (serwery, porty, szyfrowanie).',
      faq: [
        { q: 'IMAP czy POP3 – co wybrać?', a: 'IMAP. Synchronizuje pocztę między wszystkimi urządzeniami (telefon, komputer, webmail). POP3 pobiera wiadomości tylko na jedno urządzenie i zwykle je usuwa z serwera.' },
        { q: 'Który port SMTP wybrać – 465 czy 587?', a: 'Zalecamy 465 – szyfrowanie od pierwszego bajtu (SSL). 587 ze STARTTLS też działa; użyj go, gdy sieć blokuje 465. Zawsze włącz uwierzytelnianie.' },
      ], related: ['zakladanie-skrzynki', 'spf-dkim-dmarc'] }),

  A('poczta', 'spf-dkim-dmarc', 'SPF, DKIM i DMARC – dostarczalność poczty',
    'Trzy rekordy, które chronią Twoją pocztę przed folderem spam.',
    `## Dlaczego to ważne
SPF, DKIM i DMARC potwierdzają, że wiadomości z Twojej domeny są autentyczne. Bez nich poczta częściej trafia do spamu lub jest odrzucana.

## SPF
Rekord TXT wskazujący serwery uprawnione do wysyłki w imieniu domeny:

\`\`\`text
Typ: TXT   Nazwa: @   Wartość: v=spf1 a mx ~all
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
    { t: 'SPF, DKIM, DMARC – jak poprawić dostarczalność poczty', d: 'Wyjaśnienie SPF, DKIM i DMARC oraz jak je ustawić, aby poczta z Twojej domeny nie trafiała do spamu.',
      faq: [
        { q: 'Poczta trafia do spamu – od czego zacząć?', a: 'Ustaw poprawny SPF, włącz DKIM w panelu poczty i dodaj rekord DMARC (na start z polityką p=none). To trzy najważniejsze kroki poprawy dostarczalności.' },
        { q: 'Od jakiej polityki DMARC zacząć?', a: 'Od p=none – tylko monitoruje i raportuje, nie odrzuca poczty. Po kilku tygodniach obserwacji raportów możesz zaostrzyć do quarantine, a potem reject.' },
      ], related: ['konfiguracja-poczty-imap-smtp', 'rekordy-dns-wyjasnione', 'filtr-antyspam'] }),

  A('poczta', 'forwardery-autorespondery', 'Forwardery i autorespondery',
    'Przekierowania wiadomości i automatyczne odpowiedzi.',
    `## Forwarder (przekierowanie)
Forwarder przesyła pocztę z jednego adresu na inny – np. z biuro@twojadomena.pl na Twoją skrzynkę główną. Możesz kierować do wielu odbiorców.

## Autoresponder
Automatyczna odpowiedź (np. na urlopie) wysyłana do nadawców w zadanym okresie. Ustaw temat, treść i daty obowiązywania.

## Catch-all
Opcjonalnie możesz włączyć catch-all – przechwytywanie poczty na nieistniejące adresy w domenie. Uważaj, bo zwiększa ilość spamu.`,
    { d: 'Forwardery (przekierowania) i autorespondery w poczcie Verris oraz opcja catch-all. Jak je skonfigurować.',
      faq: [
        { q: 'Jak zachować kopię przekierowanej wiadomości?', a: 'Dodaj jako odbiorcę forwardera także własną skrzynkę – wiadomość trafi wtedy i do niej, i pod adres docelowy.' },
        { q: 'Czy warto włączać catch-all?', a: 'Tylko jeśli naprawdę potrzebujesz łapać pocztę na dowolny adres w domenie. Catch-all zauważalnie zwiększa ilość spamu – zwykle lepiej utworzyć konkretne aliasy.' },
      ], related: ['zakladanie-skrzynki', 'filtr-antyspam'] }),

  A('poczta', 'filtr-antyspam', 'Filtr antyspamowy',
    'Ogranicz spam bez utraty ważnych wiadomości.',
    `## Jak działa
Filtr ocenia każdą wiadomość punktami i oznacza te, które przekroczą próg, dopisując znacznik do tematu. Program pocztowy lub webmail może takie wiadomości przenosić do folderu spam.

## Ustawienia
W panelu włącz filtr i ustaw próg. Zbyt niski próg oznacza także poprawne maile – zaczynaj od ustawień domyślnych.

## Uzupełnienie
Antyspam działa najlepiej razem z poprawnymi SPF/DKIM/DMARC.`,
    { d: 'Filtr antyspamowy w Verris: włączanie, próg i oznaczanie wiadomości. Mniej spamu bez utraty ważnych wiadomości.',
      faq: [
        { q: 'Ważne maile są oznaczane jako spam – co zrobić?', a: 'Podnieś próg filtra. Sprawdź też, czy nadawca ma poprawny SPF/DKIM – braki po jego stronie zwiększają punktację spamu.' },
        { q: 'Czy filtr usuwa spam automatycznie?', a: 'Nie. Filtr oznacza podejrzane wiadomości, ale ich nie kasuje, więc błędnie zakwalifikowana poczta nie przepada.' },
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
    { t: 'Darmowy certyfikat SSL (Let’s Encrypt) – jak włączyć HTTPS', d: 'Jak włączyć darmowy certyfikat SSL Let’s Encrypt w Verris i uruchomić HTTPS na stronie. Automatyczne odnawianie.',
      faq: [
        { q: 'Czy certyfikat SSL jest płatny?', a: 'Nie. Dla domen podpiętych do hostingu wystawiamy darmowy certyfikat Let’s Encrypt, który odnawia się automatycznie – także wildcard. Możesz też wgrać własny, kupiony certyfikat.' },
        { q: 'Certyfikat się nie wystawia – dlaczego?', a: 'Najczęściej domena nie wskazuje jeszcze na serwer. Sprawdź rekord A / serwery nazw i poczekaj na propagację, a następnie wygeneruj certyfikat ponownie.' },
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
        { q: 'Widzę ostrzeżenie „mixed content" – co to znaczy?', a: 'Strona ładuje się przez HTTPS, ale niektóre zasoby (obrazy, skrypty) przez HTTP. W WordPress ustaw adres witryny na https:// i podmień linki do zasobów na https.' },
        { q: 'Przekierowanie na HTTPS powoduje pętlę – jak naprawić?', a: 'Zwykle wynika z podwójnego przekierowania (np. serwer + wtyczka). Zostaw tylko jedną regułę: w .htaccess albo w panelu, nie w obu miejscach naraz.' },
      ], related: ['certyfikat-ssl', 'bezpieczenstwo-wordpress'] }),

  A('ssl', 'wildcard-ssl', 'Certyfikat wildcard (*.domena)',
    'Jeden certyfikat dla wszystkich subdomen.',
    `## Kiedy warto
Certyfikat **wildcard** zabezpiecza domenę i wszystkie jej subdomeny (np. blog., sklep., panel.) jednym certyfikatem – wygodne, gdy masz ich wiele.

## Wystawienie (DNS-01)
Wildcard wymaga walidacji metodą **DNS-01** – dodania rekordu TXT. W panelu przeprowadzimy Cię przez proces; przy domenach z DNS u nas dzieje się to automatycznie.

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
Regularnie aktualizuj rdzeń, motywy i wtyczki – to podstawa bezpieczeństwa.

## Wydajność
Włącz cache (np. wtyczka + Redis, jeśli dostępny) i optymalizuj obrazy.`,
    { t: 'Instalacja WordPress jednym kliknięciem – hosting Verris', d: 'Jak zainstalować WordPress w Verris instalatorem 1-klik: automatyczna baza, dane administratora, SSL i pierwsze kroki.',
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
Ustaw najnowszą stabilną wersję PHP – potrafi znacząco przyspieszyć witrynę.

## Baza danych
Okresowo czyść bazę (rewizje, spam, transient) i utrzymuj porządek we wtyczkach – każda dodatkowa spowalnia stronę.`,
    { d: 'Optymalizacja WordPress w Verris: cache, Redis, wp-cron przez systemowy cron, kompresja obrazów, wersja PHP i porządek w bazie.',
      faq: [
        { q: 'Dlaczego warto wyłączyć domyślny wp-cron?', a: 'Domyślnie wp-cron uruchamia się przy każdej wizycie, co obciąża serwer przy dużym ruchu. Podpięcie go pod systemowy cron (co 15 min) jest wydajniejsze i bardziej niezawodne.' },
        { q: 'Która wtyczka cache jest najlepsza?', a: 'Dobrze sprawdzają się popularne wtyczki cache stron. Najważniejsze to włączyć cache strony i przeglądarki oraz – jeśli dostępny – object cache na Redis.' },
      ], related: ['wersja-php', 'zadania-cron', 'core-web-vitals'] }),

  A('wordpress', 'bezpieczenstwo-wordpress', 'Bezpieczeństwo WordPress',
    'Zabezpiecz witrynę przed atakami i przejęciem.',
    `## Podstawy
- Aktualizuj rdzeń, motywy i wtyczki.
- Używaj silnych haseł i 2FA do panelu.
- Instaluj wtyczki tylko z zaufanych źródeł.

## Ochrona logowania i plików
Ogranicz próby logowania i rozważ zmianę domyślnego adresu /wp-admin. Dostęp do wp-config.php zablokujesz w pliku \`.htaccess\` w katalogu strony (public_html):

\`\`\`apache
# Zablokuj dostęp do wp-config.php
<Files wp-config.php>
  Require all denied
</Files>
\`\`\`

Wykonywanie PHP w katalogu uploads wyłączysz osobnym plikiem \`.htaccess\` w \`wp-content/uploads\` (dyrektywa \`<Directory>\` nie działa w \`.htaccess\` i kończy się błędem 500):

\`\`\`apache
# wp-content/uploads/.htaccess
<FilesMatch "\\.php$">
  Require all denied
</FilesMatch>
\`\`\`

WAF na hostingu dodatkowo blokuje typowe ataki.

## Kopie zapasowe
Włącz automatyczne kopie zapasowe – w razie problemu przywrócisz stronę w kilka minut.

## Po włamaniu
Jeśli podejrzewasz włamanie, zmień hasła, przywróć czystą kopię i zaktualizuj wszystkie komponenty.`,
    { d: 'Bezpieczeństwo WordPress: aktualizacje, silne hasła, 2FA, blokada wp-config.php i PHP w uploads, WAF i kopie zapasowe.',
      faq: [
        { q: 'Jak zabezpieczyć plik wp-config.php?', a: 'Ustaw uprawnienia 600 i zablokuj dostęp z sieci regułą w .htaccess (Require all denied). Plik zawiera dane bazy, więc nie powinien być publicznie dostępny.' },
        { q: 'Podejrzewam, że stronę zhakowano – co zrobić najpierw?', a: 'Zmień wszystkie hasła (WordPress, baza, FTP), przywróć czystą kopię zapasową sprzed infekcji i zaktualizuj rdzeń oraz wszystkie wtyczki i motywy.' },
      ], related: ['dwuskladnikowe-logowanie-passkey', 'backup-1-klik', 'uprawnienia-plikow-chmod'] }),

  // ---------------- Bezpieczeństwo konta
  A('bezpieczenstwo', 'dwuskladnikowe-logowanie-passkey', 'Dwuskładnikowe logowanie i passkey',
    'Zabezpiecz konto Verris drugim składnikiem lub kluczem passkey.',
    `## Dlaczego 2FA
Drugi składnik chroni konto nawet, gdy ktoś pozna Twoje hasło. To jedno z najważniejszych zabezpieczeń.

## Passkey (zalecane)
Passkey to logowanie kluczem (odcisk palca, Face ID, klucz sprzętowy) – wygodne i odporne na phishing. Dodasz je w ustawieniach bezpieczeństwa.

## 2FA (TOTP)
Alternatywnie użyj aplikacji uwierzytelniającej (kody TOTP). Zapisz kody odzyskiwania w bezpiecznym miejscu.

## Zarządzanie
W ustawieniach zobaczysz aktywne passkeys i sesje. Możesz je odwoływać i wylogować urządzenia.`,
    { t: 'Dwuskładnikowe logowanie (2FA) i passkey w Verris', d: 'Jak zabezpieczyć konto Verris: passkey (Face ID, klucz sprzętowy) oraz 2FA TOTP z kodami odzyskiwania.',
      faq: [
        { q: 'Passkey czy kod TOTP – co wybrać?', a: 'Passkey – jest wygodniejszy (odcisk palca, Face ID) i odporny na phishing. Kody TOTP to dobra alternatywa, jeśli Twoje urządzenie nie obsługuje passkeys.' },
        { q: 'Straciłem dostęp do drugiego składnika – jak się zalogować?', a: 'Użyj zapisanych kodów odzyskiwania. Jeśli ich nie masz, skontaktuj się ze wsparciem – zweryfikujemy tożsamość, zanim przywrócimy dostęp.' },
      ], related: ['silne-haslo'] }),

  A('bezpieczenstwo', 'silne-haslo', 'Jak ustawić silne hasło',
    'Zasady tworzenia haseł, które trudno złamać.',
    `## Cechy dobrego hasła
- Co najmniej 12 znaków.
- Wielkie i małe litery, cyfry, znaki specjalne.
- Unikalne dla każdego serwisu.

## Menedżer haseł
Używaj menedżera haseł – wygeneruje i zapamięta silne, unikalne hasła. Nie zapisuj haseł w plikach tekstowych.

## Czego unikać
Nie używaj dat, imion, słów ze słownika ani powtarzalnych sekwencji. Nie wysyłaj haseł w wiadomościach.

## Dodatkowo
Włącz 2FA lub passkey – hasło to tylko pierwsza warstwa ochrony.`,
    { d: 'Jak ustawić silne hasło: długość, złożoność, unikalność i menedżer haseł. Zasady bezpieczeństwa konta.',
      faq: [
        { q: 'Jak długie powinno być hasło?', a: 'Minimum 12 znaków, im dłuższe tym lepiej. Długość ma większe znaczenie niż skomplikowane znaki – dobra jest długa, losowa fraza z menedżera haseł.' },
        { q: 'Czy muszę zmieniać hasło co jakiś czas?', a: 'Regularna wymuszona zmiana nie jest już zalecana, jeśli hasło jest silne i unikalne. Zmień je natychmiast tylko wtedy, gdy podejrzewasz wyciek.' },
      ], related: ['dwuskladnikowe-logowanie-passkey'] }),

  // ---------------- Kopie zapasowe
  A('kopie-zapasowe', 'backup-1-klik', 'Kopia zapasowa jednym kliknięciem',
    'Wykonaj backup strony i bazy w każdej chwili.',
    `## Backup na żądanie
W hubie usługi wybierz **Kopia zapasowa** i wykonaj backup plików oraz bazy danych jednym kliknięciem. Kopie przechowujemy również poza serwerem (offsite) dla bezpieczeństwa.

## Harmonogram
Włącz automatyczne kopie (np. codziennie) i ustaw retencję – ile kopii przechowywać. Starsze będą automatycznie usuwane.

## Zanim wprowadzisz zmiany
Przed aktualizacją WordPress lub większą zmianą zrób kopię – łatwo cofniesz ewentualny błąd.`,
    { t: 'Kopia zapasowa jednym kliknięciem – backup strony i bazy', d: 'Jak wykonać kopię zapasową w Verris: backup plików i bazy 1-klik, kopie offsite, harmonogram i retencja.',
      faq: [
        { q: 'Gdzie przechowywane są kopie zapasowe?', a: 'Kopie trzymamy również poza serwerem (offsite), więc pozostają dostępne nawet w razie awarii serwera, na którym działa Twoja strona.' },
        { q: 'Jak często robić kopie?', a: 'Włącz automatyczny backup codzienny, a dodatkowo rób kopię ręczną przed każdą większą zmianą lub aktualizacją. Ustaw retencję zależnie od tego, jak daleko wstecz chcesz sięgać.' },
      ], related: ['przywracanie-backupu', 'bezpieczenstwo-wordpress'] }),

  A('kopie-zapasowe', 'przywracanie-backupu', 'Jak przywrócić kopię zapasową',
    'Odtwórz stronę lub bazę z wcześniejszej kopii.',
    `## Wybór kopii
W sekcji kopii zapasowych zobaczysz listę backupów z datami. Wybierz odpowiednią kopię do przywrócenia.

## Przywracanie
Możesz przywrócić pliki, bazę lub całość. Operacja nadpisze bieżącą zawartość – w razie wątpliwości najpierw wykonaj świeżą kopię.

## Po przywróceniu
Sprawdź działanie strony i poczty. Jeśli przywracasz po awarii/włamaniu, dodatkowo zmień hasła i zaktualizuj komponenty.`,
    { d: 'Jak przywrócić kopię zapasową w Verris: wybór backupu, przywracanie plików/bazy i weryfikacja po odtworzeniu.',
      faq: [
        { q: 'Czy przywrócenie kopii nadpisze obecną stronę?', a: 'Tak. Przywracanie zastępuje bieżące pliki/bazę zawartością z kopii. Jeśli nie masz pewności, najpierw wykonaj świeży backup stanu obecnego.' },
        { q: 'Czy mogę przywrócić tylko bazę bez plików?', a: 'Tak. Możesz wybrać przywrócenie samych plików, samej bazy lub całości – zależnie od tego, co wymaga odtworzenia.' },
      ], related: ['backup-1-klik'] }),

  // ---------------- Rozliczenia
  A('rozliczenia', 'portfel-i-platnosci', 'Portfel i płatności',
    'Doładuj portfel i płać za usługi wygodnie.',
    `## Portfel Verris
Portfel to Twoje saldo w panelu – z niego pobierane są opłaty za usługi, odnowienia i dodatki. Doładujesz go kartą lub przelewem.

## Płatności za usługi
Usługi rozliczamy z portfela lub kartą (płatność cykliczna). Wybierzesz metodę przy zamawianiu.

## Historia i faktury
W sekcji rozliczeń znajdziesz historię operacji i faktury do pobrania.

## Niski stan salda
Gdy saldo jest niskie, wyślemy przypomnienie, aby usługi nie zostały zawieszone.`,
    { t: 'Portfel i płatności w Verris – jak działa rozliczanie', d: 'Portfel Verris: doładowania kartą/przelewem, płatności za usługi, historia operacji i przypomnienia o niskim saldzie.',
      faq: [
        { q: 'Jak doładować portfel?', a: 'W sekcji rozliczeń wybierz doładowanie i zapłać kartą lub przelewem. Środki pojawią się na saldzie i posłużą do opłacania usług oraz odnowień.' },
        { q: 'Co się stanie, gdy zabraknie środków na odnowienie?', a: 'Wyślemy przypomnienie o niskim saldzie z wyprzedzeniem. Doładuj portfel przed terminem, aby usługa nie została zawieszona.' },
      ], related: ['faktury', 'autoskalowanie-bezpiecznik-kosztow'] }),

  A('rozliczenia', 'faktury', 'Faktury i dane do faktury',
    'Uzupełnij dane firmy i pobieraj faktury z panelu.',
    `## Dane do faktury
W ustawieniach uzupełnij nazwę, NIP i adres. Będą użyte na fakturach za usługi.

## Dokument rozliczeniowy i faktura
Zaraz po płatności w sekcji rozliczeń pojawia się **dokument rozliczeniowy** potwierdzający płatność – to nie jest faktura VAT. Fakturę VAT wystawiamy w programie księgowym; gdy jest gotowa, udostępniamy ją w panelu i wysyłamy e-mailem.

## KSeF
Faktury dla firm trafiają do Krajowego Systemu e-Faktur, gdy wymagają tego przepisy.

## Zmiana danych
Dane firmowe możesz zaktualizować w każdej chwili – kolejne faktury uwzględnią zmiany.`,
    { d: 'Faktury w Verris: dane firmy (NIP, adres), dokument rozliczeniowy po płatności i faktura VAT w panelu oraz e-mailem.',
      faq: [
        { q: 'Gdzie pobiorę fakturę?', a: 'W sekcji rozliczeń. Po płatności od razu zobaczysz dokument rozliczeniowy, a fakturę VAT – gdy zostanie wystawiona; wyślemy ją też e-mailem.' },
        { q: 'Zmieniły się dane mojej firmy – czy poprawię starą fakturę?', a: 'Zaktualizuj dane w ustawieniach; zostaną użyte na kolejnych fakturach. W sprawie korekty już wystawionego dokumentu napisz do wsparcia.' },
      ], related: ['portfel-i-platnosci'] }),

  A('rozliczenia', 'autoskalowanie-bezpiecznik-kosztow', 'Autoskalowanie i bezpiecznik kosztów',
    'Wydajność rośnie w szczycie, a Ty kontrolujesz wydatki.',
    `## Czym jest autoskalowanie
Gdy strona ma większy ruch, usługa może chwilowo zwiększyć zasoby (CPU/RAM), aby działała płynnie. Po szczycie wraca do bazowego poziomu.

## Bezpiecznik kosztów
Domyślnie autoskalowanie nie ma limitu kosztu – płacisz za faktyczne użycie. Jeśli chcesz pilnować budżetu, ustaw własny limit kosztu na 30 dni (suma dopłat z ostatnich 30 dni) przy zamówieniu albo później w panelu. Po jego osiągnięciu nie dokładamy już mocy – strona działa dalej na zasobach pakietu.

## Jeden pakiet zamiast wyższych planów
Verris ma jeden pakiet hostingu – nie ma wyższego planu, na który trzeba przechodzić. Dodatkową moc daje autoskalowanie, a płacisz tylko za czas, w którym była potrzebna.

## Gdy duży ruch jest stały
Jeśli strona regularnie korzysta z dodatkowej mocy:
- włącz cache strony – zwykle najbardziej odciąża serwer,
- sprawdź, co ją obciąża: ciężkie wtyczki, częste zadania cron, wolne zapytania do bazy, ruch botów,
- napisz do nas – przejrzymy zużycie i podpowiemy, co poprawić.

## Podgląd
W panelu zobaczysz historię skalowania, bieżące zużycie i wydatki względem bezpiecznika.`,
    { d: 'Autoskalowanie w Verris i bezpiecznik kosztów: więcej mocy w szczycie ruchu, a gdy chcesz – własny limit kosztu na 30 dni.',
      faq: [
        { q: 'Czy autoskalowanie może niespodziewanie podnieść rachunek?', a: 'Bez limitu płacisz za faktyczne użycie dodatkowej mocy. Jeśli chcesz mieć górną granicę, ustaw bezpiecznik kosztów – limit na 30 dni. Po jego osiągnięciu skalowanie się zatrzymuje.' },
        { q: 'Czy mogę przejść na wyższy plan?', a: 'Verris ma jeden pakiet – nie ma wyższego planu. Gdy strona potrzebuje więcej mocy, autoskalowanie dokłada ją na czas większego ruchu, a bezpiecznik kosztów (jeśli go ustawisz) pilnuje limitu wydatków na 30 dni. Jeśli duży ruch jest stały, włącz cache, sprawdź, co obciąża stronę, albo napisz do nas – pomożemy.' },
      ], related: ['portfel-i-platnosci'] }),

  // ---------------- Migracja
  A('migracja', 'migracja-do-verris', 'Jak przenieść hosting do Verris (cPanel, Plesk i inne panele)',
    'Przenieś pliki, bazy, pocztę i domeny – automatycznie lub z pomocą pracownika.',
    `## Dwa tryby
Migrację uruchomisz na dwa sposoby:
- **Automatyczna** – podajesz dane dostępowe u obecnego dostawcy, a system przeniesie pliki, bazy i pocztę.
- **Z pomocą pracownika** – zlecasz przeniesienie naszemu zespołowi.

## Co przenosimy
Pliki strony, bazy danych, konta poczty (wraz z wiadomościami), domeny i subdomeny oraz konfigurację DNS.

## Bez przestoju
Zalecamy najpierw przenieść dane, przetestować stronę na naszym serwerze, a dopiero potem przełączyć domenę – dzięki temu unikniesz przerwy.

## Gdy coś pójdzie nie tak
Przy migracji automatycznej, jeśli wystąpi problem, wyślemy powiadomienie, a zgłoszenie trafi z wysokim priorytetem do naszego zespołu, który dokończy przeniesienie.

## Skąd wziąć dane
W panelu obecnego dostawcy (np. cPanel, Plesk albo inny panel hostingu) znajdziesz dane FTP/SFTP, dostęp do bazy i ustawienia poczty. Nasze kreatory podpowiadają, gdzie ich szukać.`,
    { t: 'Migracja hostingu do Verris z cPanel, Plesk i innych paneli', d: 'Jak przenieść hosting do Verris: migracja automatyczna lub z pomocą pracownika – pliki, bazy, poczta, domeny i subdomeny bez przestoju.',
      faq: [
        { q: 'Czy migracja spowoduje przerwę w działaniu strony?', a: 'Nie musi. Przenosimy najpierw dane i testujemy stronę na naszym serwerze, a domenę przełączasz dopiero po weryfikacji – dzięki temu unikasz przestoju.' },
        { q: 'Co, jeśli automatyczna migracja się nie powiedzie?', a: 'Dostaniesz powiadomienie e-mail, a zgłoszenie trafi z wysokim priorytetem do naszego zespołu, który ręcznie dokończy przeniesienie.' },
      ], related: ['transfer-domeny', 'jak-podpiac-domene'] }),

  // ---------------- Wydajność
  A('wydajnosc', 'przyspieszanie-strony', 'Jak przyspieszyć stronę – cache, kompresja i obrazy',
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
    { t: 'Jak przyspieszyć stronę – GZIP, cache przeglądarki i obrazy (.htaccess)', d: 'Praktyczne przyspieszenie strony na hostingu: kompresja GZIP, cache przeglądarki w .htaccess, WebP i lazy load. Gotowe fragmenty kodu.',
      faq: [
        { q: 'Co najbardziej przyspiesza stronę?', a: 'Zwykle włączenie kompresji GZIP/Brotli, cache przeglądarki dla statycznych plików oraz optymalizacja obrazów (WebP + lazy load). To najprostsze zmiany o dużym efekcie.' },
        { q: 'Czy te ustawienia .htaccess są bezpieczne?', a: 'Tak. Reguły mod_deflate i mod_expires to standardowe, powszechnie stosowane dyrektywy. Dodaj je na końcu .htaccess i sprawdź działanie strony po zapisaniu.' },
      ], related: ['core-web-vitals', 'optymalizacja-wordpress', 'wersja-php'] }),

  A('wydajnosc', 'core-web-vitals', 'Core Web Vitals – jak poprawić LCP, CLS i INP',
    'Popraw wskaźniki Google i pozycję strony w wynikach wyszukiwania.',
    `## Czym są Core Web Vitals
To trzy wskaźniki jakości wrażeń użytkownika, brane pod uwagę przez Google:
- **LCP** (largest contentful paint) – czas wyświetlenia największego elementu; cel < 2,5 s.
- **CLS** (cumulative layout shift) – stabilność układu; cel < 0,1.
- **INP** (interaction to next paint) – responsywność na interakcje; cel < 200 ms.

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
    { t: 'Core Web Vitals – jak poprawić LCP, CLS i INP', d: 'Jak poprawić Core Web Vitals (LCP, CLS, INP) i szybkość strony: preload obrazu hero, wymiary grafik, lżejszy JavaScript. Lepsze SEO.',
      faq: [
        { q: 'Czy Core Web Vitals wpływają na pozycję w Google?', a: 'Tak, są jednym z sygnałów rankingowych związanych z jakością strony. Nie zastąpią dobrej treści, ale przy porównywalnych stronach mogą przechylić szalę.' },
        { q: 'Jak zmierzyć Core Web Vitals mojej strony?', a: 'Użyj PageSpeed Insights (dane z pola i laboratorium) lub zakładki Lighthouse w narzędziach deweloperskich przeglądarki. Poprawiaj najpierw najsłabszy wskaźnik.' },
      ], related: ['przyspieszanie-strony', 'optymalizacja-wordpress'] }),

  // ---------------- API i integracje (L-07 — pełny opis publicznego API v1)
  A('api-integracje', 'publiczne-api', 'Publiczne API Verris (v1)',
    'Tokeny, uprawnienia, wszystkie endpointy, limity i webhooki – dokumentacja API v1.',
    `## Do czego służy
API pozwala odczytać usługi, portfel i faktury oraz zarządzać rekordami DNS i wdrożeniami z Gita – z własnych skryptów, CI/CD albo Terraform. Działa na koncie klienta i widzi tylko jego dane.

## Token
Token utworzysz w panelu: **API i integracje → Nowy token**. Wybierasz uprawnienia i opcjonalnie datę wygaśnięcia. Token pokazujemy tylko raz – zapisz go w menedżerze haseł. Unieważnisz go w tym samym miejscu.

Każde żądanie wysyłasz z nagłówkiem:

\`\`\`
Authorization: Bearer vrs_live_…
\`\`\`

Adres bazowy: **https://api.verris.pl/api/v1**

## Uprawnienia (zakresy)
- **services:read** – lista i szczegóły usług, dane konta
- **billing:read** – saldo portfela
- **invoices:read** – faktury
- **dns:read** – odczyt rekordów DNS
- **dns:write** – dodawanie i usuwanie rekordów DNS
- **deploy:write** – wdrożenie z repozytorium Git
- **mail:read** – odczyt skrzynek pocztowych (adresy i rozmiary)
- **mail:write** – zakładanie i usuwanie skrzynek, zmiana hasła i rozmiaru

Tokeny tworzy wyłącznie właściciel konta.

## Odczyt
- **GET /me** (services:read) – id, e-mail, imię, nazwisko, data założenia konta
- **GET /services** (services:read) – lista usług: id, serviceTag, status, interval, product, plan, domain, currentPeriodEnd, createdAt (do 200 najnowszych)
- **GET /services/:id** (services:read) – jak wyżej oraz price, currency, currentPeriodStart
- **GET /billing/wallet** (billing:read) – balance, currency
- **GET /invoices** (invoices:read) – id, number, status, amount, currency, issuedAt, createdAt (do 100 najnowszych)
- **GET /services/:id/dns?domain=** (dns:read) – rekordy domeny: id, name, type, value, ttl; bez parametru – domena główna usługi
- **GET /services/:id/deploy?domain=** (deploy:write) – stan wdrożenia z Gita dla domeny
- **GET /services/:id/mailboxes** (mail:read) – skrzynki wszystkich domen usługi: email, quotaMb (rozmiar w MB; null, gdy serwer go nie podał)

Daty są w formacie ISO 8601 (UTC), kwoty jako liczby.

## Zapis
- **POST /services/:id/dns** (dns:write) – pola: domain, name, type (A, AAAA, CNAME, MX, TXT, SRV, NS, CAA), value, opcjonalnie ttl (60–86400)
- **POST /services/:id/dns/delete** (dns:write) – pola: domain, name, type, value
- **POST /services/:id/deploy** (deploy:write) – pola: domain, opcjonalnie dir; pobiera zmiany z repozytorium Git
- **POST /services/:id/mailboxes** (mail:write) – pola: email, password (8–128 znaków), opcjonalnie quotaMb (10–102400, domyślnie 1024)
- **POST /services/:id/mailboxes/password** (mail:write) – pola: email, password
- **POST /services/:id/mailboxes/quota** (mail:write) – pola: email, quotaMb
- **POST /services/:id/mailboxes/delete** (mail:write) – pole: email; usuwa skrzynkę razem z wiadomościami

Przykład – rekord TXT do weryfikacji DNS-01:

\`\`\`
curl -X POST https://api.verris.pl/api/v1/services/ID_USLUGI/dns \\
  -H "Authorization: Bearer vrs_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"domain":"twojadomena.pl","name":"_acme-challenge","type":"TXT","value":"…"}'
\`\`\`

## Błędy i limity
- **401** – brak tokenu, token nieprawidłowy, wygasły lub unieważniony, konto zablokowane
- **403** – token nie ma wymaganego uprawnienia
- **404** – usługa nie istnieje albo nie należy do Twojego konta
- **429** – za dużo żądań (limit to 300 na minutę)

## Webhooki
W **API i integracje → Webhooki** podajesz adres HTTPS i wybierasz zdarzenia: task.completed, task.failed, invoice.issued, subscription.renewed, subscription.past_due. Każde wywołanie to POST z treścią JSON (id, event, createdAt, payload) i nagłówkami **x-verris-event** oraz **x-verris-signature** – HMAC-SHA256 treści z Twoim sekretem. Sprawdzaj podpis przed przetworzeniem. Nieudane dostarczenie ponawiamy do 5 razy z rosnącym odstępem; przycisk „Wyślij test” wysyła zdarzenie ping.

## Czego API v1 nie robi
Zamawianie i opłacanie usług, rejestracja domen i zakładanie skrzynek pocztowych są dostępne tylko w panelu.`,
    { t: 'Publiczne API Verris – tokeny, endpointy, DNS, webhooki', d: 'Dokumentacja publicznego API Verris v1: token, zakresy uprawnień, odczyt usług, portfela i faktur, rekordy DNS, wdrożenie z Gita, limity i webhooki z podpisem HMAC.',
      faq: [
        { q: 'Czy mogę ustawić rekordy DNS z Terraform albo certbota?', a: 'Tak. Utwórz token z uprawnieniem dns:write i wołaj POST /services/:id/dns oraz /dns/delete. To wystarcza m.in. do weryfikacji DNS-01 przy certyfikatach wildcard.' },
        { q: 'Jak sprawdzić, że webhook naprawdę wysłał Verris?', a: 'Policz HMAC-SHA256 z surowej treści żądania kluczem-sekretem webhooka i porównaj z nagłówkiem x-verris-signature. Jeśli się nie zgadza, odrzuć żądanie.' },
      ], related: ['dwuskladnikowe-logowanie-passkey'] }),
  // ---------------- Kreator stron (paczka 123 – Verris Kreator). Liczby i ceny: libs/kreator/src/plany.ts
  // i apps/api/src/plans/plan-kreator-pro.ts – zgodność pilnuje src/test/baza-wiedzy-kreator.spec.ts.
  // Bez przejścia na WordPressa – tego nie ma jeszcze w publikacji. Wersje językowe (Pro) – od paczki 124 (renderer
  // z hreflang i przełącznikiem języka, tłumaczenie AI: POST /kreator/strony/:id/tlumacz).
  A('kreator-stron', 'jak-stworzyc-strone-w-kreatorze', 'Jak stworzyć stronę w Verris Kreatorze',
    'Opisz firmę, a AI przygotuje gotową stronę – krok po kroku od opisu do pierwszej wersji.',
    `## Czym jest Verris Kreator
Verris Kreator to kreator stron firmowych w panelu Verris. Opisujesz firmę własnymi słowami, a AI przygotowuje stronę: układ sekcji, teksty, kolory i fonty. Potem poprawiasz ją w edytorze i publikujesz na swojej domenie. Kreator jest w cenie hostingu.

## Krok 1 – rodzaj strony
W menu wybierz **Kreator stron** i kliknij **Nowa strona**. Wybierz rodzaj: wizytówka firmy, strona sprzedażowa, sklep lub katalog, portfolio, blog albo inna. Katalog produktów i wpisy bloga są częścią Kreatora Pro – bez niego strona powstanie z ofertą i cenami zamiast katalogu albo bez sekcji wpisów.

## Krok 2 – dane firmy
Podaj nazwę firmy i branżę (np. salon fryzjerski, biuro rachunkowe). Miasto, telefon, e-mail, godziny otwarcia i adres są opcjonalne. **AI nie dopisze danych, których nie podasz** – telefonu, adresu ani godzin nie zgadujemy. Brakujące dane uzupełnisz później w edytorze.

## Krok 3 – opis i styl
Napisz, czym się zajmujesz, dla kogo, co wyróżnia firmę i jak klienci się umawiają – co najmniej 20 znaków, najwyżej 3000. Konkrety dają lepszą stronę niż ogólniki. W polu **Ceny** możesz wpisać usługi i ceny brutto – AI przepisze je na stronę, ale nigdy nie wymyśli cen. Na końcu wybierz ton (np. przyjazny, ekspercki, formalny) i styl albo zostaw **Dobierze AI**.

## Generowanie
Generowanie trwa zwykle od jednej do dwóch minut. Możesz zamknąć kartę – gotowa strona będzie na liście w **Kreatorze stron**. Jeśli generowanie się nie uda, kliknij **Spróbuj ponownie** albo opisz firmę trochę inaczej. Nieudana generacja nie zużywa limitu.

## Limity
- **W cenie hostingu:** 3 strony na koncie, do 5 podstron w każdej, 3 generacje i 200 zmian AI miesięcznie.
- **Kreator Pro:** 10 stron, podstrony bez limitu, 10 generacji i 1000 zmian AI miesięcznie, a każda generacja daje 3 propozycje projektu.
- **Okres próbny hostingu:** 1 strona, 1 generacja i 20 zmian AI – stronę zobaczysz pod linkiem podglądu.

Limity odnawiają się 1. dnia każdego miesiąca. Ręczna edycja w edytorze jest bez limitu.

## Czego AI nie robi
AI nie wymyśla opinii klientów, ocen, liczby klientów, lat doświadczenia, nagród ani certyfikatów. Ceny i dane kontaktowe biorą się tylko z Twojego opisu. Opinie klientów dodajesz sam w edytorze.`,
    { t: 'Jak stworzyć stronę w Verris Kreatorze – od opisu firmy do gotowej strony', d: 'Verris Kreator krok po kroku: rodzaj strony, dane firmy, opis i styl. AI przygotuje stronę w 1–2 minuty, bez zmyślonych cen i opinii. Limity w cenie hostingu.',
      faq: [
        { q: 'Ile kosztuje Verris Kreator?', a: 'Kreator jest w cenie hostingu: 3 strony, do 5 podstron w każdej, 3 generacje i 200 zmian AI miesięcznie. Płatny jest tylko dodatek Kreator Pro – szczegóły w artykule „Kreator Pro – co daje i jak kupić”.' },
        { q: 'Czy AI może dopisać opinie klientów albo ceny?', a: 'Nie. Ceny i dane kontaktowe biorą się tylko z Twojego opisu, a opinie klientów wpisujesz sam. Odpowiedź AI z nowymi opiniami jest odrzucana i nie trafia na stronę.' },
        { q: 'Generowanie się nie udało. Czy straciłem limit?', a: 'Nie. Nieudana generacja nie zużywa limitu. Kliknij „Spróbuj ponownie” albo opisz firmę trochę inaczej.' },
      ], related: ['edycja-tekstu-i-zdjec-w-kreatorze', 'publikacja-strony-z-kreatora', 'kreator-pro'] }),

  A('kreator-stron', 'edycja-tekstu-i-zdjec-w-kreatorze', 'Edycja tekstu i zdjęć na stronie',
    'Zmieniaj teksty bezpośrednio na podglądzie, podmieniaj zdjęcia i cofaj zmiany.',
    `## Edycja tekstu na stronie
W edytorze włącz przełącznik **Edycja na stronie**, kliknij tekst na podglądzie i pisz. Zmiana zapisuje się sama – stan zapisu widzisz na górnym pasku. Każde pole ma limit znaków: dłuższy tekst przytniemy do limitu, a pola, które nie mogą być puste, wrócą do poprzedniego tekstu. Te same pola znajdziesz w panelu **Sekcja** po prawej stronie.

## Sekcje i podstrony
Kliknij sekcję na podglądzie, żeby ją zaznaczyć. Przy zaznaczonej sekcji przesuniesz ją wyżej albo niżej, ukryjesz albo zmienisz poleceniem dla AI. Ukrytą sekcję przywrócisz na liście **Sekcje** (ikona oka). Tam dodasz też nowe sekcje i podstrony.

## Zmiany poleceniem AI
W zakładce **AI** napisz, co zmienić, np. „dopisz, że dojeżdżamy do klienta w promieniu 30 km” albo „zmień ton na bardziej formalny”. Zmiana może dotyczyć zaznaczonej sekcji albo całej strony. Każda taka zmiana zużywa jedną zmianę AI z miesięcznego limitu. Kolory, fonty, zaokrąglenia i animacje zmienisz w zakładce **Motyw**, a nazwę firmy, dane kontaktowe i opisy dla Google – w zakładce **Firma i SEO**.

## Podmiana zdjęcia
Kliknij zdjęcie na podglądzie (albo przycisk przy polu zdjęcia w panelu sekcji). W oknie **Wybierz zdjęcie** masz trzy zakładki:
- **Wgraj** – zdjęcie z komputera lub telefonu: JPEG, PNG, WebP albo AVIF, do 15 MB. Dane z aparatu (np. lokalizację) usuwamy. Zdjęć HEIC z iPhone'a i plików SVG nie obsługujemy.
- **Twoje zdjęcia** – zdjęcia, które już wgrałeś.
- **Biblioteka** – darmowe zdjęcia z bibliotek, takich jak Openverse i Pixabay. Przy każdym widzisz autora i licencję, a wybrane zdjęcie kopiujemy na Twoją stronę.

Po wyborze kliknij na zdjęciu punkt, który ma zostać w kadrze, i opisz, co widać na zdjęciu (tekst alternatywny – czytają go czytniki ekranu i wyszukiwarki). Jeśli zdjęcie jest tylko dekoracją, zaznacz to. Na koniec kliknij **Użyj zdjęcia**.

## Cofanie i historia wersji
Ostatnią zmianę cofniesz skrótem Ctrl+Z (na Macu Cmd+Z). Przycisk **Historia** pokazuje wcześniejsze wersje: każdy zapis, zmiana AI i przywrócenie to osobna wersja. Przywrócenie tworzy nową wersję, więc nic nie ginie.`,
    { t: 'Edycja strony w Verris Kreatorze – tekst na podglądzie, zdjęcia, historia wersji', d: 'Jak zmienić tekst bezpośrednio na stronie, podmienić zdjęcie (wgranie, Openverse, Pixabay), ustawić kadr i cofnąć zmiany w Verris Kreatorze.',
      faq: [
        { q: 'Czy ręczna edycja zużywa limit zmian AI?', a: 'Nie. Ręczna edycja tekstu, zdjęć, sekcji i motywu jest bez limitu. Limit dotyczy tylko zmian wykonywanych przez AI.' },
        { q: 'Dlaczego nie mogę wgrać zdjęcia z iPhone\'a?', a: 'Zdjęcia HEIC nie są obsługiwane. Zapisz zdjęcie jako JPEG – na iPhonie: Ustawienia → Aparat → Formaty → Najbardziej zgodne – i wgraj je ponownie.' },
        { q: 'Czy mogę używać zdjęć z biblioteki na stronie firmy?', a: 'Zdjęcia z bibliotek mają licencję i autora widocznego przy wyborze – sprawdź je przed użyciem. Wybrane zdjęcie kopiujemy na Twoją stronę.' },
      ], related: ['jak-stworzyc-strone-w-kreatorze', 'publikacja-strony-z-kreatora'] }),

  A('kreator-stron', 'publikacja-strony-z-kreatora', 'Publikacja na domenie, ZIP i wycofanie',
    'Opublikuj stronę z kreatora na swojej domenie, pobierz ją jako ZIP albo wycofaj publikację.',
    `## Zanim opublikujesz
Do publikacji potrzebujesz opłaconego hostingu Verris z dodaną domeną. Jeśli usługa nie ma jeszcze domeny, dodaj ją do hostingu i wróć do edytora. Domena musi wskazywać na Twój hosting, żeby strona była widoczna pod jej adresem (patrz: Jak podpiąć domenę do hostingu).

## Publikacja na domenie
W edytorze kliknij **Publikuj**, wybierz domenę i kliknij **Opublikuj na …**. Wysyłamy na hosting zwykłe pliki strony: HTML, CSS i zdjęcia w kilku rozmiarach. Formularz kontaktowy działa od razu na opublikowanej stronie. Po zmianach w edytorze opublikuj stronę ponownie – na domenie zawsze jest ostatnio opublikowana wersja.

## Gdy na domenie jest już inna strona
Jeśli w katalogu domeny są pliki innej strony, pokażemy ich listę i zapytamy, czy je zastąpić. Po zaznaczeniu **Zastąp – obecne pliki trafią do kopii** dotychczasowe pliki przenosimy do kopii, a na ich miejsce trafia strona z kreatora.

## Bez Kreatora Pro
Jeśli strona ma elementy Pro (np. karuzele, katalog produktów, blog), okno publikacji pokaże listę zmian: elementy Pro zostaną zastąpione wersją podstawową albo pominięte. Strona w edytorze się nie zmienia.

## Pobranie ZIP
Przycisk **Pobierz ZIP** w oknie publikacji pobiera całą stronę jako archiwum ze zwykłymi plikami. ZIP jest dostępny po opłaceniu hostingu.

## Wycofanie publikacji
Kliknij **Wycofaj publikację** w oknie publikacji. Jeśli przed pierwszą publikacją na domenie były inne pliki, przywrócimy je z kopii. Jeśli katalog był pusty, usuniemy pliki strony z kreatora. Stronę w edytorze możesz opublikować ponownie w każdej chwili.

## Okres próbny – link podglądu
W okresie próbnym hostingu publikujesz stronę jako podgląd: dostajesz link ważny 7 dni, niewidoczny dla wyszukiwarek. Po wygaśnięciu odnowisz go przyciskiem **Odnów link podglądu**. Własna domena i ZIP włączą się po opłaceniu hostingu.`,
    { t: 'Publikacja strony z Verris Kreatora – domena, ZIP i wycofanie', d: 'Jak opublikować stronę z Verris Kreatora na swojej domenie, co się dzieje z dotychczasowymi plikami, jak pobrać ZIP i wycofać publikację.',
      faq: [
        { q: 'Czy publikacja usunie moją obecną stronę?', a: 'Nie bez Twojej zgody. Pokażemy pliki w katalogu domeny i zapytamy, czy je zastąpić – po zgodzie trafią do kopii, a wycofanie publikacji je przywróci.' },
        { q: 'Zmieniłem tekst w edytorze, a na stronie go nie ma. Dlaczego?', a: 'Na domenie jest wersja z ostatniej publikacji. Po zmianach kliknij „Publikuj” i opublikuj stronę ponownie.' },
        { q: 'Jak długo działa link podglądu w okresie próbnym?', a: '7 dni. Link nie jest indeksowany przez wyszukiwarki, a po wygaśnięciu odnowisz go w oknie publikacji.' },
      ], related: ['jak-podpiac-domene', 'edycja-tekstu-i-zdjec-w-kreatorze', 'kreator-pro'] }),

  A('kreator-stron', 'kreator-pro', 'Kreator Pro – co daje i jak kupić',
    'Dodatek do Verris Kreatora: wyższe limity, 3 propozycje projektu, katalog produktów, blog, pełne SEO i wersje językowe.',
    `## Co daje Kreator Pro
Kreator Pro to dodatek do Verris Kreatora, który działa na wszystkich stronach Twojego konta:
- **3 propozycje projektu** z każdej generacji zamiast jednej.
- **Pełny projekt AI** – bogatsze układy i więcej sekcji dopasowanych do branży.
- **Interakcje i animacje** – karuzele, powiększanie zdjęć, paralaksa, przełącznik cen, animowany nagłówek.
- **Katalog produktów** z cenami i przyciskiem zakupu oraz **blog** z wpisami.
- **Pełne SEO** – dane strukturalne produktów, artykułów i nawigacji okruszkowej, przegląd SEO przez AI.
- **Wersje językowe** – do 3 dodatkowych języków: angielski, niemiecki, ukraiński. AI tłumaczy podstrony (każda podstrona to jedna zmiana AI), a strona dostaje przełącznik języka i oznaczenia dla wyszukiwarek, że to te same treści w innych językach.
- **Wyższe limity** – 10 stron, podstrony bez limitu, 10 generacji i 1000 zmian AI miesięcznie.
- **Dyskretny znak** „Stworzone w Verris Kreator” w stopce.

Bez Kreatora Pro funkcje Pro widzisz w edytorze jako podgląd z oznaczeniem – przy publikacji zastępujemy je wersją podstawową.

## Wersje językowe
W edytorze nad listą podstron kliknij **Dodaj wersję językową**, wybierz język i **Przetłumacz przez AI** albo **Skopiuj bez tłumaczenia** (tekst przetłumaczysz sam). Tłumaczenie zachowuje nazwę firmy, ceny i dane kontaktowe, a tytuły i opisy dla wyszukiwarek pisze w języku docelowym. Gdy zmienisz polską podstronę, edytor oznaczy jej tłumaczenie jako możliwie nieaktualne – możesz przetłumaczyć ją ponownie jednym kliknięciem. Wersja angielska ma adresy z /en/ (np. twojadomena.pl/en/).

## Ile kosztuje
- **Miesięcznie:** 9,90 zł brutto (8,05 zł netto).
- **Za rok:** 99 zł brutto (80,49 zł netto).

## Jak kupić
Kreator Pro kupisz po opłaceniu hostingu Verris – w okresie próbnym korzystasz z kreatora w wersji próbnej. W menu wybierz **Kreator stron**, na karcie **Kreator Pro** wybierz okres (miesiąc albo rok) i kliknij **Kup Kreator Pro**. Płacisz tak jak za inne usługi: z portfela, BLIK-iem, przelewem albo kartą. Fakturę dostajesz jak przy innych usługach. Na koncie może być jeden abonament Kreator Pro.

## Odnowienie i rezygnacja
Abonament odnawia się automatycznie z portfela albo kartą. Odnowienie anulujesz na karcie Kreatora Pro w każdej chwili – Pro działa wtedy do końca opłaconego okresu. Zmiana okresu (miesiąc ↔ rok): anuluj odnowienie, a po końcu okresu kup abonament z nowym okresem.

## Co po zakończeniu Pro
Opublikowane strony działają dalej. Elementy Pro znikną przy następnej publikacji – okno publikacji pokaże wcześniej, co się zmieni.`,
    { t: 'Kreator Pro – co daje, ile kosztuje i jak go kupić', d: 'Kreator Pro w Verris: 3 propozycje projektu, katalog produktów, blog, pełne SEO, wersje językowe i wyższe limity. 9,90 zł/mies. albo 99 zł/rok brutto (8,05 albo 80,49 zł netto).',
      faq: [
        { q: 'W jakich językach może być moja strona?', a: 'Z Kreatorem Pro dodasz do 3 wersji językowych: angielską, niemiecką i ukraińską. AI tłumaczy podstrony, a każda przetłumaczona podstrona to jedna zmiana AI z miesięcznego limitu.' },
        { q: 'Ile kosztuje Kreator Pro?', a: '9,90 zł brutto miesięcznie (8,05 zł netto) albo 99 zł brutto za rok (80,49 zł netto).' },
        { q: 'Czy mogę kupić Kreator Pro w okresie próbnym?', a: 'Nie. Kreator Pro kupisz po opłaceniu hostingu – w okresie próbnym korzystasz z kreatora w wersji próbnej.' },
        { q: 'Co się stanie z moją stroną, gdy zrezygnuję z Pro?', a: 'Opublikowana strona działa dalej. Elementy Pro znikną dopiero przy następnej publikacji, a okno publikacji pokaże wcześniej listę zmian.' },
      ], related: ['jak-stworzyc-strone-w-kreatorze', 'publikacja-strony-z-kreatora', 'portfel-i-platnosci'] }),
  // ---------------- Kreator marki (paczka 130) – SZKICE (DRAFT). Moduł jest domyślnie wyłączony do publikacji §13b
  // Regulaminu i zmian Polityki (docs/legal/drafts/DO_ZATWIERDZENIA_kreator-marki.md). Redaktor publikuje je w CMS
  // razem ze startem modułu. Liczby i ceny = DOMYSLNA_KONFIGURACJA_MARKI (apps/api/src/kreator-marki/konfiguracja-marki.ts)
  // – zgodność pilnuje src/test/baza-wiedzy-kreator-marki.spec.ts; przy zmianie cen w adminie popraw artykuły.
  // Przed publikacją sprawdzić z dokumentacją: ścieżki menu w programach pocztowych, interfejs TMview, nazwy pozycji
  // menu panelu (faza 2).
  D('kreator-stron', 'jak-stworzyc-logo-w-kreatorze-marki', 'Jak stworzyć logo w Kreatorze marki',
    'Od opisu firmy do logo w wektorze: brief, sześć kierunków, edycja na żywo, zasady marki i pliki.',
    `## Czym jest Kreator marki
Kreator marki to kreator logo w panelu Verris. Opisujesz firmę, wybierasz jeden z sześciu kierunków i dopracowujesz go na żywo. Na końcu dostajesz logo w wektorze w kilku wersjach, paletę kolorów, kroje pisma, favicon i stopkę e-mail. Logo możesz od razu użyć na stronie z Kreatora stron.

## Krok 1 – brief
W menu wybierz **Kreator marki** i kliknij **Nowa marka**. Podaj nazwę firmy, branżę i jedno zdanie o tym, co robisz. Wybierz rodzaj znaku (znak z napisem, sam napis albo monogram), do trzech cech charakteru marki oraz kolory, które lubisz i których nie chcesz. Nie wpisuj nazw znanych marek („jak logo X”) – takie polecenie kreator odrzuci.

## Krok 2 – sześć kierunków
Kreator pokazuje sześć kierunków: każdy ma inny znak, krój pisma i paletę oraz krótkie uzasadnienie. Jedna taka propozycja to jedna seria. Jeśli żaden kierunek Ci nie pasuje, zmień brief i poproś o nową serię.

## Krok 3 – edycja na żywo
Wybrany kierunek zmieniasz w panelu **Dopasuj**: kolor główny i akcent, krój i grubość napisu, układ (poziomy, pionowy, sam znak). Te zmiany działają od razu, bez AI, i nie zużywają limitu. Limit zmian AI dotyczy poleceń, takich jak „zaproponuj hasło” albo „nazwij kolory”.

## Krok 4 – zasady i pliki
Po wyborze kreator przygotowuje zasady marki: wersje logo, pole ochronne, minimalne rozmiary, favicon i paletę ze sprawdzonym kontrastem. Pliki pobierzesz jako ZIP (opis w artykule „Pliki logo – który do czego”).

## Limity
- **W cenie hostingu:** 1 marka na koncie, 3 serie propozycji i 50 zmian AI miesięcznie.
- **Pakiet marki:** 10 serii propozycji i 300 zmian AI, księga znaku, wizytówka i papier firmowy, grafiki do mediów społecznościowych oraz nowe szablony przez 12 miesięcy – 149 zł brutto (121,14 zł netto) jednorazowo.
- **Druga marka na koncie:** 49 zł brutto (39,84 zł netto) jednorazowo.

## Zanim użyjesz logo
Logo z kreatora nie jest znakiem zastrzeżonym. Zanim zamówisz szyld albo wizytówki, sprawdź w TMview, czy nikt nie ma podobnego znaku – instrukcja w artykule „Logo a znak towarowy – TMview krok po kroku”.`,
    { t: 'Jak stworzyć logo w Kreatorze marki – kreator logo w panelu Verris', d: 'Kreator logo Verris krok po kroku: brief, sześć kierunków, edycja koloru i kroju na żywo, zasady marki i pliki. W cenie hostingu.',
      faq: [
        { q: 'Ile kosztuje Kreator marki?', a: 'Jest w cenie hostingu: 1 marka na koncie, 3 serie propozycji i 50 zmian AI miesięcznie. Płatny jest Pakiet marki – 149 zł brutto (121,14 zł netto) jednorazowo – i druga marka na koncie – 49 zł brutto (39,84 zł netto).' },
        { q: 'Czy zmiana koloru zużywa limit?', a: 'Nie. Kolor, krój i układ zmieniasz bez AI i bez limitu. Limit dotyczy serii propozycji i poleceń dla AI.' },
        { q: 'Czy mogę poprosić o logo w stylu znanej marki?', a: 'Nie. Kreator odrzuca briefy, które proszą o styl konkretnej marki – to chroni Cię przed sporem o podobieństwo.' },
      ], related: ['pliki-logo-svg-png-pdf-favicon', 'logo-a-znak-towarowy-tmview', 'marka-na-stronie-z-kreatora-stron'] }),

  D('kreator-stron', 'mam-logo-materialy-key-visual', 'Mam już logo – materiały Key Visual',
    'Wgraj swoje logo, a kreator zbuduje z niego paletę, wzór i materiały – bez zmiany samego logo.',
    `## Kiedy wybrać tę ścieżkę
Masz logo i chcesz je zostawić, ale brakuje Ci spójnych materiałów: kolorów, wzoru, grafik do mediów społecznościowych, wizytówki. W **Kreatorze marki** wybierz **Mam już logo**.

## Wgranie logo
Wgraj plik SVG, PDF, PNG albo JPG do 10 MB. Najlepszy jest SVG albo PDF z wektorem – wtedy logo zostaje ostre w każdym rozmiarze. Przed wgraniem potwierdzasz, że masz prawo używać tego logo (np. zaprojektowałeś je sam albo kupiłeś prawa od grafika).

## Co robi kreator
- Odczytuje kolory z logo i proponuje paletę z kontrastem sprawdzonym pod czytelność.
- Plik PNG albo JPG zamienia na wektor – porównasz oryginał z wersją wektorową i wybierzesz lepszą.
- Opisuje elementy logo i wskazuje możliwe problemy, np. zbyt jasny podpis na białym tle albo gradient, który źle się drukuje.
- Buduje materiały: wzór, post, story, okładkę Facebooka, baner LinkedIn, wizytówkę i papier firmowy (część z nich w Pakiecie marki).

Samo logo zostaje bez zmian. Jeśli chcesz je unowocześnić, zobacz artykuł „Odświeżenie logo”.`,
    { t: 'Mam już logo – materiały Key Visual w Kreatorze marki', d: 'Wgraj logo (SVG, PDF, PNG, JPG do 10 MB), a Kreator marki zbuduje z niego paletę, wzór i materiały do sieci i druku bez zmiany logo.',
      faq: [
        { q: 'Jaki plik logo najlepiej wgrać?', a: 'SVG albo PDF z wektorem. PNG i JPG też zadziałają – kreator zamieni je na wektor i pokaże porównanie z oryginałem.' },
        { q: 'Czy kreator zmieni moje logo?', a: 'Nie w tej ścieżce. Logo zostaje bez zmian – zmieniają się tylko materiały wokół niego.' },
      ], related: ['odswiezenie-logo', 'pliki-logo-svg-png-pdf-favicon', 'druk-wizytowka-cmyk'] }),

  D('kreator-stron', 'odswiezenie-logo', 'Odświeżenie logo',
    'Trzy kierunki odświeżenia istniejącego logo: ewolucja, odświeżenie i nowy kierunek – z opisem, co zostaje, a co się zmienia.',
    `## Kiedy odświeżyć logo
Gdy logo ma kilkanaście lat, źle wygląda w małym rozmiarze (np. jako ikona w przeglądarce) albo nie pasuje do nowej strony. Klienci znają jednak stare logo – dlatego kreator pokazuje zmiany stopniowo.

## Jak to działa
W **Kreatorze marki** wybierz **Odświeżenie** i wgraj obecne logo (SVG, PDF, PNG albo JPG do 10 MB). Potwierdź, że masz do niego prawa. Dostaniesz trzy kierunki:
- **Ewolucja** – to samo logo, poprawione: wyrównane proporcje, lepszy kontrast, czytelność w małym rozmiarze.
- **Odświeżenie** – rozpoznawalny znak i kolory, nowy krój lub układ.
- **Nowy kierunek** – nowe logo, które nawiązuje do starego tylko kolorem albo motywem.

Przy każdym kierunku widzisz listę „co zostaje / co się zmienia”. Wybrany kierunek dopracujesz na żywo tak jak przy nowej marce.

## Zanim wymienisz logo wszędzie
Nowa wersja logo to nowy znak – sprawdź go w TMview (artykuł „Logo a znak towarowy – TMview krok po kroku”). Jeśli stare logo było zarejestrowane jako znak towarowy, zmiana może wymagać nowego zgłoszenia – zapytaj rzecznika patentowego.`,
    { t: 'Odświeżenie logo w Kreatorze marki – ewolucja czy nowy kierunek', d: 'Jak odświeżyć logo w Kreatorze marki Verris: trzy kierunki zmian, lista co zostaje i co się zmienia, edycja na żywo.',
      faq: [
        { q: 'Czy odświeżone logo straci rozpoznawalność?', a: 'Zależy od kierunku. Ewolucja zmienia najmniej, nowy kierunek – najwięcej. Przy każdym widzisz, co zostaje, a co się zmienia.' },
      ], related: ['mam-logo-materialy-key-visual', 'logo-a-znak-towarowy-tmview', 'jak-stworzyc-logo-w-kreatorze-marki'] }),

  D('kreator-stron', 'pliki-logo-svg-png-pdf-favicon', 'Pliki logo – który do czego (SVG, PNG, PDF, favicon)',
    'Co jest w paczce z logo i którego pliku użyć na stronie, w dokumentach, w mediach społecznościowych i w druku.',
    `## Co jest w paczce
Pliki pobierasz w Kreatorze marki jako ZIP. W środku:
- **SVG** – logo w wektorze w wersjach: kolor, jednobarwna, negatyw (na ciemne tło) i biała; w układzie poziomym, pionowym i jako sam znak.
- **PNG** – te same wersje jako obrazki w kilku rozmiarach, z przezroczystym tłem.
- **PDF** – logo w wektorze do dokumentów i drukarni.
- **Favicon** – favicon.ico i favicon.svg oraz ikony 180, 192 i 512 px z plikiem manifestu – do strony i ikony na ekranie telefonu.
- **Kroje pisma** – pliki krojów z tekstem licencji (SIL Open Font License), która pozwala używać ich komercyjnie, także na stronie i w druku.
- **Zasady marki** – kolory (w zapisie do ekranu i odpowiedniki do druku), pole ochronne i minimalne rozmiary.

## Który plik do czego
- **Strona www:** SVG (ostry w każdym rozmiarze); PNG, jeśli system strony nie przyjmuje SVG.
- **Favicon i ikona telefonu:** favicon.ico, favicon.svg i ikony 180, 192 i 512 px.
- **Facebook, Instagram, LinkedIn:** PNG – na zdjęcie profilowe sam znak.
- **Word, PowerPoint:** PNG albo SVG (nowsze wersje pakietów biurowych przyjmują SVG).
- **Drukarnia, szyld, folia:** PDF albo SVG.
- **Stopka e-mail:** PNG z Twojego hostingu – programy pocztowe źle pokazują SVG.

## Minimalny rozmiar
Logo poziome nie powinno być niższe niż 24 px na ekranie i 8 mm w druku. W mniejszym miejscu użyj samego znaku.`,
    { t: 'Pliki logo: SVG, PNG, PDF i favicon – którego użyć', d: 'Co dostajesz z Kreatora marki Verris i którego pliku logo użyć na stronie, w mediach społecznościowych, w dokumentach i w druku.',
      faq: [
        { q: 'Czym różni się SVG od PNG?', a: 'SVG to wektor – jest ostry w każdym rozmiarze i ma mały plik. PNG to obrazek o stałej liczbie pikseli – przy powiększeniu się rozmywa.' },
        { q: 'Czy mogę używać krojów z paczki na stronie i w druku?', a: 'Tak. Kroje mają licencję SIL Open Font License, która pozwala używać ich komercyjnie. Nie wolno tylko sprzedawać samych plików krojów.' },
      ], related: ['druk-wizytowka-cmyk', 'stopka-email-z-logo', 'marka-na-stronie-z-kreatora-stron'] }),

  D('kreator-stron', 'druk-wizytowka-cmyk', 'Druk: wizytówka i CMYK',
    'Jak przygotować wizytówkę z Pakietu marki do druku i co zrobić, gdy drukarnia prosi o plik w CMYK.',
    `## Co dostajesz
Wizytówka z Pakietu marki to PDF wektorowy w formacie 85 × 55 mm ze spadem 3 mm z każdej strony i liniami cięcia. Papier firmowy dostajesz w PDF A4.

## Kolory: RGB i CMYK
Ekran wyświetla kolory w RGB, a drukarnie offsetowe drukują w CMYK. Pliki z kreatora mają kolory w RGB, a w zasadach marki podajemy odpowiedniki CMYK dla każdego koloru. Nie wszystkie kolory z ekranu da się wydrukować tak samo – intensywne zielenie, niebieskie i pomarańcze w druku często wychodzą ciemniejsze.

## Gdy drukarnia nie przyjmuje pliku
1. Napisz do drukarni, że plik jest w RGB, i podaj odpowiedniki CMYK z zasad marki – większość drukarni sama konwertuje plik.
2. Poproś o wydruk próbny (proof), zanim zamówisz cały nakład.
3. Jeśli drukarnia wymaga pliku PDF/X w CMYK, poproś ją o konwersję albo skorzystaj z programu graficznego. Kreator marki nie tworzy dziś plików PDF/X.

## Spad i linie cięcia
Spad to tło wychodzące 3 mm poza format – dzięki niemu po cięciu nie zostaje biały pasek. Nie przesuwaj ważnych elementów (tekstu, logo) bliżej niż 3–4 mm od krawędzi.`,
    { t: 'Wizytówka do druku i CMYK – pliki z Kreatora marki', d: 'Jak wydrukować wizytówkę z Pakietu marki Verris: spad, linie cięcia, kolory RGB i odpowiedniki CMYK, co zrobić, gdy drukarnia nie przyjmuje pliku.',
      faq: [
        { q: 'Drukarnia mówi, że plik nie jest w CMYK. Co robić?', a: 'Podaj drukarni odpowiedniki CMYK z zasad marki i poproś o konwersję oraz wydruk próbny. Kreator nie tworzy dziś plików PDF/X w CMYK.' },
        { q: 'Dlaczego kolor na wizytówce jest inny niż na ekranie?', a: 'Ekran świeci kolorami RGB, a druk używa farb CMYK o mniejszym zakresie. Wydruk próbny pokaże, jak kolor wyjdzie na wybranym papierze.' },
      ], related: ['pliki-logo-svg-png-pdf-favicon', 'mam-logo-materialy-key-visual'] }),

  D('kreator-stron', 'logo-a-znak-towarowy-tmview', 'Logo a znak towarowy – TMview krok po kroku',
    'Dlaczego logo z kreatora nie jest znakiem zastrzeżonym i jak samodzielnie sprawdzić podobne znaki w TMview.',
    `## Logo to nie znak zastrzeżony
Logo z Kreatora marki możesz używać w swojej firmie, ale samo w sobie nie jest znakiem zastrzeżonym. Ochronę znaku towarowego daje dopiero rejestracja:
- w **Urzędzie Patentowym RP** – ochrona w Polsce,
- w **EUIPO** – ochrona w całej Unii Europejskiej.

Rejestracja to osobna procedura z opłatami urzędowymi. Zgłaszasz znak sam albo z rzecznikiem patentowym. Urzędy nie sprawdzają same wszystkich wcześniejszych znaków – właściciele podobnych znaków mogą wnieść sprzeciw.

## Dlaczego sprawdzić znak przed użyciem
Jeśli ktoś ma zarejestrowany podobny znak dla podobnych towarów lub usług, może zażądać, żebyś przestał używać swojego logo – nawet jeśli wymyśliłeś je sam. Dlatego sprawdź nazwę i znak, zanim zamówisz szyld, wizytówki albo oklejenie samochodu.

## TMview krok po kroku
1. Otwórz bezpłatną bazę **TMview** (tmdn.org/tmview). Zbiera znaki z urzędów Unii Europejskiej, w tym z UPRP i EUIPO.
2. Wpisz nazwę firmy w polu wyszukiwania. Sprawdź też warianty pisowni i nazwy podobnie brzmiące.
3. Zawęź wyniki do terytorium: Polska i Unia Europejska.
4. Zawęź wyniki do klas towarów i usług, w których działasz (np. usługi gastronomiczne, usługi księgowe). Klasy opisuje klasyfikacja nicejska.
5. Sprawdź status znaków: zarejestrowane i zgłoszone są ważne, wygasłe i odrzucone – zwykle nie.
6. Jeśli TMview pozwala szukać obrazem, wgraj swoje logo i przejrzyj podobne znaki.

To nie jest badanie prawne. Gdy znajdziesz podobny znak albo planujesz duże wydatki na markę, skonsultuj się z rzecznikiem patentowym.

## Co robi Verris
Kreator nie przygotuje logo na wzór znanej marki i unika propozycji bardzo podobnych do znaków, które już w nim wybrano – ale tego nie gwarantujemy, bo logo powstaje z pomocą AI ze wspólnej biblioteki kształtów. Nie sprawdzamy rejestrów urzędowych za Ciebie i nie gwarantujemy, że podobnego znaku nikt nie używa. Przed pobraniem plików do druku poprosimy Cię o potwierdzenie, że znasz te zasady.

## Prawa do logo
Do pobranego logo i materiałów dostajesz bezterminową licencję niewyłączną na całym świecie. Możesz ich używać w firmie, na stronie, w drukach i reklamie, zmieniać je, przekazać pliki drukarni lub agencji i zgłosić logo jako znak towarowy. Licencji nie wypowiemy – zostaje także po zakończeniu hostingu i usunięciu konta. Szczegóły: Regulamin §13b ust. 4–6.`,
    { t: 'Logo a znak towarowy – jak sprawdzić logo w TMview', d: 'Logo z kreatora nie jest znakiem zastrzeżonym. Jak samodzielnie sprawdzić nazwę i znak w TMview przed drukiem i rejestracją w UPRP lub EUIPO.',
      faq: [
        { q: 'Czy logo z Kreatora marki jest zastrzeżone?', a: 'Nie. Ochronę daje dopiero rejestracja znaku towarowego w Urzędzie Patentowym RP albo w EUIPO – to osobna procedura.' },
        { q: 'Czy Verris sprawdza, czy podobne logo już istnieje?', a: 'Kreator unika propozycji bardzo podobnych do logo, które już w nim powstały, ale tego nie gwarantujemy – logo powstaje z pomocą AI ze wspólnej biblioteki kształtów. Rejestrów urzędowych nie sprawdzamy – zrób to w TMview albo z rzecznikiem patentowym.' },
        { q: 'Czy mogę zarejestrować logo z kreatora jako znak towarowy?', a: 'Możesz je zgłosić do urzędu – licencja z Regulaminu (§13b ust. 4) na to pozwala. Przed zgłoszeniem sprawdź podobne znaki w TMview – rejestracja nie chroni przed sprzeciwem właściciela wcześniejszego znaku.' },
      ], related: ['jak-stworzyc-logo-w-kreatorze-marki', 'odswiezenie-logo'] }),

  D('kreator-stron', 'stopka-email-z-logo', 'Stopka e-mail z logo',
    'Stopka HTML z Kreatora marki dla skrzynek w Twojej domenie – jak ją skopiować i ustawić w webmailu i programie pocztowym.',
    `## Co przygotowuje kreator
Kreator marki tworzy stopkę e-mail w HTML: logo, imię i nazwisko, stanowisko, telefon, adres e-mail i stronę. Logo w stopce to plik PNG na Twoim hostingu – programy pocztowe źle pokazują SVG. Każda osoba w firmie wpisuje swoje imię i stanowisko i ustawia stopkę w swojej skrzynce.

## Webmail Verris
1. Zaloguj się do webmaila skrzynki.
2. Wejdź w **Ustawienia → Tożsamości** i kliknij swoją tożsamość.
3. W polu **Podpis** włącz edytor HTML i otwórz widok kodu źródłowego.
4. Wklej kod HTML stopki z Kreatora marki i zapisz.

## Outlook, Gmail, Apple Mail
Te programy nie przyjmują kodu HTML w polu podpisu. Kliknij w Kreatorze marki **Kopiuj stopkę** – skopiujesz gotowy podgląd – i wklej go w ustawieniach podpisu:
- **Outlook:** Ustawienia → Konta → Podpisy.
- **Gmail:** Ustawienia → Zobacz wszystkie ustawienia → Ogólne → Podpis.
- **Apple Mail:** Mail → Ustawienia → Podpisy (odznacz dopasowanie do domyślnej czcionki).

## Thunderbird
W ustawieniach konta zaznacz **Użyj HTML** przy tekście podpisu i wklej kod HTML stopki.

## Gdy logo się nie wyświetla
Część programów domyślnie blokuje obrazki z internetu – odbiorca zobaczy logo po kliknięciu „pokaż obrazy”. Sprawdź też, czy strona z logo działa pod Twoją domeną (adres obrazka zaczyna się od https://).`,
    { t: 'Stopka e-mail z logo – jak ustawić podpis HTML', d: 'Jak ustawić stopkę e-mail z logo z Kreatora marki w webmailu Verris, Outlooku, Gmailu, Apple Mail i Thunderbirdzie.',
      faq: [
        { q: 'Czy Verris ustawi stopkę za mnie we wszystkich skrzynkach?', a: 'Jeszcze nie. Stopkę kopiujesz z Kreatora marki i wklejasz w ustawieniach podpisu – każda osoba w swojej skrzynce.' },
        { q: 'Dlaczego odbiorca nie widzi logo w stopce?', a: 'Wiele programów pocztowych blokuje obrazki z internetu, dopóki odbiorca ich nie pokaże. Logo musi też być dostępne pod adresem https:// na Twoim hostingu.' },
      ], related: ['konfiguracja-poczty-imap-smtp', 'pliki-logo-svg-png-pdf-favicon'] }),

  D('kreator-stron', 'marka-na-stronie-z-kreatora-stron', 'Marka na stronie z Kreatora stron',
    'Jak przenieść logo, kolory, kroje i favicon z Kreatora marki na stronę z Kreatora stron – i co się dzieje, gdy zmienisz markę.',
    `## Użyj marki na stronie
W Kreatorze marki kliknij **Użyj w Kreatorze stron** i wybierz stronę. Zobaczysz podgląd zmian:
- logo w nagłówku i stopce zamiast pierwszej litery nazwy,
- kolory marki w motywie strony,
- kroje marki w nagłówkach i tekście,
- favicon i obraz do udostępniania w mediach społecznościowych.

Zmiany zatwierdzasz jednym kliknięciem, a stronę publikujesz jak zwykle.

## Gdy zmienisz markę później
Strona nie zmienia się sama. Po zmianie marki edytor pokaże propozycję aktualizacji z podglądem – Ty decydujesz, czy ją przyjąć. Opublikowana strona zmieni się dopiero po ponownej publikacji.

## Kolory i czytelność
Kreator stron dba o kontrast tekstu z tłem. Jeśli kolor marki jest za jasny do tekstu, motyw użyje go w tłach i akcentach, a tekst zostanie ciemny.`,
    { t: 'Logo i kolory marki na stronie z Kreatora stron', d: 'Jak użyć logo, kolorów, krojów i faviconu z Kreatora marki na stronie z Kreatora stron Verris i co się dzieje po zmianie marki.',
      faq: [
        { q: 'Czy zmiana logo zmieni opublikowaną stronę?', a: 'Nie od razu. Edytor pokaże propozycję zmian z podglądem, a opublikowana strona zmieni się po ponownej publikacji.' },
      ], related: ['jak-stworzyc-strone-w-kreatorze', 'publikacja-strony-z-kreatora', 'jak-stworzyc-logo-w-kreatorze-marki'] }),
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
        // Szkic nie trafia do indeksu AI (asystent nie może mówić o funkcji, której nie ma w sprzedaży).
        if ((exists as { status?: string }).status === 'PUBLISHED') await indexAi(a).catch(() => {});
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
        status: a.status ?? 'PUBLISHED',
        seoTitle: a.seoTitle ?? null,
        seoDescription: a.seoDescription ?? null,
        faq: a.faq as unknown as object,
        relatedSlugs: a.relatedSlugs,
        authorName: 'Zespół Verris',
        publishedAt: a.status === 'DRAFT' ? null : new Date(),
      },
    });
    if (a.status !== 'DRAFT') await indexAi(a).catch(() => {});
    created++;
  }

  console.log(`KB seed: kategorie=${idBySlug.size}, artykuły nowe=${created}, odświeżone (autor „Zespół Verris”)=${updated}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('KB seed error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
