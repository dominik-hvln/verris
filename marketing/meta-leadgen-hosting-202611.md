# Rekrutacja testerów otwartej bety – `meta-leadgen-hosting-202611`

Decyzje Dominika (2.11.2026): **20–30 testerów**, kanały **Meta (FB/IG) + społeczności bez budżetu**,
budżet **1000 zł netto (1230 zł brutto)**, zapis przez **formularz na verris.pl/beta i wybór w panelu admina**.

Otwarta beta: **7–20.12.2026 na AX102** (PB-26, `docs/ops/BETA_TESTY.md`). Tester dostaje imienny kod
`BETA-…`: **150 K** w portfelu (1 K = 1 zł), ważny **14 dni**, bez karty. Po testach usługa zostaje
(decyzja 19.10, „gdyby coś miało się zmienić, napiszemy z wyprzedzeniem”).

Landing: `https://verris.pl/beta` (paczka 108: strona z formularzem, `noindex`, double opt-in).
Zgłoszenia: panel admina → **Testy (beta) → Zgłoszenia** (zakres, strona, obecny hosting, źródło UTM).

---

## 1. Cel w liczbach

| Etap | Cel | Skąd liczba |
|---|---|---|
| Miejsca w becie | 20–30 testerów | decyzja |
| Potwierdzone zgłoszenia | **60–90** | 2–3 zgłoszenia na miejsce: część się nie potwierdzi, nie odpisze albo nie uruchomi strony |
| Koszt potwierdzonego zgłoszenia | **≤ 15 zł netto (18,45 zł brutto)** | 1000 zł netto / ok. 66 zgłoszeń |
| Kliknięcia w link | ok. 1100–1300 | przy CPC ok. 0,80 zł netto (0,98 zł brutto) |
| Zgłoszenia z kliknięć | ok. 6% | formularz z selekcją, nie zakup |
| CTR reklam | ≥ 1,0% | jak w `meta-hosting-202607.md` |

**Prawdziwe liczby bierzemy z panelu admina**, nie z Meta: Pixel działa dopiero po zgodzie cookies
(Consent Mode v2, domyślnie `denied`), więc Meta zobaczy tylko część zgłoszeń. Każda reklama ma własne
`utm_content`, a zgłoszenie zapisuje UTM – w panelu widać, która kreacja i który zestaw dają zgłoszenia.

---

## 2. Harmonogram

| Termin | Co | Kto |
|---|---|---|
| do 13.11 | Warunki startu z §7 (wdrożenie 108, polityka, konto reklamowe) | Dominik + Claude |
| 16–22.11 | **Faza testowa:** 3 zestawy × 2 kreacje, ok. 300 zł netto (369 zł brutto) | Meta |
| 23.11–6.12 | **Faza główna:** budżet na 1–2 najlepsze zestawy i kreację, ok. 700 zł netto (861 zł brutto) | Meta |
| 16.11–6.12 | Posty w społecznościach (§5), po jednym na grupę, odpowiedzi w komentarzach | Dominik |
| na bieżąco | Przegląd zgłoszeń 2× w tygodniu, notatka przy każdym (zakres, hosting) | Dominik |
| **7.12** | **Fala 1:** 12–15 zaproszeń (kod ważny do 21.12) | panel admina |
| 10.12 | **Fala 2:** do 30 testerów łącznie, uzupełnienie brakujących typów | panel admina |
| 21.12 | Odmowy z uprzejmą wiadomością dla niezaproszonych (opcja „wyślij wiadomość”) | panel admina |

Kampania kończy się 6.12 – po starcie bety nie zbieramy już zgłoszeń z reklam. Mail potwierdzający
mówi, że testy ruszają 7 grudnia, więc osoba zgłoszona w listopadzie wie, kiedy czekać na kod.

Jeśli AX102 albo beta wewnętrzna (PB-40) się przesuną, **przesuwamy start reklam o tyle samo** – nie
zbieramy zgłoszeń dłużej niż 3 tygodnie przed zaproszeniami (stygną, a niepotwierdzone i tak znikają po 7 dniach).

---

## 3. Struktura kampanii

**Kampania:** `meta-leadgen-hosting-202611` · cel Meta: **Ruch → wyświetlenia strony docelowej**.
Cel „Potencjalni klienci” ze zdarzeniem `Lead` ma sens dopiero przy ok. 50 zdarzeniach tygodniowo –
przy zgodzie cookies u części osób i ok. 20–30 zgłoszeniach tygodniowo algorytm by się nie nauczył.
Jeśli w fazie testowej Pixel pokaże ≥ 15 zdarzeń `Lead` tygodniowo, w fazie głównej można zrobić
kopię zestawu z celem „Potencjalni klienci” i porównać koszt zgłoszenia w panelu admina.

