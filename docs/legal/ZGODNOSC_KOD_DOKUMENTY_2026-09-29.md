# Zgodność kodu z dokumentami prawnymi — 2026-09-29 (CL-04 / PB-03)

Status: **raport do decyzji właściciela.** Kod nie był zmieniany. Propozycje tekstu dokumentów są osobnymi
commitami w `docs/legal/drafts` (patrz „Propozycje w drafts”) — każdy można odrzucić niezależnie, jeśli
właściciel wybierze poprawkę kodu zamiast dokumentu.

Porównywane dokumenty: `drafts/terms.md` (Regulamin 1.1.0, do publikacji), `drafts/dpa.md`, `drafts/privacy.md`,
`consumer-info.md`, `SLA_KOD_VS_REGULAMIN.md`, `drafts/PROPOZYCJA_ZMIANY_PAR15.md`.
Kod: gałąź `main` z 29.09.2026 (`a1b61f3`).

Metoda: czytanie kodu i testów. Nic nie było uruchamiane na węźle, w Stripe ani na produkcji — tam, gdzie
wynik zależy od konfiguracji produkcji lub panelu Stripe, jest to napisane wprost („do sprawdzenia”).

---

## 1. Stałe z kodu, które obiecują dokumenty

| Stała / zachowanie | Wartość w kodzie | Gdzie w kodzie | Gdzie w dokumentach | Zgodne? |
|---|---|---|---|---|
| `KARENCJA_PLATNOSCI_DNI` | 7 dni (usługa działa, potem zawieszenie) | `apps/api/src/subscriptions/subscriptions.service.ts:87`, `renewal.scheduler.ts:44`, `:340-376` | Regulamin §7 ust. 3 | tak, z uwagą Z-04 |
| `ZAWIESZENIE_DO_WYGASNIECIA_DNI` | 14 dni od zawieszenia za brak płatności → `EXPIRED` | `subscriptions.service.ts:89`, `renewal.scheduler.ts:384-404`, `subscriptions.service.ts:753-788` | Regulamin §7 ust. 3 | tak (portfel); Stripe — Z-01, Z-02 |
| `RETENCJA_KONTA_DNI` | 14 dni od końca usługi → usunięcie konta z węzła | `subscriptions.service.ts:85`, `retencja-kont.service.ts:66-153` | Regulamin §10 ust. 8 (30 dni), DPA §10 ust. 1 (30 dni) | **nie** — Z-05 |
| Okres próbny | zawieszenie w chwili końca, usunięcie 14 dni po `trialEndsAt` | `trial-expiry.scheduler.ts:98-127`, `retencja-kont.service.ts:22-25` | Regulamin §7 ust. 8 | tak, z uwagą Z-16 |
| Kopie poza serwerem — `KOPIE_OFFSITE_DNI` / `RETENTION_DAYS` | 30 dni (domyślnie w skrypcie); faktycznie wartość z panelu admina 7–365 | `libs/contracts/src/kopie.ts:6`, `ops/scripts/node-offsite-backup.sh:40`, `ops/scripts/node-backup-config.sh:70`, `apps/api/src/servers/onboard.admin.controller.ts:28` | Regulamin §10 ust. 8 (≤ 90 dni), DPA §10 ust. 1 (≤ 90 dni), panel i verris.pl (30 dni) | warunkowo — Z-06 |
| Kopie poza serwerem — częstotliwość | raz na dobę, 03:30 + do 30 min | `node-offsite-backup.sh:171-172` | Regulamin §10 ust. 5 (bez liczb) | wartość do PB-03 pkt 2 po D3 |
| RODO — usunięcie konta Klienta | 14 dni przywracania → anonimizacja → konta hostingowe usuwane 30 dni później | `apps/api/src/compliance/account-deletion.service.ts:36`, `:41`, `:446-457` | Polityka prywatności (tabela celów; „Twoje prawa”): 14 dni, „nie później niż 180 dni” | tak |
| SLA — progi | 5/25/50/100% od dostępności w miesiącu | `apps/api/src/billing/sla-credit.scheduler.ts:410-416` | Regulamin §15 ust. 2 | tak, z uwagą Z-11 |
| SLA — opłata roczna | 1/12 opłaty rocznej | `sla-credit.scheduler.ts:135-137` | §15 ust. 2 | tak |
| SLA — tryb | automatycznie, ale tylko gdy `sla.creditsEnabled = 1` (domyślnie `0`) | `sla-credit.scheduler.ts:161-162`, `apps/api/src/platform-settings/platform-settings.service.ts:345` | §15 ust. 3 („automatycznie, bez wniosku”) | **nie, dopóki flaga = 0** — Z-08 |
| SLA — termin wypłaty | codziennie 03:00, rozlicza poprzedni miesiąc | `sla-credit.scheduler.ts:70`, `:347-354` | §15 ust. 3 (7 dni od końca miesiąca) | tak, z uwagą Z-15 |
| SLA — jednokrotność | unikat `SlaCredit(subscriptionId, periodStart)` | `sla-credit.scheduler.ts:170-185`, `:247-249` | §15 ust. 4 | tylko dla automatu — Z-14 |
| SLA — zapowiedź prac | okno założone ≥ 48 h przed startem, liczone tylko w zapowiedzianych godzinach, limit 480 min/mies. | `sla-credit.scheduler.ts:49`, `:124-128`, `:288-317`; `platform-settings.service.ts:348-354` | §15 ust. 7 | tak, z uwagami Z-13 |
| VPS — nieudane odnowienie | wyłączenie od razu, usunięcie po > 7 dniach zaległości | `apps/api/src/vps/vps-renewal.scheduler.ts:12`, `:86-120` | §11 ust. 7 (zgodnie), §7 ust. 3 (sprzecznie) | Z-17 |
| Domeny — odnowienie | bez automatu (`autorenew: 'off'`), przypomnienia 30/14/7 | `apps/api/src/domains/registrar.provider.ts:307`, `domain-expiry-reminder.scheduler.ts:11-22` | §12 ust. 5 (sugeruje automat), consumer-info pkt 4 (zgodnie) | Z-18 |

