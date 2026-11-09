# Dokumenty prawne Verris 1.2.1 → 1.3.0 – lista zmian i publikacja

> **Status: do publikacji · 2026-11-09 (po paczce 126) · nic nie jest opublikowane.**
> Jedna publikacja Regulaminu, Polityki prywatności, Polityki cookies i Umowy powierzenia (DPA) w wersji 1.3.0
> (skrypt `ops/scripts/prod-legal-publish-draft-review.sh` publikuje wszystkie cztery pliki z tym samym numerem).
> Powód: Verris Kreator (w cenie Hostingu) i abonament Verris Kreator Pro – nowa Usługa i nowe funkcje (§24 ust. 1
> Regulaminu: „wprowadzenie nowych Usług lub funkcji”). Właściciel chce włączyć kreator dla wszystkich klientów
> 9.11.2026; dokumenty bez zewnętrznego prawnika (jego decyzja), opisane wg stanu kodu po paczce 126.
> Wersja 1.2.1 została opublikowana 6.11.2026 i zostaje w bazie jako archiwum.
>
> To nie jest porada prawna. Część A jest dla klientów (mail i pole „Zmiany”), część B dla operatora,
> część C – ryzyka i **blokery** do decyzji Dominika, część D – mapa dokument ↔ kod.

---

## A. Co się zmienia – dla klientów

### A.1 Tekst maila do klientów (ponowna akceptacja)

**Temat:** Verris Kreator – nowe wersje regulaminu i polityki prywatności (1.3.0)

> Cześć,
>
> od [DATA PUBLIKACJI] obowiązują nowe wersje dokumentów Verris: Regulaminu, Polityki prywatności, Polityki
> cookies i Umowy powierzenia danych (wersja 1.3.0). Przy najbliższym logowaniu poprosimy Cię o akceptację
> Regulaminu i potwierdzenie zapoznania się z Polityką prywatności. Zmiany dotyczą nowego kreatora stron:
>
> - **Verris Kreator w cenie hostingu** – opisujesz firmę, AI proponuje stronę, Ty ją poprawiasz i publikujesz
>   na swojej domenie. W okresie próbnym hostingu – link podglądu ważny 7 dni; publikacja na domenie, plik ZIP
>   i przejście na WordPress po opłaceniu hostingu.
> - **Kreator Pro** – płatny abonament (miesięczny albo roczny) z wyższymi limitami i dodatkowymi funkcjami,
>   do opłaconego hostingu. Gdy na koncie nie ma już opłaconego hostingu, wyłączamy odnowienie abonamentu
>   i piszemy o tym mailem. Po końcu abonamentu strony zostają, a opublikowane działają dalej.
> - **Treści od AI to propozycja** – za treść publikowanej strony odpowiadasz Ty; AI nie dopisuje cen, opinii
>   ani danych firmy, których nie podasz.
> - **Zdjęcia** – przy wgraniu usuwamy z plików dane aparatu i lokalizację; zdjęcia z bibliotek mają podanego
>   autora i licencję.
> - **Formularz kontaktowy na Twojej stronie** – wiadomości przekazujemy Ci mailem jako podmiot przetwarzający
>   (Umowa powierzenia §2 ust. 4); treści wiadomości nie przechowujemy.
> - **Przejście na WordPress** – po zamianie WordPressem i jego aktualizacjami zajmujesz się Ty; przez 30 dni
>   możesz wrócić do strony z kreatora.
> - **Dane osobowe** – Polityka prywatności opisuje dane w kreatorze (pkt 2.12), a Umowa powierzenia – treści stron
>   i wiadomości z formularzy (§2 ust. 4–5). Model AI tworzący treść stron (Anthropic) jest na liście
>   podprocesorów; biblioteki zdjęć dostają od nas tylko wpisaną frazę, bez Twoich danych.
>
> Pełne teksty i porównanie z poprzednimi wersjami znajdziesz w panelu: Dokumenty prawne → Historia wersji. Jeśli nie
> akceptujesz zmian, możesz wypowiedzieć umowę bez kosztów – niewykorzystaną część opłat zwrócimy proporcjonalnie
> (Regulamin §24 ust. 3).
>
> Zespół Verris

### A.2 Pole „Zmiany” przy publikacji

