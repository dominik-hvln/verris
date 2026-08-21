# Analityka bez cookies — decyzja, plan wdrożenia i porządki wokół pomiaru

Data: 2026-07-10 · Decyzja: Dominik · Wykonanie: w toku

---

## 1. Co się stało

„Prywatna analityka bez cookies" figurowała jako **wyróżnik #3** w `verris-marketing/references/oferta.md`,
z dopiskiem *„unikalny wyróżnik — konkurencja każe wpinać GA"*. Na tej podstawie trafiła do copy
w **12 miejscach**, łącznie z cennikiem („w cenie") i tabelą porównawczą z konkurencją na LP.

W `apps/` i `libs/` **nie ma ani jednej linijki kodu**, która by to realizowała. Ani Matomo, ani Plausible,
ani Umami, ani GoAccess, ani konfiguracji AWStats.

Sprzedawaliśmy funkcję, której nie ma. Cecha wymieniona jako element świadczenia w cenie, a niedostarczona
po zakupie, to ryzyko z ustawy o przeciwdziałaniu nieuczciwym praktykom rynkowym.

Dodatkowo sam dopisek o wyróżniku był fałszywy: dhosting i cyberfolks dają AWStats/Webalizer w panelu,
tak samo jak każdy DirectAdmin. W obecnym kształcie to nie była przewaga, tylko Webalizer w ładniejszych słowach.

## 2. Decyzja

1. **Claim zdjęty** ze wszystkich 12 miejsc (zrobione — sekcja 3).
2. **Zastąpiony wyróżnikami, które istnieją w kodzie** i które da się zweryfikować (sekcja 3).
3. **Analitykę wdrażamy naprawdę** — Umami self-hosted (sekcja 5). Claim wraca do copy dopiero
   w dniu, w którym funkcja jest na produkcji.
4. Wpis blogowy zostaje (keyword ma wolumen), ale odcięty od oferty i **skorygowany merytorycznie**.

## 3. Co zostało zmienione w repo

| Plik | Było | Jest |
|---|---|---|
| `components/Pricing.tsx` | „Prywatna analityka bez cookies" | „Kopia bezpieczeństwa przed każdym przywróceniem" |
| `(frontend)/page.tsx` — karta | „Analityka bez cookies" | „Przywracanie z siatką bezpieczeństwa" |
| `(frontend)/page.tsx` — pasek | „Analityka bez cookies" | „Cofniesz nieudane przywracanie" |
| `(frontend)/page.tsx` — tabela | „Statystyki odwiedzin" | „Przywrócenie kopii" |
| `hosting/page.tsx` | karta „Analityka bez cookies" | karta „Siatka bezpieczeństwa" |
| `hosting/wordpress/page.tsx` | „Prywatna analityka…" | „Przywracanie wybiórcze: pliki, baza, poczta" |
| `o-nas/page.tsx` | „analityka bez cookies" | „infrastruktura w EOG" |
| `funkcje/page.tsx` | meta + ikona | zaktualizowane |
| `przenies-strone/page.tsx` — tabela | „Statystyki odwiedzin" | „Przywrócenie kopii" |
| `lib/features.ts` | strona `/funkcje/analityka-bez-cookies` | strona `/funkcje/domeny-bez-auto-odnowien` |
| `lib/site.ts` — nawigacja | link do starej strony | link do nowej |
| `app/llms.txt/route.ts` | wpis o analityce | wpisy o self-restore i domenach |
| `public/pricing.md` | „w cenie: …analityka…" | „w cenie: …kopie z kopią bezpieczeństwa…" |
| `marketing/gads-search-hosting-202607.md` | USP #4 | USP #4 → self-restore |
| `marketing/email-sekwencja…` | B4: „prywatna analityka" | B4: „test przywracania" |
| `marketing/blog/analityka-bez-cookies.md` | reklama funkcji | materiał edukacyjny + korekta |
| `marketing/blog/rodo-a-hosting.md` | link do martwej strony | usunięty |

### Czym zastąpiliśmy — i dlaczego to jest prawdziwe

**Samodzielne przywracanie kopii z kopią bezpieczeństwa.**
Źródło: `apps/api/src/subscriptions/hosting-restore.service.ts`. Klient wybiera zakres
(`scopeFiles` / `scopeDatabases` / `scopeEmail`), system wykonuje `safetyBackup` stanu obecnego przed
operacją, a przywrócenie wymaga potwierdzenia nazwą domeny (`confirmDomain`). Większość hostingów
każe napisać do supportu i nie daje możliwości cofnięcia. To jest realna przewaga.

**Domeny bez auto-odnowień.**
Źródło: `libs/database/prisma/schema.prisma` → `autoRenew Boolean @default(false)`.
Odnowienie wyłącznie po opłaceniu, przypomnienia 30/14/7 dni. Rynek robi odwrotnie.
Na nowej stronie funkcji opisujemy też **kompromis** (przegapisz przypomnienia → domena wygaśnie),
bo przewaga bez kosztu brzmi jak ściema.

## 4. Dwa dalsze rozjazdy copy ↔ kod (do naprawy, nie naprawione)

Znalezione przy okazji. **Nie ruszałem — to Twoje decyzje.**

**A. Kredyty SLA: obiecujemy inny mechanizm, niż mamy.**
`oferta.md` mówi: *„kredyty 5/25/50/100% zależnie od skali niedostępności"*.
`apps/api/src/billing/sla-credit.scheduler.ts` liczy rekompensatę **proporcjonalnie do czasu przestoju**,
z mnożnikiem i limitem (`capPercent`) z ustawień admina. To nie są progi 5/25/50/100%.
→ Albo poprawiamy regulamin i `oferta.md` pod kod, albo kod pod regulamin. **Regulamin jest wiążący —
sprawdź, co w nim faktycznie stoi, zanim cokolwiek zmienimy.**

**B. Kredyty SLA są domyślnie wyłączone.**
Komentarz w kodzie: *„Domyślnie WYŁĄCZONE (admin włącza po przeglądzie polityki) — nic nie jest
kredytowane, dopóki `sla.creditsEnabled = 1`."*
Tymczasem „SLA 99,5% **z automatycznymi rekompensatami**" jest na homepage, `/hosting`, LP i w kreacjach.
→ **Włącz `sla.creditsEnabled` przed startem kampanii**, albo zdejmij słowo „automatycznymi".
To najpilniejsza rzecz z całego dokumentu.

**C. `oferta.md` wciąż zawiera fałszywy dopisek** *„unikalny wyróżnik — konkurencja każe wpinać GA"*.
Skill jest read-only w tej sesji (Settings → Capabilities). Popraw ręcznie.

## 5. Wdrożenie analityki — Umami self-hosted

### Dlaczego Umami, a nie alternatywy

| | Umami | Plausible CE | GoAccess | Matomo |
|---|---|---|---|---|
| Licencja | MIT | AGPL | MIT | GPL |
| Stack | Node + Postgres | Elixir + **ClickHouse** | binarka na logach | PHP + MySQL |
| Koszt licencji | 0 zł | 0 zł | 0 zł | 0 zł |
| Koszt utrzymania | niski | średni | zerowy | wysoki |
| Multi-tenant | natywny (websites + users) | jest | brak | jest |
| Zdarzenia własne | tak | tak | **nie** | tak |
| Ryzyko licencyjne przy odsprzedaży | brak | **AGPL — uwaga** | brak | GPL |

**Wybór: Umami.** MIT zdejmuje problem AGPL przy oferowaniu tego jako usługi. Postgres już mamy.
Multi-tenant jest wbudowany, więc konto per klient to jeden rekord, nie osobna instancja.
GoAccess odpada, bo bez zdarzeń i bez rozróżniania botów to ładniejszy AWStats — pozorny wyróżnik.

### Architektura

- Kontener `umami` obok paneli w `docker-compose.prod.yml`, port wewnętrzny, bez ekspozycji na host.
- **Osobny schemat** `umami` w istniejącym Postgresie (ten sam wzorzec co `payload`) — nie kolizyjny z Prisma.
- Caddy: `stats.verris.pl` → `reverse_proxy umami:3000`, healthcheck `/api/heartbeat`.
- Skrypt zliczający serwowany **z naszej domeny** (`stats.verris.pl/script.js`), nie z CDN — nie ginie
  w blokerach reklam i nie wynosi danych.
- Konfiguracja prywatności: `DISABLE_TELEMETRY=1`, hashowanie IP z rotowaną solą, brak przechowywania
  pełnego IP.
- W panelu klienta: zakładka „Statystyki" z osadzonym share-linkiem Umami (read-only, per website).

### Robota

1. Compose + schemat + migracja bootstrap (`CREATE SCHEMA IF NOT EXISTS umami`) — pół dnia.
2. Caddy + healthcheck + wpięcie w `prod-deploy-ghcr.sh` (`APP_SERVICES += umami`) — pół dnia.
3. Provisioning: przy zakładaniu hostingu tworzymy website w Umami przez API i zapisujemy `websiteId`
   przy subskrypcji — 1 dzień.
4. Zakładka w client-panel + wstrzyknięcie snippetu do vhosta klienta (opcjonalne, za zgodą) — 1 dzień.
5. Dokumenty: klauzula w polityce prywatności + **test równowagi** dla prawnie uzasadnionego interesu
   (art. 6 ust. 1 lit. f RODO) — bo IP to dana osobowa (TSUE, Breyer C-582/14) — pół dnia.

**Razem ~3,5 dnia. Koszt infrastruktury: ~0 zł** (kontener na istniejącym serwerze, baza współdzielona).

### Uczciwa granica komunikatu

Po wdrożeniu wolno nam mówić: *„statystyki odwiedzin bez cookies — działają bez banera zgód"*.
**Nie wolno**: *„bez danych osobowych"*. IP jest przetwarzane, zanim zostanie zahaszowane.
Poprawna formuła: **„bez cookies i bez przechowywania adresów IP"**.

---

## 6. Twoje pytanie #1 — co rozszerzyć w GTM i politykach

### 6.1 GTM — czego brakuje

| Do dodania | Po co | Ryzyko |
|---|---|---|
| `event_id` (UUID) w `dataLayer` przy każdym zdarzeniu wysyłanym do Meta | Bez tego Pixel i CAPI **liczą zakup dwa razy** | brak |
| `transaction_id` przy `purchase` | Deduplikacja w GA4; w 2026 walidacja jest ostrzejsza | brak |
| SHA-256 z e-maila w `user_data` (panel, **po zgodzie**) | Enhanced Conversions + EMQ w Meta | wymaga zgody marketingowej |
| Trigger `scroll_depth` 25/50/75/90 | Twoje „jak głęboko czytają" | brak |
| `form_start` (pierwszy focus w formularzu) | Mierzy porzucenia formularza, nie tylko wysyłki | brak |
| `outbound_click` + `file_download` | Enhanced measurement tego nie łapie na custom komponentach | brak |
| `video_progress`, jeśli wejdą materiały wideo | — | brak |
| Zmienna `consent_state` w dataLayer | Debug: natychmiast widzisz, czemu tag nie odpalił | brak |

**Czego NIE dodajemy, mimo że technicznie się da:** `user_id` niezalogowanych, fingerprintingu,
session recordingu (Hotjar/Clarity) na stronach z formularzami. Pierwsze dwa łamią nasze pozycjonowanie,
trzecie rejestruje treść wpisywaną do pól i wymaga osobnej zgody plus DPIA.

### 6.2 Polityka prywatności — co dopisać

1. **Klauzula analityczna** — po wdrożeniu Umami: cel, podstawa (art. 6 ust. 1 lit. f), zakres
   (IP hashowany, nieprzechowywany), okres retencji, brak transferu poza EOG.
2. **Rejestr zgód** — dziś cookie `cookies_consent` trzyma stan w przeglądarce. Do wykazania zgody
   (art. 7 ust. 1 RODO) potrzebny jest **log po stronie serwera**: timestamp, wersja polityki, zakres zgody,
   hash identyfikatora. Bez tego nie udowodnisz zgody przed UODO.
3. **Wersjonowanie polityki** — `cookies_consent` ma `v1`. Zmiana zakresu przetwarzania musi bumpować
   wersję i **ponownie pytać**, inaczej opierasz się na zgodzie na coś innego.
4. **Meta jako współadministrator** — Custom Audiences to współadministrowanie. Potrzebny
   *Controller Addendum* (jest w Business Managerze) i wzmianka w polityce.
5. **Lista podprocesorów** — dopisz Google (GA4/Ads), Meta, Stripe, AWS SES, Cloudflare Turnstile.
   Obiecujemy „listę podprocesorów online", więc musi być kompletna.
6. **E-mail marketing** — double opt-in, log zgody, link rezygnacji w każdej wiadomości. Bez tego
   sekwencja z zadania #14 nie może ruszyć.

---

## 7. Twoje pytanie #3 — co zmienić, żeby pomiar działał lepiej

Kolejność wg stosunku ryzyka do wysiłku.

1. **Cross-domain `verris.pl` ↔ `panel.verris.pl`** *(krytyczne)*.
   `purchase` i `sign_up` odpalają się w panelu, reszta lejka na www. Bez wspólnego kontenera GTM,
   listy *referral exclusions* i auto-tagowania Google Ads pokaże **zero konwersji** przy działających
   kampaniach. To najczęstsza przyczyna „kampania nie konwertuje". Szczegóły: `setup-pomiaru-i-kampanii.md` §2.
2. **Włącz `sla.creditsEnabled`** albo zdejmij słowo „automatycznymi" z copy *(krytyczne, patrz §4B)*.
3. **`event_id` w dataLayer** — bez tego Meta zawyży konwersje, a Ty przeszacujesz ROAS i dosypiesz budżet
   do kampanii, która nie zarabia.
4. **Natywny tag konwersji Google Ads równolegle do importu z GA4.** Import z GA4 jest wrażliwy na zmiany
   po stronie Google. Natywny tag jako sygnał do Smart Biddingu, GA4 do atrybucji cross-channel.
5. **Custom dimensions w GA4** — bez rejestracji parametrów (`cta_location`, `plan`, `method`) zobaczysz,
   że `cta_click` się odpalił, ale nie **który przycisk**. Parametry bez rejestracji nie trafiają do raportów.
6. **Test zgody przy każdym wdrożeniu** — odmów zgody, sprawdź w Network, że nie leci nic do
   `google-analytics.com` ani `facebook.com`. To jedyny test, którego wynik może kosztować karę.

---

## 8. Twoje pytanie #4 — instrukcja: jak dać mi dostęp do danych reklamowych

### Wybór: adspirer + darmowe źródła. Odrzucone: ahrefs, supermetrics.

**Dlaczego tak.** Przy jednym pakiecie, jednej kampanii i budżecie 500–1000 zł/mies ahrefs (~99 USD/mies)
i supermetrics to koszt bez pokrycia. Google Search Console, Keyword Planner i GA4 dają wszystko,
czego potrzeba, za 0 zł. Adspirer bierzemy, bo bez niego planuję kampanie na wyczucie zamiast na danych CPC.

### Krok po kroku — autoryzacja adspirer

Tej sesji **nie da się** użyć do OAuth (jest nieinteraktywna). Zrób to raz, u siebie:

1. Otwórz **Claude Desktop → Ustawienia → Konektory** (albo w sesji interaktywnej wpisz `/mcp`).
2. Znajdź **`adspirer`** na liście serwerów wymagających autoryzacji.
3. Kliknij **Authorize / Connect**. Otworzy się okno Google.
4. Zaloguj się kontem, które ma dostęp do **Google Ads MCC** Verris. Zatwierdź zakres uprawnień.
5. Wróć, powtórz dla **Meta** (konto z rolą w Business Managerze Verris).
6. Sprawdź, że status to **Connected**.
7. Napisz mi w nowej wiadomości: *„adspirer podłączony"*. Wtedy odpalę
   `adspirer-ads-agent:keyword-research` na realnych CPC i przygotuję strukturę kampanii na danych.

**Czego nie robimy:** nie podawaj mi tokenów, kodów autoryzacyjnych ani callback URL. Nie są mi potrzebne
i nie powinny trafiać do czatu.

### Darmowy stack, który obsługujesz Ty

| Narzędzie | Do czego | Co mi przekazujesz |
|---|---|---|
| Google Search Console | pozycje, CTR, zapytania | eksport CSV zapytań co miesiąc |
| Keyword Planner (w Google Ads) | wolumeny, widełki CPC | zrzut lub CSV przy planowaniu |
| GA4 → Eksploracje | ścieżki, scroll, engagement time | CSV, gdy analizujemy lejek |
| Meta Ads Manager | wyniki kampanii, EMQ | zrzut ekranu wystarczy |

To realnie nie jest wąskie gardło przy jednej kampanii. Wąskim gardłem jest cross-domain z §7.1.

---

## 9. Co dalej — proponowana kolejność

1. **Dziś:** zweryfikuj `sla.creditsEnabled` i treść regulaminu vs `sla-credit.scheduler.ts` (§4A, §4B).
2. **Przed pushem:** przejrzyj zmiany w copy, popraw ręcznie `oferta.md` w skillu (§4C).
3. **Push + deploy.** Zmiany w `features.ts` i `site.ts` nie wymagają migracji Payloada.
   Wpis blogowy jest `status: draft`, więc CMS nie wymaga akcji — ale jeśli opublikowałeś go ręcznie,
   podmień treść w `/admin`.
4. **Potem:** cross-domain (§7.1) + `event_id` (§7.3). Dopiero po tym uruchamiamy kampanie.
5. **Równolegle:** Umami (§5), żeby claim mógł wrócić.
6. **Autoryzuj adspirer** (§8), kiedy będziesz miał 5 minut.

Zadania #14 (formularz leada + SES), #15 (P2 SEO) i #16 (globalsy CMS) czekają nietknięte.
