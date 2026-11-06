# Dokumenty prawne Verris 1.1.0 → 1.2.0 — lista zmian i publikacja

> **Status: do publikacji · 2026-11-03 (paczka 109), numer 1.2.0 od 5.11.2026 (paczka 110) · nic nie jest opublikowane.**
> Jedna publikacja Regulaminu, Polityki prywatności, Polityki cookies i Umowy powierzenia (DPA) w wersji 1.2.0
> ze wszystkimi zmianami (decyzja 2 z 3.11.2026, przed 7.12.2026), **ze skutkiem od dnia publikacji — bez
> 30-dniowego okresu zawiadomienia** (decyzja 19 z 4.11.2026; uzasadnienie w części C pkt 1). Na produkcji obowiązują dziś
> wszystkie cztery dokumenty w wersji **1.1.0 z 6.10.2026** (szkic z commita `49938cc0`, sprawdzone 5.11.2026: długość
> treści w bazie = plik z tego commita). Dlatego paczka 109 publikuje się jako **1.2.0** — skrypt słusznie odmówił
> nadpisania 1.1.0 inną treścią. Opublikowanych wersji nie zmieniamy — w bazie zostają jako archiwum i dowód tego,
> co klient zaakceptował.
>
> To nie jest porada prawna. Miejsca z ryzykiem są w części C („DO SPRAWDZENIA”) — do decyzji Dominika
> (ew. z prawnikiem). Część A jest dla klientów (do maila i do pola „Zmiany” przy publikacji), część B dla operatora.

---

## A. Co się zmienia – dla klientów (prostym językiem)

### A.1 Tekst maila do klientów (ponowna akceptacja)

**Temat:** Nowe wersje regulaminu i polityki prywatności Verris (1.2.1)

