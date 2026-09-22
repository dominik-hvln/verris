# Dokumentacja Verris — gdzie czego szukać

| Pytanie | Gdzie |
|---|---|
| Co jest zrobione, co otwarte, jakim dowodem? | `audyt/dane/macierz.csv` (dashboard: `audyt-parytetu-2026-08/`) |
| Co robimy w którym sprincie? | `audyt/dane/sprinty.csv`, `audyt/dane/zadania_pb.csv` (dashboard: `plan-startowy-2026-08/`) |
| Dlaczego tak zdecydowaliśmy, dokąd idzie produkt? | **`docs/VERRIS.md`** |
| Jak coś wdrożyć, odtworzyć, obsłużyć? | `docs/ops/`, `DEPLOY.md`, `LOCAL_DEV.md` |
| Dokumenty prawne, szablony maili, marka | `docs/legal/`, `docs/mail/`, `docs/brand/` |
| Historia (zadania, sprinty, ADR-y, analizy do 2026-09-22) | `docs/archiwum/` — tylko do wglądu, nie źródło prawdy |

Zasada od 2026-09-22: **nie tworzymy nowych plików z opisami.** Uzasadnienie zmiany → „Uwagi"
w macierzy, decyzja → nowa sekcja w `docs/VERRIS.md`. Widoki przebudowuje `python3 audyt/generate.py`.
