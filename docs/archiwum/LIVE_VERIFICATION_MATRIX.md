# LIVE Verification Matrix — macierz stanu P0

> **Cel:** każdy obszar krytyczny (P0) dla startu hostingu z realnymi klientami ma jeden wiersz ze statusem PASS / OPEN / DEFER / OPS i dowodem.
> **Data:** 2026-06-01 · Gałąź: `live-release-readiness` · HEAD: `efb43f7`
> **Powiązane:** [LIVE_ASSUMPTIONS_INDEX.md](LIVE_ASSUMPTIONS_INDEX.md), [LIVE_VERIFICATION_REPORT.md](LIVE_VERIFICATION_REPORT.md).

## Legenda

| Status | Znaczenie | Blokuje GO? |
|--------|-----------|-------------|
| **PASS** | Zweryfikowane w kodzie/smoke | Nie |
| **OPEN** | Realna luka w panelu/API do domknięcia | Tak (jeśli P0) |
| **OPS** | Czynność operacyjna poza kodem (sekrety/prawnik/licencje) | Tak, ale po Twojej stronie |
| **DEFER** | Świadomy follow-up / faza 2 | Nie (jeśli nie komunikowane) |
| **VERIFY** | Wymaga smoke na żywym węźle (SSH/prod) | Warunkowo |

---

## A. Panel klienta (`apps/client-panel`)

| ID | Obszar | Źródło | Status | Dowód / uwagi |
|----|--------|--------|--------|---------------|
| CL-01 | Dashboard + partial-fetch errors | SPRINT_B | PASS | `dashboard-home.tsx` banner z `snapshot.errors` |
| CL-02 | Zakup usługi + provisioning | SCOPE | PASS | `services/new/form.tsx`, Stripe/portfel |
| CL-03 | Usługa `[id]`: Overview/health | SCOPE | PASS | `ServiceOverviewTab`, `HealthCheckDetails` realne |
| CL-04 | Poczta (MailTab) | e20599c | PASS | `MailTab.tsx` → `/services/:id/hosting-email` + connection-info |
| CL-05 | SSL (LE + paste) | efb43f7 | PASS | `SSLTab.tsx`, `requestLetsEncryptSslAction` |
| CL-06 | DNS/Domeny/DB/FTP/Cron/Backup/Restore | SPRINT_B | PASS | osobne strony sidebar + `PanelFetchError` |
| CL-07 | Billing/portfel/faktury/promo | SPRINT_B | PASS | Stripe only; brak PayU w UI |
| CL-08 | IAM/subkonta | IAM_FOLLOWUP | PASS | gate + redirect subkonta + guard layoutu |
| CL-09 | Rejestrator domen fail-closed | SCOPE | PASS | ukryte gdy `configured=false` |
| CL-10 | Asystent AI gate | f3f3cfe | PASS | `HostingAssistant` zwraca null gdy nie configured |
| CL-11 | Zakładka Deploy | audyt+impl | PASS | `DeployTab.tsx` realny: auto-deploy Git przez cron DA (`createDeployJob`/`listDeployJobs`/`deleteDeployJob`) |
| CL-12 | Zakładka Staging | audyt+impl | PASS | `StagingTab.tsx` realny: poddomena DA + opcjonalna baza (`createHostingStaging` itd.) |
| CL-13 | File manager inline | audyt | DEFER | `HostingFileManagerTab` tylko link do DA — OK jeśli nie obiecujemy inline |
| CL-14 | Shell usługi: dostęp do narzędzi z TABS | audyt | DEFER (P1) | narzędzia dostępne z sidebara; pełna konsolidacja w shellu = follow-up |
| CL-15 | Pusty katalog `services/1/` | audyt | PASS | usunięty |
| CL-16 | Auto-login po rejestracji | typecheck | PASS | `register/actions.ts` — dodano brakujący `setAuthCookie` (był martwy import) |

---

## B. Panel admin (`apps/admin-panel`)

| ID | Obszar | Status | Dowód / uwagi |
|----|--------|--------|---------------|
| AD-01 | Węzły: lista/detal/approve/bootstrap | PASS | `nodes/**` realne `adminApi()` |
| AD-02 | Stack readiness (sondy/Governor/CageFS) | PASS | `node-stack-readiness-panel.tsx`; UNKNOWN → „Do weryfikacji" |
| AD-03 | Profil hostingowy (kolejka + skrypt agenta) | PASS | `hosting-profile-panel.tsx` |
| AD-04 | DirectAdmin config + test | PASS | `directadmin-form.tsx` |
| AD-05 | Nameservers / automat OVH | PASS | `nameservers-form.tsx` step-by-step |
| AD-06 | Audyt węzła + repair | PASS | `node-audit-panel.tsx` z risk-gate |
| AD-07 | Plany CRUD + Stripe price | PASS | `plans/**` |
| AD-08 | Subskrypcje + plan change + migracja | PASS | `subscriptions/**` |
| AD-09 | Klienci: impersonacja/wallet/operacje RODO | PASS | `customers/**` |
| AD-10 | Provisioning queue + retry | PASS | banner gdy brak `REDIS_URL` |
| AD-11 | Audyt/compliance/status/promo/billing | PASS | realne API + CSV |
| AD-12 | Badge floty w nagłówku | impl | PASS | `fleet-status-badge.tsx` — realny stan serwerów (`/admin/servers`), zamiast statycznego napisu |
| AD-13 | Link `/tickets` w sidebarze | audyt | PASS | link obecny w nawigacji admina |
| AD-14 | `tickets/page.tsx` env hard-fail | impl | PASS | `panelUrl()` degraduje się łagodnie (link wewnętrzny) zamiast 500 gdy brak `STAFF_PANEL_URL` |
| AD-15 | `subscriptions/[id]` generic catch | OPEN (P2) | brak rozróżnienia 404/401/500 |
| AD-16 | `/subscriptions` brak paginacji >200 | DEFER (P2) | jawnie zakomunikowane w UI |

