# Regulamin świadczenia usług hostingowych Verris

> **DRAFT — wymaga lawyer review.** Ostatnia aktualizacja: Sprint 0, maj 2026.

## §1. Definicje

W niniejszym Regulaminie poniższe pojęcia mają następujące znaczenia:

1. **Usługodawca / Verris** — HVLN Dominik Kowalski z siedzibą pod adresem Zacisze 2A, 65-775 Zielona Góra, wpisany do Centralnej Ewidencji i Informacji o Działalności Gospodarczej, NIP 9292069367, REGON 521024260, e-mail kontaktowy: `kontakt@hvln.pl`.
2. **Usługobiorca / Klient** — osoba fizyczna posiadająca pełną zdolność do czynności prawnych, osoba prawna albo jednostka organizacyjna nieposiadająca osobowości prawnej, której ustawa przyznaje zdolność prawną, korzystająca z Usług.
3. **Konsument** — Usługobiorca będący osobą fizyczną zawierającą umowę poza zakresem prowadzonej przez siebie działalności gospodarczej lub zawodowej.
4. **Przedsiębiorca na prawach Konsumenta** — osoba fizyczna prowadząca działalność gospodarczą, dla której zawarcie umowy nie ma charakteru zawodowego (art. 38a ust. 1 ustawy o prawach konsumenta).
5. **Usługa** — usługa hostingowa świadczona przez Verris, polegająca na udostępnieniu zasobów serwerowych do utrzymywania stron internetowych, aplikacji i baz danych Klienta, wraz z usługami dodatkowymi (e-mail, backup, autoskalowanie, panel administracyjny).
6. **Panel** — interfejs webowy dostępny pod adresem `panel.verris.pl`, służący Klientowi do zarządzania jego usługami.
7. **Plan** — pakiet zasobów (CPU, RAM, dysk, transfer, liczba stron) o określonej miesięcznej lub rocznej cenie.
8. **Subskrypcja** — umowa o świadczenie Usługi w wybranym Planie i okresie rozliczeniowym (miesiąc / rok).
9. **Portfel** — saldo środków przedpłaconych Klienta, wyrażone w wirtualnych jednostkach „Kredyty Verris" (skrót `K`). Kurs wymiany: **1 PLN = 1 K**.
10. **Kredyty Verris** — bony jednolitego przeznaczenia w rozumieniu art. 2 pkt 41 lit. a) ustawy o VAT, zasilające Portfel Klienta i wymienialne wyłącznie na Usługi Verris.
11. **Węzeł** — fizyczny lub wirtualny serwer obliczeniowy Verris, na którym uruchamiana jest Usługa Klienta.
12. **DirectAdmin** — system zarządzania serwerem hostingowym, do którego Klient otrzymuje dostęp w ramach Usługi.
13. **RODO** — Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. w sprawie ochrony osób fizycznych w związku z przetwarzaniem danych osobowych.

## §2. Postanowienia ogólne

1. Regulamin określa zasady świadczenia Usług przez Verris, prawa i obowiązki Stron, zasady zawierania i rozwiązywania Umów, postępowania reklamacyjnego oraz odpowiedzialności.
2. Korzystanie z Usług wymaga akceptacji Regulaminu, Polityki prywatności (`https://panel.verris.pl/legal/privacy`) oraz Polityki cookies (`https://panel.verris.pl/legal/cookies`).
3. Klient korzysta z Usług na własny rachunek i ryzyko w zakresie treści, które publikuje lub przetwarza.
4. Językiem Umowy jest język polski. Walutą rozliczeń jest złoty polski (PLN). Faktury wystawiane są w PLN zgodnie z polskim prawem podatkowym.

## §3. Wymagania techniczne

Korzystanie z Panelu wymaga:

1. dostępu do internetu,
2. urządzenia z aktualną przeglądarką (Chrome / Firefox / Safari / Edge w wersjach bieżących -2 wersje),
3. obsługi JavaScript i plików cookie (zgodnie z Polityką cookies),
4. konta e-mail Klienta dla potwierdzeń i komunikacji.

## §4. Zawarcie umowy

1. Umowa o świadczenie Usług zostaje zawarta z chwilą:
   - utworzenia konta w Panelu i akceptacji Regulaminu, w zakresie obsługi konta,
   - wybrania Planu i opłacenia pierwszego okresu rozliczeniowego (z Portfela lub kartą), w zakresie świadczenia Usługi.
2. Klient w trakcie rejestracji oświadcza, że dane podane w formularzu są prawdziwe i aktualne. Klient zobowiązany jest do niezwłocznej aktualizacji danych w Panelu w przypadku ich zmiany (zwłaszcza danych do faktur).
3. Konsument oświadcza w trakcie zakupu Usługi, że żąda rozpoczęcia świadczenia Usługi przed upływem 14-dniowego terminu na odstąpienie od umowy. W takim przypadku traci prawo do odstąpienia w zakresie wykorzystanego już okresu Usługi (art. 38 pkt 1 ustawy o prawach konsumenta).

