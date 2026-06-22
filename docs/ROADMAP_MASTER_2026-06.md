# Verris — Roadmapa nadrzędna (master), 2026-06-21

Jedno źródło prawdy o kolejności prac: nowe funkcje, fixy, ulepszenia i propozycje
rozwoju. Zastępuje rozproszone notatki (`ROADMAP_KONKURENCJA`, `ROADMAP_PELNA`,
`PLAN_DALSZYCH_PRAC` — te zostają jako szczegół historyczny).

Zasady przewodnie: bezpieczeństwo, zgodność z prawem i RODO, ochrona danych i
plików klientów, łatwość obsługi, przewaga nad dhosting/cyberfolks/home.pl.
**Każda pozycja jest projektowana pod 100% LIVE — zero mocków, zero placeholderów.**

Legenda: **S** ≤ ~0,5 dnia · **M** ~1–3 dni · **L** > 3 dni · 💰 dotyka płatności
(wymaga E2E rozliczeniowego) · 🔒 blokada zewnętrzna (czeka na coś poza kodem).

---

## 0. Status na dziś

> **2026-06-21 (sesja rozwojowa, c.d.⁵):** zrobione **#26 Onboarding per produkt**
> — Asystent startu rozróżnia hosting vs poczta: dla usług EMAIL pokazuje kroki
> poczty (DNS MX/SPF/DKIM → skrzynki → dostarczalność, bazowane na dnsOk+mailOk)
> zamiast WordPress/SSL. Frontend-only, bez migracji.
>
> **2026-06-21 (sesja rozwojowa, c.d.⁴):** zrobione **#15 Polityka rotacji
> sekretów** — runbook `docs/ops/SECRET_ROTATION.md`: inwentarz wszystkich
> realnych sekretów (JWT, KMS, Stripe, Hetzner, OpenProvider/OVH, SMTP, KSeF,
> VPN, tokeny węzłów, hasła DA), kadencja, procedury rotacji bez przestoju,
> checklista weryfikacji, ścieżka awaryjna (wyciek) + dług (JWT key-ring, widok
> wieku sekretów). Dokument, bez kodu.
>
> **2026-06-21 (sesja rozwojowa, c.d.³):** zrobione **#13 Operacje węzłów (kolejka
> + retry)** — admin widzi wszystkie NodeTaski (instalacje WP/aplikacji, profil
> hostingu, WAF, PHP, staging) z kontekstem węzła/konta/zlecającego i błędem;
> nieudane (FAILED) można ręcznie ponowić (→ QUEUED, agent podejmie), audytowane.
> Sekcja „Operacje węzłów" na stronie Kolejka provisioningu. Bez migracji.
>
> **2026-06-21 (sesja rozwojowa, c.d.²):** zrobione **#11 Kredyty SLA** —
> automatyczne uznanie portfela za przestój infrastruktury (incydenty status-probe
> MAJOR). Schema `SlaCredit` + `ProbeIncident.slaCreditedAt` (migracja
> `20260621140000_sla_credits`), scheduler `SlaCreditScheduler` (kredyt pro-rata =
> miesięczna cena × czas_przestoju × mnożnik / 30d, ≤ limit%, idempotentny),
> polityka w adminie (włącz/grace/mnożnik/limit), e-mail do klienta, wpis w
> portfelu. **Domyślnie WYŁĄCZONE** (admin włącza po przeglądzie). ⚠️ dotyka
> pieniędzy — wymaga E2E (incydent MAJOR → kredyt + mail + idempotencja).
>
> **2026-06-21 (sesja rozwojowa, c.d.):** zrobione **#12 Centrum powiadomień** —
> dedykowana zakładka „Powiadomienia" w ustawieniach klienta: krytyczne kategorie
> (bezpieczeństwo, płatności, alerty usług) jako zawsze-włączone (info+lock) +
> opcjonalne przełączniki (alerty logowania, nowości, newsletter, oferty
> partnerskie) na istniejącym backendzie `/me/marketing-preferences`. Usunięto
> duplikat z „Prywatność" (RODO zostaje tam). Frontend-only, bez migracji.
>
> **2026-06-21 (sesja rozwojowa):** zrobione **#19 Upsell kontekstowy** (realny
> upsell planu wg użycia autoskalowania + render rekomendacji w Przeglądzie).
> **#22 Two-person approval — odłożone**: brak dziś twardego „admin hard-delete"
> konta/węzła (usuwanie konta = self-service RODO z karencją, węzły drenowane,
> nie kasowane), więc bramka nie miałaby realnego konsumenta — wróci, gdy taka
> akcja powstanie. Następne bez blokad: #12 Centrum powiadomień, #11 Kredyty SLA.


