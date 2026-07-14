# Verris — katalog dashboardów Grafany (rozbudowa monitoringu)

**Data:** 2026-07-14
**Cel:** pełny zestaw raportów/wykresów/kafelków w Grafanie „jak w Zabbixie", oparty na REALNYCH danych (metryki `verris_*` z API `/metrics` + widoki `*_safe` w Postgresie). Zero zmyślonych pól.
**Zasada:** każdy panel wskazuje źródło i gotowość danych. Nie obiecujemy wykresu, pod który nie ma danych.

## Legenda gotowości

- ✅ **teraz** — dane już są (metryka `verris_*` lub istniejący widok `_safe`), panel działa po wgraniu dashboardu.
- 🟡 **po migracji `_safe`** — wymaga nowych widoków `ticket_safe / ticket_reply_safe / site_monitor_safe / …` (plik `verris-safe-views-support-monitoring.sql`, dołączony).
- 🟠 **po domknięciu floty** — wymaga scrapowania węzłów (job `nodes` w `prometheus.yml` ma dziś `targets: []`; node-exporter w bootstrapie + file-SD z API).
- 🔵 **po dołożeniu exportera** — blackbox (endpoint/TLS), smartctl (dyski), snmp/ipmi (sprzęt), process-exporter (procesy).

Istniejące widoki `_safe` (grafana_ro ma SELECT): `user_safe, server_safe, account_safe, subscription_safe, wallet_transaction_safe, invoice_safe, usage_metric_safe, autoscaling_event_safe, probe_sample_safe, probe_incident_safe`. **Nie ma** jeszcze `ticket_safe, ticket_reply_safe, site_monitor_safe` — stąd znaczniki 🟡.

---

## 1. Mapa Twojej listy → dashboard → źródło → gotowość

| Chcesz raport | Dashboard | Źródło danych | Gotowość |
|---|---|---|---|
| **klienci** | Klienci | `user_safe`, `subscription_safe`, `invoice_safe`, `verris_users_total`, `verris_accounts_total` | ✅ |
| **pojedynczy klient** | Klient (drill, `$userId`) | jw. + `ticket_safe`, `site_monitor_safe` | 🟡 (część ✅) |
| **węzły** | Flota / Węzły | `verris_servers_total`, `verris_servers_stale_heartbeat`, `server_safe` | ✅ |
| **pojedynczy węzeł** | Węzeł (drill, `$node`) | node-exporter (CPU/RAM/dysk/load) | 🟠 |
| **usługi** | Usługi | `subscription_safe`, `account_safe`, `verris_subscriptions_total` | ✅ |
| **pojedyncze usługi** | Usługa (drill, `$subId`) | jw. + `site_monitor_safe`, `usage_metric_safe` | 🟡 (część ✅) |
| **serwery www** | Usługi www | `site_monitor_safe` (status, `lastResponseMs`, TLS), `account_safe` | 🟡 |
| **serwery db** | Węzły / DB | `Server.dbEngine/dbVersion` — brak w `server_safe` → rozszerzyć widok | 🟡 |
| **serwery poczta** | Poczta | `verris_mailboxes_total`, `verris_mailboxes_used_bytes_total` | ✅ |
| **czasy reakcji / czas odpowiedzi** | Wydajność API + Support | `verris_http_request_duration_seconds` (histogram → p95), `verris_ticket_*_response_*` | ✅ |
| **średni czas odpowiedzi** | Support | `verris_ticket_first_response_avg_seconds(_30d)`, `verris_ticket_staff_response_avg_seconds(_30d)` | ✅ |
| **najczęstsze problemy** | Support | `ticket_safe.topic` | 🟡 |
| **najlepsi pracownicy** | Support | `ticket_safe` + `ticket_reply_safe` + `user_safe` | 🟡 |
| **oceny pomocy** | Support | `ticket_safe.csatRating` | 🟡 |
| **support** | Support | `verris_tickets_*` + widoki ticketów | ✅/🟡 |
| **obciążenia** | Flota / Węzły | node-exporter (live) lub nowy gauge per-node | 🟠 |
| **przeciążenia** | Flota + Autoskalowanie | node-exporter load + `verris_autoscaling_scale_events_total` (proxy ✅) | 🟠 / ✅ |
| **procesy** | Węzeł + API | `verris_process_memory_bytes` (API ✅); procesy węzła → process-exporter | ✅ / 🔵 |
| **podgląd na żywo** | Live / NOC | dowolny panel z `refresh=5s`; API ✅, węzły 🟠 | ✅/🟠 |

---