**Regulamin (TERMS) 1.3.0**
```
- Verris Kreator w cenie Hostingu i abonament Kreator Pro (§1 pkt 6, nowy §13a, §10 ust. 3).
- Kreator Pro: odnowienia, zmiana okresu od następnego odnowienia, wyłączenie odnowienia bez opłaconego Hostingu, skutki końca abonamentu (§13a ust. 9–13; §7 ust. 3–4).
- Treści AI jako propozycja, zdjęcia i licencje, formularz kontaktowy, przejście na WordPress, znak w stopce (§13a ust. 4–8).
```

**Polityka prywatności (PRIVACY) 1.3.0**
```
- Nowy pkt 2.12 – dane w Verris Kreatorze (dane firmy, treści stron, zdjęcia bez metadanych, biblioteki zdjęć tylko z frazą).
- Anthropic także dla kreatora; magazyn zdjęć na serwerach Verris; formularze stron klientów przez Amazon SES (pkt 5.1).
- Cel, podstawa i okresy przechowywania kreatora (pkt 4); usunięcie danych kreatora z kontem (pkt 7).
```

**Polityka cookies (COOKIES) 1.3.0**
```
- Bez zmian merytorycznych – numer wersji wspólny dla wszystkich dokumentów. Kreator nie zapisuje cookies ani danych w pamięci przeglądarki.
```

**Umowa powierzenia (DPA) 1.3.0**
```
- Formularze kontaktowe stron z Verris Kreatora i treści stron w zakresie powierzenia (§2 ust. 2, 4, 5; §4).
- Załącznik 2: Anthropic (treści stron w kreatorze), Amazon SES (wiadomości z formularzy), Hetzner (magazyn zdjęć).
```

### A.3 Pełna lista zmian (dla operatora i do Historii wersji)

**Regulamin 1.3.0** (`terms.md`):
- Nagłówek: „Wersja 1.3.0 zastępuje wersję 1.2.1 z 6 listopada 2026 r.” (bez dopisku o okresie przed startem –
  od 1.2.1 nie sprawdzaliśmy, czy są już klienci; patrz C pkt 5).
- §1 pkt 6 – Usługi: „Hosting (rozdz. III §10) wraz z Verris Kreatorem (§13a)” i „abonament Verris Kreator Pro (§13a)”
  (brzmienie z `DO_ZATWIERDZENIA_kreator-pro.md`).
- §7 ust. 3 – „Z zastrzeżeniem §11 ust. 7 (VPS) i §13a ust. 12 (Kreator Pro)” (projekt: wariant z dopiskiem w §7).
- §7 ust. 4 – zdanie o zmianie okresu Kreatora Pro (odesłanie do §13a ust. 10) – bez niego §7 ust. 4 obiecywałby
  zmianę „z chwilą zmiany” z rozliczeniem proporcjonalnym, a kod (paczka 123) zmienia okres od następnego odnowienia.
