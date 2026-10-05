# Tracker DPA z subprocesorami (art. 28 RODO)

> **Status:** operacyjny. Cel: z KAŻDYM subprocesorem zawarta umowa powierzenia **przed**
> produkcyjnym przetwarzaniem danych. Pozycja audytu: `P-15`, **BLOKER STARTU**.
> **Ostatnia aktualizacja:** 2026-09-25.

## Korekta z 2026-09-19 — dwie rzeczy były nieprawdziwe

**1. Lista subprocesorów była nieaktualna o dwa i pół miesiąca.** Tabela z 2026-07-04
zostawiała otwarte „Dostawca VPS (OVH/Hetzner/…)", „Dostawca off-site backup" i wybór captchy,
a decyzje zapadły **2026-07-07**: wszystko na Hetznerze (control-plane, węzły, VPS, backup
off-site), Cloudflare Turnstile zamiast reCAPTCHA, poczta przez Amazon SES w regionie UE.
Tracker opisywał więc stan sprzed decyzji i wymieniał dostawców, których nie używamy.

**2. „Czekamy na dostawców" było błędnym założeniem.** W planie startowym `P-15` figurowało
jako pozycja, której tempa nie kontrolujemy — stąd 16 h nakładu i rozbicie na dwa sprinty.
Sprawdzone 2026-09-19 u źródła: **u żadnego z pięciu dostawców nie trzeba nikogo prosić.**
Trzy DPA obowiązują z mocy umowy głównej, dwa akceptuje się kliknięciem w panelu.
Nakład skorygowany na 6 h, pozycja w całości w sprincie 4.

To jest ta sama klasa błędu, którą audyt nazwał przy `X-18`: koszt wzięty z pamięci,
a nie sprawdzony u źródła. Tyle że tu kosztował nie powtórzoną pracę, lecz **cztery tygodnie
w planie startowym** — `P-15` blokował domknięcie blokerów aż do sprintu 10.

## Status DPA