## §5. Konto Klienta

1. Każdy Klient może posiadać tylko jedno konto w Panelu, chyba że Verris wyrazi pisemną zgodę na konto dodatkowe.
2. Klient zobowiązany jest do zachowania w tajemnicy danych logowania i niezwłocznego zgłoszenia Verris każdego podejrzenia ich ujawnienia.
3. Verris zaleca aktywację dwuskładnikowego uwierzytelniania (2FA) w Panelu.
4. Właściciel Konta może udostępniać dostęp **Subkontom** zgodnie z §5a.
5. Verris ma prawo zawiesić konto Klienta w przypadku:
   - podejrzenia naruszenia bezpieczeństwa konta,
   - naruszenia Regulaminu,
   - braku płatności mimo upływu okresu prolongaty,
   - na żądanie organów państwowych zgodnie z prawem.

## §5a Subkonta i uprawnienia (IAM)

1. **Właściciel Konta** (konto główne) może w Panelu zapraszać **Subkonta** i nadawać im uprawnienia z predefiniowanych ról (np. wsparcie, księgowość, DevOps, podgląd) lub zestawów niestandardowych.
2. **Właściciel Konta** ponosi **pełną odpowiedzialność** za działania Subkont w ramach przyznanych uprawnień, w tym za treści, płatności z Portfela (jeśli przyznano uprawnienie billingowe) oraz za naruszenie Regulaminu przez Subkonto.
3. Subkonto **nie może** samodzielnie zapraszać kolejnych Subkont ani zmieniać uprawnień innych Subkont, chyba że Verris wyraźnie udostępni taką funkcję w Panelu.
4. Zaproszenie Subkonta wymaga ważnego adresu e-mail odbiorcy; link aktywacyjny ma ograniczony czas ważności. Właściciel może w każdej chwili **wyłączyć** Subkonto — dostęp wygasa niezwłocznie po wyłączeniu.
5. Verris rejestruje operacje IAM (zaproszenia, akceptacje, zmiany uprawnień, wyłączenia) w **dzienniku audytu** dostępnym dla Właściciela Konta w Panelu.
6. Subkonto korzysta z tych samych dokumentów prawnych co Właściciel; dane Subkonta przetwarzamy zgodnie z **Polityką prywatności**.

## §6. Subskrypcje i okresy rozliczeniowe

1. Subskrypcja jest zawierana na okres miesięczny lub roczny, według wyboru Klienta przy zakupie.
2. Subskrypcja odnawia się automatycznie na kolejny okres tej samej długości, chyba że Klient anuluje odnowienie w Panelu przed datą końca bieżącego okresu.
3. Verris informuje Klienta drogą e-mail o nadchodzącym końcu okresu rozliczeniowego nie później niż:
   - 7 dni przed końcem dla rocznych subskrypcji,
   - 3 dni przed końcem dla miesięcznych subskrypcji.
4. W przypadku niepowodzenia automatycznego odnowienia (brak środków w Portfelu, odrzucenie karty), Verris uruchamia okres prolongaty 7 dni, w trakcie którego Usługa jest aktywna, a Klient otrzymuje powiadomienia. Po upływie prolongaty Usługa zostaje zawieszona, a po kolejnych 14 dniach — usunięta wraz z danymi.
5. Klient może w Panelu, dla aktywnej i opłaconej subskrypcji, samodzielnie zmienić Plan lub okres rozliczeniowy (miesięczny ↔ roczny) na tym samym koncie hostingowym. Różnica w cenie za niewykorzystaną część bieżącego okresu jest rozliczana proporcjonalnie (proration) i:
   - przy płatności z Portfela — pobierana jako dopłata (`CHARGE_PLAN_UPGRADE`) lub uznawana na Portfel (`CREDIT_PLAN_DOWNGRADE`);
   - przy płatności kartą — rozliczana przez Stripe (proration na subskrypcji).
   Zmiana okresu rozliczeniowego uruchamia nowy okres rozliczeniowy od chwili zmiany. Przy zmianie Planu delty autoskalowania są resetowane, a limity ustawiane według nowego Planu bazowego. Downgrade Planu z niższym limitem dysku jest niedostępny, jeżeli faktyczne zużycie dysku (metryki z ostatnich 48 h) przekracza limit docelowego Planu — Klient musi najpierw zwolnić miejsce.
6. Subskrypcje z rozliczeniem ręcznym (`MANUAL`) lub bez powiązania ze Stripe wymagają zmiany Planu przez Zespół Verris (Panel administracyjny / ticket).

## §7. Portfel i Kredyty Verris

