# Kreator marki i Pakiet marki – zmiany w dokumentach (projekt do zatwierdzenia)

> **Status: PROJEKT · 2026-11-19 (paczka 130). Nic nie opublikowano – ten plik nie zmienia `terms.md`, `privacy.md`,
> `subprocessors.md`, `dpa.md` ani `rcpd.md` i nie podbija ich wersji.** Moduł jest w kodzie **domyślnie wyłączony**
> (Admin → Wiedza i AI → Kreator marki, ustawienie `kreator-marki.konfiguracja`, `wlaczony: false`, dostępność „lista
> kont”). Ekran admina ostrzega, dopóki obowiązujący Regulamin i Polityka prywatności nie wymieniają „Kreatora marki”
> (`DOKUMENT_Z_KREATOREM_MARKI` w `apps/api/src/kreator-marki/kreator-marki.admin.controller.ts`), a strona
> verris.pl/kreator-marki zwraca 404, dopóki moduł nie jest włączony dla wszystkich.
>
> To nie jest porada prawna. Miejsca oznaczone **[PRAWNIK]** wymagają konsultacji z prawnikiem (decyzja z koncepcji,
> pyt. 7: teksty prawne modułu – z prawnikiem). Oznaczenia **[do weryfikacji]** – numer przepisu albo fakt do
> sprawdzenia w aktualnym tekście ustawy (sesja bez dostępu do sieci). **[DECYZJA]** – wybór właściciela.

## 1. Stan na dziś (kod i założenia)

- Koncepcja: dokument projektu `claude/kreator-marki-koncepcja.md` (rozdz. 2.4 prawo, 5 sprzedaż, 6 pytania).
- Konfiguracja (paczka 130, `apps/api/src/kreator-marki/konfiguracja-marki.ts`), wartości domyślne – założenia
  z 19.11.2026 do potwierdzenia:
  - **w cenie Hostingu:** 1 marka na Konto, 3 serie propozycji i 50 zmian AI miesięcznie; logo SVG/PNG/PDF,
    favicon i ikony, kroje OFL z licencją, stopka e-mail;
  - **Pakiet marki** (jednorazowo): 149 zł brutto (121,14 zł netto) – 10 serii, 300 zmian AI, księga znaku PDF,
    wizytówka PDF do druku, papier firmowy, grafiki social, wzór, nowe szablony materiałów przez 12 miesięcy;
  - **druga marka** na Koncie: 49 zł brutto (39,84 zł netto) jednorazowo;
  - Pakiet **nie** wchodzi w Kreator Pro roczny (przełącznik w adminie);
  - wgrane logo do 10 MB (SVG, PDF, PNG, JPG); symbole od AI włączone (walidator SVG).
- Ścieżki: „Nowa marka”, „Mam logo – Key Visual” (logo bez zmian), „Odświeżenie” (3 kierunki).
- AI: Anthropic (ten sam podprocesor co asystent i Kreator stron) – brief, polecenia, przy wgranym logo także obraz
  logo do analizy (wizja). Zdjęcia w materiałach KV – z bibliotek (Pexels/Openverse/Pixabay) albo generowane (FLUX –
  wyłączone, osobny projekt `DO_ZATWIERDZENIA_zdjecia-ai.md`), **nigdy w logo** (licencja Pexels zakazuje użycia
  w znaku towarowym – z badania 7.11).
- Rejestr wydanych znaków (faza 2): odcisk kształtu (rodzina + parametry + pHash renderu), odrzucanie propozycji
  bardzo podobnych do znaków wydanych w tej samej branży – **wyłącznie wewnętrzny mechanizm jakości, bez obietnicy
  dla Klienta** (decyzja właściciela 19.11.2026: logo powstaje z pomocą AI, nie obiecujemy, że podobny znak nie powstanie).
- Metadane „wygenerowano z pomocą AI” w plikach (SVG `<metadata>`, PNG XMP/IPTC).

## 2. Regulamin – §1 pkt 6 (definicja Usług)

**Obecnie (1.3.0):** „… Hosting (rozdz. III §10) wraz z Verris Kreatorem (§13a), VPS (§11), Domeny (§12), E-mail
marketing (§13), abonament Verris Kreator Pro (§13a) oraz Program resellerski (§14) …”

**Proponowane:**

