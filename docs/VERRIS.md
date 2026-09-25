# Verris — jedno miejsce na decyzje i kierunek

**Zasada (2026-09-22):** stan, zadania, plan i dowody są WYŁĄCZNIE w `audyt/dane/*.csv`
(macierz, sprinty, zadania) — z nich generują się dashboardy i `plan-startowy-2026-08/`.
Uzasadnienie zmiany → kolumna „Uwagi" w macierzy albo „opis" zadania. Decyzje, kierunek
produktu i zasady → **ten plik**, jako nowa sekcja. Nie tworzymy nowych `docs/zadania/*.md`,
ADR-ów ani raportów sprintów. Wszystko, co było wcześniej, jest w `docs/archiwum/` (historia,
nie źródło prawdy). Poza tym zostają tylko dokumenty operacyjne i prawne: `docs/ops`,
`docs/legal`, `docs/mail`, `docs/brand`.

---

## Decyzje

### 2026-09-22 — faktury VAT wystawia program księgowy (PB-13, FAK-01)
Panel wystawia **dokument rozliczeniowy** (seria VDR/VDK), fakturę VAT operator wystawia w programie
księgowym i dopisuje jej numer w panelu admina (`/invoices/czeka-na-fakture`). Przełącznik
`faktury.tryb` = `zewnetrzny` (domyślnie) | `panel`. Własny moduł KSeF zamrożony do integracji
z programem księgowym po API. Pytanie do księgowej: faktura zaliczkowa przy doładowaniu portfela (M-34).

### 2026-09-22 — węzeł #1: Hetzner AX102 (PB-14)
259 € netto/mies. (setup ~129 €). Dane klientów w DE/FI (UE) → polityka prywatności i DPA muszą to
opisać przed startem. **Zakup dopiero w sprincie 18** (żeby serwer nie stał pusty). Na później:
Beyond (Poznań) / inne serwerownie; EX130-R po migracji 15 stron → węzeł #2.

### 2026-09-22 — kolejność prac
Najpierw panel na obecnej infrastrukturze (design, poczta, asystent v1, tickety v2, narzędzia
operatora, backup, rozliczenia), potem zapora control-plane i strict, dokumenty, **węzeł (zakup)**,
ścieżka pierwszego klienta, GO. Po starcie: asystent wykonujący akcje, tryb agencji, bezpieczne
aktualizacje WP z testem wizualnym, MCP, checklisty RODO/dostępności.

### 2026-09-24 — white label: klient nie widzi DirectAdmina
- **Pełny white label** — decyzja właściciela. Mówimy „panel Verris” / „panel hostingowy”; nazwa
  DirectAdmina znika z verris.pl, panelu, maili i dokumentów prawnych (regulamin §1 pkt 14 i §10,
  informacja dla konsumenta, polityka prywatności, lista podwykonawców). Pilnuje
  `apps/api/src/test/bez-nazwy-directadmina.spec.ts`; wyjątek: kreator migracji (panel u poprzedniego dostawcy).
- **Granica:** nie twierdzimy, że silnik hostingu jest nasz — „własny panel” to prawda, „własny serwer
  hostingowy” byłby wprowadzeniem w błąd. Licencja DA zabrania tylko zmian w binariach; branding przez
  oficjalną warstwę Evolution.
- **Na węźle (PB-25, sprint 18):** panel hostingowy, phpMyAdmin i webmail pod własną nazwą na 443,
  branding Evolution, własne strony domyślne, przegląd maili systemowych DA.

### 2026-09-23 — dokumenty prawne i KSC (sprint 17)
- **Publikacja bez zewnętrznego przeglądu prawnika** — decyzja właściciela; dokumenty aktualizuję do
  stanu faktycznego. Publikujemy raz, tuż przed pierwszym klientem (każda publikacja = ponowna zgoda
  wszystkich użytkowników), po domknięciu D3 węzła (kopie kont, ClouDNS).
- **Kontakt:** kontakt@, rodo@, abuse@, security@verris.pl + telefon firmowy. Skrzynki muszą istnieć
  i być czytane przed publikacją.
- **Faktury VAT:** program w chmurze Firmino (Streamsoft) — podwykonawca w polityce prywatności;
  po starcie bezpośrednia integracja z KSeF.
- **AI (OpenAI) wyłączone na start** — włączenie dopiero po DPA z OpenAI i wpisie do dokumentów.
- **SLA:** rekompensata automatyczna bez wniosku (regulamin 1.1.0 już to mówi) — kod pod progi w N-16.
- **KSC/NIS2:** wg FAQ KSC rejestracja domen i DNS = podmiot kluczowy niezależnie od wielkości.
  Decyzja właściciela: wpis do wykazu w ciągu 6 miesięcy od uruchomienia sprzedaży domen / DNS dla
  klientów (nie przed 3.10.2026). Ryzyko przyjęte świadomie: jeśli organ uzna, że przesłanki są
  spełnione wcześniej, termin 3.10.2026 minie. Pilnuje PB-24.

### 2026-09-23 — nawigacja: nic nie wymaga szukania (PB-23)
Każdy widok w panelu klienta, admina i staff ma wejście z menu albo z zakładki logicznego rodzica.
Nowa strona bez wejścia w nawigacji = niedokończona. Wyjątki (szczegóły rekordu, kroki kreatora)
tylko na jawnej liście przy strażniku w CI.

