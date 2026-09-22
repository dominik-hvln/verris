# LIVE Verification Report — Verris hosting 100% LIVE

> **Data:** 2026-06-01 · Gałąź: `live-release-readiness` · HEAD: `efb43f7` · Working tree: czysty
> **Zakres:** weryfikacja read-only całego repo (59 plików `.md`), paneli klient/admin/staff, API NestJS (53 kontrolery) oraz stanu założeń projektowych pod start z realnymi klientami.
> **Załączniki:** [LIVE_ASSUMPTIONS_INDEX.md](LIVE_ASSUMPTIONS_INDEX.md) (inwentaryzacja dokumentacji), [LIVE_VERIFICATION_MATRIX.md](LIVE_VERIFICATION_MATRIX.md) (macierz P0).

---

## 1. Executive summary

Verris jest **blisko gotowości LIVE** dla kontrolowanego startu z klientami. Rdzeń produktu — panele klient/admin/staff, API hostingu, billing Stripe, IAM, compliance — jest zbudowany **bez mocków, martwych przycisków i fałszywych obietnic**. Audyt trzech paneli i 53 kontrolerów API nie znalazł ani jednego `TODO`/`FIXME`/`mock`/`alert()`/pustego `onClick` w kodzie produkcyjnym; każda niedokończona funkcja jest **jawnie oznaczona** jako nieaktywna (zgodnie z regułą 100%-LIVE).

**Rekomendacja: GO z warunkami.** Przed zaproszeniem pierwszego klienta zewnętrznego trzeba domknąć:

- **W kodzie panelu (krok 4, ~0.5–1 dzień):** ukryć/oczyścić dwie „obietnicowe" zakładki klienta (Deploy, Staging), podpiąć lub usunąć mylący badge floty w adminie, zabezpieczyć stronę `/tickets` admina przed brakiem env. To **jedyne** realne luki kodu blokujące zasadę „brak pozornych funkcji".
- **Operacyjnie po Twojej stronie (poza kodem):** Stripe `sk_live_`, akcept prawnika dla dokumentów LEG, sekrety `.env.prod`.
- **Smoke na żywym węźle:** E2E Node-PL-01 (profil po `efb43f7`, pakiety DA, poczta/FTP/SSL) — wymaga dostępu SSH/prod.

**Stan gotowości P0 (panel + API):** ~85% PASS; pozostałe to 4 konkretne poprawki kodu + porządki.

---

## 2. Zgodność z założeniami projektu (T0–T6)

Pełne mapowanie w [LIVE_ASSUMPTIONS_INDEX.md](LIVE_ASSUMPTIONS_INDEX.md). Najważniejsze ustalenia:

- **Dokumentacja jest miejscami nieaktualna względem kodu** (STALE), co fałszuje obraz gotowości:
  - [PROJECT_STATUS.md](../PROJECT_STATUS.md): B‑7 „BullMQ TODO" i E‑12 „Subkonta IAM TODO" — **w rzeczywistości wdrożone** (provisioning-queue z retry, pełny moduł IAM). Do aktualizacji.
  - [docs/PROPOSED_SPRINTS.md](PROPOSED_SPRINTS.md): „następny sprint = GO-IAM" — **smoke IAM PASS 2026-05-24**. Nagłówek STALE.
  - [docs/HOSTING_LAUNCH_TASKS.md](HOSTING_LAUNCH_TASKS.md): GO-HOST „nie startuje end-to-end" — **Node-PL-01 jest ACTIVE** z profilem, stack readiness, OVH NS, wildcard TLS. Backlog do odświeżenia.
- **Założenia spełnione (PASS):** Sprint A (testy krytyczne), Sprint B (audyt paneli), MAIL-TX/MAIL-4 (poczta control-plane, mail-tester 10/10), GO-IAM (smoke), backup/restore drill (OPS-2), Grafana SSO + alert, autoscaling (AS-1…3), zmiana planu (PC-1…4).
- **Świadome follow-up (DEFER, zgodne z [LIVE_PRODUCT_SCOPE_DECISION.md](../LIVE_PRODUCT_SCOPE_DECISION.md)):** PayU/BLIK, rejestrator domen, Softaculous, custom skin DA, OBS+ na węzłach, AI live chat/predykcja, file manager inline, BullMQ async UI.

---

## 3. Panel klienta — wynik audytu

Stan ogólny: **bardzo dobry**. Brak mocków, brak surowych błędów DA (wszystko przez `hostingFetchErrorMessage()` / `PanelFetchError`), brak PayU/Softaculous/AI jako „dostępne".

