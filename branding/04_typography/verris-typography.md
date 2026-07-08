# Verris — Typografia

## Kroje
| Rola | Font | Wagi | Użycie |
|---|---|---|---|
| Display / Logotyp | **Schibsted Grotesk** | 800, 900 | Nagłówki, logotyp „verris" (800, lowercase, letter-spacing -0.045em) |
| Tekst | **Hanken Grotesk** | 300, 400, 500, 600 | Akapity, UI, leady |
| Dane / Liczby | **JetBrains Mono** | 400, 500, 700 | Ceny, metryki, kod, faktury |

## Google Fonts
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&family=Hanken+Grotesk:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

## CSS
```css
:root{
  --display:'Schibsted Grotesk',system-ui,sans-serif;
  --text:'Hanken Grotesk',system-ui,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
}
h1,h2,h3,.logotype{font-family:var(--display);font-weight:800}
body,p{font-family:var(--text);font-weight:400}
.data,.price{font-family:var(--mono)}
.logotype{letter-spacing:-0.045em;text-transform:lowercase}
```

## Licencja
Wszystkie trzy kroje są dostępne na **SIL Open Font License 1.1** (darmowe do użytku komercyjnego, można hostować własne .woff2).
- Schibsted Grotesk — © Schibsted / Bold Decisions, OFL-1.1
- Hanken Grotesk — © Alfredo Marco Pradil, OFL-1.1
- JetBrains Mono — © JetBrains, OFL-1.1

## Self-hosting (.woff2)
Pliki .woff2 nie są dołączone (środowisko bez dostępu do sieci). Pobierz z Google Fonts
lub https://fontsource.org (paczki `@fontsource/schibsted-grotesk` itd.) i podłącz przez @font-face.
Zalecane podzbiory: latin + latin-ext (polskie znaki).
