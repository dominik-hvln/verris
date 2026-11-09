# Polityka prywatności Verris

**Wersja 1.3.0 · obowiązuje od [DATA PUBLIKACJI]**

> Wersja 1.3.0 zastępuje wersję 1.2.1 z 6 listopada 2026 r.

Niniejsza Polityka realizuje obowiązki informacyjne z art. 13 i 14 RODO wobec klientów Verris, użytkowników subkont, osób odwiedzających panel i strony Verris oraz osób korzystających z formularzy na stronie verris.pl.

## 1. Administrator danych

Administratorem Twoich danych osobowych jest **HVLN Dominik Kowalski** z siedzibą pod adresem Zacisze 2A, 65-775 Zielona Góra, wpisany do Centralnej Ewidencji i Informacji o Działalności Gospodarczej, NIP 9292069367, REGON 521024260.

Kontakt: e-mail `kontakt@verris.pl`, telefon +48 511 589 465 (dni robocze, godziny 9–17); możesz też zostawić numer w formularzu na stronie `verris.pl/kontakt` – oddzwonimy w dni robocze w godzinach 9–17. We wszystkich sprawach dotyczących danych osobowych: **`rodo@verris.pl`**. Na żądania dotyczące Twoich praw odpowiadamy bez zbędnej zwłoki, najpóźniej w ciągu miesiąca.

## 2. Jakie dane przetwarzamy

### 2.1 Dane konta
Adres e-mail, hasło (wyłącznie w postaci skrótu bcrypt), imię i nazwisko, opcjonalnie numer telefonu, preferencje językowe, dane uwierzytelniania dwuskładnikowego (sekret TOTP szyfrowany AES-256-GCM, kody zapasowe w postaci skrótów, klucze passkey).

### 2.2 Dane rozliczeniowe
Dane do faktur (nazwa, adres, NIP przy fakturach na działalność), saldo Portfela i historia transakcji, numery i treść faktur, identyfikator klienta u operatora płatności Stripe, identyfikatory płatności Paynow (mBank) oraz identyfikatory zapisanych metod płatności – pełny numer karty zna wyłącznie Stripe; my widzimy tylko cztery ostatnie cyfry i typ karty. Jeżeli przy usunięciu konta wnioskujesz o zwrot opłaconych kredytów – numer rachunku bankowego i nazwę odbiorcy przelewu.

### 2.3 Dane techniczne i bezpieczeństwa
Adres IP, przeglądarka (User-Agent) i znaczniki czasu logowań, dziennik zmian na koncie, alerty bezpieczeństwa, logi doręczeń e-mail, dane sesji (token w cookie httpOnly).

### 2.4 Dane usług
Nazwa konta hostingowego, podłączone domeny i konfiguracja DNS, nazwy baz danych i kont e-mail, zagregowane metryki zużycia zasobów (procesor, pamięć, dysk), parametry serwerów VPS, dane abonenta rejestrowanych domen. **Nie analizujemy treści** Twoich stron, plików, wiadomości ani baz danych – w tym zakresie działamy wyłącznie jako podmiot przetwarzający na Twoje polecenie (zob. pkt 3 i DPA).

### 2.5 Dane wsparcia i komunikacji
Treść zgłoszeń do obsługi z załącznikami (także uwag z testów wysłanych przyciskiem „Zgłoś uwagę” – wtedy z adresem strony panelu, przeglądarką i, jeśli go dołączysz, zrzutem ekranu strony panelu), korespondencja e-mail, preferencje powiadomień oraz zgody na wiadomości od Verris (newsletter, nowości, oferty partnerskie) wraz z historią ich wyrażenia i wycofania (data, kategoria, adres IP i przeglądarka).

### 2.6 Współpracownicy (subkonta)
Adres e-mail i imię współpracownika zaproszonego do konta, nadane uprawnienia, dziennik zaproszeń, akceptacji i operacji. Dane te otrzymujemy od właściciela konta, który zaprasza współpracownika (art. 14 RODO – źródłem danych jest właściciel konta).

