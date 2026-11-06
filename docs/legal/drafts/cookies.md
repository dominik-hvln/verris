# Polityka plików cookies Verris

**Wersja 1.2.1 · obowiązuje od [DATA PUBLIKACJI]**

Niniejsza Polityka realizuje obowiązki wynikające z art. 399–402 ustawy z dnia 12 lipca 2024 r. – Prawo komunikacji elektronicznej (PKE) oraz dyrektywy 2002/58/WE (ePrivacy). Dotyczy strony `verris.pl` i panelu klienta `panel.verris.pl`.

## 1. Czym są cookies

Pliki cookies to niewielkie pliki tekstowe zapisywane przez przeglądarkę na Twoim urządzeniu. Podobnie działają technologie pokrewne – pamięć przeglądarki (`localStorage`, `sessionStorage`) i skrypty, które wysyłają informacje z przeglądarki do serwera. Na potrzeby tej Polityki obejmujemy je wspólną nazwą „cookies". Cookies pozwalają utrzymać sesję logowania, zapamiętać Twoje ustawienia i chronić panel przed nadużyciami.

## 2. Cookies niezbędne i ustawienia, o które prosisz (bez zgody)

Przechowywanie tych informacji jest konieczne do świadczenia usługi, której wyraźnie żądasz (logowanie, bezpieczeństwo sesji, zapamiętanie Twojej decyzji co do cookies i wybranych przez Ciebie ustawień) – zgodnie z art. 399 ust. 3 PKE nie wymaga ono zgody.

### 2.1 Pliki cookies

| Nazwa | Gdzie | Cel | Czas życia |
| --- | --- | --- | --- |
| `auth_token` | panel | token sesji logowania (httpOnly, Secure, SameSite) | do 24 h (wylogowanie usuwa go od razu) |
| `impersonation_operator` | panel | oznaczenie sesji serwisowej, gdy pracownik obsługi Verris pracuje na Twoim koncie (httpOnly) | 30 minut, tylko w czasie takiej sesji |
| `cookies_consent` | verris.pl i panel (domena `.verris.pl`) | zapis Twojej decyzji w banerze cookies i jej daty | 12 miesięcy |
| `verris_cel` | panel | strona panelu, do której prowadził przycisk na verris.pl (np. zamówienie poczty) – żeby po rejestracji i pierwszym logowaniu trafić od razu tam (httpOnly, jednorazowe) | do 7 dni albo do pierwszego logowania |

### 2.2 Pamięć przeglądarki

| Nazwa | Gdzie | Cel | Czas przechowywania |
| --- | --- | --- | --- |
| `verris-theme` | panel | wybrany tryb jasny albo ciemny | do usunięcia w przeglądarce |
| `verris-simple-mode` | panel | widok uproszczony albo pełny | do usunięcia w przeglądarce |
| `verris_client_last_activity` | panel | czas ostatniej aktywności – automatyczne wylogowanie po bezczynności (bezpieczeństwo) | do usunięcia w przeglądarce |
| `verris.dismissed-incidents`, `verris.dismissed-announcements` | panel | zamknięte przez Ciebie komunikaty – żeby nie pokazywać ich ponownie | do usunięcia w przeglądarce |
| `verris_onboarding_dismissed_v1` | panel | ukryty przewodnik pierwszych kroków | do usunięcia w przeglądarce |
| `verris-hint:…` | panel | ukryte podpowiedzi przy usłudze | do usunięcia w przeglądarce |
| `verris.zglos-uwage.schowany` | panel | schowany przycisk „Zgłoś uwagę” (testy) | do usunięcia w przeglądarce |
| `verris-zakup-wyslany:…` | panel (`sessionStorage`) | znacznik, że zakup po powrocie z płatności został już obsłużony – żeby nie zapisać go drugi raz | do zamknięcia karty |
| `verris:asystent` | verris.pl (`sessionStorage`) | identyfikator rozmowy z asystentem AI | do zamknięcia karty |
| `verris:mobilny-pasek-ukryty` | verris.pl (`sessionStorage`) | ukryty dolny pasek na telefonie | do zamknięcia karty |

Ustawienia z tabeli 2.2 zostają wyłącznie w Twojej przeglądarce – nie wysyłamy ich do Verris ani nikomu innemu.

### 2.3 Usługi zewnętrzne niezbędne do działania

- **Stripe** – przy podawaniu danych płatniczych komponent Stripe ustawia własne cookies (m.in. `__stripe_mid`, `__stripe_sid`) niezbędne do realizacji płatności i zapobiegania oszustwom. Szczegóły: `https://stripe.com/privacy`.
- **Cloudflare Turnstile** – mechanizm chroniący przed botami rejestrację i logowanie w panelu oraz formularze na verris.pl; w ramach weryfikacji Cloudflare może zapisać na urządzeniu informacje niezbędne do potwierdzenia, że nie jesteś botem. Te operacje są niezbędne do bezpiecznego świadczenia usługi, której żądasz (art. 399 ust. 3 PKE). Szczegóły: `https://www.cloudflare.com/privacypolicy/`.
- **Paynow (mBank S.A.)** – po przejściu do bramki płatności obowiązują zasady cookies operatora płatności.

## 3. Cookies opcjonalne (tylko za zgodą)

### 3.1 Funkcjonalne

Ta kategoria w banerze to zgoda dla narzędzi Google (sygnały `functionality_storage` i `personalization_storage` w Google Consent Mode) na zapisywanie informacji o ustawieniach i personalizacji. Ma znaczenie tylko razem ze zgodą na cookies analityczne lub marketingowe – bez niej narzędzia Google się nie ładują (pkt 4). Verris nie używa własnych cookies funkcjonalnych – Twoje ustawienia w panelu (tabela 2.2) działają niezależnie od tej zgody.