> 6. **Usługi** – usługi świadczone drogą elektroniczną przez Verris: Hosting (rozdz. III §10) wraz z Verris
> Kreatorem (§13a) i Kreatorem marki (§13b), VPS (§11), Domeny (§12), E-mail marketing (§13), abonament Verris
> Kreator Pro (§13a), Pakiet marki i dodatkowa marka (§13b) oraz Program resellerski (§14), wraz z prowadzeniem
> Konta i Panelu oraz programem lojalnościowym EKO (§8a).

**§10 ust. 3 (zakres Hostingu)** – dopisać na końcu: „… oraz Verris Kreator (§13a) i Kreator marki (§13b).”

## 3. Regulamin – nowy §13b (po §13a)

> ## §13b. Kreator marki i Pakiet marki
>
> 1. **Kreator marki** to narzędzie w Panelu do tworzenia z pomocą sztucznej inteligencji (AI) znaku graficznego lub
>    słowno-graficznego Klienta („Logo”), zasad jego używania oraz materiałów identyfikacji wizualnej („Materiały”).
>    Kreator marki jest dostępny w cenie Hostingu, dopóki Klient ma działający Hosting, w zakresie i z limitami
>    opisanymi w Panelu (m.in. liczba marek na Koncie, miesięczne limity serii propozycji i zmian AI).
>    W okresie próbnym Hostingu (§7 ust. 8) Klient może tworzyć i edytować propozycje; pobranie plików i użycie Logo
>    na stronie z Kreatora (§13a) są dostępne po opłaceniu Hostingu. **[DECYZJA 19.11.2026: podgląd w okresie próbnym zostaje]**
> 2. Kreator marki pozwala: (a) utworzyć nowe Logo na podstawie opisu Klienta („Brief”), (b) przygotować Materiały
>    dla Logo wgranego przez Klienta bez zmiany tego Logo, (c) zaproponować odświeżenie Logo wgranego przez Klienta.
>    Propozycje powstają z biblioteki kształtów, krojów pisma i szablonów Verris („Biblioteka”), parametryzowanych
>    z pomocą AI, oraz – jeżeli funkcja jest włączona – z symboli zaproponowanych przez AI i sprawdzonych
>    automatycznie przez Verris. Propozycje są automatyczne; Verris nie projektuje ani nie poprawia Logo ręcznie.
> 3. **Pakiet marki** to odpłatna, jednorazowa treść cyfrowa rozszerzająca Kreator marki dla jednej marki
>    (m.in. dodatkowe serie propozycji i zmiany AI, księga znaku, wizytówka i papier firmowy do druku, grafiki do
>    mediów społecznościowych, nowe szablony Materiałów przez okres wskazany w Panelu). **Dodatkowa marka** to
>    odpłatna, jednorazowa możliwość utworzenia na Koncie kolejnej marki w zakresie dostępnym w cenie Hostingu.
>    Zakres i cenę Pakietu marki i dodatkowej marki określa Panel przed zakupem i Cennik (§9); nie są Subskrypcją
>    w rozumieniu §7 i nie odnawiają się. Fakturę wystawia się na zasadach §9 ust. 4. Pakiet marki i dodatkową markę
>    można zamówić wyłącznie przy opłaconym Hostingu.
> 4. **Prawa do Logo.** Z chwilą pobrania przez Klienta plików wybranego wariantu Logo („Wydany Wariant”), a przy
>    Materiałach z Pakietu marki – z chwilą zapłaty, Verris – w zakresie, w jakim przysługują mu prawa do Wydanego
>    Wariantu – **[WARIANT A]** przenosi na Klienta autorskie prawa majątkowe do Wydanego Wariantu na polach
>    eksploatacji: utrwalanie i zwielokrotnianie każdą techniką, wprowadzanie do obrotu, użyczanie i najem
>    egzemplarzy, publiczne udostępnianie, w tym w internecie, wykorzystanie w działalności gospodarczej, w tym jako
>    oznaczenie przedsiębiorstwa, towarów i usług, zgłoszenie i rejestracja jako znak towarowy w dowolnym urzędzie,
>    oraz zezwala na wykonywanie zależnych praw autorskich do opracowań Wydanego Wariantu **/ [WARIANT B]** udziela
>    Klientowi licencji wyłącznej, nieograniczonej w czasie i terytorialnie, nieodwołalnej, na polach eksploatacji
>    jak w wariancie A, z prawem do rejestracji Wydanego Wariantu jako znaku towarowego, do tworzenia i rozpowszechniania
>    opracowań oraz do udzielania sublicencji. Wynagrodzenie za przeniesienie praw (udzielenie licencji) jest zawarte
>    w cenie Hostingu albo Pakietu marki. Verris nie twierdzi, że Wydany Wariant jest utworem; jeżeli nie jest,
>    postanowienie stosuje się w zakresie, w jakim Verrisowi przysługują jakiekolwiek prawa do Wydanego Wariantu.
>    **[PRAWNIK – kluczowe]**: art. 53 i art. 67 ust. 5 ustawy o prawie autorskim i prawach pokrewnych wymagają formy
>    pisemnej pod rygorem nieważności dla przeniesienia autorskich praw majątkowych i dla licencji wyłącznej
>    [do weryfikacji aktualnego brzmienia]. Akceptacja Regulaminu w Panelu tej formy nie spełnia (forma pisemna =
>    podpis własnoręczny albo kwalifikowany podpis elektroniczny, art. 78 i 78¹ k.c.). Do rozważenia: (1) licencja
>    niewyłączna z zobowiązaniem Verris do nieudzielania licencji na Wydany Wariant innym osobom (ust. 6) i ze zgodą na
>    rejestrację znaku + prawo Klienta do żądania umowy przeniesienia praw w formie pisemnej (np. podpis kwalifikowany
>    albo dokument podpisany przez Verris na wniosek), albo (2) przeniesienie praw dokumentem podpisanym podpisem
>    kwalifikowanym Verris, generowanym automatycznie przy pobraniu. Ocena, czy przy braku utworu (wytwór AI bez
>    twórczego wkładu człowieka) problem formy w ogóle powstaje – dla części Biblioteki zaprojektowanej przez człowieka
>    powstaje (Wydany Wariant może być opracowaniem szablonu).
> 5. **Biblioteka.** Verris zachowuje wszelkie prawa do Biblioteki (rodzin kształtów i ich parametrów, generatora,
>    szablonów Materiałów i księgi znaku). Klient nie nabywa praw do Biblioteki jako całości ani do jej elementów poza
>    Wydanym Wariantem i Materiałami w postaci przygotowanej dla Klienta. Verris może tworzyć z Biblioteki inne warianty
>    dla innych klientów, z zastrzeżeniem ust. 6. **[PRAWNIK]**: umowa z projektantem Biblioteki musi przenosić na
>    Verris prawa z polami eksploatacji pozwalającymi na ust. 4 (w tym zgoda na opracowania, udzielanie licencji
>    klientom, rejestrację przez klientów jako znaku towarowego) i zobowiązanie do niewykonywania praw osobistych.
> 6. **Podobne znaki.** Kreator marki ogranicza powtarzanie się propozycji (m.in. odrzuca propozycje bardzo podobne
>    do znaków wydanych wcześniej w tej samej branży), ale Verris nie zapewnia, że Wydany Wariant nie jest podobny do
>    znaku wydanego innemu klientowi ani do oznaczeń tworzonych poza Kreatorem marki – Logo powstaje z pomocą
>    generatora i AI na podstawie wspólnej Biblioteki. (Decyzja właściciela 19.11.2026: bez publicznej obietnicy
>    unikalności.)
> 7. **Brak gwarancji rejestrowej.** Kreator marki nie jest badaniem prawnym. Verris nie bada i nie zapewnia, że Logo
>    ma zdolność odróżniającą, może zostać zarejestrowane jako znak towarowy ani że nie narusza praw osób trzecich
>    (w szczególności znaków towarowych, praw autorskich, firm, nazw domen i oznaczeń geograficznych). Logo
>    z Kreatora marki nie jest znakiem zastrzeżonym; ochronę znaku towarowego daje rejestracja we właściwym urzędzie.
> 8. **Sprawdzenie przez Klienta.** Przed użyciem Logo w obrocie, a w szczególności przed zamówieniem druku,
>    oznakowania lub zgłoszeniem znaku, Klient powinien sprawdzić, czy nie istnieją wcześniejsze identyczne lub
>    podobne oznaczenia dla identycznych lub podobnych towarów lub usług – np. w bazie TMview, do której Panel
>    prowadzi, z instrukcją. Przed pobraniem plików do druku Panel prosi o potwierdzenie zapoznania się z tą informacją.
>    Postanowienia ust. 7–8 nie wyłączają ani nie ograniczają odpowiedzialności Verris wobec Konsumenta
>    i Przedsiębiorcy na prawach Konsumenta, która wynika z bezwzględnie obowiązujących przepisów, w tym za zgodność
>    treści cyfrowej z umową. **[PRAWNIK]**: art. 385¹ § 1 i art. 385³ pkt 2 k.c. (klauzule niedozwolone – wyłączenie
>    lub ograniczenie odpowiedzialności) oraz art. 385⁵ k.c. (JDG na prawach konsumenta) [do weryfikacji]; rozdział
>    o treściach cyfrowych w ustawie o prawach konsumenta (rozdz. 5b – zgodność treści cyfrowej z umową) [do
>    weryfikacji]; czy obowiązek sprawdzenia (ust. 8) nie przerzuca niedozwolenie ryzyka na konsumenta; wobec
>    przedsiębiorców (B2B) – czy dopuszczalne jest szersze wyłączenie odpowiedzialności (art. 473 k.c.).
> 9. **Brief i polecenia.** Klient nie może w Briefie ani poleceniach żądać odwzorowania cudzych znaków lub stylu
>    konkretnej marki ani podawać danych, do których nie ma praw. Verris może odrzucić Brief lub propozycję, która
>    zawiera nazwę albo oznaczenie znanej marki, lub nie wydać propozycji, która nie spełnia automatycznych zasad
>    jakości i bezpieczeństwa. Odrzucona seria nie zużywa limitu. **[do potwierdzenia z kodem fazy 2]**
> 10. **Wgrane Logo.** Wgrywając Logo, Klient oświadcza, że ma prawo używać go i zlecić jego przetworzenie (w tym
>     analizę, wektoryzację i opracowanie Materiałów lub propozycji odświeżenia), oraz zwalnia Verris z roszczeń osób
>     trzecich wynikających z nieprawdziwości tego oświadczenia **[PRAWNIK: zwolnienie z roszczeń wobec Konsumenta –
>     dopuszczalność]**. Verris przetwarza wgrane Logo wyłącznie w celu świadczenia funkcji Kreatora marki. Do treści
>     naruszających prawo stosuje się §16–17.
> 11. **Prawo odstąpienia.** Pakiet marki i dodatkowa marka są treścią cyfrową niedostarczaną na nośniku materialnym.
>     Prawo odstąpienia od Umowy w tym zakresie nie przysługuje, jeżeli Verris rozpoczął spełnianie świadczenia za
>     wyraźną i uprzednią zgodą Konsumenta (Przedsiębiorcy na prawach Konsumenta), poinformowanego przed rozpoczęciem
>     świadczenia, że po jego spełnieniu utraci prawo odstąpienia, który przyjął to do wiadomości, a Verris przekazał
>     mu potwierdzenie na trwałym nośniku. Panel zbiera zgodę przy zakupie; bez zgody dostęp do Pakietu marki
>     rozpoczyna się po upływie terminu odstąpienia. **[do weryfikacji: art. 38 ust. 1 pkt 13 ustawy o prawach
>     konsumenta w brzmieniu po nowelizacji z 2022/2023 r. (dyrektywa Omnibus) oraz art. 21 ust. 1 – potwierdzenie
>     na trwałym nośniku]** **[PRAWNIK: czy „bez zgody – dostęp po 14 dniach” jest potrzebny, czy wystarczy blokada
>     zakupu bez zaznaczenia zgody]**.
> 12. **Oznaczenie AI.** Pliki Logo i Materiałów zawierają w metadanych informację, że powstały z pomocą AI.
>     **[PRAWNIK: AI Act – rozporządzenie (UE) 2024/1689, art. 50 ust. 2 (oznaczanie treści syntetycznych w formacie
>     nadającym się do odczytu maszynowego): czy Verris jest „dostawcą” systemu AI generującego obrazy, czy generator
>     parametryczny z AI dobierającym parametry podlega obowiązkowi, terminy stosowania po ewentualnych zmianach
>     (Digital Omnibus) [do weryfikacji]; czy Regulamin ma zakazywać usuwania metadanych]**
> 13. **Kroje pisma.** Kroje dołączane do plików są udostępniane na licencji SIL Open Font License 1.1, której tekst
>     jest dołączony do plików; ich używanie podlega tej licencji. Kroje można używać komercyjnie, nie można
>     sprzedawać samych plików krojów.
> 14. **Usunięcie i koniec Hostingu.** Klient może w każdej chwili usunąć w Panelu markę i wgrane pliki. Po
>     wygaśnięciu Hostingu Kreator marki przestaje być dostępny, a dane marki są usuwane razem z danymi Konta zgodnie
>     z Polityką prywatności; pliki pobrane przez Klienta i prawa z ust. 4 pozostają u Klienta. Techniczny odcisk
>     kształtu (bez danych Klienta i bez nazwy) może pozostać w mechanizmie z ust. 6. Rekompensaty z §15 nie obejmują
>     Kreatora marki ani Pakietu marki.