---

## 2. Rozjazdy

Waga: **wysoka** — klient dostaje mniej, niż obiecuje dokument, albo umowa jest wykonywana inaczej niż napisano;
**średnia** — rozjazd w części przypadków albo zależny od konfiguracji; **niska** — marginalny lub na korzyść klienta.

### Z-01 · wysoka · Stripe: nieudana ponowna próba płatności po zawieszeniu „odwiesza” status i zeruje liczniki §7 ust. 3

- **Kod:** `markPastDueFromStripe` pomija tylko `PAST_DUE`, `CANCELED`, `EXPIRED`
  (`apps/api/src/subscriptions/subscriptions.service.ts:2114-2120`), więc kolejne `invoice.payment_failed`
  z automatycznych ponowień Stripe (Smart Retries) przestawia usługę **`SUSPENDED` → `PAST_DUE`** i zapisuje nowe
  zdarzenie `PAYMENT_FAILED` (`:2122-2132`). Konto na węźle zostaje zawieszone. Skutki:
  1. licznik 14 dni do wygaśnięcia (`renewal.scheduler.ts:384-404`) liczy tylko usługi `SUSPENDED` — staje;
     po 7 dniach `runGraceExpiry` zawiesza ponownie z nowym zdarzeniem `SUSPENDED` (`subscriptions.service.ts:818-866`)
     i drugim mailem z nową datą wygaśnięcia; każde kolejne ponowienie Stripe przesuwa wygaśnięcie;
  2. gdy następne ponowienie **się uda**, gałąź `PAST_DUE` w `activateAfterStripePayment`
     (`subscriptions.service.ts:1972-1994`) ustawia `ACTIVE` **bez odwieszenia konta na węźle** — klient zapłacił,
     strona dalej nie działa (to samo, co naprawiał test `test/integration/stripe-po-zawieszeniu.int-spec.ts`,
     ale przez stan pośredni `PAST_DUE`);
  3. zawieszenie za nadużycie (§17 ust. 5) przechodzi w `PAST_DUE`, a potem w `GRACE_EXPIRED` — czyli w zawieszenie
     „za brak płatności”, które płatność odwiesza, a brak płatności zamienia w wygaśnięcie z §7 ust. 3.
- **Dokument:** Regulamin §7 ust. 3 — „po bezskutecznym upływie prolongaty Usługa zostaje zawieszona; jeżeli
  w ciągu kolejnych 14 dni zaległość nie zostanie uregulowana, Umowa … wygasa”; §17 ust. 5 — zawieszenie za naruszenie.
