# `X-25` — Asercje po migracji sprawdzały wszystko poza produkcją

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI (warunek scalenia `feat/sprint-2` → `main`) |
| **Nakład** | S (~4 h) |
| **Zależy od** | `Z-01`, `Z-05`, `Z-12`, `Z-13`, `Z-16`, `M-06` |
| **Status** | zamknięte |
| **Data** | 2026-08-22 |

---

## Co było nie tak

Sześć zamkniętych blokerów zostawiło po sobie plik `ops/sql/sprawdz-baze-po-migracji.sql`
z asercjami o stanie bazy po migracjach. Plik był porządny. Biegł w jednym miejscu:
w CI, na świeżej bazie testowej, którą chwilę wcześniej stworzył `prisma migrate deploy`
i wypełnił seed.

Czyli dokładnie tam, gdzie nie ma żadnych prawdziwych danych.

Produkcja po `prisma migrate deploy` nie była sprawdzana **niczym**. `migrate deploy`
kończy się kodem zero, kiedy pliki SQL się wykonały — nie mówi nic o tym, czy baza jest
po nich w stanie, w którym kod policzy dobrze. Migracja danych, która przeliczy kwoty na
tysiącu wierszy, może zakończyć się sukcesem i zostawić faktury, których netto plus VAT
nie daje brutto.

To była ta sama luka, którą ten projekt naprawiał już przy `Z-13`: reguła istniała,
tylko nie tam, gdzie działy się prawdziwe rzeczy.

## Dlaczego nie dało się po prostu dopisać tego pliku do deployu

Bo część jego twierdzeń **wywaliłaby produkcyjne wdrożenie bez powodu**.

```sql
SELECT COUNT(*) INTO wszystkie FROM "Plan" WHERE "slug" IN ('starter','pro','business');
IF wszystkie = 0 THEN
  RAISE EXCEPTION 'Z-13: nie znaleziono ŻADNEGO planu prototypowego …';
```

Plany prototypowe tworzy **seed**, który na produkcji nie biegnie. Ta asercja przerwałaby
pierwszy deploy i cofnęła obraz — za nic.

Gorsza była druga: asercja pilnowała, żeby `verris-hosting` kosztował dokładnie 45,00 zł.
Cenę planu **wolno zmienić z panelu admina** (`plans.service.ts`, `updatePlan`). Pierwsza
legalna podwyżka zamieniłaby każde kolejne wdrożenie w rollback. A wtedy ktoś — słusznie —
wyłączyłby całe sprawdzanie, razem z tymi kontrolami, które coś znaczą.

Tego drugiego nie zauważyłem od razu. Zobaczyłem to dopiero, gdy własny strażnik testowy
zapalił się na `isPublic` w pliku niezmienników i zamiast go poluzować, sprawdziłem, czy
cena jest w ogóle edytowalna. Była.

## Co jest teraz — trzy pliki, bo mają trzy różne życia

| Plik | Gdzie biegnie | Co robi przy naruszeniu |
|---|---|---|
| `po-migracji-niezmienniki.sql` | CI **i produkcja** | przerywa deploy i cofa obraz |
| `po-migracji-katalog.sql` | **tylko CI** | wywala build |
| `po-migracji-historia.sql` | CI i produkcja | wypisuje do logu, nic nie zatrzymuje |

**Niezmiennik** to twierdzenie, którego nie może unieważnić żadna legalna zmiana
biznesowa: istnienie kolumn i typów, zgodność sum na dokumentach, spójność księgi
pojemności z kontami, sensowność stanów zdarzeń.

**Katalog** to dzisiejsza decyzja handlowa: jeden publiczny pakiet, ta cena, te limity.
W CI zmienia się w jednym commicie razem z `PLAN_PRODUKCYJNY` i treścią strony — i właśnie
o zgodę tych trzech miejsc chodzi. Na produkcji zmienia się bez commita, więc bramką być
nie może.

