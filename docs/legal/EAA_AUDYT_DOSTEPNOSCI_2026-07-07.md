# Audyt dostępności (EAA / WCAG 2.1 AA) — panel klienta Verris

> **Data:** 7 lipca 2026 · **Zakres:** apps/client-panel (ścieżka klienta: rejestracja,
> logowanie, zakup, zarządzanie usługami, strony /legal/*). Panele staff/admin poza
> zakresem (narzędzia wewnętrzne — EAA ich nie obejmuje).

## 1. Kontekst prawny

Ustawa z 26.04.2024 o zapewnianiu spełniania wymagań dostępności niektórych produktów
i usług (wdrożenie European Accessibility Act) obowiązuje od 28.06.2025 i obejmuje
m.in. **usługi handlu elektronicznego** — czyli proces zakupowy Verris. **Mikroprzedsiębiorcy
świadczący usługi są zwolnieni** (art. 4 ust. 2 ustawy), więc HVLN obecnie nie podlega
obowiązkowi — audyt wykonano wyprzedzająco: zwolnienie wygasa z chwilą przekroczenia progów
(10 pracowników lub 2 mln EUR obrotu/sumy bilansowej), a dostępność procesu zakupowego jest
argumentem przy klientach B2B i publicznych. Punkt odniesienia: WCAG 2.1 AA (EN 301 549).

## 2. Co jest dobrze (potwierdzone w kodzie)

- `lang="pl"` na `<html>`; wszystkie `<img>` mają atrybut `alt`.
- Semantyczny landmark `<main>` w layoutach; nagłówki hierarchiczne w widokach.
- Toasty przez sonner (wbudowane `aria-live`), modale z `role="dialog"`/`aria-modal`.
- Nowe komponenty (baner cookies, switche zgód) od początku z `role="switch"`,
  `aria-checked`, obsługą klawiatury i `focus-visible`.
- Formularze zakupowe: pola opakowane w `<label>`, błędy prezentowane tekstowo.
- Kontrast głównego tekstu (biały/neutral-300 na tle #0a0a0a) znacznie powyżej 4,5:1.

## 3. Naprawione w tym audycie (commit 2026-07-07)

| # | Kryterium WCAG | Problem | Naprawa |
|---|----------------|---------|---------|
| 1 | 2.4.1 Bypass Blocks | brak skip-linku | link „Przejdź do treści" jako pierwszy element fokusowalny (root layout) + `id="main"` na `<main>` |
| 2 | 2.4.7 Focus Visible | fokus niewidoczny na wielu elementach (`outline-none` bez zamiennika) | globalny `:focus-visible` outline w `globals.css` (nie zmienia UX myszy; lokalne ringi mają pierwszeństwo) |
| 3 | 4.1.2 Name, Role, Value | `Toggle` (autoskalowanie/ECO) jako zwykły button — czytnik nie ogłasza stanu | `role="switch"` + `aria-checked` + widoczny fokus |
| 4 | 4.1.3 Status Messages | błąd zamówienia w koszyku nieogłaszany | `role="alert"` na banerze błędu w formularzu zakupu |
| 5 | 1.3.1 / 3.3.2 | oświadczenia konsumenckie — nowe checkboxy | natywne `<input type="checkbox">` w `<label>` (pełna dostępność out-of-the-box) |

## 4. Backlog — stan po wdrożeniu 2026-07-07

1. ✅ **`role="alert"` na banerach błędów** — dodane w: program poleceń, tokeny API,
   analityka stron, kreator stron (wybór obrazu), modal re-consent; komunikaty sukcesu
   oznaczone `role="status"`, ikony dekoracyjne `aria-hidden`.
2. ✅ **Ikonowe przyciski** — przegląd wykonany; przyciski kopiowania mają widoczne
   etykiety tekstowe („Kopiuj"/„Skopiowano"), pływający trigger cookies ma `aria-label`.
   Przy nowych komponentach nadal obowiązuje standard `aria-label`.
3. ⏳ **Drobny tekst pomocniczy** — zasada na przyszłość (bez zmian wstecznych):
   `text-[10px]/[11px]` łączyć z `text-neutral-400`+, nie `neutral-500`.
4. ✅ **Pułapki fokusa w modalach** — wspólny hook `hooks/use-focus-trap.ts`
   (Tab/Shift+Tab w pętli, fokus startowy, powrót fokusa do wyzwalacza, opcjonalny
   Escape); wdrożony w `ReConsentModal` (bez Escape — modal blokujący) i w modalu
   preferencji cookies (Escape zamyka tylko po zapisanej decyzji, jak przycisk ✕).
   Modale hostingu: stosować hook przy kolejnych zmianach w tych widokach.
5. ✅ **Klawiaturowa obsługa własnego Selecta** — audyt `components/panel/select.tsx`:
   strzałki, Home/End, Enter/Spacja, Escape, Tab, typeahead — kompletna. Poprawiono
   wzorzec ARIA: `role="combobox"` + `aria-activedescendant`/`aria-controls` na
   przycisku (zamiast na liście), `id` na listboxie — czytnik ogłasza aktywną opcję.
6. ⏳ **Test z czytnikiem** — smoke NVDA/VoiceOver na ścieżce: rejestracja → zakup
   hostingu → faktura; oraz test „tylko klawiatura" tej samej ścieżki (do wykonania
   ręcznie przed startem).
7. ✅ **prefers-reduced-motion** — globalna reguła w `globals.css`
   (`@media (prefers-reduced-motion: reduce)` — animacje i przejścia ~0 ms,
   `scroll-behavior: auto`); obejmuje SpinBorder, `animate-in`, przejścia Tailwind.

## 5. Kiedy wrócić do tematu (obowiązkowo)

- Przekroczenie progu mikroprzedsiębiorcy (10 pracowników / 2 mln EUR) → pełna zgodność
  z ustawą, w tym **oświadczenie o dostępności** usługi i informacje w regulaminie.
- Przetargi/klienci publiczni żądający deklaracji EN 301 549 → sekcje 3–4 jako podstawa.
