# DEV_HANDOFF.md — Wdrożenie Key Visual **Verris** w `ekohost`

Dokument wykonawczy dla developera / agenta Cursor. Stack docelowy: **Next.js 15 (App Router) · Tailwind v4 (`@theme inline`) · React**.
Cel: zastąpić tymczasową ikonę i kolorystykę w `apps/client-panel/` finalnym brandingiem z paczki **Verris-Brand-Kit**.

> Wszystkie kolory pochodzą wyłącznie z palety KV Verris. **Nie wymyślaj nowych wartości.**
> Paczka źródłowa: `Verris-Brand-Kit.zip` (foldery `01_logo … 08_kv`).

---

## 1. Executive summary

- Tymczasowa ikona UI w panelu klienta zostaje **w całości** zastąpiona znakiem Verris (klin „V" z miętowym wcięciem) — w sidebarze, na loginie i jako favicon.
- Zmienia się cała paleta: z dotychczasowego neutralnego ciemnego (`#0A0A0A`) na **głęboką zieleń Verris** (`Page #091410`, `Pine #0C1A14`, karty `#0E1F17`), akcent **Mint `#34E5A0`**.
- Primary CTA przechodzi na **Mint `#34E5A0` z ciemnym tekstem `#0C1A14`** (kontrast ~11:1, AAA).
- Typografia: nagłówki **Schibsted Grotesk 800**, treść **Hanken Grotesk 400**, liczby/ceny **JetBrains Mono** — wszystko z `next/font/google`, subset `latin-ext` (PL).
- Login dostaje subtelne tło patternem Verris (krycie 6–8%), pojawia się badge **EKO** w nowych kolorach i tagline „Skaluj świadomie.".

---

## 2. Manifest plików

| Plik źródłowy (w paczce) | Docelowa ścieżka w repo | Format | Uwagi |
|---|---|---|---|
| `01_logo/verris-mark-mono-light.svg` | `apps/client-panel/public/brand/verris-mark.svg` | SVG | Biały klin + miętowe wcięcie — na ciemnym tle (sidebar, login) |
| `01_logo/verris-mark-mono-dark.svg` | `apps/client-panel/public/brand/verris-mark-dark.svg` | SVG | Pine klin — na jasnym tle (light mode, e-maile) |
| `01_logo/verris-mark-tile.svg` | `apps/client-panel/public/brand/verris-tile.svg` | SVG | Zielony kafel app-icon (PWA, splash) |
| `02_favicon/favicon.ico` | `apps/client-panel/src/app/favicon.ico` | ICO 16/32/48 | App Router wykrywa automatycznie |
| `02_favicon/favicon-32.png` | `apps/client-panel/src/app/icon.png` | PNG 32 | Konwencja `icon.png` (Next 15) |
| `02_favicon/apple-touch-icon.png` | `apps/client-panel/src/app/apple-icon.png` | PNG 180 | Konwencja `apple-icon.png` |
| `05_patterns/verris-pattern-tile.svg` | `apps/client-panel/public/brand/verris-pattern.svg` | SVG (seamless) | Tło login / empty states |
| `06_icons/*.svg` (24 szt., `currentColor`) | `apps/client-panel/src/components/icons/` | SVG → React | Importować jako komponenty (patrz §8) |
| `07_illustrations/verris-bloom.svg` | `apps/client-panel/public/brand/verris-bloom.svg` | SVG | Empty states / 404 (opcjonalnie) |
| `03_colors/verris-colors.css` | (referencja) | CSS | Źródło tokenów do §3 |
| `08_kv/Verris-Brand-Guidelines.pdf` | `docs/brand/` | PDF | Dokumentacja, nie build |

> **Wordmark „verris"** renderujemy jako **żywy tekst** w foncie Schibsted Grotesk (z `next/font`), nie jako SVG — patrz §5. SVG wordmarku z paczki (`verris-wordmark-*.svg`) jest tylko do materiałów poza panelem.

---

## 3. Design tokens → CSS

### 3.1 Tabela tokenów

| Token semantyczny | HEX | RGB | Użycie w UI |
|---|---|---|---|
| `--verris-pine` | `#0C1A14` | 12, 26, 20 | Sidebar, najgłębszy atrament, tekst na jasnym |
| `--verris-page` | `#091410` | 9, 20, 16 | Główne tło panelu (dark) |
| `--verris-card` | `#0E1F17` | 14, 31, 23 | Karty, panele, aktywny item nav |
| `--verris-green` | `#0F7A52` | 15, 122, 82 | Tło znaku, primary CTA w light mode |
| `--verris-mid` | `#1FA871` | 31, 168, 113 | Zieleń pośrednia, obramowanie EKO |
| `--verris-mint` | `#34E5A0` | 52, 229, 160 | **Akcent główny**: CTA, linki, focus ring, aktywny nav |
| `--verris-tip` | `#5BFFC0` | 91, 255, 192 | Hover akcentu, highlight |
| `--verris-paper` | `#F4F4EE` | 244, 244, 238 | Tekst na ciemnym, tło light mode |
| `--verris-stone` | `#9AA39C` | 154, 163, 156 | Tekst drugorzędny / placeholdery |
| `--verris-body` | `#AFBDB6` | 175, 189, 182 | Tekst akapitowy na ciemnym |
| `--verris-eco` | `#08130E` | 8, 19, 14 | Tło badge/sekcji EKO |
| `--verris-hairline` | `rgba(255,255,255,.08)` | — | Obramowania 1px na ciemnym |

### 3.2 Blok do wklejenia w `globals.css`

```css
/* === Verris — base palette (źródło prawdy) === */
:root {
  --verris-pine:#0C1A14; --verris-page:#091410; --verris-card:#0E1F17;
  --verris-green:#0F7A52; --verris-mid:#1FA871; --verris-mint:#34E5A0; --verris-tip:#5BFFC0;
  --verris-paper:#F4F4EE; --verris-stone:#9AA39C; --verris-body:#AFBDB6; --verris-eco:#08130E;
  --verris-hairline:rgba(255,255,255,.08);
}

/* === LIGHT (domyślny :root aplikacji) === */
:root {
  --background:var(--verris-paper);
  --foreground:var(--verris-pine);
  --card:#FFFFFF;
  --card-foreground:var(--verris-pine);
  --muted:#E7E9E2;
  --muted-foreground:#566058;
  --primary:var(--verris-green);
  --primary-foreground:var(--verris-paper);
  --accent:var(--verris-mint);
  --accent-foreground:var(--verris-pine);
  --border:rgba(12,26,20,.10);
  --ring:var(--verris-green);
  /* sidebar pozostaje ciemny także w light mode (premium) */
  --sidebar:var(--verris-pine);
  --sidebar-foreground:var(--verris-body);
  --sidebar-primary:var(--verris-mint);
  --sidebar-accent:var(--verris-card);
  --sidebar-accent-foreground:var(--verris-paper);
  --sidebar-border:var(--verris-hairline);
  --eko:var(--verris-mid);
  --eko-bg:var(--verris-eco);
  --eko-foreground:var(--verris-tip);
}

/* === DARK === */
.dark {
  --background:var(--verris-page);
  --foreground:var(--verris-paper);
  --card:var(--verris-card);
  --card-foreground:var(--verris-paper);
  --muted:var(--verris-pine);
  --muted-foreground:var(--verris-stone);
  --primary:var(--verris-mint);
  --primary-foreground:var(--verris-pine);
  --accent:var(--verris-mint);
  --accent-foreground:var(--verris-pine);
  --border:var(--verris-hairline);
  --ring:var(--verris-mint);
  --sidebar:var(--verris-pine);
  --sidebar-foreground:var(--verris-body);
  --sidebar-primary:var(--verris-mint);
  --sidebar-accent:var(--verris-card);
  --sidebar-accent-foreground:var(--verris-paper);
  --sidebar-border:var(--verris-hairline);
  --eko:var(--verris-mid);
  --eko-bg:var(--verris-eco);
  --eko-foreground:var(--verris-tip);
}
```

### 3.3 Mapowanie: stary token → nowy token

> ⚠️ Nazwy starych tokenów to założenie (typowy szablon shadcn/Tailwind). **Patrz BLOCKER #1** — zweryfikuj realne nazwy w `globals.css` przed `sed`/zamianą.

| Stary (zakładany) | Nowy |
|---|---|
| `--brand-emerald` / `--brand` | `var(--verris-mint)` (dark) / `var(--verris-green)` (light) |
| `--background: #0A0A0A` | `var(--verris-page)` |
| `--foreground: #FAFAFA` | `var(--verris-paper)` |
| `--card` | `var(--verris-card)` |
| `--primary` | `var(--verris-mint)` |
| `--primary-foreground` | `var(--verris-pine)` |
| `--accent` | `var(--verris-mint)` |
| `--border` | `var(--verris-hairline)` |
| `--ring` | `var(--verris-mint)` |
| `--sidebar*` | jak w bloku 3.2 |

### 3.4 Tailwind v4 — `@theme inline`

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-border: var(--sidebar-border);
  --color-eko: var(--eko);
  --color-eko-bg: var(--eko-bg);
  --color-eko-foreground: var(--eko-foreground);

  --font-display: var(--font-schibsted);
  --font-sans: var(--font-hanken);
  --font-mono: var(--font-jetbrains);
}
```

Tokeny mapowane na Tailwind: `background`, `foreground`, `primary`, `primary-foreground`, `accent`, `accent-foreground`, `border`, `ring`, `card`, `muted`, `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-accent`, `sidebar-border`, `eko*`. (Dają klasy `bg-primary`, `text-accent`, `border-border`, `bg-sidebar`, `text-eko-foreground` itd.)

---

## 4. Typografia

| Rola | Font | Wagi | Subset |
|---|---|---|---|
| Display / nagłówki / logotyp | **Schibsted Grotesk** | 700, 800, 900 | `latin`, `latin-ext` (PL: ąęółżźćń) |
| Treść / UI | **Hanken Grotesk** | 300, 400, 500, 600 | `latin`, `latin-ext` |
| Dane / ceny / kod | **JetBrains Mono** | 400, 500, 700 | `latin`, `latin-ext` |

### 4.1 `next/font/google` (zalecane — auto-fetch w buildzie)

```ts
// apps/client-panel/src/app/fonts.ts
import { Schibsted_Grotesk, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';

export const schibsted = Schibsted_Grotesk({
  subsets: ['latin', 'latin-ext'], weight: ['700','800','900'],
  variable: '--font-schibsted', display: 'swap',
});
export const hanken = Hanken_Grotesk({
  subsets: ['latin', 'latin-ext'], weight: ['300','400','500','600'],
  variable: '--font-hanken', display: 'swap',
});
export const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'], weight: ['400','500','700'],
  variable: '--font-jetbrains', display: 'swap',
});
```

> Self-host (gdy CI bez sieci — BLOCKER #3): pobierz `.woff2` z fontsource (`@fontsource/schibsted-grotesk` itd., OFL-1.1), umieść w `apps/client-panel/public/fonts/` i podłącz przez `@font-face` z `font-display:swap` oraz `unicode-range` dla latin-ext.

### 4.2 Skala typograficzna

| Styl | Font / waga | Rozmiar | line-height | letter-spacing |
|---|---|---|---|---|
| Display | Schibsted 800 | 48px | 1.05 | -0.03em |
| H1 | Schibsted 800 | 32px | 1.10 | -0.02em |
| H2 | Schibsted 700 | 24px | 1.20 | -0.01em |
| H3 | Schibsted 600 | 18px | 1.30 | 0 |
| Body | Hanken 400 | 16px | 1.60 | 0 |
| Body-sm | Hanken 400 | 14px | 1.55 | 0 |
| Caption | Hanken 400 | 13px | 1.50 | 0.01em |
| Data / cena | JetBrains 500 | wg kontekstu | 1.40 | 0 |

### 4.3 Wordmark a UI

Wordmark **używa Schibsted Grotesk** (ten sam font co nagłówki). W logotypie obowiązuje: `lowercase`, `font-weight:800`, `letter-spacing:-0.045em`. To **jedyny** kontekst z tym trackingiem — nie stosować -0.045em w body. Wordmark renderujemy żywym tekstem (font z `next/font`), nie z CSS body.

---

## 5. Logo — zasady użycia w panelu

Zalecany komponent `<Logo variant="mark|lockup" />`: inline SVG znaku (`fill="currentColor"` dla klina, miętowe wcięcie na sztywno) + opcjonalny wordmark jako `<span>` w foncie display.

```tsx
// apps/client-panel/src/components/logo.tsx
export function VerrisMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Verris">
      <path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z"
            fill="currentColor" fillRule="evenodd" />
      <path d="M44 55 L56 55 L50 69 Z" fill="none" stroke="#34E5A0" strokeWidth="1.6" />
    </svg>
  );
}
export function VerrisLockup() {
  return (
    <span className="inline-flex items-center gap-2">
      <VerrisMark className="h-7 w-7 text-[--verris-paper]" />
      <span className="font-display font-extrabold lowercase tracking-[-0.045em] text-[--verris-paper] text-2xl">
        verris
      </span>
    </span>
  );
}
```

| Kontekst | Element | Rozmiar | Wariant koloru |
|---|---|---|---|
| Login (nagłówek) | `lockup` (mark + wordmark) | wysokość 40px, max-width 220px | klin biały / wordmark Paper, wcięcie Mint |
| Sidebar **rozwinięty** | `lockup` | wysokość 28px | jw. |
| Sidebar **zwinięty** | `mark` | 28×28px | klin biały, wcięcie Mint |
| Tło ciemne `#0A0A0A`/`#091410` | `verris-mark.svg` (mono-light) | — | biały klin |
| Tło jasne (light, e-mail) | `verris-mark-dark.svg` | — | Pine klin |
| Favicon / PWA | `favicon.ico` / `verris-tile.svg` | 16–180px | zielony kafel |

