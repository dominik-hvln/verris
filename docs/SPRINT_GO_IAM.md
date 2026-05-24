# Sprint GO-IAM — smoke prod + zaproszenia (P0)

> **Backlog:** VER-11, IAM-2 · **Decyzja D-1** · **Czas:** 3–5 dni  
> **Źródło prawdy checklisty:** [`IAM_SMOKE_PROD.md`](./IAM_SMOKE_PROD.md)

## Cel

Potwierdzić na **produkcji**, że subkonta IAM działą end-to-end (zaproszenie → akceptacja → menu → guard API) i że mail zaproszenia wychodzi jako **Verris** &lt;panel@verris.pl&gt;.

## Zakres

| # | Task | Wykonawca | DONE |
|---|------|-----------|------|
| 1 | Smoke 8 kroków z `IAM_SMOKE_PROD.md` | Dominik | ⏳ |
| 2 | `GET /services` → 403 dla subkonta bez SERVICES_READ | Dominik / curl | ⏳ |
| 3 | Mail zaproszenia: From + DKIM OK | Agent (infra ✅) | ✅ |
| 4 | Poprawki regresji po smoke | Agent | ⏳ |
| 5 | Wpis w `HOSTING_LAUNCH_TASKS`: VER-11 ✅ | Agent | ⏳ |

## Poza zakresem

- Nowe presety ról (już ✅ IAM-F.4)
- Hosting email klientów (DirectAdmin)

## Kryterium DONE

- [ ] Tabela smoke: **PASS** + data
- [ ] Właściciel: pełne menu bez regresji
- [ ] VER-11 → ✅ w master backlogu

## Następny sprint

[**GO-OPS**](./SPRINT_GO_OPS.md) — restore staging + smoke operacyjny.