---

## C. Panel staff (`apps/staff-panel`)

| ID | Obszar | Status | Dowód |
|----|--------|--------|-------|
| ST-01 | Skrzynka + szczegół ticketu | PASS | `staffGetTickets`, `TicketDetailPanel` |
| ST-02 | CRM 360 + timeline + DNS/TLS diag | PASS | `/crm/[userId]` |
| ST-03 | Impersonacja z powodem | PASS | min. 10 znaków, handoff httpOnly |
| ST-04 | AI gate (configured=false) | PASS | `ticket-detail-panel.tsx` + fail-closed w `lib/ticket-actions.ts` |
| ST-05 | Canned responses / knowledge | PASS | `/knowledge` realne API |

---

## D. Backend / API (`apps/api`)

| ID | Obszar | Status | Dowód |
|----|--------|--------|-------|
| API-01 | 53 kontrolery, brak NotImplemented | PASS | grep czysty |
| API-02 | Hosting klienta (services/subscriptions) | PASS | DA proxy: DNS/FTP/email/cron/SSL/backup/restore/health |
| API-03 | Admin węzła (servers.admin) | PASS | audit, stack-readiness, hosting-profile, repair-packages |
| API-04 | Billing/Stripe (webhook HMAC) | PASS | checkout, subscription, auto-topup |
| API-05 | Compliance/legal/consents | PASS | account-deletion, legal-documents |
| API-06 | Pokrycie testami webhooka Stripe | impl | PASS | `stripe.service.spec.ts` — 12 testów: podpis HMAC, replay (timestamp), parsowanie eventu |
| API-07 | Pin `Stripe-Version` w env | weryfikacja | PASS | `STRIPE_API_VERSION` czytany w `stripe.service.ts` (pin wersji API) |

---

## E. Węzeł compute (Node-PL-01) — wymaga smoke na żywo

| ID | Obszar | Status | Dowód / następny krok |
|----|--------|--------|------------------------|
| ND-01 | Bootstrap + agent + ACTIVE | VERIFY | potwierdzić heartbeat < 5 min w panelu |
| ND-02 | Profil hostingowy SUCCESS + `[VERRIS_PROFILE]` | VERIFY | ponowny profil po `efb43f7`; sprawdzić summary w panelu |
| ND-03 | Poczta :993/:587, FTP :21, MariaDB :3306 | VERIFY | sondy stack panel (FTP po `./build pureftpd`) |
| ND-04 | Governor active w stack panel | VERIFY | po fix `extractVerrisProfileSummary` |
| ND-05 | CageFS enabled w telemetry | VERIFY | `verris-lve.sh` raportuje `cagefs_enabled=1` |
| ND-06 | Wildcard TLS :2222 CN/SAN `*.verris.pl` | VERIFY | audyt TLS |
| ND-07 | Pakiety DA: API ≠ unlimited; UI po repair | VERIFY | „Napraw pakiety DA" + screenshot przed/po |
| ND-08 | E2E: zakup → provisioning → mail+FTP+SSL | VERIFY | jedna dokumentowana ścieżka |

---

## F. Operacje / GO (poza kodem panelu)

| ID | Obszar | Status | Dowód / właściciel |
|----|--------|--------|---------------------|
| OPS-A | Stripe `sk_live_` + webhook live | OPS | przed pierwszym klientem zewn. (Ty) |
| OPS-B | LEG-D: prawnik → publikacja 1.0.0 | OPS | drafty gotowe; akcept prawnika (Ty) |
| OPS-C | `.env.prod` sekrety 🔴 | OPS | OPERATIONAL_CHECKLIST §1 |
| OPS-D | Licencja DA dla kolejnych węzłów | OPS | GO-HOST |
| OPS-E | GO_NO_GO checklist bez NO-GO | PARTIAL | po E2E + Stripe live + LEG |
| OPS-F | PagerDuty / kontakt prawny w IR | DEFER/OPS | INCIDENT_RESPONSE TODO |
| OPS-G | Hetzner abuse + Spamhaus XBL (`204.168.174.138`) | OPS (P0) | Zgłoszenie 2026-06-01: netscan + IOC tinba C2. Runbook: `docs/ops/HETZNER_ABUSE_2026-06-01.md`. Wymagane: containment, rotacja sekretow, walidacja hosta, odpowiedz do Hetzner przed deadline. |

---

## Podsumowanie liczbowe (na 2026-06-01)

| Kategoria | PASS | OPEN | DEFER | OPS/VERIFY |
|-----------|------|------|-------|------------|
| Panel klienta | 14 | 0 | 2 (CL-13/14) | — |
| Panel admin | 14 | 1 (AD-15 P2) | 1 (AD-16) | — |
| Panel staff | 5 | 0 | 0 | — |
| API | 7 | 0 | 0 | — |
| Węzeł | 0 | 0 | 0 | 8 VERIFY |
| Operacje | 0 | 0 | 1 | 6 OPS |

**Wniosek (po implementacji 2026-06-01):** wszystkie wiersze P0 panelu/API są **PASS**. Pozostały tylko: smoke węzła na żywo (8× VERIFY — wymaga SSH/prod) oraz czynności operacyjne poza kodem (6× OPS, w tym nowy P0 security incident: Hetzner abuse + Spamhaus XBL na `204.168.174.138`). AD-15 (rozróżnienie 404/401/500) i AD-16/CL-13/CL-14 zostają jako świadome follow-upy P1/P2. Typecheck `api` + `client-panel` + `admin-panel` = czysty; webhook Stripe i naprawione spec-i = zielone.
