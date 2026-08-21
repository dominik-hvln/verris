# Dokumentacja Verris

Uporządkowana 2026-08-21, po audycie parytetu funkcji. Wcześniej w korzeniu repozytorium leżało 31 dokumentów, z których 20 opisywało stan produktu z maja–lipca 2026 — wzajemnie sprzecznie. Przegląd wykazał 13 sprzeczności i powtarzalny wzorzec nadawania statusu „DONE" bez uruchomienia testów. Ta struktura ma jeden cel: **żeby dało się odpowiedzieć na pytanie „jak jest teraz" bez czytania dziesięciu plików i zgadywania, który jest najświeższy.**

## Gdzie czego szukać

| Pytanie | Miejsce |
|---|---|
| Jak jest **teraz** z funkcją X? | `audyt/dane/macierz.csv` — stan, dowód `plik:linia`, werdykt wobec rynku |
| Co robimy w tym tygodniu? | `plan-startowy-2026-08/PLAN_SPRINTOW_2026-08.md` |
| Dlaczego zadanie Y zrobiono właśnie tak? | `docs/zadania/<ID>-*.md` |
| Co się wydarzyło w sprincie N? | `docs/sprinty/SPRINT-NN.md` |
| Jak coś wdrożyć albo naprawić na produkcji? | `DEPLOY.md` w korzeniu, dalej `docs/ops/` |
| Co sprawdzić na pierwszym węźle, żeby zdobyć dowód D3? | `docs/ops/CHECKLISTA_D3_PIERWSZY_WEZEL.md` |
| Dlaczego architektura wygląda tak, a nie inaczej? | `docs/architektura/` |
| Jak było kiedyś? | `docs/archiwum/` — **nic stamtąd nie jest aktualne** |

## Struktura

```
DEPLOY.md              runbook control-plane — jedyny dokument operacyjny w korzeniu,
                       bo odsyła do niego sam kod (stripe.client.ts, rotate-kms.ts, vpn.service.ts)
LOCAL_DEV.md           uruchomienie monorepo lokalnie
BACKLOG_PRZED_STARTEM.md  indeks backlogu — wskazuje na macierz i plan

audyt/                 ŹRÓDŁO PRAWDY o stanie produktu (dane + generator)
audyt-parytetu-2026-08/   widoki audytu — generowane, nie edytuj ręcznie
plan-startowy-2026-08/    widoki planu + AKTUALIZACJA_AUDYTU.md — generowane

docs/
  zadania/       jeden plik na zadanie z backlogu — z tego składa się dokumentacja techniczna
  sprinty/       podsumowanie każdego sprintu
  architektura/  decyzje projektowe, które nadal obowiązują
  ops/           runbooki, checklisty, procedury operacyjne
  legal/         RODO, RCPD, DPA, analizy prawne, audyt dostępności
  archiwum/      zapisy stanu z przeszłości — wartość wyłącznie historyczna
```

## Zasady

**Dokument opisujący stan ma datę i wygasa.** Dokument starszy niż 30 dni traci status dowodu i wraca do poziomu D0. Jedynym miejscem, gdzie stan jest utrzymywany na bieżąco, jest macierz audytu — reszta to procedury, decyzje albo historia.

**Dokumentacja powstaje razem z pracą, nie po niej.** Każde zadanie ma plik w `docs/zadania/` — sekcje „Problem" i „Dowód przed" wypełniane **przed** rozpoczęciem, reszta w trakcie. Szkielety generuje `python3 audyt/generate.py --zadania <sprint>`, wypełniając od razu to, co wiadomo z macierzy.

**Rzeczy generowane nie są edytowane ręcznie.** Dotyczy XLSX-ów i obu dashboardów. Zmiana idzie do `audyt/dane/`, potem `python3 audyt/generate.py`. Ręczna poprawka w wyniku zniknie przy następnym uruchomieniu i zostawi rozjazd, którego nikt nie zauważy.

**Archiwum nie jest koszem.** Trafiają tam dokumenty, które opisywały stan w danym momencie i mają wartość jako zapis, jak myśleliśmy. Każdy dostał nagłówek mówiący, co go zastępuje. Nic nie zostało usunięte.

## Co przetrwało porządkowanie i dlaczego

Z 31 plików w korzeniu: **2 zostały** (`DEPLOY.md`, `LOCAL_DEV.md` — żywe procedury), **6 przeszło do `docs/ops/`**, **3 do `docs/architektura/`**, **20 do `docs/archiwum/`**. Zero usuniętych.

Przed archiwizacją uratowano cztery fragmenty, które były jedynym miejscem opisu:

- **`docs/architektura/DECYZJE_PRODUKTOWE.md`** — utrwalone decyzje (CloudLinux + LiteSpeed + DirectAdmin, Stripe→PayU, model portfel + subskrypcja, LVE `ep`/`nproc`, 1 control-plane + N węzłów, 3 osobne panele). Uratowane z `PROJECT_STATUS.md`.
- **`docs/architektura/ZASADY_ZMIANY_PLANU.md`** — reguły proracji i źródeł płatności przy upgrade/downgrade. Uratowane z `PLAN_CHANGE_SPRINT_PLAN.md`, potwierdzone w kodzie podczas audytu.
- **`docs/architektura/MODULY_PRZEWAGI.md`** — katalog pomysłów `V-01…V-18`. Uratowane z `ROADMAP_GAPS.md`.
- **`docs/ops/PLAN_TESTOW_CYBER.md`** — lista CYBER-1…11. Uratowane z `PRODUCTION_READINESS_2026-07.md`.

Dwa fragmenty, które wskazano jako „do uratowania", **nie zostały przeniesione** — audyt wykazał, że są nieprawdziwe: opis migracji z `ROADMAP_GAPS.md` §9 („tylko zgłoszenie + backup + ticket") jest nieaktualny, bo migracja działa z rsync, mysqldump i delta-syncem; opis KSeF z `PRODUCTION_READINESS_2026-07.md` („FA(2)/KSeF 1.0") też, bo moduł generuje FA(3) i rozmawia z API v2. Przenoszenie ich utrwaliłoby błąd.