### 2.7 Asystent AI w panelu
Asystent AI jest dostępny w panelu dla wszystkich klientów. Przetwarzamy treść pytań zadanych asystentowi i jego odpowiedzi; kontekst usługi, której dotyczy pytanie (stan usługi, data odnowienia, stan dysku, SSL, domeny i kopii – **bez haseł, kluczy, adresów e-mail i kwot**); na pulpicie – listę Twoich usług z planem, stanem, domeną, datą odnowienia i ważnością SSL; zagregowane metryki zużycia zasobów, gdy prosisz o prognozę; treść zgłoszenia z usuniętymi danymi wrażliwymi, gdy nasz pracownik prosi asystenta o szkic odpowiedzi. Do każdego użycia zapisujemy liczbę przetworzonych tokenów i koszt (miesięczny limit asystenta). Asystent nie ma dostępu do plików, baz danych ani poczty Twoich stron.

### 2.8 Asystent AI na verris.pl
Na stronie verris.pl możesz zadać pytanie asystentowi AI bez zakładania konta. Zapisujemy treść Twoich pytań i odpowiedzi asystenta oraz skrót (nie sam adres) IP, którego używamy wyłącznie do ograniczania nadużyć. Identyfikator rozmowy trzymamy w pamięci karty przeglądarki (sessionStorage), nie w pliku cookie. Rozmowę usuwamy 30 dni po ostatniej wiadomości. Odpowiedzi generuje model Anthropic (Anthropic Ireland, Limited) na podstawie naszego cennika, specyfikacji i publicznych poradników; dostawca nie trenuje modeli na tych danych. Jeśli w oknie asystenta poprosisz o telefon, przekażemy przebieg rozmowy osobie, która oddzwoni. Nie podawaj w rozmowie haseł, danych do płatności ani danych szczególnych kategorii.

### 2.9 Formularze na verris.pl
- **Formularz kontaktowy:** imię, adres e-mail, adres Twojej strony (jeśli go podasz), treść wiadomości, adres strony formularza, adres IP i przeglądarka (dowód wysłania i ochrona przed nadużyciami).
- **Prośba o telefon („Wolisz porozmawiać?”):** imię, numer telefonu, preferowana pora rozmowy, adres strony, adres IP i przeglądarka; jeśli prośba przyszła z okna asystenta AI – także przebieg tej rozmowy. Numer wykorzystujemy tylko do oddzwonienia w tej sprawie.
- **Plan przeniesienia strony (verris.pl/przenies-strone):** adres e-mail, adres strony formularza, adres IP i przeglądarka. Plan wysyłamy mailem każdemu, kto o niego prosi – bez warunku zgody marketingowej. Jeśli dodatkowo zaznaczysz dobrowolną zgodę na kilka wiadomości o hostingu Verris, zapisujemy treść tej zgody i chwilę jej wyrażenia; wiadomości zaczniemy wysyłać dopiero po potwierdzeniu zgody przyciskiem w mailu, a wypiszesz się jednym kliknięciem w każdej z nich.

Formularze chroni Cloudflare Turnstile (pkt 5.1). Adresu e-mail z formularzy nie przekazujemy innym podmiotom poza dostawcami wymienionymi w pkt 5.1; jeśli masz włączoną zgodę na cookies marketingowe, wysłanie formularza może zostać zarejestrowane jako zdarzenie konwersji w narzędziach reklamowych (pkt 5.2 i 8).

### 2.10 Zgłoszenie do testów Verris
Jeśli zgłaszasz się do testów Verris przed startem (formularz verris.pl/beta), przetwarzamy dane z formularza (imię, e-mail, co chcesz sprawdzić, opcjonalnie adres strony, obecny hosting i uwagi), treść zgody, czas wysłania, adres IP i przeglądarkę oraz informację, z jakiej kampanii lub strony przyszło zgłoszenie. Wiadomości wysyłamy tylko w sprawie testów – bez newslettera i ofert. Jeśli zostaniesz testerem, postęp scenariuszy testowych i Twoje uwagi do nich zapisujemy na Twoim koncie.

