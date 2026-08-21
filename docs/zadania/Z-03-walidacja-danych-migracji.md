# `Z-03` — Walidacja danych migracji przed użyciem w poleceniu powłoki

| | |
|---|---|
| **Sprint** | 2 (2026-08-21) |
| **Priorytet** | **BLOKER STARTU** → zamknięte |
| **Nakład** | planowany 16 h · rzeczywisty 5 h |
| **Zależy od** | — |
| **Status** | zrobione |
| **Data zamknięcia** | 2026-08-21 |

---

## Problem

Formularz migracji „przenieś stronę z innego hostingu" pozwalał wykonać **dowolne polecenie jako root** na węźle hostującym konta innych klientów.

Nie trzeba było żadnego dostępu poza zwykłym kontem klienta. Wystarczyło w polu „nazwa bazy danych" wpisać `x'; touch /tmp/pwned; #`, a w polu „ścieżka zdalna" — cokolwiek z apostrofem.

To jest bloker w rozumieniu przyjętej definicji, i to w najostrzejszej postaci: brak możliwości powstrzymania szkody przez operatora. Root na węźle to dostęp do plików, baz i poczty **wszystkich** klientów, którzy na nim siedzą.

## Dowód przed

Worker migracji (`ops/scripts/node-migration-worker.sh`, uruchamiany z systemd jako root) brał zlecenie z control-plane i wstawiał jego pola wprost do poleceń powłoki.

**Wektor 1 — `eval` z nazwą bazy:**

```bash
mysql_row_total() {
  local mysql_cmd="$1" db="$2" ...
  tables=$(eval "$mysql_cmd -N -e \"SELECT table_name FROM information_schema.tables WHERE table_schema='${db}' AND table_type='BASE TABLE'\"" 2>/dev/null) || return 1
```

`${db}` pochodzi z `.source.database`, czyli z formularza. Ponieważ całość idzie przez `eval`, nie jest to nawet wstrzyknięcie SQL — to wykonanie polecenia powłoki.

**Wektor 2 — łańcuch poleceń `lftp`:**

```bash
LFTP_PASSWORD="$spass" lftp -u "$suser,dummy" \
  -e "... mirror --continue --parallel=4 --no-perms --verbose '${spath}' '${dst}'; bye" \
  "${proto}://${host}:${port}"
```

`${spath}` to `.source.remotePath` z formularza, wstawiona w apostrofach do łańcucha, który parsuje **lftp**. Apostrof w ścieżce zamyka cytowanie, a lftp wykonuje polecenia powłoki po `!`.

**Wektor 3 — `eval` przy imporcie:**

```bash
import_cmd=$(mysql_target_import_cmd "$job" "$logfile")   # zwracało tekst polecenia
... | eval "$import_cmd" 2>>"$logfile"
```

**Co stało po drugiej stronie:** `apps/api/src/subscriptions/dto/migration.dto.ts` sprawdzał **wyłącznie długość**:

```ts
@IsString() @MinLength(1) @MaxLength(64)
database!: string;
```

**Stan w macierzy przed:** `BRAK`

## Rozwiązanie

Dwie warstwy — tak samo jak przy `Z-02` — plus usunięcie samego `eval`.

### Warstwa 1 — walidacja na wejściu API

`migration.dto.ts` dostał `MIGRACJA_WZORCE` i `@Matches` na każdym polu, które trafia do powłoki: `host`, `username`, `database`, `remotePath`, `email`. Objęte są **wszystkie trzy** drogi zlecenia: `RequestExternalMigrationDto`, `CreateMigrationBundleDto` (bloki FTP/MySQL/IMAP) i `DiscoverMigrationSourceDto`.

**Allowlista znaków, nie blacklista.** Blacklista w powłoce zawsze ma dziurę — podstawienie procesu, nowa linia, backslash, znak spoza ASCII. Lista dozwolonych znaków ma tę zaletę, że jej dziury są widoczne w samym wzorcu.

**Hasła zostają bez ograniczeń.** Sprawdziłem każde ich użycie w skrypcie: `sshpass -p "$spass"` (argument), `LFTP_PASSWORD=` i `MYSQL_PWD=` (zmienne środowiskowe), `printf %q` w komendzie zdalnej. Żadne nie wchodzi do łańcucha poleceń. Ograniczanie znaków w haśle byłoby kosztem dla klienta bez zysku dla bezpieczeństwa — a przy okazji sygnałem, że hasła gdzieś trzymamy niepoprawnie.