> Cześć,
>
> od [DATA PUBLIKACJI] obowiązują nowe wersje dokumentów Verris: Regulaminu, Polityki prywatności, Polityki
> cookies i Umowy powierzenia danych (wersja 1.2.1). Przy najbliższym logowaniu poprosimy Cię o akceptację
> Regulaminu i potwierdzenie zapoznania się z Polityką prywatności. Najważniejsze zmiany:
>
> **Pieniądze i rozliczenia**
> - **Rekompensata za niedotrzymanie dostępności (SLA) przychodzi sama** – bez wniosku, w kredytach na portfel,
>   do 7 dni po końcu miesiąca. Wniosek składasz tylko wtedy, gdy nie zgadzasz się z wyliczeniem.
> - **Kredyty na start:** przy pierwszym zakupie hostingu dostajesz darmowe kredyty na autoskalowanie – 60 zł
>   przy planie rocznym albo 10 zł przy miesięcznym, ważne 12 miesięcy. Pierwszy okres kosztuje tyle samo co
>   kolejne – bez „taniego pierwszego roku”.
> - **Faktury:** wystawiamy je przy każdej wpłacie pieniędzy (doładowanie portfela, BLIK, przelew, karta). Zakup
>   z portfela nie tworzy nowej faktury. Kredyty z kodu promocyjnego (także z kodu testera) to nie zakup, więc nie ma
>   za nie faktury.
> - **Metody płatności** są opisane tak, jak działają: BLIK, szybki przelew i karta przez Paynow (mBank), karta
>   i Przelewy24 przez Stripe.
> - **Autoskalowanie:** domyślnie bez limitu kosztu – płacisz za faktyczne użycie, w blokach po 15 minut. Własny limit
>   kosztu (suma dopłat z ostatnich 30 dni) ustawisz przy zamówieniu albo w panelu.
> - **Usunięcie konta i zwrot salda:** konto usuwamy po 14 dniach od żądania, a jeśli masz opłacone usługi – po końcu
>   najdłuższego opłaconego okresu. Opłacone kredyty, których nie wydasz, zwracamy przelewem do 14 dni na rachunek
>   podany we wniosku. Nie zwracamy kredytów z kodów, poleceń i rekompensat – przy wyliczaniu zwrotu przyjmujemy, że
>   wydatki pokrywały je w pierwszej kolejności. Przed usunięciem pokażemy saldo, usługi, domeny i datę usunięcia.
>
> **Usługi**
> - **Kopie zapasowe** zapisaliśmy w regulaminie: codziennie, 7 dni na serwerze i 30 dni zaszyfrowanych kopii poza
>   serwerem, z samodzielnym przywracaniem w panelu. Tryb EKO jest domyślnie wyłączony; po jego włączeniu Twoje
>   planowane kopie robią się raz w tygodniu.
> - **Przeniesienie strony** w cenie hostingu jest opisane w regulaminie. Przy sklepie ostatnia synchronizacja bazy
>   wymaga kilku minut przerwy w zapisie, o wybranej przez Ciebie porze.
> - **Okres próbny:** jeden na konto. W czasie próby: do 100 wysłanych e-maili na dobę, bez rejestracji i transferu
>   domen (jeśli nie masz opłaconej usługi) i bez autoskalowania. Ograniczenia znikają po opłaceniu planu.
> - **Program EKO:** punkty EKO, wkład usług opłaconych pieniędzmi w sadzenie drzew (kredyty z kodów, poleceń
>   i rekompensat nie dają wkładu i schodzą z portfela najpierw), wymiana punktów na procent drzewa albo własne
>   drzewo z certyfikatem (dziś 300 pkt = 1 drzewo). Certyfikaty wystawiamy na Verris, także przy Twoim własnym
>   drzewie. Drzewo jest „posadzone” dopiero, gdy partner wystawi certyfikat.
> - **Domeny:** przy każdym zamówieniu rejestracji albo transferu domeny zaznaczasz, że chcesz jej natychmiastowego
>   wykonania i wiesz, że po zarejestrowaniu domeny prawo odstąpienia wygasa. Nie ma już jednego oświadczenia
>   „na stałe” dla kolejnych zamówień.
> - **Współpracownicy (subkonta):** usługę może anulować lub usunąć, wyłączyć jej odnowienie i usunąć konto tylko
>   właściciel konta.
> - **Asystent AI w panelu** jest dostępny dla wszystkich klientów; korzystanie z niego jest dobrowolne.
>
> **Dane osobowe i cookies**
> - Polityka prywatności opisuje teraz formularze na verris.pl (kontakt, prośba o telefon, plan przeniesienia strony)
>   z okresami przechowywania: kontakt 12 miesięcy, telefon 90 dni, plan bez zgody na wiadomości 30 dni. Plan
>   przeniesienia wysyłamy każdemu – zgoda na wiadomości o hostingu jest osobna i dobrowolna.
> - Dopisaliśmy: zgłoszenia do testów (verris.pl/beta), asystenta AI na verris.pl, program EKO (partner sadzący
>   drzewa nie dostaje Twoich danych – certyfikaty wystawiamy na Verris), zwrot salda (numer rachunku), ślad zgód na nowości
>   i oferty partnerskie.
> - **Cookies:** tabela pokazuje dokładnie to, co zapisujemy w przeglądarce. Google Consent Mode działa w trybie
>   podstawowym: dopóki nie wyrazisz zgody, nie ładujemy narzędzi Google ani Meta i Twoja przeglądarka nie wysyła
>   do nich żadnych danych. Pliki cookies analityczne i reklamowe zapisujemy tylko za Twoją zgodą.
> - **Umowa powierzenia (DPA)** obejmuje statystyki odwiedzin Twoich stron. Zaakceptujesz ją i pobierzesz egzemplarz
>   PDF w panelu: Ustawienia → Prywatność i dane.
>
> **Kontakt:** piszesz na kontakt@verris.pl albo w panelu (Wsparcie → Nowe zgłoszenie). Jeśli wolisz rozmowę,
> zostaw numer na verris.pl/kontakt – oddzwonimy w dni robocze 9–17.
>
> Pełne teksty i porównanie z poprzednimi wersjami znajdziesz w panelu: Dokumenty prawne → Historia wersji. Jeśli nie
> akceptujesz zmian, możesz wypowiedzieć umowę bez kosztów – niewykorzystaną część opłat zwrócimy proporcjonalnie
> (Regulamin §24 ust. 3).
>
> Zespół Verris

### A.2 Pole „Zmiany” przy publikacji (krótko, pokazuje się w oknie ponownej akceptacji)

**Regulamin (TERMS) 1.2.0**
```
- Rekompensata SLA trafia do portfela automatycznie, bez wniosku (§15).
- Rabat na start przy pierwszym zakupie, faktury przy każdej wpłacie, kredyty z kodu bez faktury (§8, §9).
- Autoskalowanie: domyślnie bez limitu, własny limit kosztu na 30 dni (§9 ust. 5).
- Usunięcie konta: termin, saldo, domeny; zwrot opłaconych kredytów na wniosek w 14 dni (§5 ust. 4, §8 ust. 4).
- Kopie zapasowe 7/30 dni i Tryb EKO, przeniesienie strony w cenie hostingu (§10).
- Okres próbny z ograniczeniami (§7 ust. 8), program EKO (§8a), uprawnienia właściciela konta (§6 ust. 5).
- Domeny: oświadczenie o natychmiastowym wykonaniu przy każdym zamówieniu, bez zgody „na stałe” (§12 ust. 8).
- Metody płatności (Paynow, Stripe), dane Verris z numerem telefonu (§1 ust. 1, §2 ust. 3).
```

