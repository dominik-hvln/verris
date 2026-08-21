---
title: "Hosting pod sklep WooCommerce — wymagania i konfiguracja"
slug: "hosting-woocommerce"
excerpt: "Sklep na WooCommerce ma inne potrzeby niż zwykła strona: piki sprzedaży, płatności, SSL. Sprawdź, jaki hosting go udźwignie i jak przygotować go na sezon."
metaTitle: "Hosting pod sklep WooCommerce — wymagania i konfiguracja | Verris"
metaDescription: "Jaki hosting pod WooCommerce: wydajność w piku sprzedaży, SSL, kopie, wersje PHP i skalowanie. Jak przygotować sklep na Black Friday bez błędu 503."
keyword: "hosting woocommerce"
cluster: "E-commerce"
type: "pillar"
status: "draft"
faq: [{"q": "Czy WooCommerce postawię na hostingu współdzielonym?", "a": "Tak — hosting współdzielony z autoskalowaniem obsłuży typowy sklep i piki. VPS bywa potrzebny dopiero przy bardzo dużych, nietypowych wdrożeniach."}, {"q": "Co robić, gdy sklep zwalnia w kampanii?", "a": "Najczęściej to brak mocy w piku. Autoskalowanie rozwiązuje problem automatycznie; bez niego trzeba z góry kupić większy pakiet."}]
---

# Hosting pod sklep WooCommerce — wymagania i konfiguracja

**W skrócie:** sklep na WooCommerce potrzebuje hostingu, który wytrzyma piki sprzedaży (kampania, Black Friday), zapewni SSL dla koszyka i płatności, ma kopie zapasowe z odtwarzaniem oraz aktualne wersje PHP. Kluczowa jest wydajność w chwili największego ruchu — bo właśnie wtedy każdy błąd to utracona sprzedaż.

## Dlaczego sklep to inny przypadek niż strona firmowa

Zwykła strona obsługuje głównie odczyty. Sklep dokłada koszyk, sesje, płatności i zapisy do bazy — a to obciąża serwer znacznie mocniej, zwłaszcza gdy klientów przybywa naraz. Dlatego hosting pod WooCommerce ocenia się przede wszystkim przez pryzmat **zachowania w piku**.

## Wymagania, na które warto patrzeć

### Wydajność i skalowanie w piku
Black Friday, wysyłka newslettera, udana kampania — ruch potrafi wzrosnąć wielokrotnie w godzinę. Sztywny pakiet wtedy zwraca błąd 503. [Autoskalowanie](/funkcje/autoskalowanie) dokłada moc (do 24 vCPU i 64 GB RAM) na te godziny, więc koszyk działa dalej.

### SSL dla koszyka i płatności
Płatności i dane klientów muszą iść po HTTPS. Sprawdź, czy [certyfikat SSL](/funkcje/ssl) jest w cenie — w sklepie to warunek konieczny, nie dodatek.

### Kopie zapasowe
Aktualizacja wtyczki płatności potrafi popsuć checkout. [Kopie z samodzielnym odtwarzaniem](/funkcje/kopie-zapasowe) pozwalają błyskawicznie cofnąć zmianę.

### Wersje PHP
WooCommerce i wtyczki wymagają zgodnych wersji PHP. Dobry hosting pozwala wybrać wersję i obsługuje starsze, gdy trzeba.

## Jak przygotować sklep na sezon

1. Przetestuj checkout i płatności **przed** szczytem.
2. Zrób kopię zapasową i sprawdź, że umiesz ją przywrócić.
3. Upewnij się, że hosting ma zapas mocy na pik (albo autoskalowanie).
4. Zoptymalizuj obrazy produktów i włącz cache.
5. Zaplanuj migrację **poza** sezonem, jeśli zmieniasz hosting.

## Migracja sklepu bez utraty sprzedaży

Sklep przenosi się jak każdą stronę — obok działającej witryny, z przełączeniem przez DNS — ale z dodatkowym testem koszyka i płatności po przełączeniu. W Verris [migracja](/przenies-strone) jest darmowa; najlepiej zaplanować ją poza szczytem sprzedaży.

## FAQ

**Czy WooCommerce postawię na hostingu współdzielonym?**
Tak — [hosting współdzielony](/hosting/sklep) z autoskalowaniem obsłuży typowy sklep i piki. VPS bywa potrzebny dopiero przy bardzo dużych, nietypowych wdrożeniach.

**Co robić, gdy sklep zwalnia w kampanii?**
Najczęściej to brak mocy w piku. Autoskalowanie rozwiązuje problem automatycznie; bez niego trzeba z góry kupić większy pakiet.

---

*Przygotuj sklep na sezon — [zobacz hosting pod sklep](/hosting/sklep) i policz koszt piku w [kalkulatorze](/przenies-strone#kalkulator).*
