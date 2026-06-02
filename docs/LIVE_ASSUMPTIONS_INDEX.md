# LIVE Assumptions Index — inwentaryzacja korpusu dokumentacji

> **Cel:** jedno miejsce, w którym każdy plik `.md` i każdy tracker zadań w repo jest przypisany do warstwy (tier), z oceną czy jego założenia są spełnione, nieaktualne (STALE) czy świadomie odłożone (DEFER).
> **Data:** 2026-06-01 · Gałąź: `live-release-readiness` · HEAD: `efb43f7`
> **Metoda:** skan wszystkich `**/*.md` (59 plików) + grep `- [ ]`, `TODO`, `FIXME`, ID tasków (`HOST-`, `VER-`, `MAIL-`, `OPS-`, `LEG-`, `BILL-`, `R-`, `A‑`…`E‑`, `PC-`, `AS-`, `IAM-F`, `PR-`) + audyt kodu paneli/API.
> **Powiązane:** [LIVE_VERIFICATION_MATRIX.md](LIVE_VERIFICATION_MATRIX.md) (macierz P0), [LIVE_VERIFICATION_REPORT.md](LIVE_VERIFICATION_REPORT.md) (raport).

---

## Jak czytać statusy

| Status | Znaczenie |
|--------|-----------|
| **PASS** | Założenie spełnione i potwierdzone w kodzie/smoke. |
| **PARTIAL** | Częściowo zrobione; pozostały konkretny krok. |
| **STALE** | Dokument mówi „TODO/nie zaczęte", ale kod/smoke pokazuje inaczej — wymaga aktualizacji dokumentu. |
| **DEFER** | Świadomy follow-up / faza 2 (zgodny z [LIVE_PRODUCT_SCOPE_DECISION.md](../LIVE_PRODUCT_SCOPE_DECISION.md)). |
| **OPEN** | Realna luka do domknięcia przed GO. |
| **OPS** | Czynność operacyjna poza kodem (Twoja: sekrety, prawnik, licencje, DNS). |

---

## Tier 0 — Normatywne GO (źródła prawdy decyzji)

| Plik | Kluczowe założenia | Status |
|------|--------------------|--------|
| [docs/HOSTING_LAUNCH_TASKS.md](HOSTING_LAUNCH_TASKS.md) | Master backlog; D-1…D-5; GO-IAM/OPS/BILL/HOST. Ostatnia akt. 2026-05-26 — **nie odzwierciedla** stanu Node-PL-01. | **STALE** (sekcja GO-HOST) |
| [LIVE_PRODUCT_SCOPE_DECISION.md](../LIVE_PRODUCT_SCOPE_DECISION.md) | Blockery startu vs „nie blokują, jeśli nie komunikowane". IAM opcjonalne dla single-owner. | PASS (norma) |
| [GO_NO_GO_PROD.md](../GO_NO_GO_PROD.md) | Checklist 1–8 przed `up -d`. Sekcja 5 (węzeł) „po węźle". | PARTIAL |
| [.cursor/rules/100-live-scope.mdc](../.cursor/rules/100-live-scope.mdc) | Każdy merge gotowy do LIVE; bez MVP; follow-up nazwany jawnie. | PASS (norma) |

**Konflikt T0 #1 — IAM:** `HOSTING_LAUNCH_TASKS` D-1 = „IAM od startu = P0-BLK", a `LIVE_PRODUCT_SCOPE_DECISION` = „IAM nie blokuje single-owner". → wymaga decyzji produktowej (krok 3).
**Konflikt T0 #2 — GO-HOST:** backlog „nie startuje hostingu end-to-end" vs Node-PL-01 ACTIVE z profilem, stack readiness, OVH NS, wildcard TLS. → aktualizacja backlogu (krok 4).

---

## Tier 1 — Readiness / sprinty LIVE

| Plik | Kluczowe założenia | Status |
|------|--------------------|--------|
| [LIVE_READINESS_PLAN.md](../LIVE_READINESS_PLAN.md) | Sprint A (testy) ✅ większość; Sprint B (audyt paneli) ✅; Sprint C (ops) PARTIAL; Sprint D (legal) OPEN; Sprint E (DEFER). | PARTIAL |
| [PROD_HEALTH_CHECKLIST.md](../PROD_HEALTH_CHECKLIST.md) | §1–12; placeholdery `<TODO>` legal 🟡; mirror backup faza 2; zakup planu „po węźle". | PARTIAL |
| [docs/PROPOSED_SPRINTS.md](PROPOSED_SPRINTS.md) | „Następny sprint = GO-IAM" — ale smoke IAM PASS 2026-05-24. | **STALE** (nagłówek) |
| [docs/SPRINT_GO_IAM.md](SPRINT_GO_IAM.md) | VER-11/IAM-2 smoke. | PASS |
| [docs/SPRINT_GO_OPS.md](SPRINT_GO_OPS.md) | OPS-2 ✅, OPS-3 ✅, OPS-4/5 ⏳, GO_NO_GO bez NO-GO ⏳. | PARTIAL |
| [docs/SPRINT_C_OPS.md](SPRINT_C_OPS.md) | Backup ✅; restore/mirror/contact point częściowo. | PARTIAL |
| [docs/SPRINT_B_PANEL_AUDIT.md](SPRINT_B_PANEL_AUDIT.md) | Brak mocków we wszystkich panelach; 2 otwarte niskie (EKO copy, IAM R-12). | PASS |
| [docs/SPRINT_MAIL_TX.md](SPRINT_MAIL_TX.md) | Maile transakcyjne control-plane. | PASS (smoke 2026-05-24) |
| [docs/SPRINT_0_OPS_SMOKE.md](SPRINT_0_OPS_SMOKE.md) | Pkt 1,6–10 bez węzła; 2–5 po węźle. | PARTIAL |

