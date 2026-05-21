# Sprint B — audyt paneli (100% LIVE)

> Data: 2026-05-21 · Gałąź: `live-release-readiness` · Prod API: `4bb78cf` (healthy)

## Podsumowanie

| Panel | Mocki / stuby w UI | Empty/error states | Akcja Sprint B |
|-------|-------------------|-------------------|----------------|
| **Klient** | Brak literalnych mocków | Hosting tools: `PanelFetchError`, `HostingNoServiceState` | Feature gates EKO/IAM/referral (env) |
| **Staff** | — (do przejścia ręcznego) | Timeline, tickety — real API | Follow-up smoke |
| **Admin** | — | Product-ops, provisioning — real API | Follow-up smoke |
| **Status** | Public badge bez PII | operational/degraded | ✅ testy Sprint A |

## Panel klienta — ekrany

| Ścieżka | Status | Uwagi |
|---------|--------|-------|
| `/dashboard` | ✅ real | Błędy partial fetch z komunikatem |
| `/dashboard/services` | ✅ real | Plan change, autoscaling, DA |
| `/dashboard/services/new` | ✅ real | Stripe/portfel, provisioning |
| `/dashboard/billing` | ✅ real | Portfel, faktury, promo |
| `/dashboard/domains` | ✅ real | Checklist; rejestrator tylko gdy `configured` |
| `/dashboard/domains/registrar` | ✅ ukryte / fail-closed | Strona informacyjna bez providera |
| `/dashboard/dns`, `ssl`, `email`, `ftp`, `cron`, `databases`, `file-manager`, `backups` | ✅ real | DA + empty/error |
| `/dashboard/migrations` | ✅ real | Worker protocol (API) |
| `/dashboard/support` | ✅ real | Tickety, załączniki |
| `/dashboard/eco` | 🔒 gate | `NEXT_PUBLIC_FEATURE_ECO=true` aby włączyć |
| `/dashboard/referral` | 🔒 gate | `NEXT_PUBLIC_FEATURE_REFERRAL=true` |
| `/dashboard/iam` | 🔒 gate | `NEXT_PUBLIC_FEATURE_IAM=true` |
| `/dashboard/calculator` | ✅ real | Autoscaling pricing |
| `/legal/*` | ✅ real | Wersje z API |

## Zmiany wdrożone (Sprint B)

1. **`client-features.ts`** — flagi env dla EKO, IAM, program partnerski.
2. **Nawigacja** — pozycje ukryte domyślnie (zgodnie z `LIVE_PRODUCT_SCOPE_DECISION.md`).
3. **Strony gated** — bezpośredni URL pokazuje `FeatureNotAvailable`.
4. **Dashboard** — stat/chart/quick action EKO tylko przy włączonej fladze.

## Env (client-panel)

```bash
# Domyślnie wyłączone — włącz po decyzji produktowej
NEXT_PUBLIC_FEATURE_ECO=false
NEXT_PUBLIC_FEATURE_IAM=false
NEXT_PUBLIC_FEATURE_REFERRAL=false
```

## Otwarte (Sprint B — dokończenie)

- [ ] Przejście **staff-panel** ekran po ekranie (tickety 360, impersonacja, timeline).
- [ ] Przejście **admin-panel** (provisioning queue, NOC, product-ops).
- [ ] Ukryć linki AI w staff jeśli `AI_API_KEY` pusty (follow-up).
- [ ] Spójność copy na dashboardzie (tekst „program EKO” przy wyłączonej fladze).

## Sprint C (następny)

Zobacz `LIVE_READINESS_PLAN.md` § Sprint C: backup off-site, alerty Grafana, `PROD_HEALTH_CHECKLIST.md`.