## 2. Dashboardy — projekt (panele)

Numeracja kontynuuje istniejące pliki (`00`–`08` już są). Wszystko jako dashboard-jako-kod w `ops/observability/grafana/provisioning/dashboards/json/`.

### 06 — Support / Helpdesk  ✅/🟡  *(ZBUDOWANY — plik `06-support.json`)*
Kafelki: oczekują na 1. odpowiedź, śr. czas 1. odpowiedzi (30d), śr. czas odpowiedzi staff (30d), śr. CSAT (30d). Wykresy: tickety wg statusu (pie), tickety/dzień wg tematu (ts), najczęstsze tematy (bar), **najlepsi pracownicy** — obsłużone + CSAT (table), rozkład ocen CSAT 1–5 (bar), SLA zagrożone/przekroczone (table), trend czasów odpowiedzi (ts, live).
KPI z Prometheusa działają od razu; panele SQL wstają się „zielone" po migracji widoków (🟡).

### 09 — Klienci  ✅
Kafelki: `verris_users_total{role}`, aktywne subskrypcje, konta wg statusu (`verris_accounts_total`), nowe/anulowane w mies. Wykresy: przyrost klientów/dzień (`user_safe`), MRR/ARPU (z `subscription_safe` — patrz uwaga o `priceAmount` w §4), rozkład wg kraju/locale, faktury/dzień (`invoice_safe`). Tabela: top klienci wg salda portfela (`user_safe.walletBalance`).

### 10 — Klient (drill `$userId`)  🟡
Zmienna `$userId`. Panele: dane klienta (`user_safe`), jego usługi (`subscription_safe`+`account_safe`), faktury (`invoice_safe`), portfel (`wallet_transaction_safe`), zgłoszenia + CSAT (`ticket_safe`), monitory www (`site_monitor_safe`).

### 11 — Usługi  ✅
Kafelki: subskrypcje wg statusu (`verris_subscriptions_total`), wg planu i produktu (`subscription_safe`), provisioning w toku (`verris_provisioning_pending`). Wykresy: nowe/anulowane usługi w czasie (`subscription_safe`), rozkład wg `productKind`, konta na węzłach (`account_safe` GROUP BY `serverId`).

### 12 — Usługi www (serwery www)  🟡
Z `site_monitor_safe`: status (UP/DOWN/UNKNOWN), rozkład `lastResponseMs` (czas odpowiedzi stron), TLS wygasa < 14/30 dni (`tlsExpiresAt`), najwięcej awarii (`site_monitor_event_safe` GROUP BY monitor), MTTR z `durationS`.

### 13 — Poczta  ✅
`verris_mailboxes_total{status}`, `verris_mailboxes_used_bytes_total`, dostarczalność `verris_email_log_24h_total{status}` (24h), trend z `EmailLog`/`emmSend` (wymaga `email_log_safe` — opcjonalnie 🟡).

### 14 — Wydajność API / czasy reakcji  ✅
Z `verris_http_request_duration_seconds` (histogram): **p95/p99** per route (`histogram_quantile`), error rate 4xx/5xx (`verris_http_requests_total{status_class}`), RPS, najwolniejsze endpointy (topk). Plus `verris_process_memory_bytes`, `verris_process_uptime_seconds`, runtime errors (`verris_runtime_errors_total`).

### 15 — Flota / Węzły (overview)  ✅ + 🟠
Teraz ✅: `verris_servers_total{status}`, `verris_servers_stale_heartbeat`, `server_safe` (tabela: nazwa/region/status/heartbeat), provisioning. Po domknięciu floty 🟠: CPU/RAM/dysk/load per węzeł, „podgląd na żywo".

### 16 — Węzeł (drill `$node`)  🟠
Zmienna `$node` (instance). node-exporter: CPU/RAM/swap/dysk/IO/sieć/load, uptime, top procesy (process-exporter 🔵). Do tego z DB status/heartbeat/liczba kont (`account_safe`).
> **Luka pojemności:** obłożenie CPU/RAM/dysk per węzeł nie jest dziś w Grafanie — `server_safe` nie odsłania `totalCpuCores/allocated*`. Rozwiązanie: albo node-exporter (realne zużycie), albo nowy gauge `verris_node_capacity_*{node}` w `metrics.service.ts`, albo rozszerzyć `server_safe` o kolumny pojemności. Rekomendacja: node-exporter (realne) + krótkoterminowo rozszerzyć widok (alokacja).