### 2.11 Program EKO
Punkty EKO na koncie i historię ich zmian, wkład Twoich usług opłaconych pieniędzmi w procent drzewa we wspólnej puli (do wyliczenia wkładu używamy historii Twojego portfela – kredyty z kodów, poleceń i rekompensat nie dają wkładu), wymiany punktów oraz zamówienia własnych drzew i ich certyfikaty. Drzewa zamawiamy u partnera sadzącego drzewa we własnym imieniu: certyfikaty – także Twojego własnego drzewa – wystawiane są na Verris, a partner nie otrzymuje żadnych Twoich danych. To, które drzewa i certyfikaty są Twoje, zapisujemy tylko u nas i pokazujemy w panelu.

### 2.12 Verris Kreator (kreator stron)
Jeśli tworzysz stronę w Verris Kreatorze, przetwarzamy: opis strony i dane firmy, które podajesz w kreatorze (np. nazwa, branża, adres, telefon, e-mail, godziny otwarcia, NIP, profile w serwisach społecznościowych, ceny i opis oferty), treść i układ stron wraz z historią wersji, Twoje polecenia dla AI, zdjęcia w bibliotece konta (wgrane przez Ciebie – z usuniętymi przy wgraniu metadanymi, m.in. danymi aparatu i lokalizacją – oraz wybrane z bibliotek zdjęć, z autorem i licencją), liczniki użycia kreatora w miesiącu, dane publikacji (domena, daty, link podglądu) oraz – jeśli przechodzisz na WordPress – nazwę bazy danych i login administratora WordPressa na Twoim hostingu.

Treść stron, ich zmiany i tłumaczenia przygotowuje model AI Anthropic (pkt 5.1): przekazujemy mu opis strony, dane firmy podane w kreatorze, treść strony i Twoje polecenia (bez zdjęć); dostawca nie trenuje modeli na tych danych. W dzienniku kosztów AI zapisujemy zużycie i koszt każdego użycia, bez treści. Zdjęcia przechowujemy w magazynie plików Verris na naszych serwerach (pkt 5.1 – Hetzner). Wyszukiwanie w bibliotekach zdjęć (np. Openverse, Pixabay) wykonuje serwer Verris: do dostawcy biblioteki trafia wyłącznie wpisana fraza – bez Twojego adresu IP i danych konta – a miniatury i wybrane zdjęcia pobiera serwer Verris. Dlatego dostawcy bibliotek nie są odbiorcami Twoich danych. Nie wpisuj w kreatorze danych, których nie chcesz pokazać na stronie, ani danych szczególnych kategorii.

Wiadomości wysyłane przez formularz kontaktowy Twojej strony z kreatora oraz dane innych osób, które umieszczasz na stronie (np. imiona i zdjęcia pracowników), przetwarzamy na Twoje polecenie jako podmiot przetwarzający (pkt 3 i DPA).

## 3. Dwie role Verris

W zakresie danych opisanych w pkt 2 Verris jest **administratorem**. W zakresie danych, które przechowujesz lub przetwarzasz w ramach swoich usług (pliki i bazy Twoich serwisów, skrzynki Twoich użytkowników, listy odbiorców kampanii e-mail, dane na Twoim VPS, statystyki odwiedzin Twoich stron, jeśli je włączysz, a także dane osób trzecich w treściach stron tworzonych w Verris Kreatorze i wiadomości z formularzy kontaktowych tych stron), administratorem jesteś **Ty**, a Verris działa jako **podmiot przetwarzający** na podstawie Umowy powierzenia przetwarzania danych (DPA), którą akceptujesz i pobierasz w Panelu (Ustawienia → Prywatność i dane).

## 4. Cele, podstawy prawne i okresy przetwarzania

