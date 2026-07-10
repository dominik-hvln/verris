# Regulamin świadczenia usług Verris

**Wersja 1.1.0 · data wejścia w życie do ustalenia (patrz nota niżej)**

> Zmiana wobec 1.0.0: §15 — rekompensata SLA przyznawana automatycznie, bez wniosku (nowe ust. 3–5).
> Data wejścia w życie zależy od stanu bazy Klientów:
> — brak aktywnych Klientów → publikujemy z datą bieżącą, obowiązuje od razu (nie ma kogo zawiadamiać);
> — są aktywni Klienci → tryb §24: zawiadomienie e-mailem, wejście w życie ≥30 dni po nim.
> Zmiana jest na korzyść Klienta (rekompensata z urzędu zamiast na wniosek). Ustaw datę przed publikacją.

---

## Rozdział I — Postanowienia ogólne

## §1. Definicje

1. **Usługodawca / Verris** — HVLN Dominik Kowalski z siedzibą pod adresem Zacisze 2A, 65-775 Zielona Góra, wpisany do Centralnej Ewidencji i Informacji o Działalności Gospodarczej, NIP 9292069367, REGON 521024260; e-mail: `kontakt@verris.pl`, telefon: +48 511 589 465.
2. **Klient** — osoba fizyczna posiadająca pełną zdolność do czynności prawnych, osoba prawna albo jednostka organizacyjna nieposiadająca osobowości prawnej, której ustawa przyznaje zdolność prawną, która zawarła z Verris Umowę.
3. **Konsument** — Klient będący osobą fizyczną, zawierający Umowę w celach niezwiązanych bezpośrednio z jego działalnością gospodarczą lub zawodową.
4. **Przedsiębiorca na prawach Konsumenta** — osoba fizyczna zawierająca Umowę bezpośrednio związaną z jej działalnością gospodarczą, gdy z treści Umowy wynika, że nie ma ona dla niej charakteru zawodowego; do takiej osoby stosuje się przepisy o ochronie konsumenta w zakresie przewidzianym ustawą.
5. **Umowa** — umowa o świadczenie Usług zawierana na odległość między Verris a Klientem, na warunkach określonych Regulaminem, Cennikiem i specyfikacją wybranego Planu.
6. **Usługi** — usługi świadczone drogą elektroniczną przez Verris: Hosting (rozdz. III §10), VPS (§11), Domeny (§12), E-mail marketing (§13) oraz Program resellerski (§14), wraz z prowadzeniem Konta i Panelu.
7. **Panel** — interfejs webowy pod adresem `panel.verris.pl`, służący do zarządzania Usługami, płatnościami i Kontem.
8. **Plan** — pakiet parametrów Usługi (m.in. CPU, RAM, dysk, transfer, liczba stron lub domen) o cenie określonej w Cenniku, w miesięcznym lub rocznym okresie rozliczeniowym.
9. **Subskrypcja** — Umowa o świadczenie Usługi w wybranym Planie i okresie rozliczeniowym, odnawiana zgodnie z §7.
10. **Portfel** — saldo środków przedpłaconych Klienta wyrażone w Kredytach Verris (`K`); kurs stały: 1 PLN = 1 K.
11. **Kredyty Verris** — bony jednego przeznaczenia w rozumieniu art. 2 pkt 43 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług, uprawniające wyłącznie do zapłaty za Usługi Verris opodatkowane w Polsce.
12. **Cennik** — aktualne ceny Planów i usług dodatkowych, dostępne w Panelu podczas zakupu oraz na stronie oferty Verris; ceny podawane są w PLN i zawierają VAT (ceny brutto), a dla Klientów niebędących Konsumentami dodatkowo prezentowane są ceny netto.
13. **Subkonto** — konto użytkownika zaproszonego przez Klienta w ramach modułu IAM (§6).
14. **DirectAdmin** — panel zarządzania serwerem hostingowym udostępniany w ramach Hostingu.
15. **SLA** — gwarantowany poziom dostępności Usług wraz z zasadami rekompensat (rozdz. IV).
16. **RODO** — rozporządzenie Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r.
17. **DSA** — rozporządzenie Parlamentu Europejskiego i Rady (UE) 2022/2065 z dnia 19 października 2022 r. w sprawie jednolitego rynku usług cyfrowych (akt o usługach cyfrowych).

## §2. Zakres regulaminu i kontakt

1. Regulamin określa rodzaje i warunki świadczenia Usług drogą elektroniczną w rozumieniu art. 8 ustawy z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną, warunki zawierania i rozwiązywania Umów oraz tryb postępowania reklamacyjnego.
2. Integralną częścią stosunku umownego są: Polityka prywatności (`https://panel.verris.pl/legal/privacy`), Polityka cookies (`https://panel.verris.pl/legal/cookies`) oraz — w zakresie, w jakim Klient powierza Verris dane osobowe — Umowa powierzenia przetwarzania danych (`https://panel.verris.pl/legal/dpa`).
3. Kontakt z Verris: e-mail `kontakt@verris.pl`, telefon +48 511 589 465 (dni robocze), formularz zgłoszeń w Panelu (Wsparcie → Nowe zgłoszenie), korespondencyjnie: HVLN Dominik Kowalski, Zacisze 2A, 65-775 Zielona Góra. Punkt kontaktowy do zgłaszania nielegalnych treści (DSA): `abuse@verris.pl` (§17). Kontakt w sprawach ochrony danych: `rodo@verris.pl`.
4. Językiem Umowy i komunikacji jest język polski. Walutą rozliczeń jest złoty polski (PLN).
5. Verris świadczy Usługi na infrastrukturze zlokalizowanej na terenie Europejskiego Obszaru Gospodarczego.

