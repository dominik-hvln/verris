# `X-02` — Status wymagany do merge

| | |
|---|---|
| **Sprint** | 1 (2026-08-21) |
| **Priorytet** | WYSOKA |
| **Nakład** | planowany 6 h · rzeczywisty 0,5 h (opis procedury) |
| **Zależy od** | `X-01` |
| **Status** | do zrobienia — **wymaga działania PM-a w interfejsie GitHuba** |
| **Data zamknięcia** | — |

---

## Problem

Nawet z działającym CI nic nie stoi na przeszkodzie, żeby scalić gałąź z czerwonymi testami. Bramka, której da się nie zauważyć, jest sugestią, nie bramką.

## Dowód przed

```
ustawienie po stronie GitHuba (Settings → Branches), nie da się go zapisać w repozytorium
```

**Stan w macierzy przed:** `BRAK`

## Rozwiązanie

**Tego zadania nie da się zrobić kodem.** Reguły ochrony gałęzi żyją w konfiguracji repozytorium na GitHubie, nie w plikach. Nie ma ich w `.github/`, nie da się ich zacommitować i nie da się ich ustawić z tej sesji — nie mam dostępu do sieci z mostka do Twojego dysku ani uprawnień do API GitHuba.

Poniżej procedura do wyklikania. Zajmuje około dwóch minut.

### Krok po kroku

1. `https://github.com/dominik-hvln/verris` → **Settings** (zakładka na górze, po prawej)
2. Menu po lewej → **Branches**
3. **Add branch protection rule** (albo **Add classic branch protection rule**, zależnie od tego, co GitHub pokaże)
4. **Branch name pattern:** `main`
5. Zaznacz **Require status checks to pass before merging**
6. Pod spodem pojawi się pole wyszukiwania checków. **Ono zadziała dopiero po pierwszym przebiegu CI** — GitHub podpowiada wyłącznie checki, które już kiedyś wystartowały. Dlatego kolejność jest: najpierw push gałęzi `chore/audyt-i-porzadek`, potem to ustawienie.
   Wpisz i zaznacz check o nazwie **`build`** (job z `ci.yml`).
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

Zrzut ekranu reguły albo `gh api repos/dominik-hvln/verris/branches/main/protection` — do wklejenia tutaj po wykonaniu.

**Osiągnięty poziom dowodu:**
- [ ] D1 — nie dotyczy (nie ma kodu)
- [ ] D2 — nie dotyczy
- [ ] D3 — nie dotyczy
- [x] **D4 wymagane** — powtarzalna procedura z właścicielem i datą wykonania. Właściciel: PM. Data: do uzupełnienia.

**Stan w macierzy po:** `BRAK` do czasu wykonania

## Czego to nadal nie robi

Chroni tylko `main`. Gałąź `live-release-readiness`, która też wyzwala wdrożenie, zostaje bez reguły — jeżeli to nadal żywa ścieżka wdrożeniowa, potrzebuje własnej reguły albo powinna zniknąć z wyzwalaczy `deploy.yml`. Do decyzji PM-a; jeżeli zostaje, wraca jako osobna pozycja.

## Ryzyko i wycofanie

Ryzyko: zablokowanie sobie merge'a w sytuacji awaryjnej. Dlatego **Include administrators** zostaje wyłączone — właściciel repozytorium może obejść regułę świadomie.

Wycofanie: usunięcie reguły w tym samym miejscu.

## Wpływ na inne pozycje

Domyka sens `X-01` i `X-03`: bez tego bramka istnieje, ale jest dobrowolna.