Wspólne ustawienia: Polska, język polski, wiek 25–60, umiejscowienia Advantage+ **bez Audience Network**,
bez kategorii specjalnej, wykluczenie: osoby, które odwiedziły `panel.verris.pl` (już klienci/testerzy).

| Zestaw | Odbiorcy (zainteresowania) | Kreacja na start | `utm_content` |
|---|---|---|---|
| A – firmy ze stroną | mała firma, przedsiębiorczość, prowadzenie firmy, WordPress, strona internetowa | B (znak) + C (lista) | `b-firmy`, `c-firmy` |
| B – sklepy | WooCommerce, PrestaShop, sklep internetowy, e-commerce | B + C | `b-sklepy`, `c-sklepy` |
| C – twórcy stron | WordPress, projektowanie stron, web development, freelancing | B + tekst 3 | `b-tworcy`, `c3-tworcy` |

Budżet fazy testowej: ok. 14 zł netto dziennie na zestaw (17,22 zł brutto) przez 7 dni.

**Zasady przesuwania budżetu** (sprawdzamy po 3 i 7 dniach, nie codziennie):
- CTR < 0,6% po 2000 wyświetleń → wymiana kreacji w zestawie;
- koszt potwierdzonego zgłoszenia > 25 zł netto (30,75 zł brutto) po 5 dniach → zestaw do wyłączenia;
- zestaw z najniższym kosztem zgłoszenia dostaje 60% fazy głównej, drugi 40%;
- gdy brakuje typu testera (np. tylko poczta, sklepy), w fazie głównej dokładamy tekst pod ten typ, nie budżet.

Parametry linku w reklamie:
`https://verris.pl/beta?utm_source=meta&utm_medium=paid_social&utm_campaign=meta-leadgen-hosting-202611&utm_content=<kod z tabeli>`

**Koszt brutto:** Meta wystawia fakturę z Irlandii. Przy aktywnym numerze VAT-UE faktura jest bez VAT
(odwrotne obciążenie – VAT rozliczasz sam), więc realny koszt to kwota netto. Bez VAT-UE Meta dolicza 23%.

---

## 4. Kreacje i teksty

Kreacje: Design „Verris – LP otwartych testów” – **B (znak)** i **C (lista)**, kwadrat 1080×1080 i story 1080×1920.
Obie kończą się „Zgłoś się → verris.pl/beta”. Kreacja A zostaje w archiwum.

### Tekst główny (primary text)

**1 – do kreacji B, zestawy A i B**
> Budujemy nowy polski hosting. Zanim ruszymy ze sprzedażą, chcemy, żeby sprawdził go ktoś spoza zespołu.
> Przenieś do nas stronę, sklep albo pocztę i powiedz wprost, co działa źle. Na testy dostajesz 150 zł
> w kredytach na koncie, bez podawania karty. Testy ruszają 7 grudnia.

**2 – do kreacji C, zestawy A i B**
> Mail z potwierdzeniem w spamie? Za mały przycisk na telefonie? Takich uwag szukamy.
> W grudniu otwieramy testy hostingu Verris z autoskalowaniem. Zgłoś się, przenieś stronę i dopisz
> swoje punkty. Na start 150 zł w kredytach, bez karty.

**3 – zestaw C (twórcy stron)**
> Robisz strony dla klientów? Sprawdź przed startem, czy nasz panel nadaje się do pracy na kilku stronach:
> przeniesienie z innego hostingu, kopie, wersja testowa WordPressa, dostęp dla współpracownika.
> 150 zł w kredytach na testy, bez karty. Zgłoszenia do 6 grudnia.

### Nagłówki (headline)
- Testy hostingu Verris – zgłoś się
- 150 zł w kredytach na testy
- Przenieś stronę, zanim wystartujemy

### Opis (description)
- Grudzień 2026 · bez karty · odpowiadamy po polsku

### Przycisk
- **Zapisz się** (Meta: „Sign up”)

Czego w reklamach **nie piszemy**: „za darmo” bez dopisku (150 K to kredyty na czas testów),
„po testach usługa zostaje” (to decyzja „na teraz” – jest na stronie z zastrzeżeniem), asystent AI,
lokalizacje serwerów, nazwy oprogramowania, „100%”, „najtańszy”, nazwy konkurencji.

---

## 5. Społeczności bez budżetu

Każdy link z UTM: `utm_source=<facebook_grupa|linkedin|polecenie>&utm_medium=social&utm_campaign=beta-202611-organic`.

**Zasady:** przed postem w grupie sprawdź regulamin grupy (wiele zakazuje autopromocji – wtedy zapytaj
admina albo odpuść); jeden post na grupę; odpowiadaj na komentarze z własnego profilu; bez wysyłki
do list mailowych i bez wiadomości do osób, których nie znasz (PKE).

