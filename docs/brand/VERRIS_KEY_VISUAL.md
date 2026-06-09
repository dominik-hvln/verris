# Verris — Key Visual (v1.0)

> Dokument źródłowy tożsamości wizualnej produktu **Verris** (hosting, panel klienta, węzły DA).
> Wersja 1.0 koduje istniejący wygląd `apps/client-panel` i rozszerza go o materiały
> operacyjne (strona domyślna hostingu, papiery firmowe, e-mail).

## 1. Marka w jednym zdaniu

**Verris** — nowoczesny, spokojny hosting z panelem w ciemnej oprawie; akcent **niebieski (sky)** na interakcje, **szmaragdowy (emerald)** na sukces, EKO i wyróżnienia domeny.

## 2. Logo

> **Status:** brak finalnego logo marki. W panelu jest **placeholder** (ikona z biblioteki UI).
> Docelowe logo powstanie w Claude Design — brief: [`CLAUDE_DESIGN_BRIEF.md`](CLAUDE_DESIGN_BRIEF.md).

### 2.1 Znak (mark) — docelowo (po projekcie identyfikacji)

Symbol zaprojektowany **od zera** pod Verris (hosting, panel, EKO). Placeholder deweloperski **nie** jest logo.

| Wariant | Plik | Użycie |
|--------|------|--------|
| Znak, jasny akcent | `docs/brand/assets/verris-logo-mark.svg` | Ciemne tła (panel, dark UI) |
| Znak, ciemny | `docs/brand/assets/verris-logo-mark-dark.svg` | Jasne tła (strona domyślna hostingu, druk) |
| Logotyp słowny | `docs/brand/assets/verris-logo-wordmark.svg` | Nagłówki, dokumenty |

**Clear space:** wysokość znaku × 0,5 z każdej strony.  
**Minimum size:** znak 24 px; słowo „Verris” 14 px wysokości liter.

### 2.2 Nie rób

- Nie rozciągaj znaku nierównomiernie.
- Nie zmieniaj kąta warstw ani grubości linii (stroke 2, round caps).
- Nie dodawaj cienia / gradientu na znak (gradient tylko na tle UI panelu).

## 3. Paleta kolorów

### 3.1 Core (panel produktu)

| Token | HEX | Rola |
|-------|-----|------|
| `ink` | `#0A0A0A` | Tło główne, hero dark |
| `surface` | `#121212` | Karty, sidebar, przyciski |
| `surface-elevated` | `#1A1A1A` | Hover, drugi poziom |
| `text-primary` | `#FAFAFA` | Nagłówki na ciemnym |
| `text-muted` | `#A3A3A3` | Opisy (≈ neutral-400) |
| `border-subtle` | `rgba(255,255,255,0.10)` | Obramowania na ciemnym |

### 3.2 Akcenty

| Token | HEX | Rola |
|-------|-----|------|
| `accent-sky` | `#38BDF8` | Linki, CTA secondary, ikona znaku na loginie |
| `accent-emerald` | `#10B981` | Sukces, EKO, **hero domeny** na stronie domyślnej |
| `accent-emerald-muted` | `rgba(16,185,129,0.15)` | Tła badge / bannerów |

### 3.3 Light (strona domyślna hostingu, druk)

| Token | HEX | Rola |
|-------|-----|------|
| `canvas` | `#F5F5F7` | Tło strony placeholder |
| `paper` | `#FFFFFF` | Karty, papier firmowy |
| `text-on-light` | `#171717` | Treść |
| `text-secondary` | `#525252` | Instrukcje |
| `line` | `#E5E5E5` | Separatory |

### 3.4 CSS (panel)

W `apps/client-panel/src/app/globals.css`:

```css
--brand-emerald: #10b981;
--brand-emerald-muted: rgba(16, 185, 129, 0.15);
```

## 4. Typografia

| Rola | Font | Wagi | Użycie |
|------|------|------|--------|
| UI / marketing PL | **Inter** | 400, 500, 600, 700, 800 | Panel, strona domyślna, e-mail |
| Monospace (rzadko) | system-ui monospace | 400 | Ścieżki `public_html`, logi |

**Skala (desktop):**

- Display / domena hero: 48–56 px / 800 / tracking -0.02em
- H1: 30 px / 800
- H2: 20 px / 700
- Body: 16 px / 400, line-height 1.6
- Caption: 13 px / 500

**Język:** polski jako domyślny w komunikacji klienta; angielski w dokumentacji technicznej ops.

## 5. Ikony i ilustracje

- Ikony UI: **Lucide** (spójnie z panelem), stroke 2.
- Ilustracja strony domyślnej: uproszczony „hosting stack” (warstwy + okno przeglądarki) — `ops/hosting-default-page/index.html` (inline SVG).
- Unikaj stockowych clipartów w stylu DirectAdmin (dźwig, koparka).

## 6. Komponenty UI (skrót)

- **Radius:** 12–16 px karty; 32 px „karta logowania”.
- **Przycisk primary (dark):** tło `#0a0a0a`, obramowanie gradientowe (SpinBorder), tekst biały.
- **Przycisk CTA (light hosting page):** wypełnienie `accent-emerald`, tekst `#0A0A0A`, uppercase tracking 0.05em.
- **Link:** `accent-sky` na dark; na light — `accent-emerald` lub underline.

## 7. Materiały firmowe

### 7.1 Papier firmowy (A4)

- Podgląd HTML: `docs/brand/assets/verris-letterhead.html` (druk: `@media print`).
- Margines treści: 25 mm; logo w lewym górnym rogu (wordmark + znak 32 px).
- Stopka: `verris.pl` · `panel.verris.pl` · `kontakt@verris.pl` · linia `#E5E5E5`.

### 7.2 Wizytówka (86 × 54 mm)

- Przód: znak + „Verris”, pod spodem „Hosting zarządzany”.
- Tył: imię, rola, e-mail, tel., QR → `https://panel.verris.pl`.

### 7.3 Podpis e-mail

```
[znak 24px] Verris — Hosting
Imię Nazwisko · rola
panel.verris.pl | kontakt@verris.pl
```

Kolory: tekst `#171717`, link `#10B981`.

## 8. Głos marki (copy)

- **Ton:** konkretny, partnerski, bez żargonu sprzedażowego.
- **Zwracanie się:** „Ty” w panelu klienta; na stronie technicznej hostingu — neutralnie („Pliki strony…”).
- **Nie:** „Something amazing will be constructed here”, „Powered by DirectAdmin”.

## 9. Zastosowania w repo

| Obszar | Ścieżka |
|--------|---------|
| Strona domyślna (nowe domeny DA) | `ops/hosting-default-page/index.html` |
| Instalacja na węźle | `ops/scripts/install-verris-default-page.sh` |
| Runbook | `ops/docs/VERRIS_DEFAULT_HOSTING_PAGE.md` |
| Panel klienta (referencja) | `apps/client-panel` — login, sidebar, `--brand-emerald` |
| DA skin (faza 2) | `ops/docs/DA_CUSTOM_SKIN_ROADMAP.md` |

## 10. Wersjonowanie

- **v1.0** (2026-06): pierwsza publikacja Key Visual + placeholder hostingu.
- Kolejne: pełny skin DA, landing `verris.pl`, Figma kit (opcjonalnie).