| Cel | Podstawa (art. 6 RODO) | Okres |
| --- | --- | --- |
| Zawarcie i wykonanie umowy: konto, świadczenie usług, rozliczenia, wsparcie | ust. 1 lit. b | czas trwania umowy; po żądaniu usunięcia konta – 14 dni albo do końca najdłuższego opłaconego okresu usług, następnie anonimizacja |
| Zwrot opłaconych kredytów przy usunięciu konta (numer rachunku) | ust. 1 lit. b i c | do wykonania zwrotu; potwierdzenie przelewu jak dokumenty księgowe – 5 lat od końca roku podatkowego |
| Wystawianie i przechowywanie faktur, rozliczenia podatkowe (w tym KSeF) | ust. 1 lit. c (ustawa o VAT, Ordynacja podatkowa) | 5 lat od końca roku podatkowego |
| Bezpieczeństwo usług: logi logowań, dziennik zmian, wykrywanie nadużyć, ochrona formularzy przed botami | ust. 1 lit. f – uzasadniony interes Verris i klientów | logi logowań 180 dni; adresy IP i przeglądarka w dzienniku zmian anonimizowane po 24 miesiącach; zapisy zdarzeń płatniczych (deduplikacja) 90 dni |
| Komunikacja transakcyjna (potwierdzenia, powiadomienia o usługach i płatnościach) | ust. 1 lit. b | logi doręczeń 12 miesięcy |
| Odpowiedź na wiadomość z formularza kontaktowego na verris.pl | ust. 1 lit. f – odpowiadanie na pytania; lit. b – gdy pytanie dotyczy zawarcia umowy | 12 miesięcy od wysłania |
| Oddzwonienie na prośbę o telefon z verris.pl | ust. 1 lit. f; lit. b – gdy rozmowa dotyczy zawarcia umowy | 90 dni od wysłania |
| Wysłanie planu przeniesienia strony (verris.pl/przenies-strone) | ust. 1 lit. b – działanie na Twoje żądanie przed zawarciem umowy | 30 dni od wysłania, jeśli nie zaznaczysz zgody na wiadomości |
| Wiadomości o hostingu Verris po planie przeniesienia (dobrowolna zgoda z formularza) | ust. 1 lit. a – zgoda | niepotwierdzona zgoda – 7 dni; potwierdzona – do jej wycofania, najdłużej 24 miesiące od potwierdzenia; po wypisie ślad wycofania 30 dni |
| Zgłoszenie do testów Verris przed startem (verris.pl/beta): potwierdzenie adresu, wybór testerów, zaproszenie z kodem albo odpowiedź odmowna | ust. 1 lit. b – działania na Twoje żądanie przed zawarciem umowy | niepotwierdzone zgłoszenie 7 dni; zgłoszenie bez zaproszenia 90 dni od wysłania; po zaproszeniu – jak dane konta, jeśli je założysz |
| Rozpatrywanie zgłoszeń DSA (nadużycia) i decyzji moderacyjnych | ust. 1 lit. c (DSA) oraz lit. f | czas postępowania + okres przedawnienia roszczeń |
| Marketing własny: newsletter i nowości w funkcjach (zgody w panelu, Ustawienia → Powiadomienia) | ust. 1 lit. a – zgoda | do wycofania zgody |
| Oferty partnerskie: wysyłane przez Verris informacje o ofertach wybranych partnerów (Twoich danych nie przekazujemy partnerom) | ust. 1 lit. a – zgoda | do wycofania zgody |
| Program EKO: punkty, wkłady w drzewa, własne drzewa z certyfikatem | ust. 1 lit. b – funkcja konta | czas trwania konta; zamówienia drzew z certyfikatem – jak dokumenty księgowe |
| Statystyki korzystania z serwisu (Google Analytics 4, tagi przez Google Tag Manager) | ust. 1 lit. a – zgoda wyrażona w banerze cookies | dane zdarzeń w GA4 do 14 miesięcy; cookies wg Polityki cookies |
| Sygnały Google Consent Mode bez plików cookies dla kategorii, na którą nie ma zgody – tylko gdy zgodzisz się na drugą z kategorii analitycznej albo marketingowej (tryb podstawowy, pkt 5.2) | ust. 1 lit. f – pomiar ruchu bez plików cookies | po stronie Google wg jego zasad; Verris nie zapisuje tych sygnałów |
| Pomiar skuteczności i dopasowanie reklam (Google Ads, Meta Pixel, przekaźnik zdarzeń Meta), w tym remarketing | ust. 1 lit. a – zgoda wyrażona w banerze cookies | do wycofania zgody; cookies wg Polityki cookies |
| Asystent AI w panelu (odpowiedzi na pytania, prognozy zasobów) i szkice odpowiedzi dla naszych pracowników | ust. 1 lit. b – funkcja usługi uruchamiana przez Ciebie; szkice dla obsługi – ust. 1 lit. f (sprawne wsparcie) | dziennik asystenta (pytania, odpowiedzi, zużycie) 12 miesięcy; u dostawcy AI zgodnie z umową z nim (OpenAI: do 30 dni na wykrywanie nadużyć); dostawcy nie trenują modeli na tych danych |
| Verris Kreator: tworzenie, zmiany i tłumaczenie stron z pomocą AI, biblioteka zdjęć, publikacja na Twoim hostingu, przejście na WordPress, abonament Kreator Pro | ust. 1 lit. b – funkcja usługi, z której korzystasz | strony z historią wersji i zdjęcia – do ich usunięcia w kreatorze, najpóźniej do usunięcia konta; dane publikacji i przejścia na WordPress – do usunięcia strony; dziennik kosztów AI (bez treści) 12 miesięcy; rozliczenia abonamentu Kreator Pro – jak dokumenty księgowe |
| Asystent AI na verris.pl (odpowiedzi na pytania o ofertę, ochrona przed nadużyciami) | ust. 1 lit. f – odpowiadanie na pytania osób zainteresowanych usługą; lit. b – gdy pytanie dotyczy zawarcia umowy | rozmowa 30 dni od ostatniej wiadomości; dziennik kosztów AI (bez treści) 12 miesięcy |
| Obrona i dochodzenie roszczeń, obsługa reklamacji | ust. 1 lit. f | do upływu terminów przedawnienia (co do zasady 6 lat, art. 118 KC) |
| Wykonywanie obowiązków z RODO (rejestr zgód, obsługa żądań) | ust. 1 lit. c | historia zgód i żądań przez czas konta + okres przedawnienia |

