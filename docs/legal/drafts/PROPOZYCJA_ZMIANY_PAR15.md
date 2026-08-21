# Propozycja zmiany §15 regulaminu — rekompensata SLA przyznawana automatycznie

Data: 2026-07-10 · Autor: asystent · Status: **draft do akceptacji**

> **To nie jest opinia prawna.** Nie jestem prawnikiem. Poniższe brzmienie jest materiałem
> wyjściowym. §15 wiąże się z §18 (ograniczenie odpowiedzialności) i z reżimem klauzul
> niedozwolonych wobec konsumentów — przed publikacją zalecam weryfikację przez prawnika.

---

## Co zmieniamy i dlaczego

Kod (`apps/api/src/billing/sla-credit.scheduler.ts`) przyznaje rekompensatę **automatycznie**,
bez wniosku klienta. Obecny §15 ust. 3 wymaga wniosku w terminie 14 dni. Automat jest
korzystniejszy dla klienta, więc sam w sobie nie narusza umowy — ale copy Verris obiecuje
„automatyczne rekompensaty", czyli mechanizm, którego regulamin nie gwarantuje. Klient nie
mógłby się go domagać.

Zmiana usuwa tę lukę i zamienia ją w wyróżnik: **rekompensata bez wniosku, z urzędu.**

Progi z ust. 2 **zostają bez zmian** (5/25/50/100%). Nie obniżamy ich: maksymalna wypłata to
100% jednej opłaty miesięcznej, wyłącznie przy dostępności poniżej 90% (ponad trzy doby przestoju),
a rekompensata ma postać Kredytów Verris (rabat, §8 ust. 4), nie gotówki.

**Uwaga o progu wykrywalności:** nie proponuję go dodawać. Tabela progów sama go zawiera —
żeby uzyskać choćby 5%, przestój musi przekroczyć 216 minut w miesiącu. Osobny zapis o „progu
minimalnym" byłby zbędny, a wobec konsumenta wyglądałby na ograniczanie uprawnień.

---

## Brzmienie obecne (do zastąpienia)

> **3.** Rekompensata jest przyznawana **na wniosek** złożony w Panelu lub e-mailem w terminie
> 14 dni od zakończenia miesiąca, którego dotyczy. Verris rozpatruje wniosek w ciągu 7 dni
> i uznaje Portfel Klienta. Rekompensata SLA ma charakter rabatu (kredyt nieodpłatny — §8 ust. 4).

## Brzmienie proponowane

> **3.** Rekompensata jest przyznawana **automatycznie, bez wniosku Klienta**, w terminie 7 dni
> od zakończenia miesiąca kalendarzowego, którego dotyczy. Verris ustala dostępność Usługi
> na podstawie niezależnego monitoringu, o którym mowa w ust. 1, uznaje Portfel Klienta kwotą
> rekompensaty i informuje o tym Klienta e-mailem oraz powiadomieniem w Panelu. Rekompensata SLA
> ma charakter rabatu (kredyt nieodpłatny — §8 ust. 4).
>
> **3a.** Jeżeli Klient nie zgadza się z ustaloną przez Verris dostępnością Usługi lub nie otrzymał
> rekompensaty, może w terminie 30 dni od zakończenia danego miesiąca złożyć wniosek w Panelu
> lub e-mailem. Verris rozpatruje wniosek w ciągu 7 dni. Za ten sam miesiąc i tę samą Usługę
> rekompensata przysługuje jednokrotnie.
>
> **3b.** Dostępność ustala się odrębnie dla każdej Usługi, sumując czas jej niedostępności
> w miesiącu kalendarzowym. Dla Usługi aktywowanej w trakcie miesiąca dostępność liczy się
> od dnia jej aktywacji.

---

## Dlaczego dokładnie takie brzmienie

**„automatycznie, bez wniosku"** — to jest ten wyróżnik. Rynek wymaga reklamacji, my nie.

**Ustęp 3a jest konieczny, nie ozdobny.** Automat opiera się na naszym monitoringu, czyli na
danych jednej strony umowy. Bez ścieżki odwoławczej klient nie miałby jak zakwestionować pomiaru,
co wobec konsumenta byłoby ryzykowne (art. 385¹ k.c. — kształtowanie praw w sposób sprzeczny
z dobrymi obyczajami). Zdanie „rekompensata przysługuje jednokrotnie" jest odpowiednikiem unikatu
`SlaCredit(subscriptionId, periodStart)` w bazie — dokument i kod mówią to samo.

**Ustęp 3b** domyka dwie rzeczy, które kod robi, a umowa przemilczała: sumowanie przestojów
w miesiącu (zamiast rozliczania każdej awarii osobno) i proporcjonalne traktowanie usług
uruchomionych w trakcie miesiąca.

**Termin 7 dni** zamiast 14: automat nie potrzebuje czasu na rozpatrzenie. Krótszy termin jest
korzystniejszy dla klienta, więc bezpieczny.

---

## Co zostaje bez zmian

- **Ust. 1** — dostępność 99,5% w miesiącu kalendarzowym, monitoring publikowany na `status.verris.pl`.
- **Ust. 2** — tabela progów 5/25/50/100%.
- **Ust. 4** — rekompensata nie wyłącza dalej idących roszczeń konsumenta.
- **Ust. 5** — wyłączenia (konserwacja zapowiedziana ≥48 h, ≤8 h/mies.; siła wyższa; sieci
  operatorów trzecich; działania Klienta; wyczerpanie limitów Planu; zawieszenie z §7 lub §17).

Kod odlicza okna konserwacyjne z ust. 5 do limitu `sla.maintenanceCapMinutes = 480` (8 h).
Pozostałych wyłączeń (siła wyższa, sieci trzecie, działania Klienta) **kod nie rozpoznaje
automatycznie** — wymagają decyzji człowieka. W praktyce: incydent, który im podlega, nie powinien
być oznaczany jako `MAJOR` albo należy go rozliczyć ręcznie. To ograniczenie trzeba znać.

---

## Tryb wprowadzenia

Zmiana **na korzyść Klienta** (rekompensata z urzędu zamiast na wniosek). Mimo to formalnie
jest zmianą regulaminu i podlega §24: zawiadomienie e-mailem, wejście w życie po 30 dniach,
prawo wypowiedzenia bez kosztów.

**Przed startem, bez aktywnych Klientów, publikujemy nową wersję od razu** — nie ma kogo
zawiadamiać. To najtańszy moment na tę zmianę i argument, żeby zrobić ją teraz, a nie po kampanii.

Wersjonowanie: bump `legal` do 1.1.0, data wejścia w życie w nagłówku, stara wersja zachowana
w archiwum (§4 ust. 2 — potwierdzenie zawarcia umowy obejmuje treść z dnia zakupu).

---

## Checklist wdrożenia

1. [ ] Prawnik przegląda ust. 3, 3a, 3b (szczególnie 3a wobec konsumentów).
2. [ ] `docs/legal/drafts/terms.md` → nowe brzmienie, bump wersji, data.
3. [ ] Migracja `20260710160000_sla_monthly_credits` na produkcji (idzie z deployem).
4. [ ] `sla.creditsEnabled = 1` — **dopiero po punktach 2 i 3.**
5. [ ] Weryfikacja: `SELECT * FROM "SlaCredit" WHERE "periodStart" IS NOT NULL;` po pierwszym
       przebiegu crona (03:00, rozlicza poprzedni miesiąc).
6. [ ] Copy zostaje bez zmian — „automatyczne rekompensaty" staje się prawdą.