Platforma funkcjonalnie kompletna; trwa twardnienie i rozwój przewag. W tej serii
sesji dowieziono m.in.: rabat startowy + reguła nie-łączenia promocji (BILL-1),
spójne kwoty odnowień + ostrzeżenia o niedoborze portfela (BILL-2) oraz pełny
pakiet monitoringu **MON-1…6** (uptime 30 dni, domyślnie-on + tiering, płatny
tier z ustawieniami w adminie, czas odpowiedzi, ostrzeżenia SSL, sterowanie
powiadomieniami).

Do wgrania przy najbliższym deployu (migracje): `mon3_paid_monitoring`,
`mon4_response_time`, `mon5_ssl_expiry`, `mon6_notify_email`.

---

## 1. P0 — bramka startu LIVE (musi być przed włączeniem sprzedaży)

Kolejność wykonania:

1. **E2E na żywym koncie po licencji LiteSpeed** 🔒 — pełny przepływ:
   rejestracja → portfel/płatność → provisioning → WWW+SSL → poczta → DB →
   pliki → backup/restore. Wykonuje Dominik na serwerze; raport wraca tutaj.
2. **E2E rozliczeniowy funkcji 💰 z tej serii** 🔒 — BILL-1 (rabat startowy +
   kod gorszy/lepszy), BILL-2 (kwota odnowienia + niedobór), MON-3 (włączenie+
   opłata, cykl miesięczny, brak środków→powrót do darmowego+mail, rezygnacja+
   wznowienie). Nie da się odtworzyć w sandboxie — potrzebne realne obciążenia.
3. **Publikacja dokumentów prawnych** — regulamin, polityka prywatności, DPA,
   cookies (treści gotowe w `docs/legal`, trzeba podpiąć/opublikować i
   zlinkować w stopce + checkout).
4. **Restore drill** — próbne odtworzenie konta z backupu offsite (potwierdza,
   że backup faktycznie działa, nie tylko się tworzy).
5. **Sprzątnięcie danych testowych** 🔒 — subdomena qatest2, ticket testowy,
   konto test-live-verris.pl, testowe addony. Robi Dominik.

---

## 2. P1 — tuż po starcie (silnie zalecane, niskie ryzyko)