## 4. Regulamin – §21 (odstąpienie)

Dopisać po ust. 4:

> 4a. Prawo odstąpienia od Umowy w zakresie Pakietu marki i dodatkowej marki wygasa na zasadach §13b ust. 11.

## 5. Polityka prywatności – zmiany

**Nowy pkt 2.13 (po 2.12 Verris Kreator):**

> ### 2.13 Kreator marki (logo i materiały)
> Jeśli tworzysz markę w Kreatorze marki, przetwarzamy: opis firmy z briefu (nazwa, branża, opis działalności, cechy
> marki, lubiane i odrzucone kolory), Twoje polecenia dla AI, propozycje i wybrany wariant logo z historią zmian,
> materiały (np. wizytówkę i stopkę e-mail z danymi, które do nich wpiszesz – imię, nazwisko, stanowisko, telefon,
> e-mail), wgrane przez Ciebie pliki logo, liczniki użycia w miesiącu, informację o zakupie Pakietu marki oraz Twoje
> potwierdzenia (oświadczenie o prawach do wgranego logo, potwierdzenie informacji o sprawdzeniu znaku, zgodę na
> dostarczenie treści cyfrowej) z datą.
>
> Propozycje i zmiany przygotowuje model AI Anthropic (pkt 5.1): przekazujemy mu brief, Twoje polecenia i – jeśli
> wgrywasz logo – obraz logo do analizy kolorów i elementów; dostawca nie trenuje modeli na tych danych. Danych
> z wizytówki i stopki e-mail (imiona, telefony) nie przekazujemy do AI. W dzienniku kosztów AI zapisujemy zużycie
> i koszt każdego użycia, bez treści. Pliki przechowujemy w magazynie plików Verris na naszych serwerach (pkt 5.1 –
> Hetzner). Nazwy i logo nie wysyłamy do zewnętrznych wyszukiwarek znaków – sprawdzenie w TMview robisz sam.
> Rejestr wydanych znaków zawiera wyłącznie cechy techniczne kształtu i branżę, bez danych konta.

