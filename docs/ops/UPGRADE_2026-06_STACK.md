# Upgrade stacku przed startem hostingu — czerwiec 2026

Cel: najnowsze, stabilne wersje wszystkich kluczowych komponentów, wdrożone tak,
aby po deployu wszystko działało bez problemu. Dokument dzieli się na:
**A. zmiany już wprowadzone w repo** (do zbudowania/wdrożenia),
**B. runbook wdrożenia (kolejność install/build/migrate/smoke)**,
**C. Prisma 6 → 7 (osobny, build-testowany krok po starcie)**,
**D. MariaDB 10.6 → 11.4 na węźle (okno serwisowe)**,
**E. nowy feature: upgrade DB z panelu (select wersji)**.

> Uwaga: w środowisku, w którym przygotowano te zmiany, rejestr npm jest
> zablokowany — nie dało się uruchomić `pnpm install`/buildów. Edycje są
> statycznie spójne; **finalną weryfikację robi build u Ciebie** (sekcja B).

---

## A. Co zostało zmienione w repo

| Komponent | Było | Jest | Pliki |
|---|---|---|---|
| Node (Docker) | 20 (EOL 30.04.2026) | **22 LTS** | `Dockerfile.api`, `Dockerfile.panel`, `package.json` (engines) |
| NestJS | ^10 | **^11** | `apps/api/package.json` (core/common/platform-express/cli/schematics), `@nestjs/config` ^3→^4 |
| @types/express | ^4 | **^5** (Express 5 już był w deps) | `apps/api/package.json` |
| Next.js | 15.2.3 | **16.2.7** | `apps/{client,admin,staff}-panel`, `apps/status-page` |
| eslint-config-next | 16.2.2 | **16.2.7** | client-panel, status-page |
| @types/node | ^20 | **^22** | api + 4 panele + libs/database |
| Prisma + @prisma/client | ^5.19.1 | **^6.19.2** | `libs/database/package.json` |

Dlaczego te wersje są bezpieczne dla nas:
- **NestJS 11** — byliśmy już w połowie migracji (Express 5, `@nestjs/jwt`/`passport` 11,
  `@nestjs/schedule` 6, rxjs 7). `Reflector.getAllAndOverride` bez zmian; nie używamy
  CacheModule/Throttler. Bootstrap (`main.ts`: trust proxy, rawBody, CORS, shutdown hooks)
  działa na 11 bez zmian.
- **Next 16** — React 19 już mamy; `next dev --turbopack` już włączony; brak nie-await
  `cookies()/headers()`; configi proste (standalone, transpilePackages) i ważne w 16.
- **Prisma 6.19.2** — `binaryTargets` (`debian-openssl-3.0.x`) nadal poprawne dla node:22-bookworm.
  Brak zmian architektury (klient generowany jak dotąd, import z `@verris/database`).

---

## B. Runbook wdrożenia (kolejność — WAŻNE)

```bash
# 1. Czysta instalacja zależności na nowych wersjach
pnpm install

# 2. Wygeneruj klienta Prisma (NOWE pola: targetDbVersion, dbUpgradeRequestedAt;
#    NOWY enum: NodeTaskKind.DB_UPGRADE) — to usuwa „stale prisma" błędy tsc
pnpm --filter @verris/database db:generate

# 3. Typecheck całości (po generate powinno być czysto)
pnpm -w typecheck

# 4. Build wszystkiego (api + 4 panele). Admin-panel typechecuje przy buildzie.
pnpm -w build

# 5. Migracje DB (control-plane Postgres) — dodaje DB_UPGRADE + kolumny Server
pnpm --filter @verris/database db:migrate:deploy

# 6. Restart usług (zero-downtime jak w STAB-1) + przeładowanie Caddy jeśli trzeba
```

Smoke po deployu:
- API wstaje (`/readyz` 200), logowanie do 3 paneli działa.
- Panel admina → węzeł ACTIVE → sekcja „Silnik bazy danych (MariaDB)" renderuje się,
  select 11.4/11.8/12.3 widoczny.
- Dowolny istniejący widok klienta (Bazy/Pliki/Poczta) działa (Next 16 sanity).
- Jedno zlecenie HOSTING_PROFILE na węźle testowym przechodzi (agent zadań żyje).

Rollback: obrazy poprzedniej wersji + (Postgres) migracje są addytywne (nowe kolumny
nullable, nowy enum) — stara wersja kodu działa na nowym schemacie bez zmian.

---

## C. Prisma 6 → 7 (osobny krok, build-testowany)

Prisma 7 daje ~90% mniejszy klient, do 3× szybsze duże zapytania, brak silnika Rust
(mniejsze obrazy, mniejsza powierzchnia ataku). Migracja jest jednak inwazyjna —
robimy ją świadomie, w środowisku gdzie można zbudować i odpalić testy.
Blast radius jest mały, bo **tylko `libs/database` importuje `@prisma/client`**.

Kroki:

