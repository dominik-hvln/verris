# Środowisko lokalne (przed wdrożeniem produkcyjnym)

Cel: **działający monorepo na Twojej maszynie** (Postgres, Redis, API, panele), żeby zaplanować i przetestować proces z [DEPLOY.md](./DEPLOY.md). **Sekrety produkcyjne** uzupełnisz dopiero na serwerze (`.env.prod`).

## Wymagania

- Node **20+**
- **pnpm** 9 (`corepack enable` lub instalacja globalna)
- **Docker** (tylko Postgres + Redis z `docker-compose.yml`)

## 1. Baza i Redis

```bash
docker compose up -d
```

Domyślnie Postgres jest na **`localhost:5433`** (wewnątrz kontenera `5432`), Redis na **`localhost:6379`**.

## 2. Zmienne środowiskowe (lokalnie)

### API

```bash
cp apps/api/.env.example apps/api/.env
```

W dev Nest ma bezpieczne domyślne wartości dla `JWT_SECRET` / `APP_KMS_KEY`, jeśli ich nie ustawisz — na produkcji muszą być jawnie ustawione (patrz `loadConfig()`).

**Stripe** możesz zostawić puste — część endpointów płatności zwróci brak konfiguracji; do pełnych testów checkoutu użyj **kluczy testowych** ze Stripe.

### Prisma (migracje)

CLI Prismy ładuje `.env` z katalogu **`libs/database/`**. Użyj tego samego `DATABASE_URL` co w API:

```bash
cp libs/database/.env.example libs/database/.env
```

Upewnij się, że **`DATABASE_URL` w `apps/api/.env` i `libs/database/.env` jest identyczny** (np. oba wskazują na `localhost:5433`).

### Panele Next (opcjonalnie — domyślnie już pasują do localhost)

- **Klient:** `cp apps/client-panel/.env.example apps/client-panel/.env.local`  
  (`NEXT_PUBLIC_API_URL=http://localhost:3000`)
- **Admin / Staff:** to samo z ich `.env.example` → `.env.local` (`API_URL=http://localhost:3000`)

## 3. Zależności i klient Prisma

```bash
pnpm install
pnpm db:generate
```

## 4. Migracje i seed

```bash
pnpm db:migrate
pnpm db:seed
```

Domyślne konta z seeda (zmień hasła przez `SEED_ADMIN_PASSWORD` / `SEED_STAFF_PASSWORD` jeśli chcesz):

- `admin@ekohost.pl`
- `staff@ekohost.pl`

Konto **klienta** zakładasz przez rejestrację w panelu klienckim (o ile masz włączony flow rejestracji).

## 5. Uruchomienie aplikacji

**Opcja A — wszystko naraz (turbo):**

```bash
pnpm dev
```

**Opcja B — osobne terminale (wygodniejsze przy debugowaniu):**

| Usługa      | Port | Katalog / komenda        |
| ----------- | ---- | ------------------------ |
| API (Nest)  | 3000 | `pnpm --filter api dev`  |
| Panel klienta | 3001 | `pnpm --filter @ekohost/client-panel dev` |
| Staff       | 3002 | `pnpm --filter @ekohost/staff-panel dev` |
| Admin       | 3003 | `pnpm --filter @ekohost/admin-panel dev` |

Szybkie testy:

- API: `http://localhost:3000/healthz` (liveness), `http://localhost:3000/readyz` (baza)
- Klient: `http://localhost:3001`

## 6. Redis (opcjonalnie)

W `apps/api/.env` możesz dodać:

```env
REDIS_URL=redis://localhost:6379
```

Wtedy włączy się m.in. ścieżka z kolejką provisioningową (BullMQ), jeśli jest używana — bez Redis API nadal działa, tylko bez tej funkcji.

## 7. DirectAdmin — co realnie działa lokalnie

- **Bez węzła z DA:** działają auth, portfel (bez Stripe), tickety, większość „suchych” endpointów.
- **Endpointy `hosting-*` (DNS, SSL, backup, migracje z DA itd.):** wymagają **subskrypcji z provisionowanym kontem** i poprawnej konfiguracji serwera + DA w bazie (jak na prawdziwym węźle). Na czystym lokalnym DB możesz to symulować tylko z **devowym / stagingowym** węzłem albo zaakceptować błędy DA do czasu podpięcia noda.

To nie są „mocki API” — to **brak zdalnego DA**; sama aplikacja woła prawdziwe API Nest.

## 8. Most do produkcji

Gdy lokalnie wszystko jest OK:

1. Skopiuj `.env.prod.example` → `.env.prod` na serwerze i uzupełnij sekrety (bez commitowania).
2. Postępuj według [DEPLOY.md](./DEPLOY.md): `docker-compose.prod.yml`, `prisma migrate deploy`, seed operatora, Caddy, Stripe webhook na publiczny URL API.

---

**Podsumowanie:** lokalnie trzymasz **jeden spójny `DATABASE_URL`**, migracje + seed, `pnpm dev`, opcjonalnie Redis i Stripe test. Produkcja = ten sam kod + **`.env.prod`** + prawdziwe domeny + węzły DA.
