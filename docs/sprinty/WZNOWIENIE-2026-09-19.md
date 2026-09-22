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

### 3.9 Odkryte 2026-09-19 przy przegladzie kolejki Dependabota

Szescioro otwartych PR-ow (nie osiem — dwa eslintowe zamknely sie same po wyciszeniu z `DEP-03`,
czyli ta reguła zadziałała). Sam przeglad odslonil trzy rzeczy, ktorych nie bylo w macierzy.

**`SEC-07` — trzy podatnosci HIGH w multerze, CVSS 7.5.** Zdalny DoS, bez uwierzytelnienia
i bez interakcji uzytkownika: jedno zadanie `multipart/form-data` konczy proces API. Sciezka
uploadu zalacznikow do zgloszen jest wystawiona. Pulapka opisana w par. 5.

**`X-50` — bramka podatnosci nie zatrzymuje niczego.** `X-23` stalo jako `DZIAŁA` z obietnica
„bramka zatrzymuje wdrozenie". Nie zatrzymuje: zyje wylacznie w `ci.yml`, `deploy.yml` jej nie
wola, a `Security scans` nie jest checkiem wymaganym w rulesecie — PR #37 ma czerwona bramke
i badge „Able to merge". Pozycja `X-23` skorygowana na `CZĘŚCIOWE`.

To ta sama rodzina co `X-42`, o poziom wyzej. Tam bramka wdrozenia byla slabsza od `ci.yml`
i dolozylismy lint; nikt wtedy nie sprawdzil, czy brakuje jeszcze czegos. Brakowalo bramki
podatnosci.

**`X-51` — konfiguracja GitHuba rozjechana z repozytorium.** Zadna z szesciu etykiet
z `dependabot.yml` nie istnieje w repo, wiec kazdy PR Dependabota niesie komunikat o bledzie
konfiguracji, a filtr „po etykiecie security" zwraca pustke — co jest gorsze niz brak filtra,
bo pusty wynik wyglada jak brak problemow. Ruleset celuje tez w `live-release-readiness`,
galaz zniesiona przez `X-13`.

---

## 4. Kalendarz po przeplanowaniu

Punkt odniesienia `start` w `konfiguracja.json` przesuniety na **2026-08-31**, zeby daty
zgadzaly sie DO PRZODU: sprint 4 rusza **2026-09-21**. Dla sprintow 1-3 daty sa przez to
o tydzien przesuniete wobec rzeczywistosci (praca powstala 2026-08-21 do 08-28) — te sprinty
sa wykonane i czyta sie je jako zapis zakresu, nie terminu.

| | Plan z 2026-08-21 | Po przeplanowaniu |
|---|---|---|
| Sprintow do startu | 20 (728 h) | **21** (**576 h pracy otwartej**) |
| Wszystkie blokery poza KSeF | 2026-10-16 | **2026-10-09** (po sprincie 6) |
| Ostatni sprint | — | 2027-01-18 → 01-22 |
| Decyzja GO | 2027-01-01 | **~2027-02-05** (z dwutygodniowa przerwa swiateczna) |

576 h zamiast 358 h z pierwszego liczenia. Roznica to **wyceniony blok bezpieczenstwa,
pozycje bez nakladu z par. 3.5 i 28 h odkryte 2026-09-19 przy przegladzie kolejki Dependabota**
(`SEC-07`, `X-50`, `X-51` — par. 3.9). Praca nie przybyla; przybylo jej widocznosci.
Plan urosl o jeden sprint, bo tych 28 h nie dalo sie wcisnac w istniejace bez robienia
z pojemnosci fikcji.

Blokery startu: **4**. `H-20` mial martwa flage — zdjeta.

| ID | Sprint | Kiedy przestaje blokowac |
|---|---|---|
| `P-15` DPA | 4 | Nie zalezy od dostawcow — patrz par. 5 |
| `Z-18` | 6 | Dowod D3 na wezle #1 |
| `M-16` KSeF offline | 18 | Po `PB-13` ze sprintu 5 |
| `M-17` KSeF XSD | 19 | Po `M-16` |

---

## 5. Plan sprintow 4-21

| Sprint | Od | h | Zakres |
|---|---|---|---|
| **4** | 09-21 | 30 | **Wznowienie** — `DEV-01` `DEP-01` `ENV-01` `P-15` `X-50` |
| **5** | 09-28 | 34 | **Multer i kierunek fakturowania** — `SEC-07` `X-03` `PB-13` `PB-14` |
| **6** | 10-05 | 30 | **Wezel produkcyjny #1** — `PB-02` `NODE-02` `Z-18` `J-01` |
| **7** | 10-12 | 28 | **Egress: pomiar** — `SEC-05` `SEC-04` `SEC-01` |
| **8** | 10-19 | 32 | **Egress: pokrycie ruchu** — `X-41` `SEC-03` |
| **9** | 10-26 | 28 | **Egress: allowlista z obserwacji** — `SEC-06` `SEC-02` `NODE-03` |
| **10** | 11-02 | 32 | **Naduzycia i zaleznosci** — `X-31` `X-32` `DEP-02` `X-51` `PB-04` |
| **11** | 11-09 | 24 | **Ogony produktowe** — `M-08` `C-18` `B-01` `J-04` |
| **12-14** | 11-16 → 11-23 | 90 | DNS i SSO, poczta, warstwa operatorska, backup |
| **15** | 11-30 | 30 | **Dokumenty prawne i bus factor** — `PB-03` `PB-11` `I-11` |
| **16-17** | 12-07 → 12-14 | 66 | Cennik, landing, pomiar |
| **18-19** | 12-28 → 01-04 | 62 | **KSeF** — kolizja ze swietami, dwa tygodnie przerwy zalozone |
| **20** | 01-11 | 30 | Baza wiedzy, KSeF od strony klienta, kampania |
| **21** | 01-18 | 24 | **Sciezka pierwszego klienta i decyzja GO** — `PB-05` `PB-12` |

