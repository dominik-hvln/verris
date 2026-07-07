# Polityka prywatności Verris

**Wersja 1.0.0 · obowiązuje od 7 lipca 2026 r.**

Niniejsza Polityka realizuje obowiązki informacyjne z art. 13 i 14 RODO wobec klientów Verris, użytkowników subkont oraz osób odwiedzających panel i strony Verris.

## 1. Administrator danych

Administratorem Twoich danych osobowych jest **HVLN Dominik Kowalski** z siedzibą pod adresem Zacisze 2A, 65-775 Zielona Góra, wpisany do Centralnej Ewidencji i Informacji o Działalności Gospodarczej, NIP 9292069367, REGON 521024260.

Kontakt: e-mail `kontakt@verris.pl`, telefon +48 511 589 465. We wszystkich sprawach dotyczących danych osobowych: **`rodo@verris.pl`**. Na żądania dotyczące Twoich praw odpowiadamy bez zbędnej zwłoki, najpóźniej w ciągu miesiąca.

## 2. Jakie dane przetwarzamy

### 2.1 Dane konta
Adres e-mail, hasło (wyłącznie w postaci hasha bcrypt), imię i nazwisko, opcjonalnie numer telefonu, preferencje językowe, dane uwierzytelniania dwuskładnikowego (sekret TOTP szyfrowany AES-256-GCM, kody zapasowe w postaci hashy, klucze passkey).

### 2.2 Dane rozliczeniowe
Dane do faktur (nazwa, adres, NIP przy fakturach na działalność), saldo Portfela i historia transakcji, numery i treść faktur, identyfikator klienta u operatora płatności Stripe oraz identyfikatory zapisanych metod płatności — pełny numer karty zna wyłącznie Stripe; my widzimy tylko cztery ostatnie cyfry i typ karty.

### 2.3 Dane techniczne i bezpieczeństwa
Adres IP, przeglądarka (User-Agent) i znaczniki czasu logowań, dziennik audytu operacji na koncie, alerty bezpieczeństwa, logi doręczeń e-mail, dane sesji (token w cookie httpOnly).

### 2.4 Dane usług
Nazwa konta DirectAdmin, podłączone domeny i konfiguracja DNS, nazwy baz danych i kont e-mail, zagregowane metryki zużycia zasobów (CPU, RAM, dysk), parametry serwerów VPS, dane abonenta rejestrowanych domen. **Nie analizujemy treści** Twoich stron, plików, wiadomości ani baz danych — w tym zakresie działamy wyłącznie jako podmiot przetwarzający na Twoje polecenie (zob. pkt 3 i DPA).

### 2.5 Dane wsparcia i komunikacji
Treść zgłoszeń (ticketów) z załącznikami, korespondencja e-mail, preferencje powiadomień, zgody marketingowe wraz z historią ich wyrażenia i wycofania (wersja dokumentu, data, IP).

### 2.6 Subkonta (IAM)
Adres e-mail i imię użytkownika subkonta, nadane role i uprawnienia, logi zaproszeń, akceptacji i operacji. Dane te otrzymujemy od właściciela konta, który zaprasza subkonto (art. 14 RODO — źródłem danych jest właściciel konta).

## 3. Dwie role Verris

W zakresie danych opisanych w pkt 2 Verris jest **administratorem**. W zakresie danych, które przechowujesz lub przetwarzasz w ramach swoich usług (pliki i bazy Twoich serwisów, skrzynki Twoich użytkowników, listy odbiorców kampanii e-mail, dane na Twoim VPS), administratorem jesteś **Ty**, a Verris działa jako **podmiot przetwarzający** na podstawie Umowy powierzenia przetwarzania danych (DPA) dostępnej w Panelu.

## 4. Cele, podstawy prawne i okresy przetwarzania

| Cel | Podstawa (art. 6 RODO) | Okres |
| --- | --- | --- |
| Zawarcie i wykonanie umowy: konto, świadczenie usług, rozliczenia, wsparcie | ust. 1 lit. b | czas trwania umowy; po usunięciu konta 14 dni okresu przywracania, następnie anonimizacja |
| Wystawianie i przechowywanie faktur, rozliczenia podatkowe (w tym KSeF) | ust. 1 lit. c (ustawa o VAT, Ordynacja podatkowa) | 5 lat od końca roku podatkowego |
| Bezpieczeństwo usług: logi logowań, audyt, wykrywanie nadużyć, anty-bot | ust. 1 lit. f — uzasadniony interes Verris i klientów | logi logowań 180 dni; adresy IP i User-Agent w dzienniku audytu anonimizowane po 24 miesiącach; zapisy zdarzeń płatniczych (deduplikacja) 90 dni |
| Komunikacja transakcyjna (potwierdzenia, powiadomienia o usługach i płatnościach) | ust. 1 lit. b | logi doręczeń 12 miesięcy |
| Rozpatrywanie zgłoszeń DSA (abuse) i decyzji moderacyjnych | ust. 1 lit. c (DSA) oraz lit. f | czas postępowania + okres przedawnienia roszczeń |
| Marketing własny (newsletter, informacje o nowościach) | ust. 1 lit. a — zgoda | do wycofania zgody |
| Statystyki korzystania z serwisu (Google Analytics 4, tagi przez Google Tag Manager) | ust. 1 lit. a — zgoda wyrażona w banerze cookies | dane zdarzeń w GA4 do 14 miesięcy; cookies wg Polityki cookies |
| Pomiar skuteczności i dopasowanie reklam (Google Ads, Meta Pixel), w tym remarketing | ust. 1 lit. a — zgoda wyrażona w banerze cookies | do wycofania zgody; cookies wg Polityki cookies |
| Obrona i dochodzenie roszczeń, obsługa reklamacji | ust. 1 lit. f | do upływu terminów przedawnienia (co do zasady 6 lat, art. 118 KC) |
| Wykonywanie obowiązków z RODO (rejestr zgód, obsługa żądań) | ust. 1 lit. c | historia zgód i żądań przez czas konta + okres przedawnienia |

