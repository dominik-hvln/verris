> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** macierz 352 pozycji z dowodami plik:linia (`audyt/dane/macierz.csv`) oraz raport audytu z 2026-08-20 (pozycja M-31). Zasady biznesowe uratowano do `docs/architektura/ZASADY_ZMIANY_PLANU.md`
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Zmiana planu (upgrade / downgrade) — plan sprintów

> **Stan (2026-05-20):** **PC-1 … PC-3 wdrożone w kodzie** (self-service + admin/staff). **PC-4** (MONTH↔YEAR, check dysku) i synchronizacja regulaminu §6 — follow-up przed publikacją prawną.

**Cel produktowy:** ta sama subskrypcja, to samo konto DA (`daUsername`, domena, pliki) — zmiana `planId` z rozliczeniem proporcjonalnym (portfel lub Stripe), nowymi limitami LVE/dysku i audytem.

---

## Zasady LIVE (nie MVP)

- Upgrade i downgrade na **ACTIVE** subskrypcji z przypisanym kontem.
- **Proration** za pozostały okres (`currentPeriodStart` → `currentPeriodEnd`).
- **Źródła płatności:** `WALLET` (debit/credit z portfela), `STRIPE_CARD` (update Subscription Item + invoice/proration przez Stripe).
- Po zmianie planu: sync **DirectAdmin** (`setAccountLimits` z nowego planu); polityka delty autoskalowania (patrz PC-1.6).
- Brak wymogu „nowa domena / nowy zakup” — migracja danych między kontami **nie** jest częścią tego flow.

---

## Sprint PC-1 — Silnik zmiany planu (LIVE)

**Cel:** API i billing poprawnie zmieniają plan na istniejącej subskrypcji; DA i DB pozostają spójne.

### Taski

| ID | Task | Kryterium DONE |
|----|------|----------------|
| PC-1.1 | `PlanChangeService`: kalkulacja proration (upgrade = dopłata, downgrade = uznanie na portfel) | Unit testy: miesiąc/rok, 1 dzień / połowa okresu, ta sama waluta PLN |
| PC-1.2 | `POST /subscriptions/:id/plan/preview` — lista dozwolonych planów + `amountDue` / `amountCredit` bez side-effectów | Tylko plany `isPublic && isActive`; nie można „zmienić” na ten sam plan |
| PC-1.3 | `PATCH /subscriptions/:id/plan` — commit zmiany: `planId`, snapshot `priceAmount`, event `PLAN_CHANGED` | Transakcja DB atomowa; `SubscriptionEvent` z `fromPlanId` / `toPlanId` |
| PC-1.4 | Portfel: `CHARGE_PLAN_UPGRADE` / `CREDIT_PLAN_DOWNGRADE` (lub `ADJUSTMENT` z reason) + idempotency key | Saldo ≥ 0 po upgrade; credit przy downgrade widoczny w historii |
| PC-1.5 | Stripe: `subscriptions.update` — nowy Price ID (month/year z `interval`) + obsługa webhooków proration | Test na Stripe test mode; brak rozjazdu z `stripeSubscriptionId` |
| PC-1.6 | Polityka autoskalowania przy zmianie planu: reset `scaledCpu/Ram/Disk` → 0, limity = nowy plan, opcjonalnie wyłączenie AS jeśli nowy plan < stary efektywny limit | DA `setAccountLimits` przed commit DB; failure DA = rollback |
| PC-1.7 | Walidacje: status `ACTIVE`, brak `PENDING_PAYMENT`/`CANCELED`, ten sam `interval` (lub jawna reguła zmiany month↔year) | API 400 z czytelnym komunikatem PL |
| PC-1.8 | Audyt: `PLAN_CHANGED` w `AuditLog` + actor (klient / admin) | Staff widzi w CRM timeline subskrypcji |

**Szacunek:** 1 sprint (2 tyg.)

---

## Sprint PC-2 — Panel klienta (LIVE)

**Cel:** klient widzi koszt i skutek zmiany planu; jeden flow bez nowego zakupu.

### Taski