1. Bump wersji:
   ```bash
   pnpm --filter @verris/database add @prisma/client@^7 && \
   pnpm --filter @verris/database add -D prisma@^7
   ```

2. `libs/database/prisma/schema.prisma` — nowy generator (klient do własnego folderu,
   bez `prisma-client-js`, bez `binaryTargets` — Rust-free):
   ```prisma
   generator client {
     provider = "prisma-client"
     output   = "../src/generated/client"
     runtime  = "nodejs"
   }
   ```

3. Dodaj `libs/database/prisma.config.ts` (Prisma 7 nie czyta już bloku `prisma`
   z package.json):
   ```ts
   import path from "node:path";
   import { defineConfig } from "prisma/config";
   export default defineConfig({
     schema: path.join("prisma", "schema.prisma"),
     migrations: { seed: "ts-node prisma/seed.ts" },
   });
   ```
   …i usuń klucz `"prisma": { "seed": ... }` z `libs/database/package.json`.

4. `libs/database/src/index.ts` — zmień źródło importu z `@prisma/client` na
   wygenerowany klient:
   ```ts
   import { PrismaClient } from "./generated/client";
   // …bez zmian w logice singletona…
   export * from "./generated/client";
   ```
   To samo w `prisma/seed.ts` i `prisma/seed-canned.ts` (import z `../src/generated/client`).
   Reszta monorepo importuje z `@verris/database` — bez zmian.

5. `.gitignore` — dodaj `libs/database/src/generated/`. W Dockerze upewnij się, że
   `prisma generate` leci PRZED `tsc`/`nest build` (build API zależy od wygenerowanego klienta).

6. Build + test:
   ```bash
   pnpm --filter @verris/database db:generate
   pnpm -w typecheck && pnpm -w build && pnpm --filter api test
   ```
   Skup się na sanity zapytań finansowych (portfel/faktury) i provisioningu.

Jeśli cokolwiek nie zagra — pozostań na 6.19.2 (w pełni wspierane), wróć do 7 później.

---

## D. MariaDB 10.6 → 11.4 na istniejącym węźle (okno serwisowe)

10.6 ma EOL **6 lipca 2026** — zaplanuj przed tą datą. Można to zrobić z panelu
(sekcja E), ale dla pełnej kontroli — ręcznie na węźle:

```bash
# 0. Okno serwisowe + pełny backup (KONIECZNIE przed czymkolwiek)
mysqldump --all-databases --single-transaction --routines --triggers --events \
  | gzip -c > /var/backups/verris-db/predump-$(date -u +%Y%m%dT%H%M%SZ).sql.gz

# 1. CustomBuild
cd /usr/local/directadmin/custombuild
./build update
./build set mariadb 11.4
./build set mysql_inst mariadb
./build mariadb

# 2. Tabele systemowe + weryfikacja
mariadb-upgrade --force
mysql -e "SELECT VERSION();"
```
Downgrade NIE jest wspierany — trzymaj zrzut do potwierdzenia poprawności.
Sprawdź też (telemetria tego nie raportuje): `da version`,
`/usr/local/lsws/bin/lshttpd -v`, `cldetect --check-license`, wersje PHP.

---

## E. Nowy feature: upgrade DB z panelu admina (select wersji)

Co dodano:
- **Panel admina → węzeł (ACTIVE) → „Silnik bazy danych (MariaDB)"**: pokazuje obecną
  wersję, select docelowej (11.4 / 11.8 / 12.3), wymaga wpisania `UPGRADE`, blokuje
  downgrade i równoległe zlecenia, pokazuje historię i status na żywo.
- **Backend**: `NodeTask` rodzaju `DB_UPGRADE` (kolejka jak inne zadania węzła),
  endpoint `POST /admin/servers/:id/db-upgrade` (ADMIN), guard downgrade/idempotencja,
  pola `Server.targetDbVersion` + `dbUpgradeRequestedAt`.
- **Agent węzła**: skrypt `ops/scripts/node-db-upgrade.sh` — **najpierw pełny mysqldump**,
  potem CustomBuild, na końcu `mariadb-upgrade` + weryfikacja; markery `[VERRIS_DB_UPGRADE]`
  w logu zadania. Pobierany z `/agent/tasks/db-upgrade/script`.

> WYMAGANE PO DEPLOYU: przeinstaluj agenta zadań na każdym węźle (panel admina →
> węzeł → „Pokaż skrypt instalacji agenta"), bo poller (`verris-tasks.sh`) i runner
> (`verris-task-run.sh`) zawierają teraz obsługę rodzaju `DB_UPGRADE`. Bez tego
> istniejący agent odrzuci zlecenie jako „Unknown task kind".

Bezpieczeństwo: to operacja na żywych danych — uruchamiaj w oknie serwisowym,
backup powstaje automatycznie w `/var/backups/verris-db/` i jest weryfikowany
(min. rozmiar) zanim skrypt ruszy silnik.