**Polityka prywatności (PRIVACY) 1.2.0**
```
- Formularze verris.pl (kontakt, telefon, plan przeniesienia) z okresami przechowywania; plan bez warunku zgody.
- Zgłoszenia do testów, asystent AI na verris.pl, program EKO, zwrot salda przy usunięciu konta.
- Google Consent Mode w trybie podstawowym (narzędzia Google i Meta dopiero po zgodzie) i przekaźnik zdarzeń Meta.
- Termin usunięcia konta: 14 dni albo koniec opłaconego okresu.
```

**Polityka cookies (COOKIES) 1.2.0**
```
- Tabela zgodna z tym, co faktycznie zapisujemy (panel i verris.pl), w tym pamięć przeglądarki.
- Nowy punkt 4: Google Consent Mode v2 w trybie podstawowym – przed zgodą nie ładujemy narzędzi Google ani Meta.
- Kategoria „Funkcjonalne” opisana zgodnie z działaniem (sygnały Google, bez własnych cookies Verris).
```

**Umowa powierzenia (DPA) 1.2.0**
```
- Statystyki odwiedzin stron klienta w zakresie powierzenia (§2 ust. 3, §4).
- Akceptacja i egzemplarz PDF w panelu: Ustawienia → Prywatność i dane (§1, §12).
- Opis środków technicznych bez nazw narzędzi; dane w Unii Europejskiej.
```

### A.3 Pełna lista zmian względem 1.0.1 (dla operatora i do Historii wersji)

Pozycje oznaczone „wcześniej” są już w 1.1.0 z 6.10.2026 – w 1.2.0 nowe jest wszystko pozostałe.

**Regulamin 1.2.0** (część zmian była już w 1.1.0 z 6.10 – oznaczone „wcześniej”):
- §1 ust. 1, §2 ust. 3 – dane Verris z numerem telefonu +48 511 589 465 (decyzja 20; numer tylko w dokumentach –
  na verris.pl i w Panelu prośba o telefon przez verris.pl/kontakt, decyzja 10).
- §1 ust. 6, 13; §6 – Subkonta bez słowa „IAM”; nowy §6 ust. 5: anulowanie i usunięcie usługi, wyłączenie odnowienia,
  usunięcie konta i akceptacja dokumentów – tylko właściciel (decyzja 8). Dawne ust. 5–6 → ust. 6–7.
- §1 ust. 14 – „Panel hostingowy” zamiast nazwy panelu serwera (wcześniej).
- §2 ust. 2 – Polityka prywatności i cookies jako dokumenty informacyjne; integralną częścią Umowy jest DPA (A2-08).
- §2 ust. 5, §11 ust. 1 – infrastruktura w Unii Europejskiej (decyzja 15).
- §4 ust. 2 – treść potwierdzenia zamówienia zgodna z mailem (A2-08).
- §5 ust. 3, §7 ust. 3 – bez 7-dniowej prolongaty po nieudanym odnowieniu; zawieszenie z końcem okresu (wcześniej, Z-02).
- §5 ust. 4 – usunięcie konta: 14 dni albo koniec opłaconego okresu, informacja o saldzie, usługach i domenach (A2-07).
- §5 ust. 5 – asystent AI (wcześniej); dostępny dla wszystkich klientów (decyzja 5).
- §7 ust. 2 – odnowienie z karty albo portfela, cena odnowienia przy zamówieniu (zgodnie z zamówieniem W1).
- §7 ust. 8 – okres próbny: jeden na konto i ograniczenia (z `DO_ZATWIERDZENIA_okres-probny-ograniczenia.md`).
- §8 ust. 1 – metody płatności: Paynow (mBank) i Stripe (A2-15).
- §8 ust. 2 – zakup z portfela bez nowej faktury; kredyty z kodu bez faktury (decyzja 4).
- §8 ust. 4 – zwrot salda przy usunięciu konta na wniosek z numerem rachunku, 14 dni, tylko kredyty opłacone,
  kolejność wydatków (decyzja 9).
- §8a (nowy) – program lojalnościowy EKO (decyzja 12, W6); ust. 2 – wkład tylko od części opłaty zapłaconej
  pieniędzmi, kredyty nieodpłatne schodzą najpierw (decyzja 16); ust. 3 – 300 pkt = 1 drzewo, certyfikaty wyłącznie
  na Verris, bez przekazywania danych Klienta partnerowi (decyzje 16–17).
- §9 ust. 4 – faktura przy każdej wpłacie (wcześniej: KSeF, dokument rozliczeniowy; teraz `ZASADA_FAKTUR`).
- §9 ust. 5, §10 ust. 6 – autoskalowanie: domyślnie bez limitu, limit kosztu na 30 dni, bloki 15 min (decyzja 6).
- §9 ust. 6 (nowy) – rabat na start (decyzja 3).
- §10 ust. 2 – bez nazwy technologii izolacji (A2-16).
- §10 ust. 5 – kopie 7 dni na serwerze / 30 dni poza serwerem, samodzielne przywracanie, Tryb EKO domyślnie
  wyłączony (A2-11, decyzja 7).
