# Sprint 01 — zatrzymać krwawienie i włączyć CI

| | |
|---|---|
| **Okres** | 2026-08-21 (jeden dzień roboczy — sprint skrócony, start audytu) |
| **Faza** | I — fundament dowodowy |
| **Zaplanowane** | 30 h z 40 h pojemności (`X-01`, `X-02`, `X-03`, `Z-02`, `PB-01`) |
| **Wykonane** | ~17 h |
| **Zamknięte** | 3 z 5 zaplanowanych + 8 pozycji nieplanowanych |

---

## Co zostało zamknięte

| ID | Zadanie | h plan | h realnie | Poziom dowodu | Dokumentacja |
|---|---|---|---|---|---|
| `Z-02` | Blokada zamówienia usługi bez opłaty | 6 | 4 | **D2** (D3 po wdrożeniu) | [`docs/zadania/Z-02-…`](../zadania/Z-02-blokada-zamowienia-uslugi-bez-oplaty.md) |
| `X-01` | CI uruchamiające testy | 6 | 4 | **D2** | [`docs/zadania/X-01-…`](../zadania/X-01-ci-uruchamiajace-testy.md) |
| `X-02` | Status wymagany do merge | 6 | 1 | D4 | [`docs/zadania/X-02-…`](../zadania/X-02-status-wymagany-do-merge.md) |
| `X-03` | Testy przed wdrożeniem | 6 | 2 | D1, częściowo | [`docs/zadania/X-03-…`](../zadania/X-03-testy-uruchamiane-przed-wdrozeniem.md) |
| — | Domknięcie prac z 25–26 lipca (7 pozycji macierzy) | 0 | 6 | D2 | [`docs/zadania/S1-WIP-…`](../zadania/S1-WIP-LIPIEC-domkniecie-funkcji.md) |
| — | Uporządkowanie dokumentacji (31 → 3 pliki w korzeniu) | 0 | ~4 | D0 (dokumenty) | [`docs/README.md`](../README.md) |

## Co się nie zamknęło i dlaczego

**`PB-01` — unit economics węzła.** Nie zaczęte. Zjadło je odkrycie lipcowego WIP-u, którego nie było w planie, a które wywracało siedem pozycji macierzy. Uznałem, że zamknięcie siedmiu funkcji opisanych jako defekty produktu jest ważniejsze niż arkusz kosztów — ale to znaczy, że `PB-01` wchodzi do sprintu 2 i ktoś musi pilnować, żeby nie wypadło znowu. **To jest bloker biznesowy, nie ozdoba.**

## Co odkryliśmy w trakcie

| Nowe ID | Co to | Krytyczność | Sprint |
|---|---|---|---|
| `Z-08` | Przegląd istniejących subskrypcji `MANUAL` — czy ktoś zdążył skorzystać z luki `Z-02` przed poprawką | ŚREDNIA | 2 |
| `X-11` | Testy API w osobnym jobie CI, nie za typecheckiem | ŚREDNIA | 2 |

Poza tym trzy rzeczy, które nie są pozycjami macierzy, ale zmieniają obraz:

1. **Miesiąc niezacommitowanej pracy z 25–26 lipca.** Siedem pozycji opisanych w audycie jako `ATRAPA` to nie były defekty produktu, tylko niedokończony WIP. Klasyfikacja się nie zmienia (z punktu widzenia klienta 404 to 404), ale przyczyna owszem — i to zmienia sposób naprawy.
2. **API się nie kompilowało.** Dziewięć brakujących stałych dziennika audytu, twardy `TS2339`. Nie dało się uruchomić testów, dopóki tego nie było — commit `f324267` musiał iść pierwszy.
3. **Mostek do dysku nie umie usuwać plików.** Stąd katalogi `_to_delete_*` w korzeniu i lock-pliki gita, których git nie potrafi po sobie posprzątać. Do usunięcia ręcznie przez PM-a.

## Zmiany w macierzy audytu

