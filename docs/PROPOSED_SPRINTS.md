# Proponowane sprinty — stan na 2026-05-22

> **Status tasków (otwarte / done / w toku):** [`HOSTING_LAUNCH_TASKS.md`](./HOSTING_LAUNCH_TASKS.md) — **źródło prawdy**. Ten plik = kontekst sprintów.  
> Prod HEAD: `0f8e6ca` · Deploy: `ops/scripts/prod-deploy-release.sh` · SSH: `docs/ops/CURSOR_DEPLOY_SSH.md`

---

## Ukończone w ostatnich iteracjach ✅

| Obszar | Co |
|--------|-----|
| IAM (część R-12) | Guard API, nav, middleware, ustawienia subkonta, edycja uprawnień |
| Backup | Postgres → MinIO `verris-backups/postgres/`, cron, restore `--from-minio` |
| Grafana | Metryki backupu, dashboard **Storage & backupy**, alert `VerrisPostgresBackupStale` |
| Panele | Link Grafana w **admin** i **staff** (staff po `canAccessGrafana`) |
| IAM-F.4–5 | Presety ról, audyt IAM w panelu właściciela |
| Sprint W (część) | Badge refresh po Stripe, skeleton, impersonacja, mail auto-topup fail |
| Sprint 0.3 (część) | Uptime badge + restore preview w **Usage** usługi |
| Sprint A/B (kod) | Testy krytyczne, audyt paneli |

---

## Kolejność sprintów (rekomendacja)

```mermaid
flowchart TB
  subgraph done [Zrobione]
    B[Sprint B audyt]
    IAM[IAM częściowy]
    MINIO[Backup MinIO]
    GRAF[Grafana link + metryki]
  end
  subgraph next [Następne 2–3 tyg.]
    IAMF[IAM-F domknięcie]
    COPS[Sprint C-ops]
    LEG[Sprint D prawne]
    SMK[Sprint 0-ops smoke]
  end
  subgraph later [Po GO / decyzji scope]
    W[Wallet polish W-03]
    E[Sprint E opcjonalne]
  end
  done --> IAMF
  done --> COPS
  IAMF --> SMK
  COPS --> SMK
  LEG --> SMK
  SMK --> later
```

---

## Sprint IAM-F — domknięcie R-12 (3–5 dni)

Źródło: [`IAM_LIVE_FOLLOWUP.md`](./IAM_LIVE_FOLLOWUP.md)

| ID | Task | DONE |
|----|------|------|
| IAM-F.1 | Middleware + nav + guard API | ✅ |
| IAM-F.2 | Ustawienia subkonta (bez faktury / quick links) | ✅ |
| IAM-F.3 | **Smoke prod**: invite → accept → login → menu + API | ⏳ [`IAM_SMOKE_PROD.md`](./IAM_SMOKE_PROD.md) |
| IAM-F.4 | Presety ról w UI zaproszenia (support / billing / devops) | ✅ |
| IAM-F.5 | Podgląd audytu IAM w panelu właściciela | ✅ |
| IAM-F.6 | Testy integracyjne guard + `users/me` subaccount | częściowo ✅ |

**Kryterium DONE:** smoke udokumentowany + brak regresji na prod.

---

## Sprint C-ops — operacje (2–4 dni)

Źródło: [`SPRINT_C_OPS.md`](./SPRINT_C_OPS.md)

| ID | Task | Stan |
|----|------|------|
| C.1 | Cron backup → MinIO | ✅ cron zainstalowany |
| C.2 | Pierwszy dump w `verris-backups` | ✅ |
| C.3 | Grafana: panel backupu + alert | ✅ |
| C.4 | **Restore test** na staging, wpis w checklist | ⏳ [`ops/RESTORE_TEST.md`](./ops/RESTORE_TEST.md) |
| C.5 | Grafana **contact point** (Slack/email) | odłożone |
| C.6 | Mirror zewnętrzny `backup-mirror-external.sh` | ⏳ faza 2 |
| C.7 | `PROD_HEALTH_CHECKLIST.md` sekcje 1–12 | 🟡 snapshot + prune 2026-05-23 — dysk **66%** / 25 GB wolne; pełna lista: [`HOSTING_LAUNCH_TASKS.md`](./HOSTING_LAUNCH_TASKS.md) |

---

## Sprint D — prawne (1–2 tyg., blocker zewnętrzni klienci)

| Task | Opis |
|------|------|
| D.1 | Finalizacja `docs/legal/drafts/*` (firma, NIP, subprocessors) |
| D.2 | Lawyer review + publikacja w admin |
| D.3 | Re-consent smoke |
| D.4 | INCIDENT_RESPONSE / RODO kontakt | ✅ szkielet [`ops/INCIDENT_RESPONSE.md`](./ops/INCIDENT_RESPONSE.md) |