- §10 ust. 3 – w ramach Hostingu także Verris Kreator (§13a).
- §13a (nowy) – Verris Kreator i abonament Kreator Pro. Względem projektu z paczki 121 (6 ustępów) zaktualizowany do
  paczek 122–125:
  - ust. 1 – Kreator w cenie Hostingu, dopóki Hosting działa; limity i funkcje AI „w zakresie opisanym w Panelu”
    (bez obietnicy generowania zdjęć – `DO_ZATWIERDZENIA_zdjecia-ai.md`, funkcja wyłączona);
  - ust. 2 – wersja próbna: link podglądu 7 dni bez indeksowania; domena, ZIP i WordPress po opłaceniu Hostingu;
  - ust. 3 – publikacja na Hostingu z kopią poprzedniej zawartości (po potwierdzeniu), wycofanie przywraca kopię,
    opublikowana strona podlega §10 (kopie, usunięcie po wygaśnięciu), ZIP;
  - ust. 4 – treści AI jako propozycja, odpowiedzialność Klienta (§16 ust. 3), AI nie dodaje cen, opinii, danych firmy;
  - ust. 5 – zdjęcia własne (prawa Klienta, usuwanie metadanych) i z bibliotek (licencje dostawców: domena publiczna,
    CC0, Pixabay; autor i licencja w ZIP);
  - ust. 6 – formularz kontaktowy: mail na adres ze strony albo Konta, Verris jako podmiot przetwarzający (DPA §2
    ust. 4), limity i odrzucanie spamu, działa, dopóki strona jest opublikowana;
  - ust. 7 – przejście na WordPress: po zamianie Klient administruje WordPressem i odpowiada za aktualizacje, motywy,
    wtyczki (oprogramowanie Klienta w rozumieniu §18 ust. 2); cofnięcie przez 30 dni;
  - ust. 8 – znak „Stworzone w Verris Kreator” w stopce i w ZIP; w Pro wariant dyskretny;
  - ust. 9 – Kreator Pro: zakres w Panelu przed zakupem, tylko przy opłaconym Hostingu, jeden na Konto, poza SLA §15;
  - ust. 10 – Subskrypcja z §7, odnowienie z Portfela albo kartą, faktura §9 ust. 4, wyłączenie odnowienia, zmiana
    okresu od następnego odnowienia (paczka 123);
  - ust. 11 – wyłączenie odnowienia przez Verris, gdy na Koncie nie ma opłaconego Hostingu (paczka 123), bez zwrotu
    za bieżący okres; zaległy abonament kończy się od razu bez dochodzenia zaległości; zawieszony Hosting nie
    wyłącza odnowienia, ale Kreator jest wtedy niedostępny;
  - ust. 12 – nieudane odnowienie (z projektu, ust. 4), bez informacji dla odwiedzających i bez usuwania danych;
  - ust. 13 – skutki końca abonamentu (z projektu, ust. 5) z przykładami elementów Pro;
  - ust. 14 – usuwanie stron i zdjęć przez Klienta; odesłanie do Polityki prywatności.
- §19 ust. 2 – przykład danych powierzonych: osoby wysyłające wiadomości przez formularz strony z Kreatora.
- §24 – bez zmian: nowa Usługa i funkcje mieszczą się w katalogu ust. 1, ust. 3 wymaga akceptacji nowej wersji.

**Polityka prywatności 1.3.0** (`privacy.md`): nagłówek (zastępuje 1.2.1 z 6.11.2026); nowy pkt 2.12 Verris Kreator
(dane z kreatora, Anthropic bez zdjęć, dziennik kosztów bez treści, magazyn na serwerach Verris, biblioteki zdjęć
wyszukiwane przez serwer Verris – do dostawcy tylko fraza, dlatego nie są odbiorcami); pkt 3 – treści stron z danymi
osób trzecich i wiadomości z formularzy jako powierzenie; pkt 4 – nowy wiersz „Verris Kreator” (lit. b, okresy);
pkt 5.1 – Hetzner (magazyn plików), Amazon SES (formularze stron z kreatora), Anthropic (Verris Kreator); pkt 7 –
strony i zdjęcia kreatora usuwane razem z kontem (C pkt 1 – naprawione w kodzie, paczka 126); pkt 8 – kreator niczego nie rozstrzyga.
Bez Black Forest Labs i bez opisu generowania zdjęć.

**Polityka cookies 1.3.0** (`cookies.md`): tylko numer wersji. Sprawdzone w kodzie: renderer stron
(`libs/kreator/src/render/**`, `skrypt.ts`) nie zapisuje cookies ani `localStorage`/`sessionStorage`, fonty są
kopiowane na hosting Klienta (bez połączeń z Google), mapa to zwykły odnośnik; edytor kreatora w panelu nie dodaje
kluczy pamięci przeglądarki; link podglądu (`kreator-link.controller.ts`) nie ustawia cookies (dostęp przez token
w adresie). Strony Klientów nie są objęte Polityką cookies Verris.

**DPA 1.3.0** (`dpa.md`): §2 ust. 2 – charakter przetwarzania w kreatorze; nowy §2 ust. 4 – formularz kontaktowy
(pola formularza, mail do Klienta, w bazie bez treści wiadomości; dziennik wysyłek bez adresu wysyłającego, 12 miesięcy –
C pkt 2, naprawione w kodzie, paczka 126; IP tylko do limitów); nowy §2 ust. 5 – treści stron i zdjęcia w kreatorze; §4 ust. 1–2 – dane
i kategoria „osoby kontaktujące się z Klientem przez formularz”; Załącznik 2 – Hetzner (magazyn zdjęć), Amazon SES
(formularze), nowy wiersz Anthropic (treści stron w kreatorze, bez zdjęć) – **C pkt 4**.

