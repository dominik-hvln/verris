# Kampania: gads-search-hosting-202607

Wstępna kampania akwizycyjna Google Ads (Search). Cel: pierwsi płacący klienci hostingu.
Status: DO AKCEPTACJI · Właściciel: Dominik · Data: 2026-07-08

## Parametry

| | |
|---|---|
| Budżet | 750 zł/mies (zakres 500–1 000), ~25 zł/dzień |
| Produkt | Hosting współdzielony z autoskalowaniem — jeden pakiet |
| Cena (brutto) | 39 zł/mies lub 349 zł/rok (≈29,08 zł/mies) |
| Oś przekazu | Migracja bez stresu: darmowa pomoc w migracji LUB darmowy migrator w panelu |
| Landing | Dedykowany: `verris.pl/przenies-strone` (brief niżej) |
| Konto | Google Ads 957-943-2103 · GA4 G-HHN0S0R777 · GTM-PJQNXCF5 |

## Struktura konta

### Kampania 1: gads-search-hosting-202607 (~90% budżetu, ~22 zł/dzień)

Sieć: tylko wyszukiwarka (bez partnerów, bez Display). Lokalizacja: Polska. Język: polski.
Ustalanie stawek: start „Maksymalizacja kliknięć" z limitem CPC 6 zł → po ~20 konwersjach przejście na tCPA.

**Grupa reklam A — Migracja (priorytet, ~60% budżetu)**

Słowa kluczowe (exact/phrase):
- [zmiana hostingu], [przeniesienie hostingu], [migracja hostingu]
- [przeniesienie strony na inny hosting], [jak zmienić hosting]
- [przeniesienie strony wordpress na inny hosting], [darmowa migracja strony]
- "hosting z darmową migracją", "przeniesienie poczty na inny hosting"

**Grupa reklam B — Hosting (uzupełniająca, ~30% budżetu)**

- [polski hosting], [hosting dla firmy], [hosting dla małej firmy]
- [hosting directadmin], [hosting z autoskalowaniem], "hosting bez pułapek odnowienia"

Świadomie pomijamy: [hosting] i [tani hosting] — CPC zawyżone przez cyber_Folks/home.pl/nazwa,
intencja cenowa niezgodna z pozycjonowaniem. Do testu po walidacji tCPA.

**Wykluczenia (obie grupy):** darmowy hosting, hosting za darmo, minecraft, serwer gier,
praca, co to jest, definicja, opinie forum, vps, domena (osobne kampanie później).

### Kampania 2: gads-search-brand-202607 (~10%, ~3 zł/dzień)

[verris], "verris hosting", "verris opinie". Ochrona marki, tani ruch o najwyższej konwersji.

## Teksty reklam (RSA, grupa A — Migracja)

Nagłówki (limit 30 znaków — zweryfikowane):

1. Przeniesiemy Twoją stronę (25)
2. Darmowa migracja hostingu (25)
3. Hosting 39 zł/mies brutto (25)
4. Hosting 349 zł/rok brutto (25)
5. Zmień hosting bez stresu (24)
6. SLA 99,5% z rekompensatami (26)
7. Bez pułapek odnowieniowych (26)
8. Polski hosting i support (24)
9. Migrator w panelu klienta (25)
10. Autoskalowanie w cenie (22)
11. Dane w UE, komplet RODO (24)
12. Verris — skaluj świadomie (25)
13. Pomoc w migracji za darmo (25)
14. Faktury gotowe na KSeF (22)
15. Jasne ceny, zero gwiazdek (25)

Przypięcia: poz. 1 → nagłówki 1/2/5 (przekaz migracyjny zawsze widoczny).

Teksty (limit 90 znaków — zweryfikowane):

1. Darmowa pomoc w migracji lub samodzielny migrator w panelu. Przenieś stronę i pocztę. (85)
2. Jeden pakiet z autoskalowaniem: 39 zł/mies lub 349 zł/rok brutto. Bez ukrytych kosztów. (87)
3. SLA 99,5% z automatycznymi rekompensatami zapisanymi w regulaminie. Dane w UE (RODO). (85)
4. Odnowienia bez pułapek cenowych, wyłączysz je w panelu w każdej chwili. Polski support. (77)

Grupa B: te same zasoby minus nagłówki 1/2/13, plus przypięcie poz. 1 → 8/12/15.
Ścieżki wyświetlanego URL: `verris.pl/hosting/migracja`.

Rozszerzenia: objaśnienia (Darmowa migracja · SLA 99,5% · Faktury KSeF · Płatność BLIK),
linki do podstron (Cennik, Jak działa migracja, Regulamin SLA, Kontakt).