## §3. Wymagania techniczne

Korzystanie z Panelu wymaga: dostępu do internetu, aktualnej wersji przeglądarki Chrome, Firefox, Safari lub Edge (wersja bieżąca lub dwie wcześniejsze), włączonej obsługi JavaScript i plików cookies niezbędnych (zgodnie z Polityką cookies) oraz aktywnego konta e-mail. Korzystanie z niektórych Usług (VPS, dostęp SSH/FTPS) może wymagać dodatkowego oprogramowania klienckiego po stronie Klienta.

## §4. Zawarcie umowy

1. Umowa zostaje zawarta na odległość, drogą elektroniczną:
   1) w zakresie prowadzenia Konta — z chwilą rejestracji w Panelu i akceptacji Regulaminu;
   2) w zakresie danej Usługi — z chwilą wybrania Planu i opłacenia pierwszego okresu rozliczeniowego (z Portfela lub przez operatora płatności) albo aktywacji okresu próbnego (§7 ust. 8).
2. Niezwłocznie po zawarciu Umowy Verris przekazuje Klientowi na trwałym nośniku (e-mail) potwierdzenie jej zawarcia, obejmujące treść Regulaminu w wersji obowiązującej w dniu zakupu, specyfikację zakupionej Usługi oraz — wobec Konsumentów — informacje wymagane ustawą o prawach konsumenta wraz z pouczeniem o odstąpieniu.
3. Klient oświadcza, że dane podane przy rejestracji i w ustawieniach rozliczeń są prawdziwe i kompletne, oraz zobowiązuje się do ich niezwłocznej aktualizacji w Panelu (w szczególności danych do faktur).
4. Konsument oraz Przedsiębiorca na prawach Konsumenta, który chce korzystać z Usługi od razu, składa przy zakupie wyraźne oświadczenie zawierające żądanie rozpoczęcia świadczenia Usługi przed upływem terminu odstąpienia od Umowy oraz potwierdzenie przyjęcia do wiadomości skutków opisanych w §21.
5. Zawarcie Umowy w zakresie rejestracji Domeny wymaga dodatkowo odrębnego oświadczenia, o którym mowa w §12 ust. 8.

## §5. Konto Klienta

1. Klient może posiadać jedno Konto, chyba że Verris wyrazi zgodę na konto dodatkowe (np. rozdzielenie działalności).
2. Klient zobowiązany jest chronić dane logowania i niezwłocznie zgłosić Verris podejrzenie ich ujawnienia. Verris zaleca włączenie uwierzytelniania dwuskładnikowego (2FA) lub kluczy passkey; dla kont z dostępem do funkcji administracyjnych Verris może wymagać 2FA.
3. Verris może zawiesić dostęp do Konta lub poszczególnych funkcji w przypadku: uzasadnionego podejrzenia przejęcia Konta, naruszenia Regulaminu (w trybie §17), zaległości płatniczych po upływie okresu prolongaty (§7) albo gdy obowiązek taki wynika z przepisów prawa lub decyzji uprawnionego organu. O zawieszeniu i jego przyczynie Verris informuje Klienta zgodnie z §17 ust. 6.
4. Klient może w każdej chwili zażądać usunięcia Konta (Panel → Prywatność i RODO). Usunięcie Konta nie zwalnia z obowiązku zapłaty za Usługi wykonane do dnia rozwiązania Umowy. Zasady usuwania danych opisuje Polityka prywatności.

## §6. Subkonta i uprawnienia (IAM)

1. Klient (właściciel Konta) może zapraszać Subkonta i nadawać im uprawnienia z ról predefiniowanych lub niestandardowych zestawów uprawnień.
2. Klient ponosi odpowiedzialność za działania Subkont w granicach nadanych im uprawnień jak za działania własne, w tym za dyspozycje płatnicze z Portfela, jeżeli nadał Subkontu uprawnienia billingowe.
3. Subkonto nie może samodzielnie zapraszać kolejnych Subkont ani zmieniać uprawnień innych Subkont, chyba że funkcja taka zostanie wyraźnie udostępniona w Panelu.
4. Zaproszenie wymaga ważnego adresu e-mail; link aktywacyjny ma ograniczoną ważność. Klient może w każdej chwili wyłączyć Subkonto ze skutkiem natychmiastowym.
5. Operacje IAM (zaproszenia, zmiany uprawnień, wyłączenia) są rejestrowane w dzienniku audytu dostępnym dla Klienta w Panelu.
6. Dane osobowe użytkowników Subkont Verris przetwarza zgodnie z Polityką prywatności.

---

## Rozdział II — Płatności i rozliczenia

## §7. Subskrypcje, odnowienia i okres próbny

