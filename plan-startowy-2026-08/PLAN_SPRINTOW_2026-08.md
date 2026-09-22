# Plan sprintów do startu — Verris

**Wygenerowany:** 2026-09-22 z `audyt/dane/` · **nie edytuj ręcznie**  
**Podstawa:** audyt parytetu funkcji z 2026-08-20  
**Pojemność:** 1 osoba, pełny etat, **30 h netto na sprint** · sprint = 1 tydzień  
**Sprint 1:** 2026-08-31 · **Sprint 19:** 2027-01-04–2027-01-08

---

## Liczba, od której trzeba zacząć

Domknięcie **wszystkich** luk z macierzy to **3188 h** — przy 30 h tygodniowo około **25 miesięcy pracy solo, bez jednego przychodu po drodze**. Taki plan nie jest planem startu, tylko sposobem, żeby nigdy nie wystartować.

Dlatego praca dzieli się na dwie części: **19 sprintów do startu** (756 h) oraz roadmapę po starcie (2432 h, 153 pozycji) rozpisaną na epiki kwartalne.

- **2026-12-18** — koniec sprintu 16, zamknięte wszystkie blokery **poza KSeF-em**.
- **2027-01-08** — koniec sprintu 19, decyzja GO.

---

## Zasady obowiązujące w każdym sprincie

1. **Każda naprawiona pozycja dostaje test, który najpierw czerwieni się na starym kodzie.** Test napisany po naprawie i od razu zielony nie dowodzi niczego.
2. **Sprint kończy się, gdy definicja ukończenia jest spełniona, a nie gdy mija piątek.** Przesunięcie jest informacją; ukrycie przesunięcia jest porażką.
3. **Status wg skali dowodu.** Nic poniżej D2 nie jest „zrobione”. Pieniądze, dane klienta i dostęp → D3. Backupy i DR → D4.
4. **Zakaz formuły „warunkowe GO”.**
5. **Nowa praca odkryta w sprincie nie wchodzi do niego** — trafia do backlogu. Wyjątek: bloker znaleziony przy naprawie innego blokera.
6. **Każde zadanie ma plik w `docs/zadania/`**, każdy sprint podsumowanie w `docs/sprinty/`. Z tego składa się dokumentacja techniczna.
7. **Każdy sprint kończy się aktualizacją `audyt/dane/macierz.csv`** i przebudową widoków. Procedura: `plan-startowy-2026-08/AKTUALIZACJA_AUDYTU.md`.

---

# Faza 0 — Zatrzymać krwawienie

*Sprinty 1–3 · 262 h · 2026-08-31 – 2026-09-18*

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
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-01.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** PB-01 może wywrócić cenę 45 zł. Dlatego jest w pierwszym sprincie, a nie w ostatnim — wynik zmienia treść cennika w sprincie 15. Sprint urósł o sześć pozycji odkrytych przy włączaniu CI — nie było ich w planie z 2026-08. | PRZEPLANOWANIE 2026-09-19: sprinty 1-3 sa WYKONANE. Ich zawartosc zostaje bez zmian jako zapis historii. Faktyczny przebieg: 2026-08-21 do 2026-08-28, trzy sprinty tresci w szesc dni roboczych, po czym 22 dni przerwy. Daty kalendarzowe w tym pliku licza sie od nowego punktu odniesienia (start=2026-08-31), zeby zgadzaly sie DO PRZODU; dla sprintow 1-3 sa o tydzien przesuniete wobec rzeczywistosci i nie nalezy ich czytac jako zapisu, kiedy ta praca powstala.

## Sprint 2 — Zamknąć luki bezpieczeństwa z passu adwersaryjnego

