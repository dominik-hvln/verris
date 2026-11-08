# Verris Kreator i abonament Kreator Pro w Regulaminie (projekt do zatwierdzenia)

> **Status: PROJEKT · 2026-11-08 (paczka 121). Nie wbudowane w `terms.md`, nic nie opublikowano.** Po akceptacji
> właściciela brzmienie z pkt 3 trafia do `terms.md` w najbliższej wersji Regulaminu (re-consent, §24 ust. 1 –
> „wprowadzenie nowych Usług lub funkcji”). Do tego czasu sprzedaż Kreatora Pro powinna czekać – patrz pkt 5.

## 1. Stan na dziś

- Kod (paczka 121) sprzedaje abonament **Verris Kreator Pro** jako osobną Usługę w torze Subskrypcji: plan
  `kreator-pro` (`productKind = KREATOR_PRO`, migracja `20261108140100_plan_kreator_pro`), 9,90 zł brutto/mies.
  (8,05 zł netto) albo 99 zł brutto/rok (80,49 zł netto), odnowienie automatyczne z Portfela albo kartą, faktura jak
  przy innych Usługach (pozycja „Verris Kreator Pro – abonament miesięczny/roczny”, VAT 23%), anulowanie odnowienia
  w Panelu (Kreator stron).
- Zakup tylko przy **opłaconym, działającym Hostingu**; jeden abonament na Konto.
- Po zawieszeniu albo wygaśnięciu abonamentu kreator wraca do wersji w cenie Hostingu: strony w kreatorze zostają,
  **opublikowane strony działają dalej**, a elementy Pro znikają przy następnej publikacji strony.
- Regulamin (`terms.md` §1 pkt 6) wymienia Usługi: Hosting, VPS, Domeny, E-mail marketing, Program resellerski.
  **Kreatora (w cenie Hostingu) ani Kreatora Pro (płatny abonament) tam nie ma** – klient kupowałby Usługę, której
  Regulamin nie opisuje. §7 ust. 3 (skutki nieudanego odnowienia: „strona wyświetla informację o zawieszeniu”,
  usuwanie danych) nie pasuje do Kreatora Pro – nic nie jest wyłączane ani usuwane poza funkcjami Pro.
- Cennik na verris.pl (`apps/www/src/lib/oferta.ts`) nie ma Kreatora – do decyzji, czy i kiedy pokazać (pkt 5).

## 2. Obecne brzmienie §1 pkt 6

> 6. **Usługi** – usługi świadczone drogą elektroniczną przez Verris: Hosting (rozdz. III §10), VPS (§11), Domeny
> (§12), E-mail marketing (§13) oraz Program resellerski (§14), wraz z prowadzeniem Konta i Panelu oraz programem
> lojalnościowym EKO (§8a).

## 3. Proponowane brzmienie

**§1 pkt 6:**

> 6. **Usługi** – usługi świadczone drogą elektroniczną przez Verris: Hosting (rozdz. III §10) wraz z Verris
> Kreatorem (§13a), VPS (§11), Domeny (§12), E-mail marketing (§13), abonament Verris Kreator Pro (§13a) oraz Program
> resellerski (§14), wraz z prowadzeniem Konta i Panelu oraz programem lojalnościowym EKO (§8a).

**Nowy §13a (po §13 E-mail marketing):**

