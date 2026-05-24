# Go / No-Go checklist (production)

Krótka checklista przed pierwszym `docker compose -f docker-compose.prod.yml ... up -d --build`.
Jeśli którykolwiek punkt krytyczny nie jest spełniony, decyzja = **NO-GO**.

## 1) Repo i obraz aplikacji

- `main` zawiera docelowy commit (ten, który wdrażasz).
- Lokalnie przechodzi: `pnpm typecheck`.
- Lokalnie przechodzi: `pnpm build`.
- Nie ma niezamierzonych zmian roboczych (`git status` czysty).

## 2) Sekrety i .env.prod (krytyczne)

- Utworzone: `.env.prod` z `.env.prod.example` (plik nie trafia do git).
- Ustawione silne wartości:
  - `JWT_SECRET`
  - `APP_KMS_KEY` (>= 32 bajty entropii, zachowany bezpiecznie)
  - `POSTGRES_PASSWORD`
  - `DATABASE_URL` zgodny z hasłem/DB
- Ustawione domeny:
  - `CLIENT_PANEL_URL`, `STAFF_PANEL_URL`, `ADMIN_PANEL_URL`
  - `PUBLIC_API_URL`, `PUBLIC_STATUS_URL`
  - `CADDY_*_DOMAIN`
- Stripe (jeśli idziesz live od razu):
  - `STRIPE_SECRET_KEY` (live)
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`

## 3) DNS / sieć / TLS (krytyczne)

- Rekordy DNS dla paneli i API wskazują na control-plane.
- Porty 80/443 otwarte publicznie.
- Caddy ma poprawny e-mail/operator config.

## 4) Baza danych i migracje (krytyczne)

- Start stacku:  
`docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
- Migracje:  
`docker compose -f docker-compose.prod.yml --env-file .env.prod exec api npx prisma migrate deploy --schema=libs/database/prisma/schema.prisma`
- Seed operatorów (admin/staff) wykonany raz.
- Domyślne hasła seedowych kont zmienione.

## 5) Węzeł hostingowy + DirectAdmin (krytyczne dla hostingu)

> **⏸️ Po węźle** — podczas negocjacji licencji; reszta bez węzła w [`docs/HOSTING_LAUNCH_TASKS.md`](docs/HOSTING_LAUNCH_TASKS.md) (sekcja „Praca bez węzła”).

- Jest co najmniej 1 zaakceptowany node w panelu admina.
- Node ma CloudLinux + LVE + LiteSpeed + LSPHP.
- DirectAdmin na nodzie skonfigurowany i test połączenia przechodzi.
- Test provisioningu konta DA przechodzi end-to-end.

## 6) Billing i plan sprzedaży

- Plany sprzedawane kartą: **auto-sync** Product/Prices (`0c29aa0`) lub ręczne `price_` w adminie.
- Sandbox smoke top-up + webhook checkout — ✅ 2026-05-24 (live keys przed klientami zewn.).
- Webhook Stripe skonfigurowany na publiczny URL API:
  - `checkout.session.completed`
  - `invoice.`*
  - `customer.subscription.*`
  - `payment_intent.succeeded` / `payment_intent.payment_failed` (auto-topup)

## 7) Observability / backup / operacje

- `/healthz` i `/readyz` zwracają `ok`.
- Prometheus scrape działa; Grafana loguje przez SSO.
- Ustawione hasło dla `grafana_ro`, zapisane jako `GRAFANA_DB_RO_PASSWORD`.
- Backup Postgresa działa i ma retencję.
- (Zalecane) off-site backup skonfigurowany.

## 8) Smoke test po wdrożeniu (krytyczne)

**Bez węzła (teraz):** patrz [`docs/SPRINT_0_OPS_SMOKE.md`](docs/SPRINT_0_OPS_SMOKE.md) — punkty 1, 6–10 + billing bez DA.

**Po węźle:**

- Utworzenie subskrypcji klienta działa.
- Provisioning konta hostingowego działa (DA account created).
- Co najmniej jedna operacja DA z panelu klienta działa (np. SSL/backup/DNS).

**Zawsze (PRE-NODE):**

- Logowanie admin/staff/client działa.
- Billing: testowa płatność (Sandbox) + webhook + faktura w panelu — [`HOSTING_LAUNCH_TASKS.md`](docs/HOSTING_LAUNCH_TASKS.md) → GO-BILL.
- Tickety: zgłoszenie + odpowiedź staff + załącznik.

---

## Decyzja

- **GO**: wszystkie punkty krytyczne odhaczone.
- **NO-GO**: jakikolwiek brak w sekcjach 2, 3, 4, 5 lub 8.

Po decyzji **GO** trzymaj ten plik jako checklistę runbookową do kolejnych deployów.