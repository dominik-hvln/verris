# Kreacje — gads-search-hosting-202607

Wygenerowane 2026-07-08 z brand kitu (`branding/`): paleta, znak i pattern wektorowo 1:1.

## Status fontów — WERSJE ROBOCZE

JetBrains Mono (ceny/etykiety) = font brandowy 1:1. Nagłówki i „verris" w lockupach:
**Work Sans Bold jako zamiennik Schibsted Grotesk 800** (sandbox bez dostępu do Google Fonts,
build w repo zawiera tylko Inter). Aby przegenerować finały: wrzuć pliki `.ttf`
Schibsted Grotesk (800) i Hanken Grotesk (400) do `branding/04_typography/` i daj znać.
Do czasu podmiany nie publikować lockupów logo (gads/verris-logo-*) — wordmark musi być
w Schibsted Grotesk.

## Pliki

| Plik | Format | Zastosowanie |
|---|---|---|
| gads/verris-gads-1200x628.png | 1,91:1 | Rozszerzenie graficzne Google Ads |
| gads/verris-gads-1200x1200.png | 1:1 | Rozszerzenie graficzne Google Ads |
| gads/verris-logo-1200x1200.png | 1:1 | Logo firmowe Google Ads (po podmianie fontu: bez zmian — sam znak) |
| gads/verris-logo-1200x300.png | 4:1 | Logo poziome Google Ads (wordmark — czeka na Schibsted) |
| meta/verris-meta-1080x1080.png | 1:1 | Meta feed |
| meta/verris-meta-1080x1350.png | 4:5 | Meta feed (preferowany) |
| meta/verris-meta-1080x1920.png | 9:16 | Stories / Reels |
| display/verris-display-300x250.png | — | GDN remarketing |
| display/verris-display-336x280.png | — | GDN remarketing |
| display/verris-display-728x90.png | — | GDN remarketing |
| display/verris-display-160x600.png | — | GDN remarketing |
| display/verris-display-320x100.png | — | GDN mobile |

## Wersje HTML (animowane) — `html/`

`verris-html-300x250.html`, `verris-html-728x90.html`, `verris-html-160x600.html` —
rotująca miętowa końcówka („Hosting bez gwiazdek/pułapek/dopłat…"), shake CTA co 4 s,
`prefers-reduced-motion` respektowane. Self-contained (fonty systemowe, clickTag,
meta ad.size) — gotowe do spakowania w zip HTML5, gdy konto Google Ads spełni wymogi
(90+ dni, ~9 000 USD wydatków). Podgląd: `preview.html`.

## Zgodność (sprawdzone)

Ceny brutto z dopiskiem „brutto" na każdej kreacji z ceną; brak promocji (Omnibus nie dotyczy);
„darmowa migracja" ma pokrycie (migrator + pomoc bezpłatne w ramach hostingu — landing
doprecyzowuje warunek); zero green claims, zero „100% uptime", zero nazw konkurencji.
Kontrast: Paper/Mint na Pine > 4,5:1.

Generator: `verris_creatives.py` (pycairo) — w outputs sesji Cowork; przy podmianie fontów
wystarczy ponowne uruchomienie.