- **Propozycja:** kod — w `markPastDueFromStripe` nie ruszać usługi `SUSPENDED` (dopisać do wykluczeń) i test
  integracyjny: zawieszona → `invoice.payment_failed` → status dalej `SUSPENDED`, zdarzenie `SUSPENDED` bez zmian.
  Dokument bez zmian. Potwierdzone czytaniem kodu, bez uruchomienia testu.

### Z-02 · wysoka (zależna od ustawień Stripe) · Stripe kończy subskrypcję po wyczerpaniu ponowień — poza harmonogramem §7 ust. 3

- **Kod:** `customer.subscription.deleted` → `markCanceledFromStripe` od razu ustawia `CANCELED`, `canceledAt = teraz`
  (`subscriptions.service.ts:2150-2210`). Od tej chwili płatność jest ignorowana (`:1942`), a po 14 dniach konto jest
  usuwane (`retencja-kont.service.ts:134-153`). Kiedy Stripe to zdarzenie wyśle, zależy od ustawień
  „Revenue recovery → Retries” w panelu Stripe (okno ponowień i akcja po ostatniej nieudanej próbie) — **tych
  ustawień nie ma w repozytorium**.
  Dodatkowo: jeśli usługa była już `SUSPENDED`, mail idzie w wariancie „anulowanie zgodnie z Twoim zgłoszeniem”
  (`subscriptions.service.ts:2219-2226` — `userInitiated = !wasPaymentFailure`, a `wasPaymentFailure` jest prawdą tylko dla `PAST_DUE`).
- **Dokument:** §7 ust. 3 — 7 dni prolongaty + 14 dni na zapłatę po zawieszeniu, czyli ok. 21 dni od nieudanej płatności.
  Jeśli okno ponowień Stripe jest krótsze niż 21 dni i kończy się anulowaniem, klient traci resztę terminu na zapłatę.
- **Propozycja (do wyboru przez właściciela):**
  A. konfiguracja Stripe: po ostatniej próbie „zostaw subskrypcję jako zaległą” (wygaśnięcie i anulowanie w Stripe
  robi już `wygasPoZawieszeniu`, `subscriptions.service.ts:756-757`);
  B. kod: `customer.subscription.deleted` dla usługi `PAST_DUE`/`SUSPENDED` za brak płatności nie kończy umowy od razu,
  tylko zostawia harmonogram §7 ust. 3; poprawić wybór szablonu maila dla `SUSPENDED`.
  Dokument bez zmian. Do sprawdzenia: ustawienia ponowień w panelu Stripe (tryb live).
  Dokumentacja: https://docs.stripe.com/billing/revenue-recovery/smart-retries

### Z-03 · średnia (do potwierdzenia w trybie testowym Stripe) · data zawieszenia w mailu o nieudanej płatności kartą

- **Kod:** mail podaje `suspendAt = currentPeriodEnd + 7 dni` z lokalnej subskrypcji
  (`apps/api/src/billing/billing.service.ts:1536-1539`). `customer.subscription.updated` nadpisuje `currentPeriodEnd`
  okresem ze Stripe (`subscriptions.service.ts:1877-1881`). Przy odnowieniu Stripe przesuwa okres na nowy także wtedy,
  gdy płatność się nie uda (subskrypcja przechodzi w `past_due`) — jeśli to zdarzenie przyjdzie przed
  `invoice.payment_failed`, mail poda datę ok. miesiąc późniejszą niż faktyczne zawieszenie, które liczy się
  od zdarzenia `PAYMENT_FAILED` (`renewal.scheduler.ts:359`).
- **Dokument:** §7 ust. 3 (klient „otrzymuje powiadomienia” w prolongacie — powiadomienie z błędną datą wprowadza w błąd).
- **Propozycja:** kod — w mailu liczyć od chwili nieudanej płatności (jak harmonogram), nie od `currentPeriodEnd`.
  Przed poprawką sprawdzić w trybie testowym Stripe kolejność zdarzeń i wartość okresu.
  Dokumentacja: https://docs.stripe.com/billing/subscriptions/overview#payment-status

### Z-04 · niska · portfel: prolongata liczy się od próby obciążenia, która bywa do 24 h przed końcem okresu

- **Kod:** odnowienie z portfela próbuje obciążyć w oknie 24 h **przed** `currentPeriodEnd`
  (`renewal.scheduler.ts:87-101`); brak środków od razu daje `PAST_DUE` i `PAYMENT_FAILED` (`:255-257`, `:307-334`),
  a 7 dni liczy się od tego zdarzenia (`:359`). Po opłaconym okresie zostaje więc ok. 6–7 dni, a w ostatniej dobie
  opłaconego okresu usługa jest oznaczona jako zaległa.
