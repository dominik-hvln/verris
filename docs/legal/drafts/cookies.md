# Polityka plików cookies Verris

> **DRAFT — wymaga lawyer review.** Spełnia obowiązek z art. 173 ustawy Prawo telekomunikacyjne (PTel) oraz dyrektywy ePrivacy 2002/58/WE.

## 1. Czym są cookies

Pliki cookies to małe pliki tekstowe zapisywane przez Twoją przeglądarkę na urządzeniu, gdy odwiedzasz stronę internetową. Pozwalają stronie zapamiętać Twoje preferencje, sesję logowania, ustawienia. Verris używa również podobnych technologii (`localStorage`, `sessionStorage`, identyfikatorów w nagłówkach HTTP), które zbiorczo określamy jako „cookies" w niniejszej Polityce.

## 2. Kategorie cookies, których używamy

### 2.1 Cookies niezbędne (zawsze aktywne)

Bez tych plików Verris nie zadziała poprawnie. Nie wymagamy zgody, bo opierają się na uzasadnionym interesie umożliwienia świadczenia usługi (art. 173 ust. 3 pkt 2 PTel).

| Nazwa | Cel | Czas życia |
| --- | --- | --- |
| `auth_token` | Token sesji JWT (httpOnly, Secure, SameSite=Strict) | 1h od ostatniej aktywności, max 24h |
| `refresh_token` | Token odświeżania sesji (httpOnly, Secure) | 30 dni |
| `csrf_token` | Ochrona przed atakami CSRF | sesja przeglądarki |
| `panel-locale` | Wybrany język panelu (pl/en) | 1 rok |
| `panel-theme` | Tryb ciemny/jasny | 1 rok |
| `cookies_consent` | Zapis Twoich preferencji cookies | 1 rok |

### 2.2 Cookies funkcjonalne (opcjonalne)

Pomagają nam pamiętać Twoje preferencje. Aktywują się dopiero po Twojej zgodzie.

| Nazwa | Cel | Czas życia |
| --- | --- | --- |
| `dashboard-layout` | Twoje ulubione widgety na pulpicie | 6 miesięcy |
| `support-draft` | Robocza wersja zgłoszenia w supporcie | 7 dni |

### 2.3 Cookies analityczne (opcjonalne)

`<TODO: określ przed lawyer review które rozwiązanie wybieramy>`

**Opcja A — Plausible Analytics (zalecane):** cookieless analytics, **nie wymaga zgody**, bo nie używa plików cookies ani identyfikatorów osobistych. Statystyki są agregowane (countries, popular pages, referrers) bez śledzenia użytkowników. W tej opcji ta sekcja jest niepotrzebna.

**Opcja B — Google Analytics 4 / Hotjar:** wymaga zgody i pełnego cookie banner z opt-in:

| Nazwa | Cel | Czas życia |
| --- | --- | --- |
| `_ga` | Identyfikator użytkownika GA4 | 2 lata |
| `_ga_<container>` | Stan kontenera GA4 | 2 lata |
| `_hjSessionUser_*` | Identyfikator Hotjar | 1 rok |

### 2.4 Cookies third-party (uzależnione od użytych funkcji)

- **Stripe:** kiedy podajesz dane karty w panelu, Stripe ustawia cookies (m.in. `__stripe_mid`, `__stripe_sid`) niezbędne do działania Stripe Elements i ochrony przed fraudami. Te cookies są zarządzane przez Stripe — szczegóły w [Polityce prywatności Stripe](https://stripe.com/privacy).
- **Cloudflare / CDN:** jeśli korzystamy z CDN, używa cookie `__cf_bm` do detekcji botów (1h life).

## 3. Jak zarządzać cookies

### 3.1 W panelu Verris

W stopce każdej strony znajdziesz link „Preferencje cookies", który otwiera modal z włącznikami dla każdej kategorii (poza niezbędnymi). Możesz w każdej chwili zmienić swoje wybory.

### 3.2 W przeglądarce

Możesz całkowicie zablokować lub usunąć cookies w ustawieniach swojej przeglądarki:

- **Chrome:** Ustawienia → Prywatność i bezpieczeństwo → Pliki cookie i inne dane witryn.
- **Firefox:** Ustawienia → Prywatność i bezpieczeństwo → Pliki cookie i dane stron.
- **Safari:** Preferencje → Prywatność → Zarządzaj danymi witryn.
- **Edge:** Ustawienia → Pliki cookie i uprawnienia witryn.

**Uwaga:** zablokowanie cookies niezbędnych (`auth_token`, `csrf_token`) uniemożliwi zalogowanie się do Verris.

## 4. Zgoda

Przy pierwszej wizycie wyświetlamy banner cookies z opcjami:

- **„Akceptuj wszystkie"** — aktywujemy wszystkie kategorie cookies.
- **„Tylko niezbędne"** — aktywujemy wyłącznie kategorię 2.1.
- **„Personalizuj"** — pozwalamy Ci wybrać każdą kategorię oddzielnie.

Twoja decyzja jest zapisywana w cookie `cookies_consent` na 1 rok. Po roku ponownie zapytamy. Możesz zmienić decyzję w każdej chwili w stopce „Preferencje cookies".

**Konsekwencje braku zgody:** odmowa zgody na cookies analityczne / marketingowe **nie wpływa** na dostęp do Usług ani ich jakość. Po prostu nie będziemy zbierać statystyk od Ciebie.

## 5. Zmiany Polityki

Aktualizacje niniejszej Polityki publikujemy w Panelu wraz z poinformowaniem Cię e-mailem. Każda zmiana wprowadzająca nową kategorię cookies wymaga ponownej zgody.

---

**Wersja: DRAFT 0.1 (Sprint 0)**
**Data: maj 2026**
**Lawyer review status: pending**