| ID | Stan przed | Stan po | Werdykt przed | Werdykt po |
|---|---|---|---|---|
| `Z-02` | BRAK | DZIAŁA | LUKA | PARYTET |
| `X-01` | BRAK *(błędnie)* | DZIAŁA | LUKA | PARYTET |
| `X-02` | BRAK | DZIAŁA | LUKA | PARYTET |
| `X-03` | BRAK | CZĘŚCIOWE | LUKA | CZĘŚCIOWY |
| `B-02` | ATRAPA | DZIAŁA | LUKA | PARYTET |
| `D-04` | ATRAPA | DZIAŁA | LUKA | PARYTET |
| `D-05` | ATRAPA | DZIAŁA | LUKA | PARYTET |
| `D-06` | ATRAPA | DZIAŁA | LUKA | PARYTET |
| `D-07` | ATRAPA | DZIAŁA | LUKA | PARYTET |
| `D-11` | ATRAPA | DZIAŁA | LUKA | PARYTET |
| `E-14` | ATRAPA | DZIAŁA | LUKA | PARYTET |
| `Z-08` | — | BRAK *(nowa)* | — | LUKA |

Liczba blokerów przed: **11** → po: **10**.
Werdykty: PARYTET 105 → **115**, LUKA 135 → **126**, CZĘŚCIOWY 43 → **44**. Pozycji w macierzy: 352 → **354** (nowe `Z-08` i `X-11`).

Poprawione też ceny w danych planu: **45 zł/mies brutto i 399 zł/rok** (commit `7109c78` zmienił je z 39/349, a audyt i plan nadal cytowały stare). `PB-01` liczy się teraz wobec właściwej liczby.

- [x] `audyt/dane/macierz.csv` zaktualizowana
- [x] `python3 audyt/generate.py --sprawdz` przechodzi bez błędów
- [x] widoki przebudowane i zacommitowane razem z danymi

## Ochrona gałęzi (X-02)

Ustawiona 2026-08-21 przez interfejs GitHuba: ruleset `main — wymagaj zielonego CI`, aktywny, na gałęzi domyślnej. Wymaga trzech checków z `ci.yml` (`Static checks`, `Build`, `Prisma migrate deploy`), aktualności gałęzi przed scaleniem, blokuje force push i usunięcie gałęzi. Repository admin ma obejście — jednoosobowy zespół potrzebuje wyjścia awaryjnego.

Świadomie **ruleset**, nie klasyczna ochrona gałęzi: klasyczny formularz pozwala wybrać wyłącznie checki, które GitHub widział w ciągu ostatniego tygodnia, a CI nie przebiegło jeszcze ani razu. Ruleset przyjmuje check po nazwie, więc reguła mogła powstać **przed** pierwszym przebiegiem.

Zastrzeżenie do dowodu: reguła jest ustawiona, ale jeszcze nie zadziałała. Pierwszy przebieg pokaże, czy nazwy checków wpisane ręcznie zgadzają się co do znaku z tym, co wystawia `ci.yml`. Jeżeli nie — reguła będzie czekać na check, który nigdy nie przyjdzie. Sprawdzić przy pierwszym PR-ze.

## Pierwszy przebieg CI — i co pokazał

Gałąź wypchnięta 2026-08-21. **Run #17 był pierwszym uruchomieniem tego workflow w historii repozytorium** i wyszedł czerwony na dwóch rzeczach zastanych:

- `aquasecurity/trivy-action@0.24.0` nie istnieje (to repo taguje z przedrostkiem `v`) — job padał po dwóch sekundach, przed checkoutem;
- `apps/www` nie przechodził typechecku (`sitemap.ts` — Payload typuje `res.docs` szerzej, niż zakładał kod).

Druga rzecz miała konsekwencję, której nie widać z opisu: **testy API stoją w tym samym jobie, w kroku po typechecku.** Dopóki typecheck padał, `pnpm --filter api test` nie uruchomiło się ani razu — CI działało, a dowodu D2 nadal nie było. Stąd nowa pozycja `X-11`.

Obie naprawione w `e122ae4`. **Run #18: wszystkie cztery joby zielone, 2m 17s. Krok „API unit tests": 37 zestawów, 194 testy, wszystkie przeszły.**

