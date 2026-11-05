# Rejestr czynności przetwarzania (RCPD) — art. 30 ust. 1 i 2 RODO

> **Wersja 1.3 · stan na 3 listopada 2026 r. (projekt — obowiązuje od publikacji Polityki prywatności 1.2.0)** (1.3: A14–A17, B5, retencje formularzy www, Consent Mode podstawowy; 1.2: rytm przeglądów i dziennik — sekcje D, E; 1.1: A13 — asystent AI.) Dokument operacyjny — aktualizować przy każdej
> zmianie stacku, subprocesora lub retencji. Spójny z Polityką prywatności 1.2.0,
> DPA 1.2.0 i listą subprocesorów (docs/legal/drafts/).
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
| A1 | Rejestracja i prowadzenie konta | świadczenie usług, uwierzytelnianie | art. 6(1)(b) | klienci, użytkownicy subkont (IAM) | e-mail, hash hasła (bcrypt), imię/nazwisko, telefon (opc.), sekret 2FA (AES-256-GCM), passkeys | Hetzner Online GmbH (control-plane, DE/FI) | usunięcie konta: 14 dni albo koniec najdłuższego opłaconego okresu → anonimizacja; konta hostingowe usuwane ≤180 dni po anonimizacji | nie |
| A2 | Rozliczenia i płatności (Portfel, Paynow, Stripe) | realizacja płatności | art. 6(1)(b); art. 6(1)(c) — podatki | klienci | dane do faktury (nazwa, NIP, adres), e-mail płacącego i id płatności Paynow, id płatności Stripe, 4 ostatnie cyfry karty, saldo Portfela; przy usunięciu konta — numer rachunku i odbiorca zwrotu (WniosekZwrotuSalda) | mBank S.A. — Paynow (PL, wpłaty jednorazowe w PLN); Stripe Payments Europe (IE, płatności kartą i cykliczne); Hetzner | faktury 5 lat; dedupe webhooków Stripe 90 dni; rekordy płatności Paynow jak historia portfela | Stripe: transfer wspierający do USA — SCC + DPF; Paynow: do potwierdzenia w umowie |
| A3 | Faktury ustrukturyzowane (KSeF 2.0, FA(3)) | obowiązek ustawowy | art. 6(1)(c) | klienci (nabywcy) | dane sprzedawcy/nabywcy, kwoty, NIP | Ministerstwo Finansów — KSeF (odbiorca ustawowy) | 5 lat | nie |
| A4 | Obsługa zgłoszeń (tickety, reklamacje) | wsparcie, obowiązki reklamacyjne | art. 6(1)(b), (f); art. 6(1)(c) | klienci | treść zgłoszeń, załączniki, historia | Hetzner; MinIO (self-hosted) | do usunięcia konta; roszczenia do 6 lat | nie |
| A5 | Bezpieczeństwo i audyt | wykrywanie nadużyć, art. 32 | art. 6(1)(f), (c) | klienci, użytkownicy | logi logowań (IP, UA), dziennik audytu, alerty bezpieczeństwa | Hetzner | LoginAttempt 180 dni; AuditLog: IP/UA anonimizowane po 24 mies. | nie |
| A6 | Ochrona anty-bot (Cloudflare Turnstile) | zapobieganie nadużyciom rejestracji/logowania w panelu i formularzy verris.pl | art. 6(1)(f) | odwiedzający formularze | adres IP, sygnały przeglądarki | Cloudflare, Inc. | wg polityki Cloudflare | tak — SCC + DPF |
| A7 | Komunikacja transakcyjna i marketing własny | powiadomienia (umowa); newsletter, nowości, oferty partnerskie wysyłane przez Verris (zgoda — każda kategoria osobno, ślad w AuditLog MARKETING_OPT_IN/OUT z kategorią) | art. 6(1)(b); art. 6(1)(a) | klienci | e-mail, treść wiadomości, status doręczenia, historia zgód | Amazon Web Services EMEA (SES, region UE) | logi doręczeń 12 mies.; zgody: czas konta + przedawnienie | AWS: dostęp wspierający z USA — SCC + DPF |
| A8 | Rejestracja i obsługa domen | wykonanie umowy (usługa Domeny) | art. 6(1)(b) | klienci (abonenci domen) | dane abonenta: nazwa, adres, e-mail, telefon | Hosting Concepts B.V. (Openprovider, NL — procesor); rejestry domen (NASK, EURid… — odrębni administratorzy) | czas rejestracji domeny + wymogi rejestru | zależnie od rejestru |
| A9 | Zgłoszenia DSA (abuse) i decyzje moderacyjne | obowiązki z art. 16–18 DSA | art. 6(1)(c), (f) | zgłaszający, klienci | treść zgłoszenia, dane zgłaszającego, uzasadnienia decyzji | Hetzner; skrzynka abuse@verris.pl | czas postępowania + przedawnienie roszczeń | nie |
| A10 | Poczta zespołu @verris.pl | komunikacja operacyjna (kontakt@, rodo@, abuse@) | art. 6(1)(b), (f), (c) | korespondenci, klienci | treść korespondencji, adresy, metadane | Hetzner (Postfix/Dovecot/SOGo — self-hosted) | wg potrzeb operacyjnych; sprawy RODO/DSA: czas postępowania + przedawnienie | nie |
| A11 | Kopie zapasowe | ciągłość działania (art. 32) | art. 6(1)(c), (f) | wszystkie kategorie A1–A10 | zaszyfrowane (age) dumpy DB, pliki | MinIO (self-hosted) + Hetzner Storage Box/Object Storage (off-site, WORM) | 14–28 dni rotacja; po usunięciu danych źródłowych nadpisanie ≤90 dni | nie (klucz odszyfrowania przechowywany odrębnie) |
| A12 | Statystyki i marketing internetowy (GA4/GTM, Google Ads, Meta Pixel, Meta Conversions API) | pomiar serwisu i reklam — cookies **wyłącznie po zgodzie z banera**; Consent Mode v2 w trybie podstawowym: przed zgodą tagi Google i Meta się nie ładują; sygnały bez cookies tylko dla kategorii bez zgody, gdy zgoda obejmuje drugą | art. 6(1)(a); sygnały bez cookies po częściowej zgodzie — art. 6(1)(f) | odwiedzający, którzy wyrazili zgodę | identyfikatory cookies (_ga, _gcl_au, _fbp/_fbc), IP, zdarzenia | Google Ireland (GA4/GTM — procesor; Ads — odrębny adm.); Meta Platforms Ireland (Pixel — współadministrowanie zbierania, art. 26) | GA4: zdarzenia do 14 mies.; cookies wg Polityki cookies | tak — SCC + DPF (Google LLC / Meta Platforms Inc.) |
| A13 | Asystent AI w panelu i szkice odpowiedzi obsługi | odpowiedzi na pytania klienta, prognozy zasobów; szkic odpowiedzi na zgłoszenie dla pracownika | art. 6(1)(b) — funkcja uruchamiana przez klienta; art. 6(1)(f) — szkice dla obsługi | klienci, użytkownicy subkont, pracownicy obsługi | treść pytań i odpowiedzi, kontekst usługi bez haseł/e-maili/kwot, metryki zużycia, treść zgłoszeń po redakcji, tokeny i koszt | OpenAI Ireland Ltd (poziom szybki, embeddingi); Anthropic Ireland, Limited (poziom analiz); Hetzner (dziennik) | AiInteractionLog 12 mies. (RetentionScheduler); OpenAI: wejście/wyjście API do 30 dni; brak trenowania modeli (umowy dostawców) | tak — USA, SCC w DPA dostawców |
| A14 | Asystent AI na verris.pl | odpowiedzi na pytania o ofertę przed zakupem; przekazanie rozmowy przy prośbie o telefon | 6(1)(f), 6(1)(b) | odwiedzający verris.pl | treść pytań i odpowiedzi, skrót HMAC IP, identyfikator rozmowy, tokeny i koszt | Anthropic Ireland, Limited; zespół Verris (mail przy prośbie o telefon) | rozmowa 30 dni (AsystentRetencjaScheduler); AiInteractionLog 12 mies. | tak — USA, SCC w DPA dostawcy |
| A15 | Rekrutacja testerów (otwarta beta, verris.pl/beta) | wybór testerów, zaproszenie z kodem | 6(1)(b) | osoby zgłaszające się przez verris.pl/beta | imię, e-mail, zakres testów, opcjonalnie strona, obecny hosting, uwagi; treść zgody, IP, UA, UTM | Amazon Web Services EMEA (SES); Cloudflare (Turnstile); Hetzner | niepotwierdzone 7 dni; bez zaproszenia 90 dni (BetaZgloszeniaRetencjaScheduler) | AWS/Cloudflare — SCC + DPF |
| A16 | Formularze verris.pl: kontakt, prośba o telefon, plan przeniesienia strony | odpowiedź na zapytanie, oddzwonienie, wysłanie planu; wiadomości o hostingu tylko przy dobrowolnej, potwierdzonej zgodzie | 6(1)(f), 6(1)(b); wiadomości — 6(1)(a) | osoby wysyłające formularze | imię, e-mail, telefon i pora, treść, adres strony, IP, UA; przy zgodzie: treść klauzuli, chwila zgody, potwierdzenie, wypis | Amazon Web Services EMEA (SES); Cloudflare (Turnstile); Hetzner | kontakt 12 mies.; telefon 90 dni; plan bez zgody 30 dni; zgoda niepotwierdzona 7 dni, potwierdzona ≤24 mies.; po wypisie 30 dni (LeadsRetencjaScheduler, `leads-retencja.ts`) | AWS/Cloudflare — SCC + DPF |
| A17 | Program EKO (punkty, wkłady w drzewa, własne drzewa) | program lojalnościowy, sadzenie drzew z certyfikatem | 6(1)(b) | klienci | punkty i historia, wkłady (części drzewa) liczone z historii portfela (tylko część zapłacona pieniędzmi), zamówienia drzew i przypisane certyfikaty (wystawiane na Verris — bez danych klienta) | Hetzner (partner sadzenia drzew nie otrzymuje danych klientów — decyzja 17, 4.11.2026) | czas konta; zamówienia z certyfikatem jak dokumenty księgowe | nie |