**Poza publikacją w panelu (pliki w repo):** `subprocessors.md` 1.3.0 (Hetzner – MinIO ze zdjęciami kreatora,
Amazon SES – formularze, Anthropic – Verris Kreator; bez Black Forest Labs), `../consumer-info.md` 1.3.0 (główne cechy:
Verris Kreator w cenie hostingu, abonament Kreator Pro), `DO_ZATWIERDZENIA_kreator-pro.md` oznaczony „WBUDOWANE w 1.3.0”.
Do zrobienia osobno: `../rcpd.md` – brak czynności „Verris Kreator” (C pkt 8).

---

## B. Publikacja – instrukcja dla operatora

### B.1 Przed publikacją
1. Dominik zatwierdza treść czterech dokumentów. Blokery C pkt 1–3 są naprawione w kodzie paczki 126 – wdrożyć ją
   przed publikacją (pkt 2).
2. Wdrożony kod paczek 121–126 (Kreator Pro, publikacja, formularz, WordPress, poprawki z C pkt 1–3) – bez niego dokumenty opisują
   funkcje, których nie ma.
3. Sprawdzić, kto zaakceptował 1.2.x (zmiany są nowymi funkcjami i nie pogarszają dotychczasowych warunków, więc
   publikacja od razu – §24 ust. 4; patrz C pkt 5):
   ```sql
   SELECT u.email, c."documentVersion", c."grantedAt"
   FROM "UserConsent" c JOIN "User" u ON u.id = c."userId"
   WHERE c."documentKind" IN ('TERMS', 'DPA') AND c."withdrawnAt" IS NULL
   ORDER BY c."grantedAt";
   ```
4. Kopia bazy przed publikacją.

### B.2 Publikacja (skrypt, wszystkie cztery dokumenty naraz)
Na serwerze z aktualnym repo – najpierw sprawdzić, że `/opt/verris` ma dokumenty 1.3.0:
`git log --oneline -1 && grep -m1 "Wersja" docs/legal/drafts/terms.md` (musi pokazać `**Wersja 1.3.0 · …`).
```bash
cd /opt/verris && LEGAL_LIVE_VERSION=1.3.0 LEGAL_CHANGELOG="Wersja 1.3.0 – Verris Kreator w cenie hostingu i abonament Kreator Pro (Regulamin §13a), dane w kreatorze (Polityka prywatności pkt 2.12), formularze kontaktowe stron z kreatora w umowie powierzenia (DPA §2 ust. 4–5). Polityka cookies bez zmian merytorycznych." ./ops/scripts/prod-legal-publish-live.sh
```
Skrypt podstawia datę w miejsce `[DATA PUBLIKACJI]`, odmawia publikacji przy `[UZUPEŁNIĆ…]`/`[TODO…]` i nie nadpisze
istniejącej wersji 1.3.0 inną treścią. Wariant z osobnymi „Zmianami” (A.2) – panel admina → RODO, jak
w `ZMIANY_1.1.0-1.2.0.md` B.3, z numerem 1.3.0.

### B.3 Po publikacji (ten sam dzień)
1. Panel klienta: `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/dpa` pokazują 1.3.0.
2. Admin → Wiedza i AI → Kreator stron: ostrzeżenie przy włączniku znika (obowiązujący Regulamin zawiera
   „Verris Kreator” – `REGULAMIN_Z_KREATOREM` w `kreator.admin.controller.ts`). Dopiero wtedy przełącznik
   `wlaczony` w `kreator.konfiguracja` dla wszystkich i plan `kreator-pro` publiczny.
3. Mail z A.1 do wszystkich aktywnych kont.
4. Generowanie zdjęć AI **zostaje wyłączone** (`kreator.konfiguracja.obrazyAi.wlaczone = false`) do czasu umowy
   z dostawcą i osobnej zmiany dokumentów (`DO_ZATWIERDZENIA_zdjecia-ai.md`, 30 dni zawiadomienia z DPA §7).

---