Podanie danych oznaczonych w formularzach jako wymagane jest warunkiem zawarcia umowy; podanie pozostałych danych jest dobrowolne.

## 5. Odbiorcy danych

### 5.1 Podmioty przetwarzające na zlecenie Verris (subprocesorzy)

| Podmiot | Siedziba / lokalizacja danych | Cel | Transfer poza EOG |
| --- | --- | --- | --- |
| **Hetzner Online GmbH** | Niemcy; centra danych Niemcy/Finlandia (EOG) | infrastruktura serwerowa: control-plane (API, panele, baza danych), węzły hostingowe, serwery VPS (Hetzner Cloud), kopie zapasowe off-site (Storage Box / Object Storage, zaszyfrowane przed wysyłką) | nie |
| **Stripe Payments Europe, Ltd.** | Irlandia (EOG) | obsługa płatności: karty, Apple Pay, Google Pay, BLIK/Przelewy24 | możliwy transfer wspierający do Stripe, Inc. (USA) — standardowe klauzule umowne (SCC) i certyfikacja Data Privacy Framework |
| **Amazon Web Services EMEA SARL** | Luksemburg; region usługi: UE (Frankfurt/Irlandia) | wysyłka wiadomości e-mail (Amazon SES): powiadomienia transakcyjne i kampanie e-mail marketingu | dane w regionie UE; możliwy dostęp wspierający z USA — SCC i Data Privacy Framework |
| **Cloudflare, Inc.** | USA; punkty obecności w EOG | ochrona formularzy rejestracji i logowania przed botami (Cloudflare Turnstile) | tak — SCC i Data Privacy Framework |
| **Hosting Concepts B.V. (Openprovider)** | Holandia (EOG) | rejestracja, odnawianie i transfer domen | zależnie od rejestru domeny (pkt 5.2) |
| **Google Ireland Limited** | Irlandia (EOG) | pomiar korzystania z serwisu (Google Analytics 4) i zarządzanie tagami (Google Tag Manager) — wyłącznie po Twojej zgodzie | możliwy transfer do Google LLC (USA) — SCC i Data Privacy Framework |

Ze wszystkimi powyższymi podmiotami wiążą nas umowy powierzenia przetwarzania (art. 28 RODO). Narzędzia monitoringu błędów i kopie zapasowe bazy prowadzimy na własnej infrastrukturze (self-hosted) — nie angażują one dodatkowych podmiotów.

### 5.2 Odrębni administratorzy i współadministrowanie (reklama)
Przy rejestracji domeny dane abonenta (imię i nazwisko lub nazwa, adres, e-mail, telefon) przekazywane są do właściwego **rejestru domen** (np. NASK — domeny `.pl`, EURid — `.eu`), który przetwarza je jako odrębny administrator na podstawie własnych regulaminów. Stripe w zakresie przeciwdziałania oszustwom płatniczym również działa jako odrębny administrator.

Jeżeli wyrazisz zgodę na cookies marketingowe:

- **Meta Platforms Ireland Limited** (Merrion Road, Dublin 4, Irlandia) — w zakresie zbierania i przesyłania danych zdarzeń przez Meta Pixel (identyfikatory cookies, adres IP, informacje o przeglądarce, odwiedzone podstrony) działamy z Meta jako **współadministratorzy** (art. 26 RODO); zasady tej współodpowiedzialności określa porozumienie „Controller Addendum" Meta. Dalsze przetwarzanie tych danych na potrzeby systemu reklamowego Meta odbywa się w ramach wyłącznej odpowiedzialności Meta jako odrębnego administratora — szczegóły: `https://www.facebook.com/privacy/policy`.
- **Google Ireland Limited** — w zakresie pomiaru konwersji i remarketingu Google Ads przetwarza dane jako odrębny administrator — szczegóły: `https://policies.google.com/privacy`.

Wobec obu narzędzi obowiązuje stan domyślny „denied" (Google Consent Mode v2): żadne dane reklamowe nie są zbierane ani przesyłane przed Twoją zgodą, a jej wycofanie w „Preferencjach cookies" natychmiast wyłącza dalsze przesyłanie.