| ID | Task | Kryterium DONE |
|----|------|----------------|
| PC-2.1 | Strona `/dashboard/services/[id]/plan` — aktualny plan, tabela porównania limitów/cen | Link z karty usługi i listy usług |
| PC-2.2 | Wybór planu docelowego + wywołanie `preview` — blok podsumowania (dopłata / zwrot K) | Kwoty w K z disclaimerem faktura PLN |
| PC-2.3 | Potwierdzenie (checkbox „rozumiem reset autoskalowania” jeśli PC-1.6 resetuje delty) + `PATCH` | Sukces → toast + odświeżenie limitów na karcie usługi |
| PC-2.4 | Blokada przy niewystarczającym saldzie (upgrade + WALLET) — CTA do portfela | Ten sam wzorzec co autoskalowanie / wallet empty |
| PC-2.5 | E-mail `plan-changed` (PRODUCT_UPDATE): stary plan → nowy, kwota proration, link do usługi | Szablon w `email-shell` |
| PC-2.6 | Copy zgodne z `PANEL_UX_PLAN.md` — bez obietnic „przeniesienia bez zmiany usługi” tam gdzie nie dotyczy | QA copy pass |

**Szacunek:** 1 sprint (2 tyg.), zależny od PC-1.

---

## Sprint PC-3 — Admin, staff, jakość (LIVE)

**Cel:** support i operator mogą bezpiecznie pomóc; produkt domknięty operacyjnie.

### Taski

| ID | Task | Kryterium DONE |
|----|------|----------------|
| PC-3.1 | Admin/staff: `POST /admin/subscriptions/:id/plan` z powodem (override bez portfela opcjonalnie) | RBAC ADMIN; audyt z `actorUserId` |
| PC-3.2 | Staff CRM: akcja „Zmień plan” na subskrypcji + szablon odpowiedzi ticketa | Runbook w `LIVE_RELEASE_RUNBOOK.md` |
| PC-3.3 | Testy integracyjne: preview + change (wallet), mock DA | CI green na PR |
| PC-3.4 | Metryka `plan_changes_total{direction=up|down}` + log strukturalny | Grafana panel (opcjonalnie w tym samym PR co AS-3.3) |
| PC-3.5 | Regulamin §6: dopasować do faktycznego flow (self-service + proration) przed publikacją prawną | Lawyer-ready draft zsynchronizowany |

**Szacunek:** 1 sprint (2 tyg.), częściowo równolegle z PC-2.

---

## Kolejność i zależności

```mermaid
flowchart LR
  today["Dziś: tylko nowy zakup"]
  PC1["PC-1 Silnik + billing"]
  PC2["PC-2 Panel klienta"]
  PC3["PC-3 Admin + QA"]
  today --> PC1
  PC1 --> PC2
  PC1 --> PC3
  PC2 --> PC3
```

| Sprint | Priorytet | Blokuje sprzedaż / compliance? |
|--------|-----------|--------------------------------|
| **PC-1** | P1 | Tak, jeśli marketing/regulamin obiecuje zmianę planu |
| **PC-2** | P1 | Tak dla self-service (bez PC-2 zostaje tylko support ręczny) |
| **PC-3** | P2 | Nie dla klienta końcowego — jakość operacji |

---

## PC-4 — okres rozliczeniowy + walidacja dysku (LIVE)

| ID | Zakres |
|----|--------|
| **PC-4.1** | `targetInterval` w preview/change; proration cross-interval; reset okresu przy MONTH↔YEAR (portfel + sync Stripe) |
| **PC-4.2** | Blokada downgrade gdy `peakDiskUsageMb` (48 h) > `target.diskLimitMb` |

## Poza zakresem (follow-up / faza 2)

| Temat | Uzasadnienie |
|-------|----------------|
| Zmiana planu z przeniesieniem na inny węzeł | To **migracja wewnętrzna** (już jest osobno), nie change plan |
| Plan custom / negocjowany per klient | Admin manual pricing — **PC-4.3** |

---

## Powiązane dokumenty

- [`SPRINT_PLAN.md`](./SPRINT_PLAN.md) — roadmap ogólna
- [`ROADMAP_GAPS.md`](./ROADMAP_GAPS.md) — U-07 (źródło wymagania)
- [`AUTOSCALING_SPRINT_PLAN.md`](./AUTOSCALING_SPRINT_PLAN.md) — autoskalowanie (komplementarne, nie zamiennik planu)
- [`docs/legal/drafts/terms.md`](./docs/legal/drafts/terms.md) — §6 ust. 5
- [`LIVE_RELEASE_RUNBOOK.md`](./LIVE_RELEASE_RUNBOOK.md) — deploy