- **Dokument:** §7 ust. 3 — „7-dniowy okres prolongaty” po nieudanym odnowieniu.
- **Propozycja:** kod — początek prolongaty = późniejsza z dat: `PAYMENT_FAILED` albo `currentPeriodEnd`.
  Alternatywnie dokument: „7 dni od pierwszej nieudanej próby odnowienia”.

### Z-05 · wysoka · retencja danych po zakończeniu usługi: 14 dni w kodzie, 30 dni w Regulaminie i DPA

- **Kod:** `RETENCJA_KONTA_DNI = 14` — „decyzja właściciela 29.09.2026” (`subscriptions.service.ts:84-85`);
  konto zakończonej usługi jest usuwane z węzła 14 dni po `canceledAt`/`trialEndsAt`, przypomnienie w 11. dniu
  (`retencja-kont.service.ts:13`, `:66-153`). Maile mówią klientowi to samo: „Po 14 dniach automatycznie usuniemy
  Twoje dane” (`apps/api/src/mail/templates/billing-lifecycle-notifications.ts:612`, `:672`).
  Kopia poza serwerem zostaje w katalogu wersji jeszcze przez `RETENTION_DAYS` (`node-offsite-backup.sh:112-137`),
  ale nie ma w repozytorium procedury odtworzenia konta już usuniętego z węzła.
- **Dokument:** Regulamin §10 ust. 8 — „Przez 30 dni od wygaśnięcia Klient może zwrócić się o odzyskanie danych
  z ostatniej dostępnej kopii”; DPA §10 ust. 1 — „eksport dostępny przez 30 dni od zakończenia … Po upływie 30 dni
  Verris trwale usuwa powierzone dane z systemów produkcyjnych”.
- **Propozycja:** dokument pod decyzję z 29.09 (14 dni) — **commit w drafts: §10 ust. 8 Regulaminu i §10 ust. 1 DPA**.
  Jeśli właściciel woli 30 dni — odrzucić commit i zmienić `RETENCJA_KONTA_DNI` na 30 (testy, które zakładają 14:
  `retencja-kont.service.spec.ts:125`, szablony maili powyżej, `hosting-notifications.ts:276`).

### Z-06 · średnia · retencja kopii poza serwerem ustawiana w panelu admina bez związku z obietnicami

- **Kod:** strażnik `apps/api/src/test/kopie-30-dni.spec.ts:13-16` sprawdza tylko wartość domyślną w skrypcie
  (`RETENTION_DAYS:-30`). Na węźle obowiązuje wartość z panelu admina (`VB_RETENTION_DAYS`,
  `apps/api/src/servers/backup-offsite.service.ts:123` → `ops/scripts/node-backup-config.sh:70`), walidowana jako 7–365 dni
  (`onboard.admin.controller.ts:28`). Test `onboard-live.spec.ts:70-77` zapisuje 14.
- **Dokument:** panel klienta i verris.pl — „kopia z każdego z ostatnich 30 dni” (`KOPIE_OFFSITE_DNI`);
  Regulamin §10 ust. 8 i DPA §10 ust. 1 — kopie „nadpisywane w cyklu rotacji nie dłuższym niż 90 dni”.
  Ustawienie < 30 łamie obietnicę panelu, > 90 — Regulamin i DPA.
- **Propozycja:** kod — zakres `retencjaDni` od `KOPIE_OFFSITE_DNI` do 90 i strażnik na wartość z panelu
  (styka się z CL-08, które ma dać klientowi wybór retencji z minimum 28 dni). Dokument bez zmian.
  Do sprawdzenia na produkcji: aktualna wartość `retencjaDni` w konfiguracji kopii.

### Z-07 · średnia · DPA Zał. 1 (TOM) opisuje kopie bazy panelu, nie kopie danych powierzonych

- **Kod:** kopie kont hostingowych (dane powierzone przez Klienta) — `rclone crypt` na Storage Box przez SFTP,
  bez kopii niezmienialnych; stare wersje są kasowane `rclone purge` (`node-offsite-backup.sh:9-16`, `:112-137`).
  Szyfrowanie `age` i WORM dotyczą kopii bazy control-plane (`ops/backup-postgres.sh`, `ops/backup-mirror-external.sh:40-44`),
  a mirror z WORM jest w cronie domyślnie wyłączony (`ops/cron/verris-backup.cron:20-21`, `MIRROR_EXTERNAL_ENABLED`).
