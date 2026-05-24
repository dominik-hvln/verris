# PROD Health Checklist — szablon raportu Sprintu 0

> Wypełniany przy każdym deploy'u kontroli stanu (po smoke teście, raz w tygodniu, przed wpuszczeniem klientów). Raport leży obok `GO_NO_GO_PROD.md` — `GO_NO_GO_PROD` jest wymogiem na wejście, ten plik jest **bieżącym statusem operacyjnym**. W razie regresji w którymkolwiek punkcie — eskalacja do tasku w Sprincie aktualnym.

**Ostatni snapshot (automatyczny):** 2026-05-24T15:16:12Z — prod HEAD `75349b0` (`bash ops/scripts/prod-health-snapshot.sh`).

## 0. Wymóg 100% LIVE

Przed decyzją GO trzeba potwierdzić, że wdrażany zakres jest produkcyjny: **bez MVP, bez mocków, bez stubów i bez brakujących funkcji w ścieżkach komunikowanych klientowi**. Jeśli funkcja nie jest gotowa end-to-end, musi być ukryta, jawnie wyłączona feature flagą albo opisana jako niedostępna w obecnym zakresie oferty.

| Pomiar | Próg GO | Wartość | Status |
| --- | --- | --- | --- |
| Widoczne funkcje klienta mają realny backend/integrację | 100% | | |
| Brak mocków/stubów w panelu klienta | 100% | | |
| Brak placeholderów `<TODO>` w treściach prawnych i publicznych | 100% | | |
| Krytyczne operacje mają RBAC + audit log | 100% | | |
| Smoke test obejmuje billing, provisioning, BOK, compliance i status | 100% | | |

Plan domknięcia i kolejność sprintów: [`LIVE_READINESS_PLAN.md`](./LIVE_READINESS_PLAN.md).

Każdy punkt ma format:

- ✅ — działa, mierzone, alert podpięty.
- 🟡 — działa, ale mierzone manualnie / brak alertu.
- ❌ — nie działa lub niezmierzone.

---

## 1. Infrastruktura control-plane (4 vCPU / 8 GB RAM)

| Pomiar | Próg ALERT | Wartość pomiaru | Status |
| --- | --- | --- | --- |
| RAM total used | < 6.5 GB (80%) | ~0.9 GB (suma kontenerów, snapshot 2026-05-24T15:16Z) | ✅ |
| RAM api container | < 1.5 GB | 108 MiB | ✅ |
| RAM postgres container | < 2.5 GB | 30 MiB | ✅ |
| RAM redis container | < 256 MB | 5 MiB | ✅ |
| RAM caddy container | < 200 MB | 13 MiB | ✅ |
| RAM grafana container | < 300 MB | 38 MiB | ✅ |
| RAM prometheus container | < 500 MB | 38 MiB | ✅ |
| CPU avg load (1m) | < 3.0 | _nie zmierzone_ | 🟡 |
| CPU idle | > 30% | _nie zmierzone_ | 🟡 |
| I/O wait | < 5% | _nie zmierzone_ | 🟡 |
| Disk used | < 60% | **18%** (`/dev/sda1` 13G/75G) po `docker builder prune -af` 2026-05-23 | ✅ |
| Disk free for backups | > 20 GB | **60 GB** wolne | ✅ |
| Inodes used | < 60% | _nie zmierzone_ | 🟡 |

Komenda: `docker stats --no-stream`, `df -h`, `df -i`, `top -b -n 1 | head -20`.

## 2. Aplikacja (API + 3 panele)

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| `/healthz` API | 200 OK, < 50ms | OK (snapshot 2026-05-24) | ✅ |
| `/readyz` API | 200 OK, < 100ms (sprawdza DB+Redis+Stripe) | _nie zmierzone_ | 🟡 |
| Client panel SSR `/dashboard` | 200 OK, < 1s p95 | | |
| Staff panel SSR `/dashboard` | 200 OK, < 1s p95 | | |
| Admin panel SSR `/dashboard` | 200 OK, < 1s p95 | | |
| Status page | 200 OK, < 500ms | | |
| API requests p95 (5min window) | < 500ms | | |
| API requests p99 | < 2000ms | | |
| API error rate (5xx) | < 0.5% | | |
| API rate limit triggers | < 10/h | | |

Komenda: `curl -w '%{http_code} %{time_total}\n' -o /dev/null -s https://api.verris.pl/healthz`, Grafana dashboard `API performance`.

