# Verris — kolejne taski marketingowe (backlog, priorytetowany)

Stan na 2026-07-08. Strona verris.pl jest live (wielostronicowa, Payload CMS, pomiar Consent Mode v2
+ GTM). Landing `/przenies-strone` gotowy jako plik, ale **niewdrożony jako route** (patrz P0).
Poniżej backlog spinający SEO, kampanie płatne i lejek. Konwencja kampanii: `[kanał]-[cel]-[produkt]-[RRRRMM]`.

## Teraz (P0 — odblokowuje resztę)

1. **Wdrożyć `/przenies-strone`** w apce (naprawa martwych CTA + kluczowa strona konwersyjna i SEO).
2. **`og:image`** domyślny + dla bloga (udostępnienia i wygląd w Google/social).
3. **Import konwersji GA4 → Google Ads + Enhanced Conversions** (blocker startu Google Ads z lipca).
4. **Akceptacja Google Ads Data Processing Terms** (blocker startu).
5. **Google Search Console**: potwierdzić własność (domena zweryfikowana), zgłosić `sitemap.xml`,
   sprawdzić indeksację nowych podstron i pokrycie.

## Wkrótce (P1 — wzrost widoczności i uruchomienie kampanii)

6. **Structured data** wg audytu: BreadcrumbList, BlogPosting, Service, FAQPage, wzbogacony
   Organization; `/llms.txt` + `/pricing.md`; reguły botów AI w `robots.txt`.
7. **Plan kampanii Meta Ads** (`meta-awareness/traffic-hosting-202607`) — cel, budżet, targetowanie,
   struktura zestawów, zdarzenia (kreacje gotowe w `marketing/kreacje/`). Para dla Google Ads.
8. **Sekwencja e-mail** migracyjno-onboardingowa (lead → pierwsza wpłata): copy, timing, logika,
   PKE/RODO (double opt-in, link rezygnacji). Skill `marketing:email-sequence`.
9. **Start Google Ads Search** `gads-search-hosting-202607` (500–1000 zł/mies) — po odblokowaniu 3–5.
10. **Produkcja bloga** wg `verris-blog-content-plan.md` — 3–4 pillary jako drafty do akceptacji,
    potem 2 wpisy/tydz.

## Potem (P1/P2 — skalowanie i autorytet)

11. **Remarketing** (Google + Meta) — listy odbiorców tylko po zgodzie (Consent Mode v2); kampanie
    `*-remarketing-hosting-*` na porzucone koszyki/odwiedzających cennik.
12. **Digital PR / cytowania AI** — obecność w źródłach trzecich (opinie Google, WebHostingTalk.pl,
    grupy FB, ewentualnie porównywarki hostingu). Najkrótsza droga do cytowań w AI (marki 6,5× częściej
    cytowane z zewnątrz).
13. **Podpięcie globalsów CMS pod front** (Navigation, Pricing, Site Settings) — jak zrobiona stopka,
    żeby całą stronę dało się edytować z panelu bez deployu.
14. **Autor + data aktualizacji w blogu** (E-E-A-T) i schema `author`.
15. **TTF Schibsted/Hanken → `branding/04_typography/`** i przegenerowanie kreacji rastrowych
    (dziś Work Sans jako zamiennik roboczy); publikacja lockupów logo z wordmarkiem.
16. **Autoryzacja OAuth Adspirer** (realne CPC, stage'owanie kampanii jako wstrzymanych).

## Higiena / ciągłe

17. **`marketing:brand-review`** każdej finalnej treści (strona, LP, wpisy, reklamy) przed publikacją.
18. **Miesięczny raport wyników** (`marketing:performance-report`) — GA4 + Ads + Search Console,
    z zastrzeżeniem niepełnych danych przez Consent Mode.
19. **Monitoring miejsca na dysku serwera** (deploy zostawia stare obrazy — cron `docker image prune`).

## Zależności (co blokuje co)

- Kampanie płatne (7, 9, 11) zależą od: 1 (LP), 3–4 (konwersje/terms), 2 (kreatywne OG).
- Wzrost organiczny (6, 10, 12) niezależny — można ruszać równolegle od zaraz.
- Sekwencja e-mail (8) zależy od: formularza leada na LP/kontakt (mamy `generate_lead`) + dostawcy
  wysyłek (SES) i potwierdzenia double opt-in.

## Rekomendacja na najbliższy sprint

Kolejność: **1 → 2 → (3,4,5 po stronie Dominika) → 6 (structured data) → 7 (plan Meta) → 8 (e-mail)
→ 10 (pierwsze pillary bloga)**. Punkty 1, 2, 6 mogę wdrożyć w kodzie od ręki; 7, 8, 10 to
deliverable'y treściowe, które przygotuję i przepuszczę przez brand-review.
