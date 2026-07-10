# Kredyty SLA — kod vs regulamin (analiza przed włączeniem `sla.creditsEnabled`)

Data: 2026-07-10 · Status: **NIE włączać flagi przed poprawką kodu**

---

## Wniosek w jednym zdaniu

`oferta.md` jest zgodna z regulaminem. **To kod się rozjeżdża z §15** — i włączenie
`sla.creditsEnabled = 1` w obecnym stanie zaczęłoby wypłacać kredyty według wzoru,
który nie ma pokrycia w umowie, systematycznie zawyżając kwoty i wypłacając rekompensaty
także wtedy, gdy SLA **zostało dotrzymane**.

Wcześniej napisałem, że to `oferta.md` wymaga dostosowania. Myliłem się — nie przeczytałem wtedy
regulaminu. Regulamin §15 zawiera dokładnie progi 5/25/50/100%, które `oferta.md` cytuje poprawnie.

## Co mówi regulamin (§15)

- Dostępność **99,5% w skali miesiąca kalendarzowego**, mierzona monitoringiem publikowanym na `status.verris.pl`.
- Rekompensata liczona od **miesięcznej** opłaty za dotkniętą Usługę, wg progów:

| Dostępność w miesiącu | Rekompensata |
|---|---|
| 99,0% – <99,5% | 5% |
| 95,0% – <99,0% | 25% |
| 90,0% – <95,0% | 50% |
| <90,0% | 100% |

- Przyznawana **na wniosek** złożony w ciągu 14 dni od końca miesiąca; Verris rozpatruje w 7 dni.
- Do niedostępności **nie wlicza się** m.in. prac konserwacyjnych zapowiedzianych ≥48 h wcześniej
  (≤8 h/mies.), siły wyższej, awarii sieci operatorów trzecich, działań Klienta, wyczerpania limitów
  Planu (§10 ust. 2 wprost: spowolnienie po przekroczeniu LVE **nie jest** niedostępnością).

## Co robi kod (`apps/api/src/billing/sla-credit.scheduler.ts`)

Wzór: `kwota = opłata_miesięczna × (minuty_przestoju − grace) × multiplier ÷ 43200`, ograniczony do `capPercent`.
Wartości domyślne: `graceMinutes = 5`, `multiplier = 10`, `capPercent = 100`, `creditsEnabled = 0`.

Wyzwalacz: każdy **pojedynczy** `ProbeIncident` o severity `MAJOR` ze statusem `RESOLVED`,
dla wszystkich aktywnych subskrypcji hostingowych na dotkniętym serwerze.

## Rozjazdy — cztery, w tym dwa kosztowne

**1. Wypłata, gdy SLA jest dotrzymane.**
Regulamin: przy dostępności ≥99,5% (czyli ≤216 min przestoju/mies.) rekompensata **nie przysługuje**.
Kod: 60 min przestoju → **1,27%** opłaty. 216 min → **4,88%**. Płacimy za nic.

**2. Systematyczne zawyżanie w progach — około dwukrotne.**

| Przestój | Dostępność | Regulamin | Kod | Różnica |
|---|---|---|---|---|
| 60 min | 99,86% | 0% | 1,27% | +1,27 pkt |
| 216 min | 99,50% | 0% | 4,88% | +4,88 pkt |
| 300 min | 99,31% | 5% | 6,83% | +1,83 pkt |
| 432 min | 99,00% | 5% | 9,88% | **≈2×** |
| 2160 min | 95,00% | 25% | 49,9% | **≈2×** |
| 4320 min | 90,00% | 50% | 99,9% | **≈2×** |
| >4320 min | <90% | 100% | 100% (cap) | zgodne |

**3. Cap działa per incydent, nie per miesiąc.**
Trzy incydenty MAJOR w jednym miesiącu → trzy osobne kredyty, każdy do 100% opłaty miesięcznej.
Łącznie do **300%**. Regulamin zna jedną rekompensatę miesięczną, liczoną z sumarycznej dostępności.

**4. Brak wyłączeń z §15 ust. 5 i brak deduplikacji z wnioskiem.**
Kod nie odejmuje okien konserwacyjnych ani awarii operatorów trzecich. Nie ma też blokady
podwójnej wypłaty, gdy klient dodatkowo złoży wniosek zgodnie z §15 ust. 3.

Osobno: regulamin mówi „na wniosek", a kod kredytuje automatycznie. Automat jest **korzystniejszy**
dla klienta, więc sam w sobie nie narusza umowy — ale copy („automatyczne rekompensaty") opisuje
mechanizm, którego regulamin nie gwarantuje. Klient nie może się go domagać.

## Dlaczego nie włączyłem flagi

Włączenie `sla.creditsEnabled = 1` dziś oznacza wypłacanie kredytów według wzoru bez pokrycia
w umowie, z ryzykiem 300% opłaty miesięcznej na klienta w złym miesiącu i z wypłatami przy
dotrzymanym SLA. To nie jest „żeby wszystko działało" — to jest uruchomienie kosztu.

Dodatkowo: `sla.creditsEnabled` to wiersz w tabeli `platform_settings` w produkcyjnej bazie.
Nie mam dostępu do Twojego serwera, więc technicznie i tak nie mogę tego przestawić.

## Dwie drogi — decyzja Twoja

**A. Kod pod regulamin** (bezpieczna, zgodna z umową)
Przepisać scheduler: agregacja przestoju **per miesiąc kalendarzowy i per usługa**, odjęcie okien
z §15 ust. 5, mapowanie dostępności na tabelę progów, jedna wypłata miesięcznie, dedup z wnioskiem
ręcznym. Wypłata po zamknięciu miesiąca (cron 1. dnia). Copy zmienia się na „rekompensata na wniosek".
Szacunek: 1–1,5 dnia.

**B. Regulamin pod kod** (lepsza marketingowo)
Zmienić §15 ust. 3 na przyznawanie **automatyczne, bez wniosku** — to realny wyróżnik i zostawia
„automatyczne rekompensaty" w copy. Progi 5/25/50/100% zostają, więc **kod i tak trzeba poprawić**
(punkty 1–4 powyżej). Zmiana regulaminu wobec istniejących Klientów wymaga trybu z §24 (zawiadomienie,
30 dni) — przed startem, bez klientów, jest darmowa.
Szacunek: 1–1,5 dnia kodu + poprawka regulaminu.

**Rekomendacja: B.** Automatyczna rekompensata bez wniosku jest rzadka na polskim rynku i jest
prawdziwym wyróżnikiem — pod warunkiem, że wzór to tabela progów, a nie obecna proporcja.
W obu wariantach kod wymaga tej samej poprawki; B dodatkowo pozwala zatrzymać obietnicę w copy.

## Do czasu decyzji

- `sla.creditsEnabled` zostaje `0`. Rekompensaty obsługujemy ręcznie na wniosek (zgodnie z §15).
- Ze copy znika słowo **„automatycznymi"**, dopóki nie wybierzesz wariantu B i nie wejdzie poprawka.
  Miejsca: `page.tsx` (karta SLA), `hosting/page.tsx`, `przenies-strone/page.tsx`, `lib/features.ts` (slug `sla`),
  `marketing/gads-search-hosting-202607.md`. **Nie ruszałem — czekam na decyzję, bo w wariancie B zostaje.**
- `oferta.md` (skill, read-only w sesji): usuń ręcznie fałszywy dopisek
  *„unikalny wyróżnik — konkurencja każe wpinać GA"* przy analityce. Progi SLA zostaw, są poprawne.
