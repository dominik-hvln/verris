# Architektura monitoringu Verris — rozbudowa obecnego stacku do poziomu (i ponad) Zabbix

**Status:** decyzja robocza — zostajemy na Prometheus/Grafana/Loki i mocno go rozbudowujemy
**Data:** 2026-07-14
**Autor decyzji:** Dominik
**Zakres:** parytet graficzny z Zabbixem, domknięcie floty, pełne pokrycie sprzętu, integracja paneli admin+staff
**Rozważona alternatywa:** pełne wdrożenie Zabbix (Aneks B — kiedy warto do niej wrócić)

---

## 1. Decyzja i uzasadnienie

Zostajemy na istniejącym stacku (**Prometheus + Grafana + Loki + Alerting + uptime**) i **mocno go rozbudowujemy**, zamiast dokładać równoległy Zabbix. Powód jest prosty i wynika z jednego faktu, który przesądza całość:

> **Prezentacja graficzna, którą kojarzysz z Zabbixem, to w praktyce robota Grafany — narzędzia, które już masz.** Natywne ekrany Zabbixa są leciwe; bardzo częsty wzorzec w firmach hostingowych to Zabbix jako kolektor **wpięty do Grafany** dla ładnej wizualizacji. Skoro warstwę prezentacji już masz, „dogonienie Zabbixa graficznie" nie oznacza stawiania Zabbixa — oznacza **dobudowanie danych i widoków** w obecnym stacku.

Realna luka nie jest więc w narzędziu do rysowania, tylko w dwóch rzeczach:
1. **Kompletność zbieranych danych** — job `nodes` w `prometheus.yml` ma jeszcze `targets: []` (flota compute nie jest domknięta), brakuje kilku exporterów (endpoint/TLS, sprzęt, dyski).
2. **Zbudowanie konkretnych widoków** — map topologii, per-host dashboardów, ekranu problemów — których Zabbix daje trochę z pudełka, a które w Grafanie składamy (raz).

Obie to praca **wewnątrz** stacku, który utrzymujesz — bez drugiego kolektora, bez podwójnych alertów, bez narzutu HA/proxy dla dwóch systemów.

---

## 2. Parytet graficzny — co Zabbix pokazuje ⟶ czym to robimy w Grafanie

To jest serce tego dokumentu i odpowiedź na Twoją uwagę o prezentacji. Dla każdej „firmowej" funkcji graficznej Zabbixa jest odpowiednik w Grafanie — zwykle elastyczniejszy.

| Funkcja graficzna Zabbixa | Odpowiednik w Grafanie | Uwaga |
|---|---|---|
| **Maps** — mapa topologii infry z żywym statusem (kolory węzłów/łączy) | **Canvas panel** — elementy kolorowane zapytaniem, data-linki do drilldownu | Bezpośredni odpowiednik, bardziej elastyczny; do relacji także **Node Graph** panel |
| **Host screens** — auto-widok per host | **Dashboard z templatingiem** (zmienna `$instance`/`$node`, dropdown per host) + import **„Node Exporter Full"** | Jeden dashboard obsługuje całą flotę; „Node Exporter Full" to złoty standard, bardzo bogaty |
| **Problems / triggers overview** — ekran aktywnych problemów wg severity | **Alert list panel** + dedykowany dashboard „Problemy" (tabela/stat kolorowane severity) | Zasilane z Alertmanagera/Grafana Alerting |
| **Latest data / item overview** | Panele **Table** + **Stat** + **Gauge** | — |
| **Geographical map** (wiele DC/lokalizacji) | **Geomap panel** | Hetzner/OVH WAW jako punkty ze statusem |
| **Graphs / trends** (natywne wykresy) | Panele **Time series** (ładniejsze niż natywny Zabbix) | To właśnie po to ludzie wpinają Zabbix do Grafany |
| **Aggregated / SLA** | Grafana + **recording rules** Prometheusa | SLA miesięczne spójne z §15 oferty |
| **Trigger dependencies** | **Canvas** + data-linki / **Node Graph** | Relacje i drilldown |

Wniosek: **nie tracisz nic graficznie, a zyskujesz spójny system** (jeden język dashboardów, jeden datasource-owy model), zamiast dwóch estetyk i dwóch UI.

---

## 3. Domknięcie zbierania danych (bez danych nie ma wykresów)

Parytet graficzny wymaga najpierw kompletnych danych. Kolejność:

1. **Flota compute — domknąć job `nodes`.** Dziś `targets: []` z komentarzem „switch to file_sd once bootstrap exposes 9100". To jest ta realna robota: bootstrap węzła (`ops/scripts`) wystawia node-exporter na :9100 i **API dopisuje target do pliku file-SD**, który Prometheus przeładowuje automatycznie. Tagowanie targetów: `region`, `dc`, `rola`, `dostawca`, **`klient_id`/`subskrypcja_id`** (potrzebne w §5).
2. **Endpoint / TLS / porty — `blackbox_exporter`.** Zastępuje część `synthetic-check.sh` metrykami (HTTP 200/redirect, czas odpowiedzi, **dni do wygaśnięcia TLS**). Zasila widoki „usługa up/down" i alerty certyfikatów z `monitors.md`.
3. **Dyski fizyczne — `smartctl_exporter`.** SMART/health dysków na węzłach — to realny plus dla hostingu (przewidywanie padów dysków), którego dziś nie masz.
4. **Sprzęt out-of-band (jeśli/gdy jest) — `snmp_exporter` / `ipmi_exporter`.** To jedyny obszar, w którym Zabbix bywa wygodniejszy; jeśli kiedyś dojdzie własne kolokowane żelazo (switche, PDU, IPMI/BMC, UPS), dokładamy exporter — a gdyby tego było dużo, wtedy dopiero jest realny argument za Zabbixem (Aneks B).
5. **Procesy / usługi krytyczne — `process-exporter`** tam, gdzie trzeba pilnować konkretnych demonów.

Postgres, Redis, Docker, logi (Loki), błędy (GlitchTip) — **zostają jak są**, już działają.

---

## 4. Podział: DECYZJE TERAZ vs. POJEMNOŚĆ PÓŹNIEJ

Oś, o którą prosiłeś. Reguła: rzeczy drogie do cofnięcia robimy dobrze na starcie; pojemność i kolejne widoki dokładamy iteracyjnie.

### 4A. DECYZJE / fundament TERAZ (drogie do przebudowy przy setkach serwerów)

1. **Taksonomia i etykiety (labels) — jedno źródło prawdy.** Spójna konwencja labeli na wszystkich targetach: `region`, `dc`, `rola`, `dostawca`, `tier`, **`klient_id`/`subskrypcja_id`**. To fundament map, per-host dashboardów i integracji staff (§5). Najdroższa rzecz do przerobienia później. Musi pochodzić z tego samego modelu w API, który pisze file-SD.
2. **File-SD z API jako mechanizm rejestracji węzłów.** „Nowy węzeł = wpis przez API do pliku targetów", nigdy ręcznie. To jest Twój odpowiednik auto-registration z Zabbixa i skaluje się liniowo.
3. **Dashboardy jako kod (provisioning).** Masz już `grafana/provisioning/dashboards/json/*` — trzymamy ten wzorzec: każdy nowy dashboard w gicie, wgrywany przez provisioning, nie klikany ad-hoc.
4. **Recording rules + retencja.** Zdefiniować recording rules dla agregatów/SLA i politykę retencji Prometheusa (oraz plan long-term storage, patrz 4B). Zmiana modelu danych później boli.
5. **Konwencja severity i deduplikacja alertów** — spójna z istniejącym `alerts.yml`, jeden alert = jedno źródło.
6. **Service account + dostęp do integracji paneli** (§5) — read-only, token w sekrety.

### 4B. POJEMNOŚĆ / widoki PÓŹNIEJ (addytywne, bez przebudowy)

