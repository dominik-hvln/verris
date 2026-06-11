# Verris — pełna mapa rozwoju (wszystkie kąty), 2026-06-10

Przegląd „co jeszcze warto" pod każdym kątem. Pomija rzeczy już rozpisane w
`ROADMAP_KONKURENCJA_2026-06.md` (A1–C7) i `OCENA_PRAWNA_I_BEZPIECZENSTWO_2026-06-10.md`
(S-1..S-11, L-1..L-7). Tu są **nowe obszary** + priorytetyzacja całości.

Legenda wartości: 💰 przychód · 🛡️ ryzyko/bezpieczeństwo · ⭐ retencja/zadowolenie ·
⚙️ koszt operacyjny · 📈 skalowanie.

---

## 1. Niezawodność i architektura (najwyższy zwrot po stronie ryzyka)

- **R-1 · Wysoka dostępność control-plane** 🛡️📈 — dziś API to 1 replika (crony, rate-limit
  in-memory). Przy wzroście: leader-election (redlock) dla cronów + rate-limit w Redis →
  odblokowuje >1 repliki API i eliminuje pojedynczy punkt awarii. Postgres: replika
  read-only + automatyczny failover (Patroni/repmgr) gdy baza klientów rośnie.
- **R-2 · Migracja konta między węzłami (rebalansowanie)** 📈⚙️ — gdy węzeł się zapełnia
  lub pada, przenieś konto DA na inny węzeł (jest `migration-orchestrator` — rozszerzyć o
  wewnętrzne przenosiny + automatyczne rebalansowanie po obłożeniu).
- **R-3 · Graceful degradation węzła** 🛡️ — gdy węzeł `OFFLINE`, panel klienta pokazuje
  jasny komunikat + status zamiast błędów DA; tryb „read-only" usługi.
- **R-4 · Drain & maintenance window** ⚙️ — zaplanowane okno serwisowe węzła z
  powiadomieniem klientów (mail + baner), automatyczne wstrzymanie provisioningu.
- **R-5 · Health budget / SLO** 📈 — zdefiniować SLO (np. 99.9% uptime panelu/API),
  error budget, dashboard wypalania; status page już jest, brakuje warstwy SLO.

## 2. Produkt hostingowy (różnicowanie + przychód)

- **P-1 · E-mail jako pełny produkt** 💰⭐ — webmail (SOGo jest), ale dorobić: kreator
  kont pocztowych w panelu klienta, autokonfiguracja klientów (autodiscover/autoconfig
  XML), antyspam per skrzynka, limity, aliasy, catch-all. Poczta to najczęstszy powód
  ticketów — dobre UI = mniej zgłoszeń.
- **P-2 · Deliverability dashboard** ⭐🛡️ — per domena: status SPF/DKIM/DMARC, kolejka
  Postfiksa, blacklisty (RBL), reputacja. Klient sam diagnozuje „dlaczego mail nie dochodzi".
- **P-3 · Marketplace 1-click poza WP** 💰 — po WordPressie (A4): PrestaShop, Joomla,
  Nextcloud, Ghost. Każdy = nowy NodeTask kind, schemat już gotowy.
- **P-4 · Менедżer plików w panelu** ⭐ — dziś link do DA File Manager; własny lekki
  menedżer (upload/edit/uprawnienia) trzyma klienta w Twoim UI, nie w DA.
- **P-5 · Cron/zadania w panelu klienta** ⭐ — UI do crona DA (jest częściowo) + biblioteka
  gotowców (backup, czyszczenie cache).
- **P-6 · Wersje PHP + ustawienia per domena w panelu** ⭐ — PHP Selector jest serwerowo
  (A2), dodać UI: wybór wersji, limity (memory_limit, max_execution_time), rozszerzenia.
- **P-7 · Plany roczne + promocje startowe** 💰 — rabat za rok z góry, kody na pierwszy
  okres (promo jest), pakiety „domena + hosting + mail".
- **P-8 · Add-ony jednorazowe** 💰 — dodatkowy dysk, dedykowane IP, dodatkowa kopia
  zapasowa, priorytetowe wsparcie — sprzedawane z portfela (silnik billingu gotowy).

## 3. Onboarding i konwersja (góra lejka)

- **O-1 · Free trial / plan testowy** 💰📈 — N dni za darmo lub mikro-plan; największy
  driver konwersji w hostingu. Wymaga limitu nadużyć (1 trial/os., weryfikacja).
