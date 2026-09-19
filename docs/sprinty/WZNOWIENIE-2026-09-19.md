# Wznowienie prac — 2026-09-19

Przerwa: **ostatni commit 2026-08-28 19:37**, dziś 2026-09-19. **22 dni bez pracy.**
Dokument powstał przy wznowieniu; opisuje stan zastany, nie stan zadeklarowany.

---

## 1. Stan zastany — liczby z `audyt/generate.py --status`

| | |
|---|---|
| Pozycji w macierzy | **423** |
| Werdykty | PARYTET 160 · LUKA 140 · PRZEWAGA 57 · CZĘŚCIOWY 54 · POZA ZAKRESEM 12 |
| Stany | DZIAŁA 213 · BRAK 124 · CZĘŚCIOWE 45 · ENDPOINT BEZ UI 14 · FLAGA 11 · ATRAPA 8 · b.d. 8 |
| Blokery startu (liczone) | **5** — realnie **4**, patrz §3 |
| Praca pozostała do startu | **358 h ≈ 12 sprintów po 30 h** |
| Roadmapa po starcie | 164 pozycje / 2292 h |

Kontrola spójności `--sprawdz` przechodzi. Pozycji ze stanem `DZIAŁA` bez dowodu: **0**.

---

## 2. Co się stało między 2026-08-21 a 2026-08-28

Siedem dni roboczych, ~45 commitów. Postęp jest większy, niż wygląda z numeru sprintu:
zamknięte zostały nie tylko sprinty 1–3, ale też **największe pojedyncze pozycje planu
z dalszych sprintów**.

**Zamknięte całe sprinty planu:**

- **S1** „Zatrzymać krwawienie i włączyć CI" — 9/10 (otwarte `X-03`), `PB-01` zamknięte 22.08
- **S2** „Luki bezpieczeństwa z passu adwersaryjnego" — 17/20 (otwarte `X-31`, `X-32`, `Z-18` — wszystkie CZĘŚCIOWE)
- **S3** „Pojemność węzła i plan produkcyjny" — 3/3, zostaje `PB-14`
- **S5** `Z-01` „Faktura VAT dla płatności portfelem" — **30 h, największa pozycja planu — DZIAŁA**
- **S7** `M-06` „Faktura korygująca" — **30 h — DZIAŁA**
- **S10** `D-04`…`D-11` bazy danych — 5/5 DZIAŁA

To jest powód, dla którego z 728 h planu zostało 358 h, mimo że kalendarzowo jesteśmy
dopiero po trzech tygodniach pracy.

**Motyw przewodni tygodnia: bramki, które kłamały.**
`X-30` (13 reguł wczytanych, żadna się nie liczyła) → `X-31` (cisza nieodróżnialna od awarii
kanału) → `X-33` (bramka mierzyła szybkość startu, nie poprawność) → `X-34` (`printf | grep -q`
przy `pipefail` zwracał błąd **dokładnie wtedy, gdy metryka była** — próg na buforze potoku 64 KB;
dowód D3: wdrożenie #73, próba 4, 10 s) → `X-42` (bramka wdrożenia nie uruchamiała lintu, trzy
wdrożenia przeszły zielono przy czerwonym CI) → `X-44` (paczka testów integracyjnych mogła
skasować bazę deweloperską, i była to ścieżka domyślna).

Nowa odmiana rodziny „test, który niczego nie dowodzi": nie fałszywa asercja, tylko
**fałszywe środowisko** — atrapa 200 B zamiast setek kB, `set -u` zamiast `set -Eeuo pipefail`.

**Decyzje z 2026-08-28** (`docs/zadania/DECYZJE-2026-08-28.md`), wszystkie delegowane:

1. **`main` nie jest chronione przed właścicielem repozytorium.** Ruleset wypisuje
   `Bypassed rule violations` przy każdym pushu. Jedyną realną bramką przed `main` jest
   **bramka uruchamiana lokalnie**. PR-y odrzucone (jeden programista = recenzja to rytuał).
2. **`OPS-01`: `status` NIE będzie zapisywany przez watchdoga.** `NodeSelector` bierze tylko
   `status: ACTIVE`, więc zapis `OFFLINE` zamieniłby dwuminutową przerwę w sieci w trwałe
   wyłączenie węzła. Zamiast tego `opiszSygnal()` wyliczany przy odczycie + znacznik w panelu.