- §10 ust. 8 – 14 dni zawieszenia po wygaśnięciu zamiast 30 dni na odzyskanie (wcześniej, Z-05).
- §10 ust. 9 (nowy) – przeniesienie strony w cenie hostingu, przerwa kilka minut przy sklepie (A2-11, decyzja 13).
- §11 ust. 2, 6 – VPS bez rekompensat SLA, odnowienie z portfela/auto-doładowania (wcześniej, Z-09, Z-17).
- §12 ust. 5 – domeny bez automatycznego odnowienia (wcześniej, Z-18).
- §12 ust. 8 – oświadczenie o natychmiastowym wykonaniu i utracie prawa odstąpienia przy każdym zamówieniu
  rejestracji albo transferu Domeny; bez oświadczenia „na stałe” dla kolejnych zamówień (decyzja 21).
- §15 – SLA tylko dla Hostingu, rekompensata automatycznie, bez wniosku (wcześniej; decyzja 1 potwierdza).
- §19 ust. 2 – DPA w Panelu: Ustawienia → Prywatność i dane (A2-06).
- §21 ust. 2 – odstąpienie w Panelu przez Wsparcie → Nowe zgłoszenie (W1, P2-12).

**Polityka prywatności 1.2.0:** §1 z numerem telefonu (decyzja 20); §2.2 numer rachunku do zwrotu; §2.5 uwagi z testów i zgody
marketingowe z historią; §2.6 współpracownicy; §2.7 AI dla wszystkich (wcześniej: nowy punkt); §2.8 asystent AI na
verris.pl; §2.9 formularze verris.pl; §2.10 zgłoszenie do testów; §2.11 program EKO (wkład tylko z pieniędzy, partner bez danych klientów – decyzje 16–17); §3 statystyki odwiedzin jako
powierzenie; §4 nowe wiersze (zwrot salda, kontakt, telefon, plan przeniesienia, wiadomości po planie, beta, oferty
partnerskie, EKO, Consent Mode, asystent www) i termin usunięcia konta; §5.1 Hetzner bez żargonu, Stripe/Paynow,
Cloudflare także formularze www, Anthropic także www, Streamsoft, OpenAI (wcześniej); §5.2 Consent Mode
w trybie podstawowym (decyzja 22), Meta Conversions API; §6 dane w UE; §7 ścieżki w panelu, termin usunięcia, zgłoszenia
do przedawnienia, prawa osób bez konta; §9 bez nazw narzędzi.

**Polityka cookies 1.2.0:** nowe tabele 2.1–2.2 (rzeczywiste klucze panelu i verris.pl; usunięte nieistniejące
`refresh_token`, `csrf_token`, `panel-locale`, `panel-theme`, `dashboard-layout`, `support-draft`); 2.3 Turnstile także
na verris.pl, Paynow; 3.1 „Funkcjonalne” zgodnie z działaniem; nowy punkt 4 – Consent Mode v2 w trybie podstawowym
(decyzja 22 zamiast 11; A2-04, A2-05); 5.3 wspólna zgoda dla verris.pl i panelu.

**DPA 1.2.0:** §1, §12 ust. 1 – akceptacja i egzemplarz w Panelu (A2-06); §2 ust. 3 i §4 – statystyki odwiedzin (A2-12);
§8 ust. 1 i Zał. 1 – UE; Zał. 1 bez nazw narzędzi (A2-16); Zał. 2 – Hetzner, Cloudflare (zakres); §10 ust. 1 –
14 dni na wniosek o zwrot danych (wcześniej, Z-05).

**Poza publikacją w panelu (pliki w repo):** `consumer-info.md` 1.2.0 (płatności, rabat, faktury, autoskalowanie,
kontakt z numerem telefonu, domeny), `subprocessors.md` (Cloudflare www, Anthropic www, Google – tryb podstawowy, Meta CAPI; posadzimy.pl nie jest odbiorcą danych – decyzja 17),
`../rcpd.md` 1.3 (A14–A17, B5).

---

## B. Publikacja — instrukcja dla operatora

### B.1 Przed publikacją
1. Dominik zatwierdza treść `terms.md`, `privacy.md`, `cookies.md`, `dpa.md` i rozstrzyga punkty z części C.
2. Wdrożony kod paczki 109 (bez niego dokumenty obiecują rzeczy, których nie ma): plan przeniesienia bez warunku zgody
   i wypis (`apps/api/src/leads`), retencja formularzy (`LeadsRetencjaScheduler`), DPA w „Prywatność i dane”,
   zwrot salda przy usunięciu konta (W2), limit autoskalowania (W1), program EKO (W6), sklep — dosynchronizowanie bazy (W7).
