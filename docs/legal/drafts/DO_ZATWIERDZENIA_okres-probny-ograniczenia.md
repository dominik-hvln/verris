# Okres próbny — ograniczenia w Regulaminie §7 ust. 8 (projekt do zatwierdzenia)

> **Status: WBUDOWANE w szkic Regulaminu 1.1.0 (paczka 109, 2026-11-03): `terms.md` §7 ust. 8 w brzmieniu z pkt 3 (odwołanie: §9 ust. 5). `trialDays` zostaje 0 do wejścia 1.1.0 w życie — patrz `ZMIANY_1.0.0-1.1.0.md`.** Historia: PROJEKT · 2026-11-01. Po akceptacji właściciela nowe brzmienie trafia do
> `terms.md` (§7 ust. 8) w najbliższej wersji Regulaminu. Dopiero po jej publikacji admin ustawia planowi hostingu
> `trialDays = 14` — wtedy verris.pl i panel zaczynają pokazywać „14 dni za darmo”.

## 1. Stan na dziś

- Kod (paczki 106–107) ma ograniczenia próby: dobowy limit wysyłki poczty 100 wiadomości
  (`LIMIT_WYSYLKI_PROBY` w `libs/contracts/src/mail-limits.ts`, ustawiany przez
  `apps/api/src/subscriptions/limit-wysylki-proby.service.ts`), blokada rejestracji i transferu domen, gdy klient ma
  tylko usługę próbną (`domain-registrar.service.ts`), blokada autoskalowania w próbie (`subscriptions.service.ts`
  setAutoscaling, silnik autoskalowania pomija próby). Panel klienta i verris.pl opisują te ograniczenia.
- Plan hostingu ma dziś `trialDays = 0` — okresu próbnego nie można uruchomić.
- Regulamin (`terms.md` §7 ust. 8) mówi o bezpłatnym okresie próbnym, ale **nie wymienia ograniczeń**. Bez zapisu
  w Regulaminie klient może słusznie twierdzić, że próba miała być „pełną” usługą.

## 2. Obecne brzmienie §7 ust. 8

> 8. Verris może oferować bezpłatny okres próbny wybranych Planów. Okres próbny nie wymaga podania danych płatniczych
> i nie przekształca się automatycznie w odpłatną Subskrypcję: po jego upływie Usługa zostaje zawieszona, a jeżeli
> Klient nie opłaci Planu w ciągu 14 dni — dane Usługi są usuwane. O zbliżającym się końcu okresu próbnego Verris
> informuje e-mailem.

## 3. Proponowane brzmienie §7 ust. 8

> 8. Verris może oferować bezpłatny okres próbny wybranych Planów — jeden na Konto. Okres próbny nie wymaga podania
> danych płatniczych i nie przekształca się automatycznie w odpłatną Subskrypcję: po jego upływie Usługa zostaje
> zawieszona, a jeżeli Klient nie opłaci Planu w ciągu 14 dni — dane Usługi są usuwane. O zbliżającym się końcu okresu
> próbnego Verris informuje e-mailem. W czasie okresu próbnego, w celu ochrony przed nadużyciami:
> a) dobowy limit wiadomości e-mail wysyłanych z konta wynosi 100,
> b) rejestracja i transfer domen są niedostępne, jeżeli Klient nie ma żadnej opłaconej Usługi,
> c) autoskalowanie (dodatkowe zasoby ponad Plan, §9) jest wyłączone.
> Ograniczenia ustają z chwilą opłacenia Planu. Zakres ograniczeń jest opisany przy zamówieniu okresu próbnego w Panelu.

Uwaga do numeracji: odwołanie „§9” wskazuje usługi rozliczane zużyciem (autoskalowanie) — sprawdzić przy redakcji
wersji, czy numer się nie zmienił.

## 4. Uzasadnienie

- Darmowy hosting bez weryfikacji płatności to typowy kanał wysyłki spamu i phishingu (ustalenie z audytu parytetu
  08.2026: „wolny hosting”). Limit wysyłki i brak domen ograniczają nadużycia bez odbierania klientowi możliwości
  przetestowania strony, panelu i przeniesienia.
- Autoskalowanie jest odpłatne (naliczane z Portfela) — w bezpłatnej próbie nie ma z czego go rozliczyć.
- Zapis „jeden na Konto” odpowiada kodowi (`User.trialStartedAt`, `trial.service.ts`).

## 5. Czy zmiana jest na niekorzyść Klienta — tryb §24

- Okres próbny jest dziś niedostępny (`trialDays = 0`), więc żaden Klient nie korzysta z niego na starych zasadach.
  Zmiana doprecyzowuje warunki usługi, która jeszcze nie jest świadczona.
- Formalnie dopisanie ograniczeń jest zmianą na niekorzyść względem obecnego tekstu, dlatego bezpieczniej opublikować
  ją z zachowaniem terminu 30 dni z §24 ust. 2 (jako część najbliższej wersji Regulaminu, np. razem z 1.1.0), a nie
  w trybie §24 ust. 4. Do tego czasu `trialDays` zostaje 0.

## 6. Checklista publikacji

- [ ] Właściciel akceptuje brzmienie z pkt 3 (albo poprawia limity — wtedy zmienić też `LIMIT_WYSYLKI_PROBY`).
- [ ] Treść trafia do `terms.md` §7 ust. 8 w najbliższej wersji; zawiadomienie klientów 30 dni przed wejściem w życie.
- [ ] Polityka prywatności i informacje konsumenckie (`consumer-info.md`) — sprawdzić, czy opis próby się zgadza.
- [ ] Po wejściu wersji w życie: panel admina → Plany → hosting → `trialDays = 14`.
- [ ] Sprawdzić na verris.pl, że przyciski zmieniły się na „Wypróbuj 14 dni za darmo”, a w panelu pojawił się blok próby
      z listą ograniczeń.
- [ ] Sprawdzić na węźle, że konto próbne dostało limit 100 wiadomości (zadanie MAIL_QUEUE w panelu zespołu).