### 5.3 Organy publiczne
Dane możemy udostępnić uprawnionym organom (sądy, prokuratura, Policja, PUODO, organy podatkowe — w tym Krajowy System e-Faktur Ministerstwa Finansów w zakresie faktur ustrukturyzowanych) wyłącznie na podstawie przepisów prawa.

### 5.4 Doradcy
Biuro rachunkowe oraz doradcy prawni Verris — w zakresie niezbędnym, na podstawie umów zapewniających poufność.

## 6. Przekazywanie danych poza EOG

Dane przechowujemy w EOG. W przypadku dostawców należących do grup spółek z USA (Stripe, AWS, Cloudflare, Google, Meta) transfer wspierający poza EOG jest zabezpieczony **standardowymi klauzulami umownymi** (decyzja 2021/914) wraz ze środkami uzupełniającymi oraz — tam, gdzie dostawca jest certyfikowany — decyzją adekwatności dla **EU-U.S. Data Privacy Framework**. Kopię odpowiednich zabezpieczeń możesz uzyskać, pisząc na `rodo@verris.pl`.

## 7. Twoje prawa

Przysługują Ci prawa: **dostępu** do danych i uzyskania ich kopii (art. 15 — w Panelu, sekcja Prywatność i RODO, dostępny automatyczny eksport paczki ZIP), **sprostowania** (art. 16 — większość danych zaktualizujesz w Panelu), **usunięcia** (art. 17), **ograniczenia przetwarzania** (art. 18), **przenoszenia danych** (art. 20 — eksport w formacie ustrukturyzowanym JSON), **sprzeciwu** wobec przetwarzania opartego na uzasadnionym interesie, w tym bezwzględnie skutecznego sprzeciwu wobec marketingu (art. 21), oraz **wycofania zgody** w każdym czasie bez wpływu na zgodność z prawem wcześniejszego przetwarzania.

Usunięcie konta uruchamia 14-dniowy okres przywracania (konto zawieszone), po którym dane są anonimizowane; zachowujemy wyłącznie to, czego wymagają przepisy (faktury — 5 lat) oraz zanonimizowane zapisy księgowe. Konta hostingowe powiązane z usuniętym kontem są trwale usuwane z infrastruktury po wygaśnięciu cyklu kopii zapasowych, nie później niż 180 dni od anonimizacji.

Masz prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa, `https://uodo.gov.pl`).

## 8. Zautomatyzowane decyzje i profilowanie

Nie podejmujemy decyzji opartych wyłącznie na zautomatyzowanym przetwarzaniu, które wywoływałyby wobec Ciebie skutki prawne lub istotnie na Ciebie wpływały (art. 22 RODO). Stosujemy automatyczne mechanizmy bezpieczeństwa (czasowa blokada logowania po serii nieudanych prób, wstrzymanie wysyłki e-mail przy anomaliach wskazujących na spam lub przejęcie konta) — są one tymczasowe, oparte na regułach technicznych, a każdą taką decyzję możesz zakwestionować przez wsparcie (interwencja człowieka).

Za Twoją zgodą na cookies marketingowe narzędzia Google Ads i Meta mogą profilować Twoje zainteresowania na potrzeby doboru reklam (remarketing). Profilowanie to nie wywołuje skutków prawnych i możesz je w każdej chwili wyłączyć, wycofując zgodę w „Preferencjach cookies".

## 9. Bezpieczeństwo danych

Stosujemy m.in.: szyfrowanie transmisji (TLS, HSTS), szyfrowanie danych wrażliwych w spoczynku (AES-256-GCM z rotacją kluczy), hashowanie haseł (bcrypt), uwierzytelnianie dwuskładnikowe i passkeys (wymagane dla personelu Verris), kontrolę dostępu opartą na rolach z zasadą minimalnych uprawnień, rejestrowanie każdego dostępu personelu do danych klienta w dzienniku audytu (dostęp serwisowy do konta jest limitowany czasowo i uzasadniany), izolację kont hostingowych (CloudLinux CageFS/LVE), zaporę aplikacyjną WAF, dostęp do paneli administracyjnych wyłącznie przez VPN, szyfrowane kopie zapasowe przechowywane poza podstawową lokalizacją wraz z testami odtwarzania, całodobowy monitoring oraz procedurę reagowania na incydenty.

## 10. Naruszenia ochrony danych

Naruszenia oceniamy i dokumentujemy zgodnie z wewnętrzną procedurą. Jeżeli naruszenie może powodować ryzyko naruszenia Twoich praw lub wolności, zgłaszamy je PUODO w ciągu 72 godzin od stwierdzenia; jeżeli ryzyko jest wysokie — zawiadamiamy również Ciebie bez zbędnej zwłoki.

## 11. Pliki cookies

Zasady używania plików cookies i podobnych technologii określa odrębna Polityka cookies: `https://panel.verris.pl/legal/cookies`.

## 12. Zmiany Polityki

O każdej zmianie Polityki informujemy w Panelu i e-mailem; istotne zmiany wymagają ponownego potwierdzenia zapoznania się przy kolejnym logowaniu. Archiwum wersji jest dostępne w Panelu.

---

**Wersja 1.0.0 — data publikacji: 7 lipca 2026 r.**
