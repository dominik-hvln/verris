# `Z-05` — Webhook płatności przestaje gubić pieniądze

| | |
|---|---|
| **Sprint** | 4 — Odporność płatności i porządek w fakturach |
| **Priorytet** | BLOKER STARTU |
| **Nakład** | M (~16 h) |
| **Zależy od** | — |
| **Status** | zamknięte w kodzie, D2 po zielonym CI |
| **Data** | 2026-08-22 |

---

## Problem

Macierz opisała go tak:

> Klient zapłacił, saldo się nie pojawiło, system uważa zdarzenie za obsłużone i odrzuca
> ponowienia. Odzysk wyłącznie ręcznie w bazie — brak endpointu do ponownego przetworzenia.

Mechanizm w trzech linijkach. `billing.service.ts` robił to w tej kolejności:

```ts
await this.prisma.stripeWebhookEvent.create({ data: { eventId, type } });  // 1
switch (event.type) { … await this.handleCheckoutCompleted(event) … }      // 2
```

Wiersz z kroku 1 **nie miał stanu**. Jego istnienie znaczyło „widziałem to zdarzenie", a kod
w kroku 1 czytał je jako „obsłużyłem to zdarzenie" — bo ponowna dostawa trafiała w unikalny
indeks, dostawała `{ duplicate: true }` i kod **200**.

Więc kiedy krok 2 rzucił wyjątkiem — timeout bazy, chwilowo niedostępny MinIO, cokolwiek —
działo się dokładnie to:

| | |
|---|---|
| Stripe | dostawa nieudana (5xx), ponawiam |
| My | „to duplikat", 200 |
| Stripe | doręczone, kończę |
| Portfel klienta | pusty |
| Nasz system | zdarzenie obsłużone |

I nikt się o tym nie dowiadywał, bo **żadna z tych rzeczy nie jest błędem** z osobna. Wpis
w logu o wyjątku szedł w tym samym strumieniu co setki innych, a stan bazy wyglądał na
poprawny.

### Dlaczego to bloker, a nie „wysoki"

Bo awaria jest **cicha i jednokierunkowa**. Klient widzi obciążenie na karcie i puste saldo;
my widzimy zdarzenie oznaczone jako obsłużone. Nie ma sygnału, który by je połączył — chyba
że klient napisze. To jest gorszy rodzaj błędu niż awaria, która krzyczy.

## Rozwiązanie

Wiersz dostaje **stan**, a stan znaczy dokładnie to, co mówi:

```
PENDING ──sukces──▶ PROCESSED        (koniec; dopiero teraz ponowienia to duplikaty)
   │
   └────błąd─────▶ FAILED ──ponowienie──▶ PENDING …
```

`PENDING` to „zajęte, handler w trakcie", nie „obsłużone". Cała różnica siedzi w tym jednym
rozróżnieniu, którego przedtem nie było czym wyrazić.

### Cztery decyzje, które trzeba było podjąć

**1. Co odpowiedzieć, gdy handler padnie.** Wyjątek leci dalej, więc endpoint zwraca 5xx
i Stripe ponawia. Odpowiedź 200 z zapisanym błędem byłaby wygodniejsza w logach i katastrofalna
w skutkach — to jest dokładnie ten ruch, który stworzył Z-05.

**2. Co z dostawą, która trafia na zdarzenie właśnie obsługiwane.** Odmowa (409), nie „duplikat".
Tamta dostawa może przecież paść; gdybyśmy odpowiedzieli 200, Stripe uznałby zdarzenie za
doręczone i zostalibyśmy z tym samym problemem, tylko trudniejszym do odtworzenia.

**3. Co z wierszem porzuconym w połowie.** Proces API ubity między zajęciem a zakończeniem
(wdrożenie, OOM, restart węzła) zostawia `PENDING`, którego nikt już nie ruszy — **ta sama
pułapka co przed Z-05, tylko pod inną nazwą**. Stąd dzierżawa: `PENDING` starszy niż 5 minut
wolno przejąć. Bez tej reguły naprawa zostawiłaby własną, świeżą wersję tego samego błędu.

**4. Skąd brać treść zdarzenia do ponowienia.** Zapisujemy ją u siebie (`payload Json`).
Alternatywa — pobieranie ze Stripe'a przez `events.retrieve` — nie trzymałaby u nas żadnych
dodatkowych danych płatniczych, ale wymaga żywego Stripe'a, **a Stripe leżący to dokładnie ta
sytuacja, w której webhooki padają**. Do tego 30-dniowa retencja po ich stronie jest twardą
granicą, na którą nie mamy wpływu. Koszt tej decyzji: treść zdarzenia leży u nas — dlatego
retencja czyści ją 90 dni po przetworzeniu, zostawiając id, typ i status **na zawsze**, bo
idempotencja musi działać wiecznie.

