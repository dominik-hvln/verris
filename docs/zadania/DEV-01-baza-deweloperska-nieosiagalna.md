# `DEV-01` — Baza deweloperska jest nieosiągalna, a `docker-compose.yml` opisuje stan, którego nie ma

| | |
|---|---|
| **Sprint** | 4 |
| **Priorytet** | WYSOKA |
| **Nakład** | planowany 6 h · rzeczywisty — |
| **Zależy od** | — |
| **Status** | do zrobienia |
| **Data zamknięcia** | |

---

## Problem

Kontener Postgresa wstaje zielony, `pg_isready` odpowiada, a logowanie odbija: ani rola
`postgres`, ani `verris` nie istnieje. Ktoś, kto sklonuje repozytorium dziś, dostanie działający
`docker compose up`, po którym nic się nie połączy.

Po decyzji nr 1 z 2026-08-28 to nie jest niedogodność, tylko blokada procesu: **jedyną realną
bramką przed `main` jest bramka uruchamiana lokalnie** — ruleset GitHuba nie zatrzymuje pusha
właściciela repozytorium. Bramka lokalna bez bazy nie odpali testów integracyjnych.

## Dowód przed

```
FATAL:  role "verris" does not exist
FATAL:  role "postgres" does not exist
```

Połączenie po gnieździe wewnątrz kontenera. `docker inspect` potwierdza `POSTGRES_USER=verris`
w konfiguracji, czyli konfiguracja i rzeczywistość mówią co innego.

```
docker-compose.yml:8-11
  POSTGRES_USER: verris
  POSTGRES_PASSWORD: verris_password
  POSTGRES_DB: verris_db
```

**Mechanizm:** wolumen `ekohost_postgres_data` zainicjowano z innym `POSTGRES_USER` niż dzisiejszy.
Wejściówka obrazu Postgresa uruchamia `initdb` **tylko przy pustym katalogu danych** — przy każdym
kolejnym starcie `POSTGRES_USER` i `POSTGRES_PASSWORD` są ignorowane w całości. To nie jest błąd
obrazu; to udokumentowane zachowanie, którego `docker-compose.yml` nie odzwierciedla.

**Stan w macierzy przed:** `BRAK`

## Decyzja: odzyskujemy nazwę roli, nie kasujemy wolumenu

Zapisana 2026-08-28 (`docs/zadania/DECYZJE-2026-08-28.md`, punkt 3). Jedna z rozważanych opcji —
„odtwarzamy z migracji i seeda" — kasuje dane nieodwracalnie. **Nie kasujemy danych, których nie
sprawdziliśmy.** Tryb single-user czyta `pg_authid` bez uwierzytelniania i niczego nie zmienia.
Jeśli po odczycie okaże się, że w bazie nie ma nic wartościowego, kasowanie wolumenu pozostaje
dostępne — w drugą stronę już nie.

## Procedura (do wykonania na maszynie deweloperskiej)

Wymaga Dockera, więc nie da się jej wykonać z kontenera sesji ani z Linux VM asystenta.

**Krok 1 — ustalić nazwę wolumenu i zatrzymać serwer.**
Single-user nie wystartuje, dopóki na tym katalogu danych stoi normalny postmaster.

```bash
docker volume ls | grep postgres
docker compose stop postgres
```

**Krok 2 — odczytać role bez uwierzytelniania.**
Podmień nazwę wolumenu na tę z kroku 1.

```bash
docker run --rm -i \
  -v ekohost_postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine \
  postgres --single -D /var/lib/postgresql/data postgres <<'SQL'
SELECT rolname, rolsuper, rolcanlogin FROM pg_authid;
SQL
```

Uwagi do trybu single-user, bo zachowuje się inaczej niż `psql`:
każde polecenie kończysz średnikiem i znakiem nowej linii, nie ma transakcji, nie ma `\dt`,
a wynik wypisuje się jako surowe wiersze. Jeżeli obraz odmówi startu z powodu właściciela
katalogu, dołóż `--user root` — to odczyt, nie zapis do systemu plików hosta.