### 2026-09-23 — dostęp SSH do produkcji
Root na panelu ma dokładnie dwa klucze: operatora (Termius) i CI (`verris-ci-deploy`, tylko w sekretach
GitHuba). Klucz Cursora i stary `panel-app-key` wycofane. Panel → węzły: osobna para
`/root/.ssh/verris_node_deploy` generowana **na panelu** (prywatna nigdy go nie opuszcza), pubkey w
`VERRIS_NODE_DEPLOY_SSH_PUBKEY`. Operator wchodzi na węzeł przez panel (`verris-node ssh`).

### 2026-09-23 — badge na stronę klienta (PB-22)
Badge mają pracować dla klienta, nie tylko reklamować Verris: pieczęć zaufania, dostępność na żywo,
polecenie z prowizją, EKO. Twierdzenia na badge'ach tylko takie, które kod sprawdza na bieżąco;
gdy warunek przestaje być spełniony, badge znika (nie pokazuje złej wiadomości). Bez ciasteczek
i zasobów z zewnątrz; osadzanie przez iframe z sandboxem + mały loader.

### 2026-09-23 — VAT, waluty i doładowania (M-09, M-10, M-34)

- **Stawki (M-09).** Polska: 23%. Firma z UE z numerem VAT-UE ważnym w VIES: „np”, adnotacja „odwrotne obciążenie” (nie 0% — 0% dotyczy towarów). Konsument z UE: 23%, dopóki sprzedaż usług elektronicznych konsumentom z innych krajów UE jest poniżej 42 000 zł w roku bieżącym i poprzednim (art. 28k); po przekroczeniu — stawka kraju klienta przez OSS, po rejestracji (przełącznik w panelu admina, alarm przy 80% progu). Spoza UE: „np”, miejsce świadczenia poza krajem. Wynik VIES zapisywany przy dokumencie (dowód na dzień transakcji).
- **Cena dla klientów bez polskiego VAT** (odwrotne obciążenie, spoza UE): **netto** — przy doładowaniu 1 zł = 1,23 K.
- **Waluty (M-10).** Płatność kartą w EUR albo USD, portfel dalej w K. Przeliczenie po kursie średnim NBP (tabela A) z ostatniego dnia roboczego przed dniem wpłaty; dokument w walucie wpłaty z kwotą VAT w PLN (art. 31a, art. 106e ust. 11).
- **Prepaid (M-34).** Dokument przy **doładowaniu** (realna wpłata), przy wydawaniu K dokumentów już nie ma. Bonusy (promocje, rekompensaty SLA, prowizje) nie są wpłatą — bez dokumentu. Saldo sprzed przełączenia: raport `ops/sql/m34-saldo-bez-dokumentu.sql`, decyzja operatora.
- **Do potwierdzenia z księgową przed startem sprzedaży:** kwalifikacja K jako bonu jednego przeznaczenia (VAT przy doładowaniu) — dla klientów z odwrotnym obciążeniem i spoza UE obowiązek podatkowy powstaje zwykle przy wykonaniu usługi, a nie przy wpłacie; brzmienie adnotacji dla klientów spoza UE.

### 2026-09-23 — co z roadmapy wchodzi przed start

- Właściciel przejrzał roadmapę po starcie (tablica „Verris po starcie”, wybory zapisane przy każdej pozycji) i oznaczył ok. 117 pozycji jako „przed startem”. 15 z nich zamknięto tego samego dnia; zostało 99 (≈1566 h).
- **Data startu bez zmian** (koniec stycznia 2027). Wybrane pozycje robimy w kolejności: krytyczność WYSOKA → to, co rynek PL już ma → reszta; w obrębie grupy najpierw to, co nie wymaga węzła. Co nie zmieści się do startu, przechodzi za start bez zmiany daty.
- M-07 (duplikat faktury), M-09 (stawki VAT ≠ 23%), M-10 (waluta obca) — **przed startem, w panelu**, mimo że fakturę VAT wystawia Firmino: dotyczy dokumentów, które pokazuje panel.
- Źródło prawdy o wyborach: tablica „Verris po starcie” (kolumna „Przed startem / Po starcie”).