## B. Czynności, w których Verris jest PODMIOTEM PRZETWARZAJĄCYM (art. 30 ust. 2)

| # | Czynność | W imieniu (administrator) | Kategorie przetwarzania | Środki ochrony | Podstawa |
|---|----------|---------------------------|-------------------------|----------------|----------|
| B1 | Hosting współdzielony (pliki, bazy, poczta użytkowników klienta) | Klient Verris | przechowywanie, transmisja, kopie zapasowe — **bez analizy treści** | CageFS/LVE, WAF (ModSecurity/CRS), FTPS, backup off-site szyfrowany | DPA 1.2.0 + Regulamin §10 |
| B2 | Serwery VPS (dane na serwerze klienta) | Klient Verris | udostępnienie infrastruktury (Hetzner Cloud); klient administruje samodzielnie | izolacja wirtualizacji, sieć, snapshoty wg planu | DPA 1.2.0 + Regulamin §11 |
| B3 | E-mail marketing (listy odbiorców kampanii klienta) | Klient Verris | przechowywanie list, wysyłka (SES), obsługa rezygnacji | limity wysyłki, monitoring skarg/odrzuceń, auto-wstrzymanie | DPA 1.2.0 + Regulamin §13 |
| B4 | Usługi dla klientów Resellera | Reseller (lub jego klienci — dalsze powierzenie) | jak B1–B3 w modelu odsprzedaży | jak wyżej | DPA 1.2.0 §1 + Regulamin §14 |
| B5 | Statystyki odwiedzin stron klienta (bez cookies) | Klient Verris | zliczanie odsłon: dobowo solony skrót IP+UA (bez zapisu IP/UA), kraj, ścieżka, domena odsyłająca, typ urządzenia; usuwanie po 90 dniach | bez cookies, DNT, limit zdarzeń na dobę | DPA 1.2.0 §2 ust. 3 + Regulamin §10 |

