---
title: "Jak przenieść WordPress na nowy hosting (krok po kroku)"
slug: "jak-przeniesc-wordpress-na-nowy-hosting"
excerpt: "Przeniesienie WordPressa to pliki, baza danych i konfiguracja. Pokazujemy, jak zrobić to bez przestoju — samodzielnie albo z darmową pomocą zespołu."
metaTitle: "Jak przenieść WordPress na nowy hosting — krok po kroku | Verris"
metaDescription: "Instrukcja przenoszenia WordPressa na nowy hosting: pliki, baza danych, wp-config, testy i przełączenie DNS. Bez przestoju i bez utraty pozycji w Google."
keyword: "jak przenieść wordpress"
cluster: "Migracja"
type: "spoke"
status: "draft"
faq: [{"q": "Czy stracę wtyczki i ustawienia?", "a": "Nie — przenosisz całą instalację razem z wtyczkami, motywem i bazą, więc konfiguracja zostaje."}, {"q": "Ile trwa migracja WordPressa?", "a": "Typowo od kilku godzin do dnia, wliczając propagację DNS. Duże sklepy z wieloma mediami mogą potrzebować więcej."}]
---

# Jak przenieść WordPress na nowy hosting (krok po kroku)

**W skrócie:** przeniesienie WordPressa polega na skopiowaniu plików (katalog `wp-content` i całość instalacji), wyeksportowaniu bazy danych, zaimportowaniu jej na nowym serwerze, poprawieniu `wp-config.php` i przetestowaniu strony pod tymczasowym adresem przed przełączeniem DNS. Zrobione obok działającej witryny — bez przestoju.

## Co się na to składa

WordPress = pliki + baza danych + konfiguracja. Przenosisz wszystkie trzy elementy:

- **Pliki** — cała instalacja, w tym motyw, wtyczki i `wp-content` (media).
- **Baza danych** — treści, ustawienia, użytkownicy.
- **Konfiguracja** — `wp-config.php` z danymi dostępu do nowej bazy.

## Migracja krok po kroku (ręcznie)

1. **Zrób kopię zapasową** starej strony (pliki + baza).
2. **Skopiuj pliki** na nowy serwer (FTP/SSH).
3. **Wyeksportuj bazę** (np. z phpMyAdmin) i **zaimportuj** na nowym hostingu.
4. **Zaktualizuj `wp-config.php`** — nazwa bazy, użytkownik, hasło, host.
5. **Przetestuj** stronę pod tymczasowym adresem: podstrony, media, logowanie do panelu.
6. **Przełącz DNS** — dopiero gdy wszystko działa.

## Prościej: darmowa migracja albo migrator

Ręczne przenoszenie wymaga trochę wprawy. W Verris masz dwie prostsze drogi: [zespół przeniesie WordPressa za darmo](/przenies-strone) w ramach zamówienia hostingu (wystarczy przekazać dostępy) albo użyjesz migratora w panelu, który zrobi to samodzielnie, krok po kroku. Bez limitu plików i bez dopłat za bazy.

## Częste problemy i jak ich uniknąć

- **Białe strony po migracji** — zwykle błąd w `wp-config.php` albo brakujące rozszerzenie PHP. Sprawdź [wersję PHP](/hosting/wordpress).
- **Popsute linki do mediów** — po zmianie adresu warto zaktualizować adresy w bazie.
- **Utracone e-maile** — pamiętaj o [migracji poczty](/blog/jak-przeniesc-strone-na-inny-hosting) razem ze stroną.

## A pozycje w Google?

Sama zmiana hostingu nie zmienia URL-i ani treści, więc [nie szkodzi pozycjom](/blog/zmiana-hostingu-a-seo). Szybszy serwer może wręcz pomóc.

## FAQ

**Czy stracę wtyczki i ustawienia?**
Nie — przenosisz całą instalację razem z wtyczkami, motywem i bazą, więc konfiguracja zostaje.

**Ile trwa migracja WordPressa?**
Typowo od kilku godzin do dnia, wliczając propagację DNS. Duże sklepy z wieloma mediami mogą potrzebować więcej.

---

*Nie chcesz robić tego ręcznie? [Przenieś WordPressa do Verris za 0 zł](/przenies-strone) — zajmie się tym zespół.*