### Trzy rzeczy, ktorych nie widac z tabeli

**`P-15` nie jest zegarem kalendarzowym.** Bylo w planie pozycja, ktorej tempa nie kontrolujemy —
16 h rozbite na dwa sprinty, przez co domkniecie blokerow stalo na listopad. Sprawdzone u zrodla:
u zadnego z pieciu dostawcow nie trzeba nikogo prosic. Stripe i AWS maja DPA wlaczone w umowe
glowna, Hetzner i Openprovider akceptuje sie kliknieciem w panelu, Cloudflare zostaje do
potwierdzenia. Praca wlasna to jeden dokument: Zalacznik 1 do DPA Hetznera. **6 h zamiast 16,
ostatni bloker poza KSeF-em zamyka sie miesiac wczesniej.**

**`SEC-07` latwo zamknac za wczesnie.** Merge PR #37 podnosi multer do 2.3.0 i bedzie wygladal
na naprawe, ale `@nestjs/platform-express@11.2.1` pinuje `2.2.0` dokladnie — kopia obslugujaca
multipart zostanie podatna. Do tego jedno z trzech advisory wymaga skonfigurowania
`limits.fieldArrayIndexLimit`, czyli zmiany w kodzie. Dowodem zamkniecia jest zielona bramka
podatnosci, nie numer wersji w `package.json`.

**Egress ma kolejnosc wymuszona logika, nie preferencja.** `SEC-05` pierwsze, bo log egressu
ma ogranicznik czestotliwosci (1796 wpisow w journalu wobec 1,81 mln pakietow na liczniku) —
kazda allowlista zbudowana na tym odczycie jest niepelna z definicji. Dopoki log jest probka,
reszta bloku opiera sie na zgadywaniu.

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

---

## 8. Przeplanowanie 2026-09-22 — kod najpierw, dokumenty na koniec, KSeF poza panelem

Dwie decyzje właściciela:

1. **Wszystkie zadania dokumentowe na sam koniec**, przed pierwszym klientem.
2. **Faktury VAT wystawia program księgowy** — na start ręcznie, potem integracja po API.
   Zapisane jako `docs/architektura/ADR-2026-09-22-faktury-w-programie-ksiegowym.md`.

Skutki:

| | Przed | Po |
|---|---|---|
| Sprintów do startu | 21 | **19** |
| Praca otwarta | 576 h | **454 h** |
| Blokery startu | 4 (`P-15`, `Z-18`, `M-16`, `M-17`) | **3** (`FAK-01`, `Z-18`, `P-15`) |
| Ostatni sprint | 2027-01-18 | **2027-01-04 → 01-08** |
| Decyzja GO realnie | ~2027-02-05 | **~2027-01-22** (sprinty 17–18 na święta) |

**Dlaczego pojawił się nowy bloker, skoro dwa zeszły.** Panel dziś sam numeruje faktury
w transakcji obciążenia portfela. Przy ręcznym wystawianiu w programie księgowym każda
płatność dostałaby dwie faktury w dwóch seriach. `FAK-01` (przełącznik `faktury.tryb`,
domyślnie `zewnetrzny`) usuwa ten konflikt i jest jednocześnie szwem pod późniejszą
integrację po API. Flagi `M-16` i `M-17` zeszły **warunkowo** — do czasu wdrożenia `FAK-01`
panel nadal potrafi wystawić fakturę VAT poza KSeF.

**Co jest „dokumentem", a co nie.** Na koniec poszły dokumenty-produkty: regulamin i legal
(`PB-03`), DPA (`P-15`), procedura abuse (`PB-04`), cennik i treści (`PB-07`), baza wiedzy
(`PB-09`), procedura zastępstwa (`PB-11`), runbook GO (`PB-12`) oraz landing i kampania,
które od nich zależą. **Zostają na bieżąco** podsumowania sprintów i pliki `docs/zadania/`
— to nie są dokumenty, tylko mechanizm, który audyt wprowadził przeciwko „optymizmowi
dokumentacyjnemu". Bez nich po trzech sprintach nikt nie wie, co jest zrobione.

**Kolejność kodu:** sprint 5 — `FAK-01` + `X-03` + `PB-14`; sprint 6 — węzeł #1;
sprinty 7–9 — egress; 10–15 — produkt; 16–19 — dokumenty i start.

## 9. Przeplanowanie 2026-09-22 (2) — serwer na koniec

Decyzja właściciela: wszystko, co wymaga nowego serwera, na koniec — zakup AX102 dopiero
w sprincie 18, żeby serwer nie stał pusty. Kolejność od sprintu 6:

| Sprint | Zakres |
|---|---|
| 6–11 | panel: DNS/SSO/PHP, poczta, warstwa operatorska, backup/staging, ogony, rozliczenia (+NODE-03) |
| 12–13 | zapora control-plane: egzekwowanie w FORWARD + UDP/53/SMTP, potem strict po tygodniach pomiaru |
| 14–17 | dokumenty, cennik, landing, kampania (wstrzymana) |
| 18 | **zakup i onboarding węzła #1** (Z-18, NODE-02, J-01, J-04 — dowody D3) |
| 19 | ścieżka pierwszego klienta (wymaga węzła) i decyzja GO |

Z-18 zdjęte z listy sprintu 2 (tam zrobiony kod), żeby generator przypisał je do sprintu 18.
