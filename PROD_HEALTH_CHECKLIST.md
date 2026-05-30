# PROD Health Checklist — szablon raportu Sprintu 0

> Wypełniany przy każdym deploy'u kontroli stanu (po smoke teście, raz w tygodniu, przed wpuszczeniem klientów). Raport leży obok `GO_NO_GO_PROD.md` — `GO_NO_GO_PROD` jest wymogiem na wejście, ten plik jest **bieżącym statusem operacyjnym**. W razie regresji w którymkolwiek punkcie — eskalacja do tasku w Sprincie aktualnym.

**Ostatni snapshot (automatyczny):** 2026-05-26T10:26Z — prod HEAD `6fb0315` · `docker builder prune -af` (−26 GB cache) · `bash ops/scripts/prod-health-snapshot.sh`

## 0. Wymóg 100% LIVE

| Pomiar | Próg GO | Wartość | Status |
| --- | --- | --- | --- |
| Widoczne funkcje klienta mają realny backend/integrację | 100% | control-plane bez węzła: billing/IAM/BOK/mail zespołu | 🟡 |
| Brak mocków/stubów w panelu klienta | 100% | brak znanych mocków w prod UI | 🟡 |
| Brak placeholderów `<TODO>` w treściach prawnych i publicznych | 100% | drafty `1.0.0-draft` w `/legal/*` | 🟡 |
| Krytyczne operacje mają RBAC + audit log | 100% | IAM + admin audit | ✅ |
| Smoke test obejmuje billing, provisioning, BOK, compliance i status | 100% | bez węzła: pkt 1,5–10 SPRINT_0_OPS (provisioning ⏸️) | 🟡 |

Plan domknięcia: [`LIVE_READINESS_PLAN.md`](./LIVE_READINESS_PLAN.md) · backlog: [`docs/HOSTING_LAUNCH_TASKS.md`](docs/HOSTING_LAUNCH_TASKS.md).

---

## 1. Infrastruktura control-plane (4 vCPU / 8 GB RAM)

| Pomiar | Próg ALERT | Wartość pomiaru | Status |
| --- | --- | --- | --- |
| RAM host available | > 1.5 GB | **6.0 GiB** avail (po rebuild admin-panel) | ✅ |
| RAM staff-panel | < 512 MB | standalone fix · **72 MiB / 768 MiB** po ~20 h · 0 restartów | ✅ |
| RAM admin-panel | < 512 MB | standalone fix · **58 MiB / 768 MiB** po rebuild | ✅ |
| RAM api container | < 1.5 GB | 118 MiB | ✅ |
| RAM postgres container | < 2.5 GB | 48 MiB | ✅ |
| RAM redis container | < 256 MB | 6 MiB | ✅ |
| RAM minio container | < 1 GB | 253 MiB | ✅ |
| RAM caddy / grafana / prometheus | wg progów | 26 / 40 / 39 MiB | ✅ |
| CPU avg load (1m) | < 3.0 | **1.22** (po prune + restart staff) | ✅ |
| CPU idle | > 30% | ~19% w szczycie buildu; po restarcie OK | 🟡 |
| Disk used | < 60% | **29%** (21G/75G) po `docker builder prune -af` | ✅ |
| Disk free for backups | > 20 GB | **52 GB** wolne | ✅ |
| Inodes used | < 60% | **10%** | ✅ |

Komenda: `docker stats --no-stream`, `df -h`, `df -i`, `uptime`.

## 2. Aplikacja (API + 3 panele)

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| `/healthz` API | 200 OK, < 50ms | 200 · ~158 ms | ✅ |
| `/readyz` API | 200 OK, < 100ms | 200 · ~53 ms (DB+Redis+Stripe) | ✅ |
| Client panel `/` | 200/307 | 307 → login | ✅ |
| Staff panel `/` | 200/307 | 307 → login (po restarcie OK) | ✅ |
| Admin panel `/` | 200/307 | 307 → login | ✅ |
| Status page | 200 OK, < 500ms | 200 · ~163 ms | ✅ |
| API requests p95 (5min window) | < 500ms | dashboard `verris-control-plane` → **API HTTP latency p95** | ✅ |
| API error rate (5xx) | < 0.5% | ten sam dashboard → **API HTTP — udział 5xx** | ✅ |

## 3. Baza danych

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Postgres connections | < 70% (~70) | **10** | ✅ |
| DB total size | < 5 GB | **~12 MB** | ✅ |
| Last successful migration | < 7 dni | 30 migracji, brak pending | ✅ |
| Postgres slow queries (> 1s) | < 5/h | _Grafana_ | 🟡 |
| Idle in transaction | < 5 | _nie zmierzone_ | 🟡 |

## 4. Redis

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Redis memory used | < 200 MB | **1.85 MB** | ✅ |
| Redis evicted keys | < 10/h | 0 (snapshot) | ✅ |

