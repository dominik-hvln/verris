# Rejestr czynności przetwarzania (RCPD) — art. 30 ust. 1 i 2 RODO

> **Wersja 1.0 · stan na 7 lipca 2026 r.** Dokument operacyjny — aktualizować przy każdej
> zmianie stacku, subprocesora lub retencji. Spójny z Polityką prywatności 1.0.0,
> DPA 1.0.0 i listą subprocesorów (docs/legal/drafts/).
>
> **Administrator:** HVLN Dominik Kowalski, Zacisze 2A, 65-775 Zielona Góra,
> NIP 9292069367, REGON 521024260 · **Kontakt RODO:** rodo@verris.pl · tel. +48 511 589 465
>
> Verris występuje w **dwóch rolach**: jako **administrator** (sekcja A — dane klientów:
> konto, płatności, bezpieczeństwo, poczta zespołu) oraz jako **podmiot przetwarzający**
> (sekcja B — dane hostowane przez klientów, objęte DPA, art. 30 ust. 2).

## A. Czynności, w których Verris jest ADMINISTRATOREM

| # | Czynność | Cel | Podstawa prawna | Kategorie osób | Kategorie danych | Odbiorcy / subprocesorzy | Retencja | Transfer poza EOG |
|---|----------|-----|-----------------|----------------|------------------|--------------------------|----------|-------------------|
| A1 | Rejestracja i prowadzenie konta | świadczenie usług, uwierzytelnianie | art. 6(1)(b) | klienci, użytkownicy subkont (IAM) | e-mail, hash hasła (bcrypt), imię/nazwisko, telefon (opc.), sekret 2FA (AES-256-GCM), passkeys | Hetzner Online GmbH (control-plane, DE/FI) | usunięcie konta: 14 dni grace → anonimizacja; konta DA usuwane ≤180 dni po anonimizacji | nie |
| A2 | Rozliczenia i płatności (Portfel, Stripe) | realizacja płatności | art. 6(1)(b); art. 6(1)(c) — podatki | klienci | dane do faktury (nazwa, NIP, adres), id płatności Stripe, 4 ostatnie cyfry karty, saldo Portfela | Stripe Payments Europe (IE); Hetzner | faktury 5 lat; dedupe webhooków Stripe 90 dni | Stripe: transfer wspierający do USA — SCC + DPF |
| A3 | Faktury ustrukturyzowane (KSeF 2.0, FA(3)) | obowiązek ustawowy | art. 6(1)(c) | klienci (nabywcy) | dane sprzedawcy/nabywcy, kwoty, NIP | Ministerstwo Finansów — KSeF (odbiorca ustawowy) | 5 lat | nie |
| A4 | Obsługa zgłoszeń (tickety, reklamacje) | wsparcie, obowiązki reklamacyjne | art. 6(1)(b), (f); art. 6(1)(c) | klienci | treść zgłoszeń, załączniki, historia | Hetzner; MinIO (self-hosted) | do usunięcia konta; roszczenia do 6 lat | nie |
| A5 | Bezpieczeństwo i audyt | wykrywanie nadużyć, art. 32 | art. 6(1)(f), (c) | klienci, użytkownicy | logi logowań (IP, UA), dziennik audytu, alerty bezpieczeństwa | Hetzner | LoginAttempt 180 dni; AuditLog: IP/UA anonimizowane po 24 mies. | nie |
| A6 | Ochrona anty-bot (Cloudflare Turnstile) | zapobieganie nadużyciom rejestracji/logowania | art. 6(1)(f) | odwiedzający formularze | adres IP, sygnały przeglądarki | Cloudflare, Inc. | wg polityki Cloudflare | tak — SCC + DPF |
| A7 | Komunikacja transakcyjna i marketing własny | powiadomienia (umowa); newsletter (zgoda) | art. 6(1)(b); art. 6(1)(a) | klienci | e-mail, treść wiadomości, status doręczenia, historia zgód | Amazon Web Services EMEA (SES, region UE) | logi doręczeń 12 mies.; zgody: czas konta + przedawnienie | AWS: dostęp wspierający z USA — SCC + DPF |
| A8 | Rejestracja i obsługa domen | wykonanie umowy (usługa Domeny) | art. 6(1)(b) | klienci (abonenci domen) | dane abonenta: nazwa, adres, e-mail, telefon | Hosting Concepts B.V. (Openprovider, NL — procesor); rejestry domen (NASK, EURid… — odrębni administratorzy) | czas rejestracji domeny + wymogi rejestru | zależnie od rejestru |
| A9 | Zgłoszenia DSA (abuse) i decyzje moderacyjne | obowiązki z art. 16–18 DSA | art. 6(1)(c), (f) | zgłaszający, klienci | treść zgłoszenia, dane zgłaszającego, uzasadnienia decyzji | Hetzner; skrzynka abuse@verris.pl | czas postępowania + przedawnienie roszczeń | nie |
| A10 | Poczta zespołu @verris.pl | komunikacja operacyjna (kontakt@, rodo@, abuse@) | art. 6(1)(b), (f), (c) | korespondenci, klienci | treść korespondencji, adresy, metadane | Hetzner (Postfix/Dovecot/SOGo — self-hosted) | wg potrzeb operacyjnych; sprawy RODO/DSA: czas postępowania + przedawnienie | nie |
| A11 | Kopie zapasowe | ciągłość działania (art. 32) | art. 6(1)(c), (f) | wszystkie kategorie A1–A10 | zaszyfrowane (age) dumpy DB, pliki | MinIO (self-hosted) + Hetzner Storage Box/Object Storage (off-site, WORM) | 14–28 dni rotacja; po usunięciu danych źródłowych nadpisanie ≤90 dni | nie (klucz odszyfrowania przechowywany odrębnie) |
| A12 | Statystyki i marketing internetowy (GA4/GTM, Google Ads, Meta Pixel) | pomiar serwisu i reklam — **wyłącznie po zgodzie z banera cookies** | art. 6(1)(a) | odwiedzający, którzy wyrazili zgodę | identyfikatory cookies (_ga, _gcl_au, _fbp/_fbc), IP, zdarzenia | Google Ireland (GA4/GTM — procesor; Ads — odrębny adm.); Meta Platforms Ireland (Pixel — współadministrowanie zbierania, art. 26) | GA4: zdarzenia do 14 mies.; cookies wg Polityki cookies | tak — SCC + DPF (Google LLC / Meta Platforms Inc.) |

