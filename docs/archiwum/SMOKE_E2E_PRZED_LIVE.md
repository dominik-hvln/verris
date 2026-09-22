# Smoke E2E przed LIVE (audit ETAP 6.3)

Pełna pętla biznesowa do ręcznego przejścia na **stagingu / prod przed pierwszym
płatnym klientem** oraz po każdym większym release. Szacowany czas: ~60–90 min.

> Konto testowe: użyj domeny kontrolowanej przez Ciebie (np. subdomena testowa),
> Stripe w trybie testowym tam, gdzie to możliwe.

## A. Rejestracja i logowanie

- [ ] Rejestracja nowego konta → e-mail weryfikacyjny dochodzi, link działa.
- [ ] Logowanie przed weryfikacją e-mail → blokada z czytelnym komunikatem.
- [ ] Włączenie 2FA (TOTP) → wylogowanie → login wymaga kodu; błędny kod ×5 nie wpuszcza.
- [ ] Rate limit: 11 szybkich prób logowania z błędnym hasłem → HTTP 429.
- [ ] Reset hasła: żądanie → mail → zmiana → stary token nie działa drugi raz.

## B. Portfel i płatności

- [ ] Doładowanie portfela Stripe Checkout → saldo rośnie dokładnie raz (webhook).
- [ ] Ponowna dostawa webhooka (Stripe → "Resend") → saldo BEZ zmian (`duplicate: true` w logu).
- [ ] Kod promocyjny percent-bonus przy doładowaniu → bonus naliczony raz.
- [ ] Auto-topup: próg + karta → symulacja niskiego salda → PaymentIntent → saldo rośnie.

## C. Zakup i provisioning

- [ ] Zakup planu z portfela → debet `sub-<id>-initial` → konto DA utworzone (status ACTIVE).
- [ ] Konto DA: pakiet = slug planu, limity LVE = plan, NS zgodne z węzłem/platformą.
- [ ] Magic Login z panelu klienta → wejście do DA działa.
- [ ] E-mail powitalny: zawiera login, NIE zawiera hasła (F-15).
- [ ] Zakup przy braku środków → czytelny błąd, saldo nietknięte.
- [ ] (Negatywny) provisioning z uszkodzonym DA (zły login key) → auto-refund + audyt `PROVISIONING_FAILED`.

## D. Autoskalowanie

- [ ] Włącz autoskalowanie na usłudze; wygeneruj obciążenie CPU (np. `stress-ng` w cron DA).
- [ ] Po ~3–5 min: scale-up widoczny w panelu + e-mail "autoskalowanie wystartowało".
- [ ] Portfel: debet `autoscale-block:<sub>:<blockStart>` w ciągu minuty od scale-upu.
- [ ] Utrzymane obciążenie 30+ min → kolejne bloki co 15 min, bez duplikatów.
- [ ] Cap: ustaw `autoscalingMaxCost` poniżej bieżącego spendu 30 dni → następny scale-up
      zablokowany `cap_reached`, zasoby wracają do baseline (F-01 — kluczowy test!).
- [ ] Wyzeruj portfel → engine wyłącza autoskalowanie (`wallet_empty`), CPU/RAM wracają do baseline,
      **dysk NIE schodzi poniżej zużycia** (F-06) — sprawdź quota w DA vs `du` konta.
- [ ] Doładuj portfel → zaległy blok dobity (idempotentnie), autoskalowanie można włączyć ponownie.

## E. Renewal / grace / suspend

- [ ] Skróć `currentPeriodEnd` testowej subskrypcji (SQL) do +12 h → cron renewal debetuje portfel,
      okres przedłużony, idempotency key `sub-<id>-renew-<period>`.
- [ ] Bez środków → PAST_DUE + e-mail; po 3 dniach (lub skróconym grace) → SUSPENDED + DA suspend.
- [ ] Unsuspend z `chargeRenewal` → pojedynczy debet `sub-<id>-manual-renew-<anchor>`;
      dwuklik/powtórka NIE dubluje obciążenia (F-05).
- [ ] Faktura PDF wygenerowana i zgodna z kwotą.

## F. Węzeł (przy onboardingu nowego)

- [ ] Pełny wizard 1→9 (w tym NOWY krok „Onboard LIVE (SSH)").
- [ ] Audyt węzła: wszystkie checki OK, w tym **„Publiczne IP w DirectAdmin"** i
      **„Security hardening (LIVE onboarding)"** (nowe walidatory F-07).
- [ ] Audyt: „Certyfikat TLS panelu DA" — weryfikacja cert w API **włączona** (F-04);
      jeśli FAIL → wdroż cert (`verris-node-wildcard-tls.sh`) i wyłącz `daAllowInvalidCert`.
- [ ] Re-run skryptu bootstrap na ACTIVE węźle → no-op, token NIE zostaje zużyty (F-13).
- [ ] Telemetria: `UsageMetric` spływa co minutę; heartbeat < 5 min.

## G. Bezpieczeństwo (wyrywkowo)

- [ ] Stary/odgadnięty `X-Server-Token` (plaintext sprzed migracji F-03) po pierwszym żądaniu
      zostaje podniesiony do hasha — wpis w DB nie jest już plaintextem.
- [ ] Zablokuj testowego usera (loginBlocked) → jego AKTYWNY token JWT przestaje działać
      natychmiast (F-08).
- [ ] Webhook Stripe z błędnym podpisem → 401; ze starym timestampem (>5 min) → 401.
- [ ] Panel admin niedostępny bez roli ADMIN (konto USER → 403 na /admin/*).

## H. Backup / restore (F-?/6.4)

- [ ] `ops/backup-postgres.sh` wykonany w ostatnich 24 h (sprawdź artefakt + offsite sync).
- [ ] **Restore drill** wg `docs/ops/RESTORE_TEST.md` wykonany w ostatnich 30 dniach —
      jeśli nie, wykonaj przed LIVE i zapisz datę poniżej.

| Drill | Data | Wynik | Operator |
|---|---|---|---|
| Restore DB (izolowany) | | | |
| Smoke E2E (ten plik) | | | |

## I. RODO / legal (przed pierwszym klientem)

- [ ] Regulamin + polityka prywatności opublikowane (wersje LIVE, nie draft).
- [ ] Rejestracja zapisuje zgody (`UserConsent` + audyt `CONSENT_GRANTED`).
- [ ] Eksport danych (data export) działa dla konta testowego.
- [ ] Anonimizacja/usunięcie konta testowego działa (scheduler 03:30/04:15).
- [ ] DPA + lista podprocesorów aktualne (`docs/legal/`).