1. Subskrypcja jest zawierana na okres miesięczny albo roczny, według wyboru Klienta.
2. Subskrypcja odnawia się automatycznie na kolejny okres tej samej długości i w aktualnej cenie z Cennika obowiązującej w dniu odnowienia, chyba że Klient wyłączy odnawianie w Panelu przed końcem bieżącego okresu. O zbliżającym się odnowieniu Verris przypomina e-mailem: co najmniej 7 dni wcześniej przy okresie rocznym i 3 dni przy miesięcznym, wskazując cenę odnowienia i sposób rezygnacji.
3. Jeżeli automatyczne odnowienie nie powiedzie się (brak środków w Portfelu, odrzucona płatność), Verris uruchamia 7-dniowy okres prolongaty, w którym Usługa pozostaje aktywna, a Klient otrzymuje powiadomienia. Po bezskutecznym upływie prolongaty Usługa zostaje zawieszona; jeżeli w ciągu kolejnych 14 dni zaległość nie zostanie uregulowana, Umowa w zakresie tej Usługi wygasa, a dane Usługi są usuwane zgodnie z §10 ust. 8 (Hosting) albo §11 ust. 7 (VPS). Terminy usuwania danych po wygaśnięciu wskazane w rozdziale III mają pierwszeństwo.
4. Klient może w Panelu zmienić Plan lub okres rozliczeniowy aktywnej, opłaconej Subskrypcji. Różnica ceny za niewykorzystaną część okresu jest rozliczana proporcjonalnie: przy płatności z Portfela — jako dopłata albo uznanie Portfela; przy płatności kartą — w rozliczeniu operatora płatności. Zmiana okresu rozliczeniowego rozpoczyna nowy okres z chwilą zmiany.
5. Obniżenie Planu (downgrade) z niższym limitem dysku jest niedostępne, dopóki faktyczne zużycie dysku przekracza limit docelowego Planu; Klient musi najpierw zwolnić miejsce.
6. Przy zmianie Planu limity zasobów ustawiane są według nowego Planu bazowego, a dotychczasowe modyfikacje autoskalowania są resetowane.
7. Subskrypcje rozliczane ręcznie (np. oferta indywidualna) zmieniane są przez zespół Verris na wniosek Klienta.
8. Verris może oferować bezpłatny okres próbny wybranych Planów. Okres próbny nie wymaga podania danych płatniczych i nie przekształca się automatycznie w odpłatną Subskrypcję: po jego upływie Usługa zostaje zawieszona, a jeżeli Klient nie opłaci Planu w ciągu 14 dni — dane Usługi są usuwane. O zbliżającym się końcu okresu próbnego Verris informuje e-mailem.

## §8. Portfel i Kredyty Verris

1. Portfel umożliwia opłacanie Usług ze środków przedpłaconych. Doładowanie następuje: płatnością kartą, Apple Pay, Google Pay, BLIK lub przelewem online za pośrednictwem operatora płatności Stripe (minimalna kwota doładowania: 5 K), kodem promocyjnym Verris albo uznaniem dokonanym przez zespół Verris (np. rekompensata SLA).
2. Doładowanie Portfela środkami pieniężnymi stanowi nabycie bonu jednego przeznaczenia (Kredytów Verris) w rozumieniu przepisów o VAT — obowiązek podatkowy powstaje z chwilą doładowania i na doładowanie wystawiana jest faktura. Zapłata Kredytami za Usługę nie podlega odrębnemu opodatkowaniu.
3. Kredyty Verris służą wyłącznie do zapłaty za Usługi Verris i nie podlegają wymianie na środki pieniężne, z zastrzeżeniem ust. 4.
4. Kredyty nabyte odpłatnie nie wygasają w czasie aktywności Konta i podlegają zwrotowi w wartości nominalnej (1 K = 1 PLN) w przypadku: odstąpienia od Umowy przez Konsumenta lub Przedsiębiorcę na prawach Konsumenta, rozwiązania Umowy z przyczyn leżących po stronie Verris albo zamknięcia Konta przez Klienta. Zwrot następuje w terminie 14 dni na rachunek, z którego dokonano płatności, lub inny wskazany przez Klienta. Zwrotowi nie podlegają kredyty przyznane nieodpłatnie (kody promocyjne, bonusy, rekompensaty SLA, uznania od Verris) — mają one charakter rabatu.
5. Klient może włączyć w Panelu automatyczne doładowanie (auto-topup): gdy saldo spadnie poniżej ustawionego progu, zapisana karta jest obciążana zdefiniowaną przez Klienta kwotą. Funkcję można w każdej chwili wyłączyć w Panelu; o każdym automatycznym doładowaniu Klient jest informowany e-mailem.
6. Historia operacji na Portfelu jest dostępna w Panelu.

## §9. Ceny, faktury i usługi rozliczane zużyciem

1. Ceny Usług określa Cennik prezentowany przed zakupem. Cena potwierdzona przy zakupie nie ulega zmianie w trakcie opłaconego okresu rozliczeniowego.
2. Zmiana Cennika następuje z przyczyn i w trybie opisanym w §24 (odpowiednio); nowa cena wiąże Klienta od pierwszego odnowienia następującego co najmniej 30 dni po zawiadomieniu e-mailem. Klient, który nie akceptuje nowej ceny, może wyłączyć odnowienie lub wypowiedzieć Umowę bez dodatkowych kosztów.
3. W przypadku ogłaszania promocji obejmujących obniżkę ceny Verris uwidacznia obok ceny promocyjnej najniższą cenę danej Usługi obowiązującą w okresie 30 dni przed obniżką.
4. Faktury wystawiane są w PLN. Faktury dla podmiotów prowadzących działalność gospodarczą wystawiane są jako faktury ustrukturyzowane w Krajowym Systemie e-Faktur (KSeF), zgodnie z obowiązującymi przepisami; Klient otrzymuje również wizualizację faktury w Panelu i e-mailem. Faktury dla Konsumentów udostępniane są w Panelu i e-mailem.
5. Usługi dodatkowe rozliczane zużyciem (autoskalowanie zasobów, dodatkowy transfer, dodatkowa przestrzeń kopii zapasowych) są naliczane wyłącznie po ich włączeniu przez Klienta. Klient ustawia w Panelu miesięczny limit kwotowy takich obciążeń; po osiągnięciu limitu Verris wstrzymuje dalsze naliczanie i powiadamia Klienta. Stawki określa Cennik.

---

## Rozdział III — Warunki świadczenia poszczególnych Usług

## §10. Hosting współdzielony