3. **`DEV-01`: odzyskujemy nazwę roli, nie kasujemy wolumenu.** Delegacja znaczy „wybierz
   dobrze", nie „możesz usunąć to, czego nie sprawdziłeś".

**`X-49` — najważniejsze znalezisko organizacyjne.** Przez tydzień znaleziska trafiały do
dashboardów HTML (WIDOK), a nie do macierzy (REJESTR). Strażniki repozytorium czytają macierz,
więc 32 pozycje były dla nich niewidzialne. Koszt policzony: `X-18` (blokada ESLinta 10 przez
`eslint-plugin-react`) odkryte drugi raz od zera, z logów CI. Przy okazji korekta własnego
pomiaru: najpierw podano 15 brakujących pozycji — to była długość ręcznie wybranej próbki,
pełne porównanie identyfikatorów dało **32**.

---

## 3. Otwarte końce zastane 2026-09-19 — w kolejności ryzyka

### 3.1 KRYTYCZNE: praca z 28.08 nie jest zacommitowana

```
 M audyt/dane/macierz.csv          ← 32 pozycje przepisane w ramach X-49
 M audyt-parytetu-2026-08/VERRIS_LUKI_DASHBOARD.html
 M audyt-parytetu-2026-08/VERRIS_PARYTET_FUNKCJI_2026-08.xlsx
 M plan-startowy-2026-08/PLAN_SPRINTOW_2026-08.md
 M plan-startowy-2026-08/VERRIS_BACKLOG_STARTOWY.xlsx
 M plan-startowy-2026-08/VERRIS_PLAN_DASHBOARD.html
```

Cały efekt `X-49` — przepisanie 32 pozycji do rejestru — **leży w drzewie roboczym od 22 dni**.
Jeden `git checkout .` i tydzień pracy analitycznej znika. To jest zadanie zero.

Ironia jest warta odnotowania: pozycja, która opisuje „znaleziska nie trafiają tam, gdzie
czytają je strażniki", sama nie trafiła do historii repozytorium.

### 3.2 Macierz jest zaktualizowana, dokumentacja sprintów nie

`docs/sprinty/` zawiera wyłącznie `SPRINT-01.md`. Sprinty 2 i 3 zostały **wykonane w kodzie
i w macierzy, ale nigdy domknięte dokumentem**. Konwencja z `AKTUALIZACJA_AUDYTU.md` wymaga
tabeli zmian w macierzy i liczby blokerów przed/po dla każdego sprintu — to jest dokładnie
ten mechanizm, który miał zapobiec „optymizmowi dokumentacyjnemu".

### 3.3 `H-20` nadal ma flagę `BLOKER STARTU` mimo stanu `DZIAŁA` / `PARYTET`

Generator liczy przez to **5 blokerów zamiast 4**. Dowód D4 (odtworzenie bazy produkcyjnej
z kopii, 9 s, 2026-08-23) jest w macierzy. Flaga to pozostałość — albo ją zdejmujemy, albo
zapisujemy, dlaczego zostaje.

### 3.4 Plan sprintów rozjechał się z wykonaną pracą

Walidator przy każdym uruchomieniu wypisuje:

```
OSTRZEŻENIE: sprint 1 przeciążony: 68 h przy pojemności 30 h
OSTRZEŻENIE: sprint 2 przeciążony: 150 h przy pojemności 30 h
OSTRZEŻENIE: sprint 3 przeciążony: 44 h przy pojemności 30 h
```

Te ostrzeżenia są prawdziwe historycznie (sprinty urosły w locie) i **bezwartościowe dziś** —
opisują pracę już wykonaną. Stały szum w walidatorze uczy go ignorować, a to jest dokładnie
ten sam mechanizm co „re-run" na bramce, która potrafi zapalić się na zdrowym systemie (`X-33`).

### 3.5 Krytyczność i nakład 32 przepisanych pozycji są puste

Świadoma decyzja z 28.08: dashboard ich nie niósł, a wpisanie byłoby zgadywaniem.
Skutek jest jednak realny — `SEC-01`…`SEC-06`, `NODE-01`…`NODE-03`, `KSEF-01`…`KSEF-05`,
`DEV-01`, `DEP-01` **nie mają nakładu, więc nie liczą się do 358 h**. Rzeczywista praca
pozostała jest większa niż podana liczba, o nieznaną wielkość.

### 3.6 Zaległości, które rosną same

