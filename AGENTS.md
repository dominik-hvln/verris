# AGENTS.md

## Cursor Cloud specific instructions

### Architecture Overview

Verris is a **TypeScript monorepo** (pnpm workspaces + Turborepo) hosting management platform:
- **API** (`apps/api`) — NestJS 10 backend on port 3000
- **Client Panel** (`apps/client-panel`) — Next.js 15 on port 3001
- **Staff Panel** (`apps/staff-panel`) — Next.js 15 on port 3002
- **Admin Panel** (`apps/admin-panel`) — Next.js 15 on port 3003
- **Status Page** (`apps/status-page`) — Next.js 15 on port 3004
- **Database lib** (`libs/database`) — Prisma schema + migrations
- **DirectAdmin SDK** (`libs/directadmin-sdk`) — DA integration library

### Starting Services

Docker must be running before anything else. Start the daemon and containers:

```bash
sudo dockerd &>/tmp/dockerd.log &
sleep 3
docker compose up -d   # Postgres :5433, Redis :6379, MinIO :9000/9001
```

Then start all dev servers with `pnpm dev` (uses Turborepo to run all services in parallel).

### Critical: Build libs before dev

The workspace libs (`@verris/database`, `@verris/directadmin-sdk`) output to `dist/` and must be built before the API can compile:

```bash
pnpm --filter @verris/database build
pnpm --filter @verris/directadmin-sdk build
```

Without this, `pnpm dev` produces hundreds of TypeScript errors in the API.

### Database

- **Prisma schema**: `libs/database/prisma/schema.prisma`
- **Generate client**: `pnpm db:generate`
- **Run migrations**: `pnpm db:migrate`
- **Seed** (admin@verris.pl / staff@verris.pl, password `admin123`): `pnpm db:seed`
- **DATABASE_URL** must be identical in `apps/api/.env` and `libs/database/.env`

### Running Tests

- `pnpm --filter api test` — runs 39 Jest tests (unit + integration)
- `pnpm --filter api typecheck` — TypeScript type checking

### Known Issues

- **ESLint**: The monorepo references a legacy `.eslintrc`-style config (`libs/eslint-config/base.js`) but ESLint 9 requires flat config (`eslint.config.js`). Running `pnpm lint` will fail. This is a pre-existing issue.
- **Stripe/DirectAdmin**: Many features require external services (Stripe keys, DA nodes) — endpoints gracefully return 503 when not configured.
- **SMTP**: Mailing requires a local Postfix or external SMTP relay. Not needed for core dev work.

### Health Checks

- Liveness: `GET http://localhost:3000/healthz`
- Readiness (DB): `GET http://localhost:3000/readyz`

### Env Files

Copy from `.env.example` files before first run:
- `apps/api/.env.example` → `apps/api/.env`
- `libs/database/.env.example` → `libs/database/.env`
- `apps/client-panel/.env.example` → `apps/client-panel/.env.local`
- `apps/admin-panel/.env.example` → `apps/admin-panel/.env.local`
- `apps/staff-panel/.env.example` → `apps/staff-panel/.env.local`

See `LOCAL_DEV.md` for full local development documentation.
