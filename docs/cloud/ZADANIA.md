# Zadania dla sesji w chmurze (Claude Code cloud)

Każda sesja czyta najpierw `CLAUDE.md` (zasady, bramki, czego nie ruszać). Prompt do wklejenia:

```
Przeczytaj CLAUDE.md, potem wykonaj zadanie <ID> z docs/cloud/ZADANIA.md.
```

Zadania w jednej fali dotykają różnych katalogów, więc można je uruchomić równolegle.
Wynik zawsze jako draft PR; testy na węźle (D3), macierz audytu i tablice robi sesja z dostępem do węzła.

---

## Fala 1 — można uruchomić od razu, równolegle

### CL-01 — SDK DirectAdmina zgodny z dokumentacją, bez cichych „zapasowych” wywołań
- **Zakres:** `libs/directadmin-sdk/src`, `apps/api/src/servers` (tylko wywołania SDK i testy).
- **Tło:** 29.09 dodanie użytkownika bazy zwracało „dodano”, a użytkownika nie było: SDK wysyłało zły parametr,
  a zapasowe `CMD_API_DATABASES adduser` odpowiadało bez `error=1`, co `daPost` uznał za sukces.
- **Kroki:**
  1. Wypisz wszystkie komendy DA używane w SDK (ścieżka, metoda, parametry).
  2. Każdą porównaj z oficjalną dokumentacją DA (docs.directadmin.com, changelogi z opisem API). Link w komentarzu.
  3. Znajdź wzorce: `try { A } catch { B }` na inną komendę, odpowiedź bez `error=1` traktowana jako sukces
     bez sprawdzenia treści, parametry niezgodne z dokumentacją.
  4. Popraw tylko to, co ma potwierdzenie w dokumentacji; resztę opisz w PR jako „do sprawdzenia na węźle”.
  5. Test na każdą poprawkę (wzór: `apps/api/src/servers/da-listy-1710.spec.ts`).
- **Gotowe gdy:** tabela w PR (komenda → dokumentacja → stan → zmiana), bramki api + sdk zielone.

### CL-02 — White label: klient nie widzi DirectAdmina
- **Zakres:** `apps/client-panel/src`, `apps/api/src/mail/templates`, komunikaty błędów zwracane klientowi z `apps/api/src`
  (bez `apps/api/src/servers/*` — to CL-01).
- **Kroki:**
  1. Wyszukaj widoczne dla klienta: „DirectAdmin”, „ DA ”, „CustomBuild”, `:2222`, nazwy węzłów, angielskie
     komunikaty z DA przekazywane 1:1.
  2. Rozróżnij kod/komentarze (zostają) od tekstu dla klienta (zmienić). Wzór mapowania błędów:
     `apps/api/src/subscriptions/blad-zadania.ts`.
  3. Popraw teksty; tam, gdzie klient dostaje surowy błąd DA — przepuść przez istniejące mapowanie.
- **Gotowe gdy:** lista w PR (plik:linia, przed → po), test strażnika, który czerwieni się, gdy tekst z „DirectAdmin”
  wróci do komponentów panelu klienta; bramki client-panel + api zielone.

### CL-03 — Teksty i odmiana w panelu admina i obsługi
- **Zakres:** `apps/admin-panel`, `apps/staff-panel`.
- **Kroki:** liczba + rzeczownik w stałej formie → `plForm` (skopiuj helper do pakietu, jeśli go nie ma, bez zmian
  w logice); literówki i mieszanka PL/EN w interfejsie; natywne `window.confirm` → komponent potwierdzenia pakietu,
  jeśli istnieje.
- **Gotowe gdy:** lista zmian w PR, bramki obu paneli zielone.

