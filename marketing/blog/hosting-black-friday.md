---
title: "Hosting na Black Friday — jak przygotować sklep na pik ruchu"
slug: "hosting-black-friday"
excerpt: "W Black Friday każdy błąd 503 to utracona sprzedaż. Sprawdź, jak przygotować sklep i hosting na kilkukrotny skok ruchu — z checklistą na tydzień przed."
metaTitle: "Hosting na Black Friday — jak przygotować sklep na pik | Verris"
metaDescription: "Jak przygotować sklep i hosting na Black Friday: wydajność, cache, kopie zapasowe, testy koszyka i skalowanie zasobów. Checklista krok po kroku."
keyword: "hosting black friday"
cluster: "Koszty"
type: "spoke"
status: "draft"
faq: [{"q": "Ile mocy potrzebuję na Black Friday?", "a": "Zależy od ruchu. Zamiast zgadywać, wybierz model, który skaluje się automatycznie — wtedy pytanie znika."}, {"q": "Czy zdążę zmienić hosting przed sezonem?", "a": "Migracja typowej strony to kwestia godzin do 1–2 dni. Zaplanuj ją z co najmniej dwutygodniowym zapasem."}]
---

# Hosting na Black Friday — jak przygotować sklep na pik ruchu

**W skrócie:** w szczycie sprzedaży ruch potrafi wzrosnąć kilkukrotnie w ciągu godziny. Sklep przetrwa, jeśli ma zapas mocy (albo skalowanie na żądanie), działający cache, aktualną kopię zapasową i przetestowany checkout. Migrację hostingu planuj **poza** sezonem — nigdy w jego trakcie.

## Co się psuje w piku

- **Brak mocy** → strona zwalnia, potem zwraca błąd 503.
- **Baza danych** → koszyk i zamówienia obciążają ją najmocniej.
- **Płatności** → wtyczka, która działała przy 10 zamówieniach, potrafi paść przy 200.
- **Panikowa aktualizacja** w trakcie sezonu → najczęstsza przyczyna awarii.

## Checklista na 2 tygodnie przed

1. **Zrób kopię zapasową** i sprawdź, że umiesz ją przywrócić ([jak](/blog/kopie-zapasowe-strony)).
2. **Zaktualizuj wtyczki i motyw** — teraz, nie w Black Friday.
3. **Przetestuj checkout** i płatności od początku do końca.
4. **Włącz cache** i zoptymalizuj obrazy produktów.
5. **Sprawdź, co robi hosting przy piku** — dopłata, skalowanie czy błąd?
6. **Zamroź zmiany** na 3 dni przed startem.

## Zapas mocy albo skalowanie

Masz dwie opcje. Pierwsza: kupić większy pakiet i płacić za niego cały rok. Druga: [autoskalowanie](/funkcje/autoskalowanie), które dokłada zasoby (do 24 vCPU i 64 GB RAM) na godziny piku i zwalnia je, gdy ruch spada. Przy sprzedaży sezonowej druga opcja jest po prostu tańsza — policz swój przypadek w [kalkulatorze](/przenies-strone#kalkulator).

## Czego nie robić

- **Nie migruj hostingu w tygodniu Black Friday.** Przeprowadzkę zaplanuj miesiąc wcześniej albo po sezonie.
- **Nie aktualizuj wtyczki płatności** dzień przed startem.
- **Nie testuj nowych integracji** na produkcji w szczycie.

## Po sezonie

Sprawdź, ile zasobów realnie zużył pik. To najlepsza podstawa do decyzji o hostingu na kolejny rok — i argument, żeby nie płacić za moc „na zapas" przez pozostałe 11 miesięcy.

## FAQ

**Ile mocy potrzebuję na Black Friday?**
Zależy od ruchu. Zamiast zgadywać, wybierz model, który skaluje się automatycznie — wtedy pytanie znika.

**Czy zdążę zmienić hosting przed sezonem?**
[Migracja](/przenies-strone) typowej strony to kwestia godzin do 1–2 dni. Zaplanuj ją z co najmniej dwutygodniowym zapasem.

---

*Przygotuj sklep na sezon — [zobacz hosting pod sklep](/hosting/sklep).*
