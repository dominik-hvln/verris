# Tracker DPA z subprocesorami (art. 28 RODO)

> **Status:** DRAFT operacyjny. Cel: dopilnować, by z KAŻDYM subprocesorem była **podpisana/zaakceptowana
> umowa powierzenia (DPA)** przed produkcyjnym przetwarzaniem danych. Uzupełniać na bieżąco.
> **Data:** 2026-07-04. Źródło listy: [[subprocessors]].

## Status podpisania DPA

| Subprocesor | Rola / dane | DPA — jak zawrzeć | Status | Transfer poza EOG | Data |
|-------------|-------------|-------------------|--------|-------------------|------|
| **Stripe Payments Europe** | Płatności | Standardowe DPA online (Stripe DPA) | ☐ do akceptacji | Część infra US → SCC/DPF (w DPA Stripe) | — |
| **Dostawca VPS control-plane** (OVH/Hetzner/…) | Hosting całej aplikacji | DPA dostawcy (art. 28) | ☐ do podpisania | Potwierdzić lokalizację (EOG) | — |
| **Dostawca off-site backup** (S3/B2/R2) | Kopie zapasowe (zaszyfrowane) | DPA dostawcy | ☐ do podpisania | Wybrać dostawcę EOG | — |
| **OpenProvider** (rejestrator domen) | Rejestracja domen | DPA / regulamin | ☐ do potwierdzenia | — | — |
| **Google reCAPTCHA** (jeśli używane) | Anty-bot (IP) | Google Ads Data Processing Terms | ☐ warunkowo | USA → SCC/DPF | — |
| **hCaptcha / Cloudflare Turnstile** (alternatywa) | Anty-bot | DPA dostawcy | ☐ jeśli wybrane | EOG-friendly | — |
| **Ministerstwo Finansów — KSeF** | Faktury (obowiązek ustawowy) | Podstawa ustawowa, nie DPA | n/d | — | — |
| **GlitchTip** (self-hosted) | Monitoring błędów | Brak — dane u nas | n/d | — | — |
| **Postfix/SES (poczta)** | Wysyłka maili | DPA dostawcy jeśli relay zewnętrzny | ☐ jeśli external | EOG | — |

## Zasady

1. **Nowy subprocesor** = powiadomienie klientów min. **30 dni** przed (Regulamin, DPA §7) + wpis do
   `subprocessors.md` i do tej tabeli.
2. DPA musi obejmować: przedmiot/czas/charakter/cel, kategorie danych i osób, obowiązki procesora,
   subprocesory dalsze, transfery, pomoc administratorowi, usunięcie/zwrot danych, audyt.
3. **Blocker startu:** żaden subprocesor z danymi osobowymi klientów bez zawartego DPA.

## Do zrobienia przed pierwszym płatnym klientem

- [ ] Zaakceptować/podpisać DPA: Stripe, VPS, off-site backup, OpenProvider, (captcha wg wyboru), relay poczty (jeśli external).
- [ ] Zdecydować dostawcę captchy pod kątem transferu poza EOG (rekomendacja: hCaptcha/Turnstile jeśli priorytet = brak transferu).
- [ ] Zaktualizować `privacy.md` (tabela podmiotów) spójnie z tym trackerem.