## Landing: verris.pl/przenies-strone (brief)

1. **Hero:** „Zmień hosting bez stresu. Przeniesiemy Twoją stronę za darmo." + sub: „Albo zrób to
   sam — darmowy migrator czeka w panelu. Hosting z autoskalowaniem za 39 zł/mies lub 349 zł/rok brutto."
   CTA: „Zacznij migrację" → checkout/rejestracja (event `begin_checkout`/`sign_up`).
   Jawnie w hero lub tuż pod nim: migracja bezpłatna w ramach zamówienia hostingu (bez gwiazdek —
   pełnym zdaniem; warunek dla nagłówka 15).
2. **Jak to działa** — 3 kroki (zamów → przekaż dostępy lub uruchom migrator → my/Ty przenosimy, DNS na końcu).
3. **Dlaczego Verris** — 4 karty z twardych USP: SLA 99,5% z rekompensatami w regulaminie; brak pułapek
   odnowieniowych (wyłączenie odnowienia w panelu, domeny bez auto-odnowień); komplet RODO online + dane w UE;
   analityka odwiedzin bez cookies w cenie.
4. **Cena** — jedna karta pakietu, obie opcje rozliczenia, brutto, spec zasobów jawna (limity + autoskalowanie).
5. **FAQ** — czy strona będzie działać w trakcie migracji (uczciwie: krótka propagacja DNS), co z pocztą,
   ile to trwa (bez obietnic konkretnego czasu), co po roku (cennik z dnia odnowienia, przypomnienie e-mail 7 dni).
6. Stopka zaufania: płatności Stripe/BLIK, faktury KSeF, operator HVLN.

Dostępność (EAA): kontrast ≥4,5:1 (uwaga: Mint #34E5A0 na Paper #F4F4EE nie przejdzie dla tekstu —
Mint tylko na Pine), alt-teksty, informacja nie tylko kolorem. Brand: Pine/Green/Paper, Mint jako
jedyny akcent, Schibsted Grotesk 800 w nagłówku.

## Pomiar

- Konwersja główna: `purchase` (wartość PLN). Drugorzędne: `begin_checkout`, `sign_up` (obserwacja).
- **Do weryfikacji przed startem:** import konwersji GA4 → Google Ads 957-943-2103 (lub tag gtag
  bezpośredni), Enhanced Conversions, akceptacja Google Ads Data Processing Terms.
- Consent Mode v2 (default denied): raportowane konwersje będą zaniżone + modelowanie Google.
  Przy tym budżecie oceniamy trend, nie bezwzględne CPA.
- Weryfikacja krzyżowa: liczba `purchase` w Stripe vs GA4 co tydzień.

## KPI (pierwsze 60 dni — realistycznie przy 750 zł/mies)

CPC 3–6 zł → 125–250 kliknięć/mies. Przy konwersji landing→zakup 2–4%: **3–10 zakupów/mies**,
CPA docelowe ≤150 zł (LTV roczne 349 zł+ uzasadnia; break-even w 1. roku przy CPA ~349 zł).
Tygodniowy przegląd wyszukiwanych haseł (pierwsze 2 tyg. co 2–3 dni) — czyszczenie wykluczeń.

## Zgodność (checklista przed startem)

- [x] Ceny brutto PLN w każdej kreacji
- [x] Brak promocji → Omnibus nie dotyczy (39/349 to ceny standardowe, nie „obniżka")
- [x] „Za darmo" tylko przy realnie bezpłatnej migracji/migratorze
- [x] SLA 99,5%, zero „100% uptime"
- [x] Zero green claims (ECO = nazwa funkcji, bez obietnic środowiskowych)
- [x] Bez nazw konkurentów w treściach i keywordach
- [ ] Google Ads Data Processing Terms zaakceptowane (Dominik)
- [ ] Import konwersji GA4 → Google Ads (Dominik / do zrobienia wspólnie)
- [ ] Landing `/przenies-strone` zbudowany i sprawdzony pod CRO
- [ ] Potwierdzić, czy migrator/pomoc obejmuje pocztę (jeśli nie — usunąć „i pocztę" z tekstu 1)

## Następne kroki

1. Akceptacja planu i budżetu (Dominik).
2. Budowa landinga (mogę przygotować pełną treść + strukturę w następnym kroku).
3. Autoryzacja pluginu Adspirer (OAuth) — wtedy zweryfikuję realne CPC/wolumeny fraz
   i wystawię kampanię jako wstrzymaną do Twojej akceptacji.
4. Konfiguracja konwersji w Google Ads → start → przegląd po 14 dniach.