Podanie danych oznaczonych w formularzach jako wymagane jest warunkiem zawarcia umowy albo otrzymania odpowiedzi; podanie pozostałych danych jest dobrowolne.

## 5. Odbiorcy danych

### 5.1 Podmioty przetwarzające na zlecenie Verris (podprocesorzy)

| Podmiot | Siedziba / lokalizacja danych | Cel | Transfer poza EOG |
| --- | --- | --- | --- |
| **Hetzner Online GmbH** | Niemcy; centra danych w Niemczech i Finlandii (UE) | serwery Verris: panel, interfejs API i baza danych, magazyn plików (m.in. zdjęcia z Verris Kreatora), serwery hostingowe, serwery VPS, zaszyfrowane kopie zapasowe przechowywane poza podstawową lokalizacją | nie |
| **Stripe Payments Europe, Ltd.** | Irlandia (EOG) | płatności kartą (także Apple Pay i Google Pay) i Przelewy24, zapisane karty, automatyczne doładowanie portfela, subskrypcje kartą, wpłaty w EUR i USD | możliwy transfer wspierający do Stripe, Inc. (USA) – standardowe klauzule umowne (SCC) i certyfikacja Data Privacy Framework |
| **mBank S.A. (Paynow)** | Polska (EOG) | jednorazowe wpłaty w PLN przez bramkę Paynow (BLIK, szybki przelew, karta) i ich zwroty | nie – dane przetwarzane w Polsce |
| **Amazon Web Services EMEA SARL** | Luksemburg; region usługi: UE (Frankfurt/Irlandia) | wysyłka wiadomości e-mail (Amazon SES): powiadomienia transakcyjne, kampanie e-mail marketingu i wiadomości z formularzy kontaktowych stron z Verris Kreatora | dane w regionie UE; możliwy dostęp wspierający z USA – SCC i Data Privacy Framework |
| **Cloudflare, Inc.** | USA; punkty obecności w EOG | ochrona przed botami (Cloudflare Turnstile): rejestracja i logowanie w panelu oraz formularze na verris.pl | tak – SCC i Data Privacy Framework |
| **Hosting Concepts B.V. (Openprovider)** | Holandia (EOG) | rejestracja, odnawianie i transfer domen | zależnie od rejestru domeny (pkt 5.2) |
| **Google Ireland Limited** | Irlandia (EOG) | pomiar korzystania z serwisu (Google Analytics 4) i zarządzanie tagami (Google Tag Manager) – pomiar z cookies wyłącznie po Twojej zgodzie; sygnały bez cookies opisuje pkt 5.2 | możliwy transfer do Google LLC (USA) – SCC i Data Privacy Framework |
| **Streamsoft spółka z ograniczoną odpowiedzialnością sp. k.** | Polska (Zielona Góra) | program księgowy Firmino: wystawianie i przechowywanie faktur VAT, przekazywanie faktur do KSeF | nie |
| **OpenAI Ireland Ltd** | Irlandia (Dublin); przetwarzanie także w USA | asystent AI w panelu – poziom szybki (czat, podpowiedzi) i wyszukiwanie w bazie wiedzy | tak – standardowe klauzule umowne (SCC) w umowie powierzenia dostawcy |
| **Anthropic Ireland, Limited** | Irlandia (Dublin); przetwarzanie także w USA | asystent AI w panelu – poziom analiz (prognozy zasobów, szkice odpowiedzi obsługi), asystent AI na verris.pl oraz Verris Kreator (tworzenie, zmiany i tłumaczenie treści stron) | tak – standardowe klauzule umowne (SCC) w umowie powierzenia dostawcy |