| Subprocesor | Rola / dane | Jak się zawiera | Status | Transfer poza EOG |
|---|---|---|---|---|
| **Hetzner Online** | Control-plane, węzły hostingowe, VPS, backup off-site — **wszystkie dane klientów** | Checkbox „I agree to the agreement" na `accounts.hetzner.com/account/dpa`. **Przed zatwierdzeniem trzeba wypełnić Załącznik 1**: kategorie danych i krąg osób, których dotyczą | ✅ **zawarta 27.09.2026** — DPA v1.2 (16.02.2026), klient K0265867421; Załącznik 1: 5 kategorii standardowych + treści klientów na serwerach; osoby: klienci, ich pracownicy, **użytkownicy końcowi stron i poczty klientów**, pracownicy/współpracownicy Verris; PDF u właściciela (`dpa-2026-09-27.pdf`) | Nie (DE/FI, EOG) |
| **Stripe Payments Europe** | Płatności kartą (zapisane karty, auto-doładowanie, subskrypcje kartą, EUR/USD) | **Nie wymaga osobnej akceptacji** — DPA „is subject to and forms part of the Agreement", czyli obowiązuje wraz z Stripe Services Agreement | ☑ obowiązuje z mocy umowy | Część infrastruktury US → SCC/DPF w treści DPA |
| **mBank S.A. (Paynow)** | Jednorazowe wpłaty w PLN (doładowanie portfela) — e-mail płacącego, kwota, opis, id płatności (decyzja 2026-10-05) | Usługa aktywowana w bankowości firmowej mBanku; sprawdzić w umowie/regulaminie Paynow, czy zawiera powierzenie, czy mBank jest odrębnym administratorem | ☐ przy aktywacji Paynow | do potwierdzenia (bank PL; Paynow deklaruje rozwiązania chmurowe) |
| **Amazon Web Services (SES)** | Wysyłka poczty transakcyjnej, region UE | **Nie wymaga podpisu** — AWS GDPR DPA jest częścią AWS Service Terms, SCC stosują się automatycznie | ☑ obowiązuje z mocy umowy | Region UE; SCC automatyczne, gdyby doszło do transferu |
| **Openprovider** | Rejestracja i transfer domen — dane abonenta | Akceptacja w panelu; po zawarciu dokument leży w `cp.openprovider.eu` → Contracts | ✅ zaakceptowana przy rejestracji konta resellera (potwierdzenie właściciela 27.09.2026; dokładna data w `cp.openprovider.eu` → Contracts) | — |
| **Cloudflare (Turnstile)** | Anty-bot, adresy IP | DPA odwołuje się do Self-Serve Subscription Agreement, ale **nie opisuje wprost mechanizmu akceptacji dla self-serve** — do potwierdzenia w dashboardzie, a jeśli go tam nie ma, zapytać supportu i zapisać odpowiedź | ✅ DPA wchodzi z Self-Serve Subscription Agreement przy założeniu konta (potwierdzenie właściciela 27.09.2026) | USA → SCC |
| **Streamsoft (Firmino)** | Program księgowy — faktury VAT klientów (Verris jako administrator, nie dotyczy DPA z klientami) | Akceptacja w programie: Ustawienia → RODO → Umowa powierzenia (potwierdzenie umocowania + akceptacja). Przy akceptacji sprawdzić w treści lokalizację serwerów i ewentualne transfery poza EOG — polityka prywatności pisze dziś „nie” | ✅ zaakceptowana w programie (potwierdzenie właściciela 27.09.2026) | do potwierdzenia |
| **OpenAI Ireland Ltd** | Asystent AI — poziom szybki, embeddingi (pytania i odpowiedzi, kontekst usługi bez sekretów) | **Nie wymaga osobnego podpisu** — DPA z SCC jest częścią OpenAI Services Agreement i obowiązuje z jej akceptacją (założenie konta API). Wejście/wyjście API do 30 dni, bez trenowania modeli | ☐ przy założeniu konta API | USA → SCC w DPA |
| **Anthropic Ireland, Limited** | Asystent AI — poziom analiz (prognozy, szkice BOK) | **Nie wymaga osobnego podpisu** — DPA z SCC jest częścią Commercial Terms of Service i obowiązuje z ich akceptacją. Bez trenowania modeli na treści klienta | ☐ przy założeniu konta API | USA → SCC w DPA |
| Ministerstwo Finansów — KSeF | Faktury | Podstawa ustawowa, nie DPA | n/d | — |
| GlitchTip (self-hosted) | Monitoring błędów | Dane u nas, nie ma powierzenia | n/d | — |
| OVH | Rejestrator domeny `verris.pl` | **Nie jest subprocesorem** — to nasza własna domena, nie dane klientów | n/d | — |

**Puste kolumny „Data" zniknęły celowo.** Data wpisuje się dopiero przy faktycznej akceptacji,
razem z dowodem — inaczej tabela znów opisze zamiar zamiast stanu.

## Procedura na sprint 4

Kolejność ma znaczenie tylko w jednym miejscu: **Hetzner idzie pierwszy**, bo wymaga
wypełnienia Załącznika 1, a treść tego załącznika jest jedyną częścią całej listy, którą
trzeba napisać samodzielnie.

**Załącznik 1 dla Hetznera — do wpisania:**

- *Kategorie danych osobowych:* dane rejestracyjne i rozliczeniowe klientów (imię i nazwisko
  lub firma, adres, NIP, e-mail, telefon), dane uwierzytelniające, adresy IP i logi dostępu,
  treść zgłoszeń wsparcia, zawartość kont hostingowych i skrzynek pocztowych klientów
  oraz ich kopie zapasowe, dane abonentów domen.
- *Krąg osób, których dane dotyczą:* klienci operatora (osoby fizyczne prowadzące działalność
  i reprezentanci klientów instytucjonalnych), użytkownicy subkont, osoby kontaktujące się
  przez formularze i wsparcie, **oraz użytkownicy końcowi serwisów klientów** — bo to ich dane
  leżą na węzłach hostingowych. Ta ostatnia grupa jest najłatwiejsza do pominięcia i największa.