3. **Publikacja od razu, bez 30 dni** (decyzja 19 z 4.11.2026; uzasadnienie — część C pkt 1). Warunek: dotychczasowe
   wersje (1.0.x i 1.1.0) zaakceptowały wyłącznie konta testowe. Tuż przed publikacją sprawdzić to w bazie produkcyjnej
   (5.11.2026: same konta Dominika i testowe):
   ```sql
   SELECT u.email, c."documentVersion", c."grantedAt"
   FROM "UserConsent" c JOIN "User" u ON u.id = c."userId"
   WHERE c."documentKind" = 'TERMS' AND c."withdrawnAt" IS NULL
   ORDER BY c."grantedAt";
   ```
   Każdy adres z wyniku musi być kontem testowym (zespół, testerzy bety). Jeśli pojawi się prawdziwy klient — nie
   publikować i wrócić do Dominika (dla takiego klienta zmiany na niekorzyść wymagałyby 30 dni z §24 ust. 2).
   Mail z A.1 wysyłamy w dniu publikacji.
4. Kopia bazy przed publikacją (publikacja zmienia `isCurrent` i wymusza ponowną akceptację).

### B.2 Publikacja — wariant 1: skrypt (zalecany, wszystkie cztery dokumenty naraz)
Na serwerze z aktualnym repo (`/opt/verris`, gałąź po scaleniu paczki 109):
```bash
cd /opt/verris
LEGAL_LIVE_VERSION=1.2.0 \
LEGAL_CHANGELOG="$(cat <<'TXT'
Wersja 1.2.0 — automatyczna rekompensata SLA, rabat na start, faktury przy każdej wpłacie, limit autoskalowania
na 30 dni, zwrot salda przy usunięciu konta, kopie 7/30 dni, przeniesienie strony, okres próbny, program EKO,
formularze verris.pl, oświadczenie przy każdym zamówieniu domeny i Consent Mode w trybie
podstawowym. Lista zmian: e-mail z dnia publikacji.
TXT
)" ./ops/scripts/prod-legal-publish-live.sh
```
Skrypt podstawia datę dnia publikacji w miejsce `[DATA PUBLIKACJI]`, odmawia publikacji, gdy w treści zostało
`[UZUPEŁNIĆ…]`/`[TODO…]`, i nie nadpisze istniejącej wersji 1.2.0 inną treścią. Jeden tekst „Zmiany” idzie do
wszystkich czterech dokumentów.

### B.3 Publikacja — wariant 2: panel admina (osobne „Zmiany” dla każdego dokumentu)
Panel admina → **RODO** (`/compliance`) → „Opublikuj nową wersję dokumentu”. Dla każdego z czterech dokumentów:
1. **Rodzaj:** Regulamin (TERMS) / Polityka prywatności (PRIVACY) / Polityka cookies (COOKIES) / Umowa powierzenia (DPA).
2. **Wersja:** `1.2.0`.
3. **Tytuł:** jak dotąd — „Regulamin świadczenia usług Verris”, „Polityka prywatności Verris”, „Polityka plików cookies
   Verris”, „Umowa powierzenia przetwarzania danych osobowych (DPA)”.
4. **Treść:** cały plik z `docs/legal/drafts/` po **ręcznej** zamianie każdego `[DATA PUBLIKACJI]` na datę dnia
   publikacji (np. „7 grudnia 2026 r.”) — formularz w panelu niczego nie podstawia.
5. **Zmiany:** odpowiedni blok z A.2.
6. „Opublikuj wersję”. Kolejność: DPA i COOKIES, potem PRIVACY, na końcu TERMS (ponowna akceptacja rusza przy
   TERMS i PRIVACY).

### B.4 Po publikacji (ten sam dzień)
1. Panel klienta: `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/dpa` pokazują 1.2.0 i datę; okno ponownej
   akceptacji pokazuje „Zmiany”; w „Twoich zgodach” po akceptacji widać 1.2.0 (numer w treści = numer w zgodach).
2. Wysłać mail z A.1 (z datą) do wszystkich aktywnych kont.
3. Włączyć funkcje, które czekały na dokumenty: rekompensata SLA automatycznie (flaga z
   `PROPOZYCJA_ZMIANY_PAR15.md`, pkt 4 checklisty — jeśli jeszcze wyłączona); asystent AI dla wszystkich klientów
   (W8 — ustawienie zamiast listy kont testowych); asystent AI na verris.pl (włącza się przełącznikiem
   w Admin → Konfiguracja asystenta (/settings/ai), sekcja „Asystent na verris.pl”; pojawia się na verris.pl do ok. minuty po włączeniu, bez ponownego wdrożenia); rekrutacja testerów (kampania na verris.pl/beta); `trialDays = 14` dla planu hostingu
   **po wejściu §7 ust. 8 w życie**; program EKO w środowisku produkcyjnym partnera — po zawarciu umowy usługi „Sadzenie przez API” (bez umowy
   powierzenia: partner nie dostaje danych klientów, decyzja 17).
