# `X-26` — Skrypt z bramki startu nie dawał się uruchomić tak, jak sam każe

| | |
|---|---|
| **Sprint** | 2 — Bramki wdrożeniowe |
| **Priorytet** | WYSOKI (blokował domknięcie `H-20`) |
| **Nakład** | S (~1 h) |
| **Zależy od** | — |
| **Status** | zamknięte |
| **Data** | 2026-08-22 |

---

## Co było nie tak

Runbook, dokumentacja `H-20` i **mail przypominający** wysyłany do administratora mówią
jednym głosem:

```bash
cd /opt/verris && ./ops/scripts/restore-drill-isolated.sh --owner "Imię Nazwisko"
```

Plik miał w gicie tryb `100644`. Na świeżym `git clone` to polecenie kończy się
**`Permission denied`**.

Czyli: procedura, którą dzień wcześniej zamieniliśmy w twardą bramkę startu sprzedaży, nie
dawała się wykonać w sposób, w jaki sama każe siebie wykonywać.

Szesnaście skryptów miało ten sam problem, w tym pięć uruchamianych na węzłach
produkcyjnych: `node-app-install`, `node-db-upgrade`, `node-offsite-backup`,
`node-php-apply`, `node-wp-install`.

## Ślad leżał w repozytorium od dawna

Dwa miejsca **obchodziły** ten błąd, zamiast go naprawiać:

```
docs/ops/RESTORE_TEST.md:26   chmod +x ops/scripts/restore-drill-isolated.sh
Dockerfile.api:100            RUN chmod +x /usr/local/bin/api-entrypoint.sh
```

Obejścia działały, więc nikt nie tknął przyczyny. Każde z nich było przy tym zapisanym
w repozytorium dowodem, że przyczyna istnieje — czekał tylko, aż ktoś przeczyta go jako
dowód, a nie jako instrukcję.

To ten sam kształt co „bramka, która raportuje zamiast bramkować" (`X-14`, `X-23`, `H-19`,
`H-20`): objaw obsłużony, przyczyna zostaje, a obsługa objawu z czasem wygląda na
normalną część procedury.

## Co jest teraz

Wszystkie 82 skrypty `.sh` w repozytorium mają tryb `100755`. `chmod +x` zniknął
z `RESTORE_TEST.md`. Pilnuje tego `apps/api/src/test/skrypty-wykonywalne.spec.ts`.

### Reguła jest bezwyjątkowa i to jest jej najważniejsza cecha

Kuszące jest zrobić listę wyjątków: „te skrypty wolno mieć nieuruchamialne, bo woła je
`bash`". Taka lista musiałaby być utrzymywana obok prawdziwych wywołań — czyli byłaby
kolejnym wystąpieniem **bliźniaczych miejsc** (`Z-12`, `Z-16`, `M-06`, `X-24`): zmiana
sposobu wywołania w jednym miejscu, lista nietknięta w drugim.

Skrypt wykonywalny działa pod `bash x.sh` tak samo dobrze. Reguła bez wyjątków nic nie
kosztuje, a lista wyjątków kosztuje uwagę przy każdej zmianie.

### Tryb z dysku, nie z indeksu gita

Liczy się to, co dostaje maszyna po `git clone`, a `actions/checkout` wypisuje pliki
dokładnie z trybami z indeksu — więc na tym, co gatuje merge, obie liczby są tą samą
liczbą. Czytanie dysku działa dodatkowo tam, gdzie kopia robocza nie jest repozytorium
(kontener budujący), i nie wymaga drugiej ścieżki kodu na wypadek braku gita.

### Kontrola, że strażnik cokolwiek widzi

Pierwszy test sprawdza, że lista ma ponad pięćdziesiąt pozycji i zawiera skrypt drilla.
Bez tego pozostałe dwa przechodziłyby trywialnie na pustej liście — gdyby `find` przestał
trafiać albo wzorzec nazwy się rozjechał, CI świeciłoby na zielono, nie sprawdzając niczego.
Ta sama lekcja co przy `Z-01` i `H-20`.

## Testy

| Warstwa | Plik | Ile |
|---|---|---|
| jednostkowe | `apps/api/src/test/skrypty-wykonywalne.spec.ts` | 3 |

**Czy czerwienią się na starym kodzie?** Tak — 1 z 3, z wypisaną listą wszystkich
szesnastu plików. To był pierwszy przebieg, przed poprawką trybów.

## Czego to nie robi

- **Nie sprawdza shebangów** ani tego, czy skrypt w ogóle da się uruchomić — tylko bit
  wykonywalności.
- **Nie usuwa `chmod +x` z `Dockerfile.api`.** Jest teraz zbędny, ale nieszkodliwy,
  a ruszanie budowania obrazu przy okazji innej poprawki to nie jest dobry moment.

## Wpływ na inne pozycje

| ID | Wpływ |
|---|---|
| `H-20` | polecenie zamykające tę pozycję działa po `git clone` — wcześniej nie działało |
| `X-14`, `X-23`, `H-19` | ta sama rodzina: obejście objawu utrwala przyczynę |
| `PB-02` | onboarding węzła używa pięciu z tych skryptów |

## Dowód po

- `apps/api/src/test/skrypty-wykonywalne.spec.ts` — 3 testy
- 82 skrypty w trybie `100755`
- `docs/ops/RESTORE_TEST.md` — obejście usunięte, dopisany obowiązkowy `--owner`

**Osiągnięty poziom dowodu:**
- [x] D1 · [x] D2 · [ ] D3 · [ ] D4

**Stan w macierzy:** `DZIAŁA` / `PARYTET`
