# Verris — zasady dla sesji Claude (także sesji w chmurze)

Verris to poufny SaaS hostingowy (DirectAdmin 1.710 + CloudLinux + LiteSpeed, pełny white label).
Monorepo pnpm: `apps/api` (NestJS, Vitest), `apps/client-panel`, `apps/admin-panel`, `apps/staff-panel`,
`apps/www` (Next.js, Jest), `libs/*` (m.in. `directadmin-sdk`, `database` — Prisma), `ops/scripts` (skrypty węzła).

## Poufność
- Nic z repozytorium nie trafia poza tę sesję i GitHub: żadnych publicznych gistów, pastebinów,
  zewnętrznych usług, publicznych udostępnień sesji.
- Nie wpisuj sekretów do kodu, commitów, opisów PR ani logów. Nie twórz ani nie edytuj plików `.env*`.

## Git
- Nigdy nie pushuj na `main`. Pracuj na gałęzi `claude/<id-zadania>-<krótki-opis>`, jeden PR na zadanie,
  PR jako **draft** do `main`. Scalanie robi właściciel.
- Commity i opisy PR po polsku. W opisie PR: co zmienione (plik:linia), jak sprawdzone, czego NIE sprawdzono.

## Czego nie ruszać (robi to sesja z dostępem do węzła i paneli)
- `audyt/dane/*.csv`, `audyt-parytetu-2026-08/`, `plan-startowy-2026-08/` — macierz i tablice aktualizuje
  się dopiero po teście na węźle. Dowody wpisz do opisu PR.
- Konfiguracja CI (`.github/`), rulesety, wdrożenia (`ops/scripts/prod-*`), migracje już wdrożone.
- Nie oznaczaj niczego jako „działa na produkcji” — z sesji w chmurze nie ma dostępu do węzła ani produkcji.

## Bramki (muszą przejść przed PR)
```bash
corepack enable && pnpm install --frozen-lockfile
npx turbo run lint typecheck test --filter=<pakiet> --env-mode=loose --output-logs=errors-only
```
- Zmiana w `libs/directadmin-sdk` → `pnpm --filter @verris/directadmin-sdk build` przed testami API.
- Zmiana logiki z bazą (pieniądze, subskrypcje, provisioning) → testy integracyjne `apps/api`:
  `pnpm test:int` na Postgresie 16, `DATABASE_URL` musi wskazywać bazę z „test” w nazwie
  (migracje: kolejno `libs/database/prisma/migrations/*/migration.sql`). Jeśli Postgresa nie ma — napisz to w PR.
- Zmiana stałej biznesowej (np. karencja, retencja) → poszukaj testów, które ją zakładają (także `test/integration`).

## Zasady kodu
- Rozwiązanie najmniejsze, które działa. Poprawka błędu = przyczyna, nie objaw; sprawdź wszystkich wołających.
- Integracje z DirectAdmin, CloudLinux, LiteSpeed — wyłącznie wg oficjalnej dokumentacji producenta, z linkiem
  w komentarzu. Bez „zapasowych” wywołań, które zamieniają błąd na sukces (błąd DA = błąd dla klienta).
- White label: klient nie widzi słów DirectAdmin/DA/CustomBuild, portu 2222 ani adresów węzłów.
- Teksty dla klienta po polsku, z odmianą liczebników przez `plForm` (`apps/client-panel/src/lib/pl.ts`).
- Panel klienta: bez natywnego `<select>` (komponent `Select` z `@/components/panel/select`) i bez
  `window.confirm` (`potwierdz` z `@/components/panel/potwierdz`) — pilnuje test `bez-systemowych-list.spec.ts`.
- Każda nietrywialna logika zostawia test, który czerwieni się na starym kodzie.
