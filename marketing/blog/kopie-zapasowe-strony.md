---
title: "Kopie zapasowe strony — jak i jak często robić backup"
slug: "kopie-zapasowe-strony"
excerpt: "Backup ratuje stronę po nieudanej aktualizacji, ataku albo pomyłce. Zobacz, co powinna obejmować kopia, jak często ją robić i dlaczego liczy się samodzielne odtwarzanie."
metaTitle: "Kopie zapasowe strony — jak i jak często robić backup | Verris"
metaDescription: "Jak robić kopie zapasowe strony: co obejmuje backup, jak często go tworzyć, zasada 3-2-1 i dlaczego kluczowe jest samodzielne odtwarzanie bez czekania na support."
keyword: "kopia zapasowa strony"
cluster: "Bezpieczeństwo i uptime"
type: "spoke"
status: "draft"
faq: [{"q": "Czy hosting robi kopie za mnie?", "a": "W Verris kopie są częścią usługi, a odtworzenie wykonujesz samodzielnie w panelu. Mimo to warto mieć też własną kopię przed dużymi zmianami."}, {"q": "Gdzie trzymać dodatkową kopię?", "a": "Poza serwerem produkcyjnym — np. lokalnie albo w osobnym magazynie. To realizacja zasady 3-2-1."}]
---

# Kopie zapasowe strony — jak i jak często robić backup

**W skrócie:** dobra kopia zapasowa strony obejmuje pliki **i** bazę danych, jest tworzona regularnie (dla aktywnej strony — codziennie), przechowywana w więcej niż jednym miejscu i — co najważniejsze — **daje się samodzielnie przywrócić**. Backup, którego nie umiesz odtworzyć w kryzysie, daje złudne poczucie bezpieczeństwa.

## Po co w ogóle backup

Najczęstsze powody utraty strony to nie spektakularne ataki, tylko codzienność: nieudana aktualizacja wtyczki, błąd w kodzie, pomyłka przy edycji, konflikt po zmianie motywu. W każdym z tych przypadków sprawna kopia zamienia katastrofę w kilkuminutowy powrót do działającej wersji.

## Co powinna obejmować kopia

- **Pliki strony** — motyw, wtyczki, media, konfiguracja.
- **Baza danych** — treści, ustawienia, konta.
- Najlepiej **spójny zestaw** z tego samego momentu (pliki + baza razem).

Kopia samych plików bez bazy (albo odwrotnie) często nie wystarcza do pełnego przywrócenia.

## Jak często robić backup

- **Strona aktywna / sklep** — codziennie (a przed każdą większą zmianą dodatkowo ręcznie).
- **Strona rzadko zmieniana** — kilka razy w tygodniu.
- **Zawsze przed** aktualizacją, migracją albo instalacją wtyczki.

## Zasada 3-2-1

Sprawdzona reguła: **3** kopie danych, na **2** różnych nośnikach/miejscach, w tym **1** poza serwerem produkcyjnym. Chodzi o to, by awaria jednego miejsca nie zabrała ze sobą wszystkich kopii.

## Najważniejsze: samodzielne odtwarzanie

Kopia ma wartość tylko wtedy, gdy potrafisz ją przywrócić — najlepiej sam, od razu, bez czekania na zgłoszenie do supportu. W Verris [kopie zapasowe z samodzielnym odtwarzaniem](/funkcje/kopie-zapasowe) robisz z poziomu panelu DirectAdmin, więc powrót do działającej wersji zajmuje minuty.

## FAQ

**Czy hosting robi kopie za mnie?**
W Verris kopie są częścią usługi, a odtworzenie wykonujesz samodzielnie w panelu. Mimo to warto mieć też własną kopię przed dużymi zmianami.

**Gdzie trzymać dodatkową kopię?**
Poza serwerem produkcyjnym — np. lokalnie albo w osobnym magazynie. To realizacja zasady 3-2-1.

---

*Chcesz mieć plan B w zasięgu ręki? [Zobacz kopie zapasowe w Verris](/funkcje/kopie-zapasowe).*