### 2026-09-25 — decyzje z formularza (bez węzła do zakupu serwera)
- **C-19** limit FTP per konto — poza zakresem (DirectAdmin go nie ma; obowiązuje limit konta).
- **H-04** kopie — pokazujemy **30 dni**: kopia poza serwerem z każdego z ostatnich 30 dni, przywracana samodzielnie z panelu.
- **I-07** skan podatności WordPressa — najlepsze darmowe na start, płatne narzędzie później.
- **G-12** czyszczenie malware — na start darmowy ImunifyAV + obsługa; płatny ImunifyAV+ po starcie.
- **L-11/L-12** AI — dwa poziomy wybierane w adminie (Ustawienia → Asystent AI): **szybki** (czat, dymki) = OpenAI gpt-5.6-luna, **analiza** (prognozy zasobów, szkice odpowiedzi BOK) = Claude Sonnet 5. Nowszy model = wybór z listy albo wpisanie identyfikatora, bez wdrożenia. Ceny edytowalne (USD / 1 mln tokenów, domyślnie z oficjalnych cenników), miesięczny limit USD na konto klienta (czat klienta + prognozy; obsługa bez limitu, domyślnie 2 USD), koszt każdego wywołania w `AiInteractionLog` (tokeny + `costUsd`), raport: miesiąc, prognoza, 30 dni per funkcja/model, top klienci. Embeddings RAG zawsze OpenAI text-embedding-3-small (Anthropic nie ma API embeddingów). Klucze: `AI_API_KEY` (OpenAI), `ANTHROPIC_API_KEY` — dodaje właściciel; brak klucza = poziom wyłączony (fallback do wsparcia, nie błąd).
- **N-16** automatyczne rekompensaty SLA — włączone na start.
- **PROD-03** konta testowe — zostają jako wewnętrzne (poza statystykami i fakturami).
- **Węzeł testowy** — mały serwer testowy teraz, żeby przejść testy węzłowe przed docelowym AX102.
- **B-08/B-09** aplikacje Node.js i Python — przez CloudLinux Selector (zakładka Aplikacje). Kod aplikacji w katalogu domowym poza `public_html`, serwer podaje go pod domeną i ścieżką; wersje interpretera tylko te włączone na węźle. Sprawdzenie na węźle testowym (D3 w `audyt/dane/wezel.csv`).

### 2026-09-25 — decyzje z formularza (druga tura)
- **X-20** Prisma 7 — migracja **przed startem** (weryfikacja przez CI).
  - Zrobione: Prisma 7.10.0 + `@prisma/adapter-pg`. Adres bazy dla CLI w `libs/database/prisma.config.ts` (czyta `libs/database/.env`, zmienne środowiska mają pierwszeństwo). `PrismaClient` z `@verris/database` sam dokłada adapter — w kodzie nic się nie zmienia. Seed: `migrations.seed` w configu; `migrate reset` już nie seeduje. Migracje na produkcji: `prisma migrate deploy --config=libs/database/prisma.config.ts`. Po pullu: `pnpm install`.
- **G-21** anty-DDoS — na start ochrona DDoS Hetznera; **Cloudflare po starcie**.
- **D-14** PostgreSQL i **E-23** kalendarz/kontakty (CalDAV/CardDAV) — robimy teraz, test na węźle testowym.
- **PB-06** landing `/przenies-strone` i **PB-07** treści/cennik verris.pl — projekt do akceptacji właściciela; publikacja dopiero po zgodzie.

### 2026-09-25 — sesje paneli i impersonacja (przegląd bezpieczeństwa)
Ciasteczka sesji admina i obsługi są **host-only** (`admin_session`, `staff_session`); stare ciasteczka
na `.verris.pl` panel kasuje przy logowaniu/wylogowaniu — po wdrożeniu każdy operator loguje się raz
ponownie. Impersonacja: w URL idzie jednorazowy kod (60 s), nie token. Grafana: SSO przez bilet API
i własne host-only ciasteczko `grafana_session` (trasa `/verris-sso` w Caddyfile).
Ograniczenie: kody trzymane w pamięci jednej repliki API — przy skalowaniu API poziomo przenieść do Redis.

### 2026-09-22 — DNS
ClouDNS **Premium L** (14,95 USD/mies., 400 stref) jako zewnętrzny secondary za DirectAdminem,
NS pod marką Verris — kupujemy razem z węzłem. DDoS Protected nie na start. Openprovider jako
darmowy trzeci secondary.

---

## Wizja panelu (research 2026-09)


## 1. Co mamy dziś (punkt wyjścia)

- **Asystent:** `HostingAssistant` (czat w panelu klienta) — odpowiada z bazy wiedzy (RAG) z kontekstem
  usługi (`ai-chat.service.ts`, `buildServiceContext`), log interakcji w `AiInteractionLog`.
  **Nie wykonuje akcji**, nie jest proaktywny.
- **FirstStepsAssistant** — przewodnik pierwszych kroków w usłudze.
- **Tickety:** statusy i cykl braku odpowiedzi (SUP-V2), gotowe odpowiedzi (`canned-response.service.ts`,
  `canned-response-picker` w panelu staff), paleta poleceń w staff/admin.
- **Design:** Tailwind + własne komponenty `components/panel`, ciemny motyw, ikony lucide.

---

## 2. Czego uczą liderzy z USA/UE