## B. Czynności, w których Verris jest PODMIOTEM PRZETWARZAJĄCYM (art. 30 ust. 2)

| # | Czynność | W imieniu (administrator) | Kategorie przetwarzania | Środki ochrony | Podstawa |
|---|----------|---------------------------|-------------------------|----------------|----------|
| B1 | Hosting współdzielony (pliki, bazy, poczta użytkowników klienta) | Klient Verris | przechowywanie, transmisja, kopie zapasowe — **bez analizy treści** | CageFS/LVE, WAF (ModSecurity/CRS), FTPS, backup off-site szyfrowany | DPA 1.0.0 + Regulamin §10 |
| B2 | Serwery VPS (dane na serwerze klienta) | Klient Verris | udostępnienie infrastruktury (Hetzner Cloud); klient administruje samodzielnie | izolacja wirtualizacji, sieć, snapshoty wg planu | DPA 1.0.0 + Regulamin §11 |
| B3 | E-mail marketing (listy odbiorców kampanii klienta) | Klient Verris | przechowywanie list, wysyłka (SES), obsługa rezygnacji | limity wysyłki, monitoring skarg/odrzuceń, auto-wstrzymanie | DPA 1.0.0 + Regulamin §13 |
| B4 | Usługi dla klientów Resellera | Reseller (lub jego klienci — dalsze powierzenie) | jak B1–B3 w modelu odsprzedaży | jak wyżej | DPA 1.0.0 §1 + Regulamin §14 |

## C. Ogólny opis środków technicznych i organizacyjnych (art. 32)

Passkeys/2FA (wymuszone dla personelu), bcrypt, AES-256-GCM na sekretach, RBAC + least privilege,
VPN WireGuard przed panelami wewnętrznymi, izolacja kont (CageFS/LVE), WAF, FTPS, rate limiting,
anty-bot (Turnstile), dziennik audytu z anonimizacją IP po 24 mies., kopie zapasowe szyfrowane
(age) off-site z WORM i testami odtwarzania, monitoring 24/7, procedura naruszeń
(`INCIDENT_RESPONSE.md`: PUODO ≤72 h, klienci-administratorzy ≤24 h per DPA). Szczegóły: DPA
Załącznik 1.

## D. Przeglądy i decyzje

- Przegląd rejestru: przy każdej zmianie subprocesora/retencji, nie rzadziej niż co 6 miesięcy.
- A12 aktywna dopiero po włączeniu GTM/Pixela (Variables `GTM_ID`/`META_PIXEL_ID`); przed
  włączeniem: akceptacja Google Ads Data Processing Terms i Meta Controller Addendum + publikacja
  polityki cookies opisującej te narzędzia (już przygotowana).
- IOD: niewyznaczony — brak przesłanek z art. 37 (do rewizji przy istotnym wzroście skali);
  punkt kontaktowy: rodo@verris.pl.
- Decyzja o statusie NIS2/KSC i zgłoszenie do wykazu: termin ~3.10.2026 (patrz
  `nis2-ksc-assessment.md`).
