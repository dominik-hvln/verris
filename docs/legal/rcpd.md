# Rejestr czynności przetwarzania (RCPD) — art. 30 ust. 1 RODO

> **Status:** DRAFT roboczy do przeglądu przez IOD/prawnika. Utrzymywać na bieżąco.
> **Administrator:** HVLN Dominik Kowalski, Zacisze 2A, 65-775 Zielona Góra, NIP 9292069367, REGON 521024260.
> **Kontakt RODO:** iod@hvln.pl · **Ostatnia aktualizacja:** 2026-07-04
>
> Verris występuje w **dwóch rolach**: jako **administrator** (dane klientów: konto, płatności)
> oraz jako **podmiot przetwarzający** (dane, które klient hostuje — objęte DPA, art. 30 ust. 2 — patrz sekcja B).

## A. Czynności, w których Verris jest ADMINISTRATOREM

| # | Czynność przetwarzania | Cel | Podstawa prawna | Kategorie osób | Kategorie danych | Odbiorcy / subprocesorzy | Retencja | Transfer poza EOG |
|---|------------------------|-----|-----------------|----------------|------------------|--------------------------|----------|-------------------|
| A1 | Rejestracja i prowadzenie konta | Świadczenie usługi, uwierzytelnianie | art. 6(1)(b) — umowa | Klienci, subkonta (IAM) | e-mail, hash hasła (bcrypt), imię/nazwisko, telefon (opc.), 2FA secret (AES-256-GCM), passkeys | dostawca VPS (control-plane) | do usunięcia konta + 30 dni grace, potem anonimizacja | nie |
| A2 | Rozliczenia i płatności | Realizacja płatności, portfel | art. 6(1)(b), art. 6(1)(c) (podatki) | Klienci | dane do faktury (nazwa, NIP, adres), id płatności, ost. 4 cyfry karty, saldo portfela | Stripe (EOG), KSeF/MF | faktury 5 lat (prawo podatkowe) | Stripe: część infrastruktury US — SCC/DPF (do potwierdzenia) |
| A3 | Wystawianie faktur ustrukturyzowanych | Obowiązek KSeF 2.0 | art. 6(1)(c) | Klienci (nabywcy) | dane sprzedawcy/nabywcy, kwoty | Ministerstwo Finansów (KSeF) | 5 lat | nie |
| A4 | Obsługa zgłoszeń (tickety) | Wsparcie techniczne | art. 6(1)(b), art. 6(1)(f) | Klienci | treść zgłoszeń, załączniki, historia | dostawca VPS, MinIO (self-hosted) | do usunięcia konta + retencja audytu | nie |
| A5 | Bezpieczeństwo i audyt | Wykrywanie nadużyć, art. 32 | art. 6(1)(f), art. 6(1)(c) | Klienci, użytkownicy | logi logowań (IP, UA), AuditLog | dostawca VPS | LoginAttempt 180 dni; AuditLog IP anonimizowane po 24 mies. | nie |
| A6 | Ochrona anty-bot | Zapobieganie nadużyciom rejestracji/logowania | art. 6(1)(f) | Odwiedzający formularze | adres IP, zdarzenia interakcji | dostawca captcha (reCAPTCHA/hCaptcha/Turnstile) | wg dostawcy captchy | reCAPTCHA (Google) → USA: SCC/DPF; alternatywa hCaptcha/Turnstile (EOG) |
| A7 | Marketing (opt-in) | Newsletter, informacje o produkcie | art. 6(1)(a) — zgoda | Klienci (zgoda) | e-mail, preferencje, historia zgód | Postfix/SES (EOG) | do wycofania zgody | nie |
| A8 | Monitoring błędów runtime | Utrzymanie niezawodności (art. 32) | art. 6(1)(f) | Klienci (kontekst błędu) | userId, ścieżka, typ błędu | GlitchTip (self-hosted) | ring buffer/retencja GlitchTip | nie |
| A9 | Kopie zapasowe | Ciągłość działania (art. 32) | art. 6(1)(c), art. 6(1)(f) | Wszystkie kategorie z A1–A5 | zaszyfrowane (age) dumpy DB | MinIO + dostawca off-site (S3) | 14–28 dni (WORM off-site) | nie (klucz odszyfrowania osobno) |

## B. Czynności, w których Verris jest PODMIOTEM PRZETWARZAJĄCYM (art. 30 ust. 2)

| # | Czynność | W imieniu (administrator) | Kategorie przetwarzania | Środki ochrony | Podstawa |
|---|----------|---------------------------|-------------------------|----------------|----------|
| B1 | Hosting danych klienta (pliki, bazy, poczta jego użytkowników) | Klient Verris | przechowywanie, transfer, udostępnianie infrastruktury; **bez analizy treści** | CageFS/LVE izolacja, FTPS, WAF, szyfrowanie sekretów, backup off-site szyfrowany | DPA (art. 28) + Regulamin |

## C. Ogólny opis technicznych i organizacyjnych środków bezpieczeństwa (art. 32)

Passkeys/2FA, wymuszenie MFA dla staff, bcrypt + HIBP, AES-256-GCM na sekretach, izolacja kont
(CageFS/LVE), WAF (ModSecurity/OWASP CRS), VPN WireGuard przed panelami wewnętrznymi, rate-limiting
(Redis), anty-bot, ochrona outbound-spam (auto-cordon), backupy szyfrowane off-site + WORM + test
odtwarzania, monitoring (Prometheus/Grafana/GlitchTip), procedura naruszeń 72h (`INCIDENT_RESPONSE.md`),
audyt dostępu. Szczegóły: raport gotowości produkcyjnej + `OCENA_PRAWNA_I_BEZPIECZENSTWO`.

## D. Do uzupełnienia / decyzje IOD

- Potwierdzić podstawę transferu poza EOG dla Stripe (SCC/DPF) i wybór dostawcy captchy (reCAPTCHA vs hCaptcha/Turnstile — patrz [[subprocessors]]).
- Ocenić obowiązek wyznaczenia **IOD** (art. 37) — przy hostingu i przetwarzaniu na dużą skalę często zalecany.
- Zweryfikować retencje z realnym harmonogramem (`retention.scheduler.ts`).
