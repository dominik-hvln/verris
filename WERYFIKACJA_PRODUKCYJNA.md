# Weryfikacja produkcyjna — funkcje z sesji 2026-06-16

Skrót co dowieziono, w jakiej kolejności wdrażać i jak zweryfikować, że działa
na produkcji. Pełne opisy: `WDROZENIE_2026-06-10.md` (sekcje 0a–0o),
`CHECKLISTA_STARTU_LIVE.md`.

## ⛔ Twardy warunek (najpierw!)

Wszystkie błędy `tsc`, które widać w trakcie tej sesji, wynikają z **nieaktualnego
wygenerowanego klienta Prisma** (nowe pola/modele). **Przed buildem** uruchom:

```bash
pnpm --filter @verris/database exec prisma migrate deploy
pnpm --filter @verris/database db:generate
pnpm typecheck && pnpm build && pnpm --filter api test
```

Po `db:generate` resztkowe błędy znikają (zweryfikowane: dotyczą wyłącznie
nowych pól jak `isTrial`, `phpVersion`, `supportSlaHours`, modeli `VpsInstance`,
`PurchasedAddon` itd.).

## Migracje (kolejność — chronologiczna, bez konfliktów)

```
20260616100000_staff_passkey_enforcement
20260616120000_free_trial
20260616140000_offsite_backup
20260616160000_plan_product_kind
20260616180000_vps_cloud
20260616200000_ssh_keys
20260616220000_sup_csat_sla
20260616240000_php_per_account        (ALTER TYPE ADD VALUE PHP_APPLY)
20260616260000_ticket_topic_canned
20260616280000_app_install            (ALTER TYPE ADD VALUE APP_INSTALL)
20260616300000_addons
```

Uwaga do enumów: `PHP_APPLY` i `APP_INSTALL` dodawane przez `ALTER TYPE ADD VALUE`
i **nie są używane w tej samej migracji** (bezpieczne na PostgreSQL 12+).

## Zmienne środowiskowe (API)

| Zmienna | Funkcja | Skutek braku |
|---|---|---|
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGINS`, `WEBAUTHN_RP_NAME` | Passkey | **Przycisk passkey ukryty, logowanie passkey nie działa** (najczęstsza przyczyna „error przy passkey") |
| `REQUIRE_PASSKEY_FOR_STAFF=1` | Wymuszenie passkey admin/staff | brak wymuszenia (ustaw po enrollmencie) |
| `WEBMAIL_URL` | Webmail Roundcube (P-1) | brak przycisku „Otwórz webmail" |
| `HETZNER_API_TOKEN` | VPS/Cloud | sprzedaż VPS nieczynna |
| `OPENPROVIDER_*` | Rejestracja domen (O-3) | rejestracja w checkoucie nieczynna |
| `STRIPE_SECRET_KEY` (sk_live_), `STRIPE_WEBHOOK_SECRET` | Płatności | karty/aktywacje nie działają |
| `SMTP_*` + SPF/DKIM/DMARC | Maile transakcyjne, deflekcja | onboarding zablokowany |

Ustawienia platformy (panel admina): `php.availableVersions`, `mail.webmailUrl`,
dane firmy + KSeF. Plik na węźle: `/etc/verris-backup.conf` (offsite),
`VERRIS_DOVECOT_MASTER_USER/PASS` (migracja IMAP).

## Smoke per funkcja (po deployu)

- **Passkey:** panel admina → „Gotowość do startu LIVE" pokazuje „Passkey (WebAuthn RP) OK". Na loginie przycisk passkey jest **pod** formularzem; klik otwiera systemowy dialog. Gdy RP nieustawione — przycisk jest ukryty (zamiast błędu).
- **Free trial (O-1):** plan z `trialDays>0` → „Wypróbuj za darmo" → konto staje się ACTIVE; „Przekształć na płatną" pobiera z portfela.
- **Domena w checkout (O-3):** tryb „Zarejestruj nową domenę" → rejestracja + hosting w jednym.
- **E-mail produkt (P-1b):** plan `productKind=EMAIL` widoczny w zakładce „Poczta e-mail" w zamawianiu.
- **Backup offsite (B-1):** `node-offsite-backup.sh run` → w panelu readiness „backup OK”.
- **VPS:** admin tworzy plan (auto-specy z Hetznera) → klient zamawia (hasło root lub klucz SSH) → start/stop/restart/usuń; scheduler odnowień.
- **PHP (P-6):** zakładka „Wersja PHP" → zmiana → task PHP_APPLY → `phpAppliedAt`.
- **Aplikacje 1-click (P-3):** zakładka „Aplikacje 1-click" → Nextcloud/PrestaShop na pustym katalogu domeny.
- **Wsparcie (SUP-1/2/4/5):** formularz zgłoszenia ma temat + podpowiedzi KB; po zamknięciu CSAT; SLA widoczne; staff wstawia szablony; admin zarządza szablonami.
- **Dodatki (P-8):** zakładka „Dodatki" → kup z portfela; „priorytetowe wsparcie" podnosi priorytet kolejnych ticketów; „konfiguracja przez specjalistę”/„dedykowane IP" tworzą zgłoszenie dla BOK.
- **Trust signals (O-5):** login/rejestracja pokazują realne liczby (gdy >0).
- **Pulpit:** „Pierwsze kroki" (O-4) + „Rzeczy do zrobienia" (SUP-3).

## Naprawione w tej sesji (jakość)

- **Passkey, panel admina:** przycisk passkey przeniesiony **pod** formularz (był obok — błąd układu flex).
- **Passkey (klient + admin):** przycisk **ukrywany**, gdy serwer nie ma RP (zamiast pokazywać błąd); pełne komunikaty błędów (NotAllowed/Abort/InvalidState/raw message); odświeżenie sesji po sukcesie.
- **VPS (panel klienta):** naprawiony crash renderowania nagłówka (`PanelPageHeader` dostawał komponent zamiast węzła React).
- **Plan DTO:** `UpdatePlanDto` uzupełniony o `productKind`/`supportSlaHours`/`trialDays` — bez tego edycja tych pól była po cichu ignorowana.

## Status build/test

- Wszystkie nowe pliki API przechodzą `tsc` (poza odwołaniami do nowych pól Prisma — znikają po `db:generate`).
- Wszystkie skrypty `ops/` przechodzą `bash -n`.
- Wszystkie nowe moduły zarejestrowane w `app.module.ts`; migracje uporządkowane chronologicznie.