- **Dokument:** DPA Zał. 1 — „kopie zapasowe szyfrowane przed wysyłką (age), przechowywane poza podstawową
  lokalizacją, z kopiami niezmienialnymi (WORM)”.
- **Propozycja (tekst, jeśli właściciel wybierze dokument):** „kopie zapasowe kont hostingowych szyfrowane na serwerze
  przed wysyłką (rclone crypt) i przechowywane poza serwerem, na którym działa konto; kopie bazy danych Panelu
  szyfrowane (age) [i przechowywane dodatkowo jako kopie niezmienialne (WORM) — tylko jeśli mirror jest włączony
  na produkcji]; okresowe testy odtwarzania”. Bez commita — najpierw sprawdzić na produkcji `MIRROR_EXTERNAL_ENABLED`.

### Z-08 · wysoka · SLA „automatycznie, bez wniosku”, a automat jest domyślnie wyłączony

- **Kod:** `run()` kończy się od razu, gdy `sla.creditsEnabled ≠ 1` (`sla-credit.scheduler.ts:161-162`); wartość
  domyślna `'0'` (`platform-settings.service.ts:345`). Panel admina sam to zgłasza jako brak gotowości
  (`apps/api/src/product-ops/product-ops.admin.controller.ts:190-198`).
- **Dokument:** Regulamin §15 ust. 3 (wersja 1.1.0) — rekompensata „automatycznie, bez wniosku Klienta, w terminie
  7 dni od zakończenia miesiąca”.
- **Propozycja:** włączyć flagę najpóźniej w dniu publikacji 1.1.0 (pkt 4 checklisty w `drafts/PROPOZYCJA_ZMIANY_PAR15.md`);
  bez tego obowiązuje dokument, a kod go nie wykonuje. Do sprawdzenia na produkcji: wartość `sla.creditsEnabled`.

### Z-09 · średnia · SLA obejmuje w Regulaminie VPS, pocztę i DNS, a kod liczy tylko hosting

- **Kod:** do rozliczenia wchodzą wyłącznie subskrypcje `productKind: 'HOSTING'` z kontem na węźle
  (`sla-credit.scheduler.ts:89-97`); przestój to incydenty sond serwera węzła (`:259-286`). VPS nie ma ani sond,
  ani rekompensat.
- **Dokument:** §15 ust. 1 — „dostępność Usług (Hosting, VPS, infrastruktura poczty i DNS)”.
- **Propozycja (do wyboru):** A. kod — rozliczenie VPS (wymaga pomiaru dostępności VPS); B. dokument — §15 ust. 1
  zawęzić do „Hosting (w tym poczta i DNS utrzymywane na serwerze hostingowym)”. Bez commita — to decyzja o zakresie
  gwarancji. Zmiana na niekorzyść — przed publikacją 1.1.0 bez trybu §24.

### Z-10 · średnia · SLA: usługa zakończona lub zaległa w dniu rozliczenia nie dostaje rekompensaty

- **Kod:** rozliczenie bierze tylko subskrypcje `ACTIVE` w chwili przebiegu (`sla-credit.scheduler.ts:91`).
  Usługa, która w miesiącu działała, a 1.–7. dnia następnego miesiąca jest `CANCELED`, `EXPIRED`, `SUSPENDED`
  albo `PAST_DUE`, nie dostaje nic automatycznie (zaległa dostanie, jeśli wróci do `ACTIVE` — przebieg jest codzienny).
- **Dokument:** §15 ust. 2–3 — rekompensata za miesiąc, w którym SLA nie było dotrzymane, dla każdej Usługi.
- **Propozycja:** kod — wybierać usługi aktywne w rozliczanym miesiącu (nie w dniu przebiegu), a czas zawieszenia
  z §7/§17 wyłączyć z mianownika (§15 ust. 7). Dokument bez zmian; do czasu poprawki takie przypadki obsługuje wniosek z §15 ust. 4.

### Z-11 · niska · SLA: zaokrąglenie dostępności do 0,01% w górę przy granicy 99,5%

