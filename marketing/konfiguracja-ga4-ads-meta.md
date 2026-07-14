# Konfiguracja GA4 · Google Ads · Meta Pixel · Meta Ads — krok po kroku

Data: 2026-07-10 · Wymaga: wdrożonych zmian w kodzie z tej sesji

Ten dokument jest **spójny z tym, co realnie wysyła kod**. Nie konfiguruj niczego z pamięci ani
z tutoriali — nazwy zdarzeń i parametrów poniżej są dokładnie takie, jakie znajdziesz w dataLayer.

---

## 0. Co kod wysyła do dataLayer (kontrakt)

| Zdarzenie | Gdzie | Parametry | `event_id`? |
|---|---|---|---|
| `page_view` | www, panel | `page_path` | nie |
| `cta_click` | www | `cta_location`, `page` | nie |
| `checkout_intent` | **tylko www** | `plan`, `page` | nie |
| `scroll_depth` | www | `scroll_depth` (25/50/75/90), `page` | nie |
| `form_start` | www | `form_id`, `page` | nie |
| `generate_lead` | www (formularze), panel | `method` / `lead_type`, `plan_name`, **`value`**, **`currency`** | **tak** |
| `begin_checkout` | **tylko panel** | `ecommerce.items`, `value`, `currency` | **tak** |
| `search` | **tylko panel** | `search_term`, `search_type` | nie |
| `sign_up` | panel | `method` | **tak** |
| `purchase` | panel | `ecommerce.transaction_id`, `value`, `currency`, `items` | **tak** (`purchase-<transactionId>`) |
| `stripe_checkout_success` | panel | — | nie |
| `verris_consent_update` | www, panel | `consent_state.{analytics,marketing,functional}` | nie |
| `user_data` (push, nie event) | panel | `sha256_email_address` — **tylko po zgodzie marketingowej** | — |

Uwagi, które oszczędzą Ci pół dnia:

- **Podział odpowiedzialności: www linkuje, panel działa.** Strona marketingowa nigdy nie wysyła
  `begin_checkout`, `search` ani `purchase` — te odpalają się wyłącznie w panelu, gdy coś się
  faktycznie dzieje. Klik w przycisk na verris.pl to `checkout_intent`: sygnał intencji, nie konwersja.
- **`checkout_intent` NIE oznaczaj jako key event i nie bidowuj po nim.** Inaczej płacisz za
  kliknięcia w przycisk nawigacyjny.
- `purchase` ma **deterministyczne** `event_id` = `purchase-<transactionId>`. Odświeżenie strony
  potwierdzenia nie zdubluje konwersji.
- `user_data` pojawia się **przed** zdarzeniem konwersji i znika (`user_data: null`) przy wycofaniu
  zgody marketingowej.
- `value` przy `generate_lead` to **wartość umowna** (399 PLN), nie przychód. Służy wyłącznie
  kalibracji Smart Biddingu.

---

## 1. GTM — fundament

### 1.1 Zmienne (Variables → User-Defined → Data Layer Variable)

Utwórz po jednej dla każdego parametru. Nazwa zmiennej = nazwa klucza w dataLayer:

```
cta_location · page · scroll_depth · form_id · method · lead_type · plan_name
value · currency · search_term · search_type · event_id
ecommerce.transaction_id  (Data Layer Variable, Version 2)
user_data.sha256_email_address
consent_state.marketing · consent_state.analytics
```

### 1.2 Consent Initialization

Triggering → **Consent Initialization – All Pages** musi być pierwszym triggerem.
Kod ustawia już `gtag('consent','default', …)` z `wait_for_update: 500` przed załadowaniem GTM
(`Analytics.tsx`), więc w GTM **nie duplikuj** ustawienia domyślnego. Zduplikowany default
nadpisuje stan i powoduje losowe „granted" na pierwszej odsłonie.

### 1.3 Tag konfiguracyjny GA4

