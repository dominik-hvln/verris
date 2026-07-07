# Dokumenty prawne Verris — wersja 1.0.0 (finalna)

> **Status: FINAL 1.0.0 (2026-07-07).** Komplet dokumentów przygotowany pod stan faktyczny potwierdzony przez operatora: hosting współdzielony (DirectAdmin/CloudLinux), VPS (Hetzner Cloud), domeny (Openprovider), e-mail marketing, program resellerski; płatności Stripe + Portfel; infrastruktura Hetzner (EOG); poczta Amazon SES (region UE); anty-bot Cloudflare Turnstile; faktury KSeF 2.0 (integracja własna). Podstawy prawne zaktualizowane do stanu na lipiec 2026: PKE (cookies — art. 399–402), DSA (moderacja, notice-and-action), likwidacja platformy ODR, Omnibus (telefon, najniższa cena z 30 dni).

## Pliki

- `terms.md` — Regulamin świadczenia usług (ramowy + rozdziały usług: hosting §10, VPS §11, domeny §12, e-mail marketing §13, reseller §14 + SLA §15 + AUP/DSA §16–17 + odstąpienie §21 + załącznik: wzór formularza odstąpienia). Kind: `TERMS`.
- `privacy.md` — Polityka prywatności (art. 13–14 RODO, nazwani subprocesorzy, retencje zgodne z kodem). Kind: `PRIVACY`.
- `cookies.md` — Polityka cookies (art. 399–402 PKE + ePrivacy). Kind: `COOKIES`.
- `dpa.md` — Umowa powierzenia (art. 28 RODO) + Załącznik 1 (TOM) + Załącznik 2 (subprocesorzy). Kind: `DPA`.
- `subprocessors.md` — źródłowa lista podwykonawców + wewnętrzny tracker statusu DPA (sekcji „Status umów" nie publikować klientom).
- `../consumer-info.md` — informacje przedumowne dla konsumenta (art. 12 upk): do koszyka i e-maila potwierdzającego zakup, poza panelem `/legal/*`.
- `../ANALIZA_LUK_PRAWNYCH_2026-07-07.md` — analiza luk + lista działań operacyjnych przed publikacją.

## Publikacja

1. Wykonaj działania operacyjne z `ANALIZA_LUK_PRAWNYCH_2026-07-07.md` §3 (minimum: skrzynka `abuse@verris.pl`, akceptacja DPA u subprocesorów: Hetzner, Stripe, AWS, Cloudflare, Openprovider).
2. Na prod: `./ops/scripts/prod-legal-publish-live.sh` → publikuje wersję `1.0.0` (wymusza re-consent istniejących użytkowników).
3. Smoke re-consent (LEG-4) + weryfikacja stron `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/dpa`.

## Utrzymanie

- Zmiana subprocesora → e-mail do klientów min. 30 dni wcześniej (DPA §7) + aktualizacja `subprocessors.md`, `privacy.md` pkt 5.1 i `dpa.md` Załącznik 2.
- Zmiana regulaminu → wyłącznie z ważnych przyczyn z katalogu §24 ust. 1 regulaminu, zawiadomienie 30 dni, publikacja nowej wersji (re-consent).
- Wdrożenie backupów kont klientów z self-restore (task S-1) → aktualizacja §10 ust. 5 regulaminu (zmiana na korzyść klienta — §24 ust. 4, bez trybu 30 dni).
- Kredyty Verris rozliczane jako bon jednego przeznaczenia (SPV) — rekomendowana interpretacja indywidualna KIS (analiza, pkt 2.1/3.9).
