# Plan sprintów do startu — Verris

**Wygenerowany:** 2026-09-26 z `audyt/dane/` · **nie edytuj ręcznie**  
**Podstawa:** audyt parytetu funkcji z 2026-08-20  
**Pojemność:** 1 osoba, pełny etat, **30 h netto na sprint** · sprint = 1 tydzień  
**Sprint 1:** 2026-08-31 · **Sprint 23:** 2027-02-01–2027-02-05

---

## Liczba, od której trzeba zacząć

Domknięcie **wszystkich** luk z macierzy to **2758 h** — przy 30 h tygodniowo około **21 miesięcy pracy solo, bez jednego przychodu po drodze**. Taki plan nie jest planem startu, tylko sposobem, żeby nigdy nie wystartować.

Dlatego praca dzieli się na dwie części: **23 sprintów do startu** (1134 h) oraz roadmapę po starcie (1624 h, 82 pozycji) rozpisaną na epiki kwartalne.

- **2027-01-22** — koniec sprintu 21, zamknięte wszystkie blokery **poza KSeF-em**.
- **2027-02-05** — koniec sprintu 23, decyzja GO.

---

## Zasady obowiązujące w każdym sprincie

1. **Każda naprawiona pozycja dostaje test, który najpierw czerwieni się na starym kodzie.** Test napisany po naprawie i od razu zielony nie dowodzi niczego.
2. **Sprint kończy się, gdy definicja ukończenia jest spełniona, a nie gdy mija piątek.** Przesunięcie jest informacją; ukrycie przesunięcia jest porażką.
3. **Status wg skali dowodu.** Nic poniżej D2 nie jest „zrobione”. Pieniądze, dane klienta i dostęp → D3. Backupy i DR → D4.
4. **Zakaz formuły „warunkowe GO”.**
5. **Nowa praca odkryta w sprincie nie wchodzi do niego** — trafia do backlogu. Wyjątek: bloker znaleziony przy naprawie innego blokera.
6. **Jedno miejsce.** Stan, zadania i dowody — tylko `audyt/dane/*.csv` (uzasadnienie w kolumnie „Uwagi”). Decyzje i kierunek — `docs/VERRIS.md`. Bez nowych plików w `docs/zadania/` ani raportów sprintów (decyzja 2026-09-22).
7. **Każdy sprint kończy się aktualizacją `audyt/dane/macierz.csv`** i przebudową widoków. Procedura: `plan-startowy-2026-08/AKTUALIZACJA_AUDYTU.md`.

---

# Faza 0 — Zatrzymać krwawienie

*Sprinty 1–3 · 256 h · 2026-08-31 – 2026-09-18*

Ustalenia z passu adwersaryjnego plus CI. Każda z tych pozycji jest albo dziurą, przez którą wyciekają pieniądze, albo drogą do przejęcia węzła przez klienta. Nic innego nie ma sensu przed nimi.

## Sprint 1 — Zatrzymać krwawienie i włączyć CI

