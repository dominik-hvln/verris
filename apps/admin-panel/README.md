# EkoHost — panel administratora

## Konfiguracja

- Skopiuj `.env.example` do `.env.local` i ustaw **`API_URL`** na adres działającego API Nest (domyślnie `http://localhost:3000`).
- Wymagany jest **`postcss.config.mjs`** z `@tailwindcss/postcss` (Tailwind 4 — bez tego style z `globals.css` się nie budują).
- Dev: `pnpm dev` — aplikacja nasłuchuje na porcie **3003**.

Logowanie zapisuje token w httpOnly cookie `admin_auth_token` po udanym logowaniu do API.

## Logowanie (dev)

Po seedzie bazy (`libs/database/prisma/seed.ts`): **`admin@ekohost.pl`** / domyślne hasło **`admin123`** (lub wartość **`SEED_ADMIN_PASSWORD`** przy uruchamianiu seeda). Nie loguj się kontem STAFF ani USER — panel wymaga roli **ADMIN**.
