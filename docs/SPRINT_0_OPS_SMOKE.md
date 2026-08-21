# Sprint 0-ops — skrócony smoke przed GO

> Pełna procedura: [`LIVE_RELEASE_RUNBOOK.md`](../LIVE_RELEASE_RUNBOOK.md).  
> Decyzja GO/NO-GO: [`GO_NO_GO_PROD.md`](../GO_NO_GO_PROD.md).

## Checklist (odhacz po wykonaniu)

| # | Obszar | Test | OK |
|---|--------|------|-----|
| 1 | Auth | Login + rejestracja (verify link) + reset hasła | ✅ verify/admin-delete 2026-05-24 · pełny login 3 ról 🟡 |
| 2 | Zakup | Nowa subskrypcja + Stripe webhook | ⏸️ po węźle |
| 3 | DA | Provisioning konta + jedna operacja (DNS lub SSL) | ⏸️ po węźle |
| 4 | Billing | Faktura widoczna w panelu klienta | ⏸️ po węźle |
| 5 | Portfel | Doładowanie Stripe → saldo w topbarze | ✅ 2026-05-24 |
| 6 | BOK | Ticket + odpowiedź staff + załącznik | 🟡 [`BOK_TICKET_SMOKE.md`](./ops/BOK_TICKET_SMOKE.md) + skrypt |
| 7 | IAM | Flow + mail zaproszenia ([`IAM_SMOKE_PROD.md`](./IAM_SMOKE_PROD.md)) | ✅ 2026-05-24 (invite mail PASS) |
| 8 | Backup | `ops/scripts/prod-health-snapshot.sh` + wiek backupu < 25 h | ✅ 2026-05-26 (03:17 UTC) |
| 9 | Grafana | Link z admin/staff → dashboard (SSO) | 🟡 auto OK (`prod-smoke-grafana-bok.sh`); ręczny login w Grafanie do odhaczenia |
| 10 | Status | `status.verris.pl` probes OK | ✅ 2026-05-26 HTTP 200 |

## Metryki operacyjne

```bash
cd /opt/verris && bash ops/scripts/prod-health-snapshot.sh
```

Wynik wklej do [`PROD_HEALTH_CHECKLIST.md`](../PROD_HEALTH_CHECKLIST.md).

## Restore (tryb A — pre-LIVE, bez dotykania `verris_db`)

[`ops/RESTORE_TEST.md`](./ops/RESTORE_TEST.md) — **2026-05-24:** drill OK (`latest.sql.gz`, users=3).

**Data smoke:** 2026-05-26 (bez węzła, GO-OPS)  
**Wynik:** portfel ✅ · IAM ✅ · backup ✅ · status ✅ · metryki API HTTP w Grafanie ✅ · smoke skrypt `prod-smoke-grafana-bok.sh` · BOK/Grafana SSO ręcznie do odhaczenia