4. Ustawienie wersji polityki cookies w banerze (`CONSENT_VERSION`) — nie zmieniamy: kategorie zgód są te same,
   więc nie trzeba pytać ponownie (Polityka cookies pkt 7 wymaga tego tylko przy nowej kategorii).
5. RCPD: wpis w `rcpd.md` sekcja E (data publikacji, „1.3 obowiązuje”), posadzimy.pl nie wpisujemy do
   `dpa-subprocessors-tracking.md` (nie jest odbiorcą danych — decyzja 17).

---

## C. DO SPRAWDZENIA (ryzyka — decyzja Dominika, ewentualnie z prawnikiem)

1. **Publikacja od razu, bez 30 dni (decyzja 19 z 4.11.2026) — uzasadnienie i ryzyko.** Zmiany na niekorzyść
   względem 1.0.x (część weszła już w 1.1.0 z 6.10): §7 ust. 3 (bez prolongaty), §10 ust. 8 i DPA §10 (14 zamiast 30 dni), §15 (SLA bez VPS), §7 ust. 8
   (ograniczenia próby), §8 ust. 4 (kolejność wydatków przy zwrocie). §24 ust. 2 (30 dni od zawiadomienia) chroni
   Klientów, którzy zawarli Umowę na warunkach 1.0.x albo 1.1.0. Dziś obie zaakceptowały wyłącznie konta testowe (zespół
   i testerzy bety, bez zakupów — kredyty z kodu BETA nie są zakupem), więc nie ma Klienta, wobec którego zmiana
   działałaby wstecz; każdy nowy Klient zawiera Umowę od razu na warunkach 1.2.0 (art. 384 KC — wzorzec doręczony
   przed zawarciem umowy). Odczekanie 30 dni przesunęłoby start bez korzyści dla kogokolwiek. Testerzy dostają mail
   z A.1 i mogą w każdej chwili wypowiedzieć umowę bez kosztów (§24 ust. 3). Ryzyko szczątkowe: gdyby tester bety
   był traktowany jako Klient-konsument, mógłby powołać się na brak 30 dni — w praktyce bez skutku majątkowego (nie
   ma opłaconych usług). Warunek decyzji sprawdza zapytanie z B.1 pkt 3 tuż przed publikacją.
2. **Telefon w danych sprzedawcy — rozstrzygnięte decyzją 20 (4.11.2026).** Numer +48 511 589 465 jest w dokumentach:
   Regulamin §1 ust. 1 i §2 ust. 3, Polityka prywatności §1, `consumer-info.md` (art. 12 ust. 1 pkt 3 upk). Na
   verris.pl i w Panelu numeru nie pokazujemy — tam prośba o telefon (dni robocze 9–17). Do rozważenia: informacje
   przedumowne w zamówieniu w Panelu (`informacje-przedumowne.tsx`) i mail potwierdzenia zamówienia podają dane
   sprzedawcy bez numeru, z odnośnikiem do Regulaminu, w którym numer jest.
3. **Consent Mode v2 — tryb podstawowy (decyzja 22 z 4.11.2026 zamiast decyzji 11).** Przed zgodą verris.pl i Panel
   nie ładują GTM, gtag ani Meta Pixel (kod: `apps/www/src/lib/cookie-consent.ts`, `apps/client-panel/src/lib/
   cookie-consent.ts`; bez `<noscript>` z GTM), więc ryzyko z wytycznych EROD 2/2023 (sygnały bez cookies przed
   zgodą) odpada. Zostaje: po zgodzie tylko na jedną z kategorii (analityczne albo marketingowe) kontener ładuje się
   i tagi drugiej kategorii działają ze stanem „denied” — mogą wysłać sygnały bez cookies; Polityka cookies pkt 4
   ppkt 3 mówi to wprost. Po publikacji sprawdzić w Tag Assistant: (a) przed decyzją i po „Tylko niezbędne” — zero
   żądań do Google i Meta, (b) po zgodzie — `consent update` przed pierwszym tagiem.
4. **Potwierdzenie zamówienia na trwałym nośniku** — mail niesie kluczowe informacje, ale Regulamin tylko jako link
   (TSUE C-49/11). PDF w załączniku wymaga obsługi załączników w mailerze (dziś jej nie ma). §4 ust. 2 Regulaminu
   opisuje stan faktyczny (odnośnik).