- Typ: **Google Tag**, Tag ID: `G-HHN0S0R777`
- Trigger: Initialization – All Pages
- Consent Settings → *Require additional consent for tag to fire*: `analytics_storage`
- Fields to set: `send_page_view` = `false` (wysyłamy własny `page_view` z SPA)

### 1.4 Tagi zdarzeń GA4

Po jednym tagu **GA4 Event** na zdarzenie. Trigger: Custom Event o tej samej nazwie.

| Tag | Event Name | Event Parameters |
|---|---|---|
| GA4 – cta_click | `cta_click` | `cta_location`, `page` |
| GA4 – checkout_intent | `checkout_intent` | `plan`, `page` |
| GA4 – scroll_depth | `scroll_depth` | `scroll_depth`, `page` |
| GA4 – form_start | `form_start` | `form_id`, `page` |
| GA4 – generate_lead | `generate_lead` | `method`, `plan_name`, `value`, `currency` |
| GA4 – begin_checkout | `begin_checkout` | `value`, `currency`, items z ecommerce |
| GA4 – search | `search` | `search_term`, `search_type` |
| GA4 – sign_up | `sign_up` | `method` |
| GA4 – purchase | `purchase` | `transaction_id`, `value`, `currency`, items |

Wszystkie z Consent Settings → `analytics_storage`.

Zmienne do dodania: `plan` (Data Layer Variable) oraz custom dimension **Plan intent** = `plan`.

### 1.5 Meta Pixel

Kod ładuje Pixel **leniwie**, dopiero po zgodzie marketingowej (`syncMetaPixel`). W GTM tag Pixela
ma być więc wyzwalany zdarzeniem `verris_consent_update` z warunkiem `consent_state.marketing = true`,
a nie na All Pages.

Zdarzenia Pixela odpalane są **z kodu** (`fbqTrack` z `eventID`), nie z GTM. Nie duplikuj ich tagami
w GTM — dostaniesz podwójne zliczanie mimo `event_id`.

---

## 2. GA4 — Admin

1. **Data Streams → Web** — jeden strumień na `verris.pl`. **Nie twórz drugiego dla panelu.**
   `panel.verris.pl` to subdomena; `cookie_domain: auto` dzieli `_ga` automatycznie.
2. **Configure tag settings → Show all → Define internal traffic** — dodaj swoje IP.
3. **Enhanced measurement** — zostaw włączone, ale **wyłącz „Scroll"**. Kod wysyła własny
   `scroll_depth` z progami 25/50/75/90; wbudowany mierzy wyłącznie 90% i zaśmieciłby raporty
   drugim zdarzeniem o tym samym znaczeniu.
4. **Custom definitions → Custom dimensions** (Event-scoped). **Bez tego parametry nie pojawią się
   w raportach** — zdarzenie zobaczysz, ale nie dowiesz się, który przycisk kliknięto:

   | Dimension name | Event parameter |
   |---|---|
   | CTA location | `cta_location` |
   | Page | `page` |
   | Scroll depth | `scroll_depth` |
   | Form ID | `form_id` |
   | Method | `method` |
   | Plan | `plan_name` |
   | Search term | `search_term` |

5. **Admin → Events → Mark as key event**: `purchase`, `generate_lead`, `sign_up`.
   Sprawdź `begin_checkout` — jeśli nie da się oznaczyć, utwórz w GTM własne `checkout_intent`
   z tych samych danych i oznacz je. Patrz `setup-pomiaru-i-kampanii.md` §3.4.

---

## 3. Google Ads

1. **Settings → Account settings → Auto-tagging: ON.** Bez tego `gclid` nie dolatuje i atrybucja
   się rozjeżdża. To najczęściej pomijany przełącznik w całym setupie.
2. **Tools → Linked accounts → Google Analytics (GA4)** — połącz, zaznacz import konwersji
   **i** import audiencji.
