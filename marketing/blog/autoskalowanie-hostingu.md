---
title: "Autoskalowanie hostingu — co to jest i kiedy się opłaca"
slug: "autoskalowanie-hostingu"
excerpt: "Autoskalowanie to model, w którym strona dostaje więcej mocy w piku i zwalnia ją, gdy ruch spada. Wyjaśniamy, jak działa, ile kosztuje i kiedy realnie się opłaca."
metaTitle: "Autoskalowanie hostingu — co to jest i kiedy się opłaca | Verris"
metaDescription: "Czym jest autoskalowanie hostingu, jak działa rozliczenie godzinowe i tryb ECO oraz kiedy opłaca się bardziej niż sztywny pakiet. Przykłady i orientacyjne koszty."
keyword: "autoskalowanie hosting"
cluster: "Koszty"
type: "spoke"
status: "draft"
---

# Autoskalowanie hostingu — co to jest i kiedy się opłaca

**W skrócie:** autoskalowanie to mechanizm, który automatycznie zwiększa zasoby strony (CPU, RAM, dysk) w chwili, gdy ich potrzebuje — np. w piku kampanii — i zwalnia je, gdy ruch spada. Płacisz godzinowo tylko za nadwyżkę ponad bazowy pakiet, więc nie musisz kupować mocy „na zapas".

## Jak działa autoskalowanie

W klasycznym hostingu wybierasz pakiet z góry i płacisz za niego niezależnie od tego, ile realnie zużywasz. Autoskalowanie działa inaczej:

1. **Baza w cenie** — konkretny zestaw zasobów dostępny non-stop (w Verris: 50 GB NVMe, 8 GB RAM, 2 vCPU).
2. **Pik ruchu → scale-up** — gdy strona potrzebuje więcej, zasoby rosną automatycznie i naliczane są godzinowo.
3. **Spadek ruchu → tryb ECO** — nadwyżka jest zwalniana, a naliczanie się kończy.

Nie ma tu ręcznej zmiany pakietu ani przestoju — system reaguje sam.

## Ile to kosztuje

Bazowe zasoby są w cenie abonamentu (39 zł/mies lub 349 zł/rok brutto). Nadwyżkę rozliczamy godzinowo według jawnych stawek brutto: **0,001323 zł za 1% CPU/h**, **0,0882 zł za 1 GB RAM/h**, **0,0008 zł za 1 GB dysku/h**. Orientacyjny koszt policzysz w [kalkulatorze autoskalowania](/przenies-strone#kalkulator).

## Kiedy autoskalowanie się opłaca

- **Strona z sezonowym ruchem** — sklep w Black Friday, biuro podróży wiosną, gastronomia w święta.
- **Kampanie reklamowe** — nagły skok wejść po starcie kampanii albo wzmiance w mediach.
- **Nieprzewidywalny ruch** — publikacja, która „chwyta", newsletter do dużej listy.

W tych przypadkach model godzinowy jest tańszy niż utrzymywanie dużego pakietu przez cały rok. Jeśli Twój ruch jest stały i niski, korzystasz głównie z bazy — i też nie przepłacasz.

## Autoskalowanie a wydajność

Autoskalowanie to nie tylko koszty — to również **stabilność**. Zamiast błędu 503, gdy pakiet się kończy, strona dostaje moc i działa dalej. W Verris skalowanie sięga do 24 vCPU, 64 GB RAM i 1000 GB dysku, więc nawet duży pik nie kładzie witryny.

## FAQ

**Czy zapłacę więcej, niż się spodziewam?**
Nie — naliczanie jest godzinowe i tylko za nadwyżkę ponad bazę. Maksymalny koszt przy pełnym wykorzystaniu policzysz z góry w kalkulatorze, a realny jest zwykle znacznie niższy dzięki trybowi ECO.

**Czy muszę coś ustawiać?**
Nie. Skalowanie działa automatycznie; w panelu widzisz aktualne zużycie i koszty.

**Czym różni się od „nielimitowanego" hostingu?**
„Nielimitowany" to hasło marketingowe bez jawnych zasad. Autoskalowanie ma jawną bazę, jawne stawki i jawny limit maksymalny.

---

*Chcesz płacić za realne użycie, nie za pakiet na zapas? [Zobacz hosting z autoskalowaniem](/hosting).*