Ze wszystkimi powyższymi podmiotami wiążą nas umowy powierzenia przetwarzania (art. 28 RODO). Narzędzia monitoringu błędów i kopie zapasowe bazy prowadzimy na własnej infrastrukturze – nie angażują one dodatkowych podmiotów.

### 5.2 Odrębni administratorzy i współadministrowanie (reklama)
Przy rejestracji domeny dane abonenta (imię i nazwisko lub nazwa, adres, e-mail, telefon) przekazywane są do właściwego **rejestru domen** (np. NASK – domeny `.pl`, EURid – `.eu`), który przetwarza je jako odrębny administrator na podstawie własnych regulaminów. Stripe w zakresie przeciwdziałania oszustwom płatniczym również działa jako odrębny administrator.

**Google Consent Mode v2 w trybie podstawowym.** Na verris.pl i w panelu narzędzia Google (Google Tag Manager i tagi Google) ładują się dopiero po Twojej zgodzie na cookies analityczne lub marketingowe, a Meta Pixel – dopiero po zgodzie marketingowej. Zanim zdecydujesz w banerze cookies, a także po wyborze „Tylko niezbędne”, Twoja przeglądarka nie wysyła do Google ani do Meta żadnych danych. Jeśli zgodzisz się tylko na jedną z tych kategorii, tagi Google działają dla drugiej ze stanem „odmowa”: nie zapisują ani nie odczytują jej plików cookies, dane reklamowe są redagowane, ale tagi mogą wysłać do Google sygnały bez plików cookies (m.in. stan zgody, adres odwiedzanej strony, znacznik czasu, typ przeglądarki oraz – jak przy każdym połączeniu – adres IP), które Google wykorzystuje do statystyk w ujęciu zbiorczym.

Jeżeli wyrazisz zgodę na cookies marketingowe:

- **Meta Platforms Ireland Limited** (Merrion Road, Dublin 4, Irlandia) – w zakresie zbierania i przesyłania danych zdarzeń przez Meta Pixel i przez nasz serwerowy przekaźnik zdarzeń (Conversions API: identyfikatory cookies `_fbp`/`_fbc`, adres IP, informacje o przeglądarce, odwiedzone podstrony, rodzaj zdarzenia, np. wysłanie formularza) działamy z Meta jako **współadministratorzy** (art. 26 RODO); zasady tej współodpowiedzialności określa porozumienie „Controller Addendum" Meta. Dalsze przetwarzanie tych danych na potrzeby systemu reklamowego Meta odbywa się w ramach wyłącznej odpowiedzialności Meta jako odrębnego administratora – szczegóły: `https://www.facebook.com/privacy/policy`.
- **Google Ireland Limited** – w zakresie pomiaru konwersji i remarketingu Google Ads przetwarza dane jako odrębny administrator – szczegóły: `https://policies.google.com/privacy`.

Meta Pixel i przekaźnik zdarzeń Meta działają wyłącznie po Twojej zgodzie marketingowej; wycofanie zgody w „Preferencjach cookies" natychmiast wyłącza dalsze przesyłanie danych reklamowych z plikami cookies.

### 5.3 Organy publiczne
Dane możemy udostępnić uprawnionym organom (sądy, prokuratura, Policja, PUODO, organy podatkowe – w tym Krajowy System e-Faktur Ministerstwa Finansów w zakresie faktur ustrukturyzowanych) wyłącznie na podstawie przepisów prawa.

### 5.4 Doradcy
Biuro rachunkowe oraz doradcy prawni Verris – w zakresie niezbędnym, na podstawie umów zapewniających poufność.

## 6. Przekazywanie danych poza EOG

Dane przechowujemy w Unii Europejskiej. W przypadku dostawców należących do grup spółek z USA (Stripe, AWS, Cloudflare, Google, Meta, OpenAI, Anthropic) transfer wspierający poza EOG jest zabezpieczony **standardowymi klauzulami umownymi** (decyzja 2021/914) wraz ze środkami uzupełniającymi oraz – tam, gdzie dostawca jest certyfikowany – decyzją adekwatności dla **EU-U.S. Data Privacy Framework**. Kopię odpowiednich zabezpieczeń możesz uzyskać, pisząc na `rodo@verris.pl`.

## 7. Twoje prawa

Przysługują Ci prawa: **dostępu** do danych i uzyskania ich kopii (art. 15 – w Panelu, Ustawienia → Prywatność i dane, dostępny automatyczny eksport paczki ZIP), **sprostowania** (art. 16 – większość danych zaktualizujesz w Panelu), **usunięcia** (art. 17), **ograniczenia przetwarzania** (art. 18), **przenoszenia danych** (art. 20 – eksport w formacie ustrukturyzowanym JSON), **sprzeciwu** wobec przetwarzania opartego na uzasadnionym interesie, w tym bezwzględnie skutecznego sprzeciwu wobec marketingu (art. 21), oraz **wycofania zgody** w każdym czasie bez wpływu na zgodność z prawem wcześniejszego przetwarzania. Zgody na wiadomości od Verris zmienisz w Panelu (Ustawienia → Powiadomienia) albo linkiem „Wypisz się” w każdej takiej wiadomości. Jeśli wysyłasz formularze na verris.pl bez konta, swoje prawa wykonasz, pisząc na `rodo@verris.pl`.

Żądanie usunięcia konta możesz wycofać, dopóki konto nie zostanie usunięte: po 14 dniach od żądania, a jeżeli masz opłacone usługi – z końcem najdłuższego opłaconego okresu. Datę usunięcia, saldo portfela, aktywne usługi i domeny pokazujemy przed potwierdzeniem żądania. Po tym terminie dane konta są anonimizowane; zachowujemy to, czego wymagają przepisy (faktury i dokumenty zwrotu – 5 lat), zanonimizowane zapisy księgowe oraz treść zgłoszeń do obsługi i reklamacji do upływu terminów przedawnienia roszczeń. Strony z historią wersji i zdjęcia z Verris Kreatora usuwamy razem z kontem. Konta hostingowe powiązane z usuniętym kontem są trwale usuwane z infrastruktury po wygaśnięciu cyklu kopii zapasowych, nie później niż 180 dni od anonimizacji.

Masz prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa, `https://uodo.gov.pl`).

## 8. Zautomatyzowane decyzje i profilowanie

