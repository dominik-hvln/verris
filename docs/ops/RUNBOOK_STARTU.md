# Runbook startu i decyzja GO — PB-12

> Stan: **szkic** (2026-10-05). Decyzja GO: **4–8.01.2027**, start sprzedaży **11.01.2027** (harmonogram — wariant A,
> `docs/VERRIS.md`). Zasada z planu: **bez „warunkowego GO”** — każdy wiersz ma dowód i potwierdzenie albo decyzja = NO-GO.
> Kolumnę „Potwierdził” wypełnia właściciel w dniu decyzji. Stan pozycji: `audyt/dane/macierz.csv` (źródło prawdy).

## 1. Blokery z audytu parytetu (2026-08-20)

| ID | Co | Stan w macierzy | Dowód | Co zostaje przed GO | Potwierdził |
|---|---|---|---|---|---|
| Z-03 | Walidacja danych migracji przed poleceniem powłoki | DZIAŁA · PARYTET | DTO `MIGRACJA_WZORCE` + `migration-input-guard.sh`; test na węźle (D3) 09.2026 | — | |
| H-20 | Test odtworzeniowy z datą wykonania | DZIAŁA · PARYTET | D4: wiersz w bazie produkcyjnej, 22.08.2026 23:19, wynik OK | powtórzyć próbę odtworzenia na AX102 (PB-02) | |
| M-06 | Faktura korygująca | DZIAŁA · PARYTET | `korekta-faktury.ts`, `korekty.service.ts`; testy integracyjne | **D3 w PB-05**: korekta z prawdziwej płatności | |
| M-16 | KSeF — tryb awaryjny | POZA ZAKRESEM | decyzja PB-13 (22–23.09): faktury wystawia Firmino, sam obsługuje KSeF | potwierdzić z księgową tryb faktury przy doładowaniu (M-34) | |
| M-17 | KSeF — walidacja XSD | POZA ZAKRESEM | jak M-16 | — | |
| Z-01 | Faktura VAT dla płatności portfelem | DZIAŁA · PARYTET | `wallet-ledger.service.ts` — faktura w tej samej transakcji | **D3 w PB-05**: faktura z prawdziwej płatności w Firmino | |
| Z-02 | Zamówienie usługi bez opłaty | DZIAŁA · PARYTET | DTO + warunek w serwisie, CI #18 | — | |
| Z-05 | Odporność webhooka płatności | DZIAŁA · PARYTET | `billing.service.ts` — zajmij/zakończ/ponów zdarzenie | **D3 w PB-05**: prawdziwy webhook Stripe live | |
| Z-06 | Idempotencja obciążenia za dodatek | DZIAŁA · PARYTET | `PurchasedAddon.idempotencyKey @unique` | **D3 w PB-05**: zakup dodatku dwuklikiem → jedno obciążenie | |
| Z-04 | Guard uprawnień subkont — domyślna odmowa | DZIAŁA · PARYTET | `customer-permissions.guard.ts`, 55 tras w teście pokrycia | — | |
| P-15 | DPA z podprocesorami | DZIAŁA · PARYTET | `docs/legal/dpa-subprocessors-tracking.md` (Hetzner 27.09, reszta z umów) | dopisać OpenAI i Anthropic (akceptacja przy założeniu kont API) | |

## 2. Warunki operacyjne (poza audytem)

| Warunek | Gdzie | Potwierdził |
|---|---|---|
| Beta wewnętrzna na t1 zakończona: 8 scenariuszy, zero błędów krytycznych (PB-40) | `docs/ops/BETA_TESTY.md` | |
| Otwarta beta zakończona: ≥ 7 dni, ≥ 80% testerów z działającą stroną bez pomocy, poprawki „przed GO” zamknięte (PB-26) | `docs/ops/BETA_TESTY.md` | |
| Test pierwszego klienta na prawdziwych pieniądzach i domenie, z timestampami (PB-05) — w tym D3 dla M-06, Z-01, Z-05, Z-06 i transfer domeny (A-09) | zapis przebiegu w PB-05 | |
| Węzeł AX102: live-readiness 14/14, pierwszy backup off-site zaraportowany (PB-02) | panel admina → węzeł | |
| Dokumenty 1.1.0 opublikowane (regulamin, polityka prywatności z podprocesorami AI), `/legal` bez „w przygotowaniu” (PB-03) | `docs/legal/` | |
| KSC/NIS2 — wpis w wykazie (termin: 6 mies. od pierwszej domeny/DNS klienta) (PB-24) | PB-24 | |
| Zapora ruchu wychodzącego panelu w trybie blokady po 48 h logowania (SEC-01/02/03/06, X-41) | `docs/VERRIS.md` | |
| `.env.prod`: Stripe live, OpenProvider produkcyjny, `AI_TYLKO_KONTA` puste (AI dla wszystkich), `AI_EMBED_DISABLED` wg decyzji | serwer panelu | |
| Budżet AI platformy ustawiony na ~0,08–0,10 USD × liczba klientów | admin → Asystent AI | |
| Kampania Google Ads utworzona wstrzymana, konwersje podpięte; włączenie dopiero po GO (PB-10) | Google Ads | |
| Bramka podatności zielona (0 high/critical), CI zielone na commicie startowym | CI | |
| Skrzynki kontakt@/abuse@/security@ czytane, monitoring i alerty działają | Grafana, poczta | |

## 3. Dzień startu (11.01.2027)

1. Ostatni commit z `main` wdrożony, CI zielone; numer commita wpisany tutaj: `________`.
2. Publikacja dokumentów skryptem (PB-03) i sprawdzenie `/legal`.
3. Usunięcie testowych danych z bety, które nie należą do testerów (konto d3: poddomeny wl*, domena sandbox, skrzynka import@).
4. Włączenie kampanii (PB-10) i sprawdzenie konwersji w GA4 → Czas rzeczywisty.
5. Pierwsze 72 h: dyżur na zgłoszeniach (cel odpowiedzi wg `SUPPORT_MODEL_24-7.md`), przegląd kosztów AI i błędów 5xx raz dziennie.

## Decyzja

- [ ] **GO** — wszystkie wiersze powyżej mają dowód i potwierdzenie. Data: ________ · Właściciel: ________
- [ ] **NO-GO** — powód i nowy termin: ________