## C. DO SPRAWDZENIA (ryzyka i blokery – decyzja Dominika)

1. **BLOKER – usunięcie konta nie usuwa danych kreatora.** Naprawione w kodzie (paczka 126). Polityka pkt 7 i DPA §10
   obiecują usunięcie, a usunięcie konta to anonimizacja (wiersz `User` zostaje, kaskady Prisma od `User` nie działały).
   Teraz `compliance/account-deletion.service.ts` (`executeAnonymization`, krok 3e') w transakcji anonimizacji usuwa
   `KreatorStrona` (kaskadą wersje i `KreatorCms` z loginem WordPressa), `KreatorZasob` i `KreatorZuzycie` (liczniki służą
   tylko limitom i statystyce kosztów miesiąca w adminie – nic rozliczeniowego; dziennik kosztów AI bez treści zostaje
   do retencji 12 miesięcy), a z parametrów zadań węzła kont klienta – hasła bazy i administratora WordPressa oraz e-mail
   administratora (`DANE_LOGOWANIA_PARAMETROW`). Po zapisie usuwa pliki zdjęć z magazynu (`KREATOR_ZASOBY`, oryginał
   i wszystkie warianty – `kluczePlikowZasobu` w `kreator/zasoby-obraz.ts`, ta sama lista co przy usunięciu zdjęcia);
   błąd magazynu nie blokuje usunięcia konta (log z kluczem do ręcznego sprzątnięcia – jak pliki poczty przychodzącej;
   kolejki ponowień nie ma). Linki podglądu, formularza i plików zdjęć bez wiersza strony/zdjęcia przestają działać.
   Pliki opublikowane na hostingu i WordPress usuwa istniejący proces konta hostingowego: zawieszenie przy anonimizacji,
   usunięcie konta z serwera po 30 dniach (`purgeAccountOnDa`). Eksport danych (art. 15/20, `data-export.service.ts`)
   ma pliki `kreator-sites.json` (model strony, brief, propozycje, wersje, publikacja, WordPress bez haseł),
   `kreator-photos.json` (metadane zdjęć, bez plików) i `kreator-usage.json`. Testy: `account-deletion.anonymizacja.spec.ts`,
   `data-export.zip.spec.ts`, `test/integration/usuniecie-konta.int-spec.ts`.
2. **BLOKER – dziennik wysyłek bez retencji.** Naprawione w kodzie (paczka 126). DPA §2 ust. 4 i Polityka pkt 4 („logi
   doręczeń 12 miesięcy”, tak już od 1.x): `compliance/retention.scheduler.ts` (`purgeEmailLogs`) co noc usuwa `EmailLog`
   starsze niż 365 dni partiami po 5000. Starszych wpisów nic nie potrzebuje (limit formularza – doba, kondycja poczty
   i metryki – minuty i doba, karta klienta – ostatnie 50, liczniki kampanii są w `MarketingCampaign`); wyjątek – wpisy
   kampanii w toku (`SENDING`), po których worker wznawia wysyłkę bez duplikatów. Dla tagu `kreator.formularz`
   `mail/mailer.service.ts` nie zapisuje już adresu nadawcy formularza (`metadata.replyTo`, `TAGI_BEZ_ADRESU_ODPOWIEDZI`);
   treści maili dziennik nie trzyma w ogóle; limit 50 maili na dobę liczy się z tagu, konta, tematu i daty, które zostają.
   Wpisy sprzed poprawki traci `replyTo` ten sam przebieg retencji. DPA §2 ust. 4 opisuje dziennik bez adresu
   wysyłającego. Testy: `retention.scheduler.spec.ts`, `mail/dziennik-bez-adresu-nadawcy.spec.ts`,
   `test/integration/retencja-danych-osobowych.int-spec.ts`.
3. **BLOKER – Panel obiecuje zdjęcia AI w Kreatorze Pro.** Naprawione w kodzie (paczka 126). Regulamin §13a ust. 9
   odsyła do zakresu „opisanego w Panelu przed zakupem”. Panel bierze listę korzyści z API (`GET /kreator/stan`, pole
   `korzysciPro`), a API zwraca ją przez `korzysciPro({ zdjeciaAi })` z `libs/kreator/src/plany.ts` – pozycja „Zdjęcia AI”
   tylko przy `obrazyAi.wlaczone = true`. Kafelek w Dodatkach, strona www `/kreator-stron` i artykuły pomocy
   (`cli/seed-kb-cms.ts`) zdjęć AI nie wymieniają; limitów zdjęć AI Panel w porównaniu planów nie pokazuje. Testy:
   `libs/kreator/src/plany.spec.ts`, `kreator.service.spec.ts`.
4. **Anthropic jako dalszy podmiot przetwarzający w DPA (Załącznik 2).** Treści stron mogą zawierać dane osób trzecich
   (powierzenie), a idą do modelu Anthropic – więc wiersz jest potrzebny. DPA §7 ust. 2 wymaga zawiadomienia 30 dni
   przed dodaniem dalszego podmiotu. Argument za publikacją od razu: Anthropic przetwarza wyłącznie treści, które
   Klient wpisze do nowej funkcji po wejściu 1.3.0 w życie – dotychczas powierzone dane (pliki, poczta, bazy) do niego
   nie trafiają, a korzystanie z Kreatora jest dobrowolne. Ryzyko szczątkowe: Klient, który zaakceptował DPA 1.2.x
   i od razu użyje kreatora, mógłby twierdzić, że nie dostał 30 dni na sprzeciw. Alternatywa: osobny mail z 30-dniowym
   zawiadomieniem do kont z zaakceptowaną DPA.
5. **Publikacja od razu (§24 ust. 4) zamiast 30 dni (§24 ust. 2).** Zmiany wprowadzają nowe, dobrowolne funkcje
   i nową Usługę; dotychczasowych warunków nie pogarszają (§7 ust. 3–4 zmienione tylko dla Kreatora Pro, którego
   nikt jeszcze nie ma). Warunek: zapytanie z B.1 pkt 3 – jeśli pojawią się prawdziwi klienci, rozważyć, czy
   ich dotyczy cokolwiek poza nowymi funkcjami. Nagłówek nie powtarza już „opublikowaną przed rozpoczęciem
   świadczenia usług klientom” – nie wiemy, czy to nadal prawda.
6. **Bez zwrotu za bieżący okres, gdy Kreator Pro zostaje bez Hostingu (§13a ust. 11).** Decyzja koordynatora
   z paczki 123. Bez opłaconego Hostingu Kreator (także Pro) nie działa, więc Klient-konsument płaci za okres, w którym
   funkcji nie ma – może to podważać jako niewykonanie umowy. Łagodzi to: Klient sam zakończył Hosting, dostaje mail,
   a ponowne opłacenie Hostingu przywraca Pro do końca okresu. Alternatywa: proporcjonalny zwrot na Portfel.
7. **Zawieszony Hosting a odnowienie Pro (§13a ust. 11).** Kod (`HOSTING_ISTNIEJE` w `kreator-pro.ts`) traktuje
   zawieszony Hosting jako istniejący – odnowienie Pro trwa, choć Kreator jest niedostępny do czasu zapłaty za
   Hosting. Opisane wprost; do decyzji, czy tak ma zostać.
8. **RCPD** (`../rcpd.md`) nie ma czynności „Verris Kreator” (dane firmy z kreatora, treści stron, zdjęcia, dziennik
   kosztów AI; odbiorcy: Anthropic, Hetzner; formularze – rejestr kategorii czynności jako podmiot przetwarzający,
   art. 30 ust. 2 RODO). Dopisać przy najbliższym przeglądzie.
9. **Biblioteki zdjęć.** Openverse – tylko `cc0,pdm` (`biblioteka/openverse.ts`), Pixabay – licencja Pixabay
   (zakazy m.in. sprzedaży niezmienionych zdjęć i sugerowania poparcia przez osoby lub marki na zdjęciu). Regulamin
   przenosi sprawdzenie dopuszczalności użycia na Klienta (§13a ust. 5); Verris podaje autora i licencję za dostawcą.
   Pexels – adapter jest, ale wyłączony bez klucza; Regulamin nie wymienia dostawców zamkniętą listą.
10. **Formularz na stronach Klientów.** Checkbox zgody na stronie mówi „Administratorem danych jest {firma}”, a link
    do polityki prywatności strony jest opcjonalny – obowiązek informacyjny wobec piszących spoczywa na Kliencie
    (§13a ust. 6, DPA §2 ust. 4). Do rozważenia: podpowiedź w edytorze, gdy strona ma formularz, a nie ma polityki.
11. **Zdjęcia AI** – poza 1.3.0. Włączenie wymaga zmian z `DO_ZATWIERDZENIA_zdjecia-ai.md` (nowy podprocesor,
    30 dni zawiadomienia, AI Act art. 50) i kolejnej wersji dokumentów.
12. **SLA.** §13a ust. 9: rekompensaty z §15 nie obejmują Kreatora Pro (formularz i edytor działają przez API Verris,
    nie przez serwer hostingowy); dostępność opublikowanej strony mieści się w SLA Hostingu.

---

## D. Mapa: dokument ↔ kod

| Zapis | Kod |
| --- | --- |
| Regulamin §13a ust. 1, 2, 9 (wersje, limity) | `libs/kreator/src/plany.ts` (`PLANY_KREATORA`, `KORZYSCI_PRO`), `apps/api/src/kreator/wersja-kreatora.ts` |
| §13a ust. 2 (link podglądu 7 dni, noindex) | `apps/api/src/kreator/publikacja.service.ts` (`WAZNOSC_LINKU_MS`), `kreator-link.controller.ts` |
| §13a ust. 3 (kopia, wycofanie, ZIP) | `publikacja.service.ts` (`publikuj`, `wycofaj`), `publikacja.ts` (`PREFIKS_KOPII`), `zip-strony.ts` |
| §13a ust. 4 (AI bez cen, opinii, danych) | `libs/kreator/src/ai/master-prompt.ts`, `ai/odczyt.ts` |
| §13a ust. 5 (zdjęcia, metadane, licencje) | `apps/api/src/kreator/zasoby-obraz.ts`, `zasoby.service.ts` (`creditsTxt`), `biblioteka/openverse.ts`, `biblioteka/pixabay.ts` |
| §13a ust. 6, DPA §2 ust. 4 (formularz) | `apps/api/src/kreator/formularz.service.ts` (`LIMIT_IP`, `LIMIT_STRONY_DOBA`), `formularz.ts`, `mail/mailer.service.ts` (`EmailLog`) |
| §13a ust. 7 (WordPress, 30 dni) | `apps/api/src/kreator/wordpress/kreator-wordpress.service.ts` (`OKRES_COFNIECIA_DNI`) |
| §13a ust. 8 (znak) | `libs/kreator/src/render/znak.ts`, `render/uklad.ts`, `plany.ts` (`znakMinimalny`) |
| §13a ust. 10–12 (subskrypcja, okres, bez hostingu) | `apps/api/src/kreator/kreator-pro.ts` (`zaplanujOkresPro`, `maPlatnyHosting`), `subscriptions/renewal.scheduler.ts` (`runKreatorProBezHostingu`), `subscriptions/subscriptions.service.ts` (`wylaczOdnowienieKreatoraProBezHostingu`) |
| §13a ust. 13 (koniec Pro) | `libs/kreator/src/plany.ts` (`dopasujDoPlanu`) |
| Polityka pkt 2.12, DPA Zał. 2 (Anthropic) | `apps/api/src/ai/ai-provider.service.ts` (`anthropicZBlokami`, dziennik bez treści), `kreator/konfiguracja.ts` |
| Polityka pkt 7, DPA §10 (usunięcie z kontem) | `compliance/account-deletion.service.ts` (`executeAnonymization`, krok 3e'), `kreator/zasoby-obraz.ts` (`kluczePlikowZasobu`) – C pkt 1 |
| Polityka pkt 4, DPA §2 ust. 4 (dziennik wysyłek 12 miesięcy, bez adresu wysyłającego) | `compliance/retention.scheduler.ts` (`purgeEmailLogs`), `mail/mailer.service.ts` (`TAGI_BEZ_ADRESU_ODPOWIEDZI`) – C pkt 2 |
| Regulamin §13a ust. 9 (zakres Pro w Panelu) | `libs/kreator/src/plany.ts` (`korzysciPro`), `kreator/kreator.service.ts` (`stan`) – C pkt 3 |
