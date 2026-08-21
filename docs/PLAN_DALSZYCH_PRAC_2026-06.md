# Verris — Plan dalszych prac (czerwiec 2026)

Dokument roboczy prowadzony przez zespół inżynieryjny. Ujmuje stan na dziś,
kolejność prac przed startem LIVE oraz roadmapę po starcie. Aktualizowany na
bieżąco wraz z postępem zadań w panelu zadań.

Stan: platforma funkcjonalnie kompletna, kierunek na LIVE „za kilka dni".
Zasady przewodnie: bezpieczeństwo, zgodność z prawem i RODO, ochrona danych i
plików klientów, łatwość obsługi, przewaga nad konkurencją (dhosting,
cyberfolks, home.pl), zero mocków na produkcji.

---

## 1. Zrobione w tej iteracji

- **MON-6 — sterowanie powiadomieniami e-mail per usługa.** Klient może wyciszyć
  maile o awarii/powrocie/SSL, zostawiając monitoring włączony (wcześniej jedyną
  opcją było wyłączenie całego monitoringu). `SiteMonitor.notifyEmail`
  (migracja `20260621130000_mon6_notify_email`), endpoint
  `/services/:id/monitoring/notify`, przełącznik w zakładce Monitoring. Maile
  rozliczeniowe (np. wygaśnięcie płatnego tieru) idą zawsze — wyciszamy tylko
  alerty monitoringu.

- **MON-5 — ostrzeżenia o wygasającym certyfikacie SSL.** Dzienny sweep czyta
  datę wygaśnięcia certu przez handshake TLS na :443 (bez obciążania DA;
  `rejectUnauthorized:false`, więc widzi też certy wygasłe/samopodpisane).
  Zapis `SiteMonitor.tlsExpiresAt/tlsCheckedAt/tlsExpiryNotifiedFor` (migracja
  `20260621120000_mon5_ssl_expiry`). Gdy ≤14 dni do końca — e-mail do klienta
  (anty-spam per certyfikat; po odnowieniu ostrzeżenie może pójść ponownie).
  Panel: linia „Certyfikat SSL ważny jeszcze X dni / wygasł" z kolorem ostrzeżenia.

