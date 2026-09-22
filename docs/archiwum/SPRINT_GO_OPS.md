# Sprint GO-OPS — operacje i GO checklist (P0)

> **Backlog:** OPS-2, OPS-3, OPS-5, OPS-1, OPS-4, OPS-6 · **Czas:** 3–5 dni  
> **Poprzedza:** [GO-IAM](./SPRINT_GO_IAM.md)

## Cel

Operacyjna gotowość do startu hostingu: backup odtwarzalny (drill na pre-LIVE serwerze), alerty, pełny smoke runbook, odhaczenie GO/PROD_HEALTH.

## Zakres

| # | Task | Dokument | DONE |
|---|------|----------|------|
| 1 | Restore drill (baza `verris_restore_drill`) | [`ops/RESTORE_TEST.md`](./ops/RESTORE_TEST.md) | ✅ 2026-05-24 |
| 2 | Grafana: test contact point `verris-ops-email` | [`ops/GRAFANA_ALERTING.md`](./ops/GRAFANA_ALERTING.md) | ✅ 2026-05-24 |
| 3 | Smoke `SPRINT_0_OPS` + `LIVE_RELEASE_RUNBOOK` | [`SPRINT_0_OPS_SMOKE.md`](./SPRINT_0_OPS_SMOKE.md) | ⏸️ po pierwszym węźle compute |
| 4 | `PROD_HEALTH_CHECKLIST.md` §1–12 | — | 🟡 |
| 5 | `GO_NO_GO_PROD.md` bez NO-GO | — | ⏳ |
| 6 | Wpis wyniku restore + smoke do `HOSTING_LAUNCH_TASKS` | — | ⏳ |

## Poza zakresem

- Mirror backup zewnętrzny (BAK-1, faza 2)
- Slack alerty (D-5, później)

## Kryterium DONE

- [x] OPS-2 ✅ (2026-05-24, `latest.sql.gz`, users=3, drill OK na pre-LIVE serwerze)
- [x] OPS-3 ✅ (test mail alertu odebrany, 2026-05-24)
- [ ] OPS-5 + OPS-4 ✅
- [ ] Brak otwartych **P0-BLK** w sekcji Operacje

## Następne sprinty (równolegle po starcie GO-OPS)

- [GO-HOST](./PROPOSED_SPRINTS.md#plan-sprintów-od-2026-05-24) — hosting smoke  
- [GO-BILL](./PROPOSED_SPRINTS.md) — Stripe live  
- [MAIL-TX](./SPRINT_MAIL_TX.md) — maile transakcyjne
