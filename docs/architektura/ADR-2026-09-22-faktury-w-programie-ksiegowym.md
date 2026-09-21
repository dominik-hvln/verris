# ADR 2026-09-22 — Faktury VAT wystawia program księgowy, nie panel

| | |
|---|---|
| **Status** | przyjęta |
| **Data** | 2026-09-22 |
| **Decyduje** | właściciel projektu (kierunek), architekt (projekt techniczny) |
| **Zamyka** | `PB-13` |
| **Otwiera** | `FAK-01` (bloker startu) |
| **Zdejmuje flagę blokera z** | `M-16`, `M-17` — warunkowo, patrz „Warunek" |

## Decyzja właściciela

> Na start faktury wystawiane ręcznie w programie księgowym, do czasu wybrania firmy
> księgowej oraz najlepszego rozwiązania księgowego, które zintegrujemy z panelem po API.

Oznacza to: **własny moduł KSeF w panelu zostaje zamrożony.** Obowiązek KSeF realizuje
program księgowy, który wystawia fakturę i sam ją wysyła. Panel nie rozmawia z MF.

## Problem, który ta decyzja tworzy

Panel **już dziś wystawia faktury VAT z własną numeracją**:

| Ścieżka | Plik | Co robi |
|---|---|---|
| Obciążenie portfela | `billing/wallet-ledger.service.ts` + `faktura-za-portfel.ts` | Faktura w **tej samej transakcji** co obciążenie (`Z-01`) |
| Numeracja | `faktura-za-portfel.ts` — `nadajNumerFaktury` | Seria panelu, okres w czasie polskim (`M-02`) |
| Korekty | `billing/korekty.service.ts` | Faktura korygująca ze zwrotem (`M-06`) |
| Dokańczanie | `billing/faktury.scheduler.ts` | Zaległe faktury |
| KSeF | `platform-settings.keys.ts:136` | `ksef.enabled = '0'` — **wyłączony domyślnie** |

Jeśli panel dalej numeruje, a właściciel równolegle wystawia fakturę w programie księgowym,
**jedna płatność dostaje dwie faktury w dwóch seriach**. To nie jest rozjazd w raporcie —
to dwa dokumenty prawne na jedną transakcję, z których tylko jeden trafi do KSeF.
Wyłączony KSeF chroni przed wysłaniem drugiej faktury do MF, ale nie przed jej wystawieniem
i doręczeniem klientowi.

## Rozważone warianty

**A. Panel wyłącza fakturowanie całkowicie.** Najprostsze. Odrzucone: wyrzuca `Z-01`,
`M-02` i `M-06` — model danych, którego integracja po API będzie potrzebowała jako
wejścia. Za kilka miesięcy odbudowywalibyśmy to samo.

**B. Panel dalej wystawia faktury, właściciel przepisuje je do programu.** Odrzucone:
dwie serie numeracji, a do KSeF trafia faktura z programu — więc prawnie wiążąca jest ta
druga, a klient w panelu widzi pierwszą. Dokładnie ten rozjazd, przed którym ADR ma chronić.

**C. Panel generuje dokument rozliczeniowy, faktura VAT powstaje w programie księgowym. — PRZYJĘTE.**

## Projekt wariantu C (`FAK-01`)

Przełącznik platformy `faktury.tryb` o dwóch wartościach:

- **`panel`** — dzisiejsze zachowanie, bez zmian. Zostaje, bo to ścieżka docelowa, gdyby
  kiedyś panel miał wrócić do samodzielnego fakturowania.
- **`zewnetrzny`** — **nowa wartość domyślna.** W tym trybie:
  1. Obciążenie portfela, korekta i zwrot tworzą ten sam rekord co dziś, z tymi samymi
     danymi (nabywca, pozycje, VAT) — ale **bez numeru z serii panelu**. Status:
     `CZEKA_NA_FAKTURE_ZEWNETRZNA`.
  2. Klient w panelu widzi **„dokument rozliczeniowy"** z adnotacją, że faktura VAT
     zostanie wystawiona i doręczona przez księgowość. Nie widzi niczego, co wygląda
     jak faktura VAT.
  3. Operator w panelu admina ma kolejkę rekordów czekających na fakturę i pole na
     **numer faktury z programu księgowego** (później także PDF). Po wpisaniu status →
     `FAKTURA_WYSTAWIONA`, a klient widzi numer.
  4. KSeF pozostaje wyłączony; strażnik pilnuje, że `faktury.tryb = zewnetrzny`
     i `ksef.enabled = 1` nie mogą być włączone jednocześnie.

**To jest dokładnie szew, w który wejdzie integracja po API:** krok 3 robiony ręcznie
dziś, jutro robi go wywołanie do programu księgowego, które zwraca numer i PDF.
Nie budujemy niczego na wyrzucenie.

## Warunek, od którego zależy zdjęcie blokerów

`M-16` (KSeF offline) i `M-17` (walidacja XSD) przestają blokować start **dopiero wtedy,
gdy `FAK-01` jest na produkcji**. Do tego momentu panel potrafi wystawić fakturę VAT, a z
wyłączonym KSeF byłaby to faktura spoza systemu — więc ryzyko, któremu tamte dwa blokery
miały zapobiec, nadal istnieje, tylko inną drogą. Dlatego `FAK-01` sam jest blokerem startu.

## Co zostaje zamrożone, a nie skasowane

Własny moduł KSeF (`apps/api/src/ksef/`, `fa3-xml.builder.ts`, `ksef-tryby.ts`) zostaje
w repozytorium z testami. Pozycje `M-11`, `M-14`, `M-15`, `M-16`, `M-17`, `KSEF-02`,
`KSEF-03` schodzą z planu startowego do epiku „integracja z programem księgowym" po starcie.
Kasowanie działającego kodu z testami, który może się przydać przy wyborze integracji,
nie daje nic poza porządkiem w katalogu.

## Pytanie do przyszłej księgowej — jedno, ale kosztowne

Ile faktur ręcznych miesięcznie oznacza tryb zewnętrzny, zależy od `M-34`: **czy
doładowanie portfela wymaga faktury zaliczkowej w chwili wpłaty**, czy dopiero przy
zużyciu. Przy cenie 45 zł/mies. i progu rentowności 58 kont to różnica między kilkudziesięcioma
a kilkuset dokumentami miesięcznie do wystawienia ręcznie. To pytanie należy zadać przy
wyborze biura, zanim ruszy sprzedaż — od odpowiedzi zależy, jak długo tryb ręczny jest
w ogóle wykonalny.