---

## Tier 2 — Operacje ręczne (poza kodem)

| Plik | Otwarte pozycje | Status |
|------|-----------------|--------|
| [OPERATIONAL_CHECKLIST.md](../OPERATIONAL_CHECKLIST.md) | ~100 `- [ ]`: sekrety `.env.prod` 🔴, DNS, węzeł+DA. Większość = OPS. | OPS |
| [LIVE_RELEASE_RUNBOOK.md](../LIVE_RELEASE_RUNBOOK.md) | ~69 `- [ ]`: smoke IAM/registrar/AI/webhook/restore, gating prawne, fail-closed. | PARTIAL/OPS |
| [DEPLOY.md](../DEPLOY.md) | Procedura deploy + migracje. | PASS |
| [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md) | Rotacja sekretów; **PagerDuty TODO** (ręczna eskalacja); **kontakt prawny TODO**. | OPS (DEFER PagerDuty) |

---

## Tier 3 — Węzeł / hosting ops

| Plik | Kluczowe założenia | Status |
|------|--------------------|--------|
| [ops/docs/NODE_BOOTSTRAP_V2.md](../ops/docs/NODE_BOOTSTRAP_V2.md) | DoD ACTIVE bez ręcznych poprawek; Stack pin; uwaga „szkielet z TODO" w jednym wierszu. | PARTIAL (E2E do potwierdzenia) |
| [ops/docs/NODE_ONBOARD_RUNBOOK.md](../ops/docs/NODE_ONBOARD_RUNBOOK.md) | Krok-po-kroku onboarding węzła (9 `- [ ]`). | PARTIAL |
| [ops/docs/OVH_NODE_NS_AUTOMATION.md](../ops/docs/OVH_NODE_NS_AUTOMATION.md) | Glue/NS automat OVH. | PASS (panel NS) |
| [ops/docs/NODE_WILDCARD_TLS.md](../ops/docs/NODE_WILDCARD_TLS.md), [ops/docs/OVH_WILDCARD_TLS_SETUP.md](../ops/docs/OVH_WILDCARD_TLS_SETUP.md) | Wildcard `*.verris.pl` DNS-01. | PASS |
| [ops/docs/DA_CUSTOM_SKIN_ROADMAP.md](../ops/docs/DA_CUSTOM_SKIN_ROADMAP.md) | Custom skin DA. | DEFER (faza 2) |

---

## Tier 4 — Poczta / DNS / observability

| Plik | Status |
|------|--------|
| [docs/ops/MAIL-4_CONTROL_PLANE_MAIL.md](ops/MAIL-4_CONTROL_PLANE_MAIL.md) | PASS (MAIL-4a…d smoke) |
| [docs/ops/MAIL_DNS_CHECKLIST.md](ops/MAIL_DNS_CHECKLIST.md), [docs/ops/MAIL_DELIVERABILITY.md](ops/MAIL_DELIVERABILITY.md) | PASS (mail-tester 10/10) |
| [docs/ops/OVH_DNS_VERRIS_PL.md](ops/OVH_DNS_VERRIS_PL.md) | PARTIAL (rekordy do potwierdzenia) |
| [docs/ops/RSPAMD_MAIL.md](ops/RSPAMD_MAIL.md), [docs/ops/SOGO_MAIL_DEPLOY.md](ops/SOGO_MAIL_DEPLOY.md), [docs/ops/POSTFIX_PANEL_RELAY.md](ops/POSTFIX_PANEL_RELAY.md) | PASS |
| [docs/mail/AUDIT.md](mail/AUDIT.md) | PASS |
| [docs/ops/RESTORE_TEST.md](ops/RESTORE_TEST.md) | PASS (OPS-2 drill) |
| [docs/ops/GRAFANA_ALERTING.md](ops/GRAFANA_ALERTING.md), [docs/ops/GRAFANA_SSO_SMOKE.md](ops/GRAFANA_SSO_SMOKE.md) | PASS (alert → dominik@hvln.pl) |
| [docs/ops/BOK_TICKET_SMOKE.md](ops/BOK_TICKET_SMOKE.md) | PARTIAL (smoke do domknięcia) |
| [docs/ops/INCIDENT_RESPONSE.md](ops/INCIDENT_RESPONSE.md), [docs/ops/CURSOR_DEPLOY_SSH.md](ops/CURSOR_DEPLOY_SSH.md) | PASS (ref) |