- **`DEP-01`** — 8 otwartych PR-ów Dependabota na 28.08. Po trzech tygodniach będzie ich więcej.
  Problem nie jest kosmetyczny: job `Security scans` wykrywa CVE, a poprawki leżą niescalone.
- **`DEP-02`** — dwa majory ESLinta w jednym drzewie (`libs/eslint-config/node_modules`:
  `eslint` 10.9.0 obok `@eslint/js` 9.39.5). Termin przeglądu wyciszenia: **2026-11-15**.
- **`DEV-01`** — baza deweloperska nieosiągalna (`role "verris" does not exist`).
  Po decyzji nr 1 z 28.08 to blokuje **jedyną realną bramkę przed `main`**.

### 3.7 Blokery startu — stan faktyczny

| ID | Stan | Co blokuje | Kiedy da się zamknąć |
|---|---|---|---|
| `P-15` DPA z subprocesorami | BRAK | Stripe, dostawca VPS, backup off-site, OpenProvider — **ani jedno nie podpisane** | Zależy od tempa dostawców, **nie od nas** |
| `Z-18` przyczyna błędu provisioningu | CZĘŚCIOWE | Kod naprawiony (D2), brakuje dowodu D3 | Dopiero na węźle #1 (`PB-02`) |
| `M-16` KSeF tryb offline | BRAK | Zakres zależy od `PB-13` | Po decyzji `PB-13` |
| `M-17` KSeF walidacja XSD | BRAK | Zależy od `M-16` | Po `M-16` |
| ~~`H-20`~~ | DZIAŁA | — | Zamknięte 23.08, flaga do zdjęcia |

**`P-15` jest zegarem kalendarzowym, nie roboczym.** Osiem godzin pracy, ale tygodnie
oczekiwania. Każdy dzień zwłoki z wysłaniem wniosków to dzień dodany do startu.

### 3.8 Ryzyko, które urosło przez przerwę: KSeF

`KSEF-01`: obowiązek KSeF działa od **1 kwietnia 2026** — dziś od **pięciu i pół miesiąca**.
To nie jest funkcja do dorobienia przed premierą, tylko obowiązek uruchamiający się
**przy pierwszej fakturze dla klienta zewnętrznego**. Okres bez kar ma dopiero doprecyzować
akt wykonawczy, więc nie da się na nim oprzeć planu.

Decyzja `PB-13` (własny moduł vs integracja z programem księgowym) stoi w planie na **S14**.
Przy pozostałych 358 h to jest grudzień. **Rekomendacja: przesunąć `PB-13` do przodu** —
zakres `M-16`/`M-17` (28 h) zależy od niej, a obowiązek już biegnie.

---

## 4. Kalendarz po przeplanowaniu

Plan przebudowany 2026-09-19. Punkt odniesienia `start` w `konfiguracja.json` przesuniety
na **2026-08-31**, zeby daty zgadzaly sie DO PRZODU: sprint 4 rusza **2026-09-21**.
Dla sprintow 1-3 daty sa przez to o tydzien przesuniete wobec rzeczywistosci (praca powstala
2026-08-21 do 08-28) — te sprinty sa wykonane i czyta sie je jako zapis zakresu, nie terminu.

| | Plan z 2026-08-21 | Po przeplanowaniu |
|---|---|---|
| Sprintow do startu | 20 (728 h) | 20 (**552 h pracy otwartej**) |
| Wszystkie blokery poza KSeF | 2026-10-16 | **2026-11-02** (po sprincie 10, domkniecie DPA) |
| Ostatni sprint | — | 2027-01-11 → 01-15 |
| Decyzja GO | 2027-01-01 | **~2027-01-29** (z dwutygodniowa przerwa swiateczna) |

552 h zamiast 358 h z pierwszego liczenia — roznica to **wyceniony dzis blok bezpieczenstwa
i pozycje bez nakladu z par. 3.5**. To nie jest nowa praca; to praca, ktora byla niewidzialna
dla budzetu godzin.

Blokery startu: **4**, nie 5. `H-20` mial martwa flage — zdjeta.

| ID | Sprint | Kiedy przestaje blokowac |
|---|---|---|
| `P-15` DPA | 4 (wyslanie) → 10 (domkniecie) | Zalezy od dostawcow, nie od nas |
| `Z-18` | 6 | Dowod D3 na wezle #1 |
| `M-16` KSeF offline | 17 | Po `PB-13` ze sprintu 5 |
| `M-17` KSeF XSD | 18 | Po `M-16` |

