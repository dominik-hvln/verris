# Dokumenty prawne Verris — wersja 1.1.0 (do publikacji)

> **Status: DO PUBLIKACJI jako 1.1.0 — jedna publikacja wszystkich zmian (decyzja Dominika 3.11.2026, przed 7.12.2026), zastąpi 1.0.0/1.0.1 obowiązujące na produkcji.** Lista zmian dla klientów, instrukcja publikacji i punkty „DO SPRAWDZENIA”: `ZMIANY_1.0.0-1.1.0.md`. Projekty `DO_ZATWIERDZENIA_beta-zgloszenia.md`, `…_okres-probny-ograniczenia.md` i `…_asystent-ai.md` są już wbudowane w `terms.md`/`privacy.md`. Historia robocza (1.0.0 z 7.07.2026): komplet dokumentów pod stan faktyczny — hosting współdzielony, VPS, domeny (Openprovider), e-mail marketing, program resellerski; płatności Stripe i Paynow + Portfel; infrastruktura Hetzner (UE); poczta Amazon SES (region UE); anty-bot Cloudflare Turnstile; faktury KSeF 2.0.

## Pliki

- `terms.md` — Regulamin świadczenia usług (ramowy + rozdziały usług: hosting §10, VPS §11, domeny §12, e-mail marketing §13, reseller §14 + SLA §15 + AUP/DSA §16–17 + odstąpienie §21 + załącznik: wzór formularza odstąpienia). Kind: `TERMS`.
- `privacy.md` — Polityka prywatności (art. 13–14 RODO, nazwani podprocesorzy, retencje zgodne z kodem, formularze verris.pl, beta, EKO, asystent AI). Kind: `PRIVACY`.
- `ZMIANY_1.0.0-1.1.0.md` — lista zmian dla klientów (do maila przy ponownej akceptacji), instrukcja publikacji w panelu admina, punkty „DO SPRAWDZENIA”.
- `cookies.md` — Polityka cookies (art. 399–402 PKE + ePrivacy). Kind: `COOKIES`.
- `dpa.md` — Umowa powierzenia (art. 28 RODO) + Załącznik 1 (TOM) + Załącznik 2 (subprocesorzy). Kind: `DPA`.
- `subprocessors.md` — źródłowa lista podwykonawców + wewnętrzny tracker statusu DPA (sekcji „Status umów" nie publikować klientom).
- `../consumer-info.md` — informacje przedumowne dla konsumenta (art. 12 upk): do koszyka i e-maila potwierdzającego zakup, poza panelem `/legal/*`.
- `../ANALIZA_LUK_PRAWNYCH_2026-07-07.md` — analiza luk + lista działań operacyjnych przed publikacją.

## Publikacja

1. Wykonaj działania operacyjne z `ANALIZA_LUK_PRAWNYCH_2026-07-07.md` §3 (minimum: skrzynka `abuse@verris.pl`, akceptacja DPA u subprocesorów: Hetzner, Stripe, AWS, Cloudflare, Openprovider).
2. Na prod: `./ops/scripts/prod-legal-publish-live.sh` → publikuje wersję `1.1.0` (wymusza ponowną akceptację istniejących użytkowników). Szczegóły i kolejność kroków: `ZMIANY_1.0.0-1.1.0.md` cz. B.
3. Smoke re-consent (LEG-4) + weryfikacja stron `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/dpa`.

## Utrzymanie

- Zmiana subprocesora → e-mail do klientów min. 30 dni wcześniej (DPA §7) + aktualizacja `subprocessors.md`, `privacy.md` pkt 5.1 i `dpa.md` Załącznik 2.
- Zmiana regulaminu → wyłącznie z ważnych przyczyn z katalogu §24 ust. 1 regulaminu, zawiadomienie 30 dni, publikacja nowej wersji (re-consent).
- §10 ust. 5 (kopie 7/30 dni, samodzielne przywracanie, Tryb EKO) wpisany w 1.1.0 — zmiana okresów kopii wymaga aktualizacji regulaminu.
- Kredyty Verris rozliczane jako bon jednego przeznaczenia (SPV) — rekomendowana interpretacja indywidualna KIS (analiza, pkt 2.1/3.9).
