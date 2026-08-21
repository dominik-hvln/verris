# `X-02` — Status wymagany do merge

| | |
|---|---|
| **Sprint** | 1 (2026-08-21) |
| **Priorytet** | WYSOKA |
| **Nakład** | planowany 6 h · rzeczywisty 1 h |
| **Zależy od** | `X-01` |
| **Status** | zrobione |
| **Data zamknięcia** | 2026-08-21 |

---

## Problem

Nawet z działającym CI nic nie stoi na przeszkodzie, żeby scalić gałąź z czerwonymi testami. Bramka, której da się nie zauważyć, jest sugestią, nie bramką.

## Dowód przed

```
ustawienie po stronie GitHuba (Settings → Branches), nie da się go zapisać w repozytorium
```

**Stan w macierzy przed:** `BRAK`

## Rozwiązanie

**Tego zadania nie da się zrobić kodem.** Reguły ochrony gałęzi żyją w konfiguracji repozytorium na GitHubie, nie w plikach. Nie ma ich w `.github/`, nie da się ich zacommitować i nie da się ich odtworzyć z repozytorium po awarii — o czym niżej, w sekcji o ryzyku.

**Wykonane 2026-08-21** przez interfejs GitHuba, w przeglądarce PM-a. Zamiast klasycznej ochrony gałęzi użyty został **ruleset**, z jednego konkretnego powodu: klasyczny formularz pozwala wybrać wyłącznie checki, które GitHub widział w ciągu ostatniego tygodnia, a CI w tym repozytorium nie przebiegło jeszcze ani razu. Ruleset pozwala dodać check po nazwie („Any source"), więc regułę dało się ustawić **przed** pierwszym przebiegiem, a nie po nim.

### Co zostało ustawione

| | |
|---|---|
| **Nazwa** | `gałęzie wdrożeniowe — wymagaj zielonego CI` |
| **Status** | Active |
| **Zakres** | gałąź domyślna (`main`) **oraz** `live-release-readiness` |
| **Lista obejścia** | `Repository admin` — „Always allow" |
| **Wymagane checki** | `Static checks (lint + typecheck)` · `Build (api + panels)` · `Prisma migrate deploy (smoke)` |
| **Dodatkowo** | wymagana aktualność gałęzi przed scaleniem · blokada force push · zakaz usunięcia gałęzi |
| **Adres reguły** | `https://github.com/dominik-hvln/verris/settings/rules/21161479` |

Poniżej zostaje procedura ręczna — na wypadek odtwarzania reguły albo zakładania jej na kolejnej gałęzi.

### Krok po kroku

1. `https://github.com/dominik-hvln/verris` → **Settings** (zakładka na górze, po prawej)
2. Menu po lewej → **Branches**
3. **Add branch protection rule** (albo **Add classic branch protection rule**, zależnie od tego, co GitHub pokaże)
4. **Branch name pattern:** `main`
5. Zaznacz **Require status checks to pass before merging**
6. Pod spodem pojawi się pole wyszukiwania checków. **Ono zadziała dopiero po pierwszym przebiegu CI** — GitHub podpowiada wyłącznie checki, które wystartowały w ciągu ostatniego tygodnia. Dlatego kolejność jest: najpierw push gałęzi `chore/audyt-i-porzadek`, potem to ustawienie.

   `ci.yml` wystawia **cztery** checki — nazwa checku to pole `name:` joba, nie jego identyfikator:

   | job w pliku | nazwa checku na GitHubie | wymagać? |
   |---|---|---|
   | `static-checks` | `Static checks (lint + typecheck)` | **tak** |
   | `build` | `Build (api + panels)` | **tak** |
   | `migrations` | `Prisma migrate deploy (smoke)` | **tak** |
   | `security-scans` | `Security scans (gitleaks + audit + trivy)` | nie |

   Skanów bezpieczeństwa świadomie nie wymagam do merge'a: `pnpm audit` i Trivy potrafią zapalić się na podatności w zależności przechodniej, na którą nie masz wpływu w dniu, w którym akurat chcesz scalić poprawkę. Mają być widoczne i czytane, nie mają blokować. Jeżeli po miesiącu okaże się, że nikt ich nie czyta — wtedy stają się wymagane.
7. Zaznacz też **Require branches to be up to date before merging** — bez tego można scalić gałąź, która była zielona wobec starego `main`.
8. **Create** / **Save changes**

### Czego świadomie NIE włączać

- **Require pull request reviews** — jednoosobowy zespół. Wymóg cudzej recenzji przy jednym deweloperze kończy się wyłączaniem reguły „na chwilę", a potem zostaje wyłączona.
- **Include administrators** — na razie nie. Zostawia furtkę na awarię o trzeciej w nocy. Do włączenia, gdy w projekcie będzie druga osoba.
- **Require linear history** — nie ma powodu, historia i tak jest prosta.

## Zmienione pliki

Brak — zmiana jest w konfiguracji GitHuba.

Migracje bazy: brak
Zmienne środowiskowe: brak

## Testy

Nie dotyczy. Weryfikacja: po ustawieniu otwórz PR z gałęzi z celowo zepsutym testem i sprawdź, że przycisk **Merge** jest zablokowany.

**Czy test najpierw czerwienił się na starym kodzie?** Nie dotyczy.

## Dowód po

Ruleset `main — wymagaj zielonego CI`, id `21161479`, status Active, zakres: gałąź domyślna.
Weryfikacja z linii poleceń: `gh api repos/dominik-hvln/verris/rulesets/21161479`.

**Osiągnięty poziom dowodu:**
- [ ] D1 — nie dotyczy (nie ma kodu)
- [ ] D2 — nie dotyczy
- [ ] D3 — nie dotyczy
- [x] **D4** — powtarzalna procedura z właścicielem i datą. Właściciel: PM. Wykonane 2026-08-21.

**Stan w macierzy po:** `DZIAŁA`

Jedno zastrzeżenie do tego dowodu: reguła jest ustawiona, ale **jeszcze nie zadziałała**, bo nie było przebiegu CI. Pierwszy push pokaże, czy nazwy checków wpisane ręcznie zgadzają się co do znaku z tym, co wystawia `ci.yml`. Jeżeli się rozjadą, reguła będzie czekać w nieskończoność na check, który nigdy nie przyjdzie — i to jest jedyny realny sposób, w jaki to ustawienie może zaszkodzić. Sprawdzić przy pierwszym PR-ze.

## Rozszerzenie na gałąź wdrożeniową (2026-08-21, po decyzji PM-a)

Pierwsza wersja reguły chroniła wyłącznie `main`. Tymczasem `deploy.yml` wyzwala wdrożenie z trzech gałęzi, a realne wdrożenia szły z **`live-release-readiness`** (ostatnie 15.07). Ochrona `main` przy takim układzie nie pilnowała niczego, co faktycznie trafia na serwer.

Decyzja PM-a: **objąć regułą obie gałęzie.** Ruleset ma teraz dwa cele (`Default` + wzorzec `live-release-readiness`) i został przemianowany, bo nazwa `main — …` przestała być prawdziwa.

### Co to zmienia w codziennej pracy

Reguła „Require status checks" znaczy: *commit musi już mieć zielone checki z innego ref-a.* W praktyce:

- **Fast-forward** z zielonej gałęzi na `live-release-readiness` — przechodzi, bo commit jest ten sam i ma już zielony przebieg.
- **Nowy merge commit** utworzony lokalnie i wypchnięty — **zostanie zablokowany**, bo taki commit nie istniał nigdzie wcześniej i nie ma własnego przebiegu. To nie jest awaria, tylko działanie reguły.
- **Merge przez pull request na GitHubie** — przechodzi, bo checki liczą się dla wyniku scalenia.

Wniosek praktyczny: **scalamy przez PR albo fast-forward.** Lokalne `git merge` + `git push` na gałąź wdrożeniową przestaje być drogą na skróty. Repository admin nadal może obejść regułę świadomie, gdyby zdarzył się incydent.

## Czego to nadal nie robi

Skany bezpieczeństwa (`Security scans (gitleaks + audit + trivy)`) **nie są wymagane** do scalenia — powód w tabeli wyżej.

`master` zostaje w wyzwalaczach `deploy.yml` bez odpowiadającej reguły. W repozytorium nie ma dziś takiej gałęzi, więc nie ma czego chronić — ale jeżeli kiedyś powstanie, wdroży się bez bramki. Do rozważenia przy porządkowaniu wyzwalaczy: albo wzorzec obejmujący wszystkie trzy nazwy, albo skreślenie `master` z `deploy.yml`.

## Ryzyko i wycofanie

Ryzyko: zablokowanie sobie merge'a w sytuacji awaryjnej. Dlatego **Include administrators** zostaje wyłączone — właściciel repozytorium może obejść regułę świadomie.

Ryzyko drugie, mniej oczywiste: **ta konfiguracja nie jest w repozytorium.** Nie ma jej w żadnym pliku, nie odtworzy się z kopii kodu i nie przetrwa przeniesienia repo bez ręcznego powtórzenia. Dlatego jej treść jest przepisana wyżej w tabeli — ten plik jest jedynym miejscem w repozytorium, z którego da się ją odtworzyć.

Wycofanie: usunięcie rulesetu w tym samym miejscu.

## Wpływ na inne pozycje

Domyka sens `X-01` i `X-03`: bez tego bramka istnieje, ale jest dobrowolna.