**[PRAWNIK / DECYZJA]** Dane pracowników Klienta w stopce e-mail i na wizytówce – Verris jako podmiot przetwarzający
(jak dane na stronie z Kreatora, pkt 2.12 akapit 3) – dopisać do zdania o przetwarzaniu na polecenie albo do DPA §2.

**Pkt 4 (tabela celów, podstaw i okresów) – nowy wiersz:**

| Cel | Podstawa | Okres |
|---|---|---|
| Kreator marki: propozycje logo z pomocą AI, analiza wgranego logo, materiały, stopka e-mail, Pakiet marki | art. 6 ust. 1 lit. b RODO – funkcja usługi, z której korzystasz | marki, propozycje, wgrane pliki i materiały – do ich usunięcia w Panelu, najpóźniej do usunięcia konta; potwierdzenia (oświadczenie o prawach, informacja o znaku, zgoda na treść cyfrową) – **[DECYZJA/PRAWNIK: do przedawnienia roszczeń, np. 6 lat od końca roku, art. 118 k.c. [do weryfikacji]; podstawa: art. 6 ust. 1 lit. c/f]**; dziennik kosztów AI (bez treści) 12 miesięcy; rozliczenia Pakietu marki – jak dokumenty księgowe |

**Pkt 5.1 (podprocesorzy) – wiersz Anthropic, kolumna „zakres”:** dopisać „… oraz Kreator marki (propozycje logo,
zmiany, analiza wgranego logo)”. Anthropic jest już na liście – **zmiana zakresu przetwarzania (nowy rodzaj danych:
obraz logo) [PRAWNIK: czy wymaga zawiadomienia klientów 30 dni wcześniej jak zmiana podprocesora (DPA §7)]**.
`subprocessors.md` i `dpa.md` Załącznik 2 – ten sam dopisek. `rcpd.md` – nowa czynność „Kreator marki”.

