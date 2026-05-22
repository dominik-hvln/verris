# Procedura reagowania na incydenty i naruszenia RODO

> Sprint D.4 — dokument operacyjny LIVE. Uzupełnij numery telefonów on-call przed pierwszym klientem zewnętrznym.

## Kontakty

| Rola | Kanał |
|------|--------|
| Incydenty bezpieczeństwa / RODO | `iod@hvln.pl` |
| Operator on-call (wewn.) | _uzupełnij_ |
| PUODO | https://uodo.gov.pl/ |

Publiczny kontakt dla klientów: `kontakt@hvln.pl` (patrz polityka prywatności).

## Klasyfikacja

| Poziom | Przykłady | SLA reakcji |
|--------|-----------|-------------|
| **P1** | Niedostępność API/paneli, wyciek danych, kompromitacja kluczy | < 15 min ack, mitigacja < 4 h |
| **P2** | Pojedynczy węzeł DA, opóźnienia provisioning, backup > 25 h | < 1 h ack |
| **P3** | Błąd UI, ticket bez SLA, alert niekrytyczny | następny dzień roboczy |

## Kroki P1 (skrót)

1. Potwierdź zakres (status page, Grafana, `docker compose ps`, logi API).
2. Komunikat na status.verris.pl (admin → Status Page).
3. Izolacja: wyłącz komponent jeśli atak (Caddy, węzeł, klucz API).
4. Rotacja sekretów jeśli podejrzenie wycieku (`JWT_SECRET`, `APP_KMS_KEY`, Stripe webhook, MinIO).
5. Backup: ostatni obiekt `verris-backups/postgres/latest.sql.gz` — nie restore na prod bez okna.
6. Po stabilizacji: wpis post-mortem (data, przyczyna, czas MTTR, działania zapobiegawcze).

## Naruszenie ochrony danych (RODO art. 33–34)

1. Ustal: co wyciekło, ilu osób, czy wysokie ryzyko dla praw osób.
2. **PUODO — 72 h** od stwierdzenia (jeśli wymagane zgłoszenie).
3. Powiadomienie osób, których dane dotyczą — gdy wysokie ryzyko (e-mail + wpis w panelu jeśli dotyczy).
4. Audyt: `SecurityAlert`, logi dostępu, `AuditLog` — zachowaj dowody.

## Powiązane

- [`PROD_HEALTH_CHECKLIST.md`](../../PROD_HEALTH_CHECKLIST.md)
- [`RESTORE_TEST.md`](./RESTORE_TEST.md)
- [`docs/legal/drafts/privacy.md`](../legal/drafts/privacy.md) § administrator