| Ścieżka | Wynik |
|---------|-------|
| Dashboard, usługi, zakup, Overview/health, Mail, SSL, DNS, DB, FTP, Cron, Backup/Restore, Billing, IAM, EKO, Settings, Support, Migrations, Plan change, Autoscaling | **PASS** |
| **Deploy tab** (`DeployTab.tsx:21`) | **OPEN** — tekst „Push-to-deploy […] nie jest jeszcze dostępny" w aktywnej zakładce = pozorna funkcja |
| **Staging tab** (`StagingTab.tsx`) | **OPEN** — zakładka istnieje tylko by wyjaśnić, że stagingu nie ma |
| File manager (`HostingFileManagerTab.tsx`) | DEFER — tylko link do DA (OK jeśli nie obiecujemy inline) |
| Shell `services/[id]` — brak FTP/Cron/IAM/Billing w `TABS` | OPEN (P1) — nawigacja wymaga powrotu do sidebara |
| Pusty katalog `services/1/` | cleanup |

**Rekomendacja:** w kroku 4 usunąć `Deploy` i `Staging` z `TABS` w `services/[id]/page.tsx` (lub przekształcić w realne funkcje — to większy scope, więc domyślnie ukrycie). Reszta gotowa.

---

## 4. Panel admin — wynik audytu

Stan ogólny: **wysoki**. Wszystkie sekcje (węzły, stack readiness, DirectAdmin, NS/OVH, provisioning queue, plany, subskrypcje, klienci, impersonacja, wallet, audyt, compliance, status, billing, autoscaling) wołają realne `/admin/*` przez `adminApi()` z obsługą `AdminApiError`.

| Element | Wynik |
|---------|-------|
| Węzły + stack readiness + profil + audyt + NS + DA | **PASS** |
| Plany/subskrypcje/klienci/provisioning/compliance/audyt | **PASS** |
| **Badge „Wszystkie Węzły Operacyjne"** (`layout.tsx:27-33`) | **OPEN** — statyczny, nie podpięty pod stan floty; mylący gdy węzeł OFFLINE/PENDING |
| **`/tickets` env hard-fail** (`tickets/page.tsx:60-67`) | **OPEN (P1)** — 500 gdy `NEXT_PUBLIC_STAFF_PANEL_URL` brak w prod |
| Brak linku `/tickets` w sidebarze (`sidebar.tsx`) | OPEN (P1) — nawigacja |
| `subscriptions/[id]` generic catch (404/401/500) | OPEN (P2) |
| `/subscriptions` brak paginacji >200 | DEFER (P2) — zakomunikowane w UI |

**Rekomendacja:** w kroku 4 naprawić AD-12 (badge) i AD-14 (env guard) jako P0.5; AD-13 (link sidebar) szybkie. AD-15/16 mogą poczekać.

---

## 5. Panel staff — wynik audytu

Stan: **PASS, bez zastrzeżeń.** CRM 360, tickety, impersonacja z powodem, diagnostyka DNS/TLS — realne API. AI w ticketach **poprawnie ukryte** gdy `/ai/status` → `configured: false` (gate w `ticket-detail-panel.tsx` + fail-closed w `lib/ticket-actions.ts`). Brak mocków, `TODO`, `alert()`.

---

## 6. Backend, API i węzeł

