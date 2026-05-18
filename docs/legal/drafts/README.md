# Drafty dokumentów prawnych Verris

> **Status: DRAFTY przygotowawcze do Sprintu 1 (Legal/RODO).** NIE PUBLIKOWAĆ ani nie traktować jako wiążące prawnie do czasu lawyer review. Dane administratora HVLN zostały uzupełnione, ale przed publikacją nadal trzeba potwierdzić subprocessors, publiczne URL-e dokumentów i akceptację prawnika.

Wymagany lawyer review: **regulamin, polityka prywatności, polityka cookies, DPA**. Po review treści zostaną zaimportowane do tabeli `LegalDocument` w Sprincie 1 (task L-01) jako wersja `1.0.0`.

## Pliki

- `terms.md` — Regulamin świadczenia usług hostingowych (B2C + B2B).
- `privacy.md` — Polityka prywatności i przetwarzania danych osobowych (RODO art. 13-14).
- `cookies.md` — Polityka plików cookies i podobnych technologii (ePrivacy + RODO).
- `dpa.md` — Umowa powierzenia przetwarzania danych osobowych (RODO art. 28, dla B2B).

## Założenia merytoryczne (do zatwierdzenia z prawnikiem)

1. **Jurysdykcja:** prawo polskie. Sąd właściwy dla siedziby Verris (po uzupełnieniu adresu).
2. **Konsumenci (B2C):** prawo odstąpienia 14 dni z wyjątkiem usług świadczonych natychmiastowo po zgodzie konsumenta (hosting jest „zaczęty" przy provisioningu — wymagamy explicit zgody na rozpoczęcie świadczenia przed terminem 14 dni, w zamian za co odstąpienie nie obejmuje już wykorzystanej części okresu).
3. **B2B:** brak automatycznego prawa odstąpienia, możliwość wypowiedzenia ze skutkiem na koniec okresu rozliczeniowego.
4. **Faktury:** wystawiane w PLN, zgodnie z polskim prawem podatkowym (5 lat retencji, JPK_V7, CIT-8, faktura ustrukturyzowana KSeF od 2026 — uzupełnić aktualne wymogi w lawyer review).
5. **Wirtualne kredyty (1 zł = 1 K):** to **bony przedpłacone w rozumieniu art. 30 ust. 4 ustawy o VAT** (jednolitego przeznaczenia, bo określa miejsce świadczenia i stawkę VAT). VAT należny w momencie wpłaty na portfel, nie w momencie konsumpcji. **Lawyer review TWARDO wymagany dla tego punktu** — to nasza interpretacja, ale moment opodatkowania bonów jest w polskim prawie nietrywialny.
6. **Subprocessors:** Stripe (Irlandia, EU), SMTP provider (TBD: Resend EU / Postmark EU / SES EU), DigitalOcean / Hetzner (EU) jako infrastruktura, optionalnie AWS S3 EU dla backupów. Wszyscy w EOG → bez konieczności SCC.
7. **Retencja:**
   - Konto aktywne — bezterminowo (do usunięcia).
   - Konto usunięte → grace 14 dni (możliwość przywrócenia) → anonimizacja. Po anonimizacji zostają tylko: faktury (5 lat, polski wymóg), audit log (12 miesięcy), payment ledger zanonimizowany (5 lat).
   - LoginAttempt — 90 dni.
   - SecurityAlert — 12 miesięcy.
   - Backupy — 30 dni rolling.
   - Email log — 12 miesięcy (deliverability/dispute resolution).
8. **Marketing:** opt-in z double opt-in. Domyślnie OFF dla wszystkich kategorii poza transakcyjnymi.
9. **Cookies analityczne:** preferowany Plausible (cookieless analytics) — wtedy nie trzeba banner'a opt-in dla analityki, tylko niezbędne. Jeśli zdecydujemy się na GA4 / Hotjar — pełen opt-in cookie banner wymagany.
10. **Naruszenie ochrony danych (data breach):** zgłoszenie do PUODO w 72h (art. 33 RODO), notyfikacja użytkowników w przypadku „wysokiego ryzyka" (art. 34). Procedura wewnętrzna w `incident-response.md` (Sprint 1, task L-12).

## Co po lawyer review

1. Prawnik wprowadza swoje poprawki w tych plikach (lub zwraca z komentarzami).
2. Versionujemy: `terms.md` → `terms-1.0.0.md` z zatwierdzoną treścią.
3. Sprint 1 task L-01: import wszystkich 4 dokumentów do `LegalDocument` (kind, version, locale=`pl`, body, isCurrent=true).
4. Sprint 1 task L-02: publikacja `/legal/terms`, `/legal/privacy`, `/legal/cookies` z renderem Markdown z bazy.
5. Sprint 1 task L-08: wystawienie DPA jako PDF na żądanie B2B (admin → "wygeneruj DPA dla klienta X").
