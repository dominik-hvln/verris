---
title: "Sklep zwalnia albo pada przy ruchu — jak znaleźć przyczynę"
slug: "sklep-nie-wyrabia-ruchu"
excerpt: "Błąd 503 w środku kampanii to najdroższa awaria w e-commerce. Pokazujemy, jak odróżnić brak mocy od złej konfiguracji i co zrobić z każdym z tych przypadków."
metaTitle: "Sklep pada przy ruchu — jak znaleźć przyczynę | Verris"
metaDescription: "Dlaczego sklep zwalnia lub zwraca błąd 503 przy większym ruchu: brak zasobów, baza danych, cache, wtyczki. Jak zdiagnozować i naprawić."
keyword: "sklep nie wyrabia ruch"
cluster: "E-commerce"
type: "spoke"
status: "draft"
faq: [{"q": "Czy VPS rozwiąże problem?", "a": "Niekoniecznie. Źle skonfigurowany VPS padnie tak samo. Najpierw konfiguracja, potem zasoby."}, {"q": "Ile mocy potrzebuje sklep?", "a": "Zamiast zgadywać, wybierz model, w którym zasoby rosną automatycznie w piku."}]
---

# Sklep zwalnia albo pada przy ruchu — jak znaleźć przyczynę

**W skrócie:** gdy sklep pada dokładnie wtedy, gdy rośnie ruch, przyczyny są zwykle trzy: brak zasobów (CPU/RAM), przeciążona baza danych albo brak cache. Kolejność diagnozy ma znaczenie — bo dokładanie mocy do źle skonfigurowanego sklepu tylko odsuwa problem.

## Jak odróżnić brak mocy od złej konfiguracji

| Objaw | Prawdopodobna przyczyna |
|---|---|
| Wolno **zawsze**, niezależnie od ruchu | Konfiguracja: brak cache, ciężkie wtyczki, obrazy |
| Wolno **tylko w piku**, potem wraca do normy | Brak zasobów — pakiet się kończy |
| Błąd **503/504** w szczycie | Serwer odrzuca żądania: brak mocy albo limity |
| Wolny koszyk, szybka strona główna | Baza danych i sesje (koszyk nie korzysta z cache) |

## Krok 1: cache i obrazy

Strona główna i kategorie powinny iść z cache. Koszyk i checkout — nie mogą (są dynamiczne), dlatego odciążenie reszty jest tak ważne. Do tego [optymalizacja obrazów](/blog/przyspieszanie-wordpressa) — to zwykle największa waga strony.

## Krok 2: baza danych i wtyczki

W piku to baza najczęściej staje się wąskim gardłem. Usuń nieużywane wtyczki, sprawdź te, które przy każdym żądaniu odpytują bazę (liczniki, „ostatnio oglądane", rozbudowane filtry).

## Krok 3: zasoby

Jeśli po optymalizacji sklep nadal zwalnia proporcjonalnie do ruchu — po prostu brakuje mocy. Masz dwa wyjścia: kupić większy pakiet na cały rok albo użyć [autoskalowania](/funkcje/autoskalowanie), które dokłada zasoby na godziny piku i zwalnia je, gdy ruch spada.

## Co zrobić natychmiast, gdy sklep pada teraz

1. Włącz cache, jeśli był wyłączony.
2. Wyłącz najcięższe, nieistotne wtyczki.
3. Sprawdź w panelu, czy nie kończą się zasoby.
4. Nie wdrażaj w tym momencie żadnych „usprawnień" — to nie czas na eksperymenty.

## Zapobieganie

Przetestuj sklep **przed** sezonem, zrób [kopię zapasową](/blog/kopie-zapasowe-strony), zamroź zmiany na kilka dni przed szczytem i upewnij się, że hosting skaluje się na żądanie. Pełna checklista: [hosting na Black Friday](/blog/hosting-black-friday).

## FAQ

**Czy VPS rozwiąże problem?**
Niekoniecznie. [Źle skonfigurowany VPS](/blog/vps-czy-hosting-wspoldzielony) padnie tak samo. Najpierw konfiguracja, potem zasoby.

**Ile mocy potrzebuje sklep?**
Zamiast zgadywać, wybierz model, w którym zasoby rosną automatycznie w piku.

---

*Nie chcesz zgadywać przed sezonem? [Zobacz hosting pod sklep](/hosting/sklep).*