- **Kod:** `availabilityBp = Math.round(…)` (`sla-credit.scheduler.ts:131`). W miesiącu 31-dniowym przestój
  223,3–225,4 min to dostępność 99,4951–99,4998%, zaokrąglona do 9950 → próg 0% zamiast 5%.
- **Dokument:** §15 ust. 2 — 5% „od 99,0% do poniżej 99,5%”.
- **Propozycja:** kod — `Math.floor` (zaokrąglenie na korzyść klienta) + przypadek graniczny w `sla-credit.scheduler.spec.ts`.

### Z-12 · niska · SLA: mianownik od utworzenia subskrypcji, nie od aktywacji

- **Kod:** `serviceStart = sub.createdAt` (`sla-credit.scheduler.ts:117`); subskrypcja powstaje przed opłaceniem
  i założeniem konta.
- **Dokument:** §15 ust. 5 — „dostępność liczy się od dnia jej aktywacji”.
- **Propozycja:** kod — data zdarzenia aktywacji. Różnica zwykle minuty; przy długim `PENDING_PAYMENT` zawyża dostępność.

### Z-13 · niska · SLA: wyłączenia z §15 ust. 7 rozpoznawane częściowo

- **Kod:** odliczane są tylko okna konserwacyjne serwera założone ≥ 48 h przed startem, w zapowiedzianych godzinach,
  do limitu `sla.maintenanceCapMinutes` (`sla-credit.scheduler.ts:288-317`, `:127`). Limit można ustawić w panelu
  admina na 0–44 640 min (`platform-settings.service.ts:348-354`, `:366`) — powyżej 480 kod odlicza więcej, niż pozwala
  §15 ust. 7. Kod nie sprawdza „godzin nocnych”. Okna bez serwera (`serverId = null`) nie są odliczane (`:305`) —
  na korzyść klienta. Siła wyższa, awarie operatorów, działania Klienta i ataki nie są rozpoznawane — decyduje
  klasyfikacja incydentu jako `MAJOR` (już opisane w `PROPOZYCJA_ZMIANY_PAR15.md`).
- **Dokument:** §15 ust. 7 — prace zapowiedziane ≥ 48 h e-mailem lub na `status.verris.pl`, ≤ 8 h/mies., w godzinach nocnych.
  Zapowiedź na stronie statusu jest (`apps/api/src/status/status.service.ts:75-83` — okno widać od 14 dni przed startem).
- **Propozycja:** kod — górny limit `maintenanceCapMinutes` = 480. Godziny nocne — zasada dla obsługi przy zakładaniu okna.

### Z-14 · średnia · SLA: wniosek z §15 ust. 4 nie ma ścieżki w kodzie, jednokrotność działa tylko dla automatu

- **Kod:** komentarze mówią, że unikat `SlaCredit` blokuje podwójną wypłatę „także wobec kredytu przyznanego ręcznie”
  (`sla-credit.scheduler.ts:42-44`, `:170-172`, `:247-248`), ale żaden kod poza automatem nie tworzy rekordu
  `SlaCredit`. Rekompensata przyznana ręcznie (uznanie portfela) nie zablokuje automatu i odwrotnie.
- **Dokument:** §15 ust. 4 — wniosek w 30 dni, rozpatrzenie w 7 dni, „za ten sam miesiąc i tę samą Usługę
  rekompensata przysługuje jednokrotnie”.
- **Propozycja:** kod — ręczne przyznanie rekompensaty SLA przez ten sam zapis `SlaCredit` (np. akcja w panelu
  obsługi); do tego czasu procedura dla obsługi: przed uznaniem sprawdzić `SlaCredit` za miesiąc.

### Z-15 · niska · SLA: granice miesiąca w UTC

- **Kod:** `previousMonthUtc` (`sla-credit.scheduler.ts:347-354`); cron bez strefy czasowej (`:70`).
- **Dokument:** §15 — „miesiąc kalendarzowy” (dla klienta w Polsce: czas polski). Przesunięcie 1–2 h na granicach miesiąca.
- **Propozycja:** kod — granice miesiąca w `Europe/Warsaw`, jak `retencja-kont.service.ts:66`. Waga marginalna.

### Z-16 · niska · okres próbny: po wygaśnięciu klient nie opłaci planu sam