1. Hosting polega na udostępnieniu zasobów serwera współdzielonego do utrzymywania stron internetowych, aplikacji, baz danych i skrzynek e-mail Klienta, z zarządzaniem przez Panel oraz DirectAdmin.
2. Parametry Planu (procesor, pamięć, dysk, transfer, liczba stron, kont e-mail i baz danych) określa specyfikacja Planu prezentowana przed zakupem. Zasoby są limitowane technologią izolacji (CloudLinux LVE); po osiągnięciu limitów działanie serwisów Klienta może ulec spowolnieniu — nie stanowi to niedostępności Usługi w rozumieniu SLA.
3. W ramach Hostingu Klient otrzymuje: konto DirectAdmin, obsługę DNS dla podłączonych domen, konta e-mail w ramach limitów Planu, certyfikaty TLS (Let's Encrypt), dostęp FTPS i menedżer plików, zadania cron oraz narzędzie kopii zapasowych konta w DirectAdmin.
4. Klient może podłączyć własną domenę zarejestrowaną u dowolnego rejestratora albo zarejestrować domenę w Verris (§12).
5. Verris wykonuje kopie zapasowe własnej infrastruktury służące przywracaniu ciągłości działania platformy. Narzędzia DirectAdmin umożliwiają Klientowi samodzielne tworzenie i pobieranie kopii konta. Kopie wykonywane przez Verris mają charakter pomocniczy i nie zwalniają Klienta z obowiązku utrzymywania własnych kopii danych o krytycznym znaczeniu.
6. Funkcja autoskalowania (jeżeli włączona przez Klienta) automatycznie zwiększa wybrane zasoby ponad limity Planu w granicach limitu kwotowego z §9 ust. 5.
7. Wysyłka poczty z kont hostingowych podlega limitom antyspamowym określonym w specyfikacji Planu; §13 ust. 4–6 stosuje się odpowiednio.
8. Po wygaśnięciu Umowy w zakresie Hostingu (§7 ust. 3) dane konta hostingowego (pliki, bazy, poczta) są trwale usuwane. Przez 30 dni od wygaśnięcia Klient może zwrócić się o odzyskanie danych z ostatniej dostępnej kopii; po tym terminie dane są nieodwracalnie usuwane, a kopie zapasowe nadpisywane w cyklu rotacji nie dłuższym niż 90 dni.

## §11. Serwery VPS

1. Usługa VPS polega na udostępnieniu wirtualnego serwera prywatnego o parametrach określonych w Planie, uruchamianego na infrastrukturze chmurowej zlokalizowanej w EOG, z pełnym dostępem administracyjnym (root) dla Klienta.
2. VPS jest usługą niezarządzaną: Klient samodzielnie administruje systemem operacyjnym, oprogramowaniem i ich bezpieczeństwem, w tym aktualizacjami. Verris odpowiada za dostępność warstwy infrastruktury (wirtualizacja, sieć, zasilanie) zgodnie z SLA.
3. Verris nie wykonuje kopii zapasowych zawartości VPS, chyba że specyfikacja Planu wyraźnie obejmuje snapshoty lub backup — wówczas ich zakres i częstotliwość określa specyfikacja.
4. Klient zobowiązany jest do korzystania z VPS zgodnie z §16; ze względu na pełną kontrolę Klienta nad serwerem, Klient ponosi odpowiedzialność za ruch generowany z przydzielonych adresów IP.
5. W przypadku gdy VPS uczestniczy w atakach, masowej wysyłce spamu lub innym naruszeniu §16, Verris może niezwłocznie odizolować serwer od sieci (tryb §17).
6. Odnowienie VPS następuje z Portfela lub zapisaną metodą płatności zgodnie z §7.
7. Jeżeli odnowienie nie powiedzie się, serwer zostaje wyłączony i zawieszony; po upływie 7 dni od zawieszenia serwer wraz z danymi jest trwale usuwany, o czym Klient jest uprzedzany w powiadomieniach. Usunięcie serwera VPS jest nieodwracalne.

## §12. Rejestracja i utrzymanie domen

1. Verris pośredniczy w rejestracji, odnawianiu i transferze domen internetowych, działając we współpracy z akredytowanym rejestratorem (Hosting Concepts B.V. działający jako Openprovider) oraz właściwymi rejestrami domen (m.in. NASK dla `.pl`, EURid dla `.eu`).
2. Rejestracja domeny podlega — obok Regulaminu — warunkom rejestratora i regulaminowi właściwego rejestru (np. „Regulaminowi nazw domeny .pl" NASK). Verris udostępnia odesłania do tych dokumentów przed zakupem.
3. Cena rejestracji, odnowienia i transferu poszczególnych rozszerzeń wynika z Cennika. Ceny odnowień mogą różnić się od cen pierwszej rejestracji, co Cennik wyraźnie wskazuje.
4. Domena jest rejestrowana na dane Klienta (abonenta) podane w Panelu. Klient zobowiązany jest do podania prawdziwych danych; ich nieprawdziwość może skutkować odmową rejestracji albo usunięciem domeny przez rejestr.
5. Domena nie odnawia się automatycznie, jeżeli w dniu odnowienia brak jest środków w Portfelu lub skutecznej płatności. O zbliżającym się terminie wygaśnięcia Verris przypomina e-mailem z wyprzedzeniem co najmniej 30, 14 i 7 dni. Po wygaśnięciu domeny jej przywrócenie może być możliwe wyłącznie w okresie i na warunkach (w tym za opłatą redemption) określonych przez rejestr — Verris nie gwarantuje możliwości przywrócenia.
6. Transfer domeny do innego rejestratora oraz zmiana delegacji DNS są dostępne bezpłatnie, z zastrzeżeniem blokad wynikających z regulaminu rejestru (np. ochrona po rejestracji lub zmianie abonenta).
7. Usługa rejestracji domeny jest w pełni wykonana z chwilą zarejestrowania domeny w rejestrze. Rejestracja następuje niezwłocznie po opłaceniu zamówienia.
8. Konsument oraz Przedsiębiorca na prawach Konsumenta przed zakupem domeny składa wyraźne oświadczenie, że żąda natychmiastowego wykonania usługi rejestracji i przyjmuje do wiadomości, iż z chwilą zarejestrowania domeny (pełnego wykonania usługi) traci prawo odstąpienia od Umowy w tym zakresie (art. 38 ust. 1 pkt 1 ustawy o prawach konsumenta). Oświadczenie złożone przy pierwszym zakupie Domeny zachowuje skuteczność również dla kolejnych rejestracji Domen zamawianych na tym samym Koncie — przy kolejnych zamówieniach Panel przypomina o obowiązującym oświadczeniu zamiast ponownie go odbierać. Klient może w każdej chwili odwołać oświadczenie na przyszłość (e-mailem na `kontakt@verris.pl` lub w Panelu); odwołanie nie wpływa na zamówienia złożone przed odwołaniem.

## §13. E-mail marketing

1. Usługa e-mail marketingu umożliwia Klientowi tworzenie i wysyłanie kampanii e-mail (np. newsletterów) do własnych list odbiorców, w granicach limitów wysyłkowych określonych w specyfikacji Planu.
2. Klient jest administratorem danych osobowych swoich odbiorców; Verris przetwarza te dane wyłącznie jako podmiot przetwarzający, na zasadach Umowy powierzenia (DPA).
3. Klient oświadcza i gwarantuje, że dysponuje ważnymi podstawami prawnymi wysyłki do każdego odbiorcy, w szczególności zgodami wymaganymi przez art. 398 ustawy — Prawo komunikacji elektronicznej oraz RODO, i że jest w stanie wykazać ich posiadanie. Zakazane jest wykorzystywanie list zakupionych, wynajmowanych lub pozyskanych bez zgody odbiorców.
4. Każda wiadomość wysyłana w ramach usługi musi zawierać: oznaczenie Klienta jako nadawcy, działający mechanizm rezygnacji z subskrypcji (w tym nagłówek List-Unsubscribe) oraz adres, pod którym odbiorca może zgłosić sprzeciw. Rezygnacje są realizowane automatycznie i niezwłocznie.
5. Verris stosuje automatyczne mechanizmy ochrony reputacji wysyłkowej (limity, monitoring odrzuceń i skarg, wstrzymanie kampanii przy anomaliach). Przekroczenie progów skarg lub odrzuceń może skutkować automatycznym wstrzymaniem wysyłki do czasu wyjaśnienia — Klient jest o tym niezwłocznie informowany wraz z uzasadnieniem (§17 ust. 6 stosuje się odpowiednio).
6. Naruszenie ust. 3–4 stanowi rażące naruszenie Regulaminu w rozumieniu §17.

## §14. Program resellerski

1. Program resellerski umożliwia Klientowi (Resellerowi) odsprzedaż Usług Verris własnym klientom końcowym, we własnym imieniu i na własny rachunek.
2. Reseller zawiera z Verris Umowy na zasadach Regulaminu; klienci końcowi Resellera nie wchodzą w stosunek umowny z Verris. Rozliczenia następują wyłącznie między Verris a Resellerem, według cennika resellerskiego dostępnego w Panelu.
3. Reseller zobowiązany jest we własnym zakresie: zapewnić swoim klientom zgodne z prawem warunki umowne (w tym wykonać obowiązki wobec konsumentów), realizować ich prawa z RODO w zakresie, w jakim jest administratorem ich danych, oraz przyjmować i obsługiwać ich reklamacje. Verris zapewnia Resellerowi wsparcie techniczne drugiej linii.
4. W zakresie danych osobowych klientów końcowych Resellera przetwarzanych na infrastrukturze Verris, Verris działa jako podmiot przetwarzający Resellera (lub dalszy podmiot przetwarzający) na zasadach DPA.
5. Reseller odpowiada za działania swoich klientów końcowych w ramach odsprzedanych Usług jak za działania własne, w szczególności za naruszenia §16.
6. Verris może wypowiedzieć uczestnictwo w programie resellerskim z zachowaniem 30-dniowego okresu wypowiedzenia; usługi już opłacone są świadczone do końca opłaconych okresów.

---

## Rozdział IV — Poziom usług (SLA)

## §15. Dostępność i rekompensaty

1. Verris zapewnia dostępność Usług (Hosting, VPS, infrastruktura poczty i DNS) na poziomie **99,5% w skali miesiąca kalendarzowego**, mierzoną niezależnym monitoringiem, którego wyniki są publikowane pod adresem `status.verris.pl`.
2. W przypadku niedotrzymania SLA w danym miesiącu Klientowi przysługuje rekompensata w Kredytach Verris, liczona od miesięcznej opłaty za dotkniętą Usługę (przy okresie rocznym — 1/12 opłaty rocznej):

| Dostępność w miesiącu | Rekompensata |
| --- | --- |
| od 99,0% do poniżej 99,5% | 5% |
| od 95,0% do poniżej 99,0% | 25% |
| od 90,0% do poniżej 95,0% | 50% |
| poniżej 90,0% | 100% |

3. Rekompensata jest przyznawana **automatycznie, bez wniosku Klienta**, w terminie 7 dni od zakończenia miesiąca kalendarzowego, którego dotyczy. Verris ustala dostępność Usługi na podstawie niezależnego monitoringu, o którym mowa w ust. 1, uznaje Portfel Klienta kwotą rekompensaty i informuje o tym Klienta e-mailem oraz powiadomieniem w Panelu. Rekompensata SLA ma charakter rabatu (kredyt nieodpłatny — §8 ust. 4).
4. Jeżeli Klient nie zgadza się z ustaloną przez Verris dostępnością Usługi albo nie otrzymał rekompensaty, może w terminie 30 dni od zakończenia danego miesiąca złożyć wniosek w Panelu lub e-mailem; Verris rozpatruje wniosek w ciągu 7 dni. Za ten sam miesiąc i tę samą Usługę rekompensata przysługuje jednokrotnie.
5. Dostępność ustala się odrębnie dla każdej Usługi, sumując czas jej niedostępności w danym miesiącu kalendarzowym. Dla Usługi aktywowanej w trakcie miesiąca dostępność liczy się od dnia jej aktywacji.
6. Rekompensata SLA nie wyłącza dalej idących roszczeń Konsumenta ani Przedsiębiorcy na prawach Konsumenta na zasadach ogólnych. Wobec pozostałych Klientów rekompensata SLA wyczerpuje roszczenia z tytułu niedostępności objętej danym miesiącem, w granicach §18 ust. 3.
7. Do czasu niedostępności nie wlicza się: prac konserwacyjnych zapowiedzianych co najmniej 48 godzin wcześniej e-mailem lub na `status.verris.pl` (łącznie nie więcej niż 8 godzin miesięcznie, planowanych w godzinach nocnych), niedostępności wywołanej siłą wyższą, awarii sieci operatorów trzecich poza kontrolą Verris, działań lub zaniechań Klienta (w tym błędów aplikacji Klienta, wyczerpania limitów zasobów Planu), ataków na serwisy Klienta oraz zawieszenia Usługi w trybie §7 lub §17.

---

## Rozdział V — Zasady korzystania i moderacja treści

## §16. Niedozwolone treści i działania (AUP)

1. Klient zobowiązuje się korzystać z Usług zgodnie z prawem polskim i Unii Europejskiej, dobrymi obyczajami oraz Regulaminem.
2. Zakazane jest wykorzystywanie Usług do:
   1) przechowywania lub rozpowszechniania treści nielegalnych, w szczególności: treści przedstawiających seksualne wykorzystywanie małoletnich, treści o charakterze terrorystycznym, treści nawołujących do nienawiści lub przemocy, treści naruszających prawa własności intelektualnej osób trzecich;
   2) wysyłania spamu i niezamówionej informacji handlowej, phishingu oraz podszywania się pod inne podmioty;
   3) dystrybucji złośliwego oprogramowania, prowadzenia ataków (DoS/DDoS, brute-force, skanowanie portów bez zgody), utrzymywania infrastruktury command-and-control;
   4) kopania kryptowalut;
   5) świadczenia publicznych usług VPN, proxy lub węzłów wyjściowych TOR bez uprzedniej pisemnej zgody Verris;
   6) utrzymywania otwartych przekaźników SMTP lub otwartych resolverów DNS;
   7) działań zakłócających pracę infrastruktury Verris lub usług innych klientów, w tym obchodzenia limitów zasobów.