## 3. Baza danych

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Postgres connections (max 100 default) | < 70% | | |
| Postgres slow queries (> 1s) | < 5/h | | |
| Largest table size | _<info>_ | | |
| DB total size | < 5 GB | | |
| DB age (`pg_stat_database`) | _<info>_ | | |
| Last successful migration | < 7 dni | | |
| Replication lag (jeśli replica) | < 10s | | |
| Idle in transaction | < 5 | | |

Komenda: `docker exec verris-postgres psql -U verris -c "select count(*) from pg_stat_activity"`, Grafana dashboard `Postgres`.

## 4. Redis

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Redis memory used | < 200 MB | | |
| Redis ops/s | _<info>_ | | |
| Redis evicted keys | < 10/h | | |
| Redis blocked clients | < 5 | | |

Komenda: `docker exec verris-redis redis-cli info`, sekcje `memory`, `stats`.

## 5. Stripe

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| `Stripe-Version` w requestach | `2026-04-22.dahlia` | | |
| Webhook deliveries success | 100% (24h window) | top-up smoke 2026-05-24 (checkout) | 🟡 |
| Webhook handler latency p95 | < 500ms | | |
| `customer.subscription.created/updated/deleted` ostatnio przyjęte | < 24h | | |
| `invoice.paid` ostatnio przyjęte | < 24h | | |
| `payment_intent.succeeded` ostatnio przyjęte | _<info>_ | | |
| Failed `WALLET_AUTOTOPUP_PAYMENT_FAILED` audit events | < 5/h | | |
| Default API version w Stripe Dashboard | `2026-04-22.dahlia` lub kompatybilna | | |

Komenda: Stripe Dashboard → Workbench → Webhooks → endpoint `/billing/stripe/webhook`. Logi API: `docker logs verris-api 2>&1 | grep -E '(Stripe|webhook)' | tail -50`.

## 6. Mail (po Sprincie 2)

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Resend API key valid | YES/NO | | |
| Resend daily quota used | < 80% | | |
| `EmailLog.status=BOUNCED` | < 5% | | |
| `EmailLog.status=COMPLAINED` | < 0.1% (Resend penalty trigger) | | |
| SPF check (`dig TXT verris.pl`) | obecny `include:_spf.resend.com` | | |
| DKIM check (`dig TXT resend._domainkey.verris.pl`) | obecny | | |
| DMARC check (`dig TXT _dmarc.verris.pl`) | `p=quarantine` lub `p=reject` | | |
| `mail-tester.com` test score | ≥ 9/10 | | |

Komenda: `dig +short TXT verris.pl`, `dig +short TXT _dmarc.verris.pl`.

## 7. Backupy

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Last successful Postgres backup (MinIO `verris-backups/postgres/`) | < 25h | `latest.sql.gz` 2026-05-24 03:17 UTC | ✅ |
| Backup file size sane | _<info>_ | 24 KiB (mała baza / zweryfikować pełność) | 🟡 |
| External mirror (`backup-mirror-external.sh`) | < 25h lub N/A (faza 2) | N/A | 🟡 |
| Restore test (last) | < 30 dni | 2026-05-24 tryb A (`restore-drill-isolated.sh`, users=3) | ✅ |
| MinIO bucket `verris-backups` exists | YES | alias `verris` OK | ✅ |
| Ticket/RODO uploads w MinIO (nie lokalny FS) | YES | _nie zweryfikowane w snapshot_ | 🟡 |

Komenda: `mc ls verris/verris-backups/postgres/`, `tail -50 /var/log/verris-backup.log`.

## 8. Węzły hostingowe (compute-nodes)

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Liczba akceptowanych węzłów | ≥ 1 (Sprint 0), ≥ 2 (po Sprincie 4) | | |
| Heartbeat ostatni dla każdego węzła | < 5 min | | |
| DA API connectivity | OK dla wszystkich | | |
| Provisioning success rate (24h) | ≥ 98% | | |
| Provisioning latency p95 | < 30s | | |
| LVE telemetry CPU | < 70% avg | | |
| LVE telemetry RAM | < 70% avg | | |
| Disk per node | < 70% | | |

Komenda: `verris admin nodes list`, Grafana `Compute nodes`.

## 9. Monitoring i alerty

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| Prometheus scrape success | 100% | | |
| Grafana SSO działa | YES | | |
| Status page probes (`status.verris.pl`) | wszystkie OK | | |
| Probe failure last 24h | < 3 | | |
| Slack/Discord alert channel skonfigurowany | YES | | |
| Email alert channel `SECURITY_ALERT_EMAIL` skonfigurowany | YES | | |
| Pagerduty / on-call (jeśli stosowane) | YES/N/A | | |