## C. Ogólny opis środków technicznych i organizacyjnych (art. 32)

Passkeys/2FA (wymuszone dla personelu), bcrypt, AES-256-GCM na sekretach, RBAC + least privilege,
VPN WireGuard przed panelami wewnętrznymi, izolacja kont (CageFS/LVE), WAF, FTPS, rate limiting,
anty-bot (Turnstile), dziennik audytu z anonimizacją IP po 24 mies., kopie zapasowe szyfrowane
(age) off-site z WORM i testami odtwarzania, monitoring 24/7, procedura naruszeń
(`INCIDENT_RESPONSE.md`: PUODO ≤72 h, klienci-administratorzy ≤24 h per DPA). Szczegóły: DPA
Załącznik 1.

## D. Przeglądy i decyzje

- Przegląd okresowy co 6 miesięcy: **26 marca i 26 września** (pierwszy: 26.03.2027) — przypomnienie
  w kalendarzu właściciela i zadanie w panelu admina (powiadomienie „Przegląd okresowy RCPD”).
  Dodatkowo przegląd przed wdrożeniem każdej zmiany z listy: nowy/zmieniony subprocesor (także region),
  nowa kategoria danych lub cel, zmiana retencji (kod `RetentionScheduler` albo polityka), włączenie A12/A13,
  nowy transfer poza EOG lub zmiana jego podstawy, zmiana środków z sekcji C, personel z dostępem do danych.
  Po naruszeniu z danymi osobowymi — przegląd w ciągu 30 dni od zamknięcia incydentu.