- **MON-4 — czas odpowiedzi (response time).** Każde udane sprawdzenie zapisuje
  `SiteMonitor.lastResponseMs` (migracja `20260621110000_mon4_response_time`),
  pokazywany w panelu klienta w linii statusu („odpowiedź X ms"). Fundament pod
  ewentualny wykres TTFB. Bez płatności.
- **MON-3 (uzupełnienie) — e-mail przy zejściu z płatnego tieru.** Gdy
  miesięczna opłata nie przejdzie z braku środków, klient dostaje wiadomość
  „szybki monitoring wstrzymany, wróciliśmy do co X min — doładuj i włącz
  ponownie" (zamiast cichego downgrade'u). Dodatkowo: revert do darmowego
  następuje WYŁĄCZNIE przy realnym braku środków (`ConflictException`); błędy
  przejściowe (DB/lock) są ponawiane w kolejnej godzinie, nie obniżają tieru.

- **MON-3 — płatny tier monitoringu + ustawienia w adminie.** Darmowy interwał
  rozrzedzony i konfigurowalny (default 30 min). Klient może włączyć „szybki
  monitoring" (default co 1 min) rozliczany **miesięcznie z portfela**; przy
  braku środków scheduler wraca do darmowego interwału (usługa nie znika).
  Rezygnacja = szybki tier do końca opłaconego okresu (`paidCancelAtPeriodEnd`),
  można wznowić bez ponownej opłaty. Admin ustawia: darmowy/płatny interwał,
  cenę miesięczną i czy oferta jest widoczna (`/admin/platform-settings/monitoring`).
  Schemat: `SiteMonitor.paidTier/paidActivatedAt/paidNextChargeAt/paidCancelAtPeriodEnd`
  (migracja `20260621100000_mon3_paid_monitoring`). UI: upsell/zarządzanie w
  zakładce Monitoring + formularz w ustawieniach platformy. ⚠️ dotyka pieniędzy
  — wymaga E2E (włączenie+opłata, miesięczne obciążenie, brak środków→powrót do
  darmowego, rezygnacja+wznowienie).

- **MON-2 — monitoring strony domyślnie włączony (free, always-on).** Decyzja
  produktowa: monitoring to darmowy wyróżnik, domyślnie ON dla **nowych** usług
  hostingowych (provisioning tworzy `SiteMonitor enabled=true` dla głównej
  domeny; best-effort, nie blokuje aktywacji, nie nadpisuje decyzji klienta przy
  re-provisioningu; tylko `productKind=HOSTING`, więc poczta/VPS pomijane).
  Istniejące konta bez zmian (świadomie — uniknięcie nagłej fali maili). Opt-out
  w panelu zostaje. Tiering interwału w schedulerze: usługi płatne sprawdzane co
  1 min, darmowe/trial co 5 min (`priceAmount>0`) — taniej przy skali, nadal
  szybko. Bez migracji.

- **MON-1 — karta dostępności (uptime 30 dni) w panelu klienta.** Z realnych
  zdarzeń `SiteMonitorEvent` liczymy % dostępności w oknie 30 dni (suma czasu
  awarii + trwająca awaria), z oknem przyciętym do daty utworzenia monitora —
  nie udajemy 100% za czas, gdy jeszcze nie monitorowaliśmy. `UptimeCard` w
  zakładce Monitoring pokazuje %, łączną niedostępność, liczbę awarii i notkę,
  gdy danych jest mniej niż 30 dni. Bez migracji, bez płatności. (Świadomie nie
  obiecujemy SLA dla strony klienta — uptime strony zależy od jego aplikacji;
  infrastrukturalne SLA pozostaje na status page jako `declaredSlaPct`.)

- **BILL-1 — rabat startowy z ustawień admina (bez kuponów Stripe).** Rabat na
  pierwsze N okresów liczony z oferty trialu (roczny/miesięczny %, tylko
  portfel). Reguła **nie-łączenia**: porównujemy rabat startowy z wpisanym
  kodem i stosujemy korzystniejszy (remis → kod). Na subskrypcji zapisujemy
  `introDiscountPct` + `introDiscountPeriodsLeft`; scheduler odnowień nalicza
  rabat dopóki zostają okresy, potem pełna cena. Klient widzi przekreśloną
  cenę + komunikat „ten kod daje mniejszy rabat niż promocja na start". Migracja
  `20260621000000_bill1_intro_discount`. ⚠️ dotyka pieniędzy — wymaga E2E
  rozliczeniowego (zakup z rabatem/kodem + odnowienie z dekrementacją).
- **BILL-2 — przypomnienia o odnowieniu zgodne z realną kwotą + ostrzeżenie o
  niedoborze.** Po BILL-1 mail T-7/T-3/T-1 pokazywałby `priceAmount` (cena
  1. okresu z rabatem), a portfel obciążany jest kwotą odnowienia — naprawione:
  jedno źródło prawdy `PromoService.resolveNextRenewalAmount()` używane przez
  scheduler obciążeń ORAZ maile. Gdy płatność z portfela i saldo < kwota
  odnowienia, mail dostaje czytelne ostrzeżenie „doładuj co najmniej X K, aby
  uniknąć zawieszenia" + zmieniony temat/CTA. Anty-churn dla modelu prepaid.

- **Safari passkey** — przyczyna: conditional-UI autofill (mediation:
  'conditional') trzymał oczekującą ceremonię WebAuthn; na WebKit blokuje to
  modalne logowanie przyciskiem. Fix: `isAppleWebKit()` → na Safari nie
  uruchamiamy conditional UI, polegamy na przycisku z natychmiastowym
  prefetchem opcji (synchroniczny `startAuthentication` w geście). Chromium bez
  zmian. Układ przycisku passkey: pod formularzem we wszystkich panelach.
- **Zmiana hasła skrzynki e-mail w panelu** — API
  `changeHostingEmailPassword` (CMD_API_POP action=modify, quota zachowana) +
  endpoint + UI per skrzynka w zakładce Poczta + audyt
  `HOSTING_EMAIL_PASSWORD_CHANGED`.
- **Polityka haseł (SEC-5)** — serwerowy walidator (≥10 znaków, min. 3 z 4 klas
  znaków, blokada popularnych/sekwencyjnych haseł) na rejestracji i resecie +
  miernik siły hasła na formularzu rejestracji.
- **Next.js 15.2.3** — łatka CVE-2025-29927 (obejście autoryzacji w
  middleware) we wszystkich 4 panelach.

---

## 1b. Audyt panelu admina (zarządzanie serwerami) — co dorobiono i co dalej

Przegląd cyklu życia węzła w panelu admina (onboarding → konfiguracja →
eksploatacja). Stan zastany jest dojrzały: kreator dodawania węzła, skrypt
bootstrap, handshake + zatwierdzanie, konfiguracja DirectAdmin z testem
połączenia, nameservery per-węzeł, profil hostingu, gotowość stosu, WAF,
ModSecurity, audyt węzła, insighty zużycia, tryb maintenance, watchdog floty.

**Dorobione teraz — OPS-1 (guardraile pojemności węzła):**
NodeSelector pakował węzły „do pełna" bez sterowania per-węzeł. Dodano:
- **Cordon** (`acceptsNewAccounts`) — wstrzymanie nowych kont na jednym węźle
  bez przełączania go w MAINTENANCE (które wstrzymuje sprzedaż globalnie).
  Istniejące konta działają dalej.
- **Maks. liczba kont** (`maxAccounts`) — twardy limit gęstości na węzeł.
- **Rezerwa headroom** (`reservedHeadroomPercent`, 0–90%) — procent pojemności
  CPU/RAM/dysku trzymany wolny pod burst autoskalowania, żeby nie upychać
  węzła na styk.
Pełny przepływ: schema (3 pola Server) → logika selektora → endpoint
`/admin/servers/:id/capacity-policy` → panel „Pojemność i przyjmowanie kont"
na stronie węzła → audyt `ADMIN_NODE_CAPACITY_POLICY_UPDATED`.
Wymaga `prisma migrate deploy` + `db:generate`.

**Usprawnienia ops węzłów:**
- ✅ **Dashboard pojemności floty (OPS-2)** — `/nodes/capacity`: per-węzeł
  wolne CPU/RAM/dysk (% + abs), konta vs limit, status cordon/headroom, sumy
  floty + heurystyka „ile jeszcze kont się zmieści".
- ✅ **Proaktywny alert pojemności + auto-cordon (OPS-3)** — watchdog co godzinę:
  ≥85% obłożenia → alert do adminów (cooldown 12h); `OPS_AUTO_CORDON=1` + ≥95% →
  automatyczny cordon.
- ✅ **Drain węzła + plan migracji (OPS-4)** — drain = cordon + audyt (bez
  ruszania danych); read-only plan: które konta i na który najmniej obciążony
  węzeł je przenieść. Panel: strona węzła → „Wycofywanie węzła (drain)".
  Zostaje (po teście E2E): **automatyczne wykonanie przeniesienia** danych
  (DA backup→restore + repoint DNS) — dziś świadomy, ręczny krok.
- **Rebalans kont między węzłami** (zostaje) — przeniesienie pojedynczego konta
  na mniej obciążony węzeł (na bazie istniejącego migratora) — j.w. wymaga
  ruszania danych klienta, więc po teście E2E.
- **Walidacja gotowości przed ACTIVE** (zostaje) — twarda bramka: nie pozwól
  zatwierdzić węzła, dopóki test DA + NS + profil + hardening nie są zielone.

## 2. Przed LIVE — kolejność (priorytet malejący)

### P0 — bez tego nie startujemy
1. **E2E na żywym koncie po licencji LiteSpeed (#73)** — pełny przepływ:
   rejestracja → płatność/portfel → provisioning konta → WWW + SSL → poczta →
   DB → pliki → backup/restore. Wymaga: licencja LiteSpeed, `prisma migrate
   deploy` + `db:generate`, seed KB (`cli:seed-kb`), `pnpm install` (łatka
   Next). Wykonuje Dominik na serwerze; raport wracający tutaj.
2. **Sprzątnięcie danych testowych (#72)** — subdomena qatest2, ticket
   #1F4CEEA7, konto test-live-verris.pl, testowy addon. Usuwa Dominik.
3. **Publikacja dokumentów prawnych** — regulamin, polityka prywatności, DPA,
   cookies (treści gotowe w `docs/legal`, trzeba podpiąć/opublikować).
4. **Restore drill** — próbne odtworzenie konta z backupu offsite (potwierdza,
   że backup faktycznie działa, nie tylko się tworzy).

### UX przed startem — „klient zaopiekowany" (ZROBIONE)
- ✅ **UX-1 — kontekstowe podpowiedzi KB** w każdej zakładce akcji.
- ✅ **UX-2 — Asystent startu** na Przeglądzie usługi: dla świeżego konta
  pokazuje klikalne pierwsze kroki (skieruj domenę → SSL → postaw stronę →
  poczta), z odznaczaniem zrobionych (dnsOk/tlsOk) i znika, gdy podstawy
  gotowe. Fundament pod „Zapytaj asystenta AI" w tym samym miejscu.

### P1 — silnie zalecane przed startem
5. **STAB-1 — rolling deploy (#81) — ZROBIONE.** Eliminacja okna 502/503:
   - `ops/scripts/prod-deploy-rolling.sh` — build wszystkich obrazów (stare
     kontenery żyją) → migracje → recreacja usług pojedynczo z bramką health.
   - Caddy: aktywny health-check (`health_uri`, `/readyz` dla API, `/api/health`
     dla paneli) + `lb_try_duration 30s` — proxy przetrzymuje żądania zamiast
     zwracać 5xx w oknie restartu.
   - API: graceful drain na SIGTERM (`/readyz`→503, `SHUTDOWN_DRAIN_MS=8s`,
     `enableShutdownHooks`) + `stop_grace_period: 30s`.
   Wymaga deployu nową ścieżką. **Następny krok (opcjonalny) dla pełnego
   zero-downtime API:** 2 repliki API + dynamiczne upstreamy Caddy (`dynamic a`),
   recreacja po jednej instancji.
6. **Sentry / monitoring błędów (#71)** — wymaga DSN. Po dodaniu: przechwyt
   wyjątków API + paneli, alerty. Bez tego po starcie jesteśmy „ślepi" na błędy
   produkcyjne.
7. **SEC-3 — listowanie zagnieżdżonych katalogów w menedżerze plików (#77)** —
   wymaga surowego zrzutu odpowiedzi DA z produkcji (wzorzec debug-log →
   deploy → odczyt). Niski wpływ, ale warto domknąć.
8. **`pnpm -r audit`** — finalny przegląd podatności zależności przed startem
   (po `pnpm install` z Next 15.2.3).

### P2 — może być tuż po starcie
9. **SEC-6 — opcjonalny wymóg passkey/2FA na koncie klienta (#85)** — celowo
   po LIVE (ryzyko lockoutu przed startem).

---

## 3. Roadmapa po LIVE — funkcje i ulepszenia

Pogrupowane wg wartości. Kolejność do ustalenia po pierwszych dniach na
produkcji (dane z użycia często zmieniają priorytety).

### A. Bezpieczeństwo i zaufanie
- **Powiadomienia bezpieczeństwa** — e-mail przy: nowym logowaniu (✅ było),
  zmianie hasła (✅ było), włączeniu/wyłączeniu 2FA (✅ było), **dodaniu/usunięciu
  passkey (✅ SEC-7 — dorobione)**. Zostaje: zmiana e-mail rozliczeniowego.
- **Historia logowań w panelu (✅ SEC-7 — dorobione)** — sekcja „Aktywność
  logowania" w Ustawienia → Bezpieczeństwo (data, urządzenie, IP, kraj, metoda,
  flaga „nowe urządzenie"), zasilana z `GET /users/me/login-history`. Zostaje:
  zdalne wylogowanie pojedynczej sesji (wymaga rejestru sesji/refresh tokenów).
- **Polityka rotacji sekretów** — przegląd i rotacja kluczy API (DA, Hetzner,
  Stripe, OpenProvider) + dokument procedury.
- **Wykrywanie nadużyć trial** — twardsze limity i fingerprinting przy
  free-trial (po obserwacji realnych nadużyć).

### B. Niezawodność i operacje
- **Status page zasilany realnymi metrykami** — automatyczne incydenty z
  watchdoga floty zamiast ręcznych wpisów.
- **Health-check per usługa w panelu klienta** — „Twoja strona: online,
  TTFB Xms, SSL ważny do…", proaktywnie.
- **Kolejka zadań z retry i podglądem** — widoczny status długich operacji
  (provisioning, migracja, backup) z automatycznym ponawianiem.
- **Alerty pojemności floty** — zanim węzeł się zapełni (dysk/RAM/inody),
  alert do adminów + sugestia dodania węzła.

### C. Produkt i przewaga konkurencyjna
- **Migrator od konkurencji „w 1 klik”** — rozszerzyć self-service migrację o
  automatyczne wykrywanie panelu źródłowego (cPanel/DA) i import przez API.
- **Pełny menedżer DB users** (odłożony) — gdy ustabilizujemy wersję API DA;
  na razie phpMyAdmin pokrywa potrzebę.
- **WordPress toolkit** — aktualizacje wtyczek/rdzenia, klony, tryb
  konserwacji, skan bezpieczeństwa (na bazie istniejącego 1-click instalatora).
- **Cache/CDN toggle** — LiteSpeed Cache + ewentualny CDN brzegowy jako opcja.
- **Raport EKO jako wyróżnik marketingowy** — publiczny licznik
  oszczędności CO₂ + odznaki dla klientów (mamy już realne metryki kWh/CO₂).

### D. Wsparcie i sukces klienta
- ✅ **Baza wiedzy — rozbudowa treści** — 23 artykuły (dodane: migracja,
  staging, WAF, monitoring, EKO, autoskalowanie, VPS/SSH, deliverability,
  trial, menedżer plików). Zostaje: osadzanie podpowiedzi KB w kontekście
  konkretnych zakładek (np. artykuł o poczcie w zakładce Poczta).
- **Asystent AI w panelu** — wykorzystać istniejące KB (embeddings) do
  odpowiedzi w czacie wsparcia z cytowaniem źródeł.
- **Onboarding kontekstowy** — checklisty „pierwsze kroki" dopasowane do
  kupionego produktu (hosting vs VPS vs e-mail).

### E. Rozliczenia i wzrost
- **Faktury cykliczne + przypomnienia** — automatyczne przypomnienia o niskim
  saldzie portfela zanim usługa zostanie zawieszona.
- **Program poleceń — rozbudowa** — dashboard prowizji, materiały
  marketingowe, kody rabatowe.
- **Upsell kontekstowy** — sugestie (więcej zasobów, backup, e-mail) na
  podstawie realnego użycia konta.

---

## 3b. Propozycje nowych funkcji — do decyzji (pre/post-LIVE)

Pomysły, których jeszcze NIE ma, a dają przewagę. Każdy z szacunkiem nakładu
i rekomendacją terminu. Wymaga decyzji: robimy przed startem czy po.

Bezpieczeństwo / zaufanie:
- ✅ **Lista aktywnych sesji + zdalne wylogowanie (SEC-10)** — model
  `UserSession` + `sid` w JWT (backward-compatible: stare tokeny działają),
  sekcja „Aktywne urządzenia" w Ustawienia→Bezpieczeństwo (urządzenie, IP,
  metoda, „to urządzenie", wyloguj). ⚠️ Dotyka hot-path auth — **zweryfikować
  w E2E** (logowanie, wylogowanie pojedynczej sesji, logout-all).
- ✅ **Self-service zmiana e-mail z weryfikacją (SEC-9)** — w Profilu „Zmień
  adres e-mail" (wymóg hasła) → link na nowy adres + alert na stary; zmiana
  dopiero po potwierdzeniu, z wylogowaniem sesji. Strona `/confirm-email-change`.
- ✅ **Dziennik aktywności konta widoczny dla klienta (SEC-8)** — sekcja
  „Aktywność konta" w Ustawienia→Bezpieczeństwo (skrzynki, bazy, pliki, FTP,
  poddomeny) z przyjaznymi etykietami. Transparentność + RODO.
- **Two-person approval dla akcji destrukcyjnych admina** (usunięcie konta/węzła).
  Nakład: średni. Rekomendacja: po LIVE.
- **DNSSEC toggle** dla domen. Nakład: średni (zależny od rejestratora). Po LIVE.

Niezawodność / ops:
- **Karta zdrowia usługi w panelu klienta** — „Twoja strona: online, TTFB Xms,
  SSL ważny do…", z istniejącego monitoringu. Nakład: mały-średni. Po LIVE (lub
  przed, jeśli chcemy „wow" na start).
- **Auto-incydenty na status page z watchdoga** — zamiast ręcznych wpisów.
  Nakład: średni. Po LIVE.
- **Kredyty SLA za niedostępność** — automatyczne uznanie portfela, gdy
  monitoring wykryje przestój ponad gwarancję SLA planu. Przewaga + spójność z
  widocznym SLA. Nakład: średni. Po LIVE.

Produkt / przewaga:
- **WordPress toolkit** — aktualizacje rdzenia/wtyczek, klon, tryb konserwacji,
  skan bezpieczeństwa (nadbudowa nad 1-click instalatorem). Silny wyróżnik
  vs cPanel/Plesk. Nakład: duży. Po LIVE.
- **Zarządzanie LiteSpeed Cache + opcjonalny CDN brzegowy** w panelu. Nakład:
  średni. Po LIVE.
- **Klucze API klienta + publiczne API** — agencje/power-userzy/resellerzy.
  Nakład: duży. Po LIVE.
- **Tryb reseller / subkonta z własnym rozliczeniem** — rynek agencyjny.
  Nakład: duży. Po LIVE.
- ✅ **Kontekstowe podpowiedzi KB w zakładkach (UX-1)** — uspokajający blurb +
  „Poradnik krok po kroku" (deep-link KB `?q=`) w zakładkach: Poczta, Bazy,
  Domeny, Pliki, FTP, Cron, Kopie, Poddomeny, SSL. Cel: klient czuje się
  zaopiekowany i nie boi się działać sam. **To także fundament pod asystenta
  AI** — `HostingHelpHint` + kontekst zakładki to gotowy punkt zaczepienia, by
  AI udzielał odpowiedzi „w miejscu", w którym klient akurat jest.

## 4. Dług techniczny do pilnowania
- **Stale Prisma client w sandbox** — `isTrial`/`productKind`/nowe modele
  pokazują błędy tsc, które znikają po `db:generate`. To nie są realne błędy,
  ale maskują nowe — przy każdej weryfikacji filtrujemy znane pozycje.
- **Spójność walidacji klient↔serwer** — polityka haseł jest teraz w dwóch
  miejscach (lustrzane). Przy zmianie reguł aktualizować oba pliki
  (`password-policy.validator.ts` i `lib/password-policy.ts`).
- **Konsolidacja dokumentów planistycznych** — w `docs/` jest wiele plików
  sprintowych; warto po LIVE scalić w jeden żyjący ROADMAP.