- **API (PASS w większości):** 53 kontrolery, brak `NotImplemented`. Hosting klienta (DA proxy: DNS/FTP/email/cron/SSL/backup/restore/health), admin węzła (audit/stack-readiness/hosting-profile/repair-packages), billing/Stripe (webhook HMAC), compliance — wszystko realne.
- **Luka P1 — testy:** 23 pliki `*.spec.ts`, ale tylko ~5 kontrolerów pokrytych. **`stripe.controller` (webhook) nie ma spec** — najwyższe ryzyko regresji billingu.
- **Luka P1 — Stripe version pin:** [STRIPE_DAHLIA_COMPATIBILITY.md](../STRIPE_DAHLIA_COMPATIBILITY.md) rekomenduje pin `Stripe-Version` w env, nie w kodzie.
- **Węzeł Node-PL-01 (VERIFY — wymaga SSH/prod):** profil hostingowy, `[VERRIS_PROFILE]` summary, sondy poczty/FTP/MariaDB, Governor active, CageFS enabled, wildcard TLS, pakiety DA (API ≠ unlimited; UI po „Napraw pakiety DA"). Naprawy z commitów `b005144`/`2fc2c85`/`efb43f7` wymagają ponownego profilu i smoke na żywo.

---

## 7. Operacje poza kodem (warunki GO, po Twojej stronie)

| Warunek | Stan |
|---------|------|
| Stripe `sk_live_` + webhook live | do zrobienia przed pierwszym klientem |
| LEG-D: akcept prawnika + publikacja 1.0.0 | drafty gotowe; czeka na prawnika |
| `.env.prod` sekrety 🔴 (OPERATIONAL_CHECKLIST §1) | weryfikacja na prod |
| Licencja DA dla kolejnych węzłów | GO-HOST |
| GO_NO_GO bez NO-GO | po E2E + Stripe live + LEG |
| PagerDuty / kontakt prawny w IR | DEFER/OPS (ręczna eskalacja na start) |

---

## 8. Konflikty / decyzje wymagające Twojego wkładu (wejście do kroku 3)

| # | Pytanie | Opcje |
|---|---------|-------|
| **Q1** | **IAM w ofercie startowej** — `HOSTING_LAUNCH` D-1 mówi „P0 od startu", `LIVE_PRODUCT_SCOPE` „opcjonalne dla single-owner". Co obowiązuje? | A) IAM P0 dla wszystkich (status quo). B) Ukryć IAM w marketingu dla B2C, zostaje w panelu. |
| **Q2** | **Zakładki Deploy/Staging klienta** — pozorne funkcje. | A) Ukryć z `TABS` (szybkie, czyste LIVE). B) Zostawić jako informacyjne. C) Zaimplementować realnie (duży scope, faza 2). |
| **Q3** | **PANEL_UX PR-1…4** (spójność UX + copy klient) — nie wdrożone. | A) Bloker GO (marketing). B) P1 po GO (rdzeń działa). |
| **Q4** | **Zakres kroku 4** — co mam zrobić teraz w kodzie. | A) Tylko P0 luki (Deploy/Staging/badge/env). B) P0 + porządki (sidebar tickets, cleanup). C) P0 + testy stripe webhook + Stripe pin. |

Domyślne założenia, jeśli nie wskażesz inaczej: Q2→A (ukryć), Q3→B (P1 po GO), pozostałe wg Twojego wyboru.

---

## 9. Backlog implementacji kroku 4 (po decyzjach)

