# Decyzja cenowa — pakiet hostingowy Verris

| | |
|---|---|
| **Data decyzji** | 2026-08-22 |
| **Decydent** | Dominik Kowalski (PM / właściciel produktu) |
| **Podstawa** | `docs/strategy/PB-01_unit_economics_wezla.xlsx` |
| **Zadanie** | `PB-01` — unit economics węzła vs cena 45 zł/mies. brutto |
| **Następna rewizja** | po `PB-02` (pomiar realnego zużycia na węźle #1) |

---

## Decyzja

**Cena zostaje: 45 zł/mies. brutto, 399 zł/rok brutto.**

Decyzja nie jest potwierdzeniem, że dzisiejszy produkt zarabia przy tej cenie. Dzisiejszy produkt
przy tej cenie **traci ok. 1 074 zł miesięcznie na każdym węźle** i nie da się tego naprawić
sprzedażą. Decyzja mówi, że cena jest właściwa **pod warunkiem** zamknięcia dwóch pozycji, które
zostały dopisane do macierzy jako blokery startu: `Z-12` i `Z-13`.

Dopóki `Z-12` jest otwarte, każdy sprzedany pakiet powiększa stratę. To nie jest kwestia marży —
to kwestia tego, że selektor węzłów fizycznie odmówi założenia siedemnastego konta.

---

## Co zostało policzone

Model liczy koszt węzła w pełnym rachunku: sprzęt, licencje, kopia off-site, amortyzacja
control-plane, wsparcie. Potem sprawdza, ile kont na tym węźle mieści dzisiejszy kod, a ile
mieściłoby się przy nadsubskrypcji, i porównuje jedno z drugim.

### Koszt węzła — Hetzner AX102, flota jednowęzłowa

| Pozycja | zł netto / mies. |
|---|---:|
| Sprzęt (157,30 EUR + 1,70 EUR IPv4) | 685,64 |
| Licencje (CloudLinux + Imunify360 + LiteSpeed + DirectAdmin + JetBackup) | 504,51 |
| Kopia off-site | 51,75 |
| Control-plane (amortyzacja) | 250,00 |
| **Razem** | **1 491,90** |

Pierwsza rzecz, która wychodzi z tego zestawienia i która nie była oczywista przed policzeniem:
**licencje kosztują niemal tyle co sprzęt**. To zmienia strategię floty. Licencja jest naliczana
od serwera, nie od konta, więc „dużo małych tanich węzłów" jest najgorszą możliwą konfiguracją.
Tani węzeł OVH Rise-S za 277 zł ma cenę progową **58,71 zł** — wyższą niż dwa razy droższy Hetzner.

### Gęstość — ile kont wchodzi na węzeł

| Scenariusz | Kont | Wynik / mies. |
|---|---:|---:|
| S0 — kod dzisiaj, headroom 0% | 16 | −1 074 zł |
| S1 — kod dzisiaj + polityka headroom 20% | 12 | −1 178 zł |
| S2 — nadsubskrypcja 4× RAM/CPU, 2× dysk | 51 | −159 zł |
| S3 — nadsubskrypcja + urealniona baza pakietu | 102 | +1 175 zł |

**Próg rentowności: 58 kont na węzeł.** Kod dzisiaj przepuszcza 16.

Przy dzisiejszym kodzie cena musiałaby wynosić **163,40 zł brutto**, żeby węzeł wyszedł na zero.

### Skąd bierze się limit 16 kont

To nie jest ograniczenie sprzętu ani licencji. To jest sposób księgowania w kodzie:

- `apps/api/src/subscriptions/provisioning.service.ts:299-301` — po każdym założonym koncie
  zwiększa `allocatedCpu` / `allocatedMemory` / `allocatedDisk` o **pełne limity planu**.
- `apps/api/src/subscriptions/node-selector.service.ts:109-115` — wpuszcza kolejne konto tylko
  wtedy, gdy `total − allocated` jest większe niż limit planu powiększony o rezerwę.

Czyli: 8 GB bazy w ofercie oznacza 8 GB zarezerwowane w księgowości węzła. 128 GB ÷ 8 GB = 16.

To jest błąd kategorii, a nie liczby. RAM i CPU w CloudLinux/LVE to `MemoryMax` i `SPEED` —
**sufity**, do których proces może dobić, a nie zasoby odłożone na bok. Rezerwowanie sufitu jest
tym samym, czym byłoby rezerwowanie miejsca w restauracji dla każdego, kto **mógłby** przyjść.

Dysk jest inny i musi być traktowany inaczej: quota dyskowa jest realnie egzekwowana i klient
może ją wypełnić w całości. Przy progu rentowności 58 kont × 50 GB = 2,9 TB sprzedanego dysku na
maszynie z 1,92 TB, czyli nadsubskrypcja **1,51×**. Przy założonym realnym zajęciu (8 GB/konto)
daje to 24% wykorzystania nośnika — zapas jest, ale to jest świadome ryzyko, nie darmowy obiad.

---

## Warunki, przy których ta decyzja obowiązuje

| # | Warunek | Pozycja | Stan |
|---|---|---|---|
| 1 | Placement nadsubskrybuje RAM i CPU zamiast je rezerwować | `Z-12` | otwarte, bloker startu |
| 2 | Pakiet za 45 zł istnieje jako plan w bazie | `Z-13` | otwarte, bloker startu |
| 3 | Treść oferty mówi „do 8 GB RAM", nie „8 GB RAM w cenie" | `Z-14` | zamknięte 2026-08-22 |
| 4 | Realne zużycie zmierzone na węźle produkcyjnym | `PB-02` | zaplanowane, sprint 7 |
| 5 | Dostawca węzła wybrany świadomie, z policzoną premią za PL | `PB-14` | otwarte |

Warunek 4 jest tym, który może tę decyzję unieważnić. Cały model wisi na jednym niezmierzonym
założeniu: że konto zużywa realnie ok. 0,5 GB RAM i 8 GB dysku. Jeżeli pomiar na węźle #1 pokaże
liczby dwukrotnie wyższe, nadsubskrypcja 4× przestaje być bezpieczna i wracamy do tej decyzji.

---

## Rozważone i odrzucone

**Obniżenie bazy pakietu do 4 GB / 1 vCPU / 30 GB.** Daje 102 konta na węzeł i +1 375 zł
miesięcznie — najlepszy wynik finansowy ze wszystkich wariantów. Odrzucone, bo baza jest głównym
argumentem sprzedażowym wobec konkurencji, a przewaga cenowa Verris opiera się na tym, że za 45 zł
klient dostaje więcej niż gdzie indziej. Wariant zostaje w modelu jako gotowa odpowiedź, gdyby
pomiar z `PB-02` wywrócił założenia.

**Podniesienie ceny do 55–59 zł.** Domyka się nawet bez agresywnej nadsubskrypcji i otwiera drogę
do węzła w Polsce. Odrzucone, bo narracja „cena stała, bez skoku po roku" traci sens, jeśli cena
startowa jest na poziomie odnowień konkurencji. Verris sprzedaje przewidywalność, nie taniość —
ale przewidywalność drogiego produktu jest trudniejsza do sprzedania pierwszym stu klientom.

**Węzeł w Polsce (OVH Advance-2, WAW1).** Cena progowa 67,76 zł — o 22,76 zł powyżej ceny
sprzedaży. Powód nie jest oczywisty: to nie procesor ani RAM, tylko **dysk**. 960 GB przy bazie
50 GB ogranicza węzeł do 30 kont, niezależnie od tego, jak mocny jest procesor. Decyzja
o dostawcy odłożona do `PB-14`, przed zamówieniem serwera; na razie do modelu przyjęty Hetzner.

---

## Konsekwencje dla planu

- `Z-12` i `Z-13` wchodzą do planu jako blokery startu — łącznie 22 h. `PB-14` dokłada 6 h.
- Sprint 15 (`PB-07` — treści i cennik na verris.pl) dostaje z tej decyzji gotową liczbę:
  cennik zostaje bez zmian, a specyfikacja techniczna musi opisywać zasady zagęszczenia.
- Polityka prywatności i DPA (`PB-03`) muszą opisać lokalizację przetwarzania zgodnie z wynikiem
  `PB-14`. Jeżeli węzeł stanie poza Polską, trzeba to napisać wprost, zanim ruszy sprzedaż.

## Czego ta decyzja nie rozstrzyga

- Kosztu pozyskania klienta. Migracja „za 0 zł" to realny koszt jednorazowy rzędu 60–90 minut
  pracy na konto, którego model nie obejmuje — liczy stan ustalony, nie pierwszy miesiąc.
- Rezygnacji klientów. Przy 58 kontach potrzebnych do wyjścia na zero rezygnacja rzędu 3%
  miesięcznie oznacza, że dwa konta trzeba pozyskać co miesiąc tylko po to, żeby stać w miejscu.
- Kosztu drugiego węzła jako redundancji. Model liczy pojedynczy węzeł produkcyjny.