- Lista kontrolna przeglądu okresowego: czynności A/B zgodne z polityką prywatności i DPA Zał. 2;
  lista subprocesorów = `subprocessors.md` = polityka pkt 5.1 = DPA Zał. 2; retencje = `RetentionScheduler`
  (test `retention.scheduler.spec.ts` zielony); warunki A12/A13 nadal spełnione albo nadal wyłączone;
  sekcja C zgodna ze stanem faktycznym (2FA personelu, VPN, szyfrowanie kopii, testy odtwarzania);
  przesłanki IOD nadal nie występują; status KSC/NIS2 zgodny z PB-24. Wynik — wpis w sekcji E.
- A12 aktywna dopiero po włączeniu GTM/Pixela (Variables `GTM_ID`/`META_PIXEL_ID`); przed
  włączeniem: akceptacja Google Ads Data Processing Terms i Meta Controller Addendum + publikacja
  polityki cookies opisującej te narzędzia (już przygotowana).
- A13 aktywna dopiero po wpisaniu kluczy `AI_API_KEY` / `ANTHROPIC_API_KEY`; przed wpisaniem: konto API u dostawcy (akceptacja Services Agreement / Commercial Terms = zawarcie DPA z SCC) i publikacja Polityki prywatności 1.1.0. AI nie jest dalszym podmiotem przetwarzającym danych powierzonych przez klientów (DPA Zał. 2) — asystent nie ma dostępu do plików, baz ani poczty stron klientów.
- IOD: niewyznaczony — brak przesłanek z art. 37 (sprawdzane przy każdym przeglądzie);
  punkt kontaktowy: rodo@verris.pl.
- NIS2/KSC: podmiot kluczowy od uruchomienia DNS lub sprzedaży domen dla klientów (art. 5 ust. 1 pkt 4
  ustawy o KSC); wniosek o wpis do wykazu w ciągu 6 miesięcy od tej daty (art. 7c ust. 1; rekomendacja: do 30 dni),
  rodzaje: dostawca usług DNS, rejestracja nazw domen, usługi przetwarzania w chmurze — PB-24,
  `nis2-ksc-assessment.md`.

## E. Dziennik przeglądów

| Data | Rodzaj | Wersja RCPD | Zakres | Wynik | Zatwierdził |
|---|---|---|---|---|---|
| 2026-09-27 | wdrożenie rytmu | 1.1 → 1.2 | sekcja D (rytm, lista kontrolna, KSC), nowa sekcja E | treść A–C bez zmian | Dominik Kowalski (decyzja w rozmowie 27.09.2026) |
| 2026-11-03 | przed zmianą (paczka 109) | 1.2 → 1.3 (projekt) | A14–A17, B5; retencje A1, A16; A12 Consent Mode podstawowy (decyzja 22 z 4.11); A6, A7 | do zatwierdzenia razem z Polityką 1.2.0 (docs/legal/drafts/ZMIANY_1.1.0-1.2.0.md) | — |
