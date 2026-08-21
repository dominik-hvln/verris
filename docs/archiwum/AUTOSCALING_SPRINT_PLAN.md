> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** macierz 352 pozycji z dowodami plik:linia (`audyt/dane/macierz.csv`) oraz raport audytu z 2026-08-20 (pozycje J-08…J-11) oraz plan 19 sprintów
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Autoskalowanie — plan sprintów (CPU / RAM / Dysk)

> **Stan wdrożony (2026-05-20):** katalog 3× zasoby, **AS-1 … AS-3** w kodzie (tier validation, symulator admin, metryki, raport `/autoscaling/revenue`).

---

## Zrealizowane w tym commicie

| Obszar | Zmiana |
|--------|--------|
| Schema + migracja | `AutoscalingResource.DISK`, dezaktywacja aktywnych reguł IO/TRANSFER |
| API | `listPublic` / `estimate` tylko CPU, RAM, DISK; cena RAM i dysk **za 1 GB / godz.** |
| Admin | Tabela pogrupowana, edycja ceny + progu + notatki, archiwum legacy |
| Klient | Kalkulator: 3 suwaki (CPU %, RAM MB, Dysk MB) |

---

## Sprint AS-1 — Silnik: autoskalowanie dysku (LIVE)

**Cel:** gdy metryki / polityka wymagają więcej miejsca, silnik zwiększa `diskLimitMb` na koncie DA i zapisuje deltę w DB; billing godzinowy uwzględnia `scaledDiskMb`.

### Taski

| ID | Task | Kryterium DONE |
|----|------|----------------|
| AS-1.1 | Schema: `Account.scaledDiskMb` (domyślnie 0), opcjonalnie `AutoscalingEvent` dla DISK | Migracja + seed kompatybilny wstecz |
| AS-1.2 | Telemetria: bucket `diskUsageMb` vs `diskLimitMb` w `UsageMetric` (jeśli brak — uzupełnić collector LVE/DA) | ≥5 minut historii na koncie testowym |
| AS-1.3 | `AutoscalingEngineService`: reguły UP/DOWN dla dysku (np. ≥85% przez 3/5 bucketów, krok 25% planu, max 3× plan) | Test integracyjny na stagingu z mock DA |
| AS-1.4 | `DirectAdminClient.setAccountLimits` — pole dysku (quota MB) zsynchronizowane z panelem | Po scale-up limit w DA = plan + delta |
| AS-1.5 | `AutoscalingBillingScheduler`: `estimateHourlyCost` z `scaledDiskMb` | Portfel obciążany przy delta dysku > 0 |
| AS-1.6 | Panel klienta: karta usługi pokazuje aktualny limit dysku + deltę autoskalowania | Spójne z CPU/RAM |
| AS-1.7 | Audyt: `AutoscalingEvent` z `resource=DISK`, reason codes | Wpis w timeline autoskalowania |

**Szacunek:** 1 sprint (2 tyg.)

---

## Sprint AS-2 — UX i limity per zasób (CPU / RAM / dysk) (LIVE) ✅ kod

**Cel:** klient rozumie koszt dysku; admin ma kontrolę nad maksymalnym overscale.

### Taski

| ID | Task | Kryterium DONE |
|----|------|----------------|
| AS-2.1 | Formularz autoskalowania: osobny suwak / toggle „Skaluj dysk” (domyślnie zgodnie z `autoscalingEnabled`) | Zapis w `Subscription` lub flaga per-resource |
| AS-2.2 | Kalkulator: prefill z aktualnej delty konta (jeśli zalogowany) | Deep-link z `/dashboard/services/[id]/autoscaling` |
| AS-2.3 | Admin: reguła max overscale dysku per plan (AppConfig lub pole planu) | Brak skalowania ponad X× plan bez override admina |
| AS-2.4 | Powiadomienie e-mail / in-app przy scale-up dysku (opcjonalnie przy >N MB) | Szablon w `email-shell`, kategoria PRODUCT_UPDATE |
| AS-2.5 | Runbook: procedura ręcznego shrink dysku (support) | `LIVE_RELEASE_RUNBOOK.md` + staff CRM |

**Szacunek:** 1 sprint (2 tyg.), zależny od AS-1.

---

## Sprint AS-3 — Tier pricing i analityka (LIVE)

**Cel:** wielopoziomowy cennik per zasób działa end-to-end; product ma widoczność marży.

### Taski

| ID | Task | Kryterium DONE |
|----|------|----------------|
| AS-3.1 | Walidacja tierów: nie dopuszczać nakładających się aktywnych reguł tego samego progu | API 400 + komunikat w admin UI |
| AS-3.2 | Podgląd „efektywnej stawki” w admin przy edycji (symulator jak w kalkulatorze) | Inline pod formularzem |
| AS-3.3 | Metryki Prometheus: `autoscaling_charges_total{resource}`, `autoscaling_scale_events_total` | Dashboard Grafana |
| AS-3.4 | Raport admin: przychód autoskalowania 30d per zasób (CPU/RAM/DISK) | Eksport CSV lub widok `/autoscaling/revenue` |

**Szacunek:** 1 sprint (2 tyg.)

---

## Kolejność i zależności

```mermaid
flowchart LR
  done["Wdrożone: cennik 3×"]
  AS1["AS-1 Silnik dysk"]
  AS2["AS-2 UX dysk"]
  AS3["AS-3 Tier + analytics"]
  done --> AS1
  AS1 --> AS2
  AS1 --> AS3
  AS2 --> AS3
```

| Sprint | Priorytet | Blokuje sprzedaż LIVE? |
|--------|-----------|-------------------------|
| **AS-1** | P0 | Tak, jeśli obiecujemy autoskalowanie dysku w marketingu |
| **AS-2** | P1 | Nie — UX i bezpieczeństwo operacyjne |
| **AS-3** | P2 | Nie — optymalizacja biznesowa |

---

## Powiązane dokumenty

- [`PANEL_UX_PLAN.md`](./PANEL_UX_PLAN.md) — copy pass (#7) ✅
- [`SPRINT_PLAN.md`](./SPRINT_PLAN.md) — roadmap ogólna
- [`LIVE_RELEASE_RUNBOOK.md`](./LIVE_RELEASE_RUNBOOK.md) — deploy + migracje