**Krok 3 — utworzyć brakującą rolę, nie ruszając danych.**
Nazwa roli-superużytkownika z kroku 2 jest jedyną, która może to zrobić; jeżeli istnieje
i po prostu nazywa się inaczej niż `verris`, masz dwie drogi — utworzyć `verris` albo
dopasować `POSTGRES_USER` i `DATABASE_URL` do istniejącej nazwy. **Wybierz utworzenie roli:**
zmiana `docker-compose.yml` pod zastany wolumen zakonserwowałaby rozjazd u każdego następnego,
kto sklonuje repo na czysto.

```bash
docker run --rm -i \
  -v ekohost_postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine \
  postgres --single -D /var/lib/postgresql/data postgres <<'SQL'
CREATE ROLE verris WITH SUPERUSER LOGIN PASSWORD 'verris_password';
SQL
```

**Krok 4 — wstać i potwierdzić.**

```bash
docker compose start postgres
docker compose exec postgres psql -U verris -d verris_db -c '\l'
```

Jeżeli baza `verris_db` nie istnieje, dołóż `CREATE DATABASE verris_db OWNER verris;`
w kroku 3 — też bez kasowania czegokolwiek.

**Krok 5 — pełna bramka lokalna.**
To jest właściwy dowód, że DEV-01 jest zamknięte, i jednocześnie punkt 3 sprintu 4
(rozruch po 22 dniach przerwy).

```bash
nvm use                      # .nvmrc = 22, zgodnie z ENV-01
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test                    # oczekiwane ~841 jednostkowych
pnpm --filter api test:int   # ~78 integracyjnych, wymaga bazy. UWAGA: skrypt test:int
                             # istnieje TYLKO w apps/api — "pnpm test:int" w korzeniu
                             # konczy sie ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL
```

Liczby z 2026-08-28 są punktem odniesienia, nie wymaganiem — rozjazd wobec nich jest
znaleziskiem i trafia do macierzy jako nowa pozycja, a nie do komentarza w tym pliku.

**Bezpiecznik jest już na miejscu:** `sprawdzBazeTestowa()` (X-44) wymaga, żeby nazwa bazy
zawierała „test", więc `pnpm test:int` nie skasuje `verris_db` nawet przy źle ustawionym
`DATABASE_URL`. Bez tego bezpiecznika krok 5 byłby ryzykiem dla danych, które właśnie
odzyskaliśmy w kroku 3.

## Czego to nadal nie robi

Nie zapobiega powtórce. Wolumen zainicjowany z innym użytkownikiem znów zignoruje
`POSTGRES_USER` — obraz zachowa się tak samo u następnej osoby.

**Do rozważenia jako osobna pozycja, nie dopisek tutaj:** check w `LOCAL_DEV.md` albo strażnik,
który przy starcie porównuje `POSTGRES_USER` z faktycznym właścicielem katalogu danych i mówi
to wprost, zamiast pozwolić kontenerowi wstać na zielono. To ta sama rodzina co `X-39`
i `PANEL-01` — zielony status tam, gdzie system nie wie.

## Ryzyko i wycofanie

Krok 2 to czysty odczyt. Krok 3 dopisuje rolę i nie dotyka danych — wycofanie to `DROP ROLE verris;`
w tym samym trybie. Żaden krok nie kasuje wolumenu; gdyby okazało się, że w bazie nie ma nic
wartościowego, decyzja o skasowaniu pozostaje otwarta i należy do właściciela projektu.

## Wpływ na inne pozycje

Odblokowuje bramkę lokalną, czyli warunek wstępny dla `ENV-01` (potwierdzenie na Node 22)
i dla całego sprintu 4. Nie zmienia `X-44` — bezpiecznik bazy testowej działa niezależnie.