**Clear space:** min. odstęp = wysokość wcięcia klina ze wszystkich stron.
**Min size:** mark 24px, lockup 80px szerokości.
**Zakazy:** nie rozciągać, nie zmieniać proporcji, nie obracać, nie dodawać cienia, nie zmieniać koloru wcięcia (zawsze Mint `#34E5A0`).

---

## 6. Komponenty do zmiany (konkretny diff opisowy)

### `apps/client-panel/src/app/globals.css`
- Wstaw bloki z §3.2 (base + `:root` light + `.dark`) — **zastępując** istniejące definicje `--background`, `--foreground`, `--primary`, `--accent`, `--border`, `--ring`, `--sidebar*`.
- Dodaj/zmień `@theme inline` wg §3.4 (dopisz `--color-eko*`, `--font-display/sans/mono`).
- Ustaw `body { background:var(--background); color:var(--foreground); font-family:var(--font-sans); }`.

### `apps/client-panel/src/app/layout.tsx`
- Zaimportuj fonty z §4.1; na `<html>` dodaj `className={\`${schibsted.variable} ${hanken.variable} ${jetbrains.variable}\`}`.
- `metadata`:
  ```ts
  export const metadata = {
    title: 'Verris — Panel klienta',
    description: 'Hosting, który liczy realne zużycie.',
    icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
  };
  export const viewport = { themeColor: '#091410' };
  ```