3. **Tools → Conversions → Import → GA4**:
   - `purchase` → **Primary** (do bidowania)
   - `generate_lead` → **Secondary** (obserwacja, dopóki nie masz wolumenu)
   - `sign_up` → **Secondary**
4. **Utwórz natywny tag konwersji Google Ads** dla `purchase` i odpal go z GTM **równolegle**
   do importu z GA4. Natywny tag jest odporny na zmiany po stronie GA4. Bidowanie opieraj na nim,
   GA4 zostaw do atrybucji cross-channel.
5. **Enhanced Conversions** (Tools → Conversions → wybierz akcję → Enhanced conversions):
   - Metoda: **Google Tag Manager**
   - Źródło: zmienna `user_data.sha256_email_address`
   - Format: **already hashed** (kod hashuje SHA-256, hex lowercase, po `trim().toLowerCase()`)
   - Po tygodniu sprawdź **Tools → Conversions → Diagnostics → match rate**. Spadek = zły schemat.

---

## 4. Meta

1. **Business Manager → Brand Safety → Domains** — zweryfikuj `verris.pl` rekordem TXT.
   Bez weryfikacji nie skonfigurujesz Aggregated Event Measurement.
2. **Events Manager → Aggregated Event Measurement → Configure Web Events** — priorytety
   (kolejność ma znaczenie, iOS respektuje tylko 8 pierwszych):

   ```
   1. Purchase
   2. InitiateCheckout
   3. Lead
   4. CompleteRegistration
   5. Search
   ```

3. **Controller Addendum** — zaakceptuj **zanim** uruchomisz Custom Audiences.
   Custom Audiences to współadministrowanie danymi w rozumieniu RODO.
4. **Deduplikacja** — kod wysyła `eventID` z Pixela. Gdy dołączysz CAPI (webhook Stripe),
   musi wysłać **identyczne** `event_id` i `event_name`. Dla zakupu: `purchase-<transactionId>`.
   Sprawdź: Events Manager → Test Events → kolumna *Deduplication*.
5. **Event Match Quality** — po wdrożeniu `user_data` celuj w EMQ ≥ 6/10. Poniżej 4 oznacza,
   że hash nie dociera albo nie jest znormalizowany.
6. **Lookalike** — dopiero po ~100 konwersjach. Wcześniej Meta zbuduje podobieństwo do szumu.

---

## 5. Weryfikacja — kolejność testów

1. **GTM Preview** — wejdź na verris.pl, sprawdź, że `verris_consent_update` niesie
   `consent_state`, a tagi GA4 mają status *Consent: not required* / *granted*.
2. **Test zgody (obowiązkowy).** Odmów wszystkiego. DevTools → Network:
   - filtr `facebook` → **zero żądań**
   - filtr `google-analytics` → zero żądań
   To jedyny test, którego niezaliczenie może kosztować karę.
3. **Test subdomeny.** Zaakceptuj analitykę na `verris.pl`, przejdź na `panel.verris.pl`.
   Baner **nie może** się pojawić. Cookie `cookies_consent` musi mieć `Domain` = `.verris.pl`.
4. **GA4 DebugView** — sprawdź, czy `cta_click` niesie `cta_location`, a `scroll_depth` odpala się
   raz na próg (nie w kółko przy przewijaniu w tę i z powrotem).
5. **Meta Test Events** — kup coś testowo, sprawdź, że `Purchase` ma `eventID` i nie dubluje się.
6. **Google Ads → Diagnostics** — po 3–7 dniach: status *Recording*, match rate EC > 0.

---

## 6. Czego świadomie nie robimy

- **Session recording** (Hotjar, Clarity) na stronach z formularzami — rejestruje treść wpisywaną
  do pól, wymaga osobnej zgody i DPIA.
