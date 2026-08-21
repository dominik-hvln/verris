# Backlog przed startem LIVE — Verris

Stan na 2026-06-17. Pogrupowane wg priorytetu i obszaru. Oznaczenia:
**[P0]** bloker startu · **[P1]** ważne na start · **[P2]** zaraz po starcie.

---

## A. Konfiguracja produkcyjna (P0 — bez tego funkcje nie działają)

- **[P0] LiteSpeed — licencja produkcyjna** na węźle (trial wygasł; bez niej strony i Let's Encrypt nie działają). Do testów: shared/trial; do LIVE: oficjalna.
- **[P0] Zmienne env na prod:** `STRIPE_SECRET_KEY=sk_live_…` + `STRIPE_WEBHOOK_SECRET`, `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGINS` (✅ ustawione), `HETZNER_API_TOKEN` (VPS), `WEBMAIL_URL` (webmail), `OPENPROVIDER_*` (rejestracja domen).
- **[P0] Certy TLS** dla paneli — potwierdzić auto-odnawianie Caddy (był warn „<7 dni").
- **[częściowo] Treści Bazy Wiedzy (KB)** — seed 13 startowych artykułów PL gotowy (`pnpm --filter api cli:seed-kb`), zasila podpowiedzi KB + sugestie AI (keyword-fallback, bez embeddingów). Admin może dopisać kolejne w panelu. Do uruchomienia na prod.
- **[P1] Dane firmy + KSeF** (sprzedawca, NIP) — wymagane na fakturach; potwierdzić w „Gotowość LIVE".

## B. Funkcje — dopięcie zarządzania usługą (P1)

Cel: 100% zarządzania w panelu (jak najlepsza konkurencja), bez wychodzenia do DA.

- **[P1] Skrzynki e-mail w panelu** — tworzenie/usuwanie/zmiana hasła (dziś link do DA). Analogicznie do baz MySQL.
- **[P1] Cron w panelu** — dodawanie/edycja/usuwanie zadań (dziś tylko lista). 
- **[P1] Konta FTP w panelu** — tworzenie/usuwanie (endpointy gotowe; dołożyć formularz w zakładce).
- **[P1] Użytkownicy baz MySQL** — zarządzanie userami i uprawnieniami (dziś tylko baza+user przy tworzeniu).
- **[✅ zrobione] Subdomeny** — tworzenie/usuwanie w zakładce Domeny&DNS (z audytem).
- **[częściowo] Menedżer plików — rozszerzenia:** ✅ nowy pusty plik; pozostaje kopiuj/przenieś, wielozaznaczenie, rozpakuj ZIP, podgląd uprawnień (wymagają nowych komend DA — weryfikacja na żywo).
- **[P2] Przekierowania/aliasy domen, „parked domains”.**

## C. Bezpieczeństwo (P0/P1)

- **[✅ zrobione] CVE-2025-29927 (Next.js middleware bypass)** — Next 15.2.0 podatny; podbito wszystkie panele do 15.2.3. Wymaga `pnpm install` + rebuild + deploy.
- **[✅ zrobione] Limit pobierania pliku** — cap 100 MB z pre-checkiem rozmiaru (ochrona pamięci kontenera).
- **[✅ zrobione] Blokada mutacji na koncie SUSPENDED/DELETED** — w `daFormForSubscription` (email/FTP/cron/subdomeny/bazy).

- **[✅ zrobione] Audyt destrukcyjnych akcji** — wpisy AuditLog dla: utworzenie/usunięcie bazy, konta FTP, skrzynki, zadania cron oraz zapis/zmiana nazwy/usunięcie/upload plików (`HostingResourceActions`). Widoczne w logu audytu admina.
- **[P1] Rate-limit na nowych endpointach** hostingowych (DB create/delete, file ops mają limit; dołożyć dla DB/FTP/cron mutacji).
- **[P1] Przegląd CSP po włączeniu** — sprawdzić w konsoli, czy nic nie blokuje (Stripe/webmail) po wdrożeniu.
- **[P1] `npm audit` / przegląd zależności** + aktualizacje krytyczne przed startem.
- **[P1] Weryfikacja izolacji kont** — czy operacje per-usługa są twardo ograniczone do właściciela (sprawdzone w plikach: sandbox + ownership; powtórzyć dla DB/FTP/mail).
- **[P2] 2FA/passkey dla klientów** (opcjonalne wymuszenie), polityka haseł.
- **[P2] Skan bezpieczeństwa** (nagłówki — ✅, TLS, otwarte porty węzła) skryptem `prod-live-acceptance.sh` + `diag-domain.sh`.

## D. Stabilność i niezawodność (P0/P1)

- **[✅ zrobione] Intermittentne 503/502** — zdiagnozowane: NIE przeciążenie (panel 1% RAM, 0 OOM/restartów, 20 równoległych POST = 307). Przyczyna: okno restartu przy deployu + skanery/boty. Mitygacja w Caddy: `lb_try_duration 10s` (retry do upstreamu podczas restartu) + blok skanerów (PHP/.env/.git/wp/xmlrpc → 403). Opcjonalnie później: zero-downtime/rolling deploy.
- **[✅ zrobione] Spójna obsługa błędów DA** — helper `daErrorMessage` mapuje typowe błędy DA na przyjazne komunikaty PL; zastosowany w hubie (DB/FTP/cron/mail/backupy) i menedżerze plików. Pozostaje monitoring (Sentry).
- **[P1] Naprawa resztkowego błędu tsc** `vps-client.tsx` (`sshKeyIds`) — niezwiązany z Prisma, realny do poprawienia.
- **[P1] Monitoring błędów** (np. Sentry) dla API i paneli — łapanie wyjątków na produkcji.
- **[P1] Drill przywracania backupu** (restore) — potwierdzić, że kopie offsite da się odtworzyć.
- **[P2] Testy obciążeniowe** podstawowych ścieżek (login, zamówienie, panel) + limity puli połączeń DB.
- **[P2] Po `prisma migrate deploy` + `db:generate`** — pełny `pnpm typecheck && build && test` musi przejść bez błędów (dziś błędy = nieaktualny klient Prisma).

## E. QA / dopięcie przed startem (P1)

- **[P1] Pełny przebieg E2E na żywym koncie** (po licencji LiteSpeed): zamówienie → provisioning → strona działa → SSL → WordPress → poczta → DB → pliki.
- **[P1] Sprzątnięcie danych testowych** (ticket #1F4CEEA7, konto `test-live-verris.pl`, zakup dodatku) przed startem.
- **[P1] Dokończyć QA huba na żywo:** zapis/upload pliku, scalona zakładka Aplikacje (po redeployu), Kopie zapasowe, Domeny&DNS, WAF/Monitoring/Staging/Deploy.
- **[P2] Onboarding e-mail/komunikaty** — przegląd treści maili transakcyjnych.

---

## Zrobione w tej sesji (kontekst)
P-4 menedżer plików (działa na żywo), P-7 oszczędności roczne, P-8 dodatki, reorganizacja nawigacji (hub usługi), BUG-1 domeny w kaflu, naprawa passkey + #418, FTP `domain`, zarządzanie bazami MySQL w panelu (create/delete).


---

# AKTUALIZACJA 2026-08-21 — po audycie parytetu funkcji

Sekcje A–E powyżej pochodzą z 2026-06-17 i **są nieaktualne**. Audyt z 2026-08-20 sprawdził każdą z tych pozycji w kodzie; część oznaczona tam jako „P1 do zrobienia" okazała się mieć gotowy backend bez UI, a część oznaczona jako zrobiona — działać tylko pozornie. Nie usuwam tamtych sekcji, bo są zapisem stanu wiedzy z czerwca. **Obowiązuje to, co poniżej.**

Pełne materiały: `audyt-parytetu-2026-08/` (macierz 352 pozycji, raport, dashboard) i `plan-startowy-2026-08/` (plan 19 sprintów, backlog, dashboard postępu).

**Zasada aktualizacji:** każdy sprint kończy się aktualizacją macierzy audytu — stan, dowód `plik:linia`, data. Procedura: `plan-startowy-2026-08/AKTUALIZACJA_AUDYTU.md`.

---

## Z. Blokery startu z audytu (P0)

Definicja blokera: bez tego nie można sprzedać pierwszego konta. Każda pozycja spełnia co najmniej jeden warunek — utrata danych klienta bez ścieżki odtworzenia, niezgodność z prawem, brak możliwości wystawienia poprawnego dokumentu księgowego, brak możliwości zatrzymania szkody przez operatora.

- **[P0] `Z-02` Blokada zamówienia usługi bez opłaty przez klienta** — sprint 1 · 6 h. Dowolne konto po rejestracji zamawia nieograniczoną liczbę aktywnych usług za 0 zł, bez faktury i bez śladu płatności. Ta sama luka jest zamknięta przy zmianie planu (plan-change.service.ts:206-213), ale nie pr
- **[P0] `Z-04` Guard uprawnień subkont — domyślna odmowa** — sprint 2 · 6 h. Subkonto zaproszone wyłącznie z uprawnieniem TICKETS_READ może wydawać środki z portfela właściciela i kupować VPS na jego rachunek. Guard musi domyślnie odmawiać, nie zezwalać.
- **[P0] `Z-03` Walidacja danych migracji przed użyciem w poleceniu powłoki** — sprint 2 · 16 h. Wykonanie dowolnego polecenia jako root na węźle hostingowym, z formularza migracji w panelu klienta. Jeden klient przejmuje węzeł i wszystkie konta pozostałych. Ta sama klasa błędu w node-wp-install.sh:132 i n
- **[P0] `Z-06` Klucz idempotencji obciążenia za dodatek** — sprint 2 · 6 h. Podwójne kliknięcie, ponowienie przeglądarki albo timeout = do 10 obciążeń za ten sam dodatek w godzinę. Bez ścieżki zwrotu w systemie, bo nie ma ani refundu, ani korekty faktury.
- **[P0] `Z-05` Odporność webhooka płatności na błąd w trakcie obsługi** — sprint 3 · 16 h. Klient zapłacił, saldo się nie pojawiło, system uważa zdarzenie za obsłużone i odrzuca ponowienia. Odzysk wyłącznie ręcznie w bazie — brak endpointu do ponownego przetworzenia.
- **[P0] `Z-01` Faktura VAT dla płatności portfelem (część)** — sprint 4 · 30 h. Klient płaci realnie i nie dostaje ŻADNEGO dokumentu księgowego. Brak obejścia w systemie — operator nie wystawi faktury ręcznie. Poważniejsze niż brak korekt: te dotyczą dokumentów, których w ogóle się nie wys
- **[P0] `P-15` Podpisane DPA z subprocesorami (część)** — sprint 5 · 8 h. POTWIERDZONE jako bloker, dowód poprawiony: tracker istnieje (wcześniejszy zapis „brak w repo” był fałszywy), ale ani jedno DPA nie jest podpisane — Stripe, dostawca VPS, dostawca backupu off-site, OpenProvider
- **[P0] `M-06` FAKTURA KORYGUJĄCA (część)** — sprint 6 · 30 h. pierwszy zwrot, pierwsza rezygnacja w trakcie okresu, pierwsza literówka w NIP — i operator wychodzi poza system
- **[P0] `H-20` Test odtworzeniowy z datą ostatniego wykonania** — sprint 8 · 16 h. POTWIERDZONE jako bloker. Runbook wymaga drilla przed LIVE (OFFSITE_RESTORE_RUNBOOK.md:37-40) i nie ma w repo śladu jego wykonania. Backupy i DR wymagają poziomu D4 — data, wynik, właściciel. Bez tego cała wars
- **[P0] `M-17` KSeF — walidacja XSD przed wysyłką** — sprint 17 · 6 h. smoke na api-test MF nie został wykonany
- **[P0] `M-16` KSeF — tryb offline/awaryjny** — sprint 17 · 16 h. awaria KSeF zostawia fakturę w PENDING, bez kodu QR offline

## Z-BIZ. Blokery biznesowe spoza audytu (P0)

- **[P0] `PB-01` Unit economics węzła vs cena 39 zł/mies.** — sprint 1 · 8 h. Policzyć pełny koszt węzła: serwer + CloudLinux + LiteSpeed + DirectAdmin + Imunify + backup S3 + amortyzacja wsparcia. Wyliczyć próg rentowności w kontach na węzeł i marżę przy 39 zł.
- **[P0] `PB-13` Decyzja: własny KSeF czy integracja z programem księgowym** — sprint 13 · 6 h. Porównać dwie ścieżki: dokończenie własnego modułu KSeF (tryb offline, walidacja XSD, UPO) kontra przekazanie fakturowania do programu księgowego z gotową integracją KSeF. Kryteria: koszt, czas, ryzyko zgodnośc
- **[P0] `PB-03` Finalizacja dokumentów prawnych 1.0.0** — sprint 15 · 16 h. Regulamin, polityka prywatności, SLA, DPA, polityka cookies — wyjście z DRAFT-u, wersjonowanie i publikacja w panelu.
- **[P0] `PB-05` Test end-to-end „pierwszy klient”** — sprint 19 · 16 h. Przejście całej ścieżki na produkcji jako realny klient: rejestracja, zakup, płatność, provisioning, migracja strony, wystawienie faktury, KSeF, backup, odtworzenie.
- **[P0] `PB-12` Runbook startu i decyzja GO** — sprint 19 · 8 h. Domknięcie: przegląd wszystkich blokerów z dowodem zamknięcia, decyzja GO/NO-GO zapisana z datą.

## KSeF — decyzja z 2026-08-21

KSeF przesunięty na **sprinty 17–18, tuż przed uruchomieniem sprzedaży**. Powód: możliwe, że fakturowanie przejmie program księgowy z gotową integracją, zamiast dokończenia własnego modułu. Rozstrzyga `PB-13` w sprincie 13.

Stan modułu na dziś (sprawdzone w kodzie): generuje **FA(3)**, rozmawia z **API v2**, ma pełne uwierzytelnianie tokenem, sesję online i poprawne szyfrowanie. Wcześniejsza notatka o FA(2)/KSeF 1.0 była nieaktualna. Brakuje: walidacji XSD, trybu offline, UPO w panelu, testów klienta transportowego.

**Odsunięcie w czasie nie zmienia tego, że bez KSeF nie wolno sprzedawać** — pozycje `M-16` i `M-17` pozostają blokerami, tylko z późniejszym terminem.

## Funkcje-widma (P1) — 30 pozycji

Najlepszy stosunek wartości do pracy w całym backlogu: backend albo UI już istnieje, brakuje połączenia.

- **Endpoint bez UI (14)** — kontroler działa, żaden panel go nie woła: zawieszenie i odwieszenie usługi, odtworzenie konta przez operatora, pobranie UPO, tworzenie incydentu na status page, zdjęcie cordonu wysyłki, odnowienie domeny przez klienta, eksport CSV portfela, cały panel Product Ops.
- **UI bez endpointu (16)** — przycisk woła trasę, której nie rejestruje żaden kontroler: użytkownicy MySQL (4 operacje), PHP per domena, SSO do phpMyAdmin i webmaila. Uwaga: SSO ma **cichy fallback** — użytkownik widzi „Auto-logowanie niedostępne" i uznaje to za awarię, więc nie zgłasza.
- **Komponenty osierocone** — kompletny edytor rekordów DNS i panel diagnostyki dostarczalności poczty nie są przez nic importowane, a endpointy pod nimi działają.
- **Kod wyłączony** — kreator stron WWW, 1612 linii zakomentowanych w nawigacji i renderze. Decyzja binarna: dokończyć albo usunąć.

## Korekty do sekcji z czerwca

- „Użytkownicy baz MySQL" (sekcja B) — to **nie jest** brak funkcji. UI ma cztery operacje, serwis jest gotowy, **kontroler nie istnieje** — każde kliknięcie kończy się 404.
- „Konta FTP w panelu" (sekcja B) — tworzenie i usuwanie **działa**. Brakuje zmiany hasła istniejącego konta, czego sekcja z czerwca nie wychwyciła.
- „Cron w panelu" (sekcja B) — dodawanie i usuwanie **działa**. Brakuje edycji i wyboru wersji PHP.
- „Menedżer plików" (sekcja B) — kopiuj, przenieś, wielozaznaczenie, rozpakuj i uprawnienia **działają**. Brakuje **spakowania** do archiwum.
- „Drill przywracania backupu" (sekcja D) — nadal niewykonany. To **bloker** (`H-20`), nie P1. Backup bez potwierdzonego odtworzenia nie jest backupem.
- „Rate-limit na nowych endpointach" (sekcja C) — istnieje, ale **nie ma ani jednego testu**, a `Z-02` pokazuje, że `POST /subscriptions` nie ma go wcale.
- „Weryfikacja izolacji kont" (sekcja C) — wykonana i **wypadła źle**: guard uprawnień subkont domyślnie przepuszcza (`Z-04`), więc subkonto może wydawać środki właściciela.

## Czego w czerwcu nie było na liście, a jest krytyczne

Sześć ustaleń z passu adwersaryjnego, każde zweryfikowane w kodzie:

1. **Klient płacący portfelem nie dostaje żadnej faktury** (`Z-01`). Faktura powstaje wyłącznie ze zdarzeń Stripe `invoice.*`; wszystkie obciążenia portfela omijają `InvoicesService`. Brak obejścia w systemie.
2. **Dowolne konto zamawia hosting za 0 zł** (`Z-02`). `POST /subscriptions` bez `@Roles`, DTO przyjmuje `paymentSource=MANUAL`.
3. **Formularz migracji pozwala wykonać polecenie jako root na węźle** (`Z-03`). `eval` z nazwą bazy i `lftp -e` ze ścieżką, walidacja to wyłącznie `@MaxLength`.
4. **Guard uprawnień subkont domyślnie przepuszcza** (`Z-04`). Trasy `addons` i `vps` zdejmują środki z portfela właściciela.
5. **Błąd w obsłudze webhooka gubi wpłatę** (`Z-05`). Zdarzenie oznaczone jako obsłużone przed handlerem, ponowienia odrzucane.
6. **Dodatek można obciążyć 10× pod rząd** (`Z-06`). `Date.now()` w kluczu idempotencji.

## Kamienie milowe

| Data | Co |
|---|---|
| 2026-09-11 | Faza 0 zamknięta — koniec luk, przez które wyciekają pieniądze i dane |
| 2026-10-16 | **Wszystkie blokery poza KSeF zamknięte** |
| 2026-11-27 | Funkcje-widma odzyskane, luki pierwszego tygodnia domknięte |
| 2026-12-25 | KSeF domknięty (albo zastąpiony integracją z księgowością) |
| 2027-01-01 | Decyzja GO — realnie połowa stycznia 2027 |


---

## Uratowane z `RAPORT_TESTOW_LIVE_2026-06-17.md` (archiwizacja 2026-08-21)

Raport testów z czerwca poszedł do `docs/archiwum/`, ale zawierał sześć otwartych znalezisk i listę śmieci na produkcji, których nigdzie indziej nie ma. Statusy pochodzą z czerwca — **każdą pozycję trzeba zweryfikować przed zamknięciem**, bo dokładnie ten wzorzec („naprawione, czeka na redeploy") audyt wskazał jako niewiarygodny.

### Znaleziska z testów LIVE

- **[P2] React #418 na loginie** — hydration mismatch, przyciski passkey renderowane różnie na serwerze i kliencie. Czerwiec: „naprawione w kodzie (guard `mounted` w 3 panelach), czeka na redeploy". Do potwierdzenia na produkcji.
- **[P2] Baza wiedzy pusta na produkcji** — endpoint podpowiedzi KB zwraca 200, ale nie ma treści. Zamyka to zadanie `PB-09` w sprincie 17 (20 artykułów startowych).
- **[P1] Intermittentne 503 na server-action POST** — zakup dodatku i kb-suggest przy równoległych wywołaniach. Po ponowieniu przechodzi. Czerwiec: „bez skutków finansowych". **To twierdzenie jest teraz podejrzane** — audyt znalazł `Z-06` (klucz idempotencji z `Date.now()`), więc ponowienie mogło obciążać portfel wielokrotnie. Zweryfikować przy `Z-06` w sprincie 2.
- **[P2] VPS i webmail wyłączone na produkcji** — brak `HETZNER_API_TOKEN` i `WEBMAIL_URL`. Odpowiada pozycji `Q-06` w macierzy (stan `FLAGA`).
- **[P3] Licznik portfela w nagłówku nie odświeża się** po zakupie dodatku — poprawne saldo dopiero po nawigacji.
- **[P3] SLA niewidoczne w widoku ticketu.**

### Dane testowe zostawione na produkcji — do sprzątnięcia

Sprawdzić i usunąć **przed** zadaniem `PB-05` (przejście ścieżki pierwszego klienta), inaczej zaśmiecą wynik:

- Ticket „[TEST LIVE] Weryfikacja priorytetu wsparcia premium" (#1F4CEEA7).
- Konto próbne `test-live-verris.pl` (Starter, trial do 17.07.2026).
- Aktywny zakup dodatku „Priorytetowe wsparcie".

---

## Gdzie co teraz leży

Repozytorium uporządkowane 2026-08-21. Ten plik jest **indeksem**, nie źródłem prawdy.

| Czego szukasz | Gdzie |
|---|---|
| Aktualny stan funkcji | `audyt/dane/macierz.csv` — 352 pozycje z dowodami `plik:linia` |
| Co robimy w tym tygodniu | `plan-startowy-2026-08/PLAN_SPRINTOW_2026-08.md` |
| Status zadań | `plan-startowy-2026-08/VERRIS_BACKLOG_STARTOWY.xlsx`, kolumna Status |
| Dlaczego zadanie zrobiono tak | `docs/zadania/<ID>-*.md` |
| Jak utrzymać to w spójności | `plan-startowy-2026-08/AKTUALIZACJA_AUDYTU.md` |
| Jak było kiedyś | `docs/archiwum/` — nic stamtąd nie jest aktualne |

Przebudowa widoków po zmianie danych: `python3 audyt/generate.py --sprawdz && python3 audyt/generate.py`.