### 17 — Obciążenia / Przeciążenia  🟠 + ✅
node-exporter: load1/5/15 vs rdzenie, CPU saturation, pressure (PSI), OOM, dysk >85%. Proxy dostępne teraz ✅: `verris_autoscaling_scale_events_total{resource,direction}`, `verris_autoscale_events_1h_total`, `verris_autoscaling_charges_pln_30d` (gdzie autoskalowanie „ratuje" przeciążenia).

### 18 — Provisioning / Kolejka  ✅
`verris_provisioning_pending`, `verris_provisioning_stage_total{stage}`, `verris_provisioning_queue_depth{state}`, `verris_provisioning_queue_oldest_waiting_seconds`, `verris_provisioning_jobs_total{event}`. (Częściowo pokryte w istniejącym `00-ops-overview`.)

### 19 — Billing / Przychód  ✅
MRR/ARPU/churn (`subscription_safe` + `plan`), `verris_wallet_amount_30d_pln{type}`, `verris_invoices_24h_total`, faktury/dzień, zaległości (`invoice_safe.status`), zobowiązania portfela.

### 20 — Bezpieczeństwo / Incydenty  ✅
`verris_incidents_open{severity}`, `verris_probes_total`, `verris_status_webhook_*`, `verris_backup_present/age`, `verris_migration_worker_jobs_failed`, security-watch (z `alerts.yml`). Login events → `login_event_safe` (opcjonalnie 🟡).

### 21 — Live / NOC (podgląd na żywo)  ✅ + 🟠
Jeden ekran `refresh=5s`: status floty, otwarte incydenty, kolejka provisioningu, error rate API, oczekujące tickety. Węzły „na żywo" 🟠 po domknięciu scrapingu.

---

## 3. Zamknięcie luk danych (co odblokowuje resztę)

Kolejność wg zwrotu z inwestycji:

1. **Migracja widoków `_safe`** (🟡 → ✅) — plik `verris-safe-views-support-monitoring.sql`. Odblokowuje: najczęstsze problemy, najlepsi pracownicy, oceny CSAT, SLA, usługi www, drill po kliencie/usłudze. **Najtańsze, największy efekt.**
2. **Domknięcie floty** (🟠 → ✅) — node-exporter w bootstrapie węzła + file-SD z API (`nodes: targets:[]`). Odblokowuje: pojedynczy węzeł, obciążenia, przeciążenia (realne), podgląd na żywo węzłów.
3. **Rozszerzenie `server_safe`** o pojemność/alokację + `dbEngine/dbVersion` → serwery db i „obłożenie per węzeł" z DB (szybciej niż node-exporter).
4. **Exportery** (🔵): blackbox (czas odpowiedzi endpointów + TLS), smartctl (dyski), process-exporter (procesy węzła), snmp/ipmi (sprzęt — tylko gdy własne żelazo).

---

## 4. Uwagi o poprawności (żeby panele nie kłamały)

- Panele SQL **muszą** iść przez widoki `_safe` — `grafana_ro` nie ma SELECT na surowych tabelach. Nowe raporty = najpierw widok, potem panel.
- `subscription_safe` w migracji `0_init` **nie** zawiera `priceAmount`; istniejący `04-business.json` go używa, więc albo widok został rozszerzony w późniejszej migracji, albo ten panel nie liczy MRR. **Do weryfikacji na żywej bazie** przed oparciem o to raportów przychodu (zgodnie z zasadą „claims vs code"). MRR pewne źródło: API `BusinessMetricsService` (liczy z `priceAmount` + normalizacją rok→mies.).
- Jednostki: `allocatedCpu` jest w „% rdzenia" (100 = 1 rdzeń), RAM/dysk w MB — przy liczeniu obłożenia trzymać się konwencji z `business-metrics.service.ts`.
- CSAT to skala 1–5 (`Ticket.csatRating`); progi kolorów w dashboardzie: <3 czerwony, ≥4 zielony.

---

## 5. Co dostajesz teraz w tej paczce

- `06-support.json` — działający dashboard Support (KPI z Prometheusa od razu; panele SQL po pkt 1).
- `verris-safe-views-support-monitoring.sql` — widoki `ticket_safe / ticket_reply_safe / site_monitor_safe / site_monitor_event_safe` + GRANT (do przeniesienia w migrację Prisma).
- ten katalog — mapa wszystkich dashboardów do zbudowania, z gotowością danych.

Kolejny krok: po wgraniu widoków (pkt 1) zbuduję resztę partiami wg tego katalogu — Klienci, Usługi, Usługi www, Wydajność API, Flota, Live/NOC — jako gotowe pliki JSON do `provisioning`.