### Warstwa 2 — guard po stronie węzła

Nowy plik `ops/scripts/lib/migration-input-guard.sh`: te same wzorce w bashu, plus `vg_require <typ> <wartość> <etykieta>`.

**Dlaczego druga warstwa, skoro DTO wystarcza.** Bo DTO to jedna droga do kolejki. Skrypt operatorski, ręczny `INSERT` w bazie przy ratowaniu zlecenia, przyszły endpoint dla resellerów — każde z nich omija DTO. Warstwa przy samym `exec` jest tą, która broni zawsze.

**Fail-closed.** Worker sprawdza obecność biblioteki **przed** pobraniem jakiegokolwiek zlecenia i przy jej braku kończy pracę kodem 78 (`EX_CONFIG`):

```bash
if [ -r "$VG_LIB" ]; then
  . "$VG_LIB"
else
  echo "brak migration-input-guard.sh — worker nie uruchomi żadnego zadania bez walidacji wejścia" >&2
  exit 78
fi
```

Kontrola bezpieczeństwa, która po cichu znika razem z plikiem, jest **gorsza niż jej brak** — daje fałszywe poczucie osłony. `install_timer` instaluje bibliotekę obok workera, a `node-onboard-live.sh` sprawdza jej obecność w bundlu.

### Usunięcie `eval`

Sama walidacja nie wystarczy, bo za rok ktoś doda nowe pole i zapomni. Dlatego `eval` zniknął z wykonywalnych linii skryptu:

- `mysql_row_total` przyjmuje teraz komendę jako **tablicę argumentów** (`"${mysql_cmd[@]}"`), nie jako tekst do rozwinięcia;
- `mysql_target_import_cmd` (zwracała gotowe polecenie jako tekst) zamieniona na `mysql_prepare_target_db`, która przygotowuje bazę i zwraca **samą nazwę**; import to zwykłe `| mysql --protocol=socket "$tdb"`;
- martwa po tej zmianie `mysql_target_db_name` usunięta.

Doszło jedno drobne zabezpieczenie, którego wcześniej nie było: nazwy tabel w raporcie spójności pochodzą z **obcej** bazy i backtick w nazwie rozerwałby cytowanie w SQL. Tabele o niestandardowej nazwie są pomijane w raporcie. Raport jest wtedy zaniżony — i to jest świadomy wybór: lepiej niedokładna liczba wierszy niż wektor.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `apps/api/src/subscriptions/dto/migration.dto.ts` | `MIGRACJA_WZORCE` + `@Matches` na 17 polach w czterech DTO |
| `ops/scripts/lib/migration-input-guard.sh` | **nowy** — walidatory po stronie węzła + tryb CLI dla testów |
| `ops/scripts/node-migration-worker.sh` | fail-closed source guarda, walidacja w `run_files`/`run_mysql`/`run_imap`, trzy `eval` usunięte, instalacja biblioteki |
| `ops/scripts/node-onboard-live.sh` | bundle wymaga `lib/migration-input-guard.sh`; podpowiedź `scp -r` |
| `apps/api/src/subscriptions/migration-input-validation.spec.ts` | **nowy** — 70 przypadków |

Migracje bazy: brak
Zmienne środowiskowe: brak

## Testy

`apps/api/src/subscriptions/migration-input-validation.spec.ts` — **70 przypadków**, trzy grupy.

| Grupa | Co sprawdza |
|---|---|
| Warstwa DTO | 10 ładunków × 4 pola odrzucone; 15 realnych wartości przepuszczonych (`ftp.stary-hosting.com.pl`, `konto@przyklad.pl`, `klient1_shop`, `/domains/przyklad.pl/public_html`, `katalog z spacja`) |
| Zgodność warstw | te same próbki karmią DTO **i** guarda bashowego; test wypisuje każdy rozjazd werdyktów |
| Worker | brak `eval` w liniach wykonywalnych; walidacja obecna w każdej z trzech ścieżek; **fail-closed sprawdzony zachowaniem** — worker skopiowany do pustego katalogu bez `lib/` kończy się kodem 78 |