---

## Tier 5 — Produkt / historia (założenia pierwotne)

| Plik | Otwarte / nieaktualne | Status |
|------|------------------------|--------|
| [PROJECT_STATUS.md](../PROJECT_STATUS.md) | A‑4 „2FA integracja TODO", B‑7 „BullMQ TODO", E‑6/E‑10/E‑11/E‑12 TODO, „subskrypcje Stripe TODO". Kod pokazuje: provisioning-queue BullMQ działa, IAM (E‑12) wdrożone. | **STALE** (B‑7, E‑12) |
| [ROADMAP_GAPS.md](../ROADMAP_GAPS.md) | R-01…R-19; R-02 diagnostyka (DNS/TLS) zrobione w staff; E‑6 staff diagnostyka TODO. | PARTIAL |
| [BACKLOG.md](../BACKLOG.md) | Luźne pomysły (BOK email/załączniki, awatary, faktury PDF). | DEFER |
| [SPRINT_PLAN.md](../SPRINT_PLAN.md), [SPRINT_01_STABILIZACJA.md](../SPRINT_01_STABILIZACJA.md), [SPRINT_02_LEGAL_RODO.md](../SPRINT_02_LEGAL_RODO.md), [SPRINT_03_MAILE.md](../SPRINT_03_MAILE.md) | Historia; AS-*, PC-* ✅. SPRINT_03 ma `// TODO M-13` (dane firmy w szablonie maila). | PARTIAL (M-13 = LEG) |
| [PLAN_CHANGE_SPRINT_PLAN.md](../PLAN_CHANGE_SPRINT_PLAN.md) | PC-1…PC-4 ✅; PC-4.3 custom pricing faza 2. | PASS / DEFER |
| [AUTOSCALING_SPRINT_PLAN.md](../AUTOSCALING_SPRINT_PLAN.md) | AS-1…AS-3 ✅. | PASS |
| [PANEL_UX_PLAN.md](../PANEL_UX_PLAN.md) | PR-1…PR-4 (23 `- [ ]`) — **nie wdrożone**; spójność UX, copy klient. | OPEN (P1) |
| [STRIPE_DAHLIA_COMPATIBILITY.md](../STRIPE_DAHLIA_COMPATIBILITY.md) | Pin `Stripe-Version` w env (małe TODO). | OPEN (P1) |

---

## Tier 6 — Prawne

| Plik | Status |
|------|--------|
| [docs/legal/drafts/terms.md](legal/drafts/terms.md), [privacy.md](legal/drafts/privacy.md), [dpa.md](legal/drafts/dpa.md), [cookies.md](legal/drafts/cookies.md), [subprocessors.md](legal/drafts/subprocessors.md) | `1.0.0-draft` — przed prawnikiem/publikacją. | OPS (LEG-D) |
| [LEGAL_LIVE_INPUTS.md](../LEGAL_LIVE_INPUTS.md) | Dane wejściowe do dokumentów. | OPS |

---

## Tier 7 — README aplikacji (niski priorytet)

| Plik | Status |
|------|--------|
| [apps/admin-panel/README.md](../apps/admin-panel/README.md), [apps/staff-panel/README.md](../apps/staff-panel/README.md), [LOCAL_DEV.md](../LOCAL_DEV.md) | Dev docs, brak wymagań GO. | N/A |

---

## Skan kodu (poza `.md`)

- `grep TODO|FIXME` w `apps/**/*.{ts,tsx}` i `ops/**/*.sh` — **brak realnych trafień** (tracker = dokumentacja, nie komentarze).
- Panel klienta/admin/staff: **brak** `mock`, `alert(`, pustych `onClick`, zakomentowanych `fetch`. Szczegóły w [LIVE_VERIFICATION_REPORT.md](LIVE_VERIFICATION_REPORT.md).

---

## Podsumowanie konfliktów do rozstrzygnięcia (wejście do raportu §8)

| # | Temat | Dokument A | Dokument B | Rozstrzygnięcie |
|---|-------|------------|------------|------------------|
| 1 | IAM od startu | HOSTING D-1 (P0) | LIVE_PRODUCT_SCOPE (opcjonalne) | Decyzja produktowa (krok 3) |
| 2 | GO-HOST status | HOSTING „nie startuje" | Node-PL-01 ACTIVE | Aktualizacja backlogu (krok 4) |
| 3 | BullMQ / IAM | PROJECT_STATUS TODO | Kod wdrożony | Oznaczyć STALE/DONE (krok 4) |
| 4 | Następny sprint | PROPOSED_SPRINTS „GO-IAM" | smoke PASS | Aktualizacja nagłówka (krok 4) |
| 5 | PANEL_UX PR-1…4 | PANEL_UX_PLAN OPEN | — | P1 vs bloker GO (krok 3) |