## 6. Komunikaty w panelu klienta (do wdrożenia w fazie 2, brzmienie do akceptacji)

1. **Ostrzeżenie w nagłówku Kreatora marki** (stale widoczne):
   „Logo z kreatora nie jest znakiem zastrzeżonym. Zanim zamówisz druk albo zgłosisz znak do urzędu, sprawdź podobne
   znaki w TMview – [Jak to zrobić]. To nie jest badanie prawne.”
2. **Checkbox przed pobraniem plików do druku** (wymagany; zapis z datą):
   „☐ Wiem, że Verris nie sprawdza rejestrów znaków towarowych i nie gwarantuje, że podobnego znaku nikt nie używa.
   Sprawdzę znak w TMview przed drukiem i rejestracją.”
3. **Oświadczenie przy wgraniu logo** (wymagane przed analizą; zapis z datą):
   „☐ Mam prawo używać tego logo i zlecić jego przetworzenie (analizę, wektoryzację, materiały, propozycje
   odświeżenia).”
4. **Checkbox zgody przy zakupie Pakietu marki / dodatkowej marki** (wymagany dla Konsumenta i JDG na prawach
   konsumenta; potwierdzenie e-mailem):
   „☐ Chcę dostać Pakiet marki od razu. Wiem, że po rozpoczęciu dostarczania treści cyfrowej tracę prawo odstąpienia
   od umowy w tym zakresie.” **[PRAWNIK: brzmienie wg art. 38 ust. 1 pkt 13 upk]**
