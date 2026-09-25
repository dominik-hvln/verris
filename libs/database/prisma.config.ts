import { defineConfig } from 'prisma/config';

// X-20 — Prisma 7: konfiguracja CLI (dokumentacja: „Upgrade to Prisma ORM 7” → prisma.config.ts).
// Prisma 7 nie wczytuje już .env sama; w kontenerze DATABASE_URL przychodzi ze środowiska.
try {
  process.loadEnvFile('.env');
} catch {
  // brak .env (CI, produkcja) — zmienne są w środowisku
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    // CLI bez DATABASE_URL (np. samo `prisma generate` przy budowie obrazu) nie potrzebuje bazy.
    url: process.env.DATABASE_URL ?? '',
  },
});
