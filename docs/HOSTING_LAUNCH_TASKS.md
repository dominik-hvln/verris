# Hosting LIVE — master backlog (źródło prawdy)

> **Ten plik = jedyna lista** do śledzenia: co zrobione, w toku, pomysły, nowe funkcje.  
> **Ostatnia aktualizacja:** 2026-05-24 · prod **`0c29aa0`** · właściciel backlogu: agent + Dominik  
> **Zasada GO:** [LIVE_PRODUCT_SCOPE_DECISION.md](../LIVE_PRODUCT_SCOPE_DECISION.md)

---

## Decyzje produktowe (zamknięte 2026-05-23)

| ID | Decyzja | Wpływ |
|----|---------|-------|
| **D-1** | **Subkonta IAM od startu** oferty | VER-11 / IAM smoke = **P0-BLK**; Regulamin §5a |
| **D-2** | Płatności: **tylko Stripe** (+ portfel K) | PayU/E-1 = P2, ukryte; Regulamin §7 |
| **D-3** | **Jeden serwer pre-LIVE** (brak staging) — restore drill izolowany; pełny restore przed resetem LIVE | [`RESTORE_TEST.md`](./ops/RESTORE_TEST.md) tryb A/B |
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

**Changelog:** … · **MAIL-TX** auth mail + reset + deploy `c667d77` (2026-05-24) · **OPS-3** Grafana OK · **OPS-2** restore drill OK · **MAIL-3** 10/10

---

## Plan sprintów (od 2026-05-24)

> Szczegóły sprintów: [`PROPOSED_SPRINTS.md`](./PROPOSED_SPRINTS.md). Każdy merge = gotowy do LIVE w swoim zakresie.

| Sprint | Czas (szac.) | ID backlogu | Cel |
|--------|----------------|-------------|-----|
| **GO-IAM** | 3–5 d | VER-11, IAM-2 | Smoke subkont IAM na prod + mail zaproszenia |
| **GO-OPS** | 3–5 d | OPS-2, OPS-3, OPS-5, OPS-1, OPS-4 | Restore staging, alerty Grafana, smoke ops, GO checklist |
| **GO-HOST** | 5–7 d | HOST-1…4 | Węzeł compute, DA, provisioning, smoke operacji |
| **GO-BILL** | 3–5 d | BILL-1…2 | Stripe **Sandbox** (testy) → live przed GO z klientami |
| **MAIL-TX** | 7–10 d | MAIL-2 | Maile transakcyjne LIVE ([`mail/AUDIT.md`](./mail/AUDIT.md) — auth, billing, IAM) |
| **MAIL-4a** | 5–7 d | MAIL-4 | Postfix virtual + Dovecot + UFW inbound |
| **MAIL-4b** | 5–7 d | MAIL-4 | Admin CRUD skrzynki + adresy systemowe |
| **MAIL-4c** | 5–7 d | MAIL-4 | Staff webmail + IMAP |
| **MAIL-4d** | 3–5 d | MAIL-4 | Aliasy, forwardy, import OVH, Rspamd |
| **LEG-D** | równolegle | LEG-1…6 | Drafty → prawnik → publikacja → re-consent |
| **OBS+** | po GO | OBS-1…5 | node_exporter, blackbox, host/docker — nie blokuje GO |

```mermaid
flowchart LR
  subgraph wave1 [Fala 1 — blokery GO]
    IAM[GO-IAM]
    OPS[GO-OPS]
  end
  subgraph wave2 [Fala 2 — produkt]
    HOST[GO-HOST]
    BILL[GO-BILL]
    MTX[MAIL-TX]
  end
  subgraph wave3 [Fala 3 — poczta zespołu]
    M4a[MAIL-4a]
    M4b[MAIL-4b]
    M4c[MAIL-4c]
    M4d[MAIL-4d]
  end
  LEG[LEG-D]
  IAM --> OPS
  OPS --> HOST
  OPS --> BILL
  HOST --> MTX
  BILL --> MTX
  MTX --> M4a --> M4b --> M4c --> M4d
  LEG -.-> OPS
```

