# Sprint 0-ops — skrócony smoke przed GO

> Pełna procedura: [`LIVE_RELEASE_RUNBOOK.md`](../LIVE_RELEASE_RUNBOOK.md).  
> Decyzja GO/NO-GO: [`GO_NO_GO_PROD.md`](../GO_NO_GO_PROD.md).

## Checklist (odhacz po wykonaniu)

| # | Obszar | Test | OK |
|---|--------|------|-----|
| 1 | Auth | Login admin / staff / klient | 🟡 |
| 2 | Zakup | Nowa subskrypcja + Stripe webhook | ⏸️ po węźle |
| 3 | DA | Provisioning konta + jedna operacja (DNS lub SSL) | ⏸️ po węźle |
| 4 | Billing | Faktura widoczna w panelu klienta | ⏸️ po węźle |
| 5 | Portfel | Doładowanie Stripe → saldo w topbarze | ✅ 2026-05-24 |
| 6 | BOK | Ticket + odpowiedź staff + załącznik | |
| 7 | IAM | [`IAM_SMOKE_PROD.md`](./IAM_SMOKE_PROD.md) | ✅ 2026-05-24 |
| 8 | Backup | `ops/scripts/prod-health-snapshot.sh` + wiek backupu < 25 h | ✅ 2026-05-24 |
| 9 | Grafana | Link z admin/staff → dashboard (SSO) | 🟡 |
| 10 | Status | `status.verris.pl` probes OK | 🟡 |

## Metryki operacyjne

```bash
cd /opt/verris && bash ops/scripts/prod-health-snapshot.sh
```

Wynik wklej do [`PROD_HEALTH_CHECKLIST.md`](../PROD_HEALTH_CHECKLIST.md).

## Restore (tryb A — pre-LIVE, bez dotykania `verris_db`)

[`ops/RESTORE_TEST.md`](./ops/RESTORE_TEST.md) — **2026-05-24:** drill OK (`latest.sql.gz`, users=3).

**Data smoke:** 2026-05-24 (częściowy, bez węzła)  
**Wynik:** W toku — portfel ✅ · IAM ✅ · backup ✅ · pozostałe: auth, BOK, Grafana, status
