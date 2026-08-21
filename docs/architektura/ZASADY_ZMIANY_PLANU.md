# Zasady biznesowe zmiany planu (upgrade / downgrade)

<!-- Uratowane z PLAN_CHANGE_SPRINT_PLAN.md przy porządkowaniu repo 2026-08-21.
     Reszta tamtego dokumentu trafiła do docs/archiwum/ jako nieaktualna. -->

> Zweryfikowane w audycie 2026-08-20 i **potwierdzone w kodzie**: `plan-proration.util.ts:47`
> (proracja, w tym między interwałami MONTH↔YEAR) oraz `plan-change.service.ts`. Pozycja `M-31`
> w macierzy ma werdykt PRZEWAGA i jest jedną z najlepiej pokrytych testami rzeczy w repozytorium.

- Upgrade i downgrade na **ACTIVE** subskrypcji z przypisanym kontem.
- **Proration** za pozostały okres (`currentPeriodStart` → `currentPeriodEnd`).
- **Źródła płatności:** `WALLET` (debit/credit z portfela), `STRIPE_CARD` (update Subscription Item + invoice/proration przez Stripe).
- Po zmianie planu: sync **DirectAdmin** (`setAccountLimits` z nowego planu); polityka delty autoskalowania (patrz PC-1.6).
- Brak wymogu „nowa domena / nowy zakup” — migracja danych między kontami **nie** jest częścią tego flow.

---