Grupa „zgodność warstw" istnieje, bo dwie kopie tego samego wzorca zawsze się kiedyś rozjeżdżają. Bez niej ktoś poluzuje regex w DTO, węzeł zacznie odrzucać poprawne zlecenia i po dniu debugowania ktoś poluzuje też guarda — zwykle bardziej, niż trzeba.

**Czy test najpierw czerwienił się na starym kodzie?** **TAK — 48 z 70 przypadków.** Sprawdzone przez usunięcie wszystkich `@Matches` z DTO i skasowanie biblioteki guarda. Zostały zielone tylko te, które nie zależą od walidacji (przepuszczanie poprawnych wartości i asercje o haśle).

Cały zestaw API po zmianie: **38 zestawów, 264 testy, wszystkie zielone.**

## Dowód po

- `apps/api/src/subscriptions/dto/migration.dto.ts` — `MIGRACJA_WZORCE`, `@Matches`
- `ops/scripts/lib/migration-input-guard.sh` — `vg_require`
- `ops/scripts/node-migration-worker.sh` — fail-closed source, `vg_check_source`, zero `eval`

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [x] D2 — 70 testów przechodzi lokalnie; potwierdzenie w CI przy najbliższym pushu
- [ ] D3 — **wymagane, bo pozycja dotyczy dostępu.** Do wykonania po wdrożeniu: zlecić migrację testową z poprawnymi danymi (musi przejść) i drugą z nazwą bazy zawierającą średnik (musi zostać odrzucona na formularzu). Zapisać datę i godzinę.
- [ ] D4 — nie dotyczy

**Stan w macierzy po:** `DZIAŁA`

Blokery startu: **10 → 9**.

## Czego to nadal nie robi

**Nie audytuje zleceń, które już przeszły.** Jeżeli ktoś skorzystał z tej luki przed poprawką, ten kod tego nie wykryje. Ślad zostałby w logach workera na węźle (`/var/log/verris-migration/*.log`) i w tabeli zleceń. Przegląd historycznych zleceń migracji pod kątem ładunków — **dopisane do backlogu razem z `Z-08`**, bo to ta sama klasa pracy: „poprawka blokuje przyszłość, nie mówi o przeszłości".

**Nie usuwa `set -euo pipefail` jako jedynej obrony przed cichym błędem.** Worker nadal w wielu miejscach kończy się `|| true`. To nie jest kwestia bezpieczeństwa, tylko obserwowalności, ale przy następnej pracy w tym pliku warto to przejrzeć.

**Nie ogranicza tego, dokąd worker może się łączyć.** Klient nadal podaje dowolny host — w tym adres w sieci wewnętrznej węzła (`127.0.0.1`, `10.0.0.0/8`). To osobna klasa problemu (SSRF z węzła) i osobna pozycja: **nowe ID w backlogu, `Z-09`**.

## Ryzyko i wycofanie

**Główne ryzyko: fałszywe odrzucenia.** Wzorce mogą nie objąć czegoś, co u realnego dostawcy występuje. Największe podejrzenie to ścieżki z polskimi znakami albo z nawiasami. Świadomie ich nie dopuściłem — polski znak w ścieżce na serwerze FTP to rzadkość, a każde rozszerzenie allowlisty trzeba przemyśleć osobno. **Sygnał do obserwacji po starcie:** zgłoszenia „nie mogę zlecić migracji" z komunikatem o niedozwolonych znakach. Komunikat jest po polsku i mówi wprost, które znaki są dozwolone, więc powinien być rozpoznawalny w zgłoszeniu.

**Ryzyko wdrożeniowe:** węzeł zaktualizowany bez `lib/` przestanie brać zlecenia migracji (fail-closed). To zachowanie zamierzone, ale w praktyce oznacza, że **przy najbliższym wdrożeniu trzeba skopiować cały katalog `ops/scripts/` z podkatalogiem**, nie same pliki `.sh`. `node-onboard-live.sh` to sprawdza i mówi wprost.

Wycofanie: usunięcie `@Matches` i przywrócenie `eval` cofa zmianę w całości. Bez migracji, bez zmian stanu.

## Wpływ na inne pozycje

- Zamyka `Z-03`, zdejmuje bloker startu (10 → 9).
- Otwiera `Z-09` — ograniczenie hostów docelowych workera (SSRF z węzła).
- Rozszerza zakres `Z-08` o przegląd historycznych zleceń migracji.
- Nie zmienia `H-16`/`H-17` — inny obszar tego samego skryptu.