6. **Sentry / monitoring błędów (#71)** 🔒 M — wymaga DSN. Przechwyt wyjątków
   API + paneli, alerty. Bez tego po starcie jesteśmy „ślepi" na błędy prod.
7. **SEC-3 — listowanie zagnieżdżonych katalogów w menedżerze plików (#77)** 🔒 S
   — wymaga surowego zrzutu odpowiedzi DA z produkcji (debug-log → deploy →
   odczyt → fix).
8. **Treści Bazy Wiedzy — uzupełnienie + redakcja (#72)** S/M — rozbudowa
   artykułów, spójność z realnymi zakładkami.
9. **`pnpm -r audit` + przegląd zależności** S — finalny sweep podatności po
   ostatnich zmianach.
10. **Powiadomienia bezpieczeństwa — alert przy zmianie e-mail rozliczeniowego** S
    — domknięcie zestawu alertów bezpieczeństwa.

---

## 3. Rozwój — niezawodność i zaufanie (najwyższy zwrot na retencji)

11. **Kredyty SLA za niedostępność** 💰 M — gdy monitoring infrastruktury
    (status-probe / węzeł) wykryje przestój ponad gwarancję SLA, automatyczne
    uznanie portfela. Spójne z widocznym SLA (SUP-5). Wymaga: progi i limity w
    adminie, atrybucja przestoju do dotkniętych usług, audyt + mail. **Tylko
    przestój po naszej stronie (infrastruktura), nie awaria aplikacji klienta.**
12. **Centrum powiadomień (preferencje per kanał/temat)** M — jedno miejsce, gdzie
    klient steruje mailami (monitoring/billing/security/marketing). Nadbudowa nad
    MON-6; RODO-friendly, redukuje churn z „email fatigue". Maile krytyczne
    (bezpieczeństwo, rozliczenia) zawsze włączone.
13. **Kolejka zadań z retry i podglądem dla klienta** M — widoczny status długich
    operacji (provisioning, migracja, backup) z automatycznym ponawianiem.
14. **Auto-incydenty status page — rozszerzenie** S/M — probes już otwierają/
    zamykają incydenty; dodać most z watchdoga floty (węzeł offline →
    publiczny incydent) i opcjonalne webhooki do klientów.
15. **Polityka rotacji sekretów** S — przegląd i procedura rotacji kluczy (DA,
    Hetzner, Stripe, OpenProvider) + dokument.

---

## 4. Rozwój — produkt hostingowy (różnicowanie + przychód)

16. **WordPress toolkit** L — aktualizacje rdzenia/wtyczek, klon, tryb
    konserwacji, skan bezpieczeństwa (nadbudowa nad 1-click instalatorem). Silny
    wyróżnik vs cPanel/Plesk.
17. **LiteSpeed Cache + opcjonalny CDN brzegowy w panelu** 🔒 M — zależne od
    LiteSpeed live; przełącznik cache + statystyki trafień.
18. **Migrator „w 1 klik" z auto-wykrywaniem panelu źródłowego** M — rozszerzyć
    self-service migrację o detekcję cPanel/DA i import przez API.
19. **Upsell kontekstowy** M — sugestie (więcej zasobów / backup / e-mail /
    płatny monitoring) na bazie realnego użycia konta; nadbudowa nad istniejącymi
    rekomendacjami.
20. **Klucze API klienta + publiczne API** L — dla agencji/power-userów/
    resellerów; zakresy uprawnień + audyt.
21. **Tryb reseller / subkonta z własnym rozliczeniem** L — rynek agencyjny;
    nadbudowa nad istniejącym IAM.

---

## 5. Rozwój — bezpieczeństwo (ponad obecny stan)

22. **Two-person approval dla akcji destrukcyjnych admina** M — usunięcie
    konta/węzła wymaga drugiego zatwierdzenia. Niski koszt, wysoka ochrona.
23. **DNSSEC toggle dla domen** 🔒 M — zależne od rejestratora.
24. **Wykrywanie nadużyć trial — twardsze** M — fingerprint + limity po
    obserwacji realnych nadużyć na produkcji.

---

## 6. Rozwój — wsparcie i sukces klienta

25. **Asystent AI w panelu** L — odpowiedzi z Bazy Wiedzy (embeddings) z
    cytowaniem źródeł, osadzony w kontekście zakładki (fundament: UX-1/UX-2 już
    są). 0 mocków: realny RAG na naszej KB, bez „udawanych" odpowiedzi.
26. **Onboarding kontekstowy per produkt** S/M — checklisty „pierwsze kroki"
    dopasowane do hostingu / VPS / e-mail.

---

## 7. Rozwój — billing i wzrost

27. **Faktury cykliczne + przypomnienia** S/M — przypomnienia o niskim saldzie
    przed zawieszeniem (część jest: BILL-2/low-balance) + komplet e-faktur.
28. **Program poleceń — rozbudowa** M — dashboard prowizji, materiały, kody.
29. **Wykres uptime/response w czasie (historia)** M — time-series próbek
    response time + wykres w panelu (wymaga lekkiego retencyjnego storage próbek).

---

## 8. UX / dostępność / i18n

30. **Wersja EN paneli (i18n)** L — zasięg poza PL.
31. **Audyt dostępności (a11y) + kontrast/klawiatura** M.
32. **Statuspage per usługa (publiczny)** S — nadbudowa nad istniejącym
    badge'em uptime.

---

## 9. Dług techniczny (pilnować na bieżąco)

- **Stale Prisma client w sandbox** — błędy tsc dla nowych pól znikają po
  `db:generate`. Przy weryfikacji filtrujemy znane pozycje; ryzyko: maskują nowe
  realne błędy. Mitygacja: po każdym deployu pełny `tsc` na świeżym kliencie.
- **Spójność walidacji klient↔serwer** — polityka haseł w dwóch miejscach
  (lustrzane). Zmiana reguł = aktualizacja obu plików.
- **Konsolidacja dokumentów** — ten plik jest nadrzędny; pozostałe roadmapy
  traktować jako archiwum.
- **Testy jednostkowe logiki pieniężnej** — w sandboxie jest offline (brak
  ts-jest/natywnych binarek); po stronie CI dodać realne testy dla
  `resolveNextRenewalAmount`, intro-discount, prorata, uptime.

---

## 10. Świadomie NIE robimy przed LIVE

- Imunify360 vs ModSecurity+CXS, KernelCare, OSM, Virtualizor, MailScanner —
  decyzja infrastrukturalna odłożona (było tylko pytanie wstępne).
- Pełny menedżer DB users — phpMyAdmin pokrywa potrzebę do czasu stabilizacji
  wersji API DA.

---

## Co robić teraz (najbliższe sesje, bez blokad zewnętrznych)

Kolejność „od ręki" (wszystko buildowalne bez czekania na Dominika/dostawców):

1. **#22 Two-person approval** (bezpieczeństwo, S/M, bez 💰)
2. **#12 Centrum powiadomień** (retencja, M, bez 💰)
3. **#19 Upsell kontekstowy** (przychód, M, bez 💰)
4. **#11 Kredyty SLA** 💰 (różnicowanie; buildujemy, E2E przy okazji testów
   rozliczeniowych)
5. **#18 Migrator 1-click auto-detekcja** (konwersja, M)

Pozycje 🔒 (E2E LiteSpeed, Sentry, SEC-3, legal, restore drill, LiteSpeed Cache,
DNSSEC) czekają na zasoby/dostawców i robione są, gdy odblokowane.