3. Klient odpowiada za treści przechowywane i rozpowszechniane w ramach jego Usług oraz za działania osób, którym udostępnił dostęp. Verris nie prowadzi uprzedniej ani stałej weryfikacji treści klientów i — jako dostawca hostingu — nie odpowiada za przechowywane treści na zasadach określonych w art. 6 DSA.

## §17. Zgłaszanie nielegalnych treści i tryb działań (DSA)

1. Każda osoba lub podmiot może zgłosić Verris obecność treści, które uważa za nielegalne, na adres `abuse@verris.pl` albo przez formularz w stopce serwisu. Punktem kontaktowym dla organów państw członkowskich, Komisji Europejskiej i Rady Usług Cyfrowych jest również `abuse@verris.pl`; komunikacja możliwa jest w języku polskim i angielskim.
2. Zgłoszenie powinno zawierać: wystarczające uzasadnienie, dlaczego treść jest nielegalna, dokładny adres URL (lub inne dane umożliwiające zlokalizowanie treści), imię i nazwisko lub nazwę oraz adres e-mail zgłaszającego (poza zgłoszeniami dotyczącymi przestępstw przeciwko małoletnim, które mogą być anonimowe) oraz oświadczenie o dobrej wierze zgłaszającego.
3. Verris potwierdza otrzymanie zgłoszenia bez zbędnej zwłoki oraz rozpatruje je w sposób terminowy, niearbitralny, obiektywny i z zachowaniem należytej staranności, informując zgłaszającego o podjętej decyzji.
4. W przypadku uzyskania wiarygodnej wiadomości o nielegalnym charakterze treści Verris niezwłocznie uniemożliwia dostęp do tych treści lub je usuwa, w zakresie proporcjonalnym do naruszenia (w pierwszej kolejności blokada pojedynczych zasobów, nie całej Usługi, jeżeli to technicznie zasadne).
5. W przypadku innych naruszeń §16 Verris — stosownie do wagi naruszenia — wzywa Klienta do zaniechania naruszenia w wyznaczonym terminie, zawiesza dotknięty zasób lub Usługę, a przy rażących naruszeniach (w szczególności ust. 2 pkt 1–3 §16) zawiesza Usługę niezwłocznie i może wypowiedzieć Umowę ze skutkiem natychmiastowym.
6. O każdej decyzji o usunięciu treści, zablokowaniu dostępu, zawieszeniu lub zakończeniu świadczenia Usługi Verris przekazuje Klientowi jasne i konkretne uzasadnienie obejmujące: wskazanie treści lub działania, podstawę umowną lub prawną decyzji, okoliczności faktyczne, informację o możliwości odwołania (reklamacja — §20) oraz o użyciu zautomatyzowanych środków przy wykrywaniu, chyba że zakazuje tego przepis prawa lub polecenie organu.
7. Jeżeli Verris poweźmie podejrzenie popełnienia przestępstwa zagrażającego życiu lub bezpieczeństwu osób, informuje właściwe organy ścigania, przekazując dostępne informacje.
8. W przypadku rozwiązania Umowy w trybie ust. 5 wobec Konsumenta lub Przedsiębiorcy na prawach Konsumenta, Verris zwraca proporcjonalną część opłat za niewykorzystany okres; zwrot nie ogranicza roszczeń odszkodowawczych Verris związanych z naruszeniem. Wobec pozostałych Klientów opłata za rozpoczęty okres rozliczeniowy nie podlega zwrotowi w zakresie, w jakim pokrywa koszty i szkody Verris wynikłe z naruszenia.

