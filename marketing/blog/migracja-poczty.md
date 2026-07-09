---
title: "Migracja poczty e-mail między hostingami bez utraty wiadomości"
slug: "migracja-poczty"
excerpt: "Poczta bywa najbardziej stresującym elementem przeprowadzki. Zobacz, jak przenieść skrzynki i wiadomości bez luk, bez odbić i bez godzin przestoju."
metaTitle: "Migracja poczty e-mail między hostingami — jak nie stracić wiadomości | Verris"
metaDescription: "Jak przenieść pocztę na nowy hosting: kolejność działań, MX i DNS, synchronizacja IMAP, okres przejściowy. Bez utraty wiadomości i bez odbić."
keyword: "przeniesienie poczty hosting"
cluster: "Migracja"
type: "spoke"
status: "draft"
faq: [{"q": "Czy stracę stare wiadomości?", "a": "Nie — kopiujemy je na nowy serwer przed przełączeniem MX, a po przełączeniu robimy dosynchronizację."}, {"q": "Czy muszę zmieniać hasła do skrzynek?", "a": "Nie musisz, ale to dobry moment, żeby to zrobić — zwłaszcza jeśli hasła są stare."}]
---

# Migracja poczty e-mail między hostingami bez utraty wiadomości

**W skrócie:** pocztę przenosi się przez utworzenie skrzynek na nowym serwerze, skopiowanie wiadomości (synchronizacja IMAP) i dopiero na końcu zmianę rekordów **MX**. Dopóki MX wskazują na stary serwer, poczta trafia tam — dlatego kolejność ma znaczenie i żadna wiadomość nie ginie.

## Dlaczego poczta jest trudniejsza niż strona

Stronę można skopiować i przetestować pod tymczasowym adresem. Poczta przychodzi **w czasie rzeczywistym** — w trakcie przeprowadzki ktoś może wysłać Ci wiadomość. Sztuka polega na tym, by w każdym momencie istniał serwer, który ją przyjmie.

## Kolejność, która działa

1. **Utwórz skrzynki na nowym hostingu** (te same adresy, nowe hasła lub te same).
2. **Skopiuj wiadomości** — synchronizacja IMAP ze starego serwera na nowy. Stary działa dalej.
3. **Sprawdź** foldery, załączniki, katalogi wysłanych.
4. **Zmień rekordy MX** na nowy serwer. Od tej chwili nowe wiadomości trafiają do Verris.
5. **Dosynchronizuj** wiadomości, które w międzyczasie wpadły na stary serwer (okres przejściowy: 24–48 h).
6. **Zaktualizuj klienty pocztowe** (Outlook, telefon) — nowe serwery IMAP/SMTP.

## Okres przejściowy — najważniejsza rzecz

Zmiana MX nie działa u wszystkich natychmiast. Przez kilka–kilkanaście godzin część nadawców użyje jeszcze starego serwera. Dlatego **nie kasuj starych skrzynek** przez co najmniej 2–3 dni po przełączeniu i wykonaj końcową dosynchronizację.

## Czego pilnować, żeby maile nie lądowały w spamie

Po zmianie serwera musisz zadbać o rekordy uwierzytelniające nadawcę:

- **SPF** — kto może wysyłać w imieniu Twojej domeny,
- **DKIM** — podpis kryptograficzny wiadomości,
- **DMARC** — polityka postępowania z niezgodnymi wiadomościami.

Bez nich dostarczalność potrafi wyraźnie spaść. To najczęstsza przyczyna „po migracji maile idą do spamu".

## Jak to wygląda w Verris

Pocztę przenosimy **razem ze stroną**, w ramach [darmowej migracji](/przenies-strone) — wystarczy przekazać dostępy. Skrzynki działają na DirectAdmin z webmailem Roundcube; szczegóły na stronie [poczty](/poczta). Do czasu przełączenia DNS/MX wszystko działa u obecnego dostawcy.

## FAQ

**Czy stracę stare wiadomości?**
Nie — kopiujemy je na nowy serwer przed przełączeniem MX, a po przełączeniu robimy dosynchronizację.

**Czy muszę zmieniać hasła do skrzynek?**
Nie musisz, ale to dobry moment, żeby to zrobić — zwłaszcza jeśli hasła są stare.

---

*Przenosisz stronę? [Pocztę weźmiemy razem z nią — za 0 zł](/przenies-strone).*
