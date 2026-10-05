# Otwarte testy przed startem (beta) — PB-26

> Stan: **plan** (2026-10-04, wariant A). Dwa etapy:
> - **beta wewnętrzna** na węźle testowym t1 — **19.10–6.11.2026** (PB-40): właściciel i 2–3 zaufane osoby,
>   te same scenariusze co niżej, bez zaproszeń z kodem;
> - **otwarta beta** na węźle produkcyjnym #1 (AX102) — **7–20.12.2026** (PB-26), po przeniesieniu kilku
>   stron właściciela na AX102 i publikacji dokumentów. Potem decyzja GO 4–8.01.2027 (PB-12).
> Zaproszenia wysyła właściciel; ten dokument mówi, co ma być gotowe, co testerzy dostają i kiedy
> uznajemy testy za zakończone.

## Po co

Test „pierwszego klienta” (PB-05) przechodzi jedna osoba znająca produkt. Beta sprawdza to samo
na ludziach, którzy panelu nie znają: czy rejestracja, zakup, migracja strony i poczta działają
bez naszej pomocy, i co ich zatrzymuje. Drugi cel: ruch na prawdziwym węźle (autoskalowanie,
kopie, monitoring) przed pierwszym płacącym klientem.

## Kogo i ilu

- **10–20 osób**, w tym co najmniej: 5 z działającą stroną WordPress do przeniesienia, 2 sklepy
  (WooCommerce/PrestaShop), 2 osoby nietechniczne, 1–2 agencje z kilkoma stronami.
- Zaproszenie imienne (kod na osobę) — wiemy, kto co zgłosił, i możemy kod wyłączyć.

## Co dostają

Rekomendacja: **kod promocyjny na doładowanie portfela** (istniejący mechanizm `PromoCode`,
rodzaj `FIXED_CREDIT`, `maxRedemptions: 1`, ważny 14 dni od wysłania):

- **150 K** (≈ 3 miesiące hostingu 45 zł + zapas na autoskalowanie), bez karty.
- Po becie usługa zostaje; odnowienie z portfela albo kartą jak u każdego klienta — bez
  „wygaszania” i bez migracji danych.
- Dlaczego nie darmowy okres (`trialDays`): trial kończy się zawieszeniem, jeśli klient nie
  przejdzie na płatny plan, i nie sprawdza ścieżki płatności/portfela, którą chcemy przetestować.
  Kredyt przechodzi przez tę samą ścieżkę co prawdziwy zakup.
- Kto chce, testuje też płatność kartą (Stripe, prawdziwe pieniądze) — zwracamy równowartość
  kredytem.

## Warunki (przed wysłaniem zaproszeń)

- Regulamin 1.0.0 opublikowany (PB-03) — testerzy są zwykłymi klientami, SLA i RODO obowiązują.
- Węzeł #1 przeszedł live-readiness (PB-02), DNS i poczta sprawdzone (PB-21), kopie + test
  odtworzenia (H-*, D4), white label na węźle (PB-25).
- Monitoring i alerty działają (X-30/X-31), skrzynki kontakt@/abuse@/security@ czytane.
- Kanał zgłoszeń: zgłoszenie w panelu z kategorią „Beta” (albo tag w temacie) — wszystko w jednym
  miejscu, z kontekstem klienta w panelu obsługi.

## Scenariusze do przejścia (lista dla testera)

1. Rejestracja, weryfikacja e-maila, 2FA/passkey.
2. Doładowanie kodem, zakup hostingu, uruchomienie usługi.
3. Przeniesienie strony kreatorem migracji (albo instalacja WordPressa od zera).
4. Podpięcie domeny (DNS u nas albo rekordy A), SSL.
5. Skrzynka pocztowa: wysyłka i odbiór, konfiguracja w telefonie.
6. Kopia i odtworzenie pliku/bazy, staging (jeśli używa).
7. Zgłoszenie do wsparcia; ocena odpowiedzi.
8. Telefon: te same kroki z telefonu (panel mobilny, Q-09).

## Co mierzymy

- Ile osób dochodzi do działającej strony bez kontaktu ze wsparciem (cel: ≥ 80%).
- Czas od rejestracji do działającej strony (mediana).
- Zgłoszenia: kategorie, czas pierwszej odpowiedzi (cel wg SUPPORT_MODEL_24-7.md).
- Błędy 5xx i awarie zadań węzła w czasie bety (Grafana), zdarzenia autoskalowania.

## Kiedy koniec

Minimum **7 dni** od pierwszej aktywnej usługi i łącznie:

- zero otwartych błędów krytycznych (dane, pieniądze, dostęp),
- ≥ 80% testerów z działającą stroną bez pomocy,
- lista poprawek z bety rozdzielona na „przed GO” i „po starcie”; te pierwsze zamknięte.

Wtedy runbook startu i decyzja GO (PB-12) — bez „warunkowego GO”.

## Przygotowanie po naszej stronie (checklista)

- [x] Kody i zaproszenia: panel admina → **Testy (beta)** → „Zaproś testera” (e-mail, imię) tworzy imienny
      kod `BETA-XXXXXX` (150 K, 1 użycie, 14 dni) i od razu wysyła mail (`beta.invite`, szablon
      `renderEmailShell`) z kodem, krokami startu, listą rzeczy do sprawdzenia i linkiem do rejestracji.
      Gdy mail nie wyjdzie, kod i tak powstaje (lista pokazuje „mail niewysłany”). Kod można wyłączyć.
- [x] Temat zgłoszeń „Testy (beta)” — widoczny w panelu klienta tylko dla testera (kto zrealizował kod
      z zaproszenia, `GET /me/beta`); w panelu obsługi znacznik **Beta** na liście zgłoszeń.
- [x] Widok testerów w panelu admina: stan kodu (czeka / użyty / wygasł / wyłączony), konto, aktywne usługi,
      zgłoszenia z tematem Beta (w tym otwarte), odsetek testerów z aktywną usługą.
- [x] Krótka ankieta na koniec — mailem od właściciela (treść niżej); formularz w panelu dopiero, jeśli
      testerów będzie więcej niż kilkunastu.

## Ankieta na koniec (mail od właściciela)

1. Czy Twoja strona działa u nas? Jeśli tak — ile mniej więcej trwało od rejestracji do działającej strony?
2. W którym momencie musiałeś(-aś) zgadywać, szukać pomocy albo napisać do nas? Co by Ci wtedy pomogło?
3. Co działało lepiej niż u Twojego obecnego (albo poprzedniego) hostingu, a co gorzej?
4. Asystent w panelu: czy jego odpowiedzi rozwiązały problem? Przykład dobrej i słabej odpowiedzi, jeśli pamiętasz.
5. Czy zostałbyś(-abyś) u nas za 45 zł miesięcznie? Jeśli nie — czego brakuje?

Odpowiedzi trafiają do listy poprawek z podziałem „przed GO” / „po starcie” (`docs/ops/RUNBOOK_STARTU.md`).