**Teraz:** fala **bez węzła** (sekcja poniżej) · po licencjach: **GO-HOST** + OPS-5.

---

## Praca bez węzła (do czasu pierwszego compute)

> Wszystko śledzimy **tylko w tym pliku** — bez osobnych sprint-doców.

| Sprint / obszar | Wymaga węzła? | Status | Następny krok |
|-----------------|---------------|--------|----------------|
| GO-IAM | Nie | ✅ | — |
| GO-OPS (core) | Nie | ✅ | OPS-2, OPS-3 |
| GO-OPS (reszta) | Częściowo | 🔄 | OPS-1, OPS-4, OPS-6 — checklisty |
| **MAIL-TX** / MAIL-2 | Nie | 🔄 | Deploy auth mail + smoke reset/top-up |
| **GO-BILL** / BILL-1…2 | Nie | ✅ | Sandbox smoke OK; live keys przed GO (#6) |
| **LEG-D** | Nie | 🔄 / ⏸️ | Drafty → prawnik |
| MAIL-4 | Nie (control-plane) | ⏳ | Po MAIL-TX |
| GO-HOST | **Tak** | ⏸️ | Po licencjach |
| OPS-5 pełny | **Tak** | ⏸️ | Po węźle |

### GO-BILL — Stripe Sandbox (testy na pre-LIVE)

| # | Task | OK |
|---|------|-----|
| 1 | W Stripe Dashboard: tryb **Test**; `sk_test_…` + `whsec_…` w `.env.prod` | ✅ 2026-05-24 (w kontenerze `api`) |
| 2 | Webhook: `https://api.verris.pl/billing/stripe/webhook` — zdarzenia: `checkout.session.completed`, `invoice.*`, `customer.subscription.*`, `payment_intent.*` | ✅ (checkout smoke top-up) |
| 3 | `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` → panel klienta | ✅ |
| 4 | Plany: auto-sync Product + Prices w Stripe (admin zapis / „Synchronizuj”) | ✅ smoke 2026-05-24 |
| 5 | Smoke: top-up testową kartą → saldo + mail `wallet.topup-ok` + webhook 200 w Stripe | ✅ smoke 2026-05-24 |
| 6 | Przed GO z klientami zewnętrznymi: zamiana na **live** keys (BILL-1 domknięcie) | |

Deploy po zmianie env: `DEPLOY_SERVICES=api ./ops/scripts/prod-deploy-release.sh` (+ migrate jeśli schema).

### MAIL-TX — stan kodu (2026-05-24)

| Obszar | Status kodu |
|--------|-------------|
| Welcome, reset hasła, top-up / auto-topup maile | ✅ top-up smoke · welcome/reset — smoke poniżej |
| Billing/subscription/legal/2FA/login-alert | ✅ już w kodzie (audyt `mail/AUDIT.md` był nieaktualny) |
| IAM invite branded, ticket replies branded | ✅ deploy `c667d77`+ |
| Email verify przy rejestracji | ⏳ follow-up (faza 2 MAIL-TX) |

**Smoke MAIL (~5 min, bez węzła):**

1. **Welcome** — nowe konto testowe (inny email) → mail powitalny na skrzynkę.
2. **Reset** — `/forgot-password` → link w mailu → `/reset-password` → nowe hasło → login.
3. (Opcjonalnie) **IAM invite** — zaproszenie subkonta z panelu właściciela → mail z linkiem.

Po PASS odhacz **MAIL-2** w tabeli P0.

### Smoke bez węzła (`SPRINT_0_OPS_SMOKE.md`)

Teraz: pkt **1, 6–10** (auth, IAM, BOK, backup, Grafana, status). Po węźle: **2–5** (subskrypcja + DA).

### Kryterium „bez węzła done”

- MAIL-2 P0 w audycie = DZIAŁA (bez maili provisioning/hosting)
- BILL-2 smoke Sandbox udokumentowany ✅ 2026-05-24
- LEG-1 gotowe do prawnika
- OPS-1/4/6 bez ❌ poza sekcją węzłów

---

## Bieżący plan prac (agent)

| Krok | ID | Opis | Status |
|------|-----|------|--------|
| 1 | GO-IAM | VER-11 + IAM-2 | ✅ | Smoke 2026-05-24 PASS |
| 2 | GO-OPS | Restore drill, alerty, smoke, GO | 🔄 | OPS-2 ✅ · OPS-3 ✅ 2026-05-24; OPS-5 po węźle |
| 3 | Bez węzła | MAIL-TX + GO-BILL (Sandbox) + LEG-D + OPS checklist | 🔄 | Sekcja „Praca bez węzła” powyżej |
| 4 | GO-HOST | Węzeł + DA + provisioning | ⏸️ | Po licencjach |
| 5 | MAIL-4a…d | Poczta zespołu @verris.pl | ⏳ | [MAIL-4_CONTROL_PLANE_MAIL.md](./ops/MAIL-4_CONTROL_PLANE_MAIL.md) |
| 6 | LEG-D | Prawne | 🔄 / ⏸️ | Równolegle |
| 7 | OBS+ | Monitoring rozszerzony | 💡 | Po GO |

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
| VER-11 | Smoke prod IAM | ✅ | 2026-05-24 PASS — [`IAM_SMOKE_PROD.md`](./IAM_SMOKE_PROD.md) |
| IAM-2 | E-mail zaproszenia IAM | ✅ | Smoke: link + styl Verris |

### Operacje i GO

| ID | Task | Status | Uwagi |
|----|------|--------|-------|
| OPS-1 | PROD_HEALTH §1–12 bez ❌ | 🟡 | Snapshot 2026-05-24 · §1–2,7 ✅ · reszta 🟡 |
| OPS-2 | Restore test (MinIO → DB) | ✅ | 2026-05-24: `latest.sql.gz`, drill `verris_restore_drill`, users=3, prod DB nietknięty |
| OPS-3 | Grafana → dominik@hvln.pl | ✅ | 2026-05-24: `GF_SMTP_HOST=host.docker.internal:25`, test alertu + dostawa OK |
| OPS-4 | GO_NO_GO odhaczone | ⏳ | |
| OPS-5 | Smoke SPRINT_0_OPS | ⏸️ | Po podpięciu 1. węzła compute (DA/hosting) |
| OPS-6 | PROD_HEALTH §12 | ⏳ | |

### HOST / BILL / LEG / MAIL

| ID | Task | Status | Uwagi |
|----|------|--------|-------|
| HOST-1…4 | Węzeł + DA + provisioning + operacja DA | ⏳ | Smoke |
| BILL-1 | Stripe Sandbox skonfigurowany | ✅ | `sk_test_`, webhook, URL-e; live keys przed GO (#6) |
| BILL-2 | Smoke billing (Sandbox) | ✅ | 2026-05-24: top-up testowa karta, saldo + mail OK |
| LEG-1 | Drafty 0.2 | 🔄 | IAM, Stripe, subprocessors · pre-LIVE: `prod-legal-prelive-publish.sh` (rejestracja) |
| LEG-2 | Lawyer review | ⏸️ | Gotowce → Ty → prawnik |
| LEG-3 | Publikacja admin | ⏳ | Po LEG-2 |
| LEG-4 | Re-consent smoke | ⏳ | |
| LEG-5…6 | Brak TODO, subprocessors | ⏳ | |
| MAIL-1 | SMTP: Postfix lokalny + opcjonalny relay w admin | ✅ | `441e279` — **Ustawienia → Poczta (SMTP)** |
| MAIL-1b | Nadawca: nazwa „Verris” + adres From w admin | ✅ | `mail.fromName` / `mail.fromAddress` w `platform_settings`; prod: `panel@verris.pl` |
| MAIL-2 | Min. maile LIVE (audyt triggerów) | 🔄 | welcome, reset hasła, top-up mail — deploy 2026-05-24 |
| MAIL-3 | Postfix + SPF/DKIM/DMARC | ✅ | 2026-05-24: mail-tester **10/10**; [MAIL_DELIVERABILITY.md](./ops/MAIL_DELIVERABILITY.md) |
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