---

## Sprint 0-ops — smoke & GO (1–2 dni)

| Task | Opis |
|------|------|
| 0.1 | Pełny smoke LIVE_RELEASE_RUNBOOK | ⏳ [`SPRINT_0_OPS_SMOKE.md`](./SPRINT_0_OPS_SMOKE.md) |
| 0.2 | `GO_NO_GO_PROD.md` bez NO-GO |
| 0.3 | Uptime badge + restore preview (Hosting Manager → Usage) | ✅ |
| 0.4 | Zamknięcie Sprint A (code review runtime) |

---

## Sprint W — wallet polish (2–3 dni, P2)

| ID | Task | Stan |
|----|------|------|
| W-03a | Auto-refresh badge po Stripe success | ✅ |
| W-03b | Skeleton badge przy pierwszym ładowaniu | ✅ |
| W-03c | Dual PLN/K w staff/admin (faktury, CSV) | ✅ |
| W-03d | Mail przy fail auto-topup | ✅ |
| W-03e | Marker impersonacji na badge portfela | ✅ |

---

## Sprint E — po decyzji produktowej (P3)

PayU, rejestrator domen, AWStats, Softaculous, AI produkt — tylko jeśli w ofercie startowej ([`LIVE_PRODUCT_SCOPE_DECISION.md`](../LIVE_PRODUCT_SCOPE_DECISION.md)).

---

## Grafana — konfiguracja

| Element | Wartość |
|---------|---------|
| Dashboard główny (backup row) | `Control plane health` — uid `verris-control-plane` |
| Dashboard storage | **Storage & backupy (MinIO)** — uid `verris-ops-storage` |
| URL w panelach | `NEXT_PUBLIC_GRAFANA_URL` → `/d/verris-ops-storage/verris-ops-storage` |
| Staff dostęp | `canAccessGrafana` (Operatorzy → toggle w admin) |

Metryki Prometheus: `verris_backup_latest_age_seconds`, `verris_backup_present`, `verris_backup_latest_size_bytes`.

---

## Sugerowany następny krok (1 sprint)

**Master lista wszystkich otwartych tasków:** [`HOSTING_LAUNCH_TASKS.md`](./HOSTING_LAUNCH_TASKS.md)

1. **IAM-F.3 smoke** — [`IAM_SMOKE_PROD.md`](./IAM_SMOKE_PROD.md) (ręcznie na prod).
2. **C.4 restore test** — [`ops/RESTORE_TEST.md`](./ops/RESTORE_TEST.md) na staging.
3. **Sprint D** — finalizacja draftów + lawyer review.
4. **Sprint 0-ops** — pełny smoke + `GO_NO_GO_PROD.md`.

C.5 — na start **dominik@hvln.pl** (patrz tabela C-ops). Slack/Discord — później.

---

## Observability — rozszerzenie Grafana (follow-up)

Już w repo (folder `Verris`):

| UID | Dashboard |
|-----|-----------|
| `verris-control-plane` | Control plane health (API, kolejki, backup row) |
| `verris-compute-fleet` | Węzły compute |
| `verris-lve` | CloudLinux LVE |
| `verris-business` | Metryki biznesowe |
| `verris-ops-storage` | MinIO / backupy |

**Brakuje do „pełnego” monitoringu startu hostingu** (kolejne taski, nie blokują samego kodu):

| ID | Task | Opis |
|----|------|------|
| OBS-1 | `node_exporter` na control-plane | CPU/RAM/dysk hosta (obecnie głównie API + DB w Prometheus) |
| OBS-2 | Blackbox / syntetyka HTTP | `client.verris.pl`, `admin`, `staff`, `api` `/healthz` — dostępność paneli |
| OBS-3 | Dashboard **Host / Docker** | cAdvisor lub metryki kontenerów + `df` alert |
| OBS-4 | Dashboard **Postgres / Redis** | rozszerzenie exporterów (połączenia, slow queries) |
| OBS-5 | Dashboard **Caddy / TLS** | cert expiry, 5xx edge (jeśli metryki dostępne) |
| OBS-6 | Contact point + reguły | C.5: email dominik@hvln.pl + powiązanie z `alerts.yml` |
| OBS-7 | Cron `docker builder prune` | po deploy — utrzymanie dysku (build cache, nie backupy) |

---

## Powiązane dokumenty

- [`LIVE_READINESS_PLAN.md`](../LIVE_READINESS_PLAN.md)
- [`SPRINT_B_PANEL_AUDIT.md`](./SPRINT_B_PANEL_AUDIT.md)
- [`SPRINT_C_OPS.md`](./SPRINT_C_OPS.md)
- [`DEPLOY.md`](../DEPLOY.md) § Grafana, § Backup MinIO
