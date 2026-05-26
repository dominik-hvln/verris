# BOK (tickety) — smoke E2E

## Automatyczny (API)

Na serwerze (opcjonalnie z kontem testowym klienta):

```bash
export SMOKE_CLIENT_EMAIL='klient@example.com'
export SMOKE_CLIENT_PASSWORD='...'
cd /opt/verris && bash ops/scripts/prod-smoke-grafana-bok.sh
```

Skrypt: login → `POST /tickets` → `POST /tickets/:id/replies`.

## Ręczny E2E (panel)

| Krok | Kto | Akcja | OK |
|------|-----|-------|-----|
| 1 | Klient | panel.verris.pl → Wsparcie → nowe zgłoszenie + załącznik opcjonalny | |
| 2 | Klient | Mail `TICKET_NEW` (branded) | |
| 3 | Staff | staff.verris.pl → ticket widoczny, odpowiedź | |
| 4 | Staff | Mail do klienta (odpowiedź) | |
| 5 | Staff | zmiana statusu → klient dostaje `TICKET_STATUS_CHANGED` | |
| 6 | Admin | eskalacja / runbook (opcjonalnie) | |

## Weryfikacja maili

```bash
journalctl -u postfix -f
# lub logi API: docker compose logs api --tail 50 | grep -i mail
```

From nadawcy: `support@verris.pl` (`fromRole: SUPPORT`) dla klienta; wewnętrzne powiadomienia staff — `NOREPLY`.

Powiązane: [`docs/mail/AUDIT.md`](../mail/AUDIT.md), `SPRINT_0_OPS_SMOKE.md` pkt 6.