## 10. Bezpieczeństwo

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| HSTS header obecny na panelach | YES | | |
| TLS cert valid days remaining | > 14 (Caddy auto-renew) | | |
| `JWT_SECRET` rotation (180 dni) | < 180 dni od ostatniej rotacji | | |
| `APP_KMS_KEY` rotation (180 dni) | < 180 dni | | |
| `STRIPE_WEBHOOK_SECRET` exists | YES | | |
| Failed login rate (1h window) | < 100 | | |
| `SecurityAlert` open | < 5 (sprawdzić każdy nowy) | | |
| 2FA wymagany dla admin/staff | YES | | |
| RBAC tests passing | YES (CI) | | |

## 11. RODO / Compliance

| Pomiar | Próg ALERT | Wartość | Status |
| --- | --- | --- | --- |
| `LegalDocument` z `kind=TERMS_OF_SERVICE` aktywny (`isCurrent=true`) | YES (Sprint 1) | | |
| `LegalDocument` z `kind=PRIVACY_POLICY` aktywny | YES (Sprint 1) | | |
| `LegalDocument` z `kind=COOKIES_POLICY` aktywny | YES (Sprint 1) | | |
| Re-consent flow działa | YES (Sprint 1) | | |
| Data export endpoint działa | YES (Sprint 1) | | |
| Account deletion flow działa | YES (Sprint 1) | | |
| Lista subprocessors zaktualizowana | < 30 dni od ostatniej zmiany | | |

## 12. Smoke test biznesowy

Wykonaj sekwencję raz w tygodniu (lub po każdym deployu wpływającym na te ścieżki). **Każdy krok = pojedynczy ✅ lub ❌**.

- [x] Rejestracja + weryfikacja e-mail (link aktywacyjny). — 2026-05-24
- [ ] Welcome email po verify (transakcyjny).
- [ ] Logowanie z 2FA.
- [x] Top-up portfela z karty Stripe (test mode). — 2026-05-24 BILL-2
- [x] Wallet credit pojawił się w panelu.
- [ ] Faktura wystawiona, hosted invoice URL działa.
- [x] Mail `WALLET_TOPUP_OK` dotarł — 2026-05-24 BILL-2
- [ ] Zakup planu hostingowego.
- [ ] Provisioning DA wykonał się pomyślnie.
- [ ] Mail `SERVICE_PROVISIONED` dotarł (po Sprincie 2).
- [ ] Logowanie do DirectAdmin z poziomu panelu klienta.
- [ ] Otwarcie ticketa z załącznikiem.
- [ ] Załącznik widoczny w panelu staff.
- [ ] Mail `TICKET_NEW` do staff dotarł.
- [ ] Odpowiedź staff na ticket.
- [ ] Mail `TICKET_STATUS_CHANGED` do klienta dotarł.
- [ ] Impersonacja klienta przez admina (z audit logiem).
- [ ] Wyjście z impersonacji.
- [ ] Anulowanie subskrypcji (at period end).
- [ ] Faktura `IMP_END_PERIOD` po koniec okresu (smoke z manualną zmianą daty / Stripe trigger).
- [ ] Status page pokazuje wszystkie probes na zielono.

## 13. Decyzja GO/NO-GO

Po wypełnieniu sekcji 1-12, skompletuj jedną z trzech decyzji:

- **GO** — wszystkie LIVE blockers (Sprint 0/1/2 zakończone) i ≥ 95% punktów ✅. Można wpuszczać klientów.
- **GO z monitoringiem** — wszystkie LIVE blockers ✅, ale niektóre 🟡 (np. brak alertów Slack). Można wpuszczać 1-5 zaproszonych klientów testowych pod ścisłym monitoringiem.
- **NO-GO** — przynajmniej jeden punkt ❌ w sekcjach 1-7 lub 11. Stop, eskalacja do tasku.

---

## Wpisy historyczne

> Każdy uruchomiony health check zapisz tu jako oddzielny block. Format daty `YYYY-MM-DD HH:mm`.

### Run #001 — `<TBD>` — Sprint 0 deploy

- **Wynik:** _<TBD>_
- **Wpisy z odchyleniami:**

  - _<np. 5.4 Webhook latency p95 = 800ms (próg < 500ms) — w issue Sprint 0/STR-12>_

- **Akcje korekcyjne:** _<TBD>_

---

Last updated: Sprint 0, May 2026.