- **O-2 · Migracja z konkurencji w 1 krok** 💰⭐ — kreator „przenieś z dhosting/cyberfolks/
  home.pl": podajesz dane FTP+DB starego hostingu, my zaciągamy (jest `migration` —
  dopracować UX i automatyczne wykrycie WordPressa/typu strony).
- **O-3 · Checkout: domena + hosting w jednym** 💰 — przy zakupie planu od razu wyszukiwarka
  domen (OpenProvider gotowy) i konfiguracja DNS — mniej kroków = wyższa konwersja.
- **O-4 · Onboarding wizard klienta** ⭐ — po pierwszym zakupie: „masz już stronę? → migracja
  / chcesz nową? → WordPress 1-click / tylko mail? → kreator poczty". Prowadzi za rękę.
- **O-5 · Strona statusu + trust signals** 💰 — publiczny status (jest) + „X stron
  hostowanych", recenzje, certyfikaty — social proof na stronie sprzedażowej.

## 4. Wsparcie i sukces klienta (retencja)

- **SUP-1 · Baza wiedzy / self-service** ⭐⚙️ — publiczne KB (jest moduł AI knowledge);
  rozbudować artykuły + wyszukiwarka, żeby ciąć tickety.
- **SUP-2 · AI-asystent w panelu klienta** ⭐ — masz AI w ticketach; dodać chat/asystenta
  w panelu klienta (RAG po KB) — odpowiada na „jak zmienić PHP", „dlaczego mail nie działa".
- **SUP-3 · Proaktywne podpowiedzi** ⭐ — „masz stary PHP 7.4 — zaktualizuj", „brak SSL na
  domenie X", „strona blisko limitu dysku" → wpięte w istniejące `service-health-hints`.
- **SUP-4 · CSAT po tickecie** ⭐ — ocena wsparcia po zamknięciu zgłoszenia + NPS okresowo.
- **SUP-5 · Statusy SLA wsparcia widoczne dla klienta** ⭐ — „odpowiemy w X h" wg planu.

## 5. Billing i finanse (przychód + ryzyko)

- **B-1 · Faktury KSeF** 🛡️💰 — od 2026 obowiązkowe faktury ustrukturyzowane; integracja
  z KSeF (wskazane w ocenie prawnej L-1). To twardy wymóg, nie opcja.
- **B-2 · Dunning / odzyskiwanie płatności** 💰 — przy nieudanym renewalu: sekwencja maili
  + retry karty (smart retries) zanim suspend; ratuje przychód (jest grace 3 dni —
  dorobić sekwencję komunikacji).
- **B-3 · Automatyczne doładowanie portfela** 💰 — jest `wallet-auto-topup`; wyeksponować
  w UI jako „nigdy nie stracisz usługi" + próg alertu niskiego salda.
- **B-4 · Faktury proforma / zamówienia B2B** 💰 — firmy często płacą przelewem na proformę;
  dziś portfel/karta. Dodać ścieżkę proforma → przelew → zaksięgowanie.
- **B-5 · Wielowalutowość / EUR** 📈 — jeśli celujesz poza PL; Stripe gotowy, brakuje
  prezentacji cen i przeliczeń.
- **B-6 · Raport marży autoskalowania per zasób** 💰 — masz `/autoscaling/revenue`;
  rozszerzyć o koszt rzeczywisty (energia z C5) → realna marża produktu.

## 6. Panel admina / operacje (koszt operacyjny)

- **A-1 · Centralny dashboard floty** ⚙️📈 — jedno miejsce: obłożenie węzłów, alerty,
  kolejka provisioningu, ostatnie incydenty, MRR. Dziś rozproszone po zakładkach.
- **A-2 · Bulk-operacje na kontach** ⚙️ — masowe akcje (suspend, zmiana planu, WAF, profil)
  z filtrami; przy 100+ kontach ręczne klikanie nie skaluje.
- **A-3 · Symulator/„what-if" pojemności** 📈 — „ile kont jeszcze zmieści węzeł przy planie X".
- **A-4 · Audyt floty zbiorczy** 🛡️ — uruchom audyt (jest per węzeł) na całej flocie
  jednym kliknięciem + raport zbiorczy zgodności.
