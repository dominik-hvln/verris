# Lista podmiotów przetwarzających (subprocesorów) Verris

**Wersja 1.0.0 · stan na 7 lipca 2026 r.**

Wersja kanoniczna publikowana klientom: Załącznik 2 do DPA oraz pkt 5.1 Polityki prywatności. Zmiany listy — powiadomienie e-mail do klientów co najmniej 30 dni wcześniej (DPA §7).

| Podmiot | Siedziba / lokalizacja danych | Cel przetwarzania | Zakres danych | Transfer poza EOG |
| --- | --- | --- | --- | --- |
| **Hetzner Online GmbH** | Industriestr. 25, 91710 Gunzenhausen, Niemcy; DC: Niemcy/Finlandia | infrastruktura: control-plane (API, panele, PostgreSQL, Redis, MinIO), węzły hostingowe, serwery VPS (Hetzner Cloud), backup off-site (Storage Box / Object Storage) | wszystkie dane przetwarzane w systemie Verris oraz dane hostowane przez klientów; kopie zapasowe szyfrowane (age) przed wysyłką, klucz przechowywany odrębnie | nie |
| **Stripe Payments Europe, Ltd.** | 1 Grand Canal Street Lower, Dublin, Irlandia | płatności: karty, Apple Pay, Google Pay, BLIK/Przelewy24 | identyfikatory płatności, 4 ostatnie cyfry karty, status transakcji (bez pełnego numeru karty) | możliwy transfer wspierający do Stripe, Inc. (USA) — SCC + Data Privacy Framework |
| **Amazon Web Services EMEA SARL** | 38 Avenue John F. Kennedy, Luksemburg; region usługi: UE (Frankfurt / Irlandia) | Amazon SES — wysyłka e-mail transakcyjnych i kampanii e-mail marketingu | adres odbiorcy, treść wiadomości, status doręczenia | dane w regionie UE; możliwy dostęp wspierający z USA — SCC + Data Privacy Framework |
| **Cloudflare, Inc.** | 101 Townsend St, San Francisco, USA (PoP w EOG) | Cloudflare Turnstile — ochrona anty-bot rejestracji i logowania | adres IP, sygnały przeglądarki/interakcji | tak — SCC + Data Privacy Framework |
| **Hosting Concepts B.V. (Openprovider)** | Willemskade 18, Rotterdam, Holandia | rejestracja, odnawianie i transfer domen | dane abonenta domeny (nazwa, adres, e-mail, telefon) | zależnie od rejestru danej domeny |
| **Google Ireland Limited** | Gordon House, Barrow Street, Dublin 4, Irlandia | Google Analytics 4 + Google Tag Manager (pomiar serwisu, tylko za zgodą z banera cookies) | identyfikatory cookies, IP, zdarzenia w serwisie | możliwy transfer do Google LLC (USA) — SCC + Data Privacy Framework |
| **Streamsoft spółka z ograniczoną odpowiedzialnością sp. k.** | al. Wojska Polskiego 11, 65-077 Zielona Góra | program księgowy Firmino — faktury VAT klientów Verris (Verris jako administrator; nie dotyczy danych powierzonych przez klientów w DPA) | dane nabywcy faktury (nazwa, adres, NIP, e-mail), pozycje i kwoty | nie (do potwierdzenia w treści umowy powierzenia przy akceptacji) |
| **OpenAI Ireland Ltd** | 1st Floor, The Liffey Trust Centre, 117-126 Sheriff Street Upper, Dublin 1, D01 YC43, Irlandia | asystent AI w panelu — poziom szybki (czat, podpowiedzi) i embeddingi bazy wiedzy | pytania i odpowiedzi asystenta, kontekst usługi bez haseł, e-maili i kwot; dostawca przechowuje wejście/wyjście API do 30 dni (wykrywanie nadużyć), nie trenuje na nich modeli | tak — SCC w OpenAI Data Processing Addendum |
| **Anthropic Ireland, Limited** | Dublin, Irlandia | asystent AI — poziom analiz: prognozy zasobów, szkice odpowiedzi obsługi | metryki zużycia usług, treść zgłoszeń po usunięciu danych wrażliwych, pytania i odpowiedzi; dostawca nie trenuje modeli na treści klienta | tak — SCC w Anthropic DPA |

## Odbiorcy niebędący podmiotami przetwarzającymi (odrębni administratorzy / podstawa ustawowa)

| Podmiot | Rola | Zakres |
| --- | --- | --- |
| Rejestry domen (m.in. NASK — `.pl`, EURid — `.eu`) | odrębny administrator | dane abonenta rejestrowanej domeny |
| Ministerstwo Finansów — Krajowy System e-Faktur (KSeF) | odbiorca ustawowy | dane faktur ustrukturyzowanych (sprzedawca, nabywca, kwoty) |
| Stripe — przeciwdziałanie oszustwom | odrębny administrator | dane transakcji w zakresie AML/antyfraud |
| Meta Platforms Ireland Ltd — Meta Pixel (za zgodą marketingową) | współadministrator w zakresie zbierania/przesyłania zdarzeń (art. 26 RODO, Controller Addendum); dalej odrębny administrator | identyfikatory cookies (_fbp/_fbc), IP, dane przeglądarki, zdarzenia |
| Google Ireland Ltd — Google Ads (za zgodą marketingową) | odrębny administrator (konwersje, remarketing) | identyfikator _gcl_au, zdarzenia konwersji |

## Narzędzia własne (bez udziału podmiotów zewnętrznych)

Monitoring błędów (GlitchTip self-hosted), kopie zapasowe bazy (MinIO self-hosted), MTA pomocniczy — działają na infrastrukturze Verris u dostawcy wskazanego wyżej (Hetzner) i nie stanowią odrębnych subprocesorów.

## Status umów powierzenia (wewnętrzne — nie publikować)

| Subprocesor | Sposób zawarcia DPA | Status |
| --- | --- | --- |
| Hetzner Online GmbH | DPA w panelu konta Hetzner (obejmuje Cloud i Storage Box) | do akceptacji przed startem LIVE |
| Stripe Payments Europe | Stripe Data Processing Agreement (online) | do akceptacji przed startem LIVE |
| AWS EMEA SARL | AWS Service Terms + DPA (online), region wymuszony EU | do akceptacji przed startem LIVE |
| Cloudflare, Inc. | Cloudflare DPA (online) | do akceptacji przed startem LIVE |
| Hosting Concepts B.V. | DPA rejestratora (Openprovider) | do akceptacji przed startem LIVE |
| Google Ireland Ltd (GA4/GTM) | Google Ads Data Processing Terms (akceptacja w ustawieniach konta GA4) | do akceptacji przed włączeniem GA4 |
| OpenAI Ireland Ltd | DPA z SCC jest częścią OpenAI Services Agreement — obowiązuje z akceptacją umowy przy założeniu konta API | do zawarcia przy założeniu konta API (przed wpisaniem AI_API_KEY) |
| Anthropic Ireland, Limited | DPA z SCC jest częścią Commercial Terms of Service — obowiązuje z ich akceptacją | do zawarcia przy założeniu konta API (przed wpisaniem ANTHROPIC_API_KEY) |
| Meta Platforms Ireland (Pixel) | Controller Addendum + Data Processing Terms (akceptacja w Business Manager) | do akceptacji przed włączeniem Pixela |
