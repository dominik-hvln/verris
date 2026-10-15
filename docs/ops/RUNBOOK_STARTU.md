# Runbook startu i decyzja GO — PB-12

> Stan: **szkic** (2026-10-05, przegląd 2026-10-15 wg `audyt/dane/*.csv` z 14.10). Decyzja GO: **4–8.01.2027**, start
> sprzedaży **11.01.2027** (harmonogram — wariant A, `docs/VERRIS.md`). Zasada z planu: **bez „warunkowego GO”** — każdy
> wiersz ma dowód i potwierdzenie albo decyzja = NO-GO. Kolumnę „Potwierdził” wypełnia właściciel w dniu decyzji.
> Stan pozycji: `audyt/dane/macierz.csv` (źródło prawdy). Dowód starszy niż 30 dni wraca do D0 (`audyt/README.md`).

## 1. Blokery z audytu parytetu (2026-08-20)

| ID | Co | Stan w macierzy | Dowód | Co zostaje przed GO | Potwierdził |
|---|---|---|---|---|---|
| Z-03 | Walidacja danych migracji przed poleceniem powłoki | DZIAŁA · PARYTET | D3 t1 28.09: bez strażnika migracji worker kończy rc=78, zlecenie niepobrane | — (opcjonalnie powtórka na AX102 w PB-02) | |
| H-20 | Test odtworzeniowy z datą wykonania | DZIAŁA · PARYTET | D4 11.10 (PB-54): drill bazy platformy 11 s + odtworzenie konta z off-site ~2 min | **dowód wygasa 10.11** — próba ≤ 30 dni przed otwartą betą (7.12) i ≤ 30 dni przed GO, w tym konto na AX102 | |
| M-06 | Faktura korygująca | DZIAŁA · PARYTET | D2 (testy jednostkowe i integracyjne) | D3: korekta prawdziwej faktury przyjęta w KSeF (PB-05 z 14.10 korekty nie zawiera) | |
| M-16 | KSeF — tryb awaryjny | POZA ZAKRESEM (uzasadnienie z 22.09) | **decyzja 22.09 zastąpiona 12.10** — panel wystawia i wysyła do KSeF; tryb OFFLINE i KOD I na PDF są, KODU II brak | decyzja właściciela: start z obecnym stanem czy bloker; aktualizacja wiersza macierzy | |
| M-17 | KSeF — walidacja XSD | POZA ZAKRESEM (j.w.) | test XSD FA(3) w repo — pomijany bez `xmllint` | potwierdzić, że CI ma `xmllint`; walidacja przed wysyłką w działaniu — decyzja | |
| Z-01 | Faktura VAT dla płatności portfelem | DZIAŁA · PARYTET | D3 14.10 (PB-05): faktura VFV, KSeF **TEST** przyjęte z UPO, płatność Paynow **sandbox** | D3 na prawdziwej płatności i KSeF PROD — albo decyzja, że sandbox wystarcza (jak przy PB-05) | |
| Z-02 | Zamówienie usługi bez opłaty | DZIAŁA · PARYTET | D2 (CI #18) | D3 — pieniądze (zasada audytu) | |
| Z-05 | Odporność webhooka płatności | DZIAŁA · PARYTET | D2 | D3: prawdziwy webhook **Stripe live** (PB-05 szło przez Paynow) | |
| Z-06 | Idempotencja obciążenia za dodatek | DZIAŁA · PARYTET | `PurchasedAddon.idempotencyKey @unique`, D2 | D3: dwuklik zakupu dodatku → jedno obciążenie | |
| Z-04 | Guard uprawnień subkont — domyślna odmowa | DZIAŁA · PARYTET | `customer-permissions.guard.ts`, test pokrycia tras (D2) | D3 — dostęp (zasada audytu) | |
| P-15 | DPA z podprocesorami | DZIAŁA · PARYTET, **flaga BLOKER STARTU** | `docs/legal/dpa-subprocessors-tracking.md` (Hetzner 27.09) | numery umów / zrzuty dla pozostałych; OpenAI, Anthropic, Paynow (mBank) niezaznaczone; zdjąć flagę po uzupełnieniu | |
| Z-18 | Przyczyna błędu provisioningu nie ginie | DZIAŁA · PARYTET, **flaga BLOKER STARTU** | D3 t1 3.10: zerwane DA → ponowienie zakłada konto bez zwrotu | warunek „na węźle #1”: powtórka na AX102 albo decyzja, że t1 wystarcza; zdjąć flagę | |
| N-14 | Blokada wysyłki konta + kolejka MTA | DZIAŁA · PARYTET | D3 t1 11.10 (PB-52) | — | |
| FAK-01 | Panel nie wystawia faktury równolegle z programem | DZIAŁA · PARYTET | D2 CI #182 | po decyzji 12.10 (panel wystawia) — potwierdzić `faktury.tryb = panel` na produkcji | |

## 2. Warunki operacyjne (poza audytem)

| Warunek | Gdzie | Potwierdził |
|---|---|---|
| Beta wewnętrzna na t1 zakończona: 8 scenariuszy, zero błędów krytycznych (PB-40) | `docs/ops/BETA_TESTY.md` | |
| Otwarta beta zakończona: ≥ 7 dni, ≥ 80% testerów z działającą stroną bez pomocy, poprawki „przed GO” zamknięte (PB-26) | `docs/ops/BETA_TESTY.md` | |
| Test pierwszego klienta na prawdziwych pieniądzach i domenie, z timestampami (PB-05) — w tym D3 dla M-06, Z-01, Z-05, Z-06 i transfer domeny (A-09) | zapis przebiegu w PB-05 | |
| Węzeł AX102: live-readiness 14/14, pierwszy backup off-site zaraportowany (PB-02) | panel admina → węzeł | |
| Dokumenty 1.1.0 opublikowane (regulamin, polityka prywatności z podprocesorami AI), `/legal` bez „w przygotowaniu” (PB-03) — **zrobione 6.10** | `docs/legal/` | |
| KSC/NIS2 — wpis w wykazie (termin: 6 mies. od pierwszej domeny/DNS klienta) (PB-24) | PB-24 | |
| Zapora ruchu wychodzącego panelu w trybie blokady po 48 h logowania (SEC-01/02/03/06, X-41) | `docs/VERRIS.md` | |
| Panel wyczyszczony z danych testowych (decyzja 12.10) — z kopią bazy przed czyszczeniem; **dopiero potem** KSeF PROD (faktur z KSeF PROD nie da się usunąć) | `pnpm cli:czyszczenie-przed-beta -- --zachowaj=…` (domyślnie podgląd; usunięcie: `--wykonaj --potwierdz=<liczba>`; lista „zachowaj” i numeracja — decyzja właściciela i księgowej) | |
| `.env.prod`: Stripe live, Paynow produkcyjny, OpenProvider produkcyjny, `AI_TYLKO_KONTA` puste (AI dla wszystkich), `AI_EMBED_DISABLED` wg decyzji; KSeF PROD (po czyszczeniu) | `prod-ustaw-klucze.sh`; KSeF: panel admina → Ustawienia → Firma → KSeF (środowisko, NIP, token szyfrowany w bazie; `KSEF_*` w `.env.prod` to tylko wartości domyślne) | |
| Dokumenty zgodne z decyzją 12.10 (panel → KSeF): regulamin §9 ust. 4, polityka i lista podprocesorów bez „Firmino przekazuje do KSeF”; ewentualna ponowna publikacja **przed** zaproszeniami do otwartej bety | `docs/legal/drafts/` | |
| Budżet AI platformy ustawiony na ~0,08–0,10 USD × liczba klientów | admin → Asystent AI | |
| Kampania Google Ads utworzona wstrzymana, konwersje podpięte; włączenie dopiero po GO (PB-10) | Google Ads | |
| Bramka podatności zielona (0 high/critical), CI zielone na commicie startowym | CI | |
| Skrzynki kontakt@/abuse@/security@ czytane, monitoring i alerty działają | Grafana, poczta | |

## 3. Dzień startu (11.01.2027)

1. Ostatni commit z `main` wdrożony, CI zielone; numer commita wpisany tutaj: `________`.
2. Sprawdzenie `/legal` (dokumenty opublikowane 6.10; kolejna publikacja tylko po zmianie z wiersza „Dokumenty zgodne z decyzją 12.10”).
3. `prod-live-acceptance.sh` (tylko odczyt) — kod wyjścia 0; panel admina → `/settings/live-readiness` → `go: true`, AX102 aktywny, kopia off-site i próba odtworzenia ok.
4. Usunięcie testowych danych z bety, które nie należą do testerów (konto d3: poddomeny wl*, domena sandbox, skrzynka import@) — o ile nie zrobione przy czyszczeniu panelu.
5. Transakcja kontrolna: zakup hostingu własnym kontem na prawdziwych pieniądzach (Paynow produkcyjny) — faktura, KSeF PROD przyjęte, UPO, konto na AX102. Błąd = wstrzymanie nowych kont, kampania wyłączona.
6. Włączenie kampanii (PB-10) i sprawdzenie konwersji w GA4 → Czas rzeczywisty.
7. Pierwsze 72 h: dyżur na zgłoszeniach (cel odpowiedzi wg `SUPPORT_MODEL_24-7.md`), przegląd kosztów AI i błędów 5xx raz dziennie.

## Decyzja

- [ ] **GO** — wszystkie wiersze powyżej mają dowód i potwierdzenie. Data: ________ · Właściciel: ________
- [ ] **NO-GO** — powód i nowy termin: ________