`2026-09-07 – 2026-09-11` · **150 h** z 30 h pojemności

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
| `Z-18` | Prawdziwa przyczyna błędu provisioningu nie ginie po drodze | 6 | BLOKER STARTU | apps/api/src/subscriptions/provisioning-error.ts — BladEtapuProvisioningu (etap, przyczyna, message z doklejoną przyczyną); provisioning-queue.service |
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
- `Z-18` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `X-32` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `X-33` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-34` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-02.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** Z-03 dotyka skryptów na węźle — zmiana wymaga przetestowania całej ścieżki migracji, nie tylko walidacji DTO. Sprint urósł o dziesięć pozycji odkrytych w trakcie: podatności, strażniki, bramki wdrożeniowe i awaria kopii bazy (H-23/H-24). Przeciążenie jest prawdziwe i celowo widoczne — praca została wykonana, plan jej nie przewidywał. X-28 doszło jako odpowiedź na pytanie, które zostawiło H-23: dlaczego alarm o braku kopii nie dotarł do nikogo. Odpowiedź — nie miał dokąd; w repo nie było Alertmanagera, a Grafana miała odbiorcę i zero reguł. X-29 wyszło godzinę po X-28 i z tego samego pytania: skoro reguły są w repo, to czy wdrożenie w ogóle je dowozi? Nie dowoziło — wdrożenie restartowało tylko aplikacje, a Prometheus i Grafana czytają konfigurację wyłącznie przy starcie. H-20 wykonane tu, a nie w sprincie 9: awaria kopii z H-23 wymusiła odtworzenie bazy tu i teraz, więc dowód D4 powstał jedenaście sprintów przed terminem. X-30 wyszło przy sprawdzaniu, czy X-29 faktycznie coś zmieniło: reguły były wczytane i żadna się nie liczyła. Trzeci raz tego dnia to samo pytanie — czy to, co wygląda na zrobione, jest zrobione — i trzeci raz odpowiedź brzmiała nie. X-31 domyka dzień: po naprawie X-30 alerty ucichną, a cisza wygląda tak samo jak awaria kanału — więc dokładamy regułę, która pali się zawsze i której brak jest sygnałem. Decyzja właściciela produktu: jeden mail na dobę. Z-18 zamyka dzień tym, od czego wszystko się zaczęło: pierwszy alarm zapalony z prawdziwego powodu pokazał wadę, która przy zerwaniu sieci oddaje klientowi pieniądze za usługę, którą za chwilę wykona. Poprawka jest tutaj, dowód D3 dopiero przy węźle #1. X-32 to ostatnie ogniwo dnia i najkrótsza historia: alarm kazał posprzątać kolejkę, a w produkcie nie było czym jej posprzątać. Zostawało grzebanie w Redisie bez śladu w audycie — czyli dokładnie to, przeciwko czemu powstał cały ten dzień. X-33 dopisało się samo, bo wdrożenie #70 padło na bramce z X-30 przy czternastu działających regułach. Metryka reguł pojawia się dopiero na pierwszym takcie schedulera alertów, a bramka czytała ją sekundę po tym, jak /api/health odpowiedziało — mierzyła szybkość startu i meldowała o poprawności prowizjonowania. Bramka, która potrafi zapalić się na zdrowym systemie, uczy klikać „re-run" i przestaje chronić cokolwiek, więc ten sprint domyka się dopiero tutaj. X-34 dopisało się, bo bramka z X-33 miała własną usterkę: printf | grep -q przy pipefail zwraca błąd DOKŁADNIE WTEDY, GDY METRYKA JEST, o ile odpowiedź przekracza bufor potoku. Bramka nie kłamała o Grafanie — kłamała o własnym odczycie, a strażnik tego nie złapał, bo jego atrapa ważyła 200 bajtów zamiast setek kilobajtów i pracował pod innymi flagami powłoki niż produkcja.

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
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-03.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** Sprintu nie było w planie z 2026-08. Dołożony po PB-01, które pokazało, że przy dzisiejszym placemencie na węźle mieści się 16 kont, a próg rentowności przy cenie 45 zł to 58. Dopóki Z-12 jest otwarte, sprzedaż zatrzymuje się na szesnastym koncie niezależnie od popytu — selektor odmówi provisioningu. Z-13 idzie razem, bo bez planu produkcyjnego w bazie nie ma czego umieszczać ani na czym testować nadsubskrypcji. PB-14 zamyka sprint, bo wybór dostawcy przesądza o rentowności bardziej niż cokolwiek innego w tym modelu, a decyzja musi zapaść przed zamówieniem serwera w sprincie 8. AKTUALIZACJA 2026-08-22: Z-12 i Z-13 zamknięte tego samego dnia, a przy nich wyszło Z-16 — autoskalowanie nie pyta węzła o pojemność i nie dowozi sufitu z oferty. Dołożone do tego samego sprintu, bo to trzecia strona tej samej sprawy: pojemność węzła musi być liczona w jednym miejscu, a nie w trzech niezależnych.

---

# Faza 1 — Rozliczenia i dowód odtworzenia

*Sprinty 4–8 · 176 h · 2026-09-21 – 2026-10-23*

Faktura dla każdej płatności, korekty, potwierdzony drill odtworzeniowy, podpisane DPA. Koniec tej fazy to kamień milowy: zamknięte wszystkie blokery poza KSeF-em, który świadomie stoi na końcu.

## Sprint 4 — Wznowienie: odzyskac srodowisko i zatrzymac gnicie

`2026-09-21 – 2026-09-25` · **58 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `DEV-01` | Baza deweloperska jest nieosiągalna, a `docker-compose.yml` opisuje stan, którego nie ma | 6 | WYSOKA | D3 (maszyna deweloperska): `FATAL: role "verris" does not exist` oraz `role "postgres" does not exist` przy połączeniu po gnieździe wewnątrz kontenera |
| `DEP-01` | Osiem otwartych pull requestów Dependabota, żaden niescalony | 6 | WYSOKA | GitHub: 8 otwartych PR-ów, przebiegi CI #147–#150 od `dependabot[bot]`, 2026-08-28 |
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
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-04.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

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
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-05.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** FAK-01 NA POCZATKU i jako BLOKER STARTU: decyzja z 2026-09-22 (ADR-2026-09-22) — faktury VAT wystawia program ksiegowy. Panel dzis sam numeruje faktury w transakcji obciazenia portfela, wiec bez przelacznika trybu kazda platnosc dostalaby dwie faktury w dwoch seriach. Dopiero po FAK-01 moga zejsc flagi blokera z M-16 i M-17. PB-13 ZAMKNIETE tego samego dnia — kierunek: integracja z programem ksiegowym po API, na start recznie. PB-14 musi zapasc przed zamowieniem serwera w sprincie 6. X-03 — reczna sciezka wdrozenia omija bramke: zamiana cichego obejscia na jawne, z flaga i zapisanym powodem.

## Sprint 6 — Wezel produkcyjny #1

`2026-10-05 – 2026-10-09` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `Z-18` | Prawdziwa przyczyna błędu provisioningu nie ginie po drodze (część) | 2 | BLOKER STARTU | apps/api/src/subscriptions/provisioning-error.ts — BladEtapuProvisioningu (etap, przyczyna, message z doklejoną przyczyną); provisioning-queue.service |
| `NODE-02` | `main()` nie sprawdza kodów powrotu | 6 | WYSOKA | ops/scripts/lib/przerwij-po-etapie.sh — przerwij_po_etapie zamienia zebrane [FAIL] w exit 1; node-onboard-live.sh main() — bramka po preflight_stack,  |
| `J-01` | LiteSpeed / serwer o wysokiej wydajności | 6 | WYSOKA | decyzja infrastrukturalna, poza kodem panelu |
| `PB-02` | Onboarding produkcyjnego węzła #1 (EX63) | 16 | WYSOKI | Pełny przebieg node-onboard-live.sh na docelowym serwerze, z konfiguracją backupu off-site jako krokiem obowiązkowym. |

**Definicja ukończenia**

- `Z-18` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `NODE-02` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `J-01` — Stan zweryfikowany na produkcji z timestampem (poziom D3), wynik zapisany w repo.
- `PB-02` — Węzeł przechodzi wszystkie 14 checków live-readiness. /etc/verris-backup.conf istnieje, pierwszy backup off-site wykonany i zaraportowany do control-plane.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-06.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** NODE-02 idzie PRZED PB-02, nie po: main() w node-onboard-live.sh i node-live-readiness.sh nie sprawdza kodow powrotu, wiec instalacja kontynuuje po nieudanym preflighcie. Uruchamianie pierwszego produkcyjnego wezla instalatorem, ktory nie zatrzymuje sie na bledzie, to ta sama rodzina co SEC-01: kontrola wykrywa problem i nie zatrzymuje procesu. Z-18 dostaje tu dowod D3 (provisioning z przerwanym polaczeniem do DirectAdmina) i przestaje byc blokerem. J-01 ma stan b.d. — definicja ukonczenia dla b.d. to weryfikacja na produkcji z timestampem, a nie implementacja; wezel #1 jest pierwszym miejscem, gdzie da sie to zrobic.

## Sprint 7 — Egress: najpierw pomiar, ktory nie klamie

`2026-10-12 – 2026-10-16` · **28 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `SEC-05` | Log egressu jest próbką, nie zapisem | 6 | WYSOKA | ops/scripts/security-control-plane-egress.sh — apply_egress_seen: lancuch VERRIS_EGRESS_SEEN (pierwszy w OUTPUT) dopisuje KAZDE nowe polaczenie TCP/UD |
| `SEC-04` | Host rozmawia z kontenerami przez OUTPUT — ruch wewnętrzny liczony jako egress | 6 | WYSOKA | security-control-plane-egress.sh — RETURN dla -o lo/docker0/br-+ w VERRIS_EGRESS_STRICT i br-+ w VERRIS_EGRESS_BOGON przed DROP; test apps/api/src/tes |
| `SEC-01` | Tryb `--strict` jest atrapą | 16 | WYSOKA | security-control-plane-egress.sh — apply_strict_allowlist: DROP bez testu cgroup, kontrola po fakcie (iptables -S; brak reguly = exit 1), warunek wste |

**Definicja ukończenia**

- `SEC-05` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `SEC-04` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `SEC-01` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-07.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** NOWY SPRINT, decyzja wlasciciela 2026-09-19 (blok egressu osobnym sprintem zaraz po wezle #1). Kolejnosc jest wymuszona logicznie, nie preferencja. SEC-05 pierwsze: log egressu ma ogranicznik czestotliwosci — 1796 wpisow w journalu wobec 1,81 mln pakietow na liczniku iptables. Kazda allowlista zbudowana na tym odczycie jest niepelna Z DEFINICJI, wiec dopoki log jest probka, reszta bloku opiera sie na zgadywaniu. SEC-04 drugie, bo bez wyjatku dla 172.16.0.0/12 wlaczenie strict zrywa polaczenie host-kontener i nie da sie go przetestowac. SEC-01 trzecie: dopiero wtedy DROP moze realnie obowiazywac. Strażnik na wzor X-34 — atrapa wielkosci produkcyjnej i te same flagi powloki co skrypt wdrozeniowy.

## Sprint 8 — Egress: pelne pokrycie ruchu

`2026-10-19 – 2026-10-23` · **32 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `X-41` | Hardening egressu wisi w łańcuchu OUTPUT, a ruch kontenerów idzie przez FORWARD | 16 | WYSOKA | obserwacja wpięta w DOCKER-USER, 1674 pakiety zliczone, 0 DROP/REJECT |
| `SEC-03` | Ruch poza TCP/80 i TCP/443 — DNS (UDP/53), SMTP — nie jest objęty ani obserwacją z X-41, ani trybem strict | 16 | WYSOKA | zakres reguł w `security-control-plane-egress.sh` |

**Definicja ukończenia**

- `X-41` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `SEC-03` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-08.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** X-41 zamyka to, co dzis jest tylko obserwacja: hardening wisi w lancuchu OUTPUT, a ruch kontenerow idzie przez FORWARD/DOCKER-USER, czyli egress CALEGO PRODUKTU byl poza zasiegiem zabezpieczenia, ktore wygladalo, jakby go obejmowalo. Obserwacja stoi (1674 pakiety, 0 DROP), zostaje egzekwowanie. SEC-03 dokłada ruch spoza TCP/80 i TCP/443 — DNS po UDP/53 i SMTP nie sa objete ani obserwacja, ani trybem strict, wiec bez tego "strict" opisuje dwa porty, nie host.

---

# Faza 2 — Odzyskanie funkcji-widm i luki pierwszego tygodnia

*Sprinty 9–14 · 166 h · 2026-10-26 – 2026-12-04*

Pozycje tanie i widoczne: backend albo UI już istnieje, trzeba je połączyć. Najlepszy stosunek wartości do pracy w całym backlogu.

## Sprint 9 — Allowlista z obserwacji i porzadek w wezle

`2026-10-26 – 2026-10-30` · **28 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `SEC-06` | Allowlista pokrywa to, o czym ktoś pomyślał, nie to, co host robi | 16 | WYSOKA | ipset test verris_egress_https na 4 celach z logu egressu |
| `SEC-02` | Stripe jest w allowliście wyłącznie po nazwie, a ipset powstaje z rozwiązania nazw | 6 | ŚREDNIA | `egress-allow-hostnames.txt`; ipset `verris_egress_https` = 65 wpisów |
| `NODE-03` | Pojemność węzła nigdy się nie odświeża | 6 | ŚREDNIA | `schema.prisma:454` wobec `telemetry.service.ts:48-72` |

**Definicja ukończenia**

- `SEC-06` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `SEC-02` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `NODE-03` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-09.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** SEC-06 dopiero tutaj, bo wymaga okresu obserwacji na PELNYM logu z SEC-05. Koszt tej pozycji to glownie czas obserwacji, nie kod — dlatego stoi po dwoch sprintach zbierania danych, a nie obok SEC-01. Test ipset na celach z rzeczywistego ruchu pokazal juz dwa trafienia poza allowlista (sogo-repo.alinto.org i nierozpoznany host Hetznera, 120 pakietow), wiec wlaczenie --strict przed tym sprintem odcieloby repozytorium pakietow SOGo. SEC-02: adresy Stripe rotuja, wiec wpis po nazwie starzeje sie miedzy uruchomieniami — potrzebne odswiezanie z opublikowanej listy plus check w live-readiness.

## Sprint 10 — Ogony sprintu 2, zaleznosci i faktury VOID

`2026-11-02 – 2026-11-06` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `X-31` | Kanał alertów daje znak życia (dead man's switch) | 6 | — | ops/observability/grafana/provisioning/alerting/rules.yaml — grupa verris_kanal_alertow, reguła VerrisKanalAlertowZyje (vector(1), for: 0s, oba stany  |
| `X-32` | Martwy job da się odrzucić z panelu, ze śladem w audycie | 6 | — | apps/api/src/common/audit/audit.actions.ts — PROVISIONING_JOB_DISCARDED_BY_ADMIN; provisioning-queue.service.ts — odrzucJob (getState() === failed, śl |
| `DEP-02` | W drzewie stoją dwa majory ESLinta naraz | 6 | ŚREDNIA | package.json (korzeń) — @eslint/js ^10.0.1 przy braku jakiegokolwiek eslint.config.* w korzeniu; libs/eslint-config/node_modules: eslint 10.9.0 obok @ |
| `M-08` | Anulowanie faktury (VOID) z panelu | 6 | WYSOKA | InvoiceStatus.VOID w schema.prisma:1354 nigdy nie ustawiany |
| `C-18` | Konto FTP — zmiana hasła | 6 | WYSOKA | brak jakiejkolwiek ścieżki edycji istniejącego konta |

**Definicja ukończenia**

- `X-31` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `X-32` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `DEP-02` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `M-08` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `C-18` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-10.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** X-31 i X-32 to ostatnie CZESCIOWE z passu adwersaryjnego. DEP-02 tu, bo wyciszenie majorow ESLinta z DEP-03 ma termin przegladu 2026-11-15, a sprint zaczyna sie 2026-11-02. M-08 (anulowanie faktury VOID) — w trybie zewnetrznym z FAK-01 dotyczy dokumentu rozliczeniowego, nie faktury VAT; zakres do potwierdzenia przy realizacji.

## Sprint 11 — DNS, SSO i PHP

`2026-11-09 – 2026-11-13` · **24 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `F-01` | Edytor rekordów DNS (A/CNAME/MX/TXT) | 6 | WYSOKA | dns-manager.tsx:79,91 — komponent osierocony; dns/page.tsx:15 przekierowuje gdzie indziej |
| `F-02` | Rekordy SRV / CAA | 6 | WYSOKA | j.w. |
| `B-01` | Zmiana wersji PHP dla całego konta | 6 | WYSOKA | services.controller.ts:125 |
| `J-04` | HTTP/3 | 6 | ŚREDNIA | poza kodem panelu |

**Definicja ukończenia**

- `F-01` — Kontroler rejestruje trasę, którą woła panel; kliknięcie kończy się realnym efektem, nie 404. Test pokrywa ścieżkę UI→API→zasób.
- `F-02` — Kontroler rejestruje trasę, którą woła panel; kliknięcie kończy się realnym efektem, nie 404. Test pokrywa ścieżkę UI→API→zasób.
- `B-01` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `J-04` — Stan zweryfikowany na produkcji z timestampem (poziom D3), wynik zapisany w repo.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-11.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** F-01/F-02: trasa hosting-sso-url nie istnieje w API — to nowy endpoint, nie podpiecie istniejacego. J-04 (HTTP/3) to weryfikacja na wezle #1.

## Sprint 12 — Poczta: dostarczalnosc i skrzynki

`2026-11-16 – 2026-11-20` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `E-15` | Rekordy SPF — kreator | 6 | WYSOKA | services.controller.ts:114 |
| `E-16` | Rekordy DKIM — konfiguracja | 6 | WYSOKA | services.controller.ts:114 |
| `E-17` | Rekord DMARC — konfiguracja | 6 | WYSOKA | services.controller.ts:114 |
| `E-05` | Zmiana quoty ISTNIEJĄCEJ skrzynki | 6 | WYSOKA | hosting-email-actions.ts:41 zachowuje starą quotę |
| `M-26` | Usunięcie zapisanej karty przez klienta | 6 | WYSOKA | billing.controller.ts:38 tylko GET, brak DELETE |

**Definicja ukończenia**

- `E-15` — Panel wywołuje istniejący endpoint; akcja zostawia wpis w logu audytu. Test potwierdza, że guard nadal blokuje nieuprawnionych.
- `E-16` — Panel wywołuje istniejący endpoint; akcja zostawia wpis w logu audytu. Test potwierdza, że guard nadal blokuje nieuprawnionych.
- `E-17` — Panel wywołuje istniejący endpoint; akcja zostawia wpis w logu audytu. Test potwierdza, że guard nadal blokuje nieuprawnionych.
- `E-05` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `M-26` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-12.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** Brak SPF/DKIM w panelu to najczestsza przyczyna "moja poczta trafia do spamu". Backend dziala — to glownie podpiecie osieroconego komponentu.

## Sprint 13 — Warstwa operatorska: zatrzymywanie szkody

`2026-11-23 – 2026-11-27` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `A-25` | Ręczne zawieszenie usługi przez operatora | 6 | WYSOKA | subscriptions.admin.controller.ts:192 |
| `A-26` | Ręczne odwieszenie usługi przez operatora | 6 | WYSOKA | subscriptions.admin.controller.ts:210 |
| `N-07` | Ręczne tworzenie incydentu na status page | 6 | WYSOKA | product-ops.admin.controller.ts:371; brak UI tworzenia |
| `N-14` | Cordon wysyłki poczty (auto-blokada spamu) | 6 | WYSOKA | outbound-cordon.admin.controller.ts:20,25,32; zero „cordon” w admin-panel |
| `H-22` | Panel odtwarzania w widocznym miejscu | 6 | WYSOKA | panel off-site siedzi w zakładce „Usage”, nie „Kopie zapasowe” (page.tsx:74,128,313,319) |

**Definicja ukończenia**

- `A-25` — Panel wywołuje istniejący endpoint; akcja zostawia wpis w logu audytu. Test potwierdza, że guard nadal blokuje nieuprawnionych.
- `A-26` — Panel wywołuje istniejący endpoint; akcja zostawia wpis w logu audytu. Test potwierdza, że guard nadal blokuje nieuprawnionych.
- `N-07` — Panel wywołuje istniejący endpoint; akcja zostawia wpis w logu audytu. Test potwierdza, że guard nadal blokuje nieuprawnionych.
- `N-14` — Panel wywołuje istniejący endpoint; akcja zostawia wpis w logu audytu. Test potwierdza, że guard nadal blokuje nieuprawnionych.
- `H-22` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-13.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** Bez tego pierwszy incydent obslugujesz curlem o drugiej w nocy. Pierwsze cztery pozycje to endpointy, ktore juz dzialaja.

## Sprint 14 — Backup i staging

`2026-11-30 – 2026-12-04` · **24 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `H-09` | Kopia bezpieczeństwa przed odtworzeniem | 6 | WYSOKA | hosting-restore.service.ts:167 |
| `H-17` | Tryb restore skryptu odtwarzającego osiągalny z produktu | 6 | WYSOKA | node-account-restore.sh:82-99 ma tryb restore; offsite-restore.service.ts:94 przyjmuje wyłącznie list|fetch |
| `G-20` | Ochrona przed atakiem słownikowym na panel | 6 | WYSOKA | rate-limit.guard.ts — ZERO testów |
| `I-11` | Staging — publikacja na produkcję | 6 | WYSOKA | services.controller.ts:187 |

**Definicja ukończenia**

- `H-09` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `H-17` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `G-20` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- `I-11` — Ograniczenie opisane w uwagach macierzy zniknęło; test potwierdza zachowanie także w scenariuszu awaryjnym.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-14.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** H-17 bylo zalezne od H-20 — zamkniete 2026-08-23 dowodem D4, wiec zaleznosc spelniona.

---

# Faza 3 — Wejście na rynek

*Sprinty 15–19 · 152 h · 2026-12-07 – 2027-01-08*

Dokumenty, cennik, landing, pomiar, domknięcie KSeF-a tuż przed sprzedażą, baza wiedzy, przejście ścieżki pierwszego klienta na produkcji i zapisana decyzja GO.

## Sprint 15 — Rozliczenia klienta i pomiar

`2026-12-07 – 2026-12-11` · **28 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `A-11` | Wyszukiwarka wolnych domen | 6 | WYSOKA | domains.controller.ts:54 |
| `C-11` | Spakowanie do archiwum | 6 | ŚREDNIA | files.service.ts:320 — tylko extract |
| `PB-08` | Pomiar: Consent Mode v2 + GTM + dedup event_id | 16 | ŚREDNI | Wdrożenie ustaleń z audytu pomiaru: www linkuje, panel działa, deduplikacja po event_id, cookie Domain=.verris.pl. |

**Definicja ukończenia**

- `A-11` — Wartość domyślna włączona albo check w live-readiness pilnuje konfiguracji — flaga nie może po cichu wyłączyć funkcji.
- `C-11` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `PB-08` — Zdarzenie zakupu dociera raz, nie dwa. Consent Mode nie blokuje pomiaru po zgodzie. Zweryfikowane w GTM Preview i w raporcie.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-15.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** Ostatni sprint kodowy przed blokiem dokumentow. PB-08 (Consent Mode v2 + dedup event_id) jest tu, a nie przy landingu, bo to kod w panelu, nie tresc — landing tylko z niego korzysta.

## Sprint 16 — Dokumenty prawne, DPA i naduzycia

`2026-12-14 – 2026-12-18` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `P-15` | Podpisane DPA z subprocesorami (część) | 6 | BLOKER STARTU | docs/legal/dpa-subprocessors-tracking.md — tabela statusow po korekcie 2026-09-19. Stripe i AWS: DPA obowiazuje z mocy umowy glownej. Hetzner i Openpr |
| `PB-03` | Finalizacja dokumentów prawnych 1.0.0 | 16 | BLOKER BIZNESOWY | Regulamin, polityka prywatności, SLA, DPA, polityka cookies — wyjście z DRAFT-u, wersjonowanie i publikacja w panelu. |
| `PB-04` | Procedura obsługi nadużyć (abuse) — dokument | 8 | WYSOKI | Adres abuse@ obsługiwany, ścieżka od zgłoszenia do reakcji, czasy reakcji, kto decyduje o zawieszeniu, wzory odpowiedzi do CERT i rejestratorów. |

**Definicja ukończenia**

- `P-15` — Funkcja dostępna z panelu klienta bez wychodzenia do DirectAdmina; test uruchamiany w CI.
- `PB-03` — Wszystkie dokumenty w statusie opublikowanym z numerem wersji i datą. Panel /legal nie pokazuje ani jednego „Dokument w przygotowaniu”.
- `PB-04` — Dokument w ops/docs z właścicielem i czasami reakcji. Test: zgłoszenie wysłane na abuse@ trafia do kogoś i ma odpowiedź w deklarowanym czasie.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-16.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** BLOK DOKUMENTOW — przesuniety na koniec decyzja wlasciciela 2026-09-22: najpierw kod i infrastruktura, dokumenty na sam koniec, przed pierwszym klientem. Kolejnosc wewnatrz bloku wymuszona zaleznosciami: regulamin (PB-03) przed kredytami SLA (N-16), cennik (PB-07) przed landingiem (PB-06), landing przed kampania (PB-10), wszystko przed sciezka pierwszego klienta (PB-05). P-15 zamyka ostatni bloker poza FAK-01 i Z-18: zostal tylko Hetzner (Zalacznik 1 przygotowany w trackerze). PB-04: adres abuse@ jest punktem kontaktowym DSA i musi istniec przed publikacja regulaminu.

## Sprint 17 — Cennik, SLA i zastepstwo

`2026-12-21 – 2026-12-25` · **30 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `N-16` | SLA z zapisanymi kredytami | 6 | WYSOKA | sla-credit.scheduler.ts:79 — if (!policy.enabled) return; SLA_CREDITS_ENABLED default '0' (platform-settings.keys.ts:116) |
| `PB-07` | Treści i cennik na verris.pl | 16 | WYSOKI | Strona główna, cennik, specyfikacja techniczna pakietu, strona SLA. Narracja: cena stała, bez skoku po roku. |
| `PB-11` | Bus factor: drugi kanał alertów i procedura zastępstwa | 8 | WYSOKI | Alerty na więcej niż jeden adres, przetestowane. Dokument: co robi ktoś inny, gdy Ciebie nie ma przez tydzień. |

**Definicja ukończenia**

- `N-16` — Wartość domyślna włączona albo check w live-readiness pilnuje konfiguracji — flaga nie może po cichu wyłączyć funkcji.
- `PB-07` — Cennik zgodny z wynikiem PB-01. Specyfikacja techniczna publiczna, jak u cyber_Folks — to jest element zaufania, którego rynek oczekuje.
- `PB-11` — Alert testowy dociera dwoma kanałami. Dokument zastępstwa zawiera dostęp awaryjny i listę rzeczy, które muszą się dziać codziennie.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-17.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** BLOK DOKUMENTOW — przesuniety na koniec decyzja wlasciciela 2026-09-22: najpierw kod i infrastruktura, dokumenty na sam koniec, przed pierwszym klientem. Kolejnosc wewnatrz bloku wymuszona zaleznosciami: regulamin (PB-03) przed kredytami SLA (N-16), cennik (PB-07) przed landingiem (PB-06), landing przed kampania (PB-10), wszystko przed sciezka pierwszego klienta (PB-05). N-16 (kredyty SLA) po PB-03, bo regulamin obiecuje kredyty — najpierw przeliczyc je na realnych danych z probe-ow. Cennik zgodny z PB-01 (45 zl/mies brutto, 399 zl/rok).

## Sprint 18 — Landing i baza wiedzy

`2026-12-28 – 2027-01-01` · **32 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `PB-06` | Landing /przenies-strone | 16 | WYSOKI | Strona docelowa kampanii Google Ads na osi migracji. Treść oparta na realnych przewagach z audytu, nie na obietnicach. |
| `PB-09` | Baza wiedzy — 20 artykułów startowych | 16 | ŚREDNI | Artykuły pokrywające najczęstsze pytania pierwszego tygodnia: skierowanie domeny, SSL, poczta, FTP, backup, migracja, faktury. |

**Definicja ukończenia**

- `PB-06` — Strona opublikowana, pomiar działa, formularz i CTA prowadzą do rejestracji. Żadne twierdzenie na stronie nie jest oznaczone w macierzy jako LUKA lub ATRAPA.
- `PB-09` — 20 artykułów opublikowanych i zaindeksowanych do asystenta AI. Każdy opisuje funkcję, która w macierzy ma status DZIAŁA.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-18.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** BLOK DOKUMENTOW — przesuniety na koniec decyzja wlasciciela 2026-09-22: najpierw kod i infrastruktura, dokumenty na sam koniec, przed pierwszym klientem. Kolejnosc wewnatrz bloku wymuszona zaleznosciami: regulamin (PB-03) przed kredytami SLA (N-16), cennik (PB-07) przed landingiem (PB-06), landing przed kampania (PB-10), wszystko przed sciezka pierwszego klienta (PB-05). Landing nie moze obiecywac funkcji ze statusem LUKA lub ATRAPA — kazde zdanie sprawdzic wobec macierzy.

## Sprint 19 — Kampania, sciezka pierwszego klienta i decyzja GO

`2027-01-04 – 2027-01-08` · **32 h** z 30 h pojemności

| ID | Zadanie | h | Priorytet | Dowód / kontekst |
|---|---|---|---|---|
| `PB-10` | Kampania gads-search-hosting-202607 — uruchomienie | 8 | ŚREDNI | Konfiguracja kampanii wyszukiwarkowej, budżet 500–1000 zł/mies., oś przekazu: migracja bez przestoju. |
| `PB-05` | Test end-to-end „pierwszy klient” | 16 | BLOKER BIZNESOWY | Przejście całej ścieżki na produkcji jako realny klient: rejestracja, zakup, płatność, provisioning, migracja strony, wystawienie faktury, KSeF, backu |
| `PB-12` | Runbook startu i decyzja GO | 8 | BLOKER BIZNESOWY | Domknięcie: przegląd wszystkich blokerów z dowodem zamknięcia, decyzja GO/NO-GO zapisana z datą. |

**Definicja ukończenia**

- `PB-10` — Kampania utworzona wstrzymana, konwersje podpięte, budżet i stawki ustawione. Start dopiero po PB-05.
- `PB-05` — Zapisany przebieg z timestampami dla każdego kroku — to jest dowód poziomu D3, jedyny w całym projekcie. Każdy nieudany krok wraca do backlogu jako bloker.
- `PB-12` — Każdy z 11 blokerów ma wpis: co zrobiono, gdzie jest dowód, kto potwierdził. Bez formuły „warunkowe GO”.
- **Cały sprint** — `docs/zadania/` uzupełnione dla każdej pozycji, `docs/sprinty/SPRINT-19.md` napisane, `audyt/dane/macierz.csv` zaktualizowana, widoki przebudowane.

**Ryzyko sprintu.** BLOK DOKUMENTOW — przesuniety na koniec decyzja wlasciciela 2026-09-22: najpierw kod i infrastruktura, dokumenty na sam koniec, przed pierwszym klientem. Kolejnosc wewnatrz bloku wymuszona zaleznosciami: regulamin (PB-03) przed kredytami SLA (N-16), cennik (PB-07) przed landingiem (PB-06), landing przed kampania (PB-10), wszystko przed sciezka pierwszego klienta (PB-05). Kampania powstaje wstrzymana. PB-05 to jedyny moment w planie, w ktorym powstaje dowod D3 calej sciezki — kazdy nieudany krok wraca do backlogu jako bloker i przesuwa start.

---

# Po starcie — roadmapa kwartalna

153 pozycji, 2432 h. Epiki, nie sprinty — kolejność zweryfikujemy danymi od pierwszych klientów.

| ID | Epik | Priorytet | Kwartał | Pozycji | h | Dlaczego teraz, a nie wcześniej |
|---|---|---|---|---|---|---|
| `E-01` | Runtime, pliki i diagnostyka | WYSOKI | Q1 2027 | 32 | 434 | Najczęstsze źródło zgłoszeń w pierwszych miesiącach każdego hostingu. Logi WWW ma pięć z pięciu badanych hostingów PL — bez nich klient nie zdiagnozuje własnej strony i pisze do nas. |
| `E-02` | Wydajność: cache i skalowanie | WYSOKI | Q1 2027 | 8 | 132 | Trzy z pięciu hostingów PL dają Redis w cenie. Przy pozycjonowaniu na WordPressa to nie dodatek, tylko oczekiwanie. |
| `E-12` | Backup: granularność i retencja | WYSOKI | Q1 2027 | 7 | 116 | cyber_Folks daje 28 dni, seohost do 60. Nasze 30 dni jest w normie, ale granularność odtwarzania jest poniżej rynku. |
| `E-14` | Rozliczenia: dokończenie | WYSOKI | Q1 2027 | 18 | 188 | Z-07 z macierzy: klient płacący portfelem doładowuje saldo w karencji i i tak zostaje zawieszony. Pierwszy taki przypadek to stracony klient. |
| `E-15` | Wsparcie i ops: kolejka abuse | WYSOKI | Q1 2027 | 7 | 86 | Sprint 13 daje możliwość zatrzymania szkody. Ten epik daje proces, który skaluje się dalej niż jedna osoba. |
| `E-03` | WordPress Toolkit | WYSOKI | Q2 2027 | 10 | 168 | Cztery z pięciu hostingów PL mają automatyczne aktualizacje WordPressa. Staging już mamy i jest przewagą — reszta toolkitu ją domyka. |
| `E-04` | Domeny jako produkt | WYSOKI | Q2 2027 | 10 | 110 | Backend jest gotowy i wyłączony brakiem konfiguracji. Domena to najczęstszy pierwszy zakup i naturalny punkt wejścia. |
| `E-05` | Katalog aplikacji | ŚREDNI | Q2 2027 | 1 | 16 | Softaculous ma około 400 aplikacji. Nie musimy mieć 400, ale dwie to nie jest katalog. |
| `E-10` | Poczta: filtry, kalendarz, limity | ŚREDNI | Q2 2027 | 9 | 118 | „Gdzie jest mój mail” to najczęstszy ticket poczty. Podgląd kolejki zdejmuje go z obsługi i oddaje klientowi. |
| `E-06` | Bezpieczeństwo jako funkcja | ŚREDNI | Q3 2027 | 9 | 176 | Pozycja licencyjna — wchodzi do rachunku z PB-01. Może być produktem dodatkowym, nie musi być w cenie pakietu. |
| `E-07` | Reseller jako produkt | ŚREDNI | Q3 2027 | 7 | 208 | Dziś to strona sprzedażowa z dwoma GET-ami. Albo staje się produktem, albo znika z nawigacji — trzeciej opcji nie ma. |
| `E-08` | Dostępność i zgodność w produkcie | ŚREDNI | Q3 2027 | 5 | 118 | Zwolnienie mikroprzedsiębiorcy z EAA wygasa przy 10 pracownikach lub 2 mln EUR. Lepiej mieć to wcześniej niż w tygodniu przekroczenia progu. |
| `E-11` | DNS: DNSSEC i zarządzanie strefą | ŚREDNI | Q3 2027 | 4 | 62 | Żaden z pięciu hostingów PL nie potwierdza publicznie DNSSEC. To okazja, nie luka. |
| `E-13` | Automatyzacja: API zapisu i webhooki | ŚREDNI | Q3 2027 | 9 | 108 | Żaden hosting PL nie ma publicznego API — mamy przewagę, która dziś obejmuje pięć GET-ów przy opisie obiecującym CI/CD i Terraform. |
| `E-16` | Rozszerzenia oferty | NISKI | Q4 2027 | 5 | 80 | Decyzja o kreatorze stron jest binarna. Kod, który leży zakomentowany przez rok, jest długiem, nie opcją. |
| `E-09` | Pokrycie testowe warstw krytycznych | WYSOKI | ciągłe | 12 | 312 | Realizowane równolegle z każdą fazą, nie jako osobny projekt. Zasada: każda naprawiona pozycja dostaje test, który najpierw czerwieni się na starym kodzie. |

- **E-01 Runtime, pliki i diagnostyka** (434 h) — php.ini i rozszerzenia PHP z panelu, logi dostępu i błędów WWW, import/eksport bazy, spakowanie archiwum, SSH i klucze SSH dla hostingu, podgląd zajętości katalogów.
- **E-02 Wydajność: cache i skalowanie** (132 h) — Redis jako cache obiektowy sterowany z panelu, LSCache, weryfikacja HTTP/3, CDN, optymalizacja obrazów.
- **E-03 WordPress Toolkit** (168 h) — Automatyczne aktualizacje, aktualizacje wtyczek i motywów, klonowanie między domenami, hardening, skan podatności, tryb konserwacji, masowe zarządzanie.
- **E-04 Domeny jako produkt** (110 h) — Konfiguracja rejestratora, zakup i transfer z panelu, odnowienia, zmiana danych abonenta, blokada transferu, ukrycie WHOIS.
- **E-05 Katalog aplikacji** (16 h) — Rozbudowa katalogu z dwóch pozycji do kilkunastu najczęściej instalowanych albo integracja z gotowym instalatorem.
- **E-06 Bezpieczeństwo jako funkcja** (176 h) — Skaner malware, czyszczenie zainfekowanych plików, rozbudowa WAF, HSTS, anty-DDoS, sprzedaż certyfikatów DV/OV/EV.
- **E-07 Reseller jako produkt** (208 h) — Zakładanie kont przez resellera, marża ustawiana przez niego, white-label, rozliczenia.
- **E-08 Dostępność i zgodność w produkcie** (118 h) — WCAG 2.1 AA dla ścieżki klienta, RCPD jako moduł zamiast pliku, ISO 27001 jeśli wejdziemy w B2B, deklaracja lokalizacji danych.
- **E-09 Pokrycie testowe warstw krytycznych** (312 h) — Testy integracyjne API, moduł auth, klient KSeF, ścieżka backup/restore, DirectAdminService, panele frontowe.
- **E-10 Poczta: filtry, kalendarz, limity** (118 h) — Reguły filtrowania Sieve, podgląd kolejki i logów dostarczania, limity wysyłki pokazane klientowi, kalendarz i kontakty, 2FA dla webmaila.
- **E-11 DNS: DNSSEC i zarządzanie strefą** (62 h) — DNSSEC, zmiana TTL, Anycast DNS, pełne zarządzanie strefą po podpięciu edytora w sprincie 10.
- **E-12 Backup: granularność i retencja** (116 h) — Odtworzenie pojedynczego pliku, podgląd zawartości archiwum przed odtworzeniem, pobranie kopii lokalnie, retencja 28+ dni w cenie.
- **E-13 Automatyzacja: API zapisu i webhooki** (108 h) — Rozszerzenie publicznego API o operacje zapisu, webhooki dla klienta, edycja crona, cron z wyborem wersji PHP, podgląd wyniku wykonania.
- **E-14 Rozliczenia: dokończenie** (188 h) — Ponowienie płatności portfelem w karencji, waluty obce z przeliczeniem VAT, proforma, dodanie karty niezależnie od zakupu, eksport CSV.
- **E-15 Wsparcie i ops: kolejka abuse** (86 h) — Pełna kolejka obsługi nadużyć z encją zgłoszenia, terminami i śladem audytowym, ogłoszenia i okna serwisowe z panelu, feature flagi.
- **E-16 Rozszerzenia oferty** (80 h) — VPS: konsola, snapshoty, rebuild. Panel mobilny. Kreator stron — dokończyć albo usunąć 1612 zakomentowanych linii.

---

# Czego świadomie nie robimy

12 pozycji ma werdykt POZA ZAKRESEM. To decyzje, nie przeoczenia — dlatego są wypisane. Jeżeli któraś wróci jako żądanie klienta, wraca też decyzja do przeglądu.

| ID | Funkcja | Uzasadnienie |
|---|---|---|
| `B-07` | Wybór handlera PHP (LSAPI/FPM/CGI) | decyzja operatorska, nie klienta |
| `B-10` | Aplikacje Ruby | rynek PL tego nie oczekuje |
| `C-20` | FTP anonimowy | funkcja schyłkowa, ryzyko nadużyć |
| `C-23` | Terminal SSH w przeglądarce | żaden hosting PL tego nie daje |
| `C-24` | WebDAV / Web Disk | Protokół schyłkowy — żaden z pięciu badanych hostingów PL go nie wystawia, a menedżer plików i SFTP pokrywają ten sam scenariusz. |
| `E-22` | Listy mailingowe | zastąpione modułem email-marketing |
| `F-07` | Secondary / slave DNS | Wtórny DNS ma sens przy własnej infrastrukturze DNS wielolokalizacyjnej; przy jednym operatorze i delegacji na zewnątrz (F-09) nie wnosi odporności, którą obiecuje. |
| `F-10` | Szablony stref DNS | Szablony stref są narzędziem resellera zarządzającego setkami domen. Do rozważenia razem z epikiem E-07, nie wcześniej. |
| `G-10` | ModSecurity — zarządzanie regułami | poziom operatora |
| `I-06` | Smart Updates (test przed aktualizacją) | wyróżnik Pleska, rynek PL tego nie ma |
| `K-07` | Statystyki odwiedzin (AWStats/Webalizer) | zastąpione własną analityką (K-12) |
| `Q-10` | Natywna aplikacja mobilna | tylko home.pl (iOS) |

Cel „100% pokrycia we wszystkich kategoriach” nie kształtuje tego planu. Punktem odniesienia jest mediana rynku PL plus to, co klient uznaje za standard — nie suma możliwości cPanela, Pleska i DirectAdmina. Pokrycie rośnie tu jako skutek uboczny zamykania rzeczy, które mają znaczenie.
