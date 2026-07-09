---
title: "Jak zmienić DNS przy przenoszeniu strony (i uniknąć przestoju)"
slug: "zmiana-dns"
excerpt: "Przełączenie DNS to ostatni krok migracji — i jedyny moment, w którym coś może pójść nie tak. Wyjaśniamy rekordy, propagację i sprawdzoną kolejność działań."
metaTitle: "Zmiana DNS przy przenoszeniu strony — jak uniknąć przestoju | Verris"
metaDescription: "Jak poprawnie zmienić rekordy DNS przy migracji: A, CNAME, MX, TTL i propagacja. Kolejność działań, która nie powoduje przestoju."
keyword: "zmiana dns hosting"
cluster: "Migracja"
type: "spoke"
status: "draft"
faq: [{"q": "Ile trwa propagacja DNS?", "a": "Zwykle od kilkunastu minut do kilku godzin; przy wysokim TTL nawet do 24–48 h. Dlatego warto wcześniej obniżyć TTL."}, {"q": "Czy mogę cofnąć zmianę?", "a": "Tak — wystarczy przywrócić stare rekordy. Też będzie podlegać propagacji."}]
---

# Jak zmienić DNS przy przenoszeniu strony

**W skrócie:** DNS to książka telefoniczna internetu — mówi przeglądarce, na którym serwerze stoi Twoja strona. Przy migracji zmieniasz rekord **A** (strona) i **MX** (poczta) tak, by wskazywały nowy serwer. Zmiana nie działa natychmiast u wszystkich: trwa **propagacja**, zwykle od kilkunastu minut do kilku godzin.

## Rekordy, które Cię interesują

| Rekord | Do czego służy |
|---|---|
| **A** | Wskazuje domenę na adres IP serwera WWW |
| **CNAME** | Alias (np. `www` → domena główna) |
| **MX** | Wskazuje serwer poczty |
| **TXT** | SPF, DKIM, DMARC, weryfikacje |
| **TTL** | Jak długo serwery mogą trzymać starą odpowiedź w cache |

## Kolejność, która nie powoduje przestoju

1. **Przenieś dane** (pliki, bazę, pocztę) i przetestuj stronę pod adresem tymczasowym.
2. **Obniż TTL** (np. do 300 s) na 24 h przed przełączeniem — skróci to propagację.
3. **Zmień rekord A** (i `www`) na IP nowego serwera.
4. **Zmień MX** na nowy serwer poczty (jeśli przenosisz pocztę).
5. **Zaktualizuj TXT** — SPF/DKIM/DMARC dla nowego nadawcy.
6. **Nie kasuj starego hostingu** przez 2–3 dni.

## Propagacja — co się właściwie dzieje

Serwery DNS na świecie cache'ują odpowiedzi na czas określony przez TTL. Po zmianie część z nich jeszcze przez jakiś czas podaje stary adres. Dlatego przez kilka godzin **część odwiedzających widzi starą stronę** — nie „pustkę". Jeśli obie wersje działają, nikt nie zauważy przerwy.

To także powód, dla którego [zmiana hostingu nie szkodzi pozycjom w Google](/blog/zmiana-hostingu-a-seo).

## Najczęstsze błędy

- Zmiana DNS **przed** skopiowaniem danych (strona znika).
- Zapomniany rekord `www` (działa `domena.pl`, nie działa `www.domena.pl`).
- Brak aktualizacji SPF/DKIM po przeniesieniu poczty → maile w spamie.
- Wyłączenie starego hostingu tego samego dnia.

## Czy muszę przenosić domenę?

Nie. Domena może zostać u obecnego rejestratora — wystarczy zmienić rekordy DNS. [Transfer domeny](/blog/transfer-domeny) jest opcjonalny.

## FAQ

**Ile trwa propagacja DNS?**
Zwykle od kilkunastu minut do kilku godzin; przy wysokim TTL nawet do 24–48 h. Dlatego warto wcześniej obniżyć TTL.

**Czy mogę cofnąć zmianę?**
Tak — wystarczy przywrócić stare rekordy. Też będzie podlegać propagacji.

---

*Nie chcesz robić tego sam? [W Verris migracja jest darmowa](/przenies-strone) — DNS przełączasz dopiero, gdy wszystko sprawdzone.*