### Post na profil (Facebook / LinkedIn Dominika)
> Od kilku miesięcy buduję Verris – polski hosting z autoskalowaniem. W grudniu otwieram testy przed
> startem i szukam 20–30 osób, które przeniosą do nas swoją stronę, sklep albo pocztę i powiedzą wprost,
> co działa źle.
>
> Na testy jest 150 zł w kredytach na koncie, bez podawania karty. Dotychczasowy hosting zostaje
> nietknięty, dopóki sam nie przełączysz domeny. Na uwagi odpowiadam osobiście.
>
> Zgłoszenia do 6 grudnia: verris.pl/beta
> Jeśli znasz kogoś, kto narzeka na swój hosting – podeślij mu ten post.

### Post do grupy (WordPress / przedsiębiorcy) – tylko tam, gdzie regulamin pozwala
> Cześć! Przed startem nowego hostingu (Verris) szukam testerów z prawdziwymi stronami na WordPressie
> i WooCommerce. Chodzi o przeniesienie strony kreatorem, pocztę w domenie, kopie i panel na telefonie
> – i szczere uwagi, co jest niewygodne.
>
> Testy: 7–20 grudnia. Na koncie dostajesz 150 zł w kredytach, bez karty. Strona u obecnego dostawcy
> działa dalej, dopóki nie przełączysz domeny.
>
> Zgłoszenie (minuta): verris.pl/beta. Pytania chętnie w komentarzach.

### Wiadomość 1:1 do znajomych i klientów (tylko osoby, które znasz)
> Hej, w grudniu otwieram testy mojego hostingu Verris. Szukam kilku osób z prawdziwą stroną,
> które przeniosą ją na dwa tygodnie i powiedzą, co nie gra. Na testy jest 150 zł w kredytach, bez karty,
> a obecna strona działa dalej, dopóki nie przełączysz domeny. Jeśli masz chwilę: verris.pl/beta

---

## 6. Wybór testerów (panel admina → Zgłoszenia)

Cel to różne przypadki, nie najszybsi. Proporcje na 25 osób:

| Typ | Ile | Po co |
|---|---|---|
| Firma ze stroną na WordPressie | 9–10 | najczęstszy klient, kreator przeniesienia |
| Sklep (WooCommerce / PrestaShop) | 5 | koszyk, maile do klientów, obciążenie |
| Twórca stron / mała agencja | 5 | kilka stron, dostęp dla współpracownika |
| Tylko poczta | 2–3 | usługa poczty bez hostingu |
| Inne / bez strony | 2 | nowy WordPress od zera |

Pierwszeństwo: prawdziwa strona i domena, różni obecni dostawcy (żeby kreator przeszedł różne
źródła), osoby spoza branży IT. Jedna osoba na firmę. Zgłoszenia wyglądające na boty albo bez strony
przy zakresie „WordPress/Sklep” – na koniec kolejki.

---

## 7. Warunki startu reklam (wszystkie przed 16.11)

1. Paczka 108 wdrożona: strona `/beta`, API zgłoszeń, migracja `20261102120000_beta_zgloszenia`.
   Próba na produkcji: zgłoszenie z własnego adresu → mail potwierdzający → kliknięcie → zgłoszenie
   w panelu admina ze źródłem UTM.
2. **Polityka prywatności**: zatwierdzony i opublikowany `docs/legal/drafts/DO_ZATWIERDZENIA_beta-zgloszenia.md`
   (cel „rekrutacja testerów”, retencja 7/90 dni). Bez tego formularz nie ma podstawy w polityce.
3. Captcha na produkcji (klucz ustawiasz Ty) – bez niego działają tylko limity 5/h na IP i adres.
4. Dostarczalność: mail potwierdzający trafia do skrzynki odbiorczej w Gmailu, Onecie, WP i o2.
5. Meta: konto reklamowe i płatność (Ty), weryfikacja domeny verris.pl w Business Managerze,
   Pixel `2263705751037556` w GTM tylko po zgodzie (jest), zaakceptowane warunki Business Tools.
6. AX102 kupiony i beta wewnętrzna (PB-40) bez błędów krytycznych – inaczej przesuwamy start (§2).
7. Decyzja: czy asystent AI ma być dostępny dla testerów otwartej bety. Mail zaproszenia i scenariusze
   w panelu go wymieniają, a dziś działa tylko dla kont testowych (`AI_TYLKO_KONTA`).

---

## 8. Raport

Co tydzień (pon.): wydatki netto/brutto, wyświetlenia, CTR, CPC, wyświetlenia strony (Meta) oraz
zgłoszenia, potwierdzenia i typy z panelu admina, z podziałem na `utm_content`. Po kampanii jedna
tabela: koszt potwierdzonego zgłoszenia na zestaw i kreację – to punkt wyjścia do budżetu
kampanii sprzedażowej przed startem 11.01.2027.