5. **Oświadczenie o domenach — rozstrzygnięte decyzją 21 (4.11.2026).** Oświadczenie o natychmiastowym wykonaniu
   i utracie prawa odstąpienia (art. 38 ust. 1 pkt 1 upk) składane przy każdym zamówieniu rejestracji i transferu
   (checkbox w Panelu, API odrzuca zamówienie bez niego, treść i czas zapisane przy zamówieniu —
   `DomainRegistrarOrder.withdrawalWaiverText/At`). §12 ust. 8 bez oświadczenia „na stałe”. Odnowienie domeny
   (§12 ust. 5) nie wymaga oświadczenia — do decyzji, czy też je objąć.
6. **Retencje formularzy verris.pl** (kod: `apps/api/src/leads/leads-retencja.ts`): kontakt 12 mies., telefon 90 dni,
   plan bez zgody 30 dni, zgoda niepotwierdzona 7 dni, potwierdzona ≤ 24 mies., po wypisie 30 dni. Okresy do
   zatwierdzenia; zmiana = zmiana kodu i Polityki §4.
7. **posadzimy.pl — rozstrzygnięte decyzją 17 (4.11.2026).** Certyfikaty (także własnych drzew klientów) wystawiane
   są na „Verris” z tekstem „Drzewo posadzone dzięki klientom Verris”; do API idą tylko te stałe teksty, ID sadzenia
   i liczba drzew (kod: `eco-drzewa.service.ts`, test integracyjny sprawdza body). Partner nie jest odbiorcą danych
   osobowych — Polityka, RCPD (A17) i lista podprocesorów go nie wymieniają, umowa powierzenia niepotrzebna.
8. **Program EKO a twierdzenia środowiskowe** (dyrektywa (UE) 2024/825) — §8a ust. 5 zastrzega, że odznaka nie jest
   oznakowaniem ekologicznym; liczby drzew tylko z certyfikatów. Sprawdzić brzmienie odznaki na stronach klientów.
9. **Treść zgłoszeń po usunięciu konta** — Polityka §7 mówi, że zgłoszenia i reklamacje zostają do przedawnienia
   roszczeń. W kodzie nie ma automatycznego usuwania ich treści po tym terminie (A2-07).
10. **Statystyki odwiedzin** — DPA §2 ust. 3 opisuje przetwarzanie i zostawia ocenę obowiązków informacyjnych
    klientowi. www nie powinno dawać gwarancji „nie wymaga zgody” (W4, A2-12).
11. **Oferty partnerskie** — Polityka mówi, że wysyła je Verris i nie przekazuje danych partnerom. Sprawdzić, że tak
    zostanie (inaczej potrzebny inny opis i podstawa).
12. **Apple Pay / Google Pay** w Stripe Checkout — dokumenty je wymieniają; potwierdzić w ustawieniach konta Stripe.
13. **Hetzner i kraje centrów danych w dokumentach** — wyjątek od zasady white label: art. 13 ust. 1 lit. e i art. 28
    RODO wymagają wskazania podprocesora. Dokumenty podają „Niemcy i Finlandia (UE)”, bez miast.
14. **Program poleceń i reseller** — Regulamin nie ma zasad programu poleceń (prowizje, wypłaty). Do osobnego
    paragrafu po decyzji P2-08/P3-03.
15. **Google Fonts na verris.pl** (A2-03) — dokumenty zakładają, że W4 przeniósł fonty na serwer Verris. Jeśli nie —
    dopisać Google Fonts do Polityki prywatności §5.1 i Polityki cookies albo wstrzymać publikację.

---

## D. Mapa: dokument ↔ kod (do przeglądu RCPD)