---

## 5. Plan sprintow 4-20

**Sprint 4 · 2026-09-21 · Wznowienie: odzyskac srodowisko i zatrzymac gnicie · 32 h**
`DEV-01` `DEP-01` `ENV-01` `DEP-02` `X-03` `P-15:2`

Kolejnosc nie jest dowolna. `DEV-01` idzie pierwsze, bo po decyzji nr 1 z 28.08 jedyna realna
bramka przed `main` jest bramka lokalna, a ona nie wstanie bez bazy deweloperskiej.
`P-15:2` to **wyslanie** wnioskow DPA w poniedzialek rano — jedyna pozycja w planie, ktorej
czas trwania nie zalezy od nas.

**Sprint 5 · 09-28 · Domkniecie ogonow sprintu 2 i kierunek fakturowania · 30 h**
`X-31` `X-32` `M-08` `PB-13` `PB-14`

`PB-13` przesuniete tutaj z pierwotnego sprintu 14. Od niej zalezy zakres sprintow 17-18,
w tym dwa blokery startu.

**Sprint 6 · 10-05 · Wezel produkcyjny #1 · 30 h**
`PB-02` `NODE-02` `Z-18:2` `J-01`

`NODE-02` przed `PB-02`, nie po: instalator nie sprawdza kodow powrotu i kontynuuje po
nieudanym preflighcie.

**Sprinty 7-9 · 10-12 → 10-26 · Blok egressu · 94 h**

| Sprint | Zakres | h |
|---|---|---|
| 7 | `SEC-05` `SEC-04` `SEC-01` — najpierw pomiar, ktory nie klamie, potem DROP, ktory obowiazuje | 28 |
| 8 | `X-41` `SEC-03` — pelne pokrycie ruchu: FORWARD/DOCKER-USER, DNS, SMTP | 32 |
| 9 | `SEC-06` `SEC-02` `NODE-03` `J-04` — allowlista zbudowana z obserwacji, nie z pamieci | 34 |

Nowe sprinty, decyzja wlasciciela 2026-09-19. `SEC-05` jest pierwsze, bo allowlista budowana
na probce logu jest niepelna z definicji — dopoki log jest probka, reszta bloku opiera sie
na zgadywaniu.

**Sprint 10 · 11-02 · Domkniecie DPA i obsluga naduzyc · 34 h** — `P-15:14` `C-18` `B-01` `PB-04`
Po tym sprincie zamkniete sa wszystkie blokery poza para KSeF-owa.

**Sprinty 11-13 · 11-09 → 11-23 · Produkt · 90 h** — DNS i SSO, poczta, warstwa operatorska, backup

**Sprint 14 · 11-30 · Dokumenty prawne i bus factor · 30 h** — `PB-03` `PB-11` `I-11`
`PB-03` przesuniete do przodu, bo `N-16` (kredyty SLA) zalezy od opublikowanego regulaminu —
w pierwotnej kolejnosci ta zaleznosc byla odwrocona.

**Sprinty 15-16 · 12-07 → 12-14 · Cennik, landing, pomiar · 66 h**

**Sprinty 17-18 · KSeF · 62 h** — kolizja ze swietami, zakladamy dwa tygodnie przerwy.
Wniosek o certyfikat KSeF typu 2 z portalu MF skladamy w sprincie 17, bo bez niego
`KSEF-03` (kody QR) nie ruszy, a to sprawa formalna, nie kod.

**Sprint 19 · Baza wiedzy, KSeF od strony klienta, kampania · 30 h**

**Sprint 20 · 2027-01-11 · Sciezka pierwszego klienta i decyzja GO · 24 h** — `PB-05` `PB-12`
Jedyny moment w calym planie, w ktorym powstaje dowod poziomu D3.

### Swiadomie poza planem startowym

`X-48` (`strictNullChecks` wylaczony w profilu Nest, 40 h) — decyzja wlasciciela 2026-09-19:
po starcie, z terminem przegladu w repo, wzorem `DEP-03`. `NODE-01` (dwie sciezki dodania
wezla) — roadmapa po starcie, to porzadek, nie bezpieczenstwo.

---

## 6. Zasady, które wracają razem z pracą