---

## Rozdział VI — Odpowiedzialność

## §18. Odpowiedzialność Verris

1. Verris odpowiada za niewykonanie lub nienależyte wykonanie Umowy na zasadach ogólnych Kodeksu cywilnego, z zastrzeżeniem postanowień niniejszego paragrafu.
2. Verris nie odpowiada za: skutki działania siły wyższej; awarie sieci i systemów podmiotów trzecich pozostających poza kontrolą Verris; skutki działań lub zaniechań Klienta, Subkont i osób, którym Klient udostępnił Usługi; skutki podatności i błędów w oprogramowaniu instalowanym przez Klienta; utratę danych, których kopii Klient nie utrzymywał mimo obowiązku z §10 ust. 5 lub §11 ust. 3 — w zakresie, w jakim szkoda wynikła z tych okoliczności.
3. Wobec Klientów niebędących Konsumentami ani Przedsiębiorcami na prawach Konsumenta łączna odpowiedzialność Verris ze wszystkich tytułów ogranicza się do kwoty opłat wniesionych przez Klienta w okresie 12 miesięcy poprzedzających zdarzenie szkodowe, z wyłączeniem utraconych korzyści i szkód pośrednich. Ograniczenie nie dotyczy szkód wyrządzonych umyślnie.
4. Ograniczenia z ust. 2–3 nie mają zastosowania wobec Konsumentów i Przedsiębiorców na prawach Konsumenta w zakresie, w jakim naruszałyby bezwzględnie obowiązujące przepisy o ochronie konsumenta.