**Historia** to dane sprzed migracji, których migracja nie naprawia i nie miała naprawiać:
obciążenia bez faktury z czasów, gdy dokumentów jeszcze nie było, faktury czekające na PDF,
brak próby odtworzenia z kopii. Wycofanie wdrożenia z tego powodu byłoby karą za przeszłość,
nie ochroną przed błędem.

### Co przeszło z Z-13 do niezmienników zamiast konkretnej ceny

Dwa twierdzenia, których panel admina nie może naruszyć:

1. **Wiersz o slugu `verris-hosting` istnieje.** Ten slug stoi na sztywno w
   `plan-produkcyjny.ts`, a z rekordu czyta wycena zamówienia, placement konta na węźle,
   synchronizacja pakietów DirectAdmina i sufity autoskalowania. Brak wiersza to dokładnie
   awaria `Z-13`.
2. **Cennik spełnia regułę, którą API wymusza przy zapisie** — ceny dodatnie, rok nie tańszy
   niż sześć miesięcy (`validatePricingConsistency`). API pilnuje jej przy zapisie z panelu,
   baza nie pilnuje jej wcale, a migracja danych zapisuje **z pominięciem API**. To jest ta
   szczelina, przez którą migracja może wstawić cennik, na którym kod policzy bzdurę.

### Jedna reguła, jedno miejsce

Blok `M-06` sprawdzał, czy netto plus VAT korekty daje brutto. Korekta jest wierszem
w `Invoice`, więc obejmowała ją już kontrola `Z-01` — i to ona zapalała się pierwsza.
Druga kopia nigdy by nie wystartowała, a przy zmianie zasad ktoś poprawiłby jedną z dwóch.
To jest rodzina błędów „bliźniacze miejsca", która dała w tym projekcie `Z-12`, `Z-16`
i błędy zmiany planu. Usunięta, z odsyłaczem w komentarzu.

## Bramka, która naprawdę bramkuje

W `prod-deploy-ghcr.sh`, **po** `prisma migrate deploy`, przed health-checkiem:

```
[deploy] asercje po migracji (niezmienniki)…   → naruszenie: rollback + exit 1
[deploy] historia po migracji (raport)…        → cokolwiek: leci dalej
```

Rollback jest ten sam co przy nieudanej migracji: wracamy do poprzedniego obrazu. Schematu
to nie cofa — migracje są wstecznie kompatybilne, więc stary kod na nowym schemacie działa —
ale zatrzymuje wypuszczenie kodu, który na tej bazie liczyłby źle.

Dwie drobne pułapki, które przy okazji zamknąłem:

- `psql -U "${POSTGRES_USER:?…}"`. Przy pustej zmiennej psql połączyłby się z bazą o nazwie
  użytkownika: asercje przeszłyby na **pustej, niewłaściwej** bazie i zameldowały zieleń.
  Lepiej, żeby deploy stanął na braku zmiennej, niż żeby bramka udawała, że coś sprawdziła.
- `sh -c`, nie `sh -lc`. Powłoka logowania czyta profil, a skrypt profilu czytający stdin
  zjadłby nasz SQL — psql dostałby pusty plik i wypisał sukces.

## Asercja, która się nie czerwieni, nie jest bramką

Odkąd te twierdzenia potrafią wycofać produkcyjne wdrożenie, pytanie „czy one w ogóle coś
zauważają" przestało być teoretyczne. `ops/scripts/asercje-czerwienia-sie.sh` psuje po jednym
niezmienniku naraz, w transakcji z `ROLLBACK`-iem, i sprawdza **dwie** rzeczy: że `psql`
kończy się kodem różnym od zera **oraz że powodem jest ta asercja**.

Drugi warunek nie jest ozdobą. Bez niego skrypt meldowałby sukces także wtedy, gdyby żadna
asercja nie zadziałała, a wszystko zatrzymał `CHECK` w bazie. Tak było w pierwszym
przebiegu: trzy przypadki `M-06` świeciły na czerwono, a naprawdę odbijał je `CHECK`
`Invoice_korekta_ma_pierwotna`, zanim asercja zdążyła cokolwiek zobaczyć. To ta sama lekcja
co przy `Z-01` i `H-20`: test, który przechodzi na obu wersjach kodu, nie mówi nic o żadnej.