1. **Każdy sprint kończy się aktualizacją macierzy i dokumentem w `docs/sprinty/`.**
   Commit obejmuje dane **i** widoki. Bez tego po trzech sprintach nikt nie wie, co jest zrobione.
2. **Macierz jest rejestrem, dashboard widokiem.** `audyt/generate.py` buduje oba dashboardy
   z `macierz.csv` — sprawdzone 2026-09-19. Znalezisko zapisane wyłącznie w widoku jest
   niewidzialne dla strażników (`X-49`).
3. **Nie zaczynamy dnia od dashboardu ani od GitHuba — zaczynamy od macierzy.**
   `X-18` odkryte dwa razy dlatego, że ta zasada nie obowiązywała.
4. **Pytanie do każdego harnessu:** czym moja atrapa różni się od produkcji i czy któraś
   z tych różnic może decydować o wyniku? (`X-34`)
5. **Stan `DZIAŁA` wymaga dowodu `plik:linia`.** Walidator to egzekwuje; dziś 0 naruszeń.

---

## 7. Poufność i bezpieczeństwo — ustalenie z 2026-09-19

Właściciel projektu ustalił: **projekt jest poufny, nic nie wychodzi poza jego maszynę.**
Żadnych publikacji, żadnych kopii w zewnętrznych bazach, żadnego udostępniania.

Praktyczne skutki dla pracy:

- Dokumentacja, dashboardy i raporty powstają **w repozytorium**, nie jako hostowane strony.
- Tablice `VERRIS_PLAN_DASHBOARD.html` i `VERRIS_LUKI_DASHBOARD.html` są otwierane z dysku;
  jeżeli któraś zostanie tymczasowo opublikowana dla wygody pracy, **ma być skasowana
  natychmiast po zakończeniu tej pracy**.
- Fragmenty kodu, dowody `plik:linia`, adresy węzłów i konfiguracja infrastruktury nie
  trafiają do narzędzi zewnętrznych.

### Konsekwencja, której plan jeszcze nie uwzględnia

Blok `SEC-01`…`SEC-06` (przepisany do macierzy 28.08 w ramach `X-49`) **nie ma nakładu
ani krytyczności**, więc nie liczy się do 358 h i nie stoi w żadnym sprincie. Przy deklaracji
„produkt ma być bardzo bezpieczny" to jest największa dziura w planie:

| ID | Rzecz |
|---|---|
| `SEC-01` | Tryb `--strict` egressu jest atrapą — trzy niezależne wyciszenia: `DROP` w niedostępnym teście cgroup, skrypt kończy `WARN` z kodem 0, instalator woła go z `\|\| true`. 1,81 mln pakietów przeszło ostatnim `RETURN`-em. |
| `SEC-02` | Stripe w allowliście wyłącznie po nazwie; ipset powstaje z rozwiązania nazw, adresy Stripe rotują. |
| `SEC-03` | Ruch poza TCP/80 i TCP/443 (DNS, SMTP) poza obserwacją i poza trybem strict. |
| `SEC-04` | Host rozmawia z kontenerami przez OUTPUT — strict bez wyjątku dla `172.16.0.0/12` zerwałby to połączenie. |
| `SEC-05` | Log egressu jest próbką, nie zapisem (1796 wpisów wobec 1,81 mln pakietów) — każda allowlista budowana na tym odczycie jest niepełna z definicji. |
| `SEC-06` | Allowlista pokrywa to, o czym ktoś pomyślał, nie to, co host robi. |
| `NODE-02` | `main()` instalatora węzła nie sprawdza kodów powrotu — instalacja kontynuuje po nieudanym preflighcie. |
| `DEP-01` | `Security scans` wykrywa CVE, poprawki leżą w niescalonych PR-ach. |

Wspólny wzorzec całego bloku to ten sam, który audyt nazwał wcześniej przy `X-02` i `X-44`:
**kontrola opisana słowami, nieegzekwowana kodem.** Zabezpieczenie, które wygląda jak włączone
i nie jest, jest gorsze niż jego brak, bo zamyka pytanie.

**Rekomendacja:** wycenić ten blok w W1 (zadanie 6 — uzupełnienie nakładów) i wstawić
**dedykowany sprint bezpieczeństwa egressu po W3**, przed jakimkolwiek ruchem w stronę
sprzedaży. Węzeł #1 z `PB-02` staje w W3 — on jest pierwszą maszyną, na której te pozycje
przestają być teorią.