- **Fingerprinting** i `user_id` dla niezalogowanych.
- **Surowy e-mail** w dataLayer — wyłącznie SHA-256, wyłącznie po zgodzie marketingowej.
- **Profilowanie zidentyfikowanych osób** („kto co kliknął") — mierzymy zachowania
  pseudonimicznie i zagregowanie.

---

## 6a. Błędy znalezione i naprawione w audycie 2026-07-10

Zapis na przyszłość — każdy z nich cicho fałszował dane, żaden nie rzucał błędu.

| # | Błąd | Skutek | Status |
|---|---|---|---|
| 1 | `begin_checkout` odpalany z 13 miejsc na verris.pl przy kliknięciu w link do panelu, m.in. z przycisku w **nagłówku obecnym na każdej podstronie** — a panel odpalał własny | Podwójne zliczanie w GA4; dwa `InitiateCheckout` w Meta z różnymi `event_id`, więc dedup nie miał szans | naprawione → `checkout_intent` |
| 2 | `generate_lead` na kliknięciu w link (`/domeny`, `/reseller`) i na przycisku wyszukiwarki domen | Konwersja „Lead" liczona przy kliknięciu w nawigację; z `value=399 zł` zafałszowałaby Smart Bidding | naprawione → `cta_click` |
| 3 | `fbq('track','Purchase')` bez `eventID` | Każdy zakup policzony dwukrotnie po włączeniu CAPI | naprawione |
| 4 | Meta `PageView` odpalany raz, przy bootstrapie Pixela | Przy nawigacji SPA Meta widziała jedną odsłonę na sesję; strony docelowe kampanii nie pojawiały się w statystykach | naprawione |
| 5 | `transactionId: domain-<x>-${Date.now()}` i `vps-${... ?? Date.now()}` | Nowy identyfikator przy każdym ponowieniu → brak deduplikacji w GA4 i rozjazd `event_id` z CAPI | naprawione (stabilne id; bez id z serwera nie wysyłamy `purchase`) |
| 6 | `page` zahardkodowane na `'home'` w delegacji kliknięć | Wszystkie `cta_click` z `/hosting`, `/cennik` itd. raportowały się jako strona główna | naprawione |
| 7 | `updateConsent(boolean)` w `analytics.ts` sklejał zgodę analityczną i marketingową | Mina: pierwsze użycie nadałoby zgodę marketingową komuś, kto zaznaczył samą analitykę | usunięte (funkcja była nieużywana) |
| 8 | Ciasteczko zgody bez atrybutu `Domain` | Zgoda z verris.pl niewidoczna w panelu → Consent Mode `denied` → `purchase` nie docierał do Ads i Meta | naprawione (`Domain=.verris.pl`) |

Znane, świadomie zostawione:

- `stripe_checkout_success` odpali się ponownie, jeśli użytkownik odświeży stronę z `?status=success`.
  To zdarzenie niestandardowe, nie konwersja — nie psuje bidowania. Docelowo `purchase` ze Stripe
  ma iść server-side.
- Panel nie wysyła Meta `PageView` przy nawigacji SPA. Świadomie: to obszar po zalogowaniu,
  odsłony dashboardu nie mają wartości reklamowej.
- `ContactForm` i `MigrationLeadForm` wysyłają `generate_lead` przed faktycznym wysłaniem
  wiadomości (brak jeszcze integracji z SES — zadanie #14). Do czasu jej wdrożenia lead jest
  liczony, choć nic nie wychodzi na serwer.

---

## 7. Pozostało do zrobienia w kodzie

- [ ] **Webhook Stripe → Meta CAPI** z `event_id = purchase-<transactionId>`. Do czasu wdrożenia
      Pixel działa sam: zakupy blokowane przez adblocki nie są liczone, ale **nic się nie dubluje**.
- [ ] **`pushUserData(email)`** jest zaimplementowane, ale trzeba je **wywołać** przed
      `trackPurchase` i `trackSignUp` w panelu (miejsca: `services/new/form.tsx`,
      `domain-purchase-wizard.tsx`, `vps-client.tsx`, ekran po rejestracji).
- [ ] Wpis o Google i Meta jako podprocesorach w polityce prywatności + rejestr zgód po stronie serwera.