| Zapis | Kod |
| --- | --- |
| Regulamin §5 ust. 4, §8 ust. 4 | `apps/api/src/users/zwrot-salda.ts`, `apps/api/src/compliance/account-deletion.service.ts` |
| Regulamin §8 ust. 2, §9 ust. 4 | `apps/client-panel/src/app/dashboard/billing/zasady-dokumentow.ts`, `apps/api/src/billing/tryb-fakturowania.ts` |
| Regulamin §8a | `apps/api/src/eco/drzewa-model.ts`, `eco-drzewa.service.ts`, `posadzimy.client.ts`; kolejność wydatków (ust. 2) — `apps/api/src/users/zwrot-salda.ts` |
| Regulamin §9 ust. 5 | `apps/api/src/subscriptions` (limit autoskalowania W1), `mail/templates/autoscaling-notifications.ts` |
| Regulamin §9 ust. 6 | `apps/api/src/autoscaling/kredyty-autoskalowania.ts`, `apps/api/src/subscriptions/pierwszy-zakup.ts` (do 6.11.2026: `rabat-startowy.ts`) |
| Regulamin §6 ust. 5 | uprawnienia właściciela (W3, `customer-permissions.guard.ts`) |
| Regulamin §12 ust. 8 | `apps/api/src/domains/dto/registrar.dto.ts`, `domain-registrar.service.ts` (`OSWIADCZENIE_*`, zapis przy zamówieniu), Panel: `domains/components/domain-purchase-wizard.tsx`, `services/new/form.tsx` |
| Regulamin §7 ust. 8 | `libs/contracts/src/mail-limits.ts`, `domain-registrar.service.ts`, `trial.service.ts` |
| Polityka §2.9, §4 (formularze) | `apps/api/src/leads/leads.service.ts`, `leads-retencja.ts`, `leads-retencja.scheduler.ts` |
| Polityka §2.5 (zgody) | `apps/api/src/compliance/marketing-preferences.service.ts` (ślad każdej kategorii) |
| Polityka cookies pkt 2.2 | `apps/client-panel/src/**` (klucze `verris-*`), `apps/www/src/lib/asystent-stan.ts`, `MobilnyPasek.tsx` |
| Polityka cookies pkt 4 | `apps/www/src/lib/cookie-consent.ts` (`zaladujTagiGoogle`), `apps/www/src/app/(frontend)/components/Analytics.tsx`, `apps/client-panel/src/lib/cookie-consent.ts`, `apps/client-panel/src/components/analytics-scripts.tsx` |
| DPA §1, §12 | `apps/client-panel/src/app/dashboard/settings/umowa-powierzenia.tsx`, `app/api/dpa/route.ts` |
| DPA §2 ust. 3 | `apps/api/src/analytics-sites/analytics-sites.service.ts` (RETENTION_DAYS = 90) |

---

## E. Zmiany po publikacji 1.2.0 (do wersji 1.2.1)

1. **Kredyty na autoskalowanie zamiast rabatu na start (decyzja Dominika z 6.11.2026).** Regulamin §9 ust. 6 —
   nowa treść: przy pierwszym zakupie hostingu opłaconym z portfela (także BLIK/przelew za zamówienie) nieodpłatne
   kredyty na autoskalowanie (na dzień publikacji 60 zł przy planie rocznym, 10 zł przy miesięcznym), przyznawane po
   opłaceniu, z chwilą uruchomienia usługi, ważne 12 miesięcy; prowadzone osobno od salda portfela, tylko na opłaty
   za autoskalowanie (najpierw one, potem portfel; limit kosztu z ust. 5 liczy opłaty z portfela); bez faktury, bez
   wkładu EKO, bez zwrotu. Rabatu procentowego za pierwszy okres już nie ma — pierwszy okres kosztuje tyle co
   odnowienie, więc przy zamówieniu nie pokazujemy „najniższej ceny z 30 dni” (§9 ust. 3 dotyczy dalej promocji
   obniżających cenę, np. kodów rabatowych). §8 ust. 4 — kredyty na autoskalowanie dopisane do kredytów
   nieodpłatnych bez zwrotu. `consumer-info.md` — akapit o płatnościach zgodnie z §9 ust. 6. Do maila o zmianach
   (A.1) punkt „Rabat na start” zastąpić: „**Kredyty na start:** przy pierwszym zakupie hostingu dostajesz darmowe
   kredyty na autoskalowanie (60 zł przy planie rocznym, 10 zł przy miesięcznym), ważne 12 miesięcy”. Zamówienia
   złożone przed zmianą z rabatem na start rozliczają się jak dotąd (rabat zapisany na usłudze).
2. **Typografia (decyzja Dominika z 6.11.2026).** We wszystkich dokumentach pauza „—” zamieniona na półpauzę „–”,
   bez zmian treści.
3. **Publikacja 1.2.1** – jak w B.1–B.4, z numerem 1.2.1 (wersję 1.2.0 z 6.11.2026 zaakceptowało wyłącznie konto
   Dominika, więc publikacja od razu, decyzja 19). Przed uruchomieniem sprawdzić na serwerze, że `/opt/verris` ma
   paczkę z dokumentami 1.2.1: `git log --oneline -1 && grep -m1 "Wersja" docs/legal/drafts/terms.md`
   (musi pokazać `**Wersja 1.2.1 · …`). Polecenie w jednej linii:
   ```bash
   cd /opt/verris && LEGAL_LIVE_VERSION=1.2.1 LEGAL_CHANGELOG="Wersja 1.2.1 – kredyty na autoskalowanie przy pierwszym zakupie zamiast rabatu na start (§9 ust. 6), poprawki typograficzne." ./ops/scripts/prod-legal-publish-live.sh
   ```
   Mail z A.1 wysłać po publikacji 1.2.1 (A.1 jest już zaktualizowany: wersja 1.2.1 i „Kredyty na start”).