- **Kod:** przejście na płatny tylko dla `ACTIVE`/`PROVISIONING` (`apps/api/src/subscriptions/trial.service.ts:194-199`);
  wygasły okres próbny to `EXPIRED` (`subscriptions.service.ts:1241-1267`). Maile kierują do Centrum pomocy
  (`billing-lifecycle-notifications.ts:758`, `:786`; `hosting-notifications.ts:276-277`).
- **Dokument:** §7 ust. 8 — „jeżeli Klient nie opłaci Planu w ciągu 14 dni — dane Usługi są usuwane”.
- **Propozycja:** dokument nie jest fałszywy (opłacenie przez obsługę jest możliwe), ale sugeruje samoobsługę.
  Do wyboru: kod — przejście na płatny z `EXPIRED` w 14 dniach; albo dokument — „…Klient może w ciągu 14 dni
  zwrócić się (Panel → Wsparcie) o przywrócenie Usługi i opłacić Plan; w przeciwnym razie dane Usługi są usuwane”.
  To samo dotyczy usługi zawieszonej za brak płatności opłacanej z portfela: odnowienie z portfela obejmuje tylko
  `ACTIVE`/`PAST_DUE` (`renewal.scheduler.ts:93-96`), więc po zawieszeniu klient płaci przez obsługę
  (`hosting-notifications.ts:116-124`).

### Z-17 · średnia · VPS: Regulamin sam sobie przeczy, kod realizuje §11 ust. 7

- **Kod:** brak środków → wyłączenie serwera od razu (bez prolongaty, w której usługa działa), usunięcie po > 7 dniach
  od końca okresu (`vps-renewal.scheduler.ts:12`, `:86-120`); mail zapowiada 7 dni (`apps/api/src/mail/templates/vps-notifications.ts:53`).
  Odnowienie tylko z Portfela (`:53-59`); okres = 30 dni, nie miesiąc kalendarzowy (`:13`).
- **Dokument:** §7 ust. 3 (ogólny: 7 dni prolongaty z działającą usługą + 14 dni zawieszenia, pierwszeństwo rozdziału III
  tylko dla „terminów usuwania danych po wygaśnięciu”) vs §11 ust. 7 (wyłączenie od razu, usunięcie po 7 dniach);
  §11 ust. 6 — odnowienie „z Portfela lub zapisaną metodą płatności”.
- **Propozycja:** dokument — **commit w drafts: §7 ust. 3 „z zastrzeżeniem §11 ust. 7” i §11 ust. 6 zgodnie z kodem**
  (zapisana karta działa tylko przez automatyczne doładowanie z §8 ust. 5). Alternatywa: kod VPS pod §7 ust. 3.

### Z-18 · średnia · domeny: §12 ust. 5 sugeruje automatyczne odnowienie, którego nie ma

- **Kod:** rejestracja z `autorenew: 'off'` (`registrar.provider.ts:307`), odnowienie tylko ręcznie w Panelu
  (`domains.controller.ts:151-153`), przypomnienia 30/14/7 (`domain-expiry-reminder.scheduler.ts:11-22`, komentarz
  `:18-22`: „bez auto-odnowień”). verris.pl: „Bez cichych auto-odnowień” (`apps/www/src/app/(frontend)/domeny/page.tsx:17`).
- **Dokument:** §12 ust. 5 — „Domena nie odnawia się automatycznie, jeżeli w dniu odnowienia brak jest środków
  w Portfelu lub skutecznej płatności” (a contrario: przy środkach odnawia się sama). Consumer-info pkt 4 mówi poprawnie:
  „Domeny odnawiane są wyłącznie po opłaceniu odnowienia”.
- **Propozycja:** dokument — **commit w drafts: §12 ust. 5**.

---

## 3. Zgodne — bez uwag

- §7 ust. 3 dla usług z portfela: 7 dni prolongaty → zawieszenie (`renewal.scheduler.ts:340-376`), 14 dni → `EXPIRED`
  (`:384-404`), tylko zawieszenia za brak płatności (`subscriptions.service.ts:91`); wygaśnięcie anuluje subskrypcję
  w Stripe (`:756-757`). Test: `test/integration/odnowienia.int-spec.ts:95-97`, `subscriptions/wygasniecie-po-zawieszeniu.spec.ts`.