---

## Rozdział VII — Dane osobowe

## §19. Ochrona danych

1. Verris jest administratorem danych osobowych Klientów, użytkowników Subkont i osób kontaktowych w zakresie prowadzenia Konta, rozliczeń, wsparcia i bezpieczeństwa — zasady określa Polityka prywatności.
2. W zakresie danych osobowych, które Klient przechowuje lub przetwarza w ramach swoich Usług (np. dane użytkowników serwisów Klienta, odbiorcy kampanii e-mail), administratorem jest Klient, a Verris działa jako podmiot przetwarzający na podstawie Umowy powierzenia (DPA) zawieranej elektronicznie w Panelu (sekcja Zgodność) i stanowiącej integralną część stosunku umownego.
3. Aktualna lista podwykonawców przetwarzania (subprocesorów) stanowi załącznik do DPA i jest dostępna w Panelu; o zmianach Verris uprzedza zgodnie z DPA.

---

## Rozdział VIII — Reklamacje, odstąpienie, spory

## §20. Reklamacje

1. Reklamacje dotyczące Usług można składać: w Panelu (Wsparcie → Nowe zgłoszenie), e-mailem na `kontakt@verris.pl` albo pisemnie na adres siedziby Verris. Reklamacja stanowi również środek odwoławczy od decyzji, o których mowa w §17.
2. Reklamacja powinna wskazywać: dane identyfikujące Klienta, opis problemu wraz z datą wystąpienia oraz oczekiwany sposób załatwienia. Braki nie powodują pozostawienia reklamacji bez rozpoznania — Verris w razie potrzeby wezwie do uzupełnienia.
3. Verris udziela odpowiedzi na trwałym nośniku w terminie 14 dni od otrzymania reklamacji. Brak odpowiedzi w tym terminie oznacza uznanie reklamacji.

## §21. Prawo odstąpienia od umowy (Konsument i Przedsiębiorca na prawach Konsumenta)

1. Konsument oraz Przedsiębiorca na prawach Konsumenta może odstąpić od Umowy zawartej na odległość w terminie 14 dni od jej zawarcia, bez podawania przyczyny i bez ponoszenia kosztów, z zastrzeżeniem ust. 3–4. Do zachowania terminu wystarczy wysłanie oświadczenia przed jego upływem.
2. Oświadczenie o odstąpieniu można złożyć w Panelu, e-mailem na `kontakt@verris.pl` albo pisemnie; można skorzystać ze wzoru stanowiącego Załącznik 1, co nie jest obowiązkowe. Verris niezwłocznie potwierdza otrzymanie oświadczenia na trwałym nośniku.
3. Jeżeli na wyraźne żądanie odstępującego wykonywanie Usługi rozpoczęło się przed upływem terminu odstąpienia (§4 ust. 4), odstępujący ma obowiązek zapłaty za świadczenia spełnione do chwili odstąpienia, proporcjonalnie do zakresu spełnionego świadczenia i uzgodnionej ceny. Prawo odstąpienia nie przysługuje po pełnym wykonaniu Usługi wykonanej w całości za wyraźną zgodą odstępującego, poinformowanego przed rozpoczęciem świadczenia o utracie prawa odstąpienia.
4. Prawo odstąpienia od Umowy w zakresie rejestracji Domeny wygasa z chwilą zarejestrowania domeny (§12 ust. 7–8).
5. Zwrot płatności następuje niezwłocznie, nie później niż w terminie 14 dni od otrzymania oświadczenia, przy użyciu takiego samego sposobu zapłaty, jakiego użył odstępujący, chyba że wyraźnie zgodził się on na inny sposób zwrotu niewiążący się z kosztami.

