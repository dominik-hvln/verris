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

## 4. Backlog (do zrobienia przy rozwoju — nie blokuje)

1. **`role="alert"` na pozostałych banerach błędów** — wzorzec z koszyka powtórzyć w
   formularzach ustawień, portfela i domen (wyszukiwanie: `border-rose-` + `{error}`).
2. **Ikonowe przyciski** — przejrzeć komponenty z samą ikoną; standard: `aria-label`
   (obecnie 51 użyć `aria-label`/`title` — pokrycie dobre, ale niepełne, np. część
   przycisków kopiowania w sekcjach hostingu).
3. **Drobny tekst pomocniczy** — `text-[10px]/[11px]` z `text-neutral-500` na jasnych
   kartach bywa blisko granicy 4,5:1; przy nowych widokach używać `neutral-400`+.
4. **Pułapki fokusa w modalach** — `ReConsentModal` i modale hostingu nie zamykają
   fokusa w obrębie dialogu (focus trap) ani nie wracają fokusem do wyzwalacza po
   zamknięciu; do wdrożenia wspólny hook (np. `useFocusTrap`).
5. **Klawiaturowa obsługa list rozwijanych własnej roboty** (jeśli są poza natywnym
   `<select>`) — przegląd `data-styled` Selectów pod strzałki/Escape.
6. **Test z czytnikiem** — smoke NVDA/VoiceOver na ścieżce: rejestracja → zakup hostingu
   → faktura; oraz test „tylko klawiatura" tej samej ścieżki.
7. **prefers-reduced-motion** — animacje (SpinBorder, przejścia) nie respektują
   preferencji ograniczenia ruchu; dodać wariant `motion-reduce:`.

## 5. Kiedy wrócić do tematu (obowiązkowo)

- Przekroczenie progu mikroprzedsiębiorcy (10 pracowników / 2 mln EUR) → pełna zgodność
  z ustawą, w tym **oświadczenie o dostępności** usługi i informacje w regulaminie.
- Przetargi/klienci publiczni żądający deklaracji EN 301 549 → sekcje 3–4 jako podstawa.