### Co jeszcze doszło

| Element | Po co |
|---|---|
| Ponowienia automatyczne, 1 → 5 → 15 → 60 min | przejściowy timeout bazy naprawia się sam przy pierwszej próbie |
| Alert do adminów po 3 próbach **albo** 15 minutach | dwa progi, bo pokrywają dwa kształty awarii — patrz niżej |
| Lista i przycisk „Ponów" w panelu admina | macierz opisała stan sprzed zmiany jako „odzysk wyłącznie ręcznie w bazie" |
| `ops/scripts/uzgodnij-platnosci-stripe.mjs` | odpowiedź na przeszłość, o której migracja nie może nic powiedzieć |

**Dlaczego dwa progi alertu, a nie jeden.** Handler wywalający się natychmiast generuje trzy
próby w kilka minut — łapie go próg prób. Handler wiszący na timeoucie generuje mało prób, za
to mija czas — łapie go próg czasowy. Alarm tylko na jednym z nich przespałby ten drugi kształt
awarii, a to jest ścieżka pieniędzy.

## Czego migracja NIE robi — i co zamiast tego

Migracja oznacza wiersze historyczne jako `PROCESSED`. **To jest założenie, nie ustalenie.**
Pod starym kodem samo istnienie wiersza powodowało odrzucanie ponowień, więc system już
zachowywał się tak, jakby te zdarzenia były obsłużone; nadanie im `PENDING` kazałoby
schedulerowi ponawiać w kółko coś, czego i tak nie da się ponowić (brak treści), i zasypałoby
adminów alertami.

Ale prawdy o przeszłości z tej tabeli się nie odczyta — stary wiersz nie przechowywał ani
treści, ani identyfikatora sesji, więc nie ma jak skorelować go z transakcją portfela.

Odpowiedzią jest osobne narzędzie: **`ops/scripts/uzgodnij-platnosci-stripe.mjs`** pyta
Stripe'a, które sesje checkout zostały opłacone, i sprawdza, czy dla każdej istnieje
transakcja portfela z kluczem `stripe:checkout:<id sesji>`. Bez `--napraw` wyłącznie raportuje.

Świadomie **nie księguje automatycznie**: ruch pieniędzy na koncie klienta na podstawie skryptu
uruchamianego ręcznie z konsoli powinien mieć po drugiej stronie człowieka i wpis w dzienniku
audytu. Panel admina ma jedno i drugie.

Skrypt jest kontrolą miesięczną, nie narzędziem awaryjnym. Kontrola uruchamiana wyłącznie po
awarii wykrywa tylko awarie, o których ktoś już wie.

## Testy

**Jednostkowe** — `apps/api/src/billing/stripe/webhook-ewidencja.spec.ts`, 27 testów. Cała
logika decyzyjna siedzi w czystych funkcjach (`decyzja`, `nastepnaProba`, `czyAlarmowac`),
żeby dało się przejechać kilkanaście kombinacji stanu, czasu i liczby prób bez stawiania bazy
i udawania awarii Stripe'a.

Wśród nich strażniki na powrót starego zachowania:

| Strażnik | Co pilnuje |
|---|---|
| każde zakładanie wiersza nadaje mu stan | wiersz bez stanu to Z-05 z definicji |
| kontroler nie połyka błędów handlera | 200 na nieudanej obsłudze to Z-05 od drugiej strony |
| serwis ma ścieżkę zapisu wyniku | `zajmij` / `zakoncz` / `oznaczNieudane` / `przetworzPonownie` |

**Integracyjne** — `apps/api/test/integration/webhook-odpornosc.int-spec.ts`, 11 testów na
prawdziwym Postgresie. Odtwarzają scenariusz z macierzy — nie „coś podobnego", tylko ten:

```
1. Stripe dostarcza checkout.session.completed
2. handler pada w połowie
3. Stripe ponawia tę samą dostawę
4. portfel ZOSTAJE uznany
```

Musiały być integracyjne, bo całość stoi na unikalnym indeksie `eventId` i na warunkowym
`updateMany` ze statusem w `WHERE`. Atrapa Prismy zawsze powie, że to działa — w tym też rzecz,
że wcześniej mówiła.