- §7 ust. 8: 14 dni po końcu okresu próbnego → usunięcie (`retencja-kont.service.ts:22-31`).
- §15 ust. 2: progi i granice domknięte od dołu (`sla-credit.scheduler.ts:410-416`, test `sla-credit.scheduler.spec.ts:17-24`);
  1/12 opłaty rocznej; §15 ust. 3: e-mail i powiadomienie w Panelu (`:218-244`); §15 ust. 5: sumowanie przestojów
  w miesiącu, scalanie nakładających się incydentów (`:282-284`); §15 ust. 7: 48 h i prace ponad zapowiedź liczone
  jako przestój (test `test/integration/sla-kredyty.int-spec.ts`).
- Polityka prywatności: 14 dni przywracania po usunięciu konta (`account-deletion.service.ts:36`), usunięcie kont
  hostingowych 30 dni po anonimizacji — mieści się w „nie później niż 180 dni” (`:41`).
- §12 ust. 5 / consumer-info: przypomnienia o domenie 30/14/7 dni; §7 ust. 2: przypomnienia o odnowieniu 7 i 3 dni
  (`renewal-reminder.scheduler.ts:24-25`).

## 4. Nieaktualne materiały pomocnicze

- `docs/legal/SLA_KOD_VS_REGULAMIN.md` (10.07.2026) opisuje stary wzór proporcjonalny. Rozjazdy 1–4 z tego pliku są
  usunięte w kodzie (progi, agregacja miesięczna, unikat miesiąca, okna konserwacyjne), a §15 ma nową numerację
  (wniosek — ust. 4, wyłączenia — ust. 7). Dopisano notę na początku pliku.
- Komentarze w kodzie wskazują „§15 ust. 5” dla wyłączeń (`sla-credit.scheduler.ts:39`, `platform-settings.service.ts:347`) —
  w 1.1.0 to ust. 7. Tylko komentarze; nie zmieniano (zakres CL-04 bez kodu).

## 5. Dla PB-03 pkt 2 (§10 ust. 5 po teście D3)

Wartości z kodu do potwierdzenia na węźle: kopia raz na dobę (timer 03:30 + do 30 min losowo), przechowywanie
`KOPIE_OFFSITE_DNI` = 30 dni (na węźle obowiązuje wartość z panelu — Z-06), szyfrowanie po stronie węzła (rclone crypt),
lokalizacja: Storage Box poza serwerem konta, przywracanie przez klienta w Panelu (`hosting-offsite-panel.tsx`).
Nie wpisywano ich do §10 ust. 5 — PB-03 wymaga wartości z testu D3.

## 6. Propozycje w drafts (osobne commity)

| Commit | Plik i miejsce | Rozjazd |
|---|---|---|
| domeny bez automatycznego odnowienia | `drafts/terms.md` §12 ust. 5 | Z-18 |
| VPS — pierwszeństwo §11 ust. 7, płatność z Portfela | `drafts/terms.md` §7 ust. 3, §11 ust. 6 | Z-17 |
| retencja 14 dni | `drafts/terms.md` §10 ust. 8, `drafts/dpa.md` §10 ust. 1 | Z-05 |

Wszystkie zmiany dotyczą wersji 1.1.0 przed publikacją — nie wymagają trybu §24.
Przy Z-05 zmiana skraca termin wobec 1.0.1, zaakceptowanej wyłącznie przez konta testowe (PB-03, decyzje 27.09).

## 7. Czego nie sprawdzono

- Uruchomiono tylko strażniki, które czytają zmienione pliki: `apps/api/src/test/bez-nazwy-directadmina.spec.ts`
  (skanuje `drafts/terms.md`, `drafts/dpa.md`) i `apps/api/src/test/kopie-30-dni.spec.ts` — zielone.
  Testów integracyjnych nie uruchamiano (raport nie zmienia kodu; brak serwera Postgres w sesji). Nic na węźle ani
  w Stripe. Z-01 i Z-04 potwierdzone czytaniem kodu; Z-02 i Z-03 zależą od zachowania i ustawień Stripe.
- Produkcja: wartości `sla.creditsEnabled`, `sla.maintenanceCapMinutes`, `retencjaDni` kopii poza serwerem,
  `MIRROR_EXTERNAL_ENABLED` — nieznane z sesji w chmurze.
- Ustawienia ponowień płatności w panelu Stripe (Z-02).
- Czy da się odtworzyć konto już usunięte z węzła z katalogu wersji kopii (Z-05) — do sprawdzenia na węźle.
- Treści na verris.pl i w materiałach marketingowych — poza zakresem (`docs/legal`), poza cytowanymi wyżej miejscami.
- To nie jest opinia prawna.
