# Verris — Brand Kit

Kompletny pakiet identyfikacji wizualnej Verris (hosting „Skaluj świadomie.").

## Struktura
```
01_logo/        Znak, wordmark, lockupy — SVG + PNG @1x/@2x (mono dark/light)
02_favicon/     favicon.ico, favicon-16/32.png, apple-touch-icon.png (180)
03_colors/      Paleta: .css (:root --verris-*), .json, .md
04_typography/  Kroje, wagi, link Google Fonts, @font-face, licencja
05_patterns/    Pattern: tile SVG, warianty 1920×1080 (right/down/opacity), PNG, zasady
06_icons/       24 ikony custom (SVG, currentColor + wersje mint) + ICONS.md
07_illustrations/ Element generatywny (SVG/PNG/WebP) + wersja animowana HTML
08_kv/          Verris-Brand-Guidelines.pdf + mockupy PNG
```

## Ważne — fonty i PNG wordmarku
Środowisko generujące nie miało dostępu do internetu ani do firmowych fontów, dlatego:
- **Cała geometria (znak, favicony, pattern, ikony) jest dokładna** — gotowe SVG i ostre PNG.
- **Wordmark i lockupy** dostarczono jako **SVG** (z poprawnym Schibsted Grotesk przez Google Fonts).
  Aby otrzymać pixel-perfect **PNG @1x/@2x/@4x** wordmarku/lockupów, otwórz
  `01_logo/EXPORT-wordmark-lockup.html` na komputerze **z internetem** i kliknij przyciski pobierania.
- Do druku/offline: otwórz SVG w narzędziu graficznym i **zamień tekst na krzywe** (outline).
- Pliki **.woff2 nie są dołączone** — pobierz z Google Fonts / fontsource (OFL 1.1), patrz `04_typography`.
- W `Verris-Brand-Guidelines.pdf` tekst złożono zastępczo krojem DejaVu (poprawne polskie znaki);
  docelowo używaj Schibsted/Hanken/JetBrains.

## Kolory (skrót)
Pine #0C1A14 · Green #0F7A52 · Mint #34E5A0 · Paper #F4F4EE · Eco #08130E

## Logo
Znak „P3": klin (V z wcięciem) — wcięcie zawsze w kolorze tła (fill-rule: evenodd).
Wordmark „verris": Schibsted Grotesk 800, lowercase, letter-spacing −0.045em.