- **A-5 · Impersonacja z pełnym audytem** 🛡️ — jest impersonacja; upewnić się, że każda
  akcja w trybie impersonacji jest jawnie oznaczona i audytowana (RODO + zaufanie).
- **A-6 · Role granularne dla staffu** 🛡️ — dziś STAFF/ADMIN; dodać uprawnienia
  szczegółowe (tylko billing / tylko support / tylko węzły) — zasada najmniejszych
  uprawnień.

## 7. Obserwowalność i jakość (ryzyko + koszt)

- **Q-1 · Tracing + structured logging** ⚙️🛡️ — request-id przez API→DA→węzeł; dziś logi
  tekstowe. Ułatwia diagnozę incydentów i skraca MTTR.
- **Q-2 · Error tracking (Sentry/GlitchTip)** ⚙️ — wyjątki API i paneli w jednym miejscu z
  alertami, zamiast grepowania logów.
- **Q-3 · Testy E2E w CI** 🛡️ — masz testy jednostkowe (wallet, autoscaling); dodać E2E
  krytycznych ścieżek (rejestracja→zakup→provisioning) w pipeline, żeby release nie psuł
  pętli biznesowej.
- **Q-4 · Syntetyczny monitoring ścieżki zakupu** 🛡️ — bot kupujący testowy plan co godzinę
  na stagingu/prod-canary → wczesne wykrycie „nie da się kupić".
- **Q-5 · Feature flags** ⚙️ — masz `FeatureFlagPlanOverride`; użyć do stopniowego
  roll-outu nowych funkcji (canary) i szybkiego wyłączania bez deployu.

## 8. UX / dostępność / i18n (zadowolenie + zasięg)

- **U-1 · Mobile-first panel** ⭐ — klienci sprawdzają hosting z telefonu; audyt RWD paneli.
- **U-2 · Dostępność WCAG 2.1 AA** 🛡️⭐ — kontrast, focus, ARIA, nawigacja klawiaturą;
  w UE coraz częściej wymagane prawnie (European Accessibility Act 2025).
- **U-3 · Dark/light + personalizacja** ⭐ — drobiazg, ale oczekiwany.
- **U-4 · i18n (EN/UK/DE)** 📈 — jeśli rynek poza PL; UA istotne ze względu na rynek.
- **U-5 · Onboarding empty-states** ⭐ — każda pusta zakładka tłumaczy „co tu zrobić".

## 9. Bezpieczeństwo — uzupełnienia ponad ocenę (S-1..S-11)

- **SX-1 · 2FA/passkey wymuszane opcją per konto klienta** 🛡️ — pozwól klientowi wymusić
  MFA na swoim koncie i subkontach (IAM jest).
- **SX-2 · Powiadomienia o zdarzeniach bezpieczeństwa do klienta** 🛡️⭐ — „nowe logowanie z
  nowego urządzenia/lokalizacji", „zmiana hasła", „dodano passkey" (część maili jest —
  rozszerzyć o geo/urządzenie).
- **SX-3 · Wykrywanie nadużyć/abuse** 🛡️⚙️ — konto wysyłające spam, kopanie krypto,
  phishing na hostingu → automatyczne wykrycie (wzorce ruchu, obciążenie) + procedura.
  Hetzner abuse już był incydentem (`docs/ops/HETZNER_ABUSE`) — zautomatyzować reakcję.
- **SX-4 · Rate-limit / anty-DDoS na poziomie Caddy** 🛡️ — podstawowy limit połączeń +
  rekomendacja Cloudflare przed control-plane.
- **SX-5 · Izolacja sieciowa baz klientów** 🛡️ — potwierdzić, że MySQL nie jest osiągalny
  z innych kont (bind 127.0.0.1 + per-user grants) — element audytu węzła.

## 10. Zielony / marketing / wzrost (różnicowanie)

- **G-1 · Publiczny licznik CO₂ całej platformy** 💰 — agregat z C5 na stronie głównej;
  Krystal/GreenGeeks na tym budują markę. Masz dane — pokaż je.
- **G-2 · Certyfikat/zobowiązanie zielone** 💰 — umowa na energię z OZE / offset +
  publiczny dokument; mocny wyróżnik w PL (nisza wolna).
- **G-3 · Program partnerski/afiliacja** 💰📈 — masz referral; rozbudować o afiliantów
  (agencje, twórcy) z prowizją i panelem partnera.
