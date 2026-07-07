# Polityka plików cookies Verris

**Wersja 1.0.0 · obowiązuje od 7 lipca 2026 r.**

Niniejsza Polityka realizuje obowiązki wynikające z art. 399–402 ustawy z dnia 12 lipca 2024 r. — Prawo komunikacji elektronicznej (PKE) oraz dyrektywy 2002/58/WE (ePrivacy).

## 1. Czym są cookies

Pliki cookies to niewielkie pliki tekstowe zapisywane przez przeglądarkę na Twoim urządzeniu. Podobnie działają technologie pokrewne (`localStorage`, `sessionStorage`), które na potrzeby tej Polityki obejmujemy wspólną nazwą „cookies". Cookies pozwalają utrzymać sesję logowania, zapamiętać preferencje i chronić panel przed nadużyciami.

## 2. Kategorie cookies używane przez Verris

### 2.1 Cookies niezbędne (nie wymagają zgody)

Przechowywanie tych informacji jest konieczne do świadczenia usługi, której wyraźnie żądasz (logowanie, bezpieczeństwo sesji, zapamiętanie Twojej decyzji co do cookies) — zgodnie z art. 399 ust. 3 PKE nie wymaga ono zgody.

| Nazwa | Cel | Czas życia |
| --- | --- | --- |
| `auth_token` | token sesji (httpOnly, Secure, SameSite) | do 24 h |
| `refresh_token` | odświeżanie sesji (httpOnly, Secure) | 30 dni |
| `csrf_token` | ochrona przed atakami CSRF | sesja przeglądarki |
| `panel-locale` | wybrany język panelu | 12 miesięcy |
| `panel-theme` | tryb ciemny/jasny | 12 miesięcy |
| `cookies_consent` | zapis Twoich preferencji cookies | 12 miesięcy |

### 2.2 Cookies funkcjonalne (za zgodą)

Zapamiętują udogodnienia, które nie są niezbędne do działania usługi. Aktywują się wyłącznie po wyrażeniu zgody.

| Nazwa | Cel | Czas życia |
| --- | --- | --- |
| `dashboard-layout` | układ widgetów na pulpicie | 6 miesięcy |
| `support-draft` | robocza wersja zgłoszenia wsparcia | 7 dni |

### 2.3 Cookies analityczne (za zgodą)

Służą do pomiaru korzystania z serwisu. Uruchamiają się wyłącznie po Twojej zgodzie — do tego czasu wszystkie sygnały pomiarowe pozostają wyłączone (Google Consent Mode v2, stan domyślny „denied").

| Nazwa | Dostawca / cel | Czas życia |
| --- | --- | --- |
| `_ga` | Google Analytics 4 — rozróżnianie użytkowników | 24 miesiące |
| `_ga_<identyfikator>` | Google Analytics 4 — utrzymanie stanu sesji | 24 miesiące |

Narzędzia analityczne i tagi zarządzane są przez Google Tag Manager, który sam nie zapisuje własnych cookies śledzących.

### 2.3a Cookies marketingowe (za zgodą)

Służą do pomiaru skuteczności reklam i ich dopasowania. Uruchamiają się wyłącznie po Twojej zgodzie; skrypt Meta Pixel jest w ogóle ładowany dopiero po jej wyrażeniu.

| Nazwa | Dostawca / cel | Czas życia |
| --- | --- | --- |
| `_gcl_au` | Google Ads — pomiar konwersji | 3 miesiące |
| `_fbp` | Meta Pixel — rozróżnianie przeglądarek na potrzeby reklam Meta | 3 miesiące |
| `_fbc` | Meta Pixel — atrybucja kliknięć reklam Meta (ustawiane przy wejściu z reklamy) | 3 miesiące |

Szczegóły przetwarzania danych przez Google i Meta oraz zasady transferu danych do USA opisuje Polityka prywatności (pkt 5 i 6).

### 2.4 Cookies podmiotów trzecich

- **Stripe** — przy podawaniu danych płatniczych komponent Stripe ustawia własne cookies (m.in. `__stripe_mid`, `__stripe_sid`) niezbędne do realizacji płatności i zapobiegania oszustwom. Szczegóły: `https://stripe.com/privacy`.
- **Cloudflare Turnstile** — mechanizm chroniący formularze rejestracji i logowania przed botami; w ramach weryfikacji Cloudflare może zapisać na urządzeniu informacje niezbędne do potwierdzenia, że nie jesteś botem. Te operacje są niezbędne do bezpiecznego świadczenia usługi, której żądasz (art. 399 ust. 3 PKE). Szczegóły: `https://www.cloudflare.com/privacypolicy/`.

## 3. Zgoda

1. Przy pierwszej wizycie wyświetlamy okno z opcjami: **„Akceptuj wszystkie"**, **„Tylko niezbędne"** oraz **„Personalizuj"** (wybór per kategoria). Obie pierwsze opcje są równie łatwo dostępne — odmowa nie wymaga więcej kliknięć niż akceptacja.
2. Zgoda spełnia wymogi RODO (art. 402 PKE): jest dobrowolna, konkretna, świadoma i jednoznaczna. Możesz ją w każdej chwili wycofać w stopce panelu („Preferencje cookies") — wycofanie jest równie łatwe jak wyrażenie.
3. Twoją decyzję przechowujemy 12 miesięcy, po czym zapytamy ponownie.
4. Odmowa zgody na cookies opcjonalne nie ogranicza dostępu do usług Verris.

## 4. Zarządzanie cookies w przeglądarce

Cookies możesz usuwać i blokować w ustawieniach przeglądarki (Chrome, Firefox, Safari, Edge — sekcje „Prywatność"/„Pliki cookie"). Zablokowanie cookies niezbędnych (`auth_token`, `csrf_token`) uniemożliwi zalogowanie do panelu.

## 5. Zmiany Polityki

Aktualizacje publikujemy w panelu i komunikujemy e-mailem. Wprowadzenie nowej kategorii cookies wymagającej zgody poprzedzimy ponownym zapytaniem o zgodę.

---

**Wersja 1.0.0 — data publikacji: 7 lipca 2026 r.**
