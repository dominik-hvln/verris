# Makieta verris.pl — październik 2026 (zaakceptowana 07.10.2026)

Pliki `.dc.html` to makiety z kanwy projektowej (Design Component: inline style, logika w `<script type="text/x-dc">`).
Czytaj je jako referencję układu, treści i zachowania — nie kopiuj inline stylów; w kodzie używamy
komponentów z `apps/www/src/app/(frontend)/components/ui.tsx` i klas z `globals.css` (sekcja „Komponenty 2026-10”).

| Plik | Strona |
|---|---|
| `Main.dc.html` / `MainMobile.dc.html` | strona główna — desktop / telefon (390 px) |
| `Hosting.dc.html` / `HostingMobile.dc.html` | /hosting (kalkulator dopłaty) |
| `Status.dc.html` / `StatusMobile.dc.html` | strona statusu (apps/status-page) |

Zasady: mobile-first (style bazowe pod 360–390 px, większe ekrany przez `min-width`), brak poziomego przewijania,
cele dotyku ≥ 44 px, pattern marki `apps/www/public/pattern.svg` (w makietach podany jako `/_blob/…` — to adres z kanwy).
Fakty tylko z repo (ceny w `Pricing.tsx`, parametry w `specyfikacja/page.tsx`, flaga `SPEC_PO_WERYFIKACJI` w `lib/oferta.ts`).
Wpisy w nawiasach kwadratowych w makietach to miejsca do uzupełnienia — nie publikować jako treść.