## §22. Pozasądowe rozwiązywanie sporów

1. Konsument może skorzystać z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia roszczeń, w szczególności: z mediacji prowadzonej przez właściwy terenowo Wojewódzki Inspektorat Inspekcji Handlowej, z pomocy stałego polubownego sądu konsumenckiego działającego przy WIIH, a także z bezpłatnej pomocy powiatowego (miejskiego) rzecznika konsumentów lub organizacji społecznych, do których zadań statutowych należy ochrona konsumentów. Szczegółowe informacje dostępne są na stronie UOKiK: `https://uokik.gov.pl/pozasadowe-rozwiazywanie-sporow-konsumenckich`.
2. Skorzystanie z pozasądowych sposobów rozwiązywania sporów jest dobrowolne dla obu stron.

---

## Rozdział IX — Zmiany i postanowienia końcowe

## §23. Czas trwania i wypowiedzenie Umowy

1. Umowa w zakresie prowadzenia Konta jest zawarta na czas nieoznaczony; Klient może ją wypowiedzieć w każdej chwili (usunięcie Konta), a Verris — z ważnych przyczyn wskazanych w §24 ust. 1 — z zachowaniem 30-dniowego okresu wypowiedzenia.
2. Umowa w zakresie danej Usługi wiąże przez opłacony okres rozliczeniowy i wygasa w przypadkach wskazanych w §7 ust. 3, chyba że ulegnie odnowieniu. Wyłączenie automatycznego odnowienia nie wiąże się z żadnymi opłatami.
3. Uprawnienia Verris do wypowiedzenia natychmiastowego z powodu naruszeń określa §17 ust. 5.

## §24. Zmiany Regulaminu

1. Verris może zmienić Regulamin wyłącznie z ważnych przyczyn: zmiany przepisów prawa lub wydania decyzji, orzeczeń albo zaleceń uprawnionych organów wpływających na treść Regulaminu; nałożenia na Verris nowych obowiązków prawnych; zmiany zakresu lub sposobu świadczenia Usług wynikającej ze względów technicznych, technologicznych lub bezpieczeństwa; wprowadzenia nowych Usług lub funkcji; konieczności usunięcia niejasności lub oczywistych omyłek; zmiany danych identyfikacyjnych Verris.
2. O zmianie Verris zawiadamia Klientów e-mailem oraz w Panelu co najmniej 30 dni przed jej wejściem w życie, wskazując zakres zmian. Nowa wersja Regulaminu jest publikowana w Panelu wraz z archiwum wersji poprzednich.
3. Klient, który nie akceptuje zmian, może do dnia ich wejścia w życie wypowiedzieć Umowę bez dodatkowych kosztów; opłaty za niewykorzystany okres podlegają proporcjonalnemu zwrotowi. Dalsze korzystanie z Usług po wejściu zmian w życie wymaga akceptacji nowej wersji w Panelu.
4. Zmiany na korzyść Klientów oraz zmiany o charakterze wyłącznie redakcyjnym mogą wejść w życie bez zachowania terminu z ust. 2, o czym Verris informuje.

## §25. Postanowienia końcowe

1. Prawem właściwym jest prawo polskie. W sprawach nieuregulowanych stosuje się w szczególności Kodeks cywilny, ustawę o świadczeniu usług drogą elektroniczną, ustawę o prawach konsumenta, Prawo komunikacji elektronicznej, RODO oraz DSA.
2. Spory z Klientami niebędącymi Konsumentami ani Przedsiębiorcami na prawach Konsumenta rozstrzyga sąd właściwy dla siedziby Verris. Właściwość sądu w sporach z Konsumentami i Przedsiębiorcami na prawach Konsumenta określają przepisy powszechnie obowiązujące.
3. Jeżeli poszczególne postanowienia Regulaminu okażą się nieważne lub bezskuteczne, pozostałe postanowienia pozostają w mocy, a w miejsce postanowień wadliwych stosuje się przepisy prawa najbliższe celowi tych postanowień.
4. Załącznik 1 (wzór formularza odstąpienia) stanowi integralną część Regulaminu.

---

## Załącznik 1 — Wzór formularza odstąpienia od umowy

*(formularz ten należy wypełnić i odesłać tylko w przypadku chęci odstąpienia od umowy)*

Adresat: HVLN Dominik Kowalski, Zacisze 2A, 65-775 Zielona Góra, e-mail: kontakt@verris.pl

Ja/My(\*) niniejszym informuję/informujemy(\*) o moim/naszym odstąpieniu od umowy o świadczenie następującej usługi: ……………………………………………………

Data zawarcia umowy: ……………………

Imię i nazwisko konsumenta(-ów): ……………………………………………………

Adres konsumenta(-ów): ……………………………………………………

Podpis konsumenta(-ów) (tylko jeżeli formularz jest przesyłany w wersji papierowej): ……………………

Data: ……………………

(\*) Niepotrzebne skreślić.

---

**Wersja 1.1.0 — data publikacji i wejścia w życie: uzupełnij przed publikacją (patrz nota w nagłówku).**
Archiwum wersji: Panel → Dokumenty prawne → Historia wersji.