`2026-08-31 – 2026-09-04` · **68 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `X-01` | CI uruchamiające testy | 6 | — | .github/workflows/ci.yml — typecheck, testy API, build, smoke migracji Prisma, gitleaks, pnpm audit, Trivy, dependabot |
| `X-02` | Status wymagany do merge | 6 | — | ruleset „gałęzie wdrożeniowe — wymagaj zielonego CI" (id 21161479), Active, zakres: gałąź domyślna + live-release-readiness; wymagane 4 checki z ci.ym |
| `X-03` | Testy uruchamiane przed wdrożeniem | 6 | WYSOKA | .github/workflows/deploy.yml — job test-gate (typecheck + pnpm --filter api test), build-push ma needs: test-gate; ops/scripts/lib/bramka-recznego-wdr |
| `Z-02` | Blokada zamówienia usługi bez opłaty przez klienta | 6 | — | dto/subscription.dto.ts — @IsIn(CLIENT_PAYMENT_SOURCES); subscriptions.service.ts — ForbiddenException dla MANUAL bez allowManual; test subscriptions. |
| `X-11` | Testy API w osobnym jobie CI, nie za typecheckiem | 6 | — | .github/workflows/ci.yml — osobny job api-tests o nazwie „API unit tests" |
| `X-12` | Skrypty węzła serwowane przez API obecne w obrazie produkcyjnym | 6 | — | Dockerfile.api — COPY dla 10 skryptów; apps/api/src/test/dockerfile-scripts.spec.ts; D3: 2026-08-21 21:57 — `docker exec <api> ls -la ops/scripts/` na |
| `X-13` | Jedna gałąź wdrożeniowa — main | 6 | — | .github/workflows/deploy.yml — on.push.branches: [main] |
| `X-14` | CI sprawdza DANE po migracji, nie tylko czy migracja się wykonała | 6 | — | .github/workflows/ci.yml — job migrations: kroki „Seed reference data” i „Verify migrated data (Z-12, Z-13, Z-16)”; ops/sql/sprawdz-baze-po-migracji.s |
| `X-15` | Niezmiennik księgi pojemności sprawdzany liczbowo, nie tekstowo | 6 | — | apps/api/src/subscriptions/ksiega-niezmiennik.spec.ts — 15 testów: losowe ciągi operacji (założenie konta, skalowanie w górę i w dół, zmiana planu, us |
| `X-17` | Joby CI budują zależności workspace'u zanim uruchomią testy | 6 | — | .github/workflows/ci.yml — krok „Build workspace libraries” w jobie api-tests, „Generate Prisma client” w jobie migrations; turbo.json — zadanie test  |
| `PB-01` | Unit economics węzła vs cena 45 zł/mies. brutto (399 zł/rok) | 8 | BLOKER BIZNESOWY | Policzyć pełny koszt węzła: serwer + CloudLinux + LiteSpeed + DirectAdmin + Imunify + backup S3 + amortyzacja wsparcia. Wyliczyć próg rentowności w ko |

**Definicja ukończenia**

- `X-01` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-02` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-03` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `Z-02` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-11` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-12` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-13` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-14` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-15` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-17` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `PB-01` — Arkusz z kosztem miesięcznym węzła, liczbą kont na węzeł, marżą jednostkową i progiem rentowności. Decyzja: cena zostaje albo się zmienia — zapisana w repo.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** PB-01 może wywrócić cenę 45 zł. Dlatego jest w pierwszym sprincie, a nie w ostatnim — wynik zmienia treść cennika w sprincie 15. Sprint urósł o sześć pozycji odkrytych przy włączaniu CI — nie było ich w planie z 2026-08. | PRZEPLANOWANIE 2026-09-19: sprinty 1-3 sa WYKONANE. Ich zawartosc zostaje bez zmian jako zapis historii. Faktyczny przebieg: 2026-08-21 do 2026-08-28, trzy sprinty tresci w szesc dni roboczych, po czym 22 dni przerwy. Daty kalendarzowe w tym pliku licza sie od nowego punktu odniesienia (start=2026-08-31), zeby zgadzaly sie DO PRZODU; dla sprintow 1-3 sa o tydzien przesuniete wobec rzeczywistosci i nie nalezy ich czytac jako zapisu, kiedy ta praca powstala.

## Sprint 2 — Zamknąć luki bezpieczeństwa z passu adwersaryjnego

`2026-09-07 – 2026-09-11` · **144 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `Z-04` | Guard uprawnień subkont — domyślna odmowa | 6 | — | customer-permissions.guard.ts — typ WymogTrasy, REGULY_TRAS, domyślne 'ODMOWA'; customer-permissions-coverage.spec.ts — 55 tras zamkniętych, lista jaw |
| `Z-03` | Walidacja danych migracji przed użyciem w poleceniu powłoki | 16 | — | dto/migration.dto.ts — MIGRACJA_WZORCE + @Matches na 17 polach; ops/scripts/lib/migration-input-guard.sh — vg_require; node-migration-worker.sh — fail |
| `Z-06` | Klucz idempotencji obciążenia za dodatek | 6 | — | addon.service.ts — kluczIdempotencji + sprawdzenie duplikatu przed obciążeniem + obsługa P2002; schema.prisma — PurchasedAddon.idempotencyKey @unique; |
| `X-18` | Zależności podniesione do najnowszych bezpiecznych wersji | 16 | — | package.json — 16 pnpm.overrides na zależności przechodnie; apps/www next 15.4.4 → 16.3.2; wszystkie panele next 16.3.2; NestJS 11.2.1; React 19.2.8;  |
| `X-21` | Deklaracje typów opisują tę wersję biblioteki, która jest zainstalowana | 6 | — | apps/api/package.json — @types/archiver ^8.0.0 przy archiver ^8.0.0; apps/api/src/test/typy-zgodne-z-runtime.spec.ts — 12 testów; package.json — engin |
| `X-23` | Bramka podatności zatrzymuje wdrożenie, a nie tylko dopisuje adnotację | 6 | WYSOKA | .github/workflows/ci.yml:388 — jedyne wywolanie ops/ci/audyt-bramka.cjs, w jobie security-scans (ci.yml:349). .github/workflows/deploy.yml — job test- |
| `X-24` | Panel admina woła ścieżki, które API naprawdę wystawia | 6 | — | apps/api/src/test/sciezki-panelu.spec.ts — 5 testów; porównuje wywołania adminApi() z panelu z trasami zadeklarowanymi w kontrolerach API |
| `X-25` | Asercje po migracji biegną także na produkcji, z rollbackiem przy naruszeniu | 6 | — | ops/sql/po-migracji-niezmienniki.sql — CI I PRODUKCJA, 14 RAISE EXCEPTION (Z-01, Z-05, Z-12, Z-13, Z-16, M-06); ops/sql/po-migracji-katalog.sql — tylk |
| `X-26` | Skrypty powłoki mają bit wykonywalności — także po świeżym git clone | 6 | — | apps/api/src/test/skrypty-wykonywalne.spec.ts (3) — żaden .sh w repozytorium bez bitu wykonywalności; 82 skrypty przestawione na tryb 100755 (16 z nic |
| `X-27` | Obraz, który trafia na serwer, buduje się przed scaleniem | 6 | — | Dockerfile.api / Dockerfile.panel — ponowna instalacja PO `COPY libs libs`; package.json — pnpm.overrides @prisma/client 6.19.3 (drzewo znów ma jedną  |
| `H-24` | Nazwa obiektu kopii i drill odtworzeniowy mają po jednym miejscu | 6 | — | ops/lib/backup-crypto.sh — backup_crypto_latest_object(), jedno źródło nazwy obiektu; ops/scripts/restore-drill-isolated.sh — nazwa z biblioteki + wer |
| `X-28` | Reguła alertowa ma odbiorcę, a nie tylko próg | 6 | — | ops/observability/grafana/provisioning/alerting/rules.yaml — 13 reguł, 2 grupy, provisionowane z repo; ops/observability/prometheus.yml — bez rule_fil |
| `X-29` | Wdrożenie dowozi konfigurację obserwowalności na serwer | 6 | — | ops/scripts/prod-deploy-ghcr.sh — krok 4.5: OBS_SERVICES, promtool check config przed restartem, compose up -d + compose restart, sprawdzenie /api/hea |
| `H-20` | Test odtworzeniowy z datą ostatniego wykonania | 16 | — | DOWÓD D4 — wiersz w bazie PRODUKCYJNEJ, odczytany 2026-08-23: finishedAt=2026-08-22 23:19:45, result=OK, owner=Dominik Kowalski, durationSec=9, object |
| `X-30` | Reguły alertowe nie tylko są wczytane, ale się liczą | 6 | — | ops/observability/grafana/provisioning/datasources/datasources.yml — deleteDatasources przed deklaracją, uid: Prometheus; ops/scripts/prod-deploy-ghcr |
| `X-31` | Kanał alertów daje znak życia (dead man's switch) | 6 | — | ops/observability/grafana/provisioning/alerting/rules.yaml — grupa verris_kanal_alertow, reguła VerrisKanalAlertowZyje (vector(1), for: 0s, oba stany  |
| `X-32` | Martwy job da się odrzucić z panelu, ze śladem w audycie | 6 | — | apps/api/src/common/audit/audit.actions.ts — PROVISIONING_JOB_DISCARDED_BY_ADMIN; provisioning-queue.service.ts — odrzucJob (getState() === failed, śl |
| `X-33` | Bramka alertów odróżnia „nie ma" od „jeszcze nie ma" | 6 | — | ops/scripts/lib/bramka-regul-alertowych.sh — czekaj_na_reguly (do 20 prób co 3 s, warunek: aktywne == oczekiwane i paused == 0), policz_reguly_w_pliku |
| `X-34` | Bramka alertów czyta metryki bez potoku (SIGPIPE + pipefail) | 6 | — | ops/scripts/lib/bramka-regul-alertowych.sh — metryka_istnieje bez potoku (dopasowanie wzorcem w powłoce), regul_w_stanie przez <<< zamiast |; apps/api |

**Definicja ukończenia**

- `Z-04` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `Z-03` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `Z-06` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-18` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-21` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-23` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-24` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-25` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-26` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-27` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `H-24` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-28` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-29` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `H-20` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-30` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-31` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-32` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-33` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-34` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Z-03 dotyka skryptów na węźle — zmiana wymaga przetestowania całej ścieżki migracji, nie tylko walidacji DTO. Sprint urósł o dziesięć pozycji odkrytych w trakcie: podatności, strażniki, bramki wdrożeniowe i awaria kopii bazy (H-23/H-24). Przeciążenie jest prawdziwe i celowo widoczne — praca została wykonana, plan jej nie przewidywał. X-28 doszło jako odpowiedź na pytanie, które zostawiło H-23: dlaczego alarm o braku kopii nie dotarł do nikogo. Odpowiedź — nie miał dokąd; w repo nie było Alertmanagera, a Grafana miała odbiorcę i zero reguł. X-29 wyszło godzinę po X-28 i z tego samego pytania: skoro reguły są w repo, to czy wdrożenie w ogóle je dowozi? Nie dowoziło — wdrożenie restartowało tylko aplikacje, a Prometheus i Grafana czytają konfigurację wyłącznie przy starcie. H-20 wykonane tu, a nie w sprincie 9: awaria kopii z H-23 wymusiła odtworzenie bazy tu i teraz, więc dowód D4 powstał jedenaście sprintów przed terminem. X-30 wyszło przy sprawdzaniu, czy X-29 faktycznie coś zmieniło: reguły były wczytane i żadna się nie liczyła. Trzeci raz tego dnia to samo pytanie — czy to, co wygląda na zrobione, jest zrobione — i trzeci raz odpowiedź brzmiała nie. X-31 domyka dzień: po naprawie X-30 alerty ucichną, a cisza wygląda tak samo jak awaria kanału — więc dokładamy regułę, która pali się zawsze i której brak jest sygnałem. Decyzja właściciela produktu: jeden mail na dobę. Z-18 zamyka dzień tym, od czego wszystko się zaczęło: pierwszy alarm zapalony z prawdziwego powodu pokazał wadę, która przy zerwaniu sieci oddaje klientowi pieniądze za usługę, którą za chwilę wykona. Poprawka jest tutaj, dowód D3 dopiero przy węźle #1. X-32 to ostatnie ogniwo dnia i najkrótsza historia: alarm kazał posprzątać kolejkę, a w produkcie nie było czym jej posprzątać. Zostawało grzebanie w Redisie bez śladu w audycie — czyli dokładnie to, przeciwko czemu powstał cały ten dzień. X-33 dopisało się samo, bo wdrożenie #70 padło na bramce z X-30 przy czternastu działających regułach. Metryka reguł pojawia się dopiero na pierwszym takcie schedulera alertów, a bramka czytała ją sekundę po tym, jak /api/health odpowiedziało — mierzyła szybkość startu i meldowała o poprawności prowizjonowania. Bramka, która potrafi zapalić się na zdrowym systemie, uczy klikać „re-run" i przestaje chronić cokolwiek, więc ten sprint domyka się dopiero tutaj. X-34 dopisało się, bo bramka z X-33 miała własną usterkę: printf | grep -q przy pipefail zwraca błąd DOKŁADNIE WTEDY, GDY METRYKA JEST, o ile odpowiedź przekracza bufor potoku. Bramka nie kłamała o Grafanie — kłamała o własnym odczycie, a strażnik tego nie złapał, bo jego atrapa ważyła 200 bajtów zamiast setek kilobajtów i pracował pod innymi flagami powłoki niż produkcja. | 2026-09-22: Z-18 zdjete z listy tego sprintu (kod zrobiony tutaj, D2) — pozycja otwarta czeka na dowod D3 w sprincie 18, a generator przypisuje pozycje do pierwszego sprintu, w ktorym wystepuje.

## Sprint 3 — Pojemność węzła i plan produkcyjny

`2026-09-14 – 2026-09-18` · **44 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `Z-12` | Placement kont nadsubskrybuje zasoby węzła zamiast rezerwować pełne limity planu | 16 | — | node-capacity.ts — czyZmiesciSie z dwiema bramkami (handlową: sprzedane + limit planu ≤ pojemność × overcommit; fizyczną: realne zużycie ≤ pojemność × |
| `Z-13` | Pakiet sprzedawany na stronie istnieje jako plan w bazie | 6 | — | apps/api/src/plans/plan-produkcyjny.ts — PLAN_PRODUKCYJNY jako źródło prawdy; migracja 20260822120000_plan_produkcyjny (INSERT ... ON CONFLICT DO UPDA |
| `Z-16` | Autoskalowanie pyta węzeł o pojemność i dowozi sufit obiecany w ofercie | 16 | — | node-capacity.ts — wolneDoZadysponowania + krotnoscAutoskalowania (MAKS 32×, koniec zaszytego sufitu 10×); autoscaling-engine.service.ts — ogranicznik |
| `PB-14` | Wybór dostawcy i lokalizacji węzła produkcyjnego #1 | 6 | WYSOKI | PB-01 pokazało, że wybór dostawcy przesądza o rentowności przy cenie 45 zł. Hetzner AX102 ma cenę progową 44,20 zł, OVH Advance-2 w WAW1 — 67,76 zł, b |

**Definicja ukończenia**

- `Z-12` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `Z-13` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `Z-16` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `PB-14` — Decyzja zapisana w repo z datą, przed zamówieniem serwera. Jeśli wybrany dostawca spoza Polski — polityka prywatności i DPA opisują lokalizację przetwarzania przed startem sprzedaży.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Sprintu nie było w planie z 2026-08. Dołożony po PB-01, które pokazało, że przy dzisiejszym placemencie na węźle mieści się 16 kont, a próg rentowności przy cenie 45 zł to 58. Dopóki Z-12 jest otwarte, sprzedaż zatrzymuje się na szesnastym koncie niezależnie od popytu — selektor odmówi provisioningu. Z-13 idzie razem, bo bez planu produkcyjnego w bazie nie ma czego umieszczać ani na czym testować nadsubskrypcji. PB-14 zamyka sprint, bo wybór dostawcy przesądza o rentowności bardziej niż cokolwiek innego w tym modelu, a decyzja musi zapaść przed zamówieniem serwera w sprincie 8. AKTUALIZACJA 2026-08-22: Z-12 i Z-13 zamknięte tego samego dnia, a przy nich wyszło Z-16 — autoskalowanie nie pyta węzła o pojemność i nie dowozi sufitu z oferty. Dołożone do tego samego sprintu, bo to trzecia strona tej samej sprawy: pojemność węzła musi być liczona w jednym miejscu, a nie w trzech niezależnych.

---

# Faza 1 — Rozliczenia i dowód odtworzenia

*Sprinty 4–8 · 270 h · 2026-09-21 – 2026-10-23*

Faktura dla każdej płatności, korekty, potwierdzony drill odtworzeniowy, podpisane DPA. Koniec tej fazy to kamień milowy: zamknięte wszystkie blokery poza KSeF-em, który świadomie stoi na końcu.

## Sprint 4 — Wznowienie: odzyskac srodowisko i zatrzymac gnicie

`2026-09-21 – 2026-09-25` · **58 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `DEV-01` | Baza deweloperska jest nieosiągalna, a `docker-compose.yml` opisuje stan, którego nie ma | 6 | WYSOKA | docker-compose.yml — wolumen postgres_data_v2 + healthcheck logujący się jako verris (psql select 1); LOCAL_DEV.md — sekcja o starym wolumenie |
| `DEP-01` | Osiem otwartych pull requestów Dependabota, żaden niescalony | 6 | WYSOKA | 2026-09-24: #39 (22 × minor/patch, lockfile wprost z PR), #30–#33 (akcje GitHuba) wciągnięte na main lokalnie; #28 (graphql 17) wyciszony w .github/de |
| `ENV-01` | Bramka lokalna biegnie na Node 20, CI na Node 22 | 6 | ŚREDNIA | D3: ostrzeżenie `pnpm` przy każdym `pnpm test` wobec `node-version: 22` w `ci.yml`. Zamknięte częściowo 2026-08-28: `.nvmrc` = 22, strażnik `wersja-no |
| `X-50` | Bramka podatnosci zatrzymuje cokolwiek — jest wymagana do merge i wolana przez wdrozenie | 6 | WYSOKA | D2 2026-09-19: .github/workflows/deploy.yml — krok "Bramka podatnosci" w jobie test-gate; ruleset 21161479 — "Security scans (gitleaks + audit + trivy |
| `X-51` | Etykiety z dependabot.yml istnieja w repozytorium | 6 | NISKA | D2 2026-09-19: utworzone etykiety dependencies, security, docker, ci — 9 -> 13 etykiet w repozytorium; pokrywaja wszystkie trzy sekcje labels: w .gith |
| `SEC-07` | Trzy podatnosci HIGH w multerze — zdalny DoS bez uwierzytelnienia na sciezce uploadu | 16 | WYSOKA | D2 2026-09-19: bramka lokalna zielona — 850 testow jednostkowych w 81 pakietach, w tym multer-limity.spec.ts (7 asercji) i bramki-nie-rozjezdzaja-sie. |
| `SEC-08` | Dwa niezauwierzytelnione RCE w Next.js lezaly w drzewie 22 dni | 6 | WYSOKA | Przed: node ops/ci/audyt-bramka.cjs 2026-09-19 — "Podatnosci blokujace (high/critical): 11", w tym CRITICAL next GHSA-p293-qw3h-jr36 i GHSA-2xp9-vwfh- |
| `PB-13` | Decyzja: własny KSeF czy integracja z programem księgowym | 6 | BLOKER BIZNESOWY | Porównać dwie ścieżki: dokończenie własnego modułu KSeF (tryb offline, walidacja XSD, UPO) kontra przekazanie fakturowania do programu księgowego z go |

**Definicja ukończenia**

- `DEV-01` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `DEP-01` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `ENV-01` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-50` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-51` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `SEC-07` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `SEC-08` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `PB-13` — Decyzja zapisana w repo z uzasadnieniem i datą. Jeśli wybrana integracja — sprint 18 zmienia zakres z dokończenia modułu na wdrożenie eksportu do programu księgowego. Decyzja musi zapaść przed sprintem 18, inaczej blokuje start.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Pierwszy sprint po 22 dniach przerwy. Kolejnosc nie jest dowolna: DEV-01 idzie pierwsze, bo po decyzji nr 1 z 2026-08-28 JEDYNA realna bramka przed main jest bramka uruchamiana lokalnie, a ona nie wstanie bez bazy deweloperskiej. DEP-01 rosnie samo — kolejka PR-ow Dependabota powiekszyla sie przez przerwe, a job Security scans wykrywa CVE, ktorych poprawki leza niescalone. P-15 W CALOSCI TUTAJ, nie rozbite na dwa sprinty. Korekta 2026-09-19: zalozenie, ze DPA zalezy od tempa dostawcow, bylo nieprawdziwe — trzy z pieciu obowiazuja z mocy umowy glownej, dwa akceptuje sie kliknieciem w panelu. Praca wlasna to wylacznie Zalacznik 1 do DPA Hetznera. Dzieki temu OSTATNI BLOKER POZA KSeF-em zamyka sie w sprincie 4, a nie w sprincie 10. DEP-02 przeniesione do sprintu 10, zeby zmiescic sie w pojemnosci. | DOLOZONE 2026-09-19: X-50. Bramka podatnosci nie jest checkiem wymaganym w rulesecie i nie jest wolana przez deploy.yml, wiec czerwona bramka nie zatrzymuje ani merge, ani wdrozenia. Wchodzi do sprintu 4, bo jest tania (6 h) i jest warunkiem tego, zeby SEC-07 i cokolwiek pozniejszego mialo gdzie sie zatrzymac. X-03 przeniesione do sprintu 5, zeby zmiescic sie w pojemnosci. | DOLOZONE W TRAKCIE 2026-09-19: X-51 (etykiety) i SEC-08 (dwa CRITICAL RCE w Next.js, odkryte przy pierwszym uruchomieniu bramki podatnosci po przerwie). SEC-07 przeniesione tu ze sprintu 5 — zamkniete tego samego dnia. | 2026-09-22: P-15 przeniesione do bloku dokumentow na koncu planu (decyzja wlasciciela — przed pierwszym klientem, nie teraz). Stripe, AWS, Openprovider i Cloudflare zalatwione; zostaje Hetzner z Zalacznikiem 1.

## Sprint 5 — Faktury w programie ksiegowym i bramka wdrozenia

`2026-09-28 – 2026-10-02` · **28 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `FAK-01` | Panel nie wystawia faktury VAT rownolegle z programem ksiegowym | 16 | — | billing/tryb-fakturowania.ts — przelacznik faktury.tryb (fail-safe: wszystko poza dokladnym 'panel' = zewnetrzny), serie VDR/VDK, straznik KSeF; billi |
| `X-03` | Testy uruchamiane przed wdrożeniem | 6 | WYSOKA | .github/workflows/deploy.yml — job test-gate (typecheck + pnpm --filter api test), build-push ma needs: test-gate; ops/scripts/lib/bramka-recznego-wdr |
| `PB-14` | Wybór dostawcy i lokalizacji węzła produkcyjnego #1 | 6 | WYSOKI | PB-01 pokazało, że wybór dostawcy przesądza o rentowności przy cenie 45 zł. Hetzner AX102 ma cenę progową 44,20 zł, OVH Advance-2 w WAW1 — 67,76 zł, b |

**Definicja ukończenia**

- `FAK-01` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-03` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `PB-14` — Decyzja zapisana w repo z datą, przed zamówieniem serwera. Jeśli wybrany dostawca spoza Polski — polityka prywatności i DPA opisują lokalizację przetwarzania przed startem sprzedaży.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** FAK-01 NA POCZATKU i jako BLOKER STARTU: decyzja z 2026-09-22 (ADR-2026-09-22) — faktury VAT wystawia program ksiegowy. Panel dzis sam numeruje faktury w transakcji obciazenia portfela, wiec bez przelacznika trybu kazda platnosc dostalaby dwie faktury w dwoch seriach. Dopiero po FAK-01 moga zejsc flagi blokera z M-16 i M-17. PB-13 ZAMKNIETE tego samego dnia — kierunek: integracja z programem ksiegowym po API, na start recznie. PB-14 musi zapasc przed zamowieniem serwera w sprincie 6. X-03 — reczna sciezka wdrozenia omija bramke: zamiana cichego obejscia na jawne, z flaga i zapisanym powodem.

## Sprint 6 — Fundament designu i edytor DNS

`2026-10-05 – 2026-10-09` · **42 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `F-01` | Edytor rekordów DNS (A/CNAME/MX/TXT) | 6 | WYSOKA | 2026-09-22 D1: components/hosting/DnsZoneSection.tsx — edytor strefy w zakladce Domeny huba uslugi (wybor domeny, DnsManager z onChanged); dns-manager |
| `F-02` | Rekordy SRV / CAA | 6 | WYSOKA | 2026-09-22 D1: components/hosting/DnsZoneSection.tsx — edytor strefy w zakladce Domeny huba uslugi (wybor domeny, DnsManager z onChanged); dns-manager |
| `PB-15` | Fundament nowego designu panelu | 30 | WYSOKI | Własny system wizualny zamiast domyślnego Tailwinda: tokeny (kolor marki, neutralne, stany), typografia z charakterem (nie Inter), skala odstępów i pr |

**Definicja ukończenia**

- `F-01` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `F-02` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `PB-15` — Ekran-wzorzec zaakceptowany przez właściciela; tokeny i komponenty w @verris/ui lub components/panel; ciemny i jasny motyw; kontrast WCAG AA; brak regresji w testach.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Najpierw system wizualny i jeden ekran-wzorzec do akceptacji — wszystko dalej budujemy juz w nowym stylu. F-01/F-02 (edytor DNS) maja kod z 2026-09-22; D3 przy wezle. | PRZEPLANOWANIE 2026-09-22 (3): decyzja wlasciciela — przed startem design (PB-15/16), asystent v1 (PB-17) i tickety v2 (PB-18); plan wydluza sie o 3 sprinty.

## Sprint 7 — Ekrany panelu klienta w nowym designie

`2026-10-12 – 2026-10-16` · **112 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `PB-16` | Ekrany panelu klienta w nowym designie + tryb Prosty/Pełny + wyszukiwarka „/” | 40 | WYSOKI | Przeniesienie wszystkich ekranów panelu klienta na komponenty z PB-15. Tryb Prosty (laik) / Pełny (pro) jako gęstość informacji tego samego panelu. Gl |
| `PB-20` | Tryb agencji: przełącznik klienta w menu bocznym | 16 | ŚREDNI | Element makiety („Piekarnia Zdrój · klient · 3 usługi” nad menu): konto agencji/resellera przełącza się między swoimi klientami bez wylogowania. Wymag |
| `PB-34` | Panele admina i obsługi na poziomie panelu klienta | 40 | WYSOKI | Decyzja właściciela 2026-09-26: najpierw makieta 3–4 kluczowych ekranów (pulpit, węzły/węzeł, karta klienta, zgłoszenie) do akceptacji, potem przenies |
| `PB-37` | Opieka nad zgłoszeniem: podpowiedzi dla obsługi, automatyczne wiadomości, oceny opiekuna | 16 | WYSOKI | Decyzja właściciela 2026-09-26 (formularz): cztery automatyczne wiadomości (potwierdzenie z opiekunem i terminem, „opiekun się tym zajmuje”, „wciąż na |

**Definicja ukończenia**

- `PB-16` — Wszystkie trasy panelu klienta na nowych komponentach; tryb zapamiętany per użytkownik; „/” działa na każdym ekranie; zrzuty mobile/desktop sprawdzone.
- `PB-20` — Decyzja o modelu zapisana w docs/VERRIS.md; przełącznik widoczny tylko dla kont z klientami; przełączenie zmienia kontekst usług, domen i płatności; guard uprawnień obejmuje nowe trasy (Z-04); testy w CI.
- `PB-34` — Makieta zaakceptowana; wszystkie ekrany admina i obsługi na v2, bramka a11y zielona.
- `PB-37` — Klient dostaje potwierdzenie z opiekunem i terminem, widzi „przeczytane” i postęp; po zamknięciu ocenia opiekuna i obsługę; obsługa ma szkic i szablony w jednym bloku.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Przeniesienie ekranow po akceptacji wzorca z PB-15. Ryzyko: zakres — ekranow jest duzo; kolejnosc od najczesciej uzywanych. | PRZEPLANOWANIE 2026-09-22 (3): decyzja wlasciciela — przed startem design (PB-15/16), asystent v1 (PB-17) i tickety v2 (PB-18); plan wydluza sie o 3 sprinty.

## Sprint 8 — Poczta: dostarczalnosc i skrzynki

`2026-10-19 – 2026-10-23` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `E-15` | Rekordy SPF — kreator | 6 | WYSOKA | 2026-09-23 D1: deliverability/mail-auth.ts (buildMailAuthChecks) + deliverability.service.ts (strefa DA + delegacja NS); UI app/dashboard/email/delive |
| `E-16` | Rekordy DKIM — konfiguracja | 6 | WYSOKA | deliverability/mail-auth.ts (akcja enable-dkim); servers/directadmin.service.ts enableHostingDkim; POST /services/:id/hosting-email/dkim; email/delive |
| `E-17` | Rekord DMARC — konfiguracja | 6 | WYSOKA | 2026-09-23 D1: mail-auth.ts dmarcCheck (brak / p=none / kilka rekordów) + lib/dmarc.ts tuneDmarc (polityka + adres raportów) w deliverability-panel.ts |
| `E-05` | Zmiana quoty ISTNIEJĄCEJ skrzynki | 6 | WYSOKA | 2026-09-23 D1: POST /services/:id/hosting-email/quota (ZmienRozmiarSkrzynkiDto 10–102400 MB) → directadmin.service changeHostingEmailQuota (CMD_API_PO |
| `M-26` | Usunięcie zapisanej karty przez klienta | 6 | WYSOKA | 2026-09-23 D1: DELETE /billing/payment-methods/:id (ParseUUIDPipe) → billing.service deleteMyPaymentMethod: Stripe detach, usunięcie wiersza, zerowani |

**Definicja ukończenia**

- `E-15` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `E-16` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `E-17` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `E-05` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `M-26` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Brak SPF/DKIM w panelu to najczestsza przyczyna "moja poczta trafia do spamu". Backend dziala — to glownie podpiecie osieroconego komponentu. | PRZEPLANOWANIE 2026-09-22 (decyzja wlasciciela): wszystko, co wymaga nowego serwera, na koniec — zakup AX102 dopiero w sprincie 18, zeby serwer nie stal pusty i nie generowal kosztow. Najpierw panel, funkcje i poprawki na istniejacej infrastrukturze. | PRZEPLANOWANIE 2026-09-22 (3): decyzja wlasciciela — przed startem design (PB-15/16), asystent v1 (PB-17) i tickety v2 (PB-18); plan wydluza sie o 3 sprinty.

---

# Faza 2 — Odzyskanie funkcji-widm i luki pierwszego tygodnia

*Sprinty 9–14 · 194 h · 2026-10-26 – 2026-12-04*

Pozycje tanie i widoczne: backend albo UI już istnieje, trzeba je połączyć. Najlepszy stosunek wartości do pracy w całym backlogu.

## Sprint 9 — Asystent v1

`2026-10-26 – 2026-10-30` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `PB-17` | Asystent v1: dymki, naprawy jednym kliknięciem, czat z danymi konta | 30 | WYSOKI | Dymki kontekstowe na regułach (bez kosztu AI): dysk, domena nie wskazuje na nas, SPF/DKIM, SSL wygasa, backup nieświeży — najwyżej jeden na ekran, „ni |

**Definicja ukończenia**

- `PB-17` — Co najmniej 5 reguł dymków z testami; każda naprawa ma cofnięcie i wpis audytu; czat odpowiada z kontekstem usługi; brak akcji destrukcyjnych w v1.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Dymki na regulach i naprawy odwracalne — bez kosztow AI i bez akcji destrukcyjnych. Agent wykonujacy akcje: po starcie. | PRZEPLANOWANIE 2026-09-22 (3): decyzja wlasciciela — przed startem design (PB-15/16), asystent v1 (PB-17) i tickety v2 (PB-18); plan wydluza sie o 3 sprinty.

## Sprint 10 — Tickety v2

`2026-11-02 – 2026-11-06` · **24 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `PB-18` | Tickety v2: podgląd klienta, szablony ze zmiennymi, szkice odpowiedzi | 24 | WYSOKI | Panel staff: boczny podgląd klienta w tickecie (usługi, saldo, faktury/dokumenty, zdarzenia, historia zgłoszeń, health score); szablony odpowiedzi ze  |

**Definicja ukończenia**

- `PB-18` — Podgląd klienta bez przechodzenia między ekranami; szablony podstawiają zmienne z testem; szkic odpowiedzi dla 6 kategorii (DNS, SSL, poczta, płatność, migracja, awaria).
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Od pierwszego klienta support musi byc szybki; auto-wysylka odpowiedzi dopiero po zebraniu danych o trafnosci szkicow. | PRZEPLANOWANIE 2026-09-22 (3): decyzja wlasciciela — przed startem design (PB-15/16), asystent v1 (PB-17) i tickety v2 (PB-18); plan wydluza sie o 3 sprinty.

## Sprint 11 — Warstwa operatorska: zatrzymywanie szkody

`2026-11-09 – 2026-11-13` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `A-25` | Ręczne zawieszenie usługi przez operatora | 6 | WYSOKA | 2026-09-23 D1: admin-panel subscriptions/[id]/suspend-form.tsx + suspend-actions.ts → POST /admin/subscriptions/:id/suspend (powód, notatka, potwierdz |
| `A-26` | Ręczne odwieszenie usługi przez operatora | 6 | WYSOKA | 2026-09-23 D1: ten sam formularz — odwieszenie z opcją obciążenia za odnowienie (chargeRenewal) |
| `N-07` | Ręczne tworzenie incydentu na status page | 6 | WYSOKA | 2026-09-23 D2: admin-panel status/incidents/incident-compose.tsx → POST /admin/product-ops/incidents; przycisk „Rozwiąż” (PATCH incidents/:id status=R |
| `N-14` | Cordon wysyłki poczty (auto-blokada spamu) | 6 | WYSOKA | 2026-09-23: admin-panel /deliverability (Blokady wysyłki poczty, link w menu) → GET/POST /admin/deliverability/cordons; lista z e-mailem i nazwą klien |
| `H-22` | Panel odtwarzania w widocznym miejscu | 6 | WYSOKA | 2026-09-23: client-panel BackupsTab.tsx — sekcja „Kopie poza serwerem” (HostingOffsitePanel) w zakładce Kopie zapasowe; zdublowany panel przywracania  |

**Definicja ukończenia**

- `A-25` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `A-26` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `N-07` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `N-14` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `H-22` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Bez tego pierwszy incydent obslugujesz curlem o drugiej w nocy. Pierwsze cztery pozycje to endpointy, ktore juz dzialaja. | PRZEPLANOWANIE 2026-09-22 (decyzja wlasciciela): wszystko, co wymaga nowego serwera, na koniec — zakup AX102 dopiero w sprincie 18, zeby serwer nie stal pusty i nie generowal kosztow. Najpierw panel, funkcje i poprawki na istniejacej infrastrukturze.

## Sprint 12 — Backup i staging

`2026-11-16 – 2026-11-20` · **24 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `H-09` | Kopia bezpieczeństwa przed odtworzeniem | 6 | WYSOKA | 2026-09-23 D1: hosting-restore.service.ts takeSafetyBackup — odtwarzanie rusza dopiero, gdy na liście kopii pojawi się NOWE archiwum (do 15 min), inac |
| `H-17` | Tryb restore skryptu odtwarzającego osiągalny z produktu | 6 | WYSOKA | 2026-09-23: produktowa ścieżka odtwarzania z off-site = „Pobierz na serwer” (fetch, agent) + przywrócenie z listy kopii z kopią bezpieczeństwa (H-09)  |
| `G-20` | Ochrona przed atakiem słownikowym na panel | 6 | WYSOKA | 2026-09-23 D2: common/guards/rate-limit.guard.spec.ts (6 testów: limit per IP, per e-mail z wielu IP, reset okna, zakresy i @SkipRateLimit, przepełnie |
| `I-11` | Staging — publikacja na produkcję | 6 | WYSOKA | 2026-09-23 D1: node-staging-sync.sh TO_LIVE — eksport bazy LIVE i niepusty plik kopii są twardą bramką (die) przed db import; retencja po udanej kopii |

**Definicja ukończenia**

- `H-09` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `H-17` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `G-20` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `I-11` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** H-17 bylo zalezne od H-20 — zamkniete 2026-08-23 dowodem D4, wiec zaleznosc spelniona. | PRZEPLANOWANIE 2026-09-22 (decyzja wlasciciela): wszystko, co wymaga nowego serwera, na koniec — zakup AX102 dopiero w sprincie 18, zeby serwer nie stal pusty i nie generowal kosztow. Najpierw panel, funkcje i poprawki na istniejacej infrastrukturze. Pozycje, ktore okaza sie wymagac wezla do dowodu D3, dostaja kod tutaj, a dowod w sprincie 18.

## Sprint 13 — Ogony, zaleznosci i dokumenty VOID

`2026-11-23 – 2026-11-27` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `X-31` | Kanał alertów daje znak życia (dead man's switch) | 6 | — | ops/observability/grafana/provisioning/alerting/rules.yaml — grupa verris_kanal_alertow, reguła VerrisKanalAlertowZyje (vector(1), for: 0s, oba stany  |
| `X-32` | Martwy job da się odrzucić z panelu, ze śladem w audycie | 6 | — | apps/api/src/common/audit/audit.actions.ts — PROVISIONING_JOB_DISCARDED_BY_ADMIN; provisioning-queue.service.ts — odrzucJob (getState() === failed, śl |
| `DEP-02` | W drzewie stoją dwa majory ESLinta naraz | 6 | ŚREDNIA | package.json (korzeń) — @eslint/js ^10.0.1 przy braku jakiegokolwiek eslint.config.* w korzeniu; libs/eslint-config/node_modules: eslint 10.9.0 obok @ |
| `M-08` | Anulowanie faktury (VOID) z panelu | 6 | WYSOKA | billing/anulowanie.service.ts (POST /admin/invoices/:id/anuluj, BILLING_MANAGE); admin: invoices/void-button.tsx; test D2 anulowanie.service.spec.ts |
| `C-18` | Konto FTP — zmiana hasła | 6 | WYSOKA | 2026-09-23 D1: POST /services/:id/hosting-ftp/:username/password (ZmienHasloFtpDto) → directadmin.service changeHostingFtpPassword (action=modify, kat |

**Definicja ukończenia**

- `X-31` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-32` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `DEP-02` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `M-08` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `C-18` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** X-31 i X-32 to ostatnie CZESCIOWE z passu adwersaryjnego. DEP-02 tu, bo wyciszenie majorow ESLinta z DEP-03 ma termin przegladu 2026-11-15, a sprint zaczyna sie 2026-11-02. M-08 (anulowanie faktury VOID) — w trybie zewnetrznym z FAK-01 dotyczy dokumentu rozliczeniowego, nie faktury VAT; zakres do potwierdzenia przy realizacji. X-31 i X-32 zamkniete 2026-09-22 (D3) — zostaja tu jako zapis. | PRZEPLANOWANIE 2026-09-22 (decyzja wlasciciela): wszystko, co wymaga nowego serwera, na koniec — zakup AX102 dopiero w sprincie 18, zeby serwer nie stal pusty i nie generowal kosztow. Najpierw panel, funkcje i poprawki na istniejacej infrastrukturze.

## Sprint 14 — Rozliczenia klienta i pomiar

`2026-11-30 – 2026-12-04` · **56 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `A-11` | Wyszukiwarka wolnych domen | 6 | WYSOKA | domains.controller.ts:54 |
| `C-11` | Spakowanie do archiwum | 6 | ŚREDNIA | 2026-09-23 D1: POST /services/:id/files/compress → files.service compress (nazwa archiwum walidowana) → SDK compressEntries (schowek DA + action=compr |
| `NODE-03` | Pojemność węzła nigdy się nie odświeża | 6 | ŚREDNIA | 2026-09-23 D1: verris-lve.sh node_capacity (nproc, MemTotal, df /) w każdym raporcie, lve-agent/1.1; telemetry.dto NodeStatusDto.totalCpuCores/totalMe |
| `PB-08` | Pomiar: Consent Mode v2 + GTM + dedup event_id | 16 | ŚREDNI | Wdrożenie ustaleń z audytu pomiaru: www linkuje, panel działa, deduplikacja po event_id, cookie Domain=.verris.pl. | PRZEGLĄD GTM 2026-09-23 (tylko od |
| `PB-27` | Indywidualne warunki usługi: cena i autoskalowanie | 12 | WYSOKI | Decyzja właściciela 2026-09-26: operator (admin albo pracownik z uprawnieniem „Indywidualne warunki”) zakłada usługę na istniejącym lub nowym koncie i |
| `PB-28` | Rozliczenie poza Verris (całe konto) | 10 | WYSOKI | Decyzja właściciela 2026-09-26: klient oznaczony „rozliczany przez właściciela” — system nie pobiera opłat, nie blokuje za brak płatności, sam przedłu |

**Definicja ukończenia**

- `A-11` — Wartość domyślna włączona albo check w live-readiness pilnuje konfiguracji — flaga nie może po cichu wyłączyć funkcji.
- `C-11` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `NODE-03` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `PB-08` — Zdarzenie zakupu dociera raz, nie dwa. Consent Mode nie blokuje pomiaru po zgodzie. Zweryfikowane w GTM Preview i w raporcie.
- `PB-27` — Operator zakłada usługę z własną ceną; odnowienie pobiera tę cenę; autoskalowanie liczone z rabatem; każda zmiana w dzienniku audytu z autorem i powodem; test na PostgreSQL.
- `PB-28` — Flaga na koncie ustawiana z panelu admina/obsługi; testy: brak obciążeń, przedłużanie okresu, brak maili, brak blokady, raport zużycia autoskalowania.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Ostatni sprint kodowy przed blokiem dokumentow. PB-08 (Consent Mode v2 + dedup event_id) jest tu, a nie przy landingu, bo to kod w panelu, nie tresc — landing tylko z niego korzysta. | PRZEPLANOWANIE 2026-09-22 (decyzja wlasciciela): wszystko, co wymaga nowego serwera, na koniec — zakup AX102 dopiero w sprincie 18, zeby serwer nie stal pusty i nie generowal kosztow. Najpierw panel, funkcje i poprawki na istniejacej infrastrukturze. NODE-03 (pojemnosc wezla z telemetrii) dolozone tutaj z sprintu 13 dla pojemnosci — kod bez wezla, dowod przy wezle.

---

# Faza 3 — Wejście na rynek

*Sprinty 15–19 · 251 h · 2026-12-07 – 2027-01-08*

Dokumenty, cennik, landing, pomiar, domknięcie KSeF-a tuż przed sprzedażą, baza wiedzy, przejście ścieżki pierwszego klienta na produkcji i zapisana decyzja GO.

## Sprint 15 — Egress: pelne pokrycie ruchu (control-plane)

`2026-12-07 – 2026-12-11` · **52 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `X-41` | Hardening egressu wisi w łańcuchu OUTPUT, a ruch kontenerów idzie przez FORWARD | 16 | WYSOKA | obserwacja wpięta w DOCKER-USER, 1674 pakiety zliczone, 0 DROP/REJECT |
| `SEC-03` | Ruch poza TCP/80 i TCP/443 — DNS (UDP/53), SMTP — nie jest objęty ani obserwacją z X-41, ani trybem strict | 16 | WYSOKA | ops/scripts/security-control-plane-egress.sh — zbuduj_zbior_z_pliku (verris_egress_dns / verris_egress_smtp z ops/etc/verris/security/egress-allow-{dn |
| `PB-22` | Badge na stronę v2 — interaktywne i użyteczne dla klienta | 20 | ŚREDNI | Zgłoszenie właściciela 2026-09-23: stare badge wyglądały źle i nic nie robiły (uptime pokazywał stan węzła, embed EKO blokowany przez X-Frame-Options/ |

**Definicja ukończenia**

- `X-41` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `SEC-03` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `PB-22` — Badge widoczne na prod na domenie klienta; pieczęć znika przy niespełnionych warunkach; kliknięcia polecenia liczone; testy D2 zielone.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** X-41 zamyka to, co dzis jest tylko obserwacja: hardening wisi w lancuchu OUTPUT, a ruch kontenerow idzie przez FORWARD/DOCKER-USER, czyli egress CALEGO PRODUKTU byl poza zasiegiem zabezpieczenia, ktore wygladalo, jakby go obejmowalo. Obserwacja stoi (1674 pakiety, 0 DROP), zostaje egzekwowanie. SEC-03 dokłada ruch spoza TCP/80 i TCP/443 — DNS po UDP/53 i SMTP nie sa objete ani obserwacja, ani trybem strict, wiec bez tego "strict" opisuje dwa porty, nie host. | PRZEPLANOWANIE 2026-09-22 (decyzja wlasciciela): wszystko, co wymaga nowego serwera, na koniec — zakup AX102 dopiero w sprincie 18, zeby serwer nie stal pusty i nie generowal kosztow. Najpierw panel, funkcje i poprawki na istniejacej infrastrukturze. Pomiar z SEC-05 dziala od 2026-09-22, wiec egzekwowanie w FORWARD i UDP/53/SMTP ma juz na czym sie oprzec. Po panelu (sprinty 6-11), bezposrednio przed wlaczeniem strict — oba to ta sama robota na zaporze control-plane, a pomiar dostaje przez ten czas kilka tygodni danych.

## Sprint 16 — Strict egress na control-plane

`2026-12-14 – 2026-12-18` · **60 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `SEC-05` | Log egressu jest próbką, nie zapisem | 6 | WYSOKA | ops/scripts/security-control-plane-egress.sh — apply_egress_seen: lancuch VERRIS_EGRESS_SEEN (pierwszy w OUTPUT) dopisuje KAZDE nowe polaczenie TCP/UD |
| `SEC-04` | Host rozmawia z kontenerami przez OUTPUT — ruch wewnętrzny liczony jako egress | 6 | WYSOKA | security-control-plane-egress.sh — RETURN dla -o lo/docker0/br-+ w VERRIS_EGRESS_STRICT i br-+ w VERRIS_EGRESS_BOGON przed DROP; test apps/api/src/tes |
| `SEC-01` | Tryb `--strict` jest atrapą | 16 | WYSOKA | security-control-plane-egress.sh — apply_strict_allowlist: DROP bez testu cgroup, kontrola po fakcie (iptables -S; brak reguly = exit 1), warunek wste |
| `SEC-06` | Allowlista pokrywa to, o czym ktoś pomyślał, nie to, co host robi | 16 | WYSOKA | ipset test verris_egress_https na 4 celach z logu egressu |
| `SEC-02` | Stripe jest w allowliście wyłącznie po nazwie, a ipset powstaje z rozwiązania nazw | 6 | ŚREDNIA | `egress-allow-hostnames.txt`; ipset `verris_egress_https` = 65 wpisów |
| `PB-23` | Każdy widok osiągalny z menu (klient, admin, staff) | 10 | ŚREDNI | Zasada właściciela 2026-09-23: żaden ekran nie może wymagać szukania po panelu. Przegląd wszystkich tras (page.tsx) w trzech panelach i ich wejść w me |

**Definicja ukończenia**

- `SEC-05` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `SEC-04` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `SEC-01` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `SEC-06` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `SEC-02` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `PB-23` — Lista tras vs menu dla trzech paneli bez luk; test-strażnik czerwony po dodaniu trasy bez wejścia w nawigacji.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** Kod SEC-05/04/01 gotowy 2026-09-22 (pomiar na produkcji od 09:23 UTC). Tutaj: allowlista z kilku tygodni pelnego pomiaru (SEC-06), odswiezanie adresow Stripe (SEC-02), wlaczenie --strict (warunek wstepny w skrypcie sam odmowi, jesli pomiar widzi cele spoza listy). | PRZEPLANOWANIE 2026-09-22 (decyzja wlasciciela): wszystko, co wymaga nowego serwera, na koniec — zakup AX102 dopiero w sprincie 18, zeby serwer nie stal pusty i nie generowal kosztow. Najpierw panel, funkcje i poprawki na istniejacej infrastrukturze.

## Sprint 17 — Dokumenty prawne, DPA i naduzycia

`2026-12-21 – 2026-12-25` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `P-15` | Podpisane DPA z subprocesorami (część) | 6 | BLOKER STARTU | docs/legal/dpa-subprocessors-tracking.md — tabela statusow po korekcie 2026-09-19. Stripe i AWS: DPA obowiazuje z mocy umowy glownej. Hetzner i Openpr |
| `PB-03` | Finalizacja dokumentów prawnych 1.0.0 | 16 | BLOKER BIZNESOWY | Regulamin, polityka prywatności, SLA, DPA, polityka cookies — wyjście z DRAFT-u, wersjonowanie i publikacja w panelu. | 2026-09-23: decyzje właściciel |
| `PB-04` | Procedura obsługi nadużyć (abuse) — dokument | 8 | WYSOKI | Adres abuse@ obsługiwany, ścieżka od zgłoszenia do reakcji, czasy reakcji, kto decyduje o zawieszeniu, wzory odpowiedzi do CERT i rejestratorów. | 202 |

**Definicja ukończenia**

- `P-15` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `PB-03` — Wszystkie dokumenty w statusie opublikowanym z numerem wersji i datą. Panel /legal nie pokazuje ani jednego „Dokument w przygotowaniu”.
- `PB-04` — Dokument w ops/docs z właścicielem i czasami reakcji. Test: zgłoszenie wysłane na abuse@ trafia do kogoś i ma odpowiedź w deklarowanym czasie.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** BLOK DOKUMENTOW — przesuniety na koniec decyzja wlasciciela 2026-09-22: najpierw kod i infrastruktura, dokumenty na sam koniec, przed pierwszym klientem. Kolejnosc wewnatrz bloku wymuszona zaleznosciami: regulamin (PB-03) przed kredytami SLA (N-16), cennik (PB-07) przed landingiem (PB-06), landing przed kampania (PB-10), wszystko przed sciezka pierwszego klienta (PB-05). P-15 zamyka ostatni bloker poza FAK-01 i Z-18: zostal tylko Hetzner (Zalacznik 1 przygotowany w trackerze). PB-04: adres abuse@ jest punktem kontaktowym DSA i musi istniec przed publikacja regulaminu. Polityka prywatnosci opisuje lokalizacje przetwarzania DE/FI (ADR-2026-09-22-wezel-1-hetzner).

## Sprint 18 — Cennik, SLA i zastepstwo

`2026-12-28 – 2027-01-01` · **53 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `N-16` | SLA z zapisanymi kredytami | 6 | WYSOKA | sla-credit.scheduler.ts — wylicz() (progi §15, miesiąc kalendarzowy, okna konserwacyjne, 1 wypłata/usługę/miesiąc) + run() za flagą; GET /admin/sla/po |
| `A-11` | Wyszukiwarka wolnych domen | 6 | WYSOKA | domains.controller.ts:54 |
| `PB-07` | Treści i cennik na verris.pl | 16 | WYSOKI | Strona główna, cennik, specyfikacja techniczna pakietu, strona SLA. Narracja: cena stała, bez skoku po roku. | 2026-09-25 PRZYGOTOWANE DO AKCEPTACJI:  |
| `PB-11` | Bus factor: drugi kanał alertów i procedura zastępstwa | 8 | WYSOKI | Alerty na więcej niż jeden adres, przetestowane. Dokument: co robi ktoś inny, gdy Ciebie nie ma przez tydzień. | 2026-09-23: Telegram jako drugi kanał |
| `PB-21` | DNS platformy i poczty na serwerze testowym | 6 | WYSOKI | Odłożone decyzją właściciela 2026-09-23 do chwili, gdy jest serwer testowy. (1) Decyzja: wspólny rekord _spf.verris.pl (include platformy, łatwa zmian |
| `PB-24` | KSC/NIS2: wpis do wykazu podmiotów kluczowych | 3 | WYSOKI | Wg FAQ KSC (cyber.gov.pl) podmiot świadczący usługi rejestracji nazw domen i dostawca usług DNS = podmiot kluczowy niezależnie od wielkości. Decyzja w |
| `PB-25` | White label na węźle — klient nie widzi DirectAdmina | 8 | WYSOKI | Decyzja właściciela 2026-09-24: pełny white label. Teksty dla klienta (verris.pl, panel, maile, dokumenty prawne) wyczyszczone tego dnia i pilnowane s |

**Definicja ukończenia**

- `N-16` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `A-11` — Wartość domyślna włączona albo check w live-readiness pilnuje konfiguracji — flaga nie może po cichu wyłączyć funkcji.
- `PB-07` — Cennik zgodny z wynikiem PB-01. Specyfikacja techniczna publiczna, jak u cyber_Folks — to jest element zaufania, którego rynek oczekuje.
- `PB-11` — Alert testowy dociera dwoma kanałami. Dokument zastępstwa zawiera dostęp awaryjny i listę rzeczy, które muszą się dziać codziennie.
- `PB-21` — Na serwerze testowym: rekord dodany i usunięty z panelu bez duplikatu; zmiana rozmiaru skrzynki zostawia hasło; kreator poczty pokazuje DKIM ze strefy i zapisuje SPF/DMARC; verris.pl ma jeden DMARC; decyzja o _spf.verris.pl zapisana w docs/VERRIS.md. Po D3 F-01/F-02, E-05, E-15/16/17 przechodzą w macierzy na PARYTET.
- `PB-24` — Wpis w wykazie przed upływem 6 miesięcy od pierwszej domeny/DNS dla klienta; termin zapisany w tym zadaniu z datą.
- `PB-25` — Na węźle #1: logowanie do panelu hostingowego, phpMyAdmin i webmaila z panelu klienta nie pokazuje nazwy ani portu DirectAdmina; nowa domena i konto zawieszone pokazują strony Verris; zrzuty w dowodzie.
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** BLOK DOKUMENTOW — przesuniety na koniec decyzja wlasciciela 2026-09-22: najpierw kod i infrastruktura, dokumenty na sam koniec, przed pierwszym klientem. Kolejnosc wewnatrz bloku wymuszona zaleznosciami: regulamin (PB-03) przed kredytami SLA (N-16), cennik (PB-07) przed landingiem (PB-06), landing przed kampania (PB-10), wszystko przed sciezka pierwszego klienta (PB-05). N-16 (kredyty SLA) po PB-03, bo regulamin obiecuje kredyty — najpierw przeliczyc je na realnych danych z probe-ow. Cennik zgodny z PB-01 (45 zl/mies brutto, 399 zl/rok). | 2026-09-23: PB-21 (DNS platformy i D3 edytora DNS/poczty) tutaj, bo w tym sprincie pojawia się serwer testowy.

## Sprint 19 — Landing i baza wiedzy

`2027-01-04 – 2027-01-08` · **56 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `PB-06` | Landing /przenies-strone | 16 | WYSOKI | Strona docelowa kampanii Google Ads na osi migracji. Treść oparta na realnych przewagach z audytu, nie na obietnicach. | 2026-09-25 PRZYGOTOWANE DO AK |
| `PB-09` | Baza wiedzy — 20 artykułów startowych | 16 | ŚREDNI | Artykuły pokrywające najczęstsze pytania pierwszego tygodnia: skierowanie domeny, SSL, poczta, FTP, backup, migracja, faktury. | 2026-09-23: seed ma 3 |
| `PB-19` | Widok strony: ruch, TTFB, błędy 5xx, technologia i logi z węzła | 24 | ŚREDNI | Braki makiety widoku strony (docs/design/wzorzec-panelu.html), których API nie ma, bo wymagają węzła: (1) odwiedziny, mediana TTFB i błędy 5xx per dom |

**Definicja ukończenia**

- `PB-06` — Strona opublikowana, pomiar działa, formularz i CTA prowadzą do rejestracji. Żadne twierdzenie na stronie nie jest oznaczone w macierzy jako LUKA lub ATRAPA.
- `PB-09` — 20 artykułów opublikowanych i zaindeksowanych do asystenta AI. Każdy opisuje funkcję, która w macierzy ma status DZIAŁA.
- `PB-19` — Na działającym węźle produkcyjnym: widok strony pokazuje ruch 7 dni, TTFB i 5xx z prawdziwych logów, wykrytą technologię i zakładkę „Logi”; brak danych = „—”, nie zero; testy parsera logów i detekcji technologii w CI; sprawdzone na D3 (serwer).
- **Cały sprint** — `audyt/dane/macierz.csv` zaktualizowana (uzasadnienie w „Uwagach”), widoki przebudowane, decyzje dopisane do `docs/VERRIS.md`.

**Ryzyko sprintu.** BLOK DOKUMENTOW — przesuniety na koniec decyzja wlasciciela 2026-09-22: najpierw kod i infrastruktura, dokumenty na sam koniec, przed pierwszym klientem. Kolejnosc wewnatrz bloku wymuszona zaleznosciami: regulamin (PB-03) przed kredytami SLA (N-16), cennik (PB-07) przed landingiem (PB-06), landing przed kampania (PB-10), wszystko przed sciezka pierwszego klienta (PB-05). Landing nie moze obiecywac funkcji ze statusem LUKA lub ATRAPA — kazde zdanie sprawdzic wobec macierzy.

---

# Po starcie — roadmapa kwartalna

82 pozycji, 1624 h. Epiki, nie sprinty — kolejność zweryfikujemy danymi od pierwszych klientów.

| ID | Epik | Priorytet | Kwartał | Pozycji | h | Dlaczego teraz, a nie wcześniej |
|---|---|---|---|---|---|---|
| `E-01` | Runtime, pliki i diagnostyka | WYSOKI | Q1 2027 | 19 | 346 | Najczęstsze źródło zgłoszeń w pierwszych miesiącach każdego hostingu. Logi WWW ma pięć z pięciu badanych hostingów PL — bez nich klient nie zdiagnozuje własnej strony i pisze do nas. |
| `E-02` | Wydajność: cache i skalowanie | WYSOKI | Q1 2027 | 6 | 110 | Trzy z pięciu hostingów PL dają Redis w cenie. Przy pozycjonowaniu na WordPressa to nie dodatek, tylko oczekiwanie. |
| `E-12` | Backup: granularność i retencja | WYSOKI | Q1 2027 | 6 | 94 | cyber_Folks daje 28 dni, seohost do 60. Nasze 30 dni jest w normie, ale granularność odtwarzania jest poniżej rynku. |
| `E-14` | Rozliczenia: dokończenie | WYSOKI | Q1 2027 | 1 | 16 | Z-07 z macierzy: klient płacący portfelem doładowuje saldo w karencji i i tak zostaje zawieszony. Pierwszy taki przypadek to stracony klient. |
| `E-15` | Wsparcie i ops: kolejka abuse | WYSOKI | Q1 2027 | 3 | 86 | Sprint 13 daje możliwość zatrzymania szkody. Ten epik daje proces, który skaluje się dalej niż jedna osoba. |
| `E-03` | WordPress Toolkit | WYSOKI | Q2 2027 | 5 | 94 | Cztery z pięciu hostingów PL mają automatyczne aktualizacje WordPressa. Staging już mamy i jest przewagą — reszta toolkitu ją domyka. |
| `E-04` | Domeny jako produkt | WYSOKI | Q2 2027 | 8 | 78 | Backend jest gotowy i wyłączony brakiem konfiguracji. Domena to najczęstszy pierwszy zakup i naturalny punkt wejścia. |
| `E-05` | Katalog aplikacji | ŚREDNI | Q2 2027 | 1 | 16 | Softaculous ma około 400 aplikacji. Nie musimy mieć 400, ale dwie to nie jest katalog. |
| `E-10` | Poczta: filtry, kalendarz, limity | ŚREDNI | Q2 2027 | 5 | 94 | „Gdzie jest mój mail” to najczęstszy ticket poczty. Podgląd kolejki zdejmuje go z obsługi i oddaje klientowi. |
| `E-06` | Bezpieczeństwo jako funkcja | ŚREDNI | Q3 2027 | 4 | 96 | Pozycja licencyjna — wchodzi do rachunku z PB-01. Może być produktem dodatkowym, nie musi być w cenie pakietu. |
| `E-07` | Reseller jako produkt | ŚREDNI | Q3 2027 | 5 | 176 | Dziś to strona sprzedażowa z dwoma GET-ami. Albo staje się produktem, albo znika z nawigacji — trzeciej opcji nie ma. |
| `E-08` | Dostępność i zgodność w produkcie | ŚREDNI | Q3 2027 | 4 | 112 | Zwolnienie mikroprzedsiębiorcy z EAA wygasa przy 10 pracownikach lub 2 mln EUR. Lepiej mieć to wcześniej niż w tygodniu przekroczenia progu. |
| `E-11` | DNS: DNSSEC i zarządzanie strefą | ŚREDNI | Q3 2027 | 3 | 62 | Żaden z pięciu hostingów PL nie potwierdza publicznie DNSSEC. To okazja, nie luka. |
| `E-13` | Automatyzacja: API zapisu i webhooki | ŚREDNI | Q3 2027 | 4 | 68 | Żaden hosting PL nie ma publicznego API — mamy przewagę, która dziś obejmuje pięć GET-ów przy opisie obiecującym CI/CD i Terraform. |
| `E-16` | Rozszerzenia oferty | NISKI | Q4 2027 | 6 | 96 | Decyzja o kreatorze stron jest binarna. Kod, który leży zakomentowany przez rok, jest długiem, nie opcją. |
| `E-09` | Pokrycie testowe warstw krytycznych | WYSOKI | ciągłe | 2 | 80 | Realizowane równolegle z każdą fazą, nie jako osobny projekt. Zasada: każda naprawiona pozycja dostaje test, który najpierw czerwieni się na starym kodzie. |

- **E-01 Runtime, pliki i diagnostyka** (346 h) — php.ini i rozszerzenia PHP z panelu, logi dostępu i błędów WWW, import/eksport bazy, spakowanie archiwum, SSH i klucze SSH dla hostingu, podgląd zajętości katalogów.
- **E-02 Wydajność: cache i skalowanie** (110 h) — Redis jako cache obiektowy sterowany z panelu, LSCache, weryfikacja HTTP/3, CDN, optymalizacja obrazów.
- **E-03 WordPress Toolkit** (94 h) — Automatyczne aktualizacje, aktualizacje wtyczek i motywów, klonowanie między domenami, hardening, skan podatności, tryb konserwacji, masowe zarządzanie.
- **E-04 Domeny jako produkt** (78 h) — Konfiguracja rejestratora, zakup i transfer z panelu, odnowienia, zmiana danych abonenta, blokada transferu, ukrycie WHOIS.
- **E-05 Katalog aplikacji** (16 h) — Rozbudowa katalogu z dwóch pozycji do kilkunastu najczęściej instalowanych albo integracja z gotowym instalatorem.
- **E-06 Bezpieczeństwo jako funkcja** (96 h) — Skaner malware, czyszczenie zainfekowanych plików, rozbudowa WAF, HSTS, anty-DDoS, sprzedaż certyfikatów DV/OV/EV.
- **E-07 Reseller jako produkt** (176 h) — Zakładanie kont przez resellera, marża ustawiana przez niego, white-label, rozliczenia.
- **E-08 Dostępność i zgodność w produkcie** (112 h) — WCAG 2.1 AA dla ścieżki klienta, RCPD jako moduł zamiast pliku, ISO 27001 jeśli wejdziemy w B2B, deklaracja lokalizacji danych.
- **E-09 Pokrycie testowe warstw krytycznych** (80 h) — Testy integracyjne API, moduł auth, klient KSeF, ścieżka backup/restore, DirectAdminService, panele frontowe.
- **E-10 Poczta: filtry, kalendarz, limity** (94 h) — Reguły filtrowania Sieve, podgląd kolejki i logów dostarczania, limity wysyłki pokazane klientowi, kalendarz i kontakty, 2FA dla webmaila.
- **E-11 DNS: DNSSEC i zarządzanie strefą** (62 h) — DNSSEC, zmiana TTL, Anycast DNS, pełne zarządzanie strefą po podpięciu edytora w sprincie 10.
- **E-12 Backup: granularność i retencja** (94 h) — Odtworzenie pojedynczego pliku, podgląd zawartości archiwum przed odtworzeniem, pobranie kopii lokalnie, retencja 28+ dni w cenie.
- **E-13 Automatyzacja: API zapisu i webhooki** (68 h) — Rozszerzenie publicznego API o operacje zapisu, webhooki dla klienta, edycja crona, cron z wyborem wersji PHP, podgląd wyniku wykonania.
- **E-14 Rozliczenia: dokończenie** (16 h) — Ponowienie płatności portfelem w karencji, waluty obce z przeliczeniem VAT, proforma, dodanie karty niezależnie od zakupu, eksport CSV.
- **E-15 Wsparcie i ops: kolejka abuse** (86 h) — Pełna kolejka obsługi nadużyć z encją zgłoszenia, terminami i śladem audytowym, ogłoszenia i okna serwisowe z panelu, feature flagi.
- **E-16 Rozszerzenia oferty** (96 h) — VPS: konsola, snapshoty, rebuild. Panel mobilny. Kreator stron — dokończyć albo usunąć 1612 zakomentowanych linii.

---

# Czego świadomie nie robimy

21 pozycji ma werdykt POZA ZAKRESEM. To decyzje, nie przeoczenia — dlatego są wypisane. Jeżeli któraś wróci jako żądanie klienta, wraca też decyzja do przeglądu.

| ID | Funkcja | Uzasadnienie |
|---|---|---|
| `B-07` | Wybór handlera PHP (LSAPI/FPM/CGI) | decyzja operatorska, nie klienta |
| `B-10` | Aplikacje Ruby | rynek PL tego nie oczekuje |
| `C-19` | Konto FTP — limit powierzchni (quota) |  | 2026-09-25 SPRAWDZONE W DOKUMENTACJI: DirectAdmin nie ma limitu powierzchni per konto FTP (docs.directadmin.com → FTP; konta FTP dzielą limit konta hostingowego, który panel pokazuje). Do decyzji właściciela: POZA ZAKRESEM (limit konta wystarcza) albo własne rozwiązanie poza DA. | DECYZJA WŁAŚCICIELA 2026-09-25: poza zakresem — DirectAdmin nie ma limitu per konto FTP; obowiązuje limit konta hostingowego (widoczny w panelu). |
| `C-20` | FTP anonimowy | funkcja schyłkowa, ryzyko nadużyć |
| `C-23` | Terminal SSH w przeglądarce | żaden hosting PL tego nie daje |
| `C-24` | WebDAV / Web Disk | Protokół schyłkowy — żaden z pięciu badanych hostingów PL go nie wystawia, a menedżer plików i SFTP pokrywają ten sam scenariusz. |
| `E-22` | Listy mailingowe | zastąpione modułem email-marketing |
| `F-07` | Secondary / slave DNS | Wtórny DNS ma sens przy własnej infrastrukturze DNS wielolokalizacyjnej; przy jednym operatorze i delegacji na zewnątrz (F-09) nie wnosi odporności, którą obiecuje. |
| `F-10` | Szablony stref DNS | Szablony stref są narzędziem resellera zarządzającego setkami domen. Do rozważenia razem z epikiem E-07, nie wcześniej. |
| `G-10` | ModSecurity — zarządzanie regułami | poziom operatora |
| `I-06` | Smart Updates (test przed aktualizacją) | wyróżnik Pleska, rynek PL tego nie ma |
| `K-07` | Statystyki odwiedzin (AWStats/Webalizer) | zastąpione własną analityką (K-12) |
| `M-14` | KSeF — numer i UPO widoczne dla klienta | dhosting pokazuje numer KSeF i QR na fakturze | 2026-09-22: poza planem startowym — ADR-2026-09-22, wlasny modul KSeF zamrozony (nie skasowany), KSeF realizuje program ksiegowy. Wraca w epiku integracji po API. | 2026-09-23 PO STARCIE: decyzja właściciela (PB-13 2026-09-22, potwierdzona 2026-09-23) — faktury VAT wystawia program księgowy Firmino (Streamsoft), który sam obsługuje KSeF; własny moduł KSeF zamrożony, bezpośrednia integracja z KSeF po starcie. Pozycja wraca przy tej integracji. |
| `M-15` | KSeF — pobranie UPO przez operatora | Skorygowane: UPO jest dostępne w portalu MF, więc warunek dokumentu księgowego nie jest naruszony. Brakuje wygody. | 2026-09-22: poza planem startowym — ADR-2026-09-22, wlasny modul KSeF zamrozony (nie skasowany), KSeF realizuje program ksiegowy. Wraca w epiku integracji po API. | 2026-09-23 PO STARCIE: decyzja właściciela (PB-13 2026-09-22, potwierdzona 2026-09-23) — faktury VAT wystawia program księgowy Firmino (Streamsoft), który sam obsługuje KSeF; własny moduł KSeF zamrożony, bezpośrednia integracja z KSeF po starcie. Pozycja wraca przy tej integracji. |
| `M-16` | KSeF — tryb offline/awaryjny | awaria KSeF zostawia fakturę w PENDING, bez kodu QR offline | 2026-09-22 FLAGA BLOKERA ZDJETA WARUNKOWO — ADR-2026-09-22 (faktury w programie ksiegowym). Wlasny modul KSeF zamrozony, obowiazek KSeF realizuje program ksiegowy. Warunek: FAK-01 na produkcji — do tego czasu panel potrafi wystawic fakture VAT poza KSeF. Pozycja schodzi z planu startowego do epiku integracji z programem ksiegowym. | 2026-09-23 PO STARCIE: decyzja właściciela (PB-13 2026-09-22, potwierdzona 2026-09-23) — faktury VAT wystawia program księgowy Firmino (Streamsoft), który sam obsługuje KSeF; własny moduł KSeF zamrożony, bezpośrednia integracja z KSeF po starcie. Pozycja wraca przy tej integracji. |
| `M-17` | KSeF — walidacja XSD przed wysyłką | smoke na api-test MF nie został wykonany | 2026-09-22 FLAGA BLOKERA ZDJETA WARUNKOWO — ADR-2026-09-22 (faktury w programie ksiegowym). Wlasny modul KSeF zamrozony, obowiazek KSeF realizuje program ksiegowy. Warunek: FAK-01 na produkcji — do tego czasu panel potrafi wystawic fakture VAT poza KSeF. Pozycja schodzi z planu startowego do epiku integracji z programem ksiegowym. | 2026-09-23 PO STARCIE: decyzja właściciela (PB-13 2026-09-22, potwierdzona 2026-09-23) — faktury VAT wystawia program księgowy Firmino (Streamsoft), który sam obsługuje KSeF; własny moduł KSeF zamrożony, bezpośrednia integracja z KSeF po starcie. Pozycja wraca przy tej integracji. |
| `Q-10` | Natywna aplikacja mobilna | tylko home.pl (iOS) |
| `X-07` | Pokrycie testami klienta KSeF | Reklasyfikacja jak X-01. | 2026-09-23 PO STARCIE: decyzja właściciela (PB-13 2026-09-22, potwierdzona 2026-09-23) — faktury VAT wystawia program księgowy Firmino (Streamsoft), który sam obsługuje KSeF; własny moduł KSeF zamrożony, bezpośrednia integracja z KSeF po starcie. Pozycja wraca przy tej integracji. |
| `KSEF-01` | Obowiązek KSeF działa od 1 kwietnia 2026 — od pięciu miesięcy | Przepisane do macierzy 2026-08-28 w ramach X-49 — pozycja powstala 2026-08-26 i do tego dnia istniala WYLACZNIE w dashboardzie, poza zasiegiem straznikow repozytorium. Obszar: KSeF / prawo. Krytycznosc i naklad zostaly puste SWIADOMIE: dashboard ich nie niosl, a wpisanie ich teraz byloby zgadywaniem. Do uzupelnienia przy najblizszym przegladzie tej pozycji. | TRESC ZE ZRODLA: Obowiązek KSeF działa od 1 kwietnia 2026 — od pięciu miesięcy. To nie jest funkcja do dorobienia przed premierą, tylko obowiązek uruchamiający się przy pierwszej fakturze dla klienta zewnętrznego. Zapowiadany okres bez kar ma dopiero doprecyzować akt wykonawczy, więc nie da się na nim oprzeć planu. | WYCENA 2026-09-19: krytycznosc i naklad uzupelnione przy wznowieniu. Pozycje przepisane 2026-08-28 w ramach X-49 zostaly bez wyceny, przez co nie liczyly sie do budzetu godzin i nie stały w zadnym sprincie. Podstawa wyceny: Pozycja faktograficzna, nie kodowa: zapis stanu prawnego i konsekwencji dla planu. Praca wlasciwa siedzi w PB-13, M-16 i M-17. | 2026-09-22: poza planem startowym — ADR-2026-09-22, wlasny modul KSeF zamrozony (nie skasowany), KSeF realizuje program ksiegowy. Wraca w epiku integracji po API. | 2026-09-23 PO STARCIE: decyzja właściciela (PB-13 2026-09-22, potwierdzona 2026-09-23) — faktury VAT wystawia program księgowy Firmino (Streamsoft), który sam obsługuje KSeF; własny moduł KSeF zamrożony, bezpośrednia integracja z KSeF po starcie. Pozycja wraca przy tej integracji. |
| `KSEF-02` | `KsefStatus.OFFLINE` istnieje w schemacie i nie jest ustawiany nigdy | Przepisane do macierzy 2026-08-28 w ramach X-49 — pozycja powstala 2026-08-26 i do tego dnia istniala WYLACZNIE w dashboardzie, poza zasiegiem straznikow repozytorium. Obszar: KSeF. Krytycznosc i naklad zostaly puste SWIADOMIE: dashboard ich nie niosl, a wpisanie ich teraz byloby zgadywaniem. Do uzupelnienia przy najblizszym przegladzie tej pozycji. | TRESC ZE ZRODLA: `KsefStatus.OFFLINE` istnieje w schemacie i nie jest ustawiany nigdy. Trzeci raz ten sam wzorzec w projekcie — po `ServerStatus.OFFLINE` (OPS-01) i regule alertowej z X-35. Wartość w enumie wygląda jak zaimplementowana funkcja, a jest zapisaną intencją. Skutek: faktura czekająca z powodu awarii KSeF i faktura czekająca, bo cykl nie zdążył, mają w bazie ten sam `PENDING` — a terminy ustawowe liczą się od różnych zdarzeń. | WYCENA 2026-09-19: krytycznosc i naklad uzupelnione przy wznowieniu. Pozycje przepisane 2026-08-28 w ramach X-49 zostaly bez wyceny, przez co nie liczyly sie do budzetu godzin i nie stały w zadnym sprincie. Podstawa wyceny: Zostaje klasyfikacja zdarzenia przez operatora — dzis kazda przerwa dostaje NIESKLASYFIKOWANY z najkrotszym terminem. | 2026-09-22: poza planem startowym — ADR-2026-09-22, wlasny modul KSeF zamrozony (nie skasowany), KSeF realizuje program ksiegowy. Wraca w epiku integracji po API. | 2026-09-23 PO STARCIE: decyzja właściciela (PB-13 2026-09-22, potwierdzona 2026-09-23) — faktury VAT wystawia program księgowy Firmino (Streamsoft), który sam obsługuje KSeF; własny moduł KSeF zamrożony, bezpośrednia integracja z KSeF po starcie. Pozycja wraca przy tej integracji. |
| `KSEF-03` | Brak kodów QR na fakturze offline | Przepisane do macierzy 2026-08-28 w ramach X-49 — pozycja powstala 2026-08-26 i do tego dnia istniala WYLACZNIE w dashboardzie, poza zasiegiem straznikow repozytorium. Obszar: KSeF / prawo. Krytycznosc i naklad zostaly puste SWIADOMIE: dashboard ich nie niosl, a wpisanie ich teraz byloby zgadywaniem. Do uzupelnienia przy najblizszym przegladzie tej pozycji. | TRESC ZE ZRODLA: Brak kodów QR na fakturze offline. Faktura przekazana nabywcy poza KSeF musi nieść dwa kody: KOD I („OFFLINE”) i KOD II („CERTYFIKAT”). W repozytorium nie ma ani jednego wystąpienia QR. KOD I jest w zasięgu (adres API + data z P_1 + NIP + skrót XML, a builder XML mamy). KOD II wymaga certyfikatu KSeF typu 2 z portalu MF — sprawa formalna, nie kod. Bez niego tryb offline nie jest dla nas dostępny wcale. | WYCENA 2026-09-19: krytycznosc i naklad uzupelnione przy wznowieniu. Pozycje przepisane 2026-08-28 w ramach X-49 zostaly bez wyceny, przez co nie liczyly sie do budzetu godzin i nie stały w zadnym sprincie. Podstawa wyceny: KOD I w zasiegu (adres API + P_1 + NIP + skrot XML, builder XML jest). KOD II wymaga certyfikatu KSeF typu 2 z portalu MF — sprawa formalna, nie kod. Bez obu tryb offline jest niedostepny, wiec pozycja wisi na M-16. | 2026-09-22: poza planem startowym — ADR-2026-09-22, wlasny modul KSeF zamrozony (nie skasowany), KSeF realizuje program ksiegowy. Wraca w epiku integracji po API. | 2026-09-23 PO STARCIE: decyzja właściciela (PB-13 2026-09-22, potwierdzona 2026-09-23) — faktury VAT wystawia program księgowy Firmino (Streamsoft), który sam obsługuje KSeF; własny moduł KSeF zamrożony, bezpośrednia integracja z KSeF po starcie. Pozycja wraca przy tej integracji. |

Cel „100% pokrycia we wszystkich kategoriach” nie kształtuje tego planu. Punktem odniesienia jest mediana rynku PL plus to, co klient uznaje za standard — nie suma możliwości cPanela, Pleska i DirectAdmina. Pokrycie rośnie tu jako skutek uboczny zamykania rzeczy, które mają znaczenie.
