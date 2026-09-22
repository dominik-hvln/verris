# `PB-01` — Unit economics węzła vs cena 45 zł/mies. brutto (399 zł/rok)

| | |
|---|---|
| **Sprint** | 1 (2026-08-24 – 2026-08-28) |
| **Priorytet** | BLOKER BIZNESOWY |
| **Nakład** | planowany 8 h · rzeczywisty ~7 h |
| **Zależy od** | — |
| **Status** | zamknięte |
| **Data zamknięcia** | 2026-08-22 |

---

## Problem

Policzyć pełny koszt węzła: serwer + CloudLinux + LiteSpeed + DirectAdmin + Imunify + backup S3
+ amortyzacja wsparcia. Wyliczyć próg rentowności w kontach na węzeł i marżę przy 45 zł brutto
(36,59 zł netto).

Pozycja stała w sprincie 1, a nie w ostatnim, z jednego powodu zapisanego w `sprinty.csv`:
*„PB-01 może wywrócić cenę 45 zł. Dlatego jest w pierwszym sprincie."* Wywróciła nie cenę,
tylko założenie leżące pod ceną.

## Dowód przed

Pozycja spoza audytu — dowodu z kodu nie ma. Punkt wyjścia to trzy liczby ze strony i jedno
milczące założenie:

- `apps/www/src/app/(frontend)/components/Pricing.tsx:120` — 45 zł/mies., 399 zł/rok brutto
- `apps/www/src/app/(frontend)/hosting/page.tsx:77` — baza 50 GB NVMe, 8 GB RAM, 2 vCPU
- `docs/strategy/FLEET_SCALING.md` §3 — *„marża rośnie z zagęszczeniem"* — zdanie prawdziwe,
  ale nigdy niepoliczone, więc nie wiadomo było, od jakiego zagęszczenia marża w ogóle istnieje

**Stan w macierzy przed:** `—`

## Rozwiązanie

Model w `docs/strategy/PB-01_unit_economics_wezla.xlsx` — siedem zakładek, wszystkie liczby
wejściowe w jednym miejscu, każda z oznaczeniem źródła albo etykietą ZAŁOŻENIE.

Konstrukcja modelu:

1. **Koszt węzła** — trzy realne warianty sprzętu, do każdego doliczone licencje, kopia off-site
   i amortyzacja control-plane. Nie „szacunek", tylko pozycje z cennikami i datą sprawdzenia.
2. **Gęstość** — cztery scenariusze, z których pierwszy nie jest prognozą, tylko odczytem
   zachowania kodu produkcyjnego.
3. **Marża i próg rentowności** — rachunek wyniku na węzeł dla każdego scenariusza.
4. **Wrażliwość** — dwie siatki: wynik przy różnych kombinacjach ceny i nadsubskrypcji oraz
   realne wykorzystanie sprzętu przy tych samych kombinacjach. Decyzja leży w części wspólnej.

Zakładka `Wrazliwosc` ma dwie siatki, a nie jedną, świadomie. Jedna siatka pokazująca sam wynik
finansowy zachęca do wybrania najwyższej nadsubskrypcji z tabeli. Druga siatka pokazuje, przy
której nadsubskrypcji realne zużycie przestaje się mieścić w sprzęcie — i to ona ogranicza wybór.

### Najważniejszy wynik

Limit gęstości nie leży w sprzęcie ani w licencjach, tylko w księgowaniu zasobów:

```
provisioning.service.ts:299-301   allocatedMemory: { increment: subscription.plan.ramLimitMb }
node-selector.service.ts:110-113  freeRam = totalRam - server.allocatedMemory
                                  if (freeRam < plan.ramLimitMb + reservedRam) continue;
```

Konto rezerwuje pełne 8 GB, mimo że w LVE `MemoryMax` jest sufitem burst, a nie rezerwacją.
Skutek jest czysto arytmetyczny: 128 GB ÷ 8 GB = **16 kont na węzeł** i selektor przestaje
wpuszczać kolejne. Próg rentowności przy 45 zł to **58 kont**.

