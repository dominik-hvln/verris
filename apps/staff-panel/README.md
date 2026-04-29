# EkoHost — panel staff / BOK

## Konfiguracja

1. Skopiuj `.env.example` do `.env.local` — **`API_URL`** musi wskazywać na działające API (domyślnie `http://localhost:3000`).
2. Dev: `pnpm dev` — aplikacja na porcie **3002**.

Token sesji jest w cookie `staff_auth_token` (httpOnly), tak jak przy produkcji.

## Logowanie (dev)

Po wykonaniu seeda (`libs/database/prisma/seed.ts`): konto **`staff@ekohost.pl`**. Domyślne hasło to to samo co dla konta administratora (**`admin123`**, dopóki nie ustawisz `SEED_STAFF_PASSWORD` lub `SEED_ADMIN_PASSWORD`). Szczegóły w **`PROJECT_STATUS.md`** (sekcja dev — konta testowe).