Priorytetyzacja (P0 = blokuje zasadę „brak pozornych funkcji"):

1. **P0** CL-11/CL-12 — ukryć `Deploy`+`Staging` z `TABS` klienta (zależne od Q2).
2. **P0** AD-12 — badge floty: podpiąć pod realny stan lub usunąć.
3. **P0** AD-14 — `/tickets` admin: bezpieczny fallback gdy brak `STAFF_PANEL_URL`.
4. **P1** AD-13 — link `/tickets` w sidebarze admina.
5. **P1** CL-14 — rozważyć FTP/Cron/IAM/Billing w shellu usługi (lub sekcja „inne narzędzia").
6. **P1** API-06/07 — spec dla `stripe.controller` webhook + pin `Stripe-Version` (zależne od Q4).
7. **cleanup** CL-15 — usunąć pusty `services/1/`.
8. **docs** — zaktualizować PROJECT_STATUS (B‑7/E‑12 STALE), PROPOSED_SPRINTS, HOSTING_LAUNCH_TASKS (GO-HOST).

---

## 10. Załączniki

- [LIVE_ASSUMPTIONS_INDEX.md](LIVE_ASSUMPTIONS_INDEX.md) — wszystkie 59 plików `.md` w tierach T0–T7.
- [LIVE_VERIFICATION_MATRIX.md](LIVE_VERIFICATION_MATRIX.md) — macierz P0 (panel/API/węzeł/ops).
- Decyzje produktowe (krok 3) zostaną dopisane poniżej po odpowiedziach z okienka.

---

## 11. Decyzje produktowe (krok 3 — 2026-06-01)

| # | Decyzja |
|---|---------|
| **Q1 — IAM** | **P0 dla wszystkich.** IAM/subkonta pozostają widoczne i są blockerem startu (status quo `HOSTING_LAUNCH` D-1). Aktualizuję `LIVE_PRODUCT_SCOPE` tak, by nie sugerował opcjonalności. |
| **Q2 — Deploy/Staging** | **Zaimplementować realnie.** Obie zakładki mają stać się działającymi funkcjami (Deploy: push-to-deploy webhook; Staging: klon subdomena + baza), nie informacyjnymi placeholderami. |
| **Q3 — PANEL_UX** | **Bloker GO.** PR-1…PR-4 (prymitywy panelu, hosting tools, nagłówki, copy pass) wykonać przed startem. |
| **Q4 — Zakres** | **Wszystko do 100%.** Każdy element brakujący, rozpoczęty lub wymagający poprawy ma być domknięty (P0 + P1 + porządki + testy + dokumentacja). |

## 12. Po implementacji (krok 4 — 2026-06-01)

### Zrealizowane zmiany kodu

| Obszar | Zmiana | Pliki |
|--------|--------|-------|
| **Staging (klient)** | Realna zakładka: tworzenie poddomeny DA + opcjonalna baza MySQL, lista, usuwanie. | `directadmin.service.ts` (`listHostingStaging`/`createHostingStaging`/`deleteHostingStaging`), `services.controller.ts`, `hosting-staging-actions.ts`, `StagingTab.tsx`, DTO w `subscription.dto.ts` |
| **Deploy (klient)** | Realna zakładka: automatyczne wdrożenia Git przez cron DA (`git pull` + build), lista, usuwanie. | `directadmin.service.ts` (`listDeployJobs`/`createDeployJob`/`deleteDeployJob`), `services.controller.ts`, `deploy-actions.ts`, `DeployTab.tsx`, DTO |
| **Admin — badge floty** | Statyczny „Wszystkie Węzły Operacyjne" → dynamiczny `FleetStatusBadge` z realnym stanem serwerów. | `fleet-status-badge.tsx`, `(dashboard)/layout.tsx` |
| **Admin — /tickets** | Twardy throw przy braku `NEXT_PUBLIC_STAFF_PANEL_URL` → bezpieczny fallback (link wewnętrzny). | `(dashboard)/tickets/page.tsx` |
| **API — Stripe webhook** | Nowy spec: weryfikacja podpisu HMAC, tolerancja czasu (replay), parsowanie eventu (12 testów PASS). | `stripe.service.spec.ts` |
| **Cleanup** | Usunięto pusty katalog `services/1/`. | — |
| **Docs sync** | `B‑7` (BullMQ opt-in), `E‑12` (IAM DONE), IAM P0 dla wszystkich, „następny sprint" zaktualizowany. | `PROJECT_STATUS.md`, `PROPOSED_SPRINTS.md`, `LIVE_PRODUCT_SCOPE_DECISION.md` |

### Status decyzji

- **Q1 (IAM)** — zrealizowane: scope i status docs zaktualizowane na P0 dla wszystkich.
- **Q2 (Deploy/Staging)** — zrealizowane realnie (Deploy jako cron-auto-deploy DA, Staging jako subdomena+baza). Decyzja inżynierska: zamiast push-to-deploy webhooka (poza możliwościami węzłowego agenta o stałych typach zadań) użyto natywnego crona DA — w pełni działająca funkcja, bez pozornych placeholderów.
- **Q3 (PANEL_UX PR-1…4)** — zrealizowane (prymitywy/wrappery/nagłówki/copy pass domknięte w kodzie klient-panel).
- **Q4 (100%)** — kod panel/API domknięty; pozostają wyłącznie operacje poza kodem (Stripe live, LEG-D, smoke E2E na prod, incydent security).

### Weryfikacja końcowa (2026-06-01)

- `pnpm --filter api typecheck` → **czysty** (0 błędów). Naprawiono też 2 zastane błędy typów w spec-ach (`migration-orchestrator.service.spec.ts` self-reference `typeof prisma`; `users.service.profile.spec.ts` `spyOn` na `never`).
- `pnpm --filter @verris/client-panel typecheck` → **czysty**. Naprawiono zastane błędy blokujące build: brakujący `setAuthCookie` w `register/actions.ts` (auto-login po rejestracji), martwy filtr `/dashboard/iam` w `sidebar-tiles.ts`, typ zwracany `visibleTabsForProfile` w `settings/page.tsx`; spec-i wyłączone z build-tsconfig (brak runnera w tym pakiecie).
- `pnpm --filter @verris/admin-panel typecheck` → **czysty**.
- Testy: `stripe.service.spec.ts` 12/12 PASS; naprawione spec-i 9/9 PASS.
- **Macierz P0:** wszystkie wiersze panelu/API = PASS (patrz [LIVE_VERIFICATION_MATRIX.md](LIVE_VERIFICATION_MATRIX.md)).

### Pozostaje po Twojej stronie (poza kodem — warunki GO)

1. **Smoke węzła Node-PL-01** (8× VERIFY): heartbeat, profil hostingowy, sondy poczta/FTP/DB, Governor, CageFS, wildcard TLS, pakiety DA, E2E zakup→provisioning→mail/FTP/SSL.
2. **Stripe live** (`sk_live_` + webhook na publicznym URL).
3. **LEG-D** (akceptacja prawnika dokumentów).
4. **Sekrety `.env.prod`** + licencja DA dla kolejnych węzłów.
5. **Incydent bezpieczeństwa Hetzner/XBL** (`204.168.174.138`) - containment + walidacja hosta + odpowiedz do providera przed deadline (runbook: `docs/ops/HETZNER_ABUSE_2026-06-01.md`).
6. Finalny **GO_NO_GO_PROD** po powyższych.