> ## §13a. Verris Kreator i abonament Kreator Pro
>
> 1. Verris Kreator to narzędzie w Panelu do tworzenia stron internetowych z pomocą sztucznej inteligencji (AI)
>    i ich publikacji na Hostingu Klienta. Kreator jest dostępny w cenie Hostingu w zakresie i z limitami opisanymi
>    w Panelu; w okresie próbnym Hostingu (§7 ust. 8) – w wersji próbnej, bez publikacji pod domeną Klienta.
> 2. Kreator Pro to odpłatny abonament rozszerzający Kreator na całym Koncie (m.in. więcej stron i generacji AI,
>    dodatkowe sekcje i efekty, pełniejsze SEO, wersje językowe) – w zakresie opisanym w Panelu przed zakupem.
>    Kreatora Pro można zamówić wyłącznie przy opłaconym Hostingu; na Koncie może działać jeden abonament.
> 3. Abonament jest Subskrypcją w rozumieniu §7 – miesięczną albo roczną, odnawianą automatycznie z Portfela albo
>    kartą; cenę określa Cennik (§9). Klient może w każdej chwili wyłączyć odnowienie w Panelu; abonament działa
>    wtedy do końca opłaconego okresu.
> 4. Jeżeli odnowienie abonamentu się nie powiedzie, funkcje Kreatora Pro zostają wyłączone z końcem opłaconego
>    okresu (przy płatności kartą – niezwłocznie po nieudanej płatności); uregulowanie zaległości przywraca je
>    automatycznie. Postanowienia §7 ust. 3 o informacji wyświetlanej odwiedzającym i o usuwaniu danych nie mają
>    zastosowania.
> 5. Po zakończeniu abonamentu (wyłączenie odnowienia, wygaśnięcie) Kreator wraca do zakresu dostępnego w cenie
>    Hostingu. Strony utworzone w Kreatorze pozostają na Koncie, a strony już opublikowane działają dalej bez zmian;
>    przy następnej publikacji elementy dostępne tylko w Kreatorze Pro są pomijane albo zastępowane odpowiednikami
>    dostępnymi w cenie Hostingu, o czym Panel informuje przed publikacją.
> 6. Treści wygenerowane przez AI są propozycją: Klient odpowiada za treść publikowanej strony (§16) i powinien ją
>    sprawdzić przed publikacją. Kreator nie dodaje do strony cen, opinii ani danych firmy, których Klient nie podał.

**Uwaga do §7 ust. 3** – zdanie o informacji o zawieszeniu i usuwaniu danych dotyczy Usług z kontem na serwerze;
§13a ust. 4 to wyłącza dla Kreatora Pro. Alternatywa: dopisać w §7 ust. 3 „(z zastrzeżeniem §13a ust. 4)”.

## 4. Uzasadnienie

- Klient kupuje odrębną, odnawialną Usługę – art. 8 ust. 1 pkt 1 i ust. 3 ustawy o świadczeniu usług drogą
  elektroniczną wymaga określenia w regulaminie rodzajów i zakresu usług; art. 12 ust. 1 upk – informacji
  przedumownych (w zamówieniu: `InformacjePrzedumowne`, ten sam formularz co inne usługi).
- Skutki końca abonamentu muszą być opisane wprost (strony zostają, opublikowane działają) – inaczej §7 ust. 3
  sugerowałby wyłączenie strony i usunięcie danych.
- Pkt 6 (AI) – spójne z §5 ust. 5 (asystent AI) i zasadą produktu „AI nie wymyśla cen, opinii, danych firmy”.

## 5. Do decyzji właściciela

1. Akceptacja brzmienia §1 pkt 6 i §13a (albo uwagi) i wybór wersji Regulaminu, do której trafi.
2. **Sprzedaż przed publikacją zmiany Regulaminu** – plan `kreator-pro` z migracji jest publiczny (`isPublic = true`).
   Jeśli sprzedaż ma ruszyć dopiero z nową wersją Regulaminu, admin ukrywa plan (Plany → Verris Kreator Pro →
   „publiczny” wyłączone) albo kreator zostaje za przełącznikiem `wlaczony` w ustawieniu `kreator.konfiguracja` (dziś: testy).
3. Polityka prywatności – generowanie treści przez AI (dostawca, zakres danych z briefu) – sprawdzić, czy pkt 2.7
   (asystent AI) obejmuje Kreator, czy potrzebny osobny punkt.
4. Cennik na verris.pl – dodać Kreator Pro (`apps/www/src/lib/oferta.ts` + strona) czy tylko w Panelu.