1. Portfel pozwala Klientowi zasilić swoje konto środkami z góry, w formie wirtualnej waluty „Kredyty Verris" (`K`). Kurs wymiany jest stały i wynosi **1 PLN = 1 K**.
2. Doładowanie Portfela odbywa się poprzez:
   - płatność **kartą płatniczą, Apple Pay, Google Pay lub BLIK/przelewem online** realizowaną przez **Stripe** (operator płatności) — od 5 K,
   - kod promocyjny od Verris,
   - manualne uznanie przez Zespół Verris (np. rekompensata za awarię).
3. Verris **nie oferuje** na dzień publikacji niniejszego Regulaminu odrębnych bramek płatności poza Stripe i Portfelem (np. PayU jako osobny operator) — ewentualne rozszerzenie zostanie ogłoszone z 30-dniowym wyprzedzeniem.
4. Faktury VAT wystawiane są w **PLN**, niezależnie od formy zapłaty. Verris uznaje doładowanie Portfela za zaliczkę w rozumieniu polskiego prawa podatkowego.
5. Kredyty Verris **nie podlegają wymianie na środki pieniężne** poza wyjątkami wynikającymi z odstąpienia Konsumenta lub rozwiązania Umowy z winy Verris.
6. Kredyty Verris **nie wygasają** w trakcie aktywnego konta. Po usunięciu konta (§5 ust. 5 lub na wniosek Klienta) niewykorzystane Kredyty są zwracane na rachunek bankowy Klienta w terminie 30 dni od potwierdzenia tożsamości, **z wyjątkiem** Kredytów otrzymanych jako bonusy promocyjne (`PROMO_CREDIT` w historii) oraz manualne uznania od Zespołu Verris (`Uznanie od Verris`) — te Kredyty mają charakter rabatu i nie podlegają zwrotowi pieniężnemu.
7. Verris oferuje funkcję auto-doładowania (`Auto-Topup`): gdy saldo Portfela spadnie poniżej ustawionego progu, system automatycznie obciąża zapisaną kartę o ustaloną kwotę. Klient włącza/wyłącza tę funkcję w Panelu w sekcji „Portfel".

## §8. Cennik i opłaty

1. Cennik Planów dostępny jest w Panelu w trakcie zakupu oraz na publicznej stronie oferty Verris po jej opublikowaniu.
2. Verris zastrzega sobie prawo do zmiany Cennika z zachowaniem 30-dniowego okresu wypowiedzenia, doręczanego e-mailem. Zmiany Cennika nie wpływają na bieżące, opłacone okresy rozliczeniowe.
3. Niektóre Usługi (autoskalowanie, dodatkowy transfer, dodatkowy backup) są rozliczane w modelu pay-per-use. Klient ustawia w Panelu miesięczny limit kwoty (`Limit miesięczny (K)`); po przekroczeniu limitu Verris automatycznie wstrzymuje dalsze obciążenia i powiadamia Klienta.

## §9. Reklamacje

1. Klient może złożyć reklamację dotyczącą Usługi w Panelu (sekcja Wsparcie → Nowe zgłoszenie) lub e-mailem na `kontakt@hvln.pl`.
2. Verris rozpatruje reklamację w terminie 14 dni od jej otrzymania. Brak odpowiedzi w tym terminie oznacza uwzględnienie reklamacji.
3. Reklamacja powinna zawierać: dane identyfikujące Klienta, opis problemu, datę i godzinę wystąpienia, ewentualne logi lub zrzuty ekranu, oczekiwane rozwiązanie.

## §10. Prawo odstąpienia (Konsument)

1. Konsument ma prawo odstąpić od Umowy w terminie 14 dni od jej zawarcia bez podania przyczyny.
2. Konsument oświadcza w trakcie zakupu (§4 ust. 3), że żąda rozpoczęcia świadczenia Usługi przed upływem terminu odstąpienia. W takim przypadku Konsument zachowuje prawo odstąpienia, lecz **zobowiązany jest do zapłaty za świadczenia wykonane do chwili odstąpienia** (proporcjonalnie do wykorzystanego okresu).
3. Konsument odstępuje od Umowy poprzez złożenie oświadczenia w Panelu lub e-mailem na `kontakt@hvln.pl`. Wzór formularza odstąpienia zostanie opublikowany razem z finalną wersją Regulaminu.
4. Verris zwraca środki niewykorzystane w ciągu 14 dni od otrzymania oświadczenia, na rachunek z którego dokonano płatności (lub inny wskazany przez Konsumenta).

## §11. Odpowiedzialność i SLA

