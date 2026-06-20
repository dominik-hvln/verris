# Backlog przed startem LIVE — Verris

Stan na 2026-06-17. Pogrupowane wg priorytetu i obszaru. Oznaczenia:
**[P0]** bloker startu · **[P1]** ważne na start · **[P2]** zaraz po starcie.

---

## A. Konfiguracja produkcyjna (P0 — bez tego funkcje nie działają)

- **[P0] LiteSpeed — licencja produkcyjna** na węźle (trial wygasł; bez niej strony i Let's Encrypt nie działają). Do testów: shared/trial; do LIVE: oficjalna.
- **[P0] Zmienne env na prod:** `STRIPE_SECRET_KEY=sk_live_…` + `STRIPE_WEBHOOK_SECRET`, `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGINS` (✅ ustawione), `HETZNER_API_TOKEN` (VPS), `WEBMAIL_URL` (webmail), `OPENPROVIDER_*` (rejestracja domen).
- **[P0] Certy TLS** dla paneli — potwierdzić auto-odnawianie Caddy (był warn „<7 dni").
- **[częściowo] Treści Bazy Wiedzy (KB)** — seed 13 startowych artykułów PL gotowy (`pnpm --filter api cli:seed-kb`), zasila podpowiedzi KB + sugestie AI (keyword-fallback, bez embeddingów). Admin może dopisać kolejne w panelu. Do uruchomienia na prod.
- **[P1] Dane firmy + KSeF** (sprzedawca, NIP) — wymagane na fakturach; potwierdzić w „Gotowość LIVE".

## B. Funkcje — dopięcie zarządzania usługą (P1)

Cel: 100% zarządzania w panelu (jak najlepsza konkurencja), bez wychodzenia do DA.

- **[P1] Skrzynki e-mail w panelu** — tworzenie/usuwanie/zmiana hasła (dziś link do DA). Analogicznie do baz MySQL.
- **[P1] Cron w panelu** — dodawanie/edycja/usuwanie zadań (dziś tylko lista). 
- **[P1] Konta FTP w panelu** — tworzenie/usuwanie (endpointy gotowe; dołożyć formularz w zakładce).
- **[P1] Użytkownicy baz MySQL** — zarządzanie userami i uprawnieniami (dziś tylko baza+user przy tworzeniu).
- **[✅ zrobione] Subdomeny** — tworzenie/usuwanie w zakładce Domeny&DNS (z audytem).
- **[częściowo] Menedżer plików — rozszerzenia:** ✅ nowy pusty plik; pozostaje kopiuj/przenieś, wielozaznaczenie, rozpakuj ZIP, podgląd uprawnień (wymagają nowych komend DA — weryfikacja na żywo).
- **[P2] Przekierowania/aliasy domen, „parked domains”.**

## C. Bezpieczeństwo (P0/P1)

- **[✅ zrobione] CVE-2025-29927 (Next.js middleware bypass)** — Next 15.2.0 podatny; podbito wszystkie panele do 15.2.3. Wymaga `pnpm install` + rebuild + deploy.
- **[✅ zrobione] Limit pobierania pliku** — cap 100 MB z pre-checkiem rozmiaru (ochrona pamięci kontenera).
- **[✅ zrobione] Blokada mutacji na koncie SUSPENDED/DELETED** — w `daFormForSubscription` (email/FTP/cron/subdomeny/bazy).

- **[✅ zrobione] Audyt destrukcyjnych akcji** — wpisy AuditLog dla: utworzenie/usunięcie bazy, konta FTP, skrzynki, zadania cron oraz zapis/zmiana nazwy/usunięcie/upload plików (`HostingResourceActions`). Widoczne w logu audytu admina.
- **[P1] Rate-limit na nowych endpointach** hostingowych (DB create/delete, file ops mają limit; dołożyć dla DB/FTP/cron mutacji).
- **[P1] Przegląd CSP po włączeniu** — sprawdzić w konsoli, czy nic nie blokuje (Stripe/webmail) po wdrożeniu.
- **[P1] `npm audit` / przegląd zależności** + aktualizacje krytyczne przed startem.
- **[P1] Weryfikacja izolacji kont** — czy operacje per-usługa są twardo ograniczone do właściciela (sprawdzone w plikach: sandbox + ownership; powtórzyć dla DB/FTP/mail).
- **[P2] 2FA/passkey dla klientów** (opcjonalne wymuszenie), polityka haseł.
- **[P2] Skan bezpieczeństwa** (nagłówki — ✅, TLS, otwarte porty węzła) skryptem `prod-live-acceptance.sh` + `diag-domain.sh`.

## D. Stabilność i niezawodność (P0/P1)

- **[✅ zrobione] Intermittentne 503/502** — zdiagnozowane: NIE przeciążenie (panel 1% RAM, 0 OOM/restartów, 20 równoległych POST = 307). Przyczyna: okno restartu przy deployu + skanery/boty. Mitygacja w Caddy: `lb_try_duration 10s` (retry do upstreamu podczas restartu) + blok skanerów (PHP/.env/.git/wp/xmlrpc → 403). Opcjonalnie później: zero-downtime/rolling deploy.
- **[✅ zrobione] Spójna obsługa błędów DA** — helper `daErrorMessage` mapuje typowe błędy DA na przyjazne komunikaty PL; zastosowany w hubie (DB/FTP/cron/mail/backupy) i menedżerze plików. Pozostaje monitoring (Sentry).
- **[P1] Naprawa resztkowego błędu tsc** `vps-client.tsx` (`sshKeyIds`) — niezwiązany z Prisma, realny do poprawienia.
- **[P1] Monitoring błędów** (np. Sentry) dla API i paneli — łapanie wyjątków na produkcji.
- **[P1] Drill przywracania backupu** (restore) — potwierdzić, że kopie offsite da się odtworzyć.
- **[P2] Testy obciążeniowe** podstawowych ścieżek (login, zamówienie, panel) + limity puli połączeń DB.
- **[P2] Po `prisma migrate deploy` + `db:generate`** — pełny `pnpm typecheck && build && test` musi przejść bez błędów (dziś błędy = nieaktualny klient Prisma).

## E. QA / dopięcie przed startem (P1)

- **[P1] Pełny przebieg E2E na żywym koncie** (po licencji LiteSpeed): zamówienie → provisioning → strona działa → SSL → WordPress → poczta → DB → pliki.
- **[P1] Sprzątnięcie danych testowych** (ticket #1F4CEEA7, konto `test-live-verris.pl`, zakup dodatku) przed startem.
- **[P1] Dokończyć QA huba na żywo:** zapis/upload pliku, scalona zakładka Aplikacje (po redeployu), Kopie zapasowe, Domeny&DNS, WAF/Monitoring/Staging/Deploy.
- **[P2] Onboarding e-mail/komunikaty** — przegląd treści maili transakcyjnych.

---

## Zrobione w tej sesji (kontekst)
P-4 menedżer plików (działa na żywo), P-7 oszczędności roczne, P-8 dodatki, reorganizacja nawigacji (hub usługi), BUG-1 domeny w kaflu, naprawa passkey + #418, FTP `domain`, zarządzanie bazami MySQL w panelu (create/delete).