- Usuń import starego favicona/ikony UI, jeśli był podpięty ręcznie.

### `apps/client-panel/src/app/(auth)/login/page.tsx`
- **Usuń** placeholder z biblioteki UI (np. `<SomeIcon/>`); wstaw `<VerrisLockup/>` z §5.
- Tło strony: `bg-[--verris-page]`; nakładka patternu (§7) z `opacity:.07`.
- Karta logowania: `bg-card border border-border rounded-2xl`.
- Subtitle pod logo: „Zaloguj się do panelu Verris." (`text-stone`).
- CTA „Zaloguj się": `bg-primary text-primary-foreground hover:bg-[--verris-tip]` (dark: Mint+Pine).
- Linki („Nie pamiętasz hasła?"): `text-accent hover:text-[--verris-tip]`.
- Input focus: `ring-2 ring-[--verris-mint]`.

### `apps/client-panel/src/app/dashboard/layout.tsx`
- Sidebar: `bg-sidebar text-sidebar-foreground border-r border-sidebar-border`.
- Logo w sidebarze: zwinięty → `<VerrisMark/>`, rozwinięty → `<VerrisLockup/>`.
- Nav item domyślny: `text-sidebar-foreground hover:bg-sidebar-accent`.
- Nav item **aktywny**: `bg-sidebar-accent text-sidebar-accent-foreground` + lewy pasek `border-l-2 border-[--verris-mint]` + ikona `text-[--verris-mint]`.
- Topbar: `bg-[--verris-page] border-b border-border`.

### Pozostałe komponenty
- **Przyciski primary:** `bg-primary text-primary-foreground`, hover `--verris-tip`. Secondary: `bg-card text-foreground border border-border`.
- **Linki w treści:** `text-accent`, podkreślenie na hover.
- **Badge EKO:** `bg-eko-bg text-eko-foreground border border-[--verris-mid] rounded-full px-2 py-0.5` + ikona `eko.svg`. Komunikat liczy **drzewa**, nie CO2.
- **`SpinBorder`:** zostaje jako komponent, ale gradient przefarbuj na `--verris-mid → --verris-mint → --verris-tip` (usuń stary niebieski/emerald).

---

## 7. Pattern i element generatywny

**Plik:** `apps/client-panel/public/brand/verris-pattern.svg` (seamless, `verris-pattern-tile.svg`).

**Gdzie wolno:** tło ekranu logowania, empty states, ekran 404/500, sekcje marketingowe.
**Gdzie ZAKAZ:** za tabelami danych, formularzami, modalami, listami faktur (czytelność).

**Parametry CSS (subtelnie, pod treścią):**
```css
.verris-pattern-bg {
  background-image: url('/brand/verris-pattern.svg');
  background-size: 320px auto;     /* gęstość; 240–360px */
  background-repeat: repeat;
  opacity: .07;                    /* UI: 0.05–0.08; hero/marketing: do 0.14 */
  mix-blend-mode: normal;          /* na ciemnym tle Pine */
  pointer-events: none;
}
```
Stosuj jako **osobną warstwę** (absolutnie pozycjonowany `div` pod treścią) z maską zanikania w dół:
`mask-image: linear-gradient(to bottom,#000 0,#000 30%,transparent 60%)`.

**Element generatywny** (`verris-bloom.svg`): tylko empty states / 404 / onboarding. Wersja animowana (`07_illustrations/verris-bloom-generative.html`) **nie** wchodzi do panelu w pierwszym PR (perf).

---

## 8. Ikony

**Decyzja:** używamy **własnego zestawu Verris** (24 ikony, `06_icons/`, `stroke=currentColor`, `stroke-width:2`, 24×24, linecap/linejoin round, akcent Mint). Braki uzupełniamy **Lucide** dopasowanym do tej samej metryki, kolorowanym przez `currentColor`.

- **Rozmiar:** 20px (nav, inline) / 24px (nagłówki sekcji).
- **Stroke:** 2 (przy 24px), 1.75 dozwolone przy 16px.
- **Kolor:** `currentColor` (dziedziczy z tekstu); stan aktywny/akcent → `text-[--verris-mint]`. Nie hardcodować HEX w komponentach UI.

Mapowanie (custom → odpowiednik Lucide dla spójności gdy brakuje):

| Verris (plik) | Znaczenie | Lucide fallback |
|---|---|---|
| `serwery.svg` | Serwery | `server` |
| `bazy-danych.svg` | Bazy danych | `database` |
| `domeny.svg` | Domeny | `globe` |
| `dns.svg` | DNS | `network` |
| `ssl.svg` | SSL / certyfikat | `shield-check` |
| `poczta.svg` | Poczta | `mail` |
| `ftp.svg` | FTP | `folder-input` |
| `manager-plikow.svg` | Manager plików | `folder` |
| `kopie-zapasowe.svg` | Kopie zapasowe | `hard-drive` |
| `cron.svg` | Zadania cron | `clock` |
| `statystyki.svg` | Statystyki | `bar-chart-3` |
| `uptime.svg` | Uptime | `activity` |
| `bezpieczenstwo.svg` | Bezpieczeństwo | `shield` |
| `ustawienia.svg` | Ustawienia | `settings` |
| `portfel.svg` | Portfel / płatności | `wallet` |
| `support.svg` | Wsparcie | `life-buoy` |
| `zgoszenia.svg` | Zgłoszenia / tickety | `ticket` |
| `eko.svg` | EKO / drzewa | `leaf` |
| `energia.svg` | Energia / zużycie | `zap` |
| `wzrost.svg` | Wzrost | `trending-up` |
| `skalowanie.svg` | Skalowanie | `move-diagonal` |
| `auto-skalowanie.svg` | Auto-skalowanie | `gauge` |
| `anty-chmura.svg` | Hosting (anty-chmura) | `cloud-off` |
| `program-partnerski.svg` | Program partnerski | `users` |

---

## 9. Strona placeholder hostingu — `ops/hosting-default-page/index.html`

Statyczny HTML (bez Next/`next/font`) → fonty z linku Google Fonts. **Light mode.**

- Tło: `--verris-paper #F4F4EE`; tekst: `--verris-pine #0C1A14`.
- Logo: `verris-mark-dark.svg` (Pine klin) + wordmark „verris" (Schibsted 800).
- Akcent / link: `--verris-green #0F7A52`, hover `--verris-mid #1FA871`.
- Ilustracja/tło: pattern colorway **paper** (`verris-pattern-uniform-paper`) jako warstwa `opacity:.06`.
- Font: `<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@800&family=Hanken+Grotesk:wght@400;600&display=swap" rel="stylesheet">`.
- **Bez zmian:** tokeny domeny typu `|DOMAIN|`, `|IP|`, `|USER|` itd. — zostaw 1:1.

---

## 10. Komunikacja / copy (skrót)

- **Tagline pod logo (login):** „Skaluj świadomie." (`text-stone`, caption).
- **Login subtitle:** „Zaloguj się do panelu Verris."
- **Stopka panelu (jedno zdanie):** „Verris — hosting, który liczy realne zużycie."
- Ton: konkret + liczby, bez korpo-mowy; EKO = realne drzewa, nie CO2.

---

## 11. Checklist wdrożenia (kolejność)

1. Rozpakuj `Verris-Brand-Kit.zip`; skopiuj pliki wg manifestu (§2) do `public/brand/`, `src/app/`.
2. Dodaj `src/app/fonts.ts` (§4.1) i podłącz zmienne fontów w `layout.tsx` na `<html>`.
3. Zaktualizuj `metadata` + `viewport.themeColor` w `layout.tsx`; usuń stary favicon.
4. Wklej bloki tokenów do `globals.css` (§3.2), zastępując stare zmienne.
5. Zaktualizuj `@theme inline` (§3.4) + `body` (font/bg/fg).
6. Dodaj komponent `logo.tsx` (§5).
7. Podmień placeholder ikony na `<VerrisLockup/>` w `login/page.tsx`; ustaw tło/CTA/linki.
8. Zaktualizuj `dashboard/layout.tsx`: sidebar, logo zwinięty/rozwinięty, stany nav.
9. Przefarbuj przyciski primary, linki, badge EKO, `SpinBorder`.
10. Dodaj warstwę patternu (§7) na loginie i empty states.
11. Podmień ikony nav na zestaw Verris (§8), `currentColor`.
12. Zaktualizuj `ops/hosting-default-page/index.html` (§9), zachowując `|TOKENY|`.
13. Uruchom test plan wizualny (§12); popraw kontrast jeśli < AA.
14. (Opcjonalnie później) `admin-panel/`, `staff-panel/` — ten sam zestaw tokenów.

---

## 12. Test plan wizualny

- [ ] Login desktop — logo, pattern 7%, CTA Mint+Pine, focus ring miętowy
- [ ] Login mobile — lockup nie ucina się, karta `bg-card`
- [ ] Dashboard sidebar — zwinięty (mark) / rozwinięty (lockup), aktywny item Mint
- [ ] Favicon w karcie przeglądarki (16/32) + apple-icon na iOS
- [ ] Kontrast WCAG **AA**: CTA `#0C1A14` na `#34E5A0` ≈ **11:1** (AAA ✔); body `#AFBDB6` na `#091410` ≈ **9.6:1** ✔; secondary `#9AA39C` na `#091410` ≈ **7.2:1** ✔
- [ ] Placeholder hostingu — light mode, logo Pine, tokeny `|DOMAIN|` nienaruszone
- [ ] Dark/light toggle — oba motywy spójne, brak resztek starego `#0A0A0A`/emerald
- [ ] Pattern NIE pojawia się za tabelami/formularzami

---

## 13. Nie wdrażaj / out of scope (pierwszy PR)

- Reklamy / formaty display (`09 Reklamy` z KV).
- Szablony social media, OG image, karuzele (`10 Social`).
- Merch, materiały drukowane (`11`).
- Animowany element generatywny (`verris-bloom-generative.html`) w runtime panelu.
- Brand book / guidelines jako podstrona w panelu.
- `admin-panel/`, `staff-panel/` (osobny, późniejszy PR).

---

## ⚠️ BLOCKERY (developer musi dopytać właściciela marki)

1. **Realne nazwy tokenów w `globals.css`** — mapowanie w §3.3 zakłada `--brand-emerald`/standard shadcn. Potrzebna aktualna lista zmiennych, by zamiana była 1:1.
2. **Domyślny motyw panelu** — czy panel startuje w `dark` czy `light`? Wpływa na to, który blok (`:root` vs `.dark`) jest aktywny i jaki kolor ma primary CTA (Mint vs Green).
3. **Self-host fontów dla CI bez sieci** — paczka **nie zawiera `.woff2`**. Jeśli build jest air-gapped, trzeba dograć pliki z fontsource (OFL-1.1) do `public/fonts/`; `next/font/google` wymaga sieci w buildzie.
4. **Wordmark jako outline-SVG** — paczka ma wordmark zależny od fontu (Schibsted). Jeśli potrzebny wordmark „na krzywych" (e-maile, podpisy bez fontu) — trzeba go wyeksportować (brak w paczce).
5. **Logo monochromatyczne 1-kolor (bez Mint)** — wszystkie warianty mają miętowe wcięcie. Jeśli UI wymaga wersji całkowicie 1-kolorowej (np. wygaszony stan), potrzebna decyzja/eksport.

---

## Prompt dla Cursora

> Zaimplementuj branding **Verris** w `apps/client-panel/` zgodnie z `DEV_HANDOFF.md` (ten plik w repo). Pracuj sekcjami w kolejności z §11 (Checklist). Najpierw skopiuj assety wg Manifestu (§2) do `public/brand/` i `src/app/`, potem dodaj `src/app/fonts.ts` i podłącz fonty w `layout.tsx`, ustaw `metadata`/`viewport.themeColor`. Wklej tokeny z §3.2 do `globals.css`, zastępując istniejące zmienne — **przed zamianą wypisz mi realne nazwy starych tokenów i potwierdź mapowanie z §3.3 (BLOCKER #1)** oraz dopytaj, czy panel jest domyślnie w trybie `dark` czy `light` (BLOCKER #2). Zaktualizuj `@theme inline` (§3.4). Dodaj komponent `logo.tsx` (§5), podmień placeholder ikony UI na `<VerrisLockup/>` w `login/page.tsx`, zaktualizuj `dashboard/layout.tsx` (sidebar, stany nav), przefarbuj przyciski primary, linki, badge EKO i `SpinBorder`. Dodaj warstwę patternu wg §7 (tylko login/empty states). Użyj wyłącznie kolorów HEX z §3.1 — nie dodawaj żadnych nowych. Na koniec przejdź test plan z §12 (zwróć szczególną uwagę na kontrast WCAG AA na CTA i tekście). Nie ruszaj rzeczy z §13. Po implementacji pokaż mi diff per plik i listę ewentualnych pozostałych blockerów.