- **G-4 · Treści/SEO** 💰 — blog techniczny + porównywarki „vs cyberfolks" budują ruch
  organiczny; tani, długoterminowy kanał.

---

## Priorytetyzacja (gdzie zacząć)

**Teraz / przed szerszym otwarciem (must, niskie ryzyko wdrożenia):**
1. B-1 KSeF (twardy wymóg prawny 2026) + ocena L-1.
2. S-1/S-2 backupy kont klientów off-node + szyfrowanie (z poprzedniej oceny).
3. Q-3/Q-4 testy E2E + syntetyczny monitoring ścieżki zakupu (chroni przychód).
4. SX-3 wykrywanie abuse (był już realny incydent Hetzner).

**Pierwsze 1–2 miesiące (najwyższy zwrot biznesowy):**
5. O-1 free trial + O-2 migracja z konkurencji + O-3 domena w checkout (konwersja).
6. P-1 e-mail jako produkt + P-2 deliverability (najczęstsze tickety).
7. B-2 dunning (ratuje przychód), B-3 ekspozycja auto-topup.
8. SUP-2 AI-asystent + SUP-3 proaktywne podpowiedzi (retencja, mniej ticketów).

**Kwartał 2 (skalowanie i marka):**
9. R-1 HA control-plane + R-2 rebalansowanie (gdy >~kilkuset kont).
10. G-1/G-2 marketing zielony, G-3 afiliacja, U-2 dostępność, U-4 i18n.
11. A-1/A-2/A-6 dojrzałość panelu admina, Q-1/Q-2 obserwowalność.

> Zasada: najpierw to, co **chroni przychód i zgodność** (backupy, KSeF, abuse,
> testy ścieżki zakupu), potem **rośnie przychód** (trial, migracja, e-mail,
> dunning), na końcu **skaluje i wyróżnia** (HA, zielony marketing, i18n).

---

# KOLEJNOŚĆ USTALONA (decyzja Dominika, 2026-06-11)

Zasady nadrzędne: bezpieczeństwo, zgodność z prawem, prostota użycia,
prześciganie konkurencji. Realizacja sekwencyjna:

| # | Pozycja | Status |
|---|---------|--------|
| 1 | **B-1 KSeF** | ✅ zaimplementowane (moduł `ksef/`: FA(2) XML, klient sesji tokenowej, scheduler co 10 min, statusy na fakturze, admin overview+retry, smoke `ops/scripts/ksef-smoke.ts`) — wymaga smoke na ksef-test + creds |
| 2 | **Passkeys admin+staff** | ✅ zaimplementowane (przyciski logowania + weryfikacja roli przed cookie; passkey = MFA odporne na phishing, spełnia REQUIRE_2FA_FOR_STAFF) |
| 3 | **O-1 free trial** | następne |
| 4 | **O-2 migracja od konkurencji** (pliki, DB, poczta; self-service lub zlecenie) | — |
| 5 | **O-3 domena w checkout** | — |
| 6 | **P-1 e-mail jako produkt na Roundcube** (custom design pod branding Verris) + **P-2 deliverability dashboard** | — |
| 7 | R-1 → R-5 (HA, rebalansowanie, degradacja, maintenance window, SLO) | — |
| 8 | P-4, P-5, P-6, P-7, P-3 | — |
| 9 | O-4, O-5 | — |
| 10 | SUP-1 → SUP-5 | — |
| 11 | A-1, A-2, A-3, A-4, A-6, A-5 | — |
| 12 | U-1 → U-5 | — |
| 13 | Q-1 → Q-5 | — |
| 14 | SX-2, SX-3, SX-4, SX-5 | — |
| 15 | G-1 → G-4 | — |
| 16 | **Analiza rynku PL+zagranica** + propozycje wyprzedzenia konkurencji (dokument) | — |
| 17 | **VPS/Cloud resale przez API** (Hetzner Cloud / OVH Public Cloud / polskie DC) — nowy typ produktu obok hostingu | — |

> Notatka do #17 (VPS/Cloud): architektura przygotowana — wzorzec
> `RegistrarProvider` (OpenProvider) pokazuje jak dodać `ComputeProvider`
> (Hetzner Cloud API jest najprostsze: tokeny projektowe, /servers, /images;
> OVH PL ma DC w Warszawie — atut „dane w Polsce"). Billing z portfela
> godzinowego już istnieje — naturalnie pasuje do VPS per-hour.
