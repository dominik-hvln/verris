# `S1-WIP` — Domknięcie niezacommitowanych prac z 25–26 lipca

| | |
|---|---|
| **Sprint** | 1 (2026-08-21) |
| **Priorytet** | WYSOKA (7 pozycji macierzy) |
| **Nakład** | planowany 0 h (praca nieplanowana) · rzeczywisty 6 h |
| **Zależy od** | — |
| **Status** | zrobione |
| **Data zamknięcia** | 2026-08-21 (commit `6f2833d`) |
| **Zamyka pozycje** | `B-02`, `D-04`, `D-05`, `D-06`, `D-07`, `D-11`, `E-14` |

---

## Problem

W drzewie roboczym leżał miesiąc pracy, której nikt nie zacommitował. To nie jest sprawa porządkowa — **audyt opisał część tych rzeczy jako defekty produktu**. Siedem pozycji miało w macierzy stan `ATRAPA`: interfejs woła adres, którego nie rejestruje żaden kontroler, więc kliknięcie kończy się 404.

Gdyby ta praca została uznana za martwy kod i usunięta, straciłoby się miesiąc gotowej roboty i wciąż miało siedem luk. Gdyby została zacommitowana bez uzupełnienia — siedem funkcji dalej nie działa, tylko teraz w historii.

Osobno, i gorzej: **API w ogóle się nie kompilowało**. Lipcowy kod używał dziewięciu stałych dziennika audytu, których nie było w `HostingResourceActions` (obiekt `as const`, więc `TS2339`, twardy błąd). To zamknięte osobnym commitem `f324267` przed całą resztą, bo bez tego nie dało się nawet uruchomić testów.

## Dowód przed

Przykład wzorca — panel woła, kontroler nie odpowiada:

```
apps/client-panel/.../hosting-db-users-actions.ts:14
  apiFetch(`/services/${id}/hosting-db-users`)     → 404
apps/api/src/subscriptions/services.controller.ts
  (brak jakiejkolwiek trasy hosting-db-users)
```

Najciekawszy przypadek to `D-11` — SSO do phpMyAdmina. Front miał fallback:

```
apps/client-panel/src/components/hosting/DatabasesTab.tsx:65
  → „Auto-logowanie niedostępne"
```

Czyli **404 nie było widać w zgłoszeniach**. Klient widział grzeczny komunikat i logował się ręcznie. Funkcja była w cenniku, w kodzie serwisu (`directadmin.service.ts:1977`) i nie działała od tygodni, a nikt tego nie zgłosił.

**Stan w macierzy przed:** 7 × `ATRAPA`, wszystkie `LUKA` / `WYSOKA`

## Rozwiązanie

Najpierw przegląd całego drzewa i pogrupowanie zmian, bo bez tego nie dało się odróżnić pracy skończonej od porzuconej. Siedem grup:

| | Grupa | Stan zastany | Co zrobiłem |
|---|---|---|---|
| **A** | Przywracanie off-site | kompletne | zacommitowane razem z migracją |
| **B** | Menedżer plików: kopiuj/przenieś/rozpakuj/chmod | kompletne, ale nie kompilowało się | 9 brakujących stałych (`f324267`) |
| **C** | Użytkownicy MySQL | UI bez 4 tras | dopisane 4 trasy |
| **D** | SSO klienta (phpMyAdmin, webmail) | UI bez 1 trasy | dopisana 1 trasa |
| **E** | PHP per domena | UI bez 2 tras | dopisane 2 trasy + zmiana w UI |
| **F** | SSO admina do DirectAdmina węzła | kompletne | zacommitowane |
| **G** | `ops/scripts/verris-node.sh` | samodzielne | zacommitowane + opis w bazie wiedzy |

Razem **7 nowych tras** w `services.controller.ts`, wszystkie mutujące z `@RateLimit` i wpisem do dziennika audytu.

**Migracja i schemat razem.** `20260718120000_offsite_restore` dodaje `OFFSITE_RESTORE` do `NodeTaskKind`, co odpowiada zmianie w `schema.prisma:615`. Jedno bez drugiego nie wystartuje, więc oba są w tym samym commicie. Rozdzielenie ich byłoby ładniejsze w historii i zepsute w praktyce.

**Decyzja produktowa przy grupie E.** Ustawienie PHP per domena wygrywa nad ustawieniem konta — tak działa DirectAdmin i tak zostaje. Ale skoro wygrywa, interfejs musi to pokazywać, inaczej klient zmienia PHP na koncie, nic się nie dzieje na jego stronie i pisze zgłoszenie. Dlatego `php-client.tsx` dostał komponent `DomainPhpOverridesNote`: przy karcie PHP konta wypisuje domeny, które mają własną wersję. Bez tego trasa działa, a produkt myli.

## Strażnik klasy błędu

Siedem pojedynczych testów zamknęłoby siedem przypadków i nie zapobiegło ósmemu. Powstał więc test, który sprawdza **całą klasę**:

`apps/api/src/test/ui-routes-coverage.spec.ts`

Analiza statyczna — nie importuje kontrolerów, więc nie potrzebuje klienta Prismy ani kontenera DI i działa w każdym środowisku:

1. zbiera każde wywołanie `apiFetch(\`/...\`)` z trzech paneli,
2. zbiera każdą trasę z kontrolerów (prefiks `@Controller` + ścieżka `@Get/@Post/...`),
3. normalizuje parametry (`:id`, `${x}` → `:p`) i odcina doklejone query stringi,
4. porównuje zbiory i wypisuje sieroty razem z plikiem, z którego pochodzą.

Test ma **własny bezpiecznik**: sprawdza, że złapał ponad 100 tras i ponad 100 wywołań. Bez tego zepsuty regex dawałby zielone światło na pustym zbiorze — czyli test udający, że pilnuje.

**Czy test najpierw czerwienił się na starym kodzie?** **TAK, i to jest tutaj najmocniejszy dowód.** Uruchomiony bez dopisanych tras wskazuje dokładnie pięć wzorców, których brakowało:

```
/services/:p/hosting-db-users
/services/:p/hosting-db-users/password
/services/:p/hosting-db-users/remove
/services/:p/hosting-domain-php
/services/:p/hosting-sso-url
```

## Zmienione pliki

35 plików. Najważniejsze:

| Plik | Co się zmieniło |
|---|---|
| `apps/api/src/common/audit/audit.actions.ts` | 9 stałych — bez nich API się nie kompilowało (commit `f324267`) |
| `apps/api/src/subscriptions/services.controller.ts` | 7 nowych tras |
| `apps/api/src/test/ui-routes-coverage.spec.ts` | nowy — strażnik pokrycia tras |
| `apps/client-panel/src/app/dashboard/php/php-client.tsx` | `DomainPhpOverridesNote` |
| `libs/database/prisma/schema.prisma` | `OFFSITE_RESTORE` w `NodeTaskKind` |
| `libs/database/prisma/migrations/20260718120000_offsite_restore/` | migracja do powyższego |
| `ops/scripts/verris-node.sh` | nowy — `list` / `info` / `ssh` / `exec` po inwentarzu z bazy |

Migracje bazy: `20260718120000_offsite_restore`
Zmienne środowiskowe: brak

## Dowód po

`services.controller.ts` — trasy `hosting-db-users`, `hosting-db-users/remove`, `hosting-db-users/password`, `hosting-sso-url`, `hosting-domain-php` (GET i POST)

**Osiągnięty poziom dowodu:**
- [x] D1 — kod istnieje
- [x] D2 — `ui-routes-coverage.spec.ts` zielony, sprawdzony też w drugą stronę
- [ ] D3 — do wykonania po wdrożeniu: kliknąć każdą z 7 funkcji na produkcji i zapisać datę
- [ ] D4 — nie dotyczy

**Stan w macierzy po:** 7 × `DZIAŁA`, werdykt `PARYTET`

## Czego to nadal nie robi

Strażnik pilnuje wyłącznie wywołań przez `apiFetch` z szablonem literalnym. Adres sklejony ze zmiennej (`const url = base + '/x'; apiFetch(url)`) jest dla niego niewidoczny. Świadome uproszczenie: w obecnym kodzie takich wywołań nie ma, a rozszerzanie analizy o pełne AST kosztowałoby wielokrotnie więcej niż daje. Jeżeli taki wzorzec się pojawi, test o tym nie powie — dlatego lepiej go nie wprowadzać.

Strażnik nie sprawdza też metody HTTP ani kształtu ciała żądania. Trasa `POST` odpowiadająca wywołaniu `GET` przejdzie. To osobna, większa robota (kontrakty), nie ten sprint.

## Ryzyko i wycofanie

Największe ryzyko to migracja: `20260718120000_offsite_restore` doda wartość do enuma w produkcyjnej bazie. Operacja jest addytywna i nieodwracalna bez ręcznej migracji w dół — wartości z enuma PostgreSQL nie da się po prostu usunąć, gdy istnieją wiersze jej używające. Ryzyko praktyczne jest małe (nowa wartość, nikt jej jeszcze nie zapisuje), ale warto wiedzieć, że cofnięcie tego commita nie cofa zmiany w bazie.

Trasy: wycofanie przez usunięcie. Bez skutków dla danych — wszystkie operacje idą do DirectAdmina i są odwracalne z jego strony.

## Wpływ na inne pozycje

- Zamyka `B-02`, `D-04`, `D-05`, `D-06`, `D-07`, `D-11`, `E-14` — z `ATRAPA`/`LUKA` na `DZIAŁA`/`PARYTET`.
- `H-16` i `H-17` **zostają otwarte**. Grupa A domknęła przywracanie off-site na ten sam węzeł; odtworzenie konta na **inny** węzeł nadal istnieje wyłącznie jako procedura operatorska, nie funkcja produktu.
- Nie tworzy nowych pozycji.