Dziewięć naruszeń, każde zatrzymane na właściwej asercji:

```
Z-13 plan zniknął z bazy · Z-13 rok tańszy niż 6 miesięcy · Z-13 niedodatni limit bazowy
Z-12 domyślna nadsubskrypcja ≠ 1 · Z-16 księga węzła vs konta
Z-05 PROCESSED bez daty · Z-05 PENDING bez treści
Z-01 netto + VAT ≠ brutto · M-06 korekta bez pierwotnej · M-06 numer spoza serii VFK
```

## Testy

| Warstwa | Plik | Ile |
|---|---|---|
| jednostkowe | `apps/api/src/test/asercje-po-migracji.spec.ts` | 36 |

Strażnik czyta pliki z komentarzami **usuniętymi** — po raz siódmy ta sama lekcja
(`X-17`, `X-21`, `X-23`, `Z-05`, `X-24`, `H-20`): strażnik trafiał na własne słowa
w komentarzu i meldował sukces, choć kod nie robił niczego.

**Czy czerwienią się na starym kodzie?**

| Wersja | Czerwone |
|---|---|
| jeden plik, brak asercji w deployu, CI wskazuje stary plik | **11 z 36** |
| asercja w deployu, ale `\|\| true` zamiast bramki | 1 z 36 |
| `RAISE EXCEPTION` w pliku historii | 1 z 36 |
| katalog wpuszczony na produkcję | 1 z 36 |

Trzy ostatnie wiersze to po jednym teście — i tak ma być. Każdy z nich opisuje jedno
konkretne przekłamanie, a nie „coś jest nie tak".

## Weryfikacja

Trzy pliki uruchomione na bazie zbudowanej **tak jak w CI**: świeży Postgres, 103 migracje
przez `prisma migrate deploy`, potem seed. Wszystkie trzy zielone.

```
602 testy jednostkowe · 61 integracyjnych · lint 7/7 (0 błędów) · typecheck 8/8
```

## Czego to nadal nie robi

- **Nie cofa schematu.** Rollback wraca do poprzedniego obrazu, migracje zostają
  zastosowane. Chroni to przed wypuszczeniem kodu na złej bazie, nie przed samą złą bazą.
- **Nie sprawdza katalogu na produkcji.** Świadomie — to decyzja handlowa, nie niezmiennik.
  Cena na produkcji może się rozjechać z `PLAN_PRODUKCYJNY` i deploy tego nie zauważy.
  Osobna sprawa, bliżej monitoringu niż bramki wdrożeniowej.
- **Nie uruchamia `asercje-czerwienia-sie.sh` na produkcji** i uruchamiać nie wolno:
  skrypt zdejmuje ograniczenia `CHECK` wewnątrz transakcji. W CI to narzędzie, na
  produkcji byłoby bronią.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `Z-13` | konkretne wartości przeniesione do katalogu; niezmiennikiem zostaje istnienie planu i reguła cennika |
| `M-06` | usunięta druga kopia reguły sum — pokrywa ją `Z-01` |
| `X-14`, `X-23`, `H-19`, `H-20` | ta sama rodzina: bramka, która raportuje zamiast bramkować |
| `PB-12` | runbook startu: po pierwszym deployu obejrzeć log asercji |

## Dowód po

- `ops/sql/po-migracji-niezmienniki.sql` — CI i produkcja, blokuje
- `ops/sql/po-migracji-katalog.sql` — tylko CI
- `ops/sql/po-migracji-historia.sql` — raport, zero `RAISE EXCEPTION`
- `ops/scripts/prod-deploy-ghcr.sh` — krok 3.5 i 3.6
- `ops/scripts/asercje-czerwienia-sie.sh` — dowód, że asercje się czerwienią
- `.github/workflows/ci.yml` — cztery kroki po seedzie
- `apps/api/src/test/asercje-po-migracji.spec.ts` — 36 testów

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

D3 powstanie przy pierwszym deployu na `main` — w logu wdrożenia, z datą.

**Stan w macierzy:** `DZIAŁA` / `PARYTET`