**Dowód zamknięcia `P-15`:** zrzut albo numer umowy z każdego panelu, wpisany do kolumny
Status razem z datą. Bez dowodu pozycja zostaje otwarta — stan `DZIAŁA` bez dowodu
`plik:linia` walidator i tak odrzuci.

## Zasady

1. **Nowy subprocesor** = powiadomienie klientów min. **30 dni** przed (Regulamin, DPA §7)
   + wpis do `subprocessors.md` i do tej tabeli.
2. DPA musi obejmować: przedmiot, czas, charakter i cel przetwarzania, kategorie danych i osób,
   obowiązki procesora, dalszych subprocesorów, transfery, pomoc administratorowi, usunięcie
   lub zwrot danych, audyt.
3. **Blokada startu:** żaden subprocesor z danymi osobowymi klientów bez zawartego DPA.
4. **Lista subprocesorów Hetznera** (`hetzner.com/AV/subunternehmer.pdf`) to nasi *dalsi*
   subprocesorzy — przy zmianie po ich stronie obowiązuje nas punkt 1 wobec naszych klientów.

## Stan 2026-09-23

Właściciel potwierdził akceptację umów powierzenia (Hetzner, Openprovider, Firmino, Cloudflare) i uruchomienie skrzynek kontakt@/rodo@/abuse@/security@verris.pl. **Przed startem:** dopisać w tabeli numer umowy lub zrzut z każdego panelu i datę — bez dowodu P-15 zostaje otwarte.

## Do zrobienia przed pierwszym płatnym klientem

- [x] Hetzner — Załącznik 1 wypełniony, DPA zawarta 27.09.2026
- [x] Openprovider — zaakceptowana przy rejestracji (właściciel, 27.09.2026)
- [x] Cloudflare — DPA z umową self-serve (właściciel, 27.09.2026)
- [x] Streamsoft Firmino — zaakceptowana w programie (właściciel, 27.09.2026)
- [ ] ClouDNS — przy zakupie razem z węzłem (sprint 18): dopisać do listy i polityki (30 dni powiadomienia, jeśli już są klienci)
- [ ] 2026-10-05: klucze AI ustawione (konta API u obu dostawców założone → DPA z SCC zaakceptowane z warunkami). AI działa WYŁĄCZNIE dla kont właściciela (`AI_TYLKO_KONTA`) do publikacji Polityki prywatności 1.1.0 — dopisanie testerów bety do `AI_TYLKO_KONTA` dopiero po publikacji albo po poinformowaniu ich o asystencie AI (treść pkt 2.7). AI Act art. 50: asystent i komentarze AI oznaczone w panelu (widocznie + `data-ai-generated`), Regulamin 1.1.0 §5 ust. 5 (draft).
- [ ] AI (OpenAI + Anthropic, decyzja właściciela 2026-09-25): konto API u obu dostawców (= DPA z SCC), publikacja Polityki prywatności 1.1.0 (pkt 2.7, 4, 5.1, 6, 8 — gotowa w `drafts/privacy.md`), dopiero potem klucze `AI_API_KEY` / `ANTHROPIC_API_KEY`. Do DPA z klientami (Zał. 2) nie wchodzą — asystent nie dotyka danych powierzonych.
- [ ] Stripe, AWS — odnotować podstawę (umowa główna), bez akcji
- [ ] Paynow (mBank) — przy aktywacji ustalić rolę mBanku i podstawę (umowa Paynow), uzupełnić transfer w `drafts/subprocessors.md` i `drafts/privacy.md`; nowy podmiot na liście = 30 dni powiadomienia, jeśli są już klienci
- [ ] Zaktualizować `privacy.md` — tabela podmiotów musi zgadzać się z tą listą, w tym z usunięciem OVH
- [ ] Zaktualizować `subprocessors.md` tą samą listą