### CL-04 — Zgodność dokumentów prawnych z kodem (PB-03)
- **Zakres:** tylko `docs/legal` (nowy raport + propozycje zmian w `docs/legal/drafts`). Bez zmian w kodzie.
- **Kroki:**
  1. Wypisz z kodu stałe, które obiecuje Regulamin/SLA: karencja płatności (`KARENCJA_PLATNOSCI_DNI`),
     zawieszenie → wygaśnięcie (`ZAWIESZENIE_DO_WYGASNIECIA_DNI`), retencja konta po zakończeniu,
     retencja kopii (`RETENTION_DAYS` w `ops/scripts/node-backup-config.sh`, `apps/api/src/test/kopie-30-dni.spec.ts`),
     rekompensaty SLA i zapowiedź prac (`SlaCreditScheduler`, `test/integration/sla-kredyty.int-spec.ts`),
     zachowanie przy nieopłaconej fakturze Stripe.
  2. Porównaj z `docs/legal/drafts` i `docs/legal/SLA_KOD_VS_REGULAMIN.md` (paragraf, ustęp).
  3. Raport `docs/legal/ZGODNOSC_KOD_DOKUMENTY_<data>.md`: rozjazd → co mówi kod → co mówi dokument → propozycja.
     Decyzję, co zmienić (kod czy dokument), zostaw właścicielowi — nie zmieniaj kodu.
- **Gotowe gdy:** raport z odniesieniami plik:linia i § ust.; propozycje tekstu jako osobne zmiany w drafts.

### CL-05 — Pomiar: Consent Mode v2 i deduplikacja zdarzeń (PB-08)
- **Zakres:** `apps/www/src/lib/analytics.ts`, `apps/www/src/lib/cookie-consent.ts`,
  `apps/www/src/app/(frontend)/components/Analytics.tsx`, `apps/client-panel/src/components/analytics-scripts.tsx`,
  `apps/client-panel/src/components/cookie-consent.tsx` i ich testy.
- **Kroki:** sprawdź względem dokumentacji Google (Consent Mode v2: `default` przed tagami, `update` po zgodzie,
  `ad_user_data`, `ad_personalization`) i zasady: jedno zdarzenie zakupu = jeden `event_id` współdzielony między
  przeglądarką a serwerem. Popraw braki, dopisz testy.
- **Gotowe gdy:** opis w PR (co było, co jest, link do dokumentacji), bramki www + client-panel zielone.

### CL-09 — Teksty panelu klienta: żargon, niejasności, odmiana
- **Zakres:** `apps/client-panel/src` (tylko teksty i odmiana, bez zmian w logice poza `<input type="date">` i czasem kopii).
- **Kroki:** pozycje z `docs/cloud/CL-09-teksty-panelu-klienta.md` (przegląd 30.09) — każdą sprawdź w kodzie,
  popraw tekst, liczebniki przez `plForm`/`plural`. Strażnik `lib/biala-etykieta.spec.ts` ma zostać zielony.
- **Gotowe gdy:** lista zmian w PR (plik:linia, przed → po), bramki client-panel zielone.

---

## Fala 2 — po scaleniu fali 1 (te same katalogi)

### CL-06 — Dostępność WCAG 2.1 AA panelu klienta (P-12)
- **Zakres:** `apps/client-panel`. Automatyczne sprawdzenie (np. axe w testach komponentów) głównych widoków:
  przegląd usługi, poczta, bazy, pliki, DNS; poprawki etykiet, kontrastu, fokusu, ról ARIA.
- **Gotowe gdy:** test a11y w CI dla tych widoków, lista poprawek w PR. Przejście czytnikiem ekranu zostaje ręczne.

### CL-07 — Publiczne API: zapis (L-08)
- **Zakres:** `apps/api/src/api-tokens` (+ moduły, które wystawiają operacje), dokumentacja API.
- **Kroki:** zakresy tokenów na zapis (zamówienie usługi z portfela, skrzynki pocztowe), ten sam kod ścieżki co
  panel (bez duplikowania logiki), klucz idempotencji, limit żądań, dziennik zdarzeń z tokenem jako aktorem.
  Pieniądze → testy integracyjne (podwójne żądanie = jedno obciążenie).
- **Gotowe gdy:** testy jednostkowe + integracyjne, opis zakresów w PR. Przegląd bezpieczeństwa przed scaleniem
  robi sesja z dostępem do węzła.

### CL-08 — Konfigurowalna retencja kopii (H-03)
- **Zakres:** `ops/scripts/node-backup-config.sh`, `apps/api/src/subscriptions` (kopie), panel kopii w client-panel.
- **Kroki:** klient wybiera retencję w granicach planu (min. 28 dni w cenie — H-04), węzeł dostaje wartość w zadaniu,
  test strażnika `kopie-30-dni.spec.ts` dalej pilnuje minimum.
- **Gotowe gdy:** testy, opis w PR; test na węźle robi sesja z dostępem do węzła.
