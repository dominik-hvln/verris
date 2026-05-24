# Hosting LIVE — master backlog (źródło prawdy)

> **Ten plik = jedyna lista** do śledzenia: co zrobione, w toku, pomysły, nowe funkcje.  
> **Ostatnia aktualizacja:** 2026-05-23 · prod **`441e279`** · właściciel backlogu: agent + Dominik  
> **Zasada GO:** [LIVE_PRODUCT_SCOPE_DECISION.md](../LIVE_PRODUCT_SCOPE_DECISION.md)

---

## Decyzje produktowe (zamknięte 2026-05-23)

| ID | Decyzja | Wpływ |
|----|---------|-------|
| **D-1** | **Subkonta IAM od startu** oferty | VER-11 / IAM smoke = **P0-BLK**; Regulamin §5a |
| **D-2** | Płatności: **tylko Stripe** (+ portfel K) | PayU/E-1 = P2, ukryte; Regulamin §7 |
| **D-3** | **Staging jest** — restore test tam (OPS-2) | Nie restore na prod z klientami |
| **D-4** | Agent przygotowuje drafty → Ty → prawnik → wgranie review | LEG-1 🔄, LEG-2 ⏸️ do prawnika |
| **D-5** | Alerty: **dominik@hvln.pl**; Slack przygotowany, włączyć później | [GRAFANA_ALERTING.md](./ops/GRAFANA_ALERTING.md) |

---

## Jak pracujemy z tym plikiem

| Status | Znaczenie |
|--------|-----------|
| ⏳ | Nie rozpoczęte |
| 🔄 | W toku |
| 🟡 | Częściowo |
| ✅ | Done (data + dowód w Uwagi) |
| ⏸️ | Wstrzymane (np. czeka na prawnika) |
| 💡 | Pomysł / backlog |

**Changelog:** … · **MAIL-3** Postfix LIVE na prod + UFW Docker→25 (2026-05-23) · **MAIL-1** admin SMTP + Postfix doc (2026-05-23)

---

## Bieżący plan prac (agent)

| Krok | ID | Opis | Status |
|------|-----|------|--------|
| 1 | LEG-1 | Drafty prawne 0.2 do prawnika | 🔄 | `docs/legal/drafts/*` |
| 2 | OPS-3 | Grafana e-mail + doc Slack | 🔄 | [GRAFANA_ALERTING.md](./ops/GRAFANA_ALERTING.md) |
| 3 | VER-11 | IAM smoke prod (P0 — D-1) | ⏳ | [IAM_SMOKE_PROD.md](./IAM_SMOKE_PROD.md) |
| 4 | OPS-5, HOST-*, BILL-* | Smoke E2E prod | ⏳ | |
| 5 | MAIL-1, MAIL-3 | Postfix + admin SMTP + SPF/DKIM | 🔄 | DNS w OVH: [OVH_DNS_VERRIS_PL.md](./ops/OVH_DNS_VERRIS_PL.md) |
| 6 | OPS-2 | Restore test **staging** | ⏳ | D-3 |
| 7 | LEG-2, LEG-3 | Review prawnika → publikacja | ⏸️ | Ty → prawnik |
| 8 | OPS-1, OPS-4 | Checklisty → GO | ⏳ | |
| 9 | OBS-1…5 | Grafana rozszerzenie | 💡 | po GO technicznym |

---

## P0-BLK — blokuje start hostingu

### Infrastruktura

| ID | Task | Status | Uwagi |
|----|------|--------|-------|
| INF-1 | Dysk root w progach | ✅ | 2026-05-23: 18% użycia, 60 GB wolne |
| INF-2 | Prune cache po deploy | ✅ | `prod-deploy-release.sh` |

### IAM (P0 — D-1)

| ID | Task | Status | Uwagi |
|----|------|--------|-------|
| VER-11 | Smoke prod IAM | ⏳ | Invite → accept → menu → API guard |
| IAM-2 | E-mail zaproszenia IAM | ⏳ | Część smoke |

### Operacje i GO