Warto odnotować, co jeszcze potwierdził ten przebieg:
- **Prisma migrate deploy (smoke)** przechodzi — migracja `20260718120000_offsite_restore` wchodzi na czystą bazę i schemat nie ma dryfu wobec `schema.prisma`;
- **Build (api + panels)** przechodzi — API kompiluje się z prawdziwie wygenerowanym klientem Prismy, nie tylko z atrapą z mojego środowiska;
- liczba 194 zgadza się **co do jednego** z tym, co zmierzyłem lokalnie na atrapie. To znaczy, że atrapa nie zawyżała ani nie ukrywała niczego — po jej naprawie.

## Stan produkcji

**Nic.** Żadna zmiana z tego sprintu nie poszła na produkcję. Wdrożenie nie ruszy samo — `chore/audyt-i-porzadek` nie jest na liście wyzwalaczy `deploy.yml`.

## Czego się nauczyliśmy

**1. „Nie ma tego w archiwum" to nie to samo co „nie ma tego w repozytorium".** Wykluczyłem `.github` przy pakowaniu źródeł, podagent zameldował brak, a ja wypuściłem to jako nagłówek raportu: „CI nie istnieje, D2 = 0%". CI istniało i było dobre — po prostu chodziło na gałęziach, na których nikt nie pracuje. Wniosek na stałe: **każde twierdzenie o braku czegoś w repozytorium sprawdzam bezpośrednio w repozytorium**, nie w kopii, na której akurat pracuję. Ta sama pomyłka dała wcześniej dwa fałszywe „braki" w audycie (dostępność EAA i tracker DPA — oba istnieją w `docs/legal/`).

**2. Czerwone testy to najczęściej wina środowiska, dopóki się tego nie wykluczy.** Raportowałem 27 czerwonych przypadków jako stan zastany. Po uzupełnieniu atrapy Prismy, na której muszę pracować (klient nie generuje się w kontenerze — `binaries.prisma.sh` zwraca 403), zostały **trzy**. Zanim liczba czerwonych testów trafi do raportu, musi przejść przez pytanie: czy to kod, czy moje środowisko.

**3. Test na całą klasę błędu jest wart więcej niż siedem testów na siedem przypadków.** `ui-routes-coverage.spec.ts` powstał w godzinę i wyłapuje każde przyszłe „UI woła adres, którego nie ma" — łącznie z takim, którego nikt jeszcze nie napisał. Siedem osobnych testów kosztowałoby tyle samo i pilnowało siedmiu linii.

## Ryzyka na następny sprint

**`PB-01` może wywrócić cennik.** Jeżeli koszt węzła nie domyka się przy 45 zł brutto, zmienia się treść cennika w sprincie 15 i cała komunikacja startowa. Dlatego to zadanie jest z przodu, a nie z tyłu — i dlatego przesunięcie go o sprint jest realnym ryzykiem, nie formalnością.

**~~Pierwszy przebieg CI może być czerwony z powodów, których u siebie nie zobaczę.~~** Zmaterializowało się jeszcze w tym samym dniu — dwa razy, i oba razy z powodów, których atrapa nie mogła pokazać (tag akcji, typecheck w panelu, którego nie tykałem). Ryzyko zamknięte przebiegiem #18.

**Ochrona gałęzi żyje poza repozytorium.** Ruleset nie jest w żadnym pliku, nie odtworzy się z kopii kodu i nie przetrwa przeniesienia repo. Jedyny jego zapis to `docs/zadania/X-02-status-wymagany-do-merge.md`. Jeżeli kiedyś dojdzie druga taka reguła, warto rozważyć eksport rulesetów do repozytorium.

**Ręczna ścieżka wdrożenia zostaje otwarta.** `ops/scripts/prod-deploy-ghcr.sh` omija bramkę testową jednym poleceniem. Do rozstrzygnięcia z PM-em w sprincie 2: zamykamy czy zostawiamy świadomie jako wyjście awaryjne.