### 3.2 Analityczne

Służą do pomiaru korzystania z serwisu. Pliki cookies analityczne zapisujemy wyłącznie po Twojej zgodzie.

| Nazwa | Dostawca / cel | Czas życia |
| --- | --- | --- |
| `_ga` | Google Analytics 4 – rozróżnianie użytkowników | 24 miesiące |
| `_ga_<identyfikator>` | Google Analytics 4 – utrzymanie stanu sesji | 24 miesiące |

Narzędzia analityczne i tagi zarządzane są przez Google Tag Manager, który ładuje się dopiero po zgodzie (pkt 4) i sam nie zapisuje własnych cookies śledzących.

### 3.3 Marketingowe

Służą do pomiaru skuteczności reklam i ich dopasowania. Pliki cookies marketingowe zapisujemy wyłącznie po Twojej zgodzie; skrypt Meta Pixel i nasz przekaźnik zdarzeń do Meta są w ogóle uruchamiane dopiero po jej wyrażeniu.

| Nazwa | Dostawca / cel | Czas życia |
| --- | --- | --- |
| `_gcl_au` | Google Ads – pomiar konwersji | 3 miesiące |
| `_fbp` | Meta Pixel – rozróżnianie przeglądarek na potrzeby reklam Meta | 3 miesiące |
| `_fbc` | Meta Pixel – atrybucja kliknięć reklam Meta (ustawiane przy wejściu z reklamy) | 3 miesiące |

Szczegóły przetwarzania danych przez Google i Meta oraz zasady transferu danych do USA opisuje Polityka prywatności (pkt 5 i 6).

## 4. Google Consent Mode v2 – tryb podstawowy

Na verris.pl i w panelu używamy Google Consent Mode v2 w **trybie podstawowym**. Oznacza to, że:

1. Zanim podejmiesz decyzję w banerze – i gdy wybierzesz „Tylko niezbędne" – **nie ładujemy** Menedżera tagów Google (Google Tag Manager), tagów Google ani Meta Pixel. Twoja przeglądarka nie wysyła wtedy do Google ani do Meta żadnych danych, także sygnałów bez plików cookies.
2. Narzędzia Google ładujemy dopiero po Twojej zgodzie na cookies analityczne lub marketingowe, a Meta Pixel – dopiero po zgodzie marketingowej. Zanim się załadują, przekazujemy im stan Twoich zgód: kategorie bez zgody mają stan „odmowa" (`denied`).
3. Jeśli zgodzisz się tylko na jedną z kategorii (analityczne albo marketingowe), tagi Google drugiej kategorii działają ze stanem „odmowa": nie zapisują ani nie odczytują jej plików cookies, a przy braku zgody reklamowej identyfikatory reklamowe są usuwane z sygnałów (`ads_data_redaction`). Mogą jednak wysłać do Google sygnały bez plików cookies (np. stan zgody, adres strony, znacznik czasu, typ przeglądarki i – jak przy każdym połączeniu z serwerem – adres IP), które Google wykorzystuje do statystyk w ujęciu zbiorczym.
4. Gdy wycofasz zgodę, od razu przekazujemy tagom stan „odmowa" i pliki cookies opcjonalne przestają być zapisywane; Meta Pixel otrzymuje wycofanie zgody. Od następnego wejścia na stronę narzędzia Google i Meta w ogóle się nie ładują.

Opis trybów Consent Mode w dokumentacji Google: `https://developers.google.com/tag-platform/security/guides/consent`.

## 5. Zgoda

1. Przy pierwszej wizycie wyświetlamy okno z opcjami: **„Akceptuj wszystkie"**, **„Tylko niezbędne"** oraz **„Personalizuj"** (wybór per kategoria). Obie pierwsze opcje są równie łatwo dostępne – odmowa nie wymaga więcej kliknięć niż akceptacja.
2. Zgoda spełnia wymogi RODO (art. 402 PKE): jest dobrowolna, konkretna, świadoma i jednoznaczna. Możesz ją w każdej chwili zmienić lub wycofać – służy do tego stały przycisk „Preferencje cookies" w lewym dolnym rogu każdej strony oraz link w stopce; wycofanie jest równie łatwe jak wyrażenie.
3. Twoją decyzję przechowujemy 12 miesięcy, po czym zapytamy ponownie. Decyzja podjęta na verris.pl obowiązuje też w panelu i odwrotnie (wspólny plik `cookies_consent` w domenie `.verris.pl`).
4. Odmowa zgody na cookies opcjonalne nie ogranicza dostępu do usług Verris.

## 6. Zarządzanie cookies w przeglądarce

Cookies i pamięć przeglądarki możesz usuwać i blokować w ustawieniach przeglądarki (Chrome, Firefox, Safari, Edge – sekcje „Prywatność"/„Pliki cookie"/„Dane witryn"). Zablokowanie pliku `auth_token` uniemożliwi zalogowanie do panelu, a usunięcie pamięci przeglądarki przywróci domyślne ustawienia panelu.

## 7. Zmiany Polityki

Aktualizacje publikujemy w panelu i komunikujemy e-mailem. Wprowadzenie nowej kategorii cookies wymagającej zgody poprzedzimy ponownym zapytaniem o zgodę.

---

**Wersja 1.2.1 – data publikacji i wejścia w życie: [DATA PUBLIKACJI]**
