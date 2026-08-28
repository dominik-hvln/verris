# X-44 — paczka testów integracyjnych mogła skasować bazę deweloperską

- **Status:** zamknięte częściowo (bezpiecznik dodany, D1)
- **Waga:** WYSOKA — utrata danych, nieodwracalna
- **Dowód:** [x] D1 — kod + testy jednostkowe · [ ] D2 — potwierdzone przebiegiem CI · [ ] D3
- **Znalezione:** 2026-08-27, przy okazji naprawy OPS-01 (CI #127)

## Co było

`apps/api/test/integration/setup.ts` zaczynał każdy test od:

```sql
TRUNCATE TABLE "RestoreDrill", "StripeWebhookEvent", "Invoice", "InvoiceCounter",
  "WalletTransaction", "UsageMetric", "Account", "Subscription", "Server",
  "Plan", "User" RESTART IDENTITY CASCADE;
```

Jedynym zabezpieczeniem przed uruchomieniem tego na złej bazie było:

```ts
if (!process.env.DATABASE_URL) {
  throw new Error('… wymagają DATABASE_URL wskazującego na BAZĘ TESTOWĄ …');
}
```

Ten warunek sprawdza, że zmienna jest **niepusta**. Nie sprawdza niczego
więcej. Zdanie „wskazującego na BAZĘ TESTOWĄ" istniało wyłącznie w treści
komunikatu — **napis w komunikacie nie jest kontrolą**.

## Dlaczego to nie była teoria

Domyślny `DATABASE_URL` w `libs/database/.env` wskazuje na `verris_db` —
bazę deweloperską. Czyli:

```
export DATABASE_URL=$(grep DATABASE_URL libs/database/.env …)   # verris_db
pnpm test:int                                                   # TRUNCATE verris_db
```

**Ścieżka do skasowania bazy deweloperskiej była ścieżką domyślną.** Nie
trzeba było pomylić się w nietypowy sposób — wystarczyło zrobić rzecz
najbardziej naturalną: wziąć URL stamtąd, gdzie stoi.

Znalezione w momencie, w którym miałem podać człowiekowi komendę
uruchamiającą tę paczkę. To jest jedyny powód, dla którego zajrzałem do
`setup.ts` przed jej podaniem.

## Rodzina

To trzecie wystąpienie tego samego wzorca w projekcie:

| Zadanie | Kontrola, która istniała i nic nie robiła |
| --- | --- |
| SEC-01 | `--strict` w egress — DROP zagnieżdżony w teście cgroup, który na tym kernelu zawsze zawodzi |
| X-02 | 4 wymagane checki na `main` — omijane przez push admina |
| **X-44** | **„DATABASE_URL musi wskazywać na bazę testową" — sprawdzane tylko na niepustość** |

Wspólny mianownik: **kontrola opisana słowami, nieegzekwowana kodem.** Za
każdym razem czytający kod widział zabezpieczenie, którego nie było.

## Co zrobione

`apps/api/test/integration/baza-testowa.ts` (nowy) — `sprawdzBazeTestowa()`
odrzuca URL, którego **nazwa bazy** nie zawiera `test`.

Trzy decyzje projektowe:

1. **Osobny plik bez żadnych importów.** `setup.ts` importuje `PrismaClient`,
   więc test bezpiecznika w tym samym pliku wymagałby zbudowanego
   `@verris/database`. Zero zależności = test biegnie wszędzie i zawsze.

2. **Test jest `.spec.ts`, nie `.int-spec.ts`.** Bezpiecznik chroniący przed
   złą konfiguracją Postgresa nie może być sprawdzany wyłącznie przez paczkę,
   która Postgresa wymaga. To ta sama lekcja co OPS-01: naprawa w pakiecie,
   którego runner nie chodzi lokalnie, to nie naprawa — to odłożenie błędu do CI.

3. **Bez furtki `FORCE=1`.** Furtka, którą da się wpisać w pośpiechu, jest tym
   samym co brak bezpiecznika. Ten ma ratować właśnie przed pośpiechem.

Parser nie polega na samym `new URL()`. `new URL('localhost:5432/verris_test')`
**nie rzuca wyjątku** — traktuje `localhost:` jako schemat, a `5432/verris_test`
jako ścieżkę, w której jest słowo „test". Bez sprawdzenia schematu literówka
w URL-u przechodziłaby przez bezpiecznik. Sprawdzamy więc: schemat
`postgresql:`/`postgres:`, ścieżka zaczynająca się od `/`, nazwa niepusta.

10 testów w `baza-testowa.spec.ts`, w tym trzy kontrolne („przepuszcza") —
bez nich bezpiecznik odrzucający **wszystko** przechodziłby cały zestaw,
a paczki integracyjnej nie dałoby się uruchomić w ogóle.

## Czego to NIE naprawia

- **Nie chroni bazy o nazwie zawierającej `test`, w której ktoś trzyma dane.**
  Konwencja nazewnicza to konwencja, nie gwarancja.
- **Nie chroni przed `prisma migrate reset`** ani innymi narzędziami poza tą
  paczką. Zakres bezpiecznika to wyłącznie `test:int`.
- **Nie jest jeszcze potwierdzony przebiegiem CI** — job „API integration tests"
  używa `verris_test`, więc powinien przejść, ale to przewidywanie, nie pomiar.

## Otwarte

- [ ] D2 — zielony job „API integration tests" po tej zmianie.
- [ ] `libs/database/.env.example` nie zawiera wzmianki o bazie testowej —
      człowiek konfigurujący projekt od zera nie dowie się, że ma ją utworzyć.
- [ ] Job „API integration tests" wciąż **nie jest wymagany do scalenia**
      (komentarz w `ci.yml`: „Zostanie do niego dopisany po pierwszym zielonym
      przebiegu na main"). Pierwszy zielony przebieg był — obietnica nie została
      spełniona. Osobna decyzja razem z X-02.
