---
title: "Jak przenieść stronę na inny hosting bez przestoju — kompletny przewodnik"
slug: "jak-przeniesc-strone-na-inny-hosting"
excerpt: "Przeniesienie strony na inny hosting nie musi oznaczać przerwy w działaniu ani utraty pozycji w Google. Zobacz, jak zrobić to krok po kroku — samodzielnie albo z darmową pomocą zespołu."
metaTitle: "Jak przenieść stronę na inny hosting bez przestoju | Verris"
metaDescription: "Przewodnik krok po kroku: jak przenieść stronę i pocztę na inny hosting bez przestoju i bez utraty pozycji w Google. Migracja obok działającej strony, przełączenie przez DNS."
keyword: "przeniesienie strony na inny hosting"
cluster: "Migracja"
type: "pillar"
status: "draft"
faq: [{"q": "Czy strona przestanie działać w trakcie przenoszenia?", "a": "Nie powinna. Migracja odbywa się obok działającej strony, a przełączenie następuje dopiero przez zmianę DNS, gdy wszystko jest sprawdzone."}, {"q": "Czy muszę przenosić domenę razem z hostingiem?", "a": "Nie. Domena może zostać u obecnego rejestratora — wystarczy zmienić rekordy DNS. Transfer domeny jest opcjonalny."}, {"q": "Ile trwa migracja?", "a": "Typowa strona firmowa to kwestia godzin do 1–2 dni, wliczając propagację DNS."}]
---

# Jak przenieść stronę na inny hosting bez przestoju

**W skrócie:** przeniesienie strony na inny hosting polega na skopiowaniu plików, bazy danych i poczty na nowy serwer, sprawdzeniu strony pod tymczasowym adresem i przełączeniu rekordów DNS. Wykonane „obok" działającej witryny nie powoduje przestoju, a poprawnie przeprowadzone — nie obniża pozycji w Google. Cały proces zajmuje zwykle od kilku godzin do 1–2 dni (z czasem propagacji DNS).

## Kiedy warto zmienić hosting

Najczęstsze powody to skokowa podwyżka przy odnowieniu (tani pierwszy rok, drogie kolejne), wolne ładowanie, częste awarie bez rekompensat albo brak potrzebnych funkcji. Jeśli płacisz za sztywny pakiet „na zapas", a i tak brakuje mocy w piku — to też sygnał do zmiany. W Verris płacisz za realne użycie: bazę masz w cenie, a [autoskalowanie](/funkcje/autoskalowanie) dokłada moc tylko wtedy, gdy jest potrzebna.

## Przygotowanie: co zebrać przed migracją

- Dostępy do obecnego hostingu (panel/FTP/SSH, baza danych).
- Listę domen i skrzynek e-mail do przeniesienia.
- Aktualną kopię zapasową strony (dobra praktyka, zanim cokolwiek ruszysz).
- Dostęp do panelu domeny (edycja rekordów DNS).

## Migracja krok po kroku

1. **Zamów nowy hosting.** Twoja obecna strona przez cały czas działa u dotychczasowego dostawcy — nic się nie wyłącza.
2. **Przenieś pliki i bazę danych.** Skopiuj pliki (FTP/SSH) i wyeksportuj bazę, a następnie zaimportuj na nowym serwerze. W Verris zrobi to za Ciebie zespół w ramach [darmowej migracji](/przenies-strone) albo migrator w panelu.
3. **Przenieś pocztę.** Skrzynki i wiadomości kopiujemy tak, aby nic nie zginęło. Do czasu przełączenia DNS poczta działa u obecnego dostawcy.
4. **Sprawdź stronę pod tymczasowym adresem.** Zanim przełączysz domenę, upewnij się, że wszystko działa: podstrony, formularze, płatności.
5. **Przełącz DNS.** Zmieniasz rekordy tak, aby wskazywały na nowy serwer. Propagacja trwa zwykle od kilkunastu minut do kilku godzin — w tym czasie część odwiedzających widzi jeszcze starą wersję, ale żadna nie trafia na „pustkę".

## Czy migracja wpłynie na pozycje w Google?

Sama zmiana hostingu nie zmienia adresów URL ani treści, więc poprawnie przeprowadzona migracja **nie powoduje utraty pozycji**. Krótkie wahania podczas propagacji DNS są możliwe, ale ustępują. Szybszy i stabilniejszy serwer może wręcz pomóc — czas ładowania jest czynnikiem rankingowym. Więcej: [zmiana hostingu a SEO](/blog/zmiana-hostingu-a-seo).

## WordPress, sklep, poczta — czy coś się zmienia?

Zasada jest ta sama, różni się tylko zakres. [Przeniesienie WordPressa](/hosting/wordpress) to pliki + baza + konfiguracja. [Sklep](/hosting/sklep) wymaga dodatkowo testu koszyka i płatności po przełączeniu. Pocztę przenosimy razem ze stroną — bez utraty wiadomości.

## Ile to kosztuje

W Verris migracja jest **bezpłatna** w ramach zamówienia hostingu — zarówno pomoc zespołu, jak i migrator w panelu. Nie ma limitu „do X plików" ani dopłat za bazy danych. Sam hosting to 39 zł/mies lub 349 zł/rok brutto. Orientacyjny koszt ewentualnej nadwyżki zasobów policzysz w [kalkulatorze autoskalowania](/przenies-strone#kalkulator).

## FAQ

**Czy strona przestanie działać w trakcie przenoszenia?**
Nie powinna. Migracja odbywa się obok działającej strony, a przełączenie następuje dopiero przez zmianę DNS, gdy wszystko jest sprawdzone.

**Czy muszę przenosić domenę razem z hostingiem?**
Nie. Domena może zostać u obecnego rejestratora — wystarczy zmienić rekordy DNS. Transfer domeny jest opcjonalny.

**Ile trwa migracja?**
Typowa strona firmowa to kwestia godzin do 1–2 dni, wliczając propagację DNS.

---

*Gotowy na przeprowadzkę bez stresu? [Przenieś stronę do Verris za 0 zł](/przenies-strone) — resztą zajmie się nasz zespół.*