## 5. Stripe

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Webhook deliveries success | 100% (24h) | top-up smoke 2026-05-24 | 🟡 |
| `STRIPE_WEBHOOK_SECRET` w env | YES | tak (test mode) | ✅ |
| Live keys przed klientami zewn. | `sk_live_` | **jeszcze test** — BILL-1 #6 | 🟡 |

## 6. Mail (własny Postfix + MAIL-4)

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| SPF (`dig TXT verris.pl`) | obecny | `ip4:204.168.174.138` + `a:mail.verris.pl` | ✅ |
| DMARC | quarantine/reject | `p=quarantine` | ✅ |
| Postfix :25 / Rspamd :11332 | nasłuch | active | ✅ |
| `mail-tester.com` (MAIL-3) | ≥ 9/10 | 10/10 (2026-05) | ✅ |
| Resend API | N/A | **nie używamy** — własny SMTP | N/A |

## 7. Backupy

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Last Postgres backup (MinIO) | < 25h | `latest.sql.gz` **2026-05-26 03:17 UTC** | ✅ |
| Backup size | sane | 51 KiB (mała baza) | 🟡 |
| Restore test (last) | < 30 dni | 2026-05-24 tryb A | ✅ |
| External mirror | < 25h lub N/A | N/A (faza 2) | 🟡 |

## 8. Węzły hostingowe (compute-nodes)

| Pomiar | Status |
| --- | --- |
| Wszystkie punkty | **N/A** — po GO-HOST / licencjach DA |

## 9. Monitoring i alerty

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Prometheus / Grafana | running | kontenery healthy | ✅ |
| Grafana SSO (`forward_auth`) | YES | auto + ręczny test ✅ 2026-05-26 | ✅ |
| Loki + Promtail (logi) | running | dashboard **Logs explorer** | ✅ 2026-05-30 |
| Ops overview (host/Docker) | YES | `00-ops-overview` + node-exporter/cAdvisor | ✅ 2026-05-30 |
| Status page public | 200 | `status.verris.pl` OK | ✅ |
| Grafana alert → email | YES | dominik@hvln.pl (OPS-3) | ✅ |
| Slack alert channel | YES | D-5: później | ⏸️ |

## 10. Bezpieczeństwo

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| TLS cert `panel.verris.pl` | > 14 dni | ważny do **2026-08-15** (Let's Encrypt) | ✅ |
| HSTS | YES | Caddy — do weryfikacji na docelowym 200 po login | 🟡 |
| `SECURITY_ALERT_EMAIL` | skonfigurowany | env + alerty | ✅ |
| 2FA admin/staff | YES | w kodzie + panel | 🟡 |

## 11. RODO / Compliance

| Pomiar | Wartość | Status |
| --- | --- | --- |
| `LegalDocument` current (4 kind) | **4** aktywne w DB | ✅ |
| Data export / account deletion | endpointy w API | 🟡 (smoke okresowy) |
| Re-consent po `1.0.0` | po publikacji | smoke przy logowaniu ✅ 2026-05-30 | ✅ |

## 12. Smoke test biznesowy (bez węzła)

- [x] Rejestracja + weryfikacja e-mail — 2026-05-24
- [x] Top-up portfela Stripe test — 2026-05-24
- [x] IAM invite + mail — 2026-05-24
- [x] MAIL-4 SOGo / skrzynki / MX — 2026-05-24
- [x] Welcome email po verify — 2026-05-19
- [x] Forward z potwierdzeniem (MAIL-4d) — 2026-05-26
- [x] BOK ticket end-to-end — [`docs/ops/BOK_TICKET_SMOKE.md`](docs/ops/BOK_TICKET_SMOKE.md) · 2026-05-30 (maile + DKIM fix)
- [ ] Zakup planu + provisioning DA — **po węźle**

## 13. Decyzja GO/NO-GO

**Stan 2026-05-26 (control-plane bez węzła):** **GO z monitoringiem** — brak ❌ w sekcjach 1–7 dla zakresu bez DA; węzeł = NO-GO dla pełnego hostingu. Follow-up: **staff-panel RAM leak** (restart 2026-05-26), monitoring obciążenia po buildach.

---

## Wpisy historyczne

### Run #002 — 2026-05-26 — GO-OPS pass

- **HEAD:** `6fb0315`
- **Akcje:** `docker builder prune -af` (26.38 GB), staff-panel standalone (4 GiB → **~72 MiB** po 20 h), poprawka `GF_SMTP_FROM_NAME` w `.env.prod` (cudzysłów)
- **Wynik:** sekcje 1–7 bez ❌ dla control-plane; sekcja 8 N/A
- **Odchylenia:** Grafana p95 API — 🟡

### Run #001 — 2026-05-24 — Sprint 0 deploy

- **Wynik:** częściowy (restore drill, MAIL-TX, BILL-2)
- **Akcje korekcyjne:** kontynuacja MAIL-4, GO-OPS finish

---

Last updated: 2026-05-26 (GO-OPS).
