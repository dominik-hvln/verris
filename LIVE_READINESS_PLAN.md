# Verris — 100% LIVE Readiness Plan

> Cel: przed jakimkolwiek wdrożeniem produkcyjnym potwierdzić, że Verris jest gotowy do pracy z klientami w zakresie **100% LIVE**: bez MVP, bez mocków, bez pozornych funkcji, bez świadomie niedomkniętych ścieżek krytycznych.

## Zasada GO/NO-GO

Przed decyzją GO każda funkcja widoczna w panelach musi spełniać komplet:

- UI pokazuje realne dane z API/DB/integracji albo jasno mówi, że funkcja nie jest dostępna w obecnym planie.
- Brak mocków, stubów, placeholderów operacyjnych i „martwych” przycisków w ścieżkach klienta, staff i admin.
- Każda operacja wpływająca na klienta, płatności, provisioning, migracje, compliance lub infrastrukturę ma RBAC, walidację błędów i audit log.
- Krytyczne ścieżki mają test lub opisany smoke test z oczekiwanym wynikiem.
- Dokumenty prawne i konfiguracja produkcyjna nie zawierają placeholderów typu `<TODO>`.

## Sprint A — Stabilizacja Kodu I Testy Krytyczne

Priorytet: P0, przed release branch.

- ✅ Testy `StatusWebhookService` (`status-webhook.service.spec.ts`): enqueue (0 / N), HMAC, retry HTTP/network, FAILED po 5 próbach, SSRF guard.
- ✅ Testy `DomainsService` (`domains.service.spec.ts`): checklist `OK` / `WARNING` / `FAILED`, brak aktywacji bez `OK`.
- ✅ Testy migration worker (`migration-orchestrator.service.spec.ts`): job kinds, lease secrets, complete partial/final, retryable vs FAILED.
- ✅ Test public uptime badge (`public-uptime-badge.controller.spec.ts`): operational/degraded, brak wycieku domeny/id/subskrypcji, 404 bez konta.
- ⏳ Code review diffu pod kątem runtime (`fetch`, cron, HMAC, Prisma, audyt) — ręczny przegląd przed GO.
- ⏳ Kryterium DONE: pełny `npm test` + `typecheck` + `build` w CI/monorepo (lokalnie: `apps/api` testy zielone).

## Sprint B — 100% LIVE Audit Paneli

Priorytet: P0, przed wpuszczeniem klientów.

- ✅ Audyt panelu klienta — [`docs/SPRINT_B_PANEL_AUDIT.md`](./docs/SPRINT_B_PANEL_AUDIT.md).
- ✅ Feature gates: `NEXT_PUBLIC_FEATURE_ECO|IAM|REFERRAL` (domyślnie wyłączone), nawigacja + strony gated.
- ✅ Brak mocków w `client-panel` / `admin-panel` (grep); hosting tools mają `PanelFetchError` / empty states.
- ⏳ Przejście staff/admin ekran po ekranie (tickety 360, NOC, product-ops).
- ⏳ Nawigacja do uptime badge / restore preview — weryfikacja linków z usług.
- Kryterium DONE: żadna strona produkcyjna nie obiecuje funkcji, której backend realnie nie wykonuje.

## Sprint C — Operacje Produkcyjne I Sekrety

Priorytet: P0, wykonywane na staging/prod-like.

- Uzupełnić `.env.prod` o nowe elementy: status webhooks, public badge URL, worker settings, MinIO, SMTP, Stripe live/test zgodnie ze środowiskiem.
- Zweryfikować migracje DB na czystej bazie i bazie z danymi testowymi.
- Skonfigurować off-site backup DB/MinIO i wykonać restore test na staging.
- Skonfigurować alerty Grafana/Prometheus dla provisioning queue, status webhook deliveries, incidents, stale heartbeat, failed migrations.
- Udokumentować compute-node worker protocol: lease, complete/fail, idempotency, log truncation, retry policy.
- Kryterium DONE: `PROD_HEALTH_CHECKLIST.md` bez punktów ❌ w sekcjach 1-12.

## Sprint D — Prawne I Compliance Bez Placeholderów

Priorytet: P0, blokuje klientów zewnętrznych.

- Uzupełnić dokumenty prawne z `docs/legal/drafts/*`: pełne dane firmy, adres, NIP/KRS/CEIDG, subprocessors, retencja, procedury i linki.
- Zrobić lawyer review regulaminu, privacy, cookies i DPA.
- Opublikować aktualne wersje dokumentów w panelu admina i potwierdzić re-consent flow.
- Zweryfikować procedurę naruszenia danych i kontakt prawny w `INCIDENT_RESPONSE.md`.
- Kryterium DONE: brak placeholderów `<TODO>` w dokumentach publikowanych klientowi.

## Sprint E — Pozostałe Funkcje Produktowe Do Decyzji

Te elementy nie muszą blokować pierwszego kontrolowanego LIVE, jeśli nie są komunikowane jako dostępne. Jeśli mają być częścią oferty od dnia 1, trzeba je domknąć przed deployem.

- PayU/BLIK jako drugi gateway płatności (`C-13`).
- IAM/subkonta klienta z rolami billing/statystyki/tickety (`E-12` / `R-12`).
- Rejestracja/transfer domen przez rejestratora (`R-13`).
- Softaculous / WordPress installer (`R-15`).
- Statystyki ruchu typu AWStats/Webalizer albo odpowiednik przez DA (`R-19`).
- Pełny program EKO/referral, jeśli ma być elementem oferty startowej.
- AI live chat / predykcja obciążenia tylko po osobnej decyzji produktowej; nie oznaczać jako dostępne, dopóki nie jest produkcyjnie gotowe.

Decyzja zakresu oferty startowej jest rozpisana w [`LIVE_PRODUCT_SCOPE_DECISION.md`](./LIVE_PRODUCT_SCOPE_DECISION.md).

## Decyzja O Kolejności

Najlepszy następny krok: **Sprint A**, czyli testy krytyczne i review diffu. Dopiero potem Sprint B, bo audyt UI ma największy sens, gdy backendowe edge case’y są pokryte testami.