| ID | Task | Status | Uwagi |
|----|------|--------|-------|
| OPS-1 | PROD_HEALTH §1–12 bez ❌ | 🟡 | Dysk ✅ |
| OPS-2 | Restore test staging | ⏳ | dominik@hvln.pl |
| OPS-3 | Grafana → dominik@hvln.pl | 🟡 | Provisioning + GF_SMTP na prod; **Test** w UI → ✅ |
| OPS-4 | GO_NO_GO odhaczone | ⏳ | |
| OPS-5 | Smoke SPRINT_0_OPS | ⏳ | |
| OPS-6 | PROD_HEALTH §12 | ⏳ | |

### HOST / BILL / LEG / MAIL

| ID | Task | Status | Uwagi |
|----|------|--------|-------|
| HOST-1…4 | Węzeł + DA + provisioning + operacja DA | ⏳ | Smoke |
| BILL-1…2 | Stripe live + smoke billing | ⏳ | Tylko Stripe (D-2) |
| LEG-1 | Drafty 0.2 | 🔄 | IAM, Stripe, subprocessors |
| LEG-2 | Lawyer review | ⏸️ | Gotowce → Ty → prawnik |
| LEG-3 | Publikacja admin | ⏳ | Po LEG-2 |
| LEG-4 | Re-consent smoke | ⏳ | |
| LEG-5…6 | Brak TODO, subprocessors | ⏳ | |
| MAIL-1 | SMTP: Postfix lokalny + opcjonalny relay w admin | ✅ | `441e279` — admin **Ustawienia → Poczta (SMTP)** |
| MAIL-2 | Min. maile LIVE (audyt triggerów) | 🟡 | Postfix OK; test z admina po zalogowaniu |
| MAIL-3 | Postfix na hoście + SPF/DKIM/DMARC | 🟡 | DNS/MX ✅; DKIM naprawiony 2026-05-24; deliverability: [MAIL_DELIVERABILITY.md](./ops/MAIL_DELIVERABILITY.md) |
| MAIL-4 | Poczta zespołu @verris.pl (pełny zakres) | ⏳ | Spec: [MAIL-4_CONTROL_PLANE_MAIL.md](./ops/MAIL-4_CONTROL_PLANE_MAIL.md) |

---

## P0-VER — weryfikacja prod

| ID | Task | Status |
|----|------|--------|
| VER-1…3, VER-5…10, VER-12 | `.env`, migracje, DNS, Grafana SSO, backup, testy CI, linki UI | ⏳ / 🟡 |
| VER-4 | healthz + readyz | 🟡 |

---

## P1 / P2 / 💡

| ID | Task | Status | Uwagi |
|----|------|--------|-------|
| OBS-1…5 | Grafana host/blackbox/DB | 💡 | |
| BAK-1 | Mirror backup zewn. | 💡 | Faza 2 |
| BAK-2 | Slack alerty | ⏸️ | D-5 — doc w GRAFANA_ALERTING |
| E-1 | PayU/BLIK | 💡 | **Poza startem** (D-2) |
| E-2…6, PROD-* | Sprint E, BullMQ, AI, EKO | 💡 | |

---

## Pomysły (backlog 💡)

| ID | Pomysł |
|----|--------|
| IDEA-1 | Dashboard syntetyka paneli HTTP |
| IDEA-2 | Cotygodniowy health snapshot → mail |
| IDEA-3 | Auto-wpis PROD_HEALTH po deploy |

---

## Zamknięte (skrót)

Backup MinIO, Grafana SSO, IAM presety/audyt, Sprint W, W-03c, 0.3 UI, testy A, audyt B, INF-1, INF-2.

---

## Indeks źródeł

`LIVE_READINESS_PLAN`, `GO_NO_GO_PROD`, `PROD_HEALTH_CHECKLIST`, `LIVE_RELEASE_RUNBOOK`, `PROPOSED_SPRINTS`, `SPRINT_*`, `PROJECT_STATUS`, `DEPLOY`, `IAM_*`, `legal/drafts/`.