5. **Informacja przy eksporcie:** „Pliki mają w opisie (metadanych) informację, że powstały z pomocą AI. Kroje mają
   licencję SIL Open Font License – jej tekst jest w paczce.”
6. **Odrzucony brief:** „Nie przygotujemy logo na wzór cudzej marki. Opisz, co Ci się w niej podoba – np. prosty znak,
   grube litery, dwa kolory – bez nazwy marki.”

## 7. Do konsultacji z prawnikiem (zbiorczo)

1. Forma przeniesienia praw / licencji wyłącznej (art. 53, art. 67 ust. 5 pr. aut.) przy akceptacji Regulaminu
   online – wariant A/B z §13b ust. 4 albo licencja niewyłączna + zobowiązanie z ust. 6.
2. Umowa z projektantem Biblioteki (pola eksploatacji, opracowania, rejestracja przez klientów, prawa osobiste).
3. §13b ust. 7–8 i 10 wobec Konsumentów i JDG na prawach konsumenta (art. 385¹, 385³, 385⁵ k.c.; rozdz. 5b upk).
4. Utrata prawa odstąpienia przy treści cyfrowej – brzmienie zgody i potwierdzenia (art. 38 ust. 1 pkt 13, art. 21
   upk) [do weryfikacji numerów].
5. AI Act art. 50 ust. 2 – status Verris, zakres obowiązku, terminy.
6. Retencja potwierdzeń (oświadczeń i zgód) i podstawa prawna.
7. Zmiana zakresu przetwarzania u Anthropic (obraz logo) – czy tryb zawiadomienia z DPA §7.
8. Dane pracowników Klienta w stopce i na wizytówce – rola Verris (podmiot przetwarzający).

## 8. Do decyzji właściciela

1. Okres próbny: propozycje, edycja i podgląd logo tak (potwierdzone 19.11.2026), pobranie plików po opłaceniu Hostingu (§13b ust. 1).
2. Ceny i limity (149 / 49 zł brutto, 1 marka, 3 serie, 50 zmian AI, Pakiet 10 serii / 300 zmian / 12 mies.) –
   zmienia się je w adminie bez wdrożenia; artykuły pomocy (szkice) mają liczby domyślne.
3. ~~Publiczna obietnica rejestru~~ – rozstrzygnięte 19.11.2026: bez obietnicy (§13b ust. 6 przepisany).
4. Pakiet marki w Kreatorze Pro – rozstrzygnięte 19.11.2026: bez zmian, marka niezależna od Pro (w cenie Hostingu + jednorazowy Pakiet).
5. Kolejność startu: (1) prawnik → (2) publikacja Regulaminu i Polityki (re-consent, §24 ust. 1 – nowe funkcje) →
   (3) Admin → Kreator marki: dostępność „Wszyscy” i włącznik → (4) publikacja szkiców pomocy w CMS i włączenie
   szablonów odpowiedzi „Kreator marki – …” w Ustawienia → Szablony odpowiedzi.
