# Sprint MAIL-TX — maile transakcyjne LIVE

> **Backlog:** MAIL-2 · **Czas:** 7–10 dni · **Zależność:** infrastruktura MAIL-3 ✅ (10/10 mail-tester)  
> **Audyt triggerów:** [`mail/AUDIT.md`](./mail/AUDIT.md)

## Cel

Każda ścieżka biznesowa wymagana na start hostingu wysyła branded mail z **Verris** &lt;panel@verris.pl&gt; (lub adresem systemowym z admin), zapis w `EmailLog`, bez luk z sekcji „Co NIE działa” w audycie.

## Fala 1 — P0-BLK (auth + billing)

| Kind | Trigger | Priorytet |
|------|---------|-----------|
| `EMAIL_VERIFY` | register / request verification | P0 |
| `PASSWORD_RESET_REQUEST` / `PASSWORD_RESET_DONE` | reset flow | P0 |
| `WELCOME` | po rejestracji | P0 |
| `WALLET_TOPUP_OK` | Stripe checkout completed | P0 |
| `WALLET_AUTOTOPUP_OK` / fail | payment intent | P0 |
| `INVOICE_ISSUED` / `INVOICE_PAID` / `INVOICE_PAYMENT_FAILED` | billing webhooks | P0 |
| `SUBSCRIPTION_SUSPENDED` / `SUBSCRIPTION_RENEWED` | subscriptions | P0 |
| IAM invite | subaccount invite | P0 (IAM-2) |

## Fala 2 — P1 (jakość LIVE)

| Kind | Trigger |
|------|---------|
| `LOGIN_FROM_NEW_IP` | login (preferences) |
| `2FA_ENABLED` / `2FA_DISABLED` | auth |
| Ticket templates | zamiana inline plaintext → branded shell |
| `BILLING_PERIOD_ENDING_7D` / `3D` | scheduler |
| Re-consent | legal publish |

## Implementacja (konwencje)

- Wszystkie przez `MailerService.send` + `renderEmailShell`
- `category: TRANSACTIONAL` lub `SECURITY` / `MARKETING` zgodnie z audytem
- Testy: unit template + e2e mock provider (jak billing auto-topup mail)
- Po merge: jeden mail testowy per nowy kind na staging/prod

## Poza zakresem

- Kampanie marketingowe masowe
- Skrzynki @verris.pl dla zespołu → sprint **MAIL-4**

## Kryterium DONE

- [x] Control-plane P0 (auth, billing wallet, IAM invite) — smoke prod 2026-05-24
- [x] MAIL-2 control-plane → ✅ w `HOSTING_LAUNCH_TASKS.md`
- [x] mail-tester `panel@verris.pl` — 10/10 (MAIL-3)
- [ ] Hosting maile (`SERVICE_*`, provisioning) — po **GO-HOST**

## Następny sprint

**MAIL-4a** — infrastruktura odbioru @verris.pl ([`ops/MAIL-4_CONTROL_PLANE_MAIL.md`](./ops/MAIL-4_CONTROL_PLANE_MAIL.md)).