Nie podejmujemy decyzji opartych wyłącznie na zautomatyzowanym przetwarzaniu, które wywoływałyby wobec Ciebie skutki prawne lub istotnie na Ciebie wpływały (art. 22 RODO). Stosujemy automatyczne mechanizmy bezpieczeństwa (czasowa blokada logowania po serii nieudanych prób, wstrzymanie wysyłki e-mail przy anomaliach wskazujących na spam lub przejęcie konta) – są one tymczasowe, oparte na regułach technicznych, a każdą taką decyzję możesz zakwestionować przez wsparcie (interwencja człowieka).

Za Twoją zgodą na cookies marketingowe narzędzia Google Ads i Meta mogą profilować Twoje zainteresowania na potrzeby doboru reklam (remarketing). Profilowanie to nie wywołuje skutków prawnych i możesz je w każdej chwili wyłączyć, wycofując zgodę w „Preferencjach cookies".

Jeżeli wyrazisz zgodę na cookies marketingowe, w ramach pomiaru skuteczności reklam Meta stosujemy również **zaawansowane dopasowywanie** (advanced matching): dane kontaktowe wpisywane w formularzach serwisu (np. adres e-mail, numer telefonu) mogą być przekazywane do Meta Platforms Ireland Ltd. wyłącznie w postaci **skrótu (SHA-256)** – Meta nie otrzymuje ich w postaci jawnej i wykorzystuje je do dopasowania zdarzeń do kont reklamowych oraz pomiaru konwersji. Przekazanie następuje tylko przy aktywnej zgodzie marketingowej; jej wycofanie w „Preferencjach cookies" natychmiast je wyłącza. Podstawą prawną jest Twoja zgoda (art. 6 ust. 1 lit. a RODO).

Asystent AI i Verris Kreator niczego za Ciebie nie rozstrzygają – treści stron proponowane przez AI publikujesz Ty, po ich sprawdzeniu. Asystent AI odpowiada na pytania i przygotowuje prognozy, a szkice odpowiedzi dla naszych pracowników zawsze sprawdza i wysyła człowiek.

## 9. Bezpieczeństwo danych

Stosujemy m.in.: szyfrowanie transmisji (TLS, HSTS), szyfrowanie danych wrażliwych w spoczynku (AES-256-GCM z rotacją kluczy), haszowanie haseł (bcrypt), uwierzytelnianie dwuskładnikowe i passkeys (wymagane dla personelu Verris), kontrolę dostępu opartą na rolach z zasadą minimalnych uprawnień, rejestrowanie każdego dostępu personelu do danych klienta w dzienniku zmian (dostęp serwisowy do konta jest limitowany czasowo i uzasadniany), izolację kont hostingowych i limity zasobów każdego konta, zaporę aplikacyjną WAF, dostęp do paneli administracyjnych wyłącznie przez VPN, szyfrowane kopie zapasowe przechowywane poza podstawową lokalizacją wraz z testami odtwarzania, całodobowy monitoring oraz procedurę reagowania na incydenty.

## 10. Naruszenia ochrony danych

Naruszenia oceniamy i dokumentujemy zgodnie z wewnętrzną procedurą. Jeżeli naruszenie może powodować ryzyko naruszenia Twoich praw lub wolności, zgłaszamy je PUODO w ciągu 72 godzin od stwierdzenia; jeżeli ryzyko jest wysokie – zawiadamiamy również Ciebie bez zbędnej zwłoki.

## 11. Pliki cookies

Zasady używania plików cookies i podobnych technologii (w tym Google Consent Mode w trybie podstawowym) określa odrębna Polityka cookies: `https://panel.verris.pl/legal/cookies`.

## 12. Zmiany Polityki

O każdej zmianie Polityki informujemy w Panelu i e-mailem; istotne zmiany wymagają ponownego potwierdzenia zapoznania się przy kolejnym logowaniu. Archiwum wersji jest dostępne w Panelu.

---

**Wersja 1.3.0 – data publikacji i wejścia w życie: [DATA PUBLIKACJI]**
