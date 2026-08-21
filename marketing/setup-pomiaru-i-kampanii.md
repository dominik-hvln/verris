# Verris — uruchomienie pomiaru i kampanii (Google Ads + Meta Ads)

Runbook krok po kroku: co, gdzie i jak ustawić, żeby zliczanie działało, retargeting był możliwy,
a targetowanie dało się poszerzać. Stan na 2026-07.

Konta: **GTM-PJQNXCF5** · **GA4 G-HHN0S0R777** · **Google Ads 957-943-2103** · **Meta Pixel 2263705751037556**
Domeny: `verris.pl` (marketing, Next.js) · `panel.verris.pl` (konto, zakup, Stripe)

---

## 0. Czego się da, a czego NIE da zmierzyć (przeczytaj przed konfiguracją)

Chcesz wiedzieć „kto co otworzył, kto ile czasu spędził, kto ile razy kliknął". Rozdzielmy to na
trzy poziomy, bo mieszają się tu prawo, technika i marka:

| Poziom | Możliwe? | Uwagi |
|---|---|---|
| **Agregaty** (ilu, jak długo, co klikali) | ✅ tak | Standard GA4: `engagement_time_msec`, scroll, kliknięcia, ścieżki |
| **Pseudonimowy użytkownik** (ten sam cookie/urządzenie, liczba wizyt, sekwencja zdarzeń) | ✅ tak, **po zgodzie** | Consent Mode v2 domyślnie `denied` — bez zgody nic nie leci |
| **Identyfikowalna osoba** („Jan Kowalski otworzył cennik 3× i był 4 min") | ❌ nie | To profilowanie danych osobowych. Wymaga podstawy prawnej, informacji i celu. GA4 **zabrania** wysyłania PII. Nie budujemy dossier na osobę |

**Konsekwencje praktyczne:**
- Część użytkowników odmówi zgody → dane będą **niepełne z definicji**. To nie błąd konfiguracji.
- Braki nadrabiamy **modelowaniem Consent Mode**, **Enhanced Conversions** i **Meta CAPI** —
  nie obchodzeniem zgody.
- Verris sprzedaje „analitykę bez cookies" i „hosting bez gwiazdek". Agresywne śledzenie własnych
  odwiedzających byłoby niespójne z marką. Mierzymy tyle, ile trzeba do decyzji o budżecie — nie więcej.

To, co realnie dostaniesz: liczba i typ kliknięć per CTA, głębokość scrolla, czas zaangażowania,
ścieżki między stronami, częstotliwość powrotów (pseudonimowo), koszty i konwersje per kampania,
listy remarketingowe, oraz sygnały do rozszerzania targetowania (lookalike/similar).

---

## 1. Fundament — co już działa, co dokończyć

Na `verris.pl` mamy: Consent Mode v2 (default `denied`), GTM, baner zgód z granularnymi kategoriami,
oraz warstwę zdarzeń w `dataLayer`:

| Zdarzenie | Parametry | Gdzie się odpala |
|---|---|---|
| `page_view` | `page_path` | każda zmiana trasy |
| `cta_click` | `cta_location`, `page` | wszystkie CTA |
| `generate_lead` | `method` (`migration_plan`, `contact_form`, `domain_search`), `currency` | formularze |
| `begin_checkout` | `plan`, `value`, `currency` | CTA prowadzące do panelu |
| `search` | `search_term` | wyszukiwarka domen |
| `verris_consent_update` | — | po decyzji w banerze |

W panelu (`panel.verris.pl`) są: `sign_up`, `purchase` (wartość PLN), `stripe_checkout_success`.

**Do dokończenia (kolejne sekcje):** cross-domain, GA4, import do Ads, Meta CAPI.

---

## 2. Cross-domain — KRYTYCZNE, zrób to najpierw

Zakup dzieje się na **innej domenie** niż reklama (`panel.verris.pl`). Bez konfiguracji cross-domain
GA4 potraktuje przejście jako nową sesję z ruchem „referral", a Google Ads **nie przypisze konwersji
do kliknięcia reklamy**. To najczęstsza przyczyna „kampania nie konwertuje", gdy w rzeczywistości
konwertuje.

**GA4 → Admin → Data Streams → wybierz stream → Configure tag settings:**
1. **Configure your domains** → dodaj `verris.pl` i `panel.verris.pl` (match type: *Contains*).
2. **List unwanted referrals** → dodaj `panel.verris.pl` i `stripe.com` (żeby powrót z płatności
   nie zabijał źródła).

**Warunek:** panel musi mieć **ten sam** kontener GTM / to samo `G-HHN0S0R777`. Zmienna
`NEXT_PUBLIC_GTM_ID` jest już w buildzie paneli — potwierdź, że tag odpala się na `panel.verris.pl`.

**Google Ads:** włącz **auto-tagging** (Ads → Admin → Account settings → Auto-tagging = ON).
Dzięki temu `gclid` przechodzi w URL i domyka atrybucję.

---

## 3. GA4 — konfiguracja

### 3.1 Enhanced measurement (daje „za darmo" sporo z Twojej listy)
**Admin → Data Streams → stream → Enhanced measurement → włącz:**
- *Page views*, *Scrolls* (90% głębokości), *Outbound clicks*, *Site search*, *File downloads*, *Form interactions*.

To pokrywa: co otwarto, co kliknięto na zewnątrz, jak głęboko przescrollowano.
**Czas na stronie** GA4 liczy sam jako `engagement_time_msec` (czas aktywnej karty) — patrz sekcja 7.

### 3.2 Custom dimensions (bez nich parametry zdarzeń nie trafią do raportów!)
**Admin → Custom definitions → Create custom dimension** (scope: *Event*):

| Nazwa | Parametr zdarzenia |
|---|---|
| CTA location | `cta_location` |
| Page | `page` |
| Lead method | `method` |
| Plan | `plan` |
| Search term | `search_term` |
| Scroll depth | `scroll_depth` |

> Bez tego kroku zobaczysz, że `cta_click` się odpalił, ale nie dowiesz się **który** przycisk.

### 3.3 Key events (dawne „conversions")
Google przemianował w GA4 „Conversions" na **„Key events"**; nazwa „Conversions" została zarezerwowana
dla Google Ads. Przepływ: *Event → Key event (GA4) → Conversion (Ads)*.

**Admin → Events → Mark as key event** dla:
- `generate_lead`
- `begin_checkout`
- `sign_up`
- `purchase`

---

### 3.4 Aktualizacja GA4 z kwietnia 2026 — co sprawdzić, zanim uwierzysz

W branżowych publikacjach z 2026 krąży lista zmian, które rzekomo weszły z aktualizacją GA4
w kwietniu 2026: `generate_lead` ma wymagać parametrów `value` i `currency`, by kwalifikować się
jako key event; `begin_checkout` miał stracić domyślną kwalifikowalność; `purchase` ma wymagać
unikalnego `transaction_id` w oknie 24 h; schemat `user_data` dla Enhanced Conversions miał się
zmienić; część audiencji GA4 miała zostać wypauzowana.

**Nie traktuj tego jako pewnika.** Źródła, które to powtarzają, to blogi agencyjne, a jedno z nich
podaje jako „nowość z kwietnia 2026" usunięcie modelu atrybucji *first-click* — który Google wycofał
**we wrześniu 2023**. To dyskwalifikuje wiarygodność całej listy. Nie znalazłem potwierdzenia
w dokumentacji Google.

Zamiast wierzyć — **zweryfikuj w swoim koncie** (5 minut, i tak trzeba to zrobić przy starcie):

1. GA4 → Admin → Events: czy `generate_lead` da się oznaczyć jako key event **bez** `value`/`currency`?
   Jeśli nie — dodaj oba parametry do dataLayer (wartość leada możesz przyjąć umownie, np. 150 zł).
2. Czy `begin_checkout` da się oznaczyć jako key event? Jeśli nie — zrób własne `checkout_intent`
   w GTM z tych samych danych i je oznacz. Zrób to **zanim** oprzesz o to bidowanie.
3. Google Ads → Tools → Conversions → **Diagnostics**: sprawdź match rate Enhanced Conversions
   po pierwszych dniach. Spadek = zły schemat `user_data`.
4. Google Ads → Audiences: czy listy z GA4 się zapełniają, czy świecą „List too small to use".

Niezależnie od tego, czy te zmiany są prawdziwe: **wszystkie cztery punkty i tak należą do
standardowej weryfikacji startowej.** Robimy je i mamy odpowiedź z pierwszej ręki.

Osobna, potwierdzona rekomendacja: **nie opieraj bidowania wyłącznie na konwersjach importowanych
z GA4.** Natywny tag konwersji Google Ads jest odporny na zmiany w GA4. Trzymaj oba równolegle —
natywny jako sygnał do Smart Biddingu, GA4 do atrybucji cross-channel.

---

## 4. GTM — tagi, wyzwalacze, zmienne

Wszystko odpala się **wyłącznie po zgodzie** (built-in consent checks).

### 4.1 Zmienne (Variables → User-Defined → Data Layer Variable)
`cta_location`, `page`, `method`, `plan`, `value`, `currency`, `search_term`.

### 4.2 Tag konfiguracyjny GA4
- Typ: *Google Tag* (`G-HHN0S0R777`), trigger: *Initialization – All Pages*.
- **Consent Settings → Require additional consent for tag to fire:** `analytics_storage`.
- Fields to set: `send_page_view = false` (nasz kod sam wysyła `page_view` przy zmianie trasy).

### 4.3 Tagi zdarzeń GA4 (po jednym na zdarzenie)
Typ: *GA4 Event*, konfiguracja: powyższy Google Tag. Trigger: **Custom Event** o nazwie zdarzenia.

| Tag | Custom Event trigger | Parametry |
|---|---|---|
| GA4 – cta_click | `cta_click` | `cta_location`, `page` |
| GA4 – generate_lead | `generate_lead` | `method`, `currency` |
| GA4 – begin_checkout | `begin_checkout` | `plan`, `value`, `currency` |
| GA4 – search | `search` | `search_term` |
| GA4 – page_view | `page_view` | `page_path` |

Każdy tag: **Consent Settings → `analytics_storage`**.

### 4.4 Scroll i zaangażowanie (Twoje „ile czasu, jak głęboko")
- **Trigger:** *Scroll Depth* → Vertical → 25, 50, 75, 90% → tag *GA4 Event* `scroll_depth`
  z parametrem `scroll_depth = {{Scroll Depth Threshold}}`.
- **Trigger:** *Timer* → co 30 s, limit 10 → tag `time_on_page` (opcjonalnie; GA4 i tak liczy
  `engagement_time_msec`, więc rób to tylko, jeśli chcesz progi „30/60/120 s").

### 4.5 Meta Pixel (przez GTM, consent-gated)
- Tag bazowy: *Custom HTML* z kodem Pixela → trigger *Initialization*.
  **Consent Settings → `ad_storage` + `ad_user_data`.**
- Nasz baner robi już `fbq('consent','grant'|'revoke')`, a Pixel startuje z `revoke`.

**Mapowanie zdarzeń dataLayer → Meta:**

| dataLayer | Meta standard event |
|---|---|
| `page_view` | `PageView` |
| `search` | `Search` |
| `generate_lead` | `Lead` |
| `begin_checkout` | `InitiateCheckout` |
| `purchase` (panel) | `Purchase` (value, currency) |
| `sign_up` (panel) | `CompleteRegistration` |

---

## 5. Google Ads — linkowanie, konwersje, audiencje

### 5.1 Wymogi formalne (bez tego nie ruszaj)
- **Ads → Admin → Account settings → Data Processing Terms** — zaakceptuj (wymóg przy EEA + Consent Mode).
- **Auto-tagging** = ON.
- **Consent Mode v2** musi wysyłać `ad_user_data` i `ad_personalization` — u nas wysyła.

### 5.2 Połączenie GA4 ↔ Google Ads
**GA4 → Admin → Product links → Google Ads links → Link** (konto 957-943-2103).
Zaznacz *Enable personalized advertising* i *Enable auto-tagging*.

### 5.3 Import konwersji
**Google Ads → Goals → Conversions → New conversion action → Import → Google Analytics 4 properties.**
Zaimportuj key eventy: `purchase`, `sign_up`, `generate_lead`, (`begin_checkout`/`checkout_intent`).

Ustaw dla każdej:
- **Primary** dla `purchase` i `sign_up` (na tym bidujemy).
- **Secondary** (observation only) dla `generate_lead` i intencji checkoutu — inaczej Smart Bidding
  będzie optymalizować pod tanie, płytkie akcje.
- **Wartość:** `purchase` → wartość rzeczywista (PLN); pozostałe → bez wartości.
- **Count:** `purchase` = *Every*; `sign_up`/`lead` = *One*.

### 5.4 Enhanced Conversions (odzyskuje część utraconych konwersji)
**Ads → Goals → Conversions → Settings → Enhanced conversions → włącz → metoda: Google Tag Manager.**
Wymaga przekazania **zahaszowanego** e-maila przy konwersji (SHA-256). To dane osobowe:
- wysyłamy **tylko po zgodzie marketingowej**,
- **tylko z panelu** (przy `purchase`/`sign_up`, gdzie e-mail już mamy),
- polityka prywatności musi to wymieniać.

### 5.5 Audiencje (remarketing i poszerzanie)
**GA4 → Admin → Audiences → New audience.** Utwórz i udostępnij do Ads:

| Audiencja | Definicja | Zastosowanie |
|---|---|---|
| Odwiedzili `/cennik` bez `begin_checkout` (30 dni) | page_path zawiera `/cennik` | remarketing „cena" |
| Odwiedzili `/przenies-strone`, brak `generate_lead` (30 dni) | page_path + brak zdarzenia | remarketing „migracja" |
| Użyli kalkulatora | `cta_click` gdzie `cta_location = calculator` | najgorętsi |
| Czytelnicy bloga (14 dni) | page_path zaczyna się od `/blog` | górny lejek |
| Kupujący (180 dni) | `purchase` | **wykluczenie** z prospectingu |

Poszerzanie targetowania w Ads: **Similar segments** wygasły — zamiast tego używaj
**optimized targeting** (Display/Demand Gen) i **broad match + Smart Bidding** w Search, karmione
konwersjami z 5.3.

---

## 6. Meta Ads — Pixel + CAPI

### 6.1 Formalności
- **Business Manager → Business settings → Data sources → Controller/Processor terms** — zaakceptuj
  **Controller Addendum**.
- **Verify domain** (`verris.pl`) — Business settings → Brand safety → Domains → weryfikacja meta-tagiem
  albo DNS TXT. Bez tego nie ustawisz priorytetów AEM.

### 6.2 Aggregated Event Measurement (AEM)
Po weryfikacji domeny: **Events Manager → Aggregated Event Measurement → Configure Web Events.**
Masz **8 slotów** — ustaw priorytety (od najważniejszego):
1. `Purchase` 2. `CompleteRegistration` 3. `InitiateCheckout` 4. `Lead` 5. `Search` 6. `PageView`

### 6.3 Conversions API — wybór drogi

| Opcja | Koszt | Kiedy |
|---|---|---|
| **Server-side GTM** (kontener serwerowy) | ~10–50 USD/mies hostingu | **Rekomendacja** — jednym kontenerem karmisz Meta, GA4 i Ads |
| **CAPI Gateway** (hostowane przez Meta) | ~10–400+ USD/mies | Prościej, ale tylko Meta |
| **Bezpośrednio z serwera** (webhook Stripe → Meta API) | 0 | Najtaniej dla `purchase`; wymaga kodu w API |

Dla Waszej skali: **sGTM** dla zdarzeń przeglądarkowych + **webhook Stripe → CAPI** dla `purchase`
(zdarzenie serwerowe jest odporne na blokery i iOS).

### 6.4 Deduplikacja (obowiązkowo!)
Pixel i CAPI wysyłają to samo zdarzenie. Bez dedupu Meta policzy je **dwa razy** i zepsuje optymalizację.
- Generuj **`event_id`** (UUID) przy każdym zdarzeniu i wysyłaj **identyczny** w Pixelu i w CAPI.
- Meta deduplikuje po parze `event_id` + `event_name`.

### 6.5 Event Match Quality (EMQ)
Events Manager pokazuje EMQ 0–10 — im wyżej, tym lepsze dopasowanie i lookalike.
Cele orientacyjne: `PageView` 6,5–7,5 · `InitiateCheckout` ~8 · `Purchase` 8,8–9,3.
Podnosisz je, wysyłając w CAPI (po zgodzie, zahaszowane): e-mail, `fbc`/`fbp`, IP, user-agent.

### 6.6 Audiencje
**Events Manager → Audiences → Create → Website:**
- Wszyscy odwiedzający (30/90/180 dni)
- `/przenies-strone` bez `Lead` (30 dni)
- `InitiateCheckout` bez `Purchase` (14 dni) ← porzucone zamówienie
- `Purchase` (180 dni) → **wyklucz** z prospectingu

**Lookalike dopiero po ~100 realnych konwersjach** — wcześniej źródło jest za słabe.

---

## 7. „Ile czasu, ile kliknięć, jak głęboko" — gdzie to zobaczysz

| Pytanie | Gdzie |
|---|---|
| Ile czasu na stronie | GA4 → Reports → Engagement → Pages and screens → *Average engagement time* |
| Jak głęboko scrollowali | Custom report na `scroll_depth` (sekcja 4.4) |
| Który CTA klikają | Explore → Free form → wymiar `CTA location`, metryka *Event count* |
| Ile razy wraca ten sam użytkownik | Reports → Retention; Explore → *Cohort exploration* |
| Ścieżka przed konwersją | Explore → *Path exploration* od `page_view` do `purchase` |
| Skąd przyszli | Reports → Acquisition → Traffic acquisition (z UTM/gclid) |

Wszystko **pseudonimowo i zagregowane**. To wystarcza do decyzji: który przekaz, która strona,
który kanał. Nie potrzebujesz nazwisk, żeby wiedzieć, że LP konwertuje 3× lepiej niż home.

---

## 8. Kolejność uruchomienia (checklista)

**Tydzień 0 — fundament**
- [ ] Cross-domain + wykluczenia referral (sekcja 2)
- [ ] Auto-tagging ON, Data Processing Terms zaakceptowane
- [ ] Enhanced measurement + custom dimensions (3.1, 3.2)
- [ ] Key events oznaczone; sprawdź status `begin_checkout` (3.3)
- [ ] Tagi GTM: GA4 config + 5 zdarzeń + scroll (4.2–4.4)
- [ ] Weryfikacja: GA4 **DebugView** + **Tag Assistant** — każde zdarzenie widoczne, parametry na miejscu

**Tydzień 1 — Google Ads**
- [ ] GA4 ↔ Ads link, import key eventów, primary/secondary (5.2, 5.3)
- [ ] Enhanced Conversions (5.4)
- [ ] Audiencje w GA4 → udostępnione do Ads (5.5)
- [ ] Start `gads-search-hosting-202607` (500–1000 zł/mies)

**Tydzień 2 — Meta**
- [ ] Controller Addendum, weryfikacja domeny, AEM (6.1, 6.2)
- [ ] Pixel przez GTM (4.5), test w **Events Manager → Test Events**
- [ ] CAPI + `event_id` dedup (6.3, 6.4), sprawdź EMQ
- [ ] Start `meta-awareness-hosting-202607` (prospecting)

**Tydzień 4 — remarketing**
- [ ] Listy mają min. 1000 użytkowników (Ads) / 300 (Meta)
- [ ] Start kampanii remarketingowych, limit częstotliwości 2–3/tydz.

---

## 9. Weryfikacja — jak sprawdzić, że działa

| Narzędzie | Co sprawdzasz |
|---|---|
| **GA4 DebugView** | Zdarzenia + parametry w czasie rzeczywistym (włącz Preview w GTM) |
| **Google Tag Assistant** | Czy tagi odpalają się i **czy respektują zgodę** (przetestuj: odrzuć zgodę → tagi nie lecą) |
| **Google Ads → Diagnostics** | Status konwersji: *Recording conversions* |
| **Meta Events Manager → Test Events** | Pixel + CAPI, dedup (jedno zdarzenie, nie dwa) |
| **Meta → EMQ** | Jakość dopasowania (sekcja 6.5) |

**Test zgody (obowiązkowy):** wejdź w trybie incognito, kliknij „Tylko niezbędne" → w Tag Assistant
żaden tag GA4/Ads/Meta nie może się odpalić. Potem „Akceptuję wszystkie" → tagi ruszają.

---

## 10. Compliance — granice, których nie przekraczamy

- **Bez zgody nie ma pomiaru marketingowego.** Consent Mode v2 `denied` to stan domyślny.
- **Zero PII w GA4** (e-mail, telefon, imię w parametrach = złamanie regulaminu Google i ryzyko usunięcia danych).
- **Enhanced Conversions / CAPI**: tylko dane zahaszowane, tylko po zgodzie marketingowej,
  wymienione w polityce prywatności.
- **Custom audiences z uploadu list klientów** — wyłącznie po potwierdzeniu podstawy prawnej.
- **Nie budujemy profili osób.** Analizujemy segmenty i ścieżki, nie ludzi z imienia i nazwiska.
- Dane konwersji będą niepełne — to cecha, nie usterka. Decyzje podejmuj na trendach.

---

## 11. Do dorobienia w kodzie (moja lista)

- [ ] `event_id` (UUID) w każdym zdarzeniu `dataLayer` → dedup Pixel ↔ CAPI
- [ ] `transaction_id` przy `purchase` (panel) → dedup i raportowanie
- [ ] Zahaszowany e-mail (SHA-256) w `user_data` przy `purchase`/`sign_up` (panel, po zgodzie)
- [ ] Potwierdzić, że panel ładuje ten sam GTM i Consent Mode (warunek cross-domain)
- [ ] Webhook Stripe → Meta CAPI `Purchase` (serwerowo)
- [ ] `scroll_depth` — jeśli wolisz mieć go z kodu, a nie z triggera GTM

---

*Zmiany w panelach Google/Meta są częste — jeśli nazwa zakładki się nie zgadza, szukaj po nazwie
funkcji (np. „Enhanced conversions", „Aggregated Event Measurement"), nie po ścieżce.*