- **Long-term storage** (Thanos lub Mimir) — gdy retencja i skala metryk floty urośnie; dokładane obok Prometheusa, nie przeróbka. (Odpowiednik „TimescaleDB od startu" z wariantu Zabbix, ale bierzesz go, gdy realnie potrzebny.)
- **HA Prometheusa** (druga instancja + dedup w Thanos) — przy krytyczności/ skali.
- **Kolejne dashboardy i mapy** — per-usługa, per-klient, geo — iteracyjnie.
- **Kolejne exportery** (snmp/ipmi) — w miarę pojawiania się sprzętu.
- **Rozszerzanie integracji paneli** o trendy/historię.

> W tym wariancie „mocno rozbudować" znaczy: **dużo pracy nad danymi i dashboardami, mało nowej infry.** To odwrotność wariantu Zabbix, gdzie dokładasz cały drugi system. Przy Twoim celu (parytet graficzny + profesjonalny obraz floty) to tańsza i czystsza droga do tego samego efektu wizualnego.

---

## 5. Integracja z panelami (admin + staff)

Zasada: ciężkie widoki wizualne → **embed Grafany**; maszynowe statusy renderowane we własnym UI → **Prometheus HTTP API** (`/api/v1/query`) i/lub Alertmanager API. Panel nigdy nie odpytuje bezpośrednio — pośredniczy `apps/api` (cache w Redisie 30–60 s, service account/token w sekrety).

### Panel admina (`apps/admin-panel`)
- **Zdrowie floty:** węzły up/down, top obciążone (CPU/RAM/dysk), aktywne problemy wg severity — część jako natywne kafelki (z Prometheus API), część jako **embed dashboardu Grafany** (fleet + mapa Canvas).
- **Badge alertów** w nagłówku: liczba otwartych High/Critical z Alertmanagera, link do „Problemów".
- Spójne z istniejącą logiką alertów (`alerts.yml` już odsyła do „admin → Kolejka provisioningu" itd.).

### Panel staff (`apps/staff-panel`)
- **Inline status węzła przy kliencie/usłudze:** „serwer klienta 🟢/🔴 od X min" przy obsłudze zgłoszenia. Zapytanie po `klient_id` → instancja → stan up + kluczowe metryki. Bez wykresów i szczegółów NOC — support potrzebuje odpowiedzi „czy działa teraz".
- Read-only, ten sam cache i konto co admin.

### Czego NIE robimy
- Nie wystawiamy Grafany publicznie „na dziko" w iframe bez autoryzacji — używamy signed embed / service account.
- Nie wrzucamy staffowi pełnego NOC-a.

---

## 6. Alerting i on-call (bez zmian koncepcyjnych)

- Masz już Grafana Unified Alerting + `alerts.yml` + contact pointy (Slack/e-mail). Rozbudowa: **eskalacje i harmonogram dyżurów** (Opsgenie/PagerDuty) dla ścieżek twardych (API down, węzeł down, dysk krytyczny).
- **Niezależny zewnętrzny uptime (`ops/uptime/monitors.md`) zostaje** — musi stać poza infrą Verrisa; to druga, niezależna ścieżka alertu (SMS/telefon), której żaden wewnętrzny system nie zastępuje.
- Deduplikacja: jeden alert = jedno źródło; przy dokładaniu `blackbox` uważać, by nie dublować z synthetic.

---

## 7. Kolejne kroki (kolejność wdrożenia)

1. **Zatwierdzić taksonomię labeli** (§4A p.1) — na papierze, przed resztą.
2. **Domknąć flotę:** node-exporter w bootstrapie + file-SD z API (`nodes` `targets: []` → żywe targety z labelami).
3. **Dołożyć exportery:** `blackbox` (endpoint/TLS), `smartctl` (dyski). SNMP/IPMI tylko jeśli jest sprzęt.
4. **Zbudować widoki-parytet:** import „Node Exporter Full", per-host dashboard z `$instance`, **mapa Canvas** floty, dashboard **„Problemy"**, **Geomap** DC.
5. **Recording rules + retencja**; zaplanować long-term storage (4B) jako next.
6. **Integracja paneli:** endpointy w `apps/api` (cache, service account) → widget admin + inline staff.
7. **On-call:** eskalacje Opsgenie/PagerDuty; zostawić niezależny uptime.
8. **Weryfikacja:** próbny scenariusz „węzeł down → alert → widoczne w mapie, w panelu admin i inline w staff", test braku duplikatów.

---

## Aneks A — porównanie kosztu obu dróg

| | Rozbudowa obecnego stacku (ten dokument) | Pełny Zabbix (Aneks B) |
|---|---|---|
| Nowa infra | brak (dokładasz exportery + long-term storage później) | Zabbix Server + TimescaleDB + proxy×DC + HA |
| Prezentacja graficzna | Grafana (już masz) — mapy Canvas, per-host, geo | Grafana i tak zwykle dokładana na wierzch Zabbixa |
| Metryki biznesowe `verris_*` | natywnie (Prometheus) | zostają w Prometheusie i tak — dwa systemy |
| Ryzyko podwójnych alertów | brak | realne (dwa kolektory) |
| Koszt operacyjny | rozbudowa istniejącego | utrzymanie DRUGIEGO systemu obok |
| Kiedy wygrywa | infra kontenerowa/dedyki (Twój przypadek) | duży park własnego żelaza SNMP |

---

## Aneks B — kiedy WRÓCIĆ do Zabbixa

Ta decyzja jest odwracalna. Zabbix staje się realnie uzasadniony, gdy pojawi się **duży park sprzętu zarządzanego przez SNMP/IPMI** — własne kolokowane szafy: switche, PDU, BMC, UPS, macierze. Wtedy natywne SNMP i gotowe template'y Zabbixa dają przewagę, której `snmp_exporter` nie dogoni wygodą. W takim scenariuszu i tak wpinasz Zabbix **do Grafany** (ten sam ekran co teraz), więc warstwa prezentacji z tego dokumentu nie idzie do kosza. Do tego czasu rozbudowa obecnego stacku daje ten sam efekt graficzny taniej i bez redundancji.

*(Szczegółowy plan pełnego wdrożenia Zabbix — architektura Server+proxy+HA+TimescaleDB, taksonomia, on-call — jest przygotowany osobno i można go aktywować, jeśli wejdziesz w scenariusz z Aneksu B.)*