**Czy czerwienią się na starym kodzie?** Tak. Przywrócenie starej semantyki (istnienie wiersza
== „obsłużone") daje **3 czerwone z 11**, w tym ten najważniejszy:

```
● PONOWIENIE PO AWARII KSIĘGUJE PORTFEL — to jest cały Z-05
● dostawa w trakcie obsługi dostaje odmowę, a nie „duplikat"
● PENDING porzucony przez martwy proces zostaje przejęty
```

**Asercja bazodanowa** — `ops/sql/sprawdz-baze-po-migracji.sql` dostał blok Z-05: typ
wyliczeniowy istnieje, żaden wiersz nie jest `PROCESSED` bez daty przetworzenia, żaden nie wisi
w `PENDING` bez zapisanej treści. Sprawdzone realnie — wstawienie takiego wiersza zapala
`RAISE EXCEPTION` z konkretnym komunikatem.

### Strażnik po raz piąty trafił nie w to, co trzeba

Test szukał pliku przez `endsWith('billing.service.ts')` i trafiał w
`autoscaling/autoscaling-billing.service.ts` — wcześniejszy alfabetycznie. Strażnik pilnował
nie tego pliku i przez chwilę wyglądał na słusznie czerwonego z zupełnie innego powodu.

Po „jest" z `X-17`, `archiver.create` z `X-21` i `--audit-level` z `X-23` to piąte wystąpienie
tej rodziny. Reguła rośnie: **strażnik czytający repozytorium musi dopasowywać dokładnie —
ścieżkę, nie sufiks; kod, nie prozę.**

## Czego to nadal nie robi

- **Ponowienie może wysłać drugi mail.** Księgowanie portfela jest idempotentne po kluczu sesji,
  ale maile („doładowanie się powiodło") — nie. Świadomy wybór: dwa maile są tańsze niż
  nieksięgowana wpłata. Gdyby to zaczęło przeszkadzać, właściwą naprawą jest klucz idempotencji
  na wysyłce, a nie rezygnacja z ponowień.
- **Nie obejmuje innych webhooków.** Status page ma własną tabelę `StatusWebhookDelivery` z tym
  samym kształtem (stan, próby, `nextAttemptAt`) — stąd wzorzec. Webhooki DirectAdmina i KSeF-a
  nie mają jeszcze żadnego.
- **Nie sprawdza, czy alert dotarł.** Wysyłkę maila logujemy, ale nikt nie potwierdza odbioru.
  Bus factor przy jednoosobowym zespole to osobna pozycja — `PB-11`.
- **Nie ma D3.** Dowodem byłoby wywołanie tej ścieżki na produkcji: doprowadzić do awarii
  handlera przy prawdziwej płatności testowej i obejrzeć, jak ponowienie księguje portfel.
  Do runbooka startowego (`PB-12`).

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `Z-01` | sąsiaduje — faktura dla płatności portfelem korzysta z tej samej ścieżki zdarzeń |
| `X-04` | rozszerza — trzeci plik testów integracyjnych, 26 testów łącznie |
| `X-14` | rozszerza — asercje po migracji dostają blok Z-05 |
| `PB-12` | dokłada punkt do runbooka: sprawdzenie ponowienia na produkcji (D3) |
| `X-22` | ten sam wzorzec: ścieżka pieniędzy bez testu end-to-end |

## Dowód po

- `libs/database/prisma/schema.prisma` — `StripeWebhookEventStatus` + 9 kolumn
- `libs/database/prisma/migrations/20260822180000_odpornosc_webhooka/`
- `apps/api/src/billing/stripe/webhook-ewidencja.ts` — logika decyzyjna
- `apps/api/src/billing/billing.service.ts` — `zajmijZdarzenie` / `zakonczZdarzenie` / `oznaczNieudane` / `przetworzPonownie`
- `apps/api/src/billing/stripe/stripe-webhook-ponowienia.scheduler.ts` — ponowienia, alerty, retencja
- `apps/api/src/billing/stripe/stripe-webhook-events.admin.controller.ts` — lista i ponowienie
- `apps/admin-panel/src/app/(dashboard)/billing/webhooki/` — panel
- `ops/scripts/uzgodnij-platnosci-stripe.mjs` — uzgodnienie przeszłości
- `ops/sql/sprawdz-baze-po-migracji.sql` — asercja Z-05
- 27 testów jednostkowych + 11 integracyjnych

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

D2 — 484 testy jednostkowe, 26 integracyjnych na prawdziwym Postgresie, lint 7/7 (0 błędów),
typecheck 8/8. **D3 wymaga produkcji**, której jeszcze nie ma; pozycja czeka w `PB-12`.

Zgodnie z regułą audytu — *pieniądze wymagają D3* — Z-05 nie jest domknięte w sensie startu
sprzedaży, dopóki ta ścieżka nie zostanie wywołana na żywym systemie. Jest domknięte jako
**bloker**: kod, który gubił pieniądze, przestał je gubić, i jest na to test, który czerwieni
się na starej wersji.

**Stan w macierzy po:** `DZIAŁA` / `PARYTET`