To znaczy, że przy dzisiejszym kodzie nie istnieje liczba sprzedanych pakietów, przy której
węzeł wyjdzie na zero. Sprzedaż zatrzyma się na szesnastym koncie, ze stratą 1 074 zł/mies.

### Cztery rzeczy, których nie było w macierzy przed tym zadaniem

| Odkrycie | Gdzie trafiło |
|---|---|
| Placement rezerwuje limity planu zamiast nadsubskrybować | `Z-12`, bloker startu |
| Pakiet za 45 zł nie istnieje jako plan w bazie — `seed.ts` ma tylko starter/pro/business | `Z-13`, bloker startu |
| Treść oferty obiecuje 8 GB RAM „w cenie", co przy gęstości domykającej węzeł jest 408 GB na maszynie ze 128 GB | `Z-14`, zamknięte tego samego dnia |
| Wybór dostawcy przesądza o rentowności — premia za węzeł w PL to ok. 23 zł/konto | `PB-14` |

`reservedHeadroomPercent` ma `@default(0)` (`schema.prisma:474`), więc polityka headroom opisana
w `FLEET_SCALING.md` nie działa nigdzie poza dokumentem. Włączone do zakresu `Z-12`, bo to ta
sama zmiana w tym samym miejscu.

## Zmienione pliki

| Plik | Co się zmieniło |
|---|---|
| `docs/strategy/PB-01_unit_economics_wezla.xlsx` | nowy — model kosztowy, 7 zakładek, 208 formuł |
| `docs/strategy/DECYZJA_CENOWA_2026-08.md` | nowy — decyzja z uzasadnieniem, warunkami i datą rewizji |
| `apps/www/src/app/(frontend)/page.tsx` | 5 podmian — „w cenie" → „w abonamencie", „8 GB RAM" → „do 8 GB RAM" |
| `apps/www/src/app/(frontend)/hosting/page.tsx` | 4 podmiany |
| `apps/www/src/lib/features.ts` | 4 podmiany |
| `apps/www/src/app/(frontend)/components/Pricing.tsx` | 2 podmiany |
| `apps/www/src/app/(frontend)/przenies-strone/page.tsx` | 2 podmiany |
| `apps/www/src/app/(frontend)/cennik/page.tsx` | 1 podmiana |
| `apps/www/src/app/llms.txt/route.ts` | 1 podmiana |
| `apps/api/src/test/oferta-zgodnosc.spec.ts` | nowy — strażnik klasy błędu |
| `audyt/dane/macierz.csv` | + `Z-12`, `Z-13`, `Z-14` |
| `audyt/dane/zadania_pb.csv` | + `PB-14` |

Migracje bazy: —
Zmienne środowiskowe: —

## Testy

| Test | Co sprawdza |
|---|---|
| `znajduje pliki źródłowe strony` | strażnik ma czego pilnować — chroni przed cichym przejściem przy pustej liście plików |
| `nigdzie nie pisze „8 GB RAM" ani „2 vCPU" bez kwalifikatora „do"` | przemiata całe `apps/www/src`, wskazuje plik i linię |
| `rozpoznaje sformułowanie obiecujące` | kontrola samego strażnika na starym zdaniu |
| `przepuszcza sformułowanie poprawne` | brak fałszywego alarmu na nowym zapisie |
| `nie czepia się wartości maksymalnych autoskalowania` | „64 GB RAM, 24 vCPU" opisuje sufit skalowania, nie bazę |
| `nie czepia się dysku` | 50 GB to realnie egzekwowana quota, kwalifikator byłby tu błędem |

**Czy test najpierw czerwienił się na starym kodzie?** Tak — sprawdzone przez przywrócenie
starego zdania w `hosting/page.tsx:77` i ponowne uruchomienie. Test wskazał `[RAM]` i `[CPU]`
w linii 77. Po przywróceniu nowej wersji: 6/6 zielonych.

Test jest strażnikiem klasy, nie przypadku: pilnuje każdego wystąpienia wartości bazowej bez
kwalifikatora w całym `apps/www/src`, także w tekstach, które dopiero powstaną.

## Dowód po