1. Verris zobowiązuje się do utrzymania dostępności Usługi na poziomie **99,5% w skali miesiąca**, mierzonej zewnętrznym monitoringiem dostępnym publicznie pod adresem `status.verris.pl`.
2. W przypadku spadku dostępności poniżej SLA, Klient ma prawo do rekompensaty w postaci kredytów na Portfel:
   - 99,0%–99,5% — 5% wartości miesięcznej Subskrypcji,
   - 95,0%–99,0% — 25% wartości miesięcznej Subskrypcji,
   - poniżej 95,0% — 50% wartości miesięcznej Subskrypcji,
   - poniżej 90,0% — 100% wartości miesięcznej Subskrypcji.
3. Rekompensata SLA przysługuje na wniosek Klienta złożony w terminie 14 dni od końca miesiąca, którego dotyczy. Verris weryfikuje i przyznaje rekompensatę w ciągu 7 dni, przekazując ją na Portfel jako `PROMO_CREDIT`.
4. Verris **nie odpowiada** za niedostępność Usługi spowodowaną:
   - siłą wyższą (klęski naturalne, akty terroryzmu, decyzje administracyjne),
   - awariami w sieciach operatorów telekomunikacyjnych poza kontrolą Verris,
   - planowanymi pracami konserwacyjnymi zapowiedzianymi co najmniej 48h wcześniej e-mailem,
   - zachowaniem Klienta lub osób trzecich, którym Klient przekazał dostęp,
   - exploitami i lukami w aplikacjach Klienta.
5. Odpowiedzialność Verris wobec Przedsiębiorców (innych niż Przedsiębiorcy na prawach Konsumenta) ogranicza się do wartości opłat wniesionych przez Klienta w 12 miesiącach poprzedzających zdarzenie. Wyłączona jest odpowiedzialność za utracone korzyści, dane i pośrednie szkody.

## §12. Obowiązki Klienta i niedozwolone treści

1. Klient zobowiązuje się do korzystania z Usług zgodnie z prawem polskim, prawem Unii Europejskiej oraz Regulaminem.
2. Klient nie ma prawa wykorzystywać Usług do:
   - rozsyłania spamu i niezamówionej korespondencji handlowej,
   - hostingu treści bezprawnych (pornografia dziecięca, treści nawołujące do nienawiści, terrorystyczne, łamiące prawa autorskie, etc.),
   - skanowania portów, brute-force, ataków DoS / DDoS na inne podmioty,
   - kopania kryptowalut (cryptomining),
   - świadczenia usług VPN, proxy lub TOR exit nodes komercyjnie bez wyraźnej zgody Verris,
   - hostingu otwartych przekaźników DNS / SMTP.
3. Verris zastrzega sobie prawo do natychmiastowego zawieszenia Usługi w przypadku stwierdzenia naruszenia ust. 2, bez prawa do zwrotu opłat za bieżący okres.

## §13. Dane osobowe

1. Verris jest administratorem danych osobowych Klientów w zakresie obsługi konta i świadczenia Usług. Szczegółowe zasady opisuje **Polityka prywatności** (`https://panel.verris.pl/legal/privacy`).
2. W przypadku, gdy Klient przetwarza dane osobowe osób trzecich w ramach świadczonych przez siebie usług hostowanych w Verris (np. dane klientów sklepu internetowego Klienta), Verris jest podmiotem przetwarzającym te dane w rozumieniu art. 28 RODO, a relacja jest regulowana **Umową powierzenia przetwarzania danych** (DPA), dostępną na żądanie Klienta lub automatycznie zawieraną elektronicznie w Panelu (sekcja „Zgodność").

## §14. Postanowienia końcowe

1. Verris zastrzega sobie prawo do zmiany Regulaminu z zachowaniem 30-dniowego okresu wypowiedzenia. Nowa wersja jest publikowana w Panelu z wymaganiem ponownej akceptacji przed kontynuacją korzystania z Usług. Klient ma prawo wypowiedzieć Umowę bez konsekwencji w terminie 30 dni od ogłoszenia zmiany.
2. Spory wynikłe z Umowy będą rozstrzygane przez sąd właściwy dla siedziby Verris, z zastrzeżeniem przepisów chroniących Konsumenta.
3. W sprawach nieuregulowanych Regulaminem zastosowanie mają przepisy prawa polskiego, w szczególności Kodeks cywilny, ustawa o świadczeniu usług drogą elektroniczną oraz ustawa o prawach konsumenta.
4. Konsument ma prawo do skorzystania z platformy ODR (Online Dispute Resolution) Komisji Europejskiej: https://ec.europa.eu/consumers/odr.

---

**Wersja: DRAFT 0.2 (przed lawyer review)**  
**Przygotowanie:** na bazie praktyk polskich operatorów hostingu (regulamin, SLA, portfel, odstąpienie) oraz wymogów ustawy o prawach konsumenta, ustawy o świadczeniu usług drogą elektroniczną, RODO.  
**Data: maj 2026**  
**Lawyer review status: pending — gotowiec do przesłania prawnikowi**
