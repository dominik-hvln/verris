> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** backlog startowy `plan-startowy-2026-08/VERRIS_BACKLOG_STARTOWY.xlsx`
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Backlog Rozwoju Platformy Verris

W tym pliku zapisujemy luźne pomysły, funkcjonalności oraz moduły, które pojawiły się podczas dyskusji, ale ich realizacja została przesunięta na później, aby skupić się na głównych priorytetach biznesowych.

## Stan po iteracji 1

Zrealizowane: rozszerzenie schematu Prisma (plany, subskrypcje, portfel, tokeny bootstrap itd.), API Nest z endpointami admin/servers, handshake bootstrap, szyfrowaną konfiguracją DA (factory), audytem i warstwą crypto; telemetria węzłów identyfikowana nagłówkami **X-Server-Id** i **X-Server-Token** (bez wspólnego sekretu). Panel admina działa na porcie **3003**; logowanie ustawia httpOnly cookie z tokenem admina (`admin_auth_token`) po udanym `/auth/login`.

## Stan po sprincie 2

Wdrożono fundament billingu i wdrożenia produkcyjnego:

- `WalletLedgerService` — w pełni transakcyjne `credit` / `debit` (ACID na `User.walletBalance` + `WalletTransaction`), idempotency-key, ochrona przed ujemnym saldem.
- `BillingModule`: `GET /billing/wallet` (zalogowany user), `POST /billing/checkout-session` (Stripe Checkout dla doładowania portfela), `POST /admin/billing/wallet/credit` (ADMIN — korekta/test).
- Stripe — bez paczki `stripe`; własny `StripeClient` na `fetch` + weryfikacja webhooków (`HMAC-SHA256`, tolerancja 5 min) w `node:crypto`. Endpoint `/billing/stripe/webhook` z raw body przez `NestFactory.create({ rawBody: true })`.
- `ProvisioningService` — szkielet kolejkowania provisioning subskrypcji + audyt (BullMQ pipeline będzie podpięty w EPIC B).
- Health endpoints `/healthz` (liveness) i `/readyz` (DB ping).
- Docker: `Dockerfile.api` + `Dockerfile.panel` (jeden plik na 3 panele, parametryzowany), `docker-compose.prod.yml` (Postgres + Redis + API + 3 panele + Caddy z auto-TLS), `ops/Caddyfile`, `.env.prod.example` i `DEPLOY.md`.
- Contracts: `wallet.dto.ts` z typami współdzielonymi z panelami.

## System BOK (Helpdesk) - Rozszerzenia

- **Powiadomienia E-mail:** Wysyłanie wiadomości e-mail do klienta za pomocą zewnętrznego API (np. Resend lub Nodemailer) w momencie, w którym Agent udziela mu odpowiedzi na stworzone zgłoszenie, aby ulepszyć Customer Experience.
- **Własne Załączniki:** Umożliwienie uploadu małych zdjęć ekranu (Screenshotów) lub błędów do chatów.
- **Zmiana Działu:** Przypisywanie i transfer zgłoszeń pomiędzy odpowiednimi grupami agentów.

## Ustawienia Konta Klienta (`/dashboard/settings`)

- **Edycja Awatara / Informacji:** Wgrywanie customowego zdjęcia profilowego oraz możliwość zmiany wyświetlanych informacji osobowych / danych firmowych z NIP.
- **Reset i Zmiana Hasła:** Bezpieczna zmiana haseł powiązana z generowaniem i wysyłką tokenów aktywacyjnych w przypadku zapomnienia.
- **Faktury w PDF:** Automatyczne generowanie faktur po zrealizowanej płatności i wyświetlanie ich w zakładce bilingowej.

## Główne Narzędzia Hostingowe

- **Automatyzacje Certyfikatów SSL:** (Moduł SSL) Zamawianie, generowanie i podpinanie Let's Encrypt przez API.
- **Skrzynki Pocztowe:** (Moduł E-mail) Zarządzanie aliasami, forwardowaniem i spam filtrami poprzez API pocztowe.
- **Konto FTP / Baza Danych (MySQL/PostgreSQL):** UI pozwalające dodawać, edytować hasła użytkowników oraz tworzyć bezpośrednie subkonta z limitami zasobów per baza.