- `docs/strategy/PB-01_unit_economics_wezla.xlsx` — zakładka `Marza`, próg rentowności 58 kont
- `docs/strategy/DECYZJA_CENOWA_2026-08.md` — decyzja z 2026-08-22
- `apps/api/src/test/oferta-zgodnosc.spec.ts` — 6 testów

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [x] D2 — test przechodzi w CI
- [ ] D3 — zaobserwowane na produkcji (data)
- [ ] D4 — powtarzalna procedura z właścicielem i datą

D3 nie dotyczy tej pozycji — to zadanie analityczne, nie funkcja produktu. Model wymaga
natomiast rewizji po `PB-02`, bo opiera się na niezmierzonym założeniu o realnym zużyciu.

**Stan w macierzy po:** `Z-14` → `DZIAŁA` / `PARYTET`. `PB-01` zamknięte.

## Definicja ukończenia

> Arkusz z kosztem miesięcznym węzła, liczbą kont na węzeł, marżą jednostkową i progiem
> rentowności. Decyzja: cena zostaje albo się zmienia — zapisana w repo.

Spełnione. Arkusz zawiera wszystkie cztery pozycje. Decyzja PM-a z 2026-08-22: cena zostaje,
z listą warunków i datą rewizji.

## Czego to nadal nie robi

- **Nie mierzy realnego zużycia.** Cały wynik wisi na założeniu 0,5 GB RAM i 8 GB dysku na konto.
  To jest szacunek rzędu wielkości, nie pomiar. Rewizja po `PB-02`.
- **Nie liczy kosztu pozyskania klienta.** Migracja „za 0 zł" to realny koszt jednorazowy rzędu
  60–90 minut na konto. Model liczy stan ustalony.
- **Nie liczy rezygnacji.** Przy 58 kontach potrzebnych do zera rezygnacja 3%/mies. oznacza dwa
  nowe konta miesięcznie tylko po to, żeby stać w miejscu.
- **Nie liczy drugiego węzła jako redundancji** ani kosztu odtworzenia po awarii.
- **Ceny sprzętu wymagają potwierdzenia w konfiguratorze** przed zamówieniem. Strony cennikowe
  Hetznera i OVH renderują ceny skryptem, więc pochodzą z researchu, nie z odczytu strony.

Lista nie jest pusta, ale nie zmienia stanu na `CZĘŚCIOWE` — definicja ukończenia dotyczy
arkusza i decyzji, a te powstały. Braki są przypisane do `PB-02` i `PB-14`.

## Ryzyko i wycofanie

**Ryzyko modelu:** nadsubskrypcja 4× jest normą w branży, ale normą przy znanym profilu zużycia.
Verris nie zna swojego profilu, bo nie ma klientów. Pierwsze dziesięć kont produkcyjnych jest
warte więcej niż cały ten arkusz — dlatego `PB-02` ma pomiar w definicji ukończenia.

**Ryzyko decyzji:** cena zostaje, a warunki jej obowiązywania są otwarte. Jeśli `Z-12` nie
zamknie się przed startem sprzedaży, produkt wejdzie na rynek z ceną, której nie da się obsłużyć.
Wycofanie: obniżenie bazy pakietu do 4 GB / 1 vCPU / 30 GB — wariant policzony, +1 375 zł/mies.,
gotowy do wdrożenia bez ponownej analizy.

**Wycofanie zmian w treści oferty:** czysta zmiana tekstu, `git revert` wystarczy. Odwrotnie
byłoby gorzej — zostawienie „8 GB w cenie" to obietnica, której nie da się dotrzymać wszystkim
klientom naraz, a to jest ten sam typ twierdzenia, który audyt wychwycił w `oferta.md`.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `Z-12` | otwiera — bloker startu, warunek obowiązywania ceny |
| `Z-13` | otwiera — bloker startu, pakiet nie istnieje w bazie |
| `Z-14` | zamyka — treść oferty poprawiona i objęta testem |
| `PB-14` | otwiera — wybór dostawcy przed zamówieniem serwera |
| `PB-02` | zmienia zakres — dochodzi pomiar realnego zużycia jako warunek |
| `PB-07` | zasila — cennik zostaje bez zmian, specyfikacja opisuje zasady zagęszczenia |
| `PB-03` | zasila — polityka prywatności musi opisać lokalizację przetwarzania |