| Wzorzec | Kto robi najlepiej | Dla kogo u nas |
|---|---|---|
| Auto-aktualizacje WP z testem wizualnym (zrzuty stron) i automatycznym rollbackiem | Kinsta, Cloudways SafeUpdates, WP Engine | laik, agencja |
| Test aktualizacji na tymczasowym stagingu przed produkcją | Cloudways | pro, agencja |
| Agent AI **wykonujący akcje** (DNS, backup, migracja) z kartą potwierdzenia | Hostinger (Kodee/Agent) | laik |
| Uprawnienia AI w warstwach: odczyt / zmiana odwracalna / destrukcyjna tylko po opt-in („Power Mode") | SiteGround | wszyscy |
| Proaktywna diagnoza: przyczyna + naprawa jednym kliknięciem za zgodą | Cloudways Copilot SmartFix | laik |
| Globalne wyszukiwanie pod „/" + centrum zadań w tle | Rocket.net | pro |
| Przekazanie strony klientowi, panel bez marki hosta, raporty z logo agencji | Hostinger Agency, xCloud, Ploi | agencja |
| Klonowanie strony jako szablon | Hostinger | agencja |
| Łańcuch Dev → Staging → Live | Raidboxes | pro |
| Wizualizacja cache (serwer / edge / CDN), analityka botów czytelna dla laika | Kinsta, Rocket.net | wszyscy |
| Lighthouse / Core Web Vitals w panelu, APM | WP Engine, Kinsta | pro |
| Serwer MCP / API z piaskownicą (agent klienta — Cursor, Claude — pracuje na koncie) | Ploi, WP Engine | pro |
| Status page dla klientów agencji | Ploi | agencja |
| Samodzielny upgrade/downgrade, tymczasowy upgrade | Raidboxes | laik |

**Znane zarzuty wobec AI w hostingu** (do uniknięcia): kredyty za naprawę problemów hosta
(Hostinger, Cloudways, IONOS), AI jako mur przed człowiekiem, pełne uprawnienia admina bez
dziennika zmian.

---

## 3. Propozycje dla Verris

### 3.1 Asystent „Verris Copilot" — dymki + czat + akcje

1. **Dymki kontekstowe (proaktywne)** przy metrykach i ekranach — najwyżej jeden na ekran,
   „nie pokazuj więcej". Przykłady: „Dysk 92% — wyczyścić cache i stare logi? Zwolni ~3 GB",
   „Domena nie wskazuje na nas — pokaż, co ustawić u rejestratora", „SPF bez DKIM — poczta może
   trafiać do spamu. Naprawić?".
2. **Czat** na pytania otwarte (jest — rozszerzyć o akcje).
3. **Akcje w trzech klasach:** odczyt (bez pytania) → zmiana odwracalna (karta z podglądem skutków)
   → destrukcyjna/płatna (jawny opt-in, backup przed, „Cofnij" przez 24 h). Twarde zakazy
   (usuwanie konta, zmiana planu bez zgody). Każda akcja AI w dzienniku audytu.
4. **Doradca decyzji:** „Czy potrzebuję wyższego planu?" — na danych zużycia, z prognozą i kosztem;
   czasem odpowiedź „nie" (buduje zaufanie).
5. **Tłumacz błędów:** przy każdym 500 / wpisie w logu „wyjaśnij po polsku" i „napraw".
6. **Zawsze widoczne „porozmawiaj z człowiekiem"** — ticket z automatycznym streszczeniem rozmowy.
7. **Diagnoza i naprawy problemów po naszej stronie — za darmo.** Bez kredytów za naprawianie hosta.

### 3.2 Funkcje „więcej niż konkurencja"

- **Bezpieczne aktualizacje WP** (test wizualny + rollback) — w cenie, a nie za 2–3 USD/stronę.
- **„Co się zmieniło od ostatniej wizyty"** — oś zdarzeń prostym językiem.
- **Porównanie przed/po** przy zmianie PHP, cache, wtyczki (Core Web Vitals + zrzut).
- **Checklisty PL/UE:** RODO, cookies, dostępność (EAA 2025), KSeF przy WooCommerce — z naprawami.
- **Dostarczalność poczty** — pełna diagnoza SPF/DKIM/DMARC z gotowymi rekordami (spina się ze sprintem 7).
- **Tryb agencji:** klienci agencji, przekazanie własności, white-label, miesięczny raport dla
  klienta końcowego w języku biznesu (uptime, aktualizacje, zablokowane ataki, szybkość).
- **MCP / API z zakresami** — „Cursor może czytać logi i robić staging, nie może usuwać".
- **Tryby panelu:** Prosty (laik) / Pełny (pro) / Agencja — ten sam panel, inna gęstość informacji
  (zaczątek jest: `verris-simple-mode`).

### 3.3 Design — „nie wygląda jak Tailwind ani jak AI"

Kierunek do przygotowania jako osobny projekt (makiety przed kodem):
- **Własny system wizualny** zamiast domyślnych klas: własna typografia (para krojów z charakterem,
  nie Inter), własna skala odstępów i promieni, jeden wyrazisty kolor marki zamiast gradientów
  indygo-fiolet, ikony z jednego, spójnego zestawu (lub własne — są już `dns-mint.svg`).
- **Mniej kart, więcej struktury:** listy i tabele o zmiennej gęstości, zamiast siatki identycznych
  kafli z cieniem i zaokrągleniem.
- **Interakcje, które coś znaczą:** stany ładowania pokazujące postęp realnej operacji, podgląd
  skutku przed kliknięciem, cofanie zamiast „Czy na pewno?", skróty klawiszowe i „/" do wyszukiwania.
- **Pusty stan jako instrukcja** — każdy pusty ekran mówi, co zrobić dalej.
- **Mikrocopy po ludzku** — bez żargonu dla trybu Prosty.

**Kierunek po przeglądzie inspiracji (Dribbble, 2026-09-22) — co bierzemy, czego nie:**
- Bierzemy: liczby jako bohater („12,4 / 50 GB”, jednostka mniejsza, mono); pasek segmentowy zajętości
  (pliki / poczta / bazy / kopie) zamiast pierścieni; mikro-słupki 7 dni przy każdej liczbie z wyróżnionym
  „dziś”; wykres słupkowy z jednym podświetlonym słupkiem i dymkiem; status jako kropka + słowo na końcu
  wiersza; historia zdarzeń pogrupowana po dniach (Dziś / Wczoraj); przełącznik klienta w bocznym pasku
  (tryb agencji); tabela usług z paskiem obciążenia w wierszu.
- Nie bierzemy: ilustracji 3D i maskotek, bannerów „zaproś znajomego”, gradientowych kart-plam,
  siatki identycznych kafli z cieniem, fioletowo-niebieskich akcentów.
- Marka zostaje: sosna/mięta (`globals.css`), Schibsted Grotesk (nagłówki i liczby), Hanken Grotesk
  (tekst), JetBrains Mono (etykiety, dane techniczne). Jasny motyw równorzędny z ciemnym.
- Struktura (uwagi właściciela do v1): dwa widoki — **usługa hostingowa** (zasoby konta, lista stron
  z technologią i ruchem, poczta/bazy/FTP/kopie całego konta) i **strona/domena** (zakładki: przegląd,
  domena i DNS, SSL, pliki, baza, poczta, PHP, przekierowania, logi; narzędzia zależne od wykrytej
  technologii — WordPress, PrestaShop, Laravel, statyczna, przekierowanie). Boczny pasek łączy menu
  globalne z kontekstem usługi (drzewo stron + sekcje konfiguracji); rzadkie pozycje w „Więcej”.
  Każda liczba i wykres ma dymek po najechaniu (także z klawiatury).
- Charakter (uwagi właściciela do pulpitu): powitanie „Cześć, Imię!” na pulpicie; box użytkownika w lewym
  dolnym rogu (ustawienia, bezpieczeństwo, zespół, powiadomienia, cookies, wyloguj); sekcja „Zdrowie usług”
  (wynik 0–100 + punkty kontroli z dymkami); zostaje delikatna animowana „kometa” na krawędzi (nierówne tempo,
  jak `spin-border-glow`) — kilka naraz na różnych elementach (pasek liczb, asystent, blok usługi, box
  użytkownika), każda w innym tempie i fazie, więc pojawiają się w różnych miejscach; do tego oddychające kropki
  stanu, słupki rosnące przy wejściu i błysk na słupku „dziś”. Wszystko wyłączane przy reduced-motion.
- Przełącznik Prosty/Pełny nie siedzi w górnym pasku (za ciasno na telefonie): jest w menu boxa użytkownika
  (z opisem, co zmienia), bieżący widok widać pod e-mailem, a w „/” są polecenia „Widok prosty / pełny”.
- Logo zawsze z krzywych: `branding/01_logo/verris-lockup-krzywe-{jasne,ciemne}.svg`, `verris-wordmark-krzywe.svg`;
  w kodzie `VerrisWordmark` (`components/logo.tsx`) i logo na www — bez zależności od fontu.
- Wzorzec: ekran usługi hostingowej (artefakt prywatny „Verris — ekran usługi”). Po akceptacji
  przenosimy tokeny i komponenty do `apps/client-panel` i przerabiamy kolejne ekrany (PB-16).

**Mapa: obecny panel klienta → nowy design (zasada: nic nie ginie).** PB-16 odhacza wiersz po wierszu.

| Obecnie | Nowe miejsce |
|---|---|
| Pasek górny: WalletBadge, NotificationBell, ImpersonationBanner, IncidentBanner, ReConsentModal, wylogowanie, cookies | pasek górny (portfel z saldem, dzwonek, „/”, Prosty/Pełny, motyw); banery nad treścią bez zmian; wylogowanie i cookies w menu klienta. ✅ 2026-09-22: motyw jasny/ciemny treści (`ThemeToggle`, `<html data-vtheme>`, menu boczne zawsze ciemne); modale, menu rozwijane i toasty też w motywie; wyszukiwarka „/” na środku ekranu z przyciemnieniem |
| Pulpit (StatCard, DashboardCharts, ServicesHealthOverview, QuickAction, OnboardingWizard, ProactiveHints) | ✅ 2026-09-22: `dashboard-home.tsx` — powitanie, pasek liczb (usługi, domeny, saldo, zgłoszenia), tabela usług, zdrowie usług (wynik + punkty kontroli), portfel 12 mies., asystent (z rekomendacji), pierwsze kroki, szybkie akcje, EKO, hosting w skrócie. Wykresy „status usług/zgłoszeń” zastąpione paskiem liczb i zdrowiem usług |
| Usługi: lista, nowa usługa | ✅ „Usługi” — tabela (stan, zdrowie, zasoby, odnowienie, cena), sekcje aktywne/zakończone; kreator zamówienia bez zmian w działaniu |
| Usługa hostingowa — Przegląd (gauges, HealthCheck, FirstSteps, DomainPointing, Forecast, uptime, UnpaidServiceBanner) | ✅ widok usługi: pasek liczb (dysk, transfer, CPU/RAM, kopie z 14 dni), tabela domen → widok strony, zasoby konta, „Co się działo”, asystent, dane dostępowe (hasło zakryte) |
| Karta „Dane dostępowe / Adresy serwera i limity” (ServiceConnectionCard, AccountStatsCard) | box „Dane dostępowe” + „Zasoby konta” |
| Subskrypcja (plan, historia rozliczeń, zmiana planu `/plan`, rezygnacja na koniec okresu / od razu) | ✅ box „Płatności za usługę” + sekcja „Subskrypcja i płatności” (pasek liczb z postępem okresu, historia rozliczeń po polsku, rezygnacja); `/plan` z paskiem liczb |
| Autoskalowanie (włącz/wyłącz, CPU/RAM/dysk, limit miesięczny, bezpiecznik, historia kosztów), tryb EKO i raport energii | ✅ box „Autoskalowanie” + strona „Autoskalowanie i EKO” (limity teraz vs plan, koszt 30 dni z paskiem bezpiecznika, EKO w prawej kolumnie) |
| Zakładki usługi: Domeny & DNS, SSL, Pliki, Bazy, Poczta (+MailExtras), FTP, Cron, PHP, Aplikacje, Narzędzia WWW (przekierowania, HTTPS/www, hotlink, blokada IP, Basic Auth), Kopie (harmonogram, offsite, przywracanie), WAF, Monitoring, Staging, Deploy (Git), Usage, Subdomeny, Domeny dodatkowe | sekcje usługi w bocznym pasku (poziom konta) + zakładki widoku strony (poziom domeny): DNS, SSL, Pliki, Baza, Poczta, PHP, Przekierowania (= Narzędzia WWW), Logi; Staging/Deploy per strona. ✅ 2026-09-22: widok strony `/dashboard/services/{id}/sites/{domena}` (Przegląd, DNS, SSL, Pliki, Baza, Poczta, PHP, Przekierowania); stare zakładki w palecie wzorca przez `.v2-skin` + `HostingTabShell` jako sekcja. Brak w API: ruch/TTFB/5xx i technologia per domena, logi (historia kopii z 14 dni czytana z nazw plików DirectAdmina) — zakładki „Logi” nie ma, dopóki nie ma danych |
| Osobne strony `/dashboard/{dns,databases,ssl,ftp,cron,php,apps,backups,email,file-manager}` | te same sekcje w kontekście usługi (stare adresy przekierowują) |
| Domeny: lista, szczegóły, zakup, dane rejestrującego | „Domeny” w menu globalnym. ✅ 2026-09-22: data końca rejestracji w tabeli i licznik „N wygasa” w menu (z pola `expiresAt` rejestratora) |
| Płatności: portfel (doładowanie, odświeżanie salda), faktury, dodatki rozliczeniowe | ✅ „Płatności”: pasek liczb, portfel 12 mies., historia transakcji z opisami po ludzku (`lib/wallet-tx-label.ts`), doładowanie i auto-doładowanie w prawej kolumnie |
| Centrum pomocy (lista, nowe, wątek), Baza wiedzy | ✅ „Centrum pomocy”: pasek liczb, tabela zgłoszeń, wątek ze ścieżką i stanem; baza wiedzy w „Więcej” i w wyszukiwarce |
| Migracje, Dodatki, VPS/Cloud, Reseller, Kalkulator, Program EKO, Partnerski, IAM, E-mail marketing, Analityka, API, Ustawienia | „Więcej” w bocznym pasku (IAM i ustawienia też w menu klienta). ✅ nagłówki jak reszta panelu; EKO z paskiem liczb; Ustawienia z zakładkami podkreślanymi |
| HostingAssistant (dymek) | asystent v1 (PB-17); kreator stron usunięty 2026-09-25 (B-19) — wraca po starcie jako nowa funkcja, nie ze starego kodu |
| Ekrany bez logowania: logowanie, rejestracja, reset hasła, weryfikacje, zaproszenie, dokumenty prawne | ten sam system wizualny, bez zmian w działaniu |

**Zasady wyglądu przyjęte w PB-16 (obowiązują dla nowych ekranów):**
- własne klasy z wariantami (np. `max-lg:pt-mobile-header`) tylko jako `@utility` w `globals.css` — Tailwind 4 nie generuje wariantów dla klas z `@layer utilities` (2026-09-25: tytuły stron chowały się pod paskiem na telefonie);
- liczby w tekstach dla klienta przez `liczba()` z `lib/liczba.ts` (przecinek dziesiętny), nie `toFixed`;
- nic się nie chowa: bez wielokropka w treści, bez ukrywania kolumn na telefonie (tabela `v2-stack` rozkłada się na bloki z nazwą kolumny), bez przewijania w bok (długie wartości łamane, liczby i daty `whitespace-nowrap`);
- stary kod dostaje paletę wzorca przez `.v2-skin` w `globals.css`; nowe ekrany piszemy od razu na tokenach i klockach z `components/panel/v2.tsx`;
- dymki (`data-tip`) mieszczą się na ekranie (`placeTip`) i są czytane przez czytnik ekranu (`aria-describedby`);
- kontrast AA w obu motywach (bursztyn jasnego motywu `#955f0f`);
- martwy węzeł DirectAdmina odpada od razu (bezpiecznik w `libs/directadmin-sdk/src/node-circuit.ts`), panel pokazuje „chwilowo niedostępny” zamiast czekać.

**PB-19 (kod 2026-09-25, D3 na węźle):** ruch 7 dni, błędy 5xx, TTFB z serwera i technologia strony (zadanie SITE_STATS, log domeny DirectAdmina) + zakładka „Logi” w widoku strony. Przełącznik klienta w trybie agencji (PB-20) — decyzja właściciela 2026-09-25: po starcie, przy pierwszych agencjach (sprint 23 „Po starcie”).

**D-14 (kod 2026-09-25, D3 na węźle):** PostgreSQL 16 dla kont — DirectAdmin nie zarządza serwerem PostgreSQL (CustomBuild ma tylko rozszerzenia PHP `php_pgsql`, od 1.707 `pdo_pgsql`), więc serwer instaluje profil węzła z AppStream (localhost, scram-sha-256), a bazy zakłada zadanie PGSQL (`ops/scripts/node-pgsql.sh`): rola na bazę `<login>_<nazwa>`, limit 5 baz, hasło pokazane raz. Codzienny `pg_dump` do `~/.verris-pgsql/` konta (wchodzi do kopii DA), hook DA `user_destroy_post` usuwa bazy razem z kontem. Odtworzenie bazy PostgreSQL z kopii robi na razie support (`pg_restore`). Hasła z payloadu zadań węzła są usuwane po wykonaniu zadania (`bezSekretow`).

**E-23 / B-03 / J-06 (kod 2026-09-25, D3 na węźle):** kalendarz i kontakty (Radicale 3.8.1, logowanie danymi skrzynki przez Dovecot, port 5232, kopia do katalogu konta); PHP w podkatalogu (handler LiteSpeed w .htaccess katalogu, zadanie HTACCESS z HT_DIR/HT_PHP); bezstratna optymalizacja obrazów (zadanie IMAGE_OPTIMIZE, jpegoptim/optipng jako klient). M-33 (dedykowane IP) zostaje zleceniem — DA nie dokumentuje API przypisania IP użytkownikowi.

**Treści verris.pl (2026-09-25):** poprawione twierdzenia bez pokrycia (tryb ECO, Apple/Google Pay, przypomnienia, rezygnacja, zwroty); rabat na start zostaje — przekaz „odnowienie po cenie z cennika”. `/specyfikacja` gotowa i ukryta do akceptacji (`SPECYFIKACJA_OPUBLIKOWANA`). Szczegóły: `docs/marketing/akceptacja-tresci-2026-09.md`.

### 3.4 System ticketowy (panel staff) — wymagania na później

- **Automatyczne odpowiedzi na typowe przypadki:** klasyfikacja zgłoszenia (DNS, SSL, poczta,
  płatność, migracja, awaria) → propozycja odpowiedzi z bazy wiedzy + **dane z konta klienta**
  (np. „domena wskazuje na IP X, powinna na Y"). Wysłanie automatyczne tylko w klasach bezpiecznych;
  reszta jako szkic do akceptacji.
- **Szablony wiadomości** z polami podstawianymi (imię, domena, usługa, termin) — rozbudowa
  istniejących canned responses o zmienne i kategorie.
- **Szybki podgląd klienta w bocznym panelu ticketu:** usługi, stan konta, saldo portfela, ostatnie
  faktury/dokumenty, ostatnie zdarzenia (awarie, provisioning, logowania), historia zgłoszeń,
  health score — bez przechodzenia między ekranami.
- **Akcje z ticketu:** restart usługi, ponowienie provisioningu, wysłanie linku do resetu, przedłużenie
  terminu — z audytem.
- **SLA na tickecie:** licznik do odpowiedzi, eskalacja, raport czasu reakcji.

---

## 4. Co warto wykupić / podpiąć

| Pozycja | Rekomendacja | Koszt orientacyjny | Kiedy |
|---|---|---|---|
| **ClouDNS Premium L** (anycast, 400 stref, API, secondary z AXFR) | **Tak** — jako zewnętrzny secondary za DirectAdminem, NS pod marką Verris | 14,95 USD/mies. (164,45 USD/rok) | przy węźle #1 (sprint 18) |
| ClouDNS DDoS Protected | **Nie na start** — 2,7× drożej, brak podanej przepustowości filtracji; najsłabszym ogniwem przy ataku są i tak węzły | 39,95 USD/mies. (L) | po pierwszym poważnym ataku / >1000 stref |
| Openprovider DNS | darmowy **trzeci secondary** (bez NS pod marką — wyłączone u nich) | 0 | przy węźle #1 |
| Openprovider Premium DNS (Sectigo) | nie — per strefa, drożej niż ClouDNS przy naszej skali | 6,49 USD/strefa/rok | — |
| Cloudflare Business z NS kontowymi | alternatywa przy >1000 stref lub atakach | ~200 USD/mies. | później |
| Patchstack (baza podatności WP, wirtualne łatki) | warto rozważyć do „bezpiecznych aktualizacji" i skanera | do wyceny | po starcie |
| Storage Box BX21 (Hetzner) | już w planie — kopie off-site | ~11 €/mies. | sprint 18 |

**Architektura DNS:** DirectAdmin zostaje *hidden primary*, ClouDNS pobiera strefy przez AXFR/NOTIFY
(ograniczenie po IP/TSIG), panel zakłada/usuwa strefę w ClouDNS przez API przy dodaniu/usunięciu
domeny. Przed zakupem zapytać ClouDNS: czy NS pod marką na współdzielonych IP są w Premium L w cenie,
czy strefy secondary liczą się do limitu 400, od ilu stref jest Enterprise.

---

## 5. Pytania do właściciela (do przedyskutowania)

1. Kolejność: najpierw **system designu i makiety** (bez zmiany funkcji), czy od razu **Copilot z akcjami**?
2. Czy tryb **Agencja** (klienci agencji, white-label, raporty) jest priorytetem na start, czy po starcie?
3. Budżet AI: modele i koszt zapytań — asystent darmowy w pakiecie (rekomendacja), limity miesięczne?
4. Tickety: czy auto-wysyłka bez człowieka w klasach bezpiecznych jest akceptowalna?

## Źródła

Hostinger (hostinger.com/blog/ai-agent-kodee, /support/hostinger-agents-features-and-overview),
SiteGround (siteground.com/kb/ai-agent-for-wordpress), Kinsta (kinsta.com/docs/…/automatic-updates,
kinsta.com/changelog), WP Engine (wpengine.com/blog/wp-engine-2025-in-review), Cloudways
(cloudways.com/en/cloudways-ai-copilot.php, /safeupdates.php), Rocket.net
(rocket.net/blog/introducing-new-rocket-net-control-panel), Raidboxes (raidboxes.io/en/blog/raidboxes/recap-2025),
Spaceship (spaceship.com/blog/alf-updates), Ploi (ploi.io), xCloud (xcloud.host/xcloud-february-2026-release-notes),
WordPress MCP Adapter (developer.wordpress.org/news/2026/02/…), ClouDNS (cloudns.net/premium,
/ddos-protected-plans, /data-centers, /wiki/article/42, /wiki/article/39), Openprovider
(openprovider.com/products/security/premium-dns, support.openprovider.eu …vanity-nameservers),
Cloudflare (developers.cloudflare.com/dns/nameservers/custom-nameservers), Bunny (bunny.net/pricing/dns),
Hetzner DNS (docs.hetzner.com/networking/dns/…), Route 53 (aws.amazon.com/route53/pricing).


## Reseller: działania na klientach i marka (O-05, O-09) — 2026-09-25

- **Granica danych:** reseller widzi u klienta tylko usługi i ich stan (domena, pakiet, status, stan zdrowia, odnowienie, cena detaliczna). Bez plików, baz, poczty, faktur, salda, danych rozliczeniowych, logowań i IP; bez wchodzenia na konto. Lista pól pilnowana w `test/integration/reseller-klienci.int-spec.ts`. Praca przy stronie = dostęp od klienta przez IAM.
- **Działania:** `GET /reseller/me/clients/:id`, `POST …/password-link` (raz na 10 min), `POST …/service/:id/suspend|resume` (powód `RESELLER`; reseller zdejmuje tylko własną blokadę), `DELETE /reseller/me/clients/:id` (odpięcie). Klient: `GET/DELETE /me/partner` (odpiąć może tylko właściciel). Po 30 dniach wstrzymania przez resellera — powiadomienie dla obsługi (`reseller-przypomnienie.scheduler.ts`).
- **Marka:** `POST /reseller/me/brand`, `POST/DELETE /reseller/me/logo` (PNG/JPEG/WebP ≤ 100 KB, typ po sygnaturze). Logo publicznie pod `/public/reseller-logo/:code`. Mailer wstawia blok partnera między znaczniki `<!--verris-partner-->` w nagłówku email-shell (wszystkie maile do klientów resellera). Panel: marka w sidebarze i w Ustawieniach, baner „wstrzymana przez partnera” na usłudze.
- **Zasada w panelu:** baner „czeka na płatność” tylko przy blokadzie za płatność (`powodBlokady()` w `lib/service-events.ts`); wstrzymanie przez partnera albo obsługę ma własny komunikat.


## Udostępnianie usług i przełącznik kont (PB-20) — 2026-09-26

- **Zakres:** zaproszenie IAM obejmuje całe konto albo wybrane usługi (`serviceIds`). Subkonto: `User.subaccountServiceIds`; osoba z własnym kontem: `CustomerMembership.serviceIds`. Pusta lista = całe konto (dotychczasowe subkonta bez zmian).
- **Egzekwowanie:** `common/guards/zakres-uslug.ts` w `CustomerPermissionsGuard` — przy zakresie przechodzą tylko trasy usług z zakresu (`/services/:id`, `/subscriptions/:id`, `/email-marketing/:subscriptionId`, `/analytics-sites/:subscriptionId`), `GET /services` (filtrowane w kontrolerze) i rzeczy osoby (powiadomienia, zgody, pomoc, zgłoszenia, `/users/me`). Portfel, domeny, zamówienia, VPS, dodatki, tokeny API, IAM — odmowa „Masz dostęp tylko do wybranych usług tego konta.”. Nawigacja panelu ukrywa to samo (`client-nav-access.ts`).
- **Własne konto:** zaproszenie na adres z kontem Verris → strona zaproszenia prosi o zalogowanie tym kontem → `POST /users/iam/invites/accept-existing` tworzy `CustomerMembership`. Przełącznik w menu bocznym: `GET /auth/accounts`, `POST /auth/switch-account` (nowy token z `actingFor`, ta sama sesja `sid` i wersja tokenu). Strategia JWT sprawdza członkostwo przy każdym żądaniu; odebrany dostęp = token wraca do konta dewelopera. Podczas podglądu obsługi (`impersonatedBy`) `actingFor` jest ignorowany.
- **Właściciel widzi wszystko:** sekcja „Dostęp z własnego konta” w IAM (edycja zakresu, odebranie dostępu), działania członków w audycie IAM (O-03), wpis `CUSTOMER_IAM_ACCOUNT_SWITCH` przy każdym przełączeniu.
