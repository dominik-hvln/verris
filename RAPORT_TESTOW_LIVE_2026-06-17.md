# Raport testów LIVE panelu Verris — 2026-06-17

Testy czarnoskrzynkowe przeprowadzone przez przeglądarkę (Claude w Chrome) na
działającym środowisku produkcyjnym, zalogowany jako klient testowy
`dominik@dkowalski.pl`. Skrypt akceptacyjny: PASS=29, WARN=0, FAIL=0.

## ✅ Zweryfikowane na żywo (działa)

**Logowanie / wejście**
- Login klienta i admina — przycisk passkey **pod** formularzem (naprawiony układ admina), break-glass, wygaśnięcie sesji 8h.
- Trust signals (O-5) — realne liczby na loginie, nie mock.
- Rejestracja — rozdzielone, wymagane zgody RODO (regulamin / polityka / opcjonalny marketing) z linkami.
- VPN do panelu admina działa.

**Pulpit**
- Onboarding „Pierwsze kroki" (O-4) — realny postęp 1/4 (domena skierowana).
- „Rzeczy do zrobienia" (SUP-3) — realna domena `tprstudio.pl`.
- Portfel, powitanie spersonalizowane, pełna nawigacja.

**Zamawianie usługi**
- Free trial (O-1) — **przetestowany end-to-end**: utworzono konto próbne (status „TWORZENIE KONTA", 0 PLN, ważne do 17.07.2026, CTA „Przekształć na płatną"), provisioning ruszył na Node-PL-01.
- Plany Starter/Pro/Business z realnymi specyfikacjami.
- **P-7 oszczędności roczne** — „Płacąc rocznie oszczędzasz 17% (39,89 K / rok)".
- O-3 domena w checkoucie (własna / rejestracja nowej), płatność portfel / Stripe.

**Portfel i płatności**
- Saldo, doładowania/wydatki 30 dni, kwoty doładowań, kod promo, auto-doładowanie, Stripe+BLIK+Przelewy24.

**P-8 Dodatki — przetestowany end-to-end**
- Zakup „Priorytetowe wsparcie" z portfela: **pobrano dokładnie 49 K** (550,01 → 501,01), flaga priorytetu z datą do 17.07.2026, historia „✓ Aktywny", toast potwierdzenia.
- **Idempotencja OK**: mimo serii nieudanych (503) prób — tylko JEDEN wpis w historii, brak podwójnego obciążenia.

**Wsparcie (SUP-1/2/5)**
- Formularz z selektorem tematu: Hosting / Domena / Poczta / DNS / SSL / Płatności / Inne.
- **Wysłanie ticketu — przetestowane**: utworzony, wątek konwersacji (dymki), załączniki 5×8 MB, status OCZEKUJĄCE, lista z realnymi statusami (OCZEKUJĄCE/W TOKU/ROZWIĄZANE).

**VPS** — render OK (naprawiony crash nagłówka), łagodny stan „niedostępne" przy braku tokena Hetzner.

## 🐞 Znaleziska

| # | Waga | Opis | Status |
|---|---|---|---|
| 1 | Średnia | **React #418 (hydration mismatch)** na loginie — przyciski passkey renderowane różnie na serwerze/kliencie (gating po `typeof window`). | **Naprawione w kodzie** (guard `mounted` w 3 panelach) — czeka na redeploy. |
| 2 | Niska/treść | **Podpowiedzi KB (SUP-2) nie pojawiają się** — endpoint działa (200), ale **baza wiedzy jest pusta na LIVE**. | Do zrobienia: admin dodaje artykuły KB (włączy też sugestie AI dla staff). |
| 3 | Średnia | **Intermittentne 503 na server-action POST** (zakup dodatku, kb-suggest) przy szybkich/równoległych wywołaniach. Po retry przechodzi; **bez skutków finansowych** (nieudana akcja nie obciąża portfela). | Do diagnozy: logi kontenera client-panel + Caddy podczas akcji, zasoby/restarty kontenera. |
| 4 | Konfiguracja | **VPS i webmail wyłączone** — brak `HETZNER_API_TOKEN` / `WEBMAIL_URL` na LIVE. | Uzupełnić env gdy gotowe. |
| 5 | Drobny UX | Licznik portfela w nagłówku nie odświeża się po zakupie dodatku (poprawne saldo dopiero po nawigacji). | Rewalidacja layoutu/licznika po `purchaseAddonAction`. |
| 6 | Drobny UX | Widok ticketu u klienta nie eksponuje priorytetu/SLA (SUP-5). | Opcjonalnie pokazać SLA/priorytet w nagłówku ticketu. |

## Dane testowe utworzone na LIVE (do sprzątnięcia)
- Ticket „[TEST LIVE] Weryfikacja priorytetu wsparcia premium" (#1F4CEEA7) — można zamknąć.
- Konto próbne `test-live-verris.pl` (Starter, trial do 17.07.2026) — wygaśnie samo lub usuń ręcznie.
- Zakup dodatku „Priorytetowe wsparcie" (49 K) — flaga aktywna do 17.07.2026.

## Rekomendowane akcje (kolejność)
1. **Redeploy** z fixem #418 (commit zmian w 3 panelach passkey).
2. **Dodać artykuły KB** w panelu admina (klient: podpowiedzi; staff: sugestie AI).
3. **Zdiagnozować 503** na server-action (logi client-panel + Caddy, zasoby kontenera).
4. Ustawić `HETZNER_API_TOKEN` i `WEBMAIL_URL` gdy VPS/webmail mają ruszyć.
5. Drobne UX: rewalidacja portfela po zakupie, SLA w widoku ticketu.
