# Otwarte testy przed startem (beta) — PB-26

> Stan: **plan** (2026-10-04, wariant A). Dwa etapy:
> - **beta wewnętrzna** na węzłach testowych TEST-02 i t1 — od **ostatniego tygodnia października 2026** (PB-40;
>   pierwotnie 19.10–6.11 na samym t1): właściciel i kilka zaufanych osób, te same scenariusze co niżej.
>   Dwa węzły z płatnymi licencjami (decyzja 26.10 — trial CloudLinux nie jest przedłużany), żeby sprawdzić też
>   automatyczny dobór węzła;
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

Jedno źródło: `libs/contracts/src/beta-scenariusze.ts` — strona „Testy (beta)” w panelu klienta, postęp w panelu
admina i przewodnik PDF. 15 scenariuszy obowiązkowych (61 kroków) i 2 opcjonalne dla osób technicznych (nie liczą się do postępu).

> 8.11.2026 (paczka 123): dopisany scenariusz „Kreator stron” (s17, po domenie). Przewodnik PDF
> (`apps/client-panel/assets/beta/Verris-przewodnik-testera.pdf`) generuje się poza repo – trzeba go wygenerować
> ponownie z `SCENARIUSZE_BETA` (okładka mówi dziś „16 scenariuszy – 14 obowiązkowych (56 kroków)”).

1. Konto i bezpieczeństwo (rejestracja, e-mail, 2FA/passkey).
2. Kod testera, portfel i zakup hostingu.
3. Przeniesienie strony albo nowy WordPress.
4. Domena, DNS i certyfikat SSL.
5. Kreator stron (nowa strona z opisu, zmiana tekstu i zdjęcia na podglądzie, publikacja na domenie, wycofanie) — dopisane 8.11.
6. Poczta: skrzynka, wysyłka, odbiór, telefon.
7. Przeniesienie poczty ze starego hostingu (IMAP, foldery i liczba wiadomości) — dopisane 26.10.
8. Kopie zapasowe i odtwarzanie.
9. Staging i narzędzia strony (PHP, phpMyAdmin, FTP).
10. Asystent AI w panelu.
11. Zużycie, prognoza i autoskalowanie.
12. Płatności, faktury i odnowienie (dane do faktury, doładowanie BLIK/kartą, faktura, data odnowienia) — dopisane 26.10.
13. Dostęp dla współpracownika (IAM: zaproszenie z ograniczonymi uprawnieniami i odebranie dostępu) — dopisane 26.10.
14. Pomoc i zgłoszenia.
15. Wszystko jeszcze raz — z telefonu.
16. *Opcjonalnie:* Deploy z Gita i budowanie (npm/composer, zmienne, webhook; `/.git/config` i `/.env` niedostępne).
17. *Opcjonalnie:* Aplikacja Node.js albo Python, SSH (CageFS — tylko własne pliki) i cron.

Doładowanie w scenariuszu 12 zależy od trybu płatności: przy kluczach testowych Paynow/Stripe tester potrzebuje danych
testowych (np. karta 4242…), przy produkcyjnych płaci naprawdę i dostaje równowartość kredytem (patrz „Co dostają”).
Przed wysłaniem zaproszeń właściciel decyduje, który tryb obowiązuje, i pisze to testerom.

## Testy operatora w trakcie bety (nie dla testerów)

- **Dobór węzła:** kilka zakupów z rzędu — konta rozkładają się według obciążenia (gorsze z handlowego
  i fizycznego); zachowanie, gdy węzeł jest pełny (`maxAccounts`, np. limit licencji DA Lite) albo wyłączony z puli.
- **Autoskalowanie pod obciążeniem:** krótki test ruchu na stronie testowej — limit rośnie, opłata z portfela,
  powrót po spadku ruchu.
- **Aktualizacja węzła w trakcie bety** (fala, węzeł testowy pierwszy) — strony testerów działają w tym czasie.
- **Alerty:** zatrzymana usługa na węźle (np. LiteSpeed na 2 minuty) → panel, e-mail, push.
- **Kopie:** co rano wpis z nocnej kopii off-site z obu węzłów (Flota → Kopie).
- **Licencje:** ważność LiteSpeed, CloudLinux i DirectAdmina na obu węzłach (ręcznie, dopóki nie ma monitoringu).
- **Git po aktualizacji węzła:** `curl -I https://<strona>/.git/config` → 403 (paczka 98).

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
- [x] Pływający przycisk **„Zgłoś uwagę”** w panelu klienta — widzi go każdy tester (kod z zaproszenia, `GET /me/beta`),
      bez włączania flagi `beta.zglos-uwage` dla wszystkich. Formularz: opis, rodzaj (błąd / pomysł / niejasne),
      „Wskaż miejsce na stronie” (opis elementu, sekcja, selektor i położenie w treści zgłoszenia), zrzut widocznej części
      strony z ramką wskazanego elementu (podgląd przed wysłaniem, można odznaczyć), własne pliki. Zgłoszenie z tematem
      Beta, zrzut jako załącznik. Przycisk da się schować do zakładki przy prawej krawędzi.
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
