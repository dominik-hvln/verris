# Verris: przegląd luk, widm i braków (27.09.2026)

Stan kodu: `main` z 27.09 wieczorem. Źródła, z których składa się ten przegląd:

- macierz audytu (439 pozycji, 142 z lukami);
- przegląd kodu pod wyścigi i ścieżki pieniędzy;
- przegląd paneli pod „widma”;
- porównanie obietnic z verris.pl z kodem;
- przegląd rynku 2025–2026 (źródła na końcu).

Każdą pozycję sprawdzono w kodzie albo w źródle. „Węzeł” oznacza, że kod jest gotowy i czeka na test na serwerze.

---

## 0. Najważniejsze, w kolejności

| # | Co | Dlaczego pilne | Kto |
|---|---|---|---|
| 1 | **NIS2/KSC (PB-24): termin wpisu do wykazu według publikacji branżowych to 3.10.2026** | Dostawcy DNS podlegają ustawie niezależnie od wielkości firmy. Trzeba potwierdzić z prawnikiem, czy Verris już teraz jest „dostawcą”, skoro publiczny start jest 1.01.2027 | Ty + prawnik |
| 2 | **Faktury: podwójny numer i cofanie statusu z PAID** (§1.1) | Luka w numeracji VAT, druga faktura PDF i drugi mail | kod |
| 3 | **Korekta faktury zwraca pieniądze drugi raz** (§1.2) | Pieniądze | kod |
| 4 | **Płatność Stripe po zawieszeniu nie odwiesza usługi** (§1.3) | Klient zapłacił, a usługa dalej stoi | kod |
| 5 | **Automatyczne rekompensaty SLA obiecane w 9 miejscach na verris.pl, a przełącznik jest wyłączony, obowiązujący regulamin 1.0.1 mówi „na wniosek”** (§2.1) | Ryzyko prawne (wprowadzanie w błąd) | decyzja + tekst |
| 6 | **„Stare wersje PHP 7.4–8.3 per domena”**, a węzeł ma 8.0–8.3 (kreator stawia tylko 8.3) (§2.2) | Obietnica bez pokrycia | węzeł / tekst |
| 7 | **Omnibus: brak najniższej ceny z 30 dni przy promocji** (regulamin §9 ust. 3) (§2.5) | UOKiK | kod |
| 8 | **E-mail marketing jest w menu, ale nie da się go kupić** (§3.1) | Widmo, choć usługa jest wpisana w zakres startu | kod |
| 9 | **Narzut resellera zmienia tylko liczby, które widzi reseller; klient płaci cenę katalogową** (§3.2) | Widmo w module resellera | kod / decyzja |
| 10 | **Asystent AI w panelu (L-11), blokada botów AI, generator strony WP z AI** (§4.2) | Konkurencja w PL (cyber_Folks, home.pl, cPanel, Plesk, Hostinger) ma to od 2025–26. Największa luka wizerunkowa | decyzja produktowa |

Naprawione 27.09 wieczorem (testy na PostgreSQL): podwójne „przejdź na płatny” (393f254); korekty bez podwójnego zwrotu i płatność Stripe po zawieszeniu (b1a1097); zwrot + spór bez podwójnego cofnięcia, „Ponów” bez równoległego przetwarzania (140566c); widma 3.4 (opis), 3.6, 3.12–3.14 (600fd18). Numeracja faktur (1.1) też naprawiona tego wieczoru.

---

## 1. Pieniądze i dane: błędy w kodzie (nie wymagają węzła)

API działa jako jedna replika, więc realne wyścigi to: nakładające się przebiegi tego samego harmonogramu, harmonogram kontra akcja klienta oraz webhooki Stripe między sobą.

| # | Gdzie | Problem | Waga |
|---|---|---|---|
| 1.1 | `billing/invoices.service.ts` (upsertFromStripe / finalizeAsVerrisInvoice) + `faktury.scheduler` | `invoice.paid` i `invoice.payment_succeeded` przychodzą razem, a do tego dochodzi cron dokańczania. Każda ścieżka przydziela numer VFV: jeden numer ginie (dziura w serii), powstaje drugi PDF i drugi mail. Zdarzenie `invoice.created`/`finalized` obsłużone po `paid` cofa status na OPEN i zeruje `paidAt` | **NAPRAWIONE** (faktury, 27.09) |
| 1.2 | `billing/korekty.service.ts` (wystaw) | Korekta liczona od faktury pierwotnej, bez uwzględnienia wcześniejszych korekt. Klucz unikalności zawiera nowy numer, więc nie blokuje powtórki. Dwuklik albo druga korekta to drugi zwrot do portfela | **NAPRAWIONE** (b1a1097) |
| 1.3 | `subscriptions.service.ts` activateAfterStripePayment + `renewal.scheduler` runGraceExpiry | Po karencji zawieszane są też subskrypcje Stripe. Późniejsza udana płatność (smart retry) przy statusie SUSPENDED nic nie robi. Przy synchronicznym provisioningu dwa zdarzenia „paid” uruchamiają dwa zakładania konta | **NAPRAWIONE** (b1a1097) |
| 1.4 | `trial.service.ts` convertFromWallet | ~~Podwójne kliknięcie → zwrot → darmowy miesiąc~~ | **NAPRAWIONE** (393f254) |
| 1.5 | `billing.service.ts` handleZwrotPlatnosci | Dwa zdarzenia dla jednej płatności (częściowe zwroty, zwrot + dispute) mogą podwójnie ściągnąć pieniądze z portfela. `charge.dispute.closed` (wygrany) nie jest obsłużony, więc środki nie wracają | **NAPRAWIONE** (140566c) |
| 1.6 | `promo.service.ts` applyPercentBonusForTopup | Dwa checkouty z tym samym kodem dostają bonus dwa razy. Limit użyć i data ważności są sprawdzane tylko przy tworzeniu checkoutu | ŚREDNIA |
| 1.7 | `vps/vps-renewal.scheduler.ts` | Brak warunkowego przejęcia rekordu. VPS usunięty w trakcie przebiegu zostaje obciążony i „wskrzeszony”. Nieudane usunięcie w Hetznerze jest połknięte: rekord ma status DELETED, a serwer dalej działa na koszt Verris. Włącza też VPS zatrzymany ręcznie przez klienta. (VPS jest za flagą, ale przed włączeniem sprzedaży trzeba to naprawić) | ŚREDNIA |
| 1.8 | `billing.service.ts` przetworzPonownie | Przejęcie zdarzenia bez `claimedAt`: „Ponów” w adminie w trakcie przetwarzania albo harmonogram ponowień przy redelivery Stripe uruchamia handler dwa razy. Wzmacnia problemy 1.1, 1.3 i 1.5 | **NAPRAWIONE** (140566c) |
| 1.9 | `domain-registrar.service.ts` charge | Obciążenie i zapis `walletTxId` w jednym `try`. Błąd po obciążeniu kończy się komunikatem „brak środków”: pieniądze pobrane, domena niezarejestrowana, brak zwrotu | ŚREDNIA |
| 1.10 | `renewal.scheduler.ts` | Licznik okresów zniżki startowej zmniejszany bezwarunkowo: „Opłać teraz” w tej samej chwili co cron zabiera okres zniżki. `extendPeriod` ustawia ACTIVE bezwarunkowo | ŚREDNIA |
| 1.11 | `migration-worker.scheduler.ts` processQueuedMigrations | Zawsze czyta 20 najstarszych zdarzeń *_REQUESTED. Po 20 wnioskach w historii nowe nie są już obsługiwane. Brak flagi „zajęty” | ŚREDNIA |
| 1.12 | `domain-registrar.service.ts` refundAndFail | Nieudany zwrot tylko ląduje w logu, zamówienie ma status FAILED, brak ponowienia | ŚREDNIA− |
| 1.13 | `ksef.service.ts` oznaczNiedostepnosc | Może cofnąć SUBMITTED na OFFLINE i wysłać fakturę do KSeF drugi raz (moduł jest wyłączony, ale trzeba to poprawić przed włączeniem) | ŚREDNIA− |
| 1.14 | `partners.service.ts` adminProcessPayout | Równoczesne PAID i REJECTED: wypłata oznaczona PAID, a prowizje wracają do puli | NISKA+ |
| 1.15 | `subscriptions.service.ts` finalizeScheduledCancellation | Klient wznawia usługę w trakcie przebiegu, a usługa i tak zostaje anulowana | NISKA+ |
| 1.16 | `subscriptions.service.ts` unsuspend | Pobiera cenę indywidualną, a zwraca katalogową; nieudany zwrot jest połknięty | **NAPRAWIONE** (b1a1097) |
| 1.17 | `vps.service.ts` order | Błąd po `createServer` to zwrot pieniędzy przy działającym serwerze w Hetznerze | NISKA+ |
| 1.18 | `domain-registrar.service.ts` renew | Brak idempotencji żądania: dwuklik to dwa odnowienia i dwa obciążenia | NISKA |
| 1.19 | `plan-change.service.ts` | Limity w DirectAdminie ustawiane przed commitem. Commit się nie udaje, zmiana jest zwrócona, a limity zostają podniesione | NISKA |
| 1.20 | `site-monitor.service.ts` | Klucz idempotencji dzienny: wyłączenie i ponowne włączenie tego samego dnia daje darmowy miesiąc | NISKA |
| 1.21 | maile przypomnień (trial, SLA zgłoszeń, domeny, odnowienia, niskie saldo, faktury, migracje) | Wzorzec „czytaj, wyślij, oznacz”: nakładający się przebieg albo awaria wysyła maila drugi raz | NISKA |
| 1.22 | webhook Stripe: `invoice.paid` + `payment_succeeded` | Oba wysyłają mail o odnowieniu i zapisują audyt, więc klient dostaje dwa maile | **NAPRAWIONE** (27.09) |
| 1.23 | `DomainPointingPanel.tsx:94` | „Sprawdź” bez `catch`: przy błędzie klient nic nie widzi | NISKA |

Pozostałe akcje serwera, które rzucają błędy (ok. 30), pokazują ogólny komunikat albo żaden, więc komunikat nie ginie. Jedynym realnym przypadkiem jest 1.23.

---

## 2. Obietnice na verris.pl bez pokrycia albo z częściowym

`SPEC_PO_WERYFIKACJI=false` ukrywa niezweryfikowane wiersze na stronie specyfikacji, ale **te same obietnice stoją jawnie na innych stronach**.

| # | Obietnica (gdzie) | Stan | Co zrobić |
|---|---|---|---|
| 2.1 | „Awaria? Rekompensata wraca sama” (strona główna, meta całej witryny, specyfikacja, przenieś-stronę, o-nas, stopka, llms.txt) | **Bez pokrycia dziś**: `sla.creditsEnabled='0'`; regulamin 1.0.1 mówi „na wniosek”; §15 obiecuje „niezależny monitoring”, a liczymy z własnych sond | Albo opublikować regulamin 1.1.0 i włączyć rekompensaty, albo usunąć „automatycznie” z 9 miejsc |
| 2.2 | „PHP 7.4, 8.0, 8.1, 8.2, 8.3 osobno dla każdej domeny”, „obsługa starych wersji PHP” | **Częściowe**: sloty 8.3/8.2/8.1/8.0 (bez 7.4), kreator węzła instaluje tylko 8.3 | Na węźle zainstalować 7.4 (alt-php/CL) albo poprawić tekst na 8.0–8.3 |
| 2.3 | Szyfrowana kopia poza serwerem, 30 dni (cennik, llms.txt) | Węzeł. Skrypt off-site do 25.09 nie robił nowych kopii; poprawka nie jest przetestowana | Ukryć za tą samą flagą co na specyfikacji, do testu na węźle |
| 2.4 | Autoskalowanie „samo”, „pik sprzedaży nie kończy się błędem 503” | **Częściowe**: domyślnie wyłączone (klient musi je włączyć i ustawić limit kosztu), przy braku miejsca na węźle przycinane | Dopisać „po włączeniu”, usunąć absolutne „bez 503” |
| 2.5 | Rabat startowy + regulamin §9 ust. 3 (Omnibus: najniższa cena z 30 dni) | **Omnibus bez pokrycia** | Pokazywać najniższą cenę z 30 dni albo nie reklamować rabatu |
| 2.6 | Formularz leada: „plan migracji i kilka wiadomości… link rezygnacji” | **Bez pokrycia**: seria nie istnieje, brak linku rezygnacji dla leadów | Zbudować serię albo zmienić tekst zgody |
| 2.7 | `public/pricing.md`: kopie „w ramach limitu Planu”, nadwyżka płatna za zużycie; regulamin: „dodatkowy transfer” płatny | **Bez pokrycia**: brak limitu i rozliczania, a strona mówi „transfer bez limitu” | Usunąć te linie |
| 2.8 | Wyszukiwarka domen na stronie głównej, blokada transferu | Kod gotowy, ale `REGISTRAR_PROVIDER` nie jest skonfigurowany | Skonfigurować OpenProvider albo ukryć wyszukiwarkę |
| 2.9 | „Domeny nigdy nie odnawiają się automatycznie” | Kod OK, ale **regulamin §12 ust. 5** sugeruje odnowienie z portfela | Przeredagować §12 ust. 5 |
| 2.10 | BLIK, Apple Pay, Google Pay | **Częściowe**: w kodzie `card` + `p24`; BLIK tylko przez P24 i tylko przy doładowaniu; Apple/Google Pay zależą od ustawień Stripe; regulamin nie wymienia P24 | Poprawić tekst albo włączyć metody |
| 2.11 | CloudLinux, NVMe, LiteSpeed (cennik, hosting) | Węzeł. Specyfikacja to ukrywa, inne strony mówią to jawnie | Ta sama flaga do czasu węzła |
| 2.12 | „Dane pozostają w EOG” | **Częściowe**: podprocesorzy spoza EOG (Stripe, Cloudflare, Google, OpenAI, Anthropic; treść zgłoszeń idzie do AI) | „Serwery w EOG” zamiast „dane w EOG” |
| 2.13 | Skalowanie do 24 vCPU / 64 GB / 1000 GB | Węzeł (pojemność) | Test na węźle |
| 2.14 | Kopia bezpieczeństwa przed odtworzeniem, domyślnie | Węzeł (H-09) | Test na węźle |
| 2.15 | Faktura VAT „w panelu i mailem” (regulamin §9 ust. 4) | **Częściowe**: tryb zewnętrzny, numer wpisywany ręcznie, brak PDF i maila z Verris | Tekst regulaminu albo wysyłka PDF |
| 2.16 | Staging: publikacja na produkcję | Częściowe (I-11) | Węzeł |
| 2.17 | Szkice bloga: SLA „automatyczne”; „panel DirectAdmin” (łamie white-label); analityka „bez danych osobowych”; stare PHP | Te same problemy | Poprawić przed publikacją |

Kopia robocza tych poprawek tekstu zajmie ok. 1–2 h. Mogę je przygotować jako jeden commit do akceptacji.

---

## 3. Widma w panelach

API jest czyste: wszystkie ok. 680 wywołań z paneli ma kontroler, nie ma danych testowych, `Math.random` ani „wkrótce”. Widma to rzeczy, które udają działanie:

| # | Panel | Co widzi klient | Dlaczego to widmo | Waga |
|---|---|---|---|---|
| 3.1 | klient | **E-mail marketing** w menu i „Zamów usługę” | Zamówienie oferuje tylko HOSTING/EMAIL/VPS; DTO planów nie pozwala założyć planu EMAIL_MARKETING, a w bazie startowej go nie ma | **WYSOKA** |
| 3.2 | klient | **Narzut resellera**: „nowe ceny detaliczne liczą się od razu”, „przychód detaliczny” | `markupPct` liczy tylko wyświetlane liczby; klienci płacą cenę katalogową. Rozliczenia są „w kolejnym etapie” | **WYSOKA** |
| 3.3 | klient | **„Drzewa łącznie — posadzone z Twoich punktów”** | Liczba to `floor(punkty / punktyNaDrzewo)`: bez partnera, bez sadzenia, maleje po wymianie punktów | **WYSOKA** (greenwashing) |
| 3.4 | klient | **„ECO Mode (zalecane) — optymalizacja wydajności”**, domyślnie włączony przy zamówieniu | Jedynie punkty i zmiana kopii z dziennych na tygodniowe (na nowym koncie nic). Karta usługi przyznaje „rzadsze kopie”, formularz zamówienia to ukrywa | **NAPRAWIONE** (600fd18 (opis)) |
| 3.5 | klient | Język „English” w ustawieniach | Zapisuje `locale`, którego nikt nie czyta; panel ma tylko polski | ŚREDNIA |
| 3.6 | klient | SSO phpMyAdmin/webmail zostawia pustą kartę | `window.open(..., 'noopener')` zawsze zwraca `null`; druga karta może zostać zablokowana | **NAPRAWIONE** (600fd18) |
| 3.7 | klient | „Kup domenę” na pulpicie i w palecie, gdy rejestrator nie jest skonfigurowany | Sprawdzane są tylko uprawnienia; w efekcie strona „Zakup domen nie jest jeszcze dostępny” | ŚREDNIA |
| 3.8 | klient | Dodatek **„Dedykowane IP” za 25 zł jednorazowo** | Tylko otwiera zgłoszenie; DirectAdmin nie ma API do przypisania IP; zasób stały sprzedany jednorazowo | ŚREDNIA |
| 3.9 | klient | Analityka: „Kraje” | Potrzebuje nagłówka `cf-ipcountry`/`x-geo-country`, którego nic nie ustawia (prawdopodobnie zawsze pusto) | ŚREDNIA |
| 3.10 | klient | Analityka „bez danych osobowych” | Sprzeczne z przyjętą zasadą (IP przetwarzane przed hashowaniem) | NISKA |
| 3.11 | klient | Przełącznik „oferty partnerskie” | Zapisywany, ale żaden nadawca go nie czyta | NISKA |
| 3.12 | klient | „Autoskalowanie rozliczane godzinowo” (formularz zamówienia) | Rozliczamy blokami 15 min | **NAPRAWIONE** (600fd18) |
| 3.13 | klient | `/dashboard/notifications` na liście tras | Strona nie istnieje (nic tam nie linkuje) | **NAPRAWIONE** (600fd18) |
| 3.14 | admin | Link „Zgłoszenie” przy migracji | Prowadzi do `/tickets/{id}`, którego w adminie nie ma (404) | **NAPRAWIONE** (600fd18) |
| 3.15 | admin | „Included transfer (GB)” w planie | Zapisywane, nieużywane | NISKA |

Panel obsługi (staff): bez widm.

---

## 4. Luki względem konkurencji

### 4.1 Z macierzy (142 pozycje z luką)

**Czekają tylko na węzeł (kod gotowy):** większość pozycji o wysokiej wadze, m.in.:

- domeny A-09/A-11/A-13 (plus konfiguracja rejestratora);
- zawieszanie i odwieszanie A-25/A-26;
- PHP B-01/B-05;
- FTP/SSH C-18/C-21/C-22;
- bazy D-12/D-15;
- poczta E-05/E-15–E-17;
- DNS F-01/F-02;
- malware G-11;
- kopie H-04/H-09–H-11/H-16;
- aplikacje I-01/I-04/I-11;
- wydajność J-01–J-03;
- logi K-04/K-05;
- węzeł Q-14/PROD-01/NODE-02;
- Z-18 (**BLOKER STARTU**: prawdziwa przyczyna błędu provisioningu).

Jutrzejszy serwer odblokowuje ok. 94 pozycje w teście.

**Braki świadome (LUKA, decyzja „po starcie” albo poza zakresem):**

- ukrycie danych WHOIS A-14;
- kreator stron B-19;
- 2FA w webmailu E-24;
- Anycast F-12;
- sprzedaż certyfikatów G-08;
- czyszczenie infekcji G-12;
- CDN J-05;
- telefon N-21;
- ISO P-14;
- konsola i snapshoty VPS Q-07/Q-08;
- KSeF we własnym zakresie (M-14/M-16/M-17, KSEF-01/03, X-07): faktury idą przez zewnętrzny program.

**Bezpieczeństwo serwera panelu (od 29.09):** SEC-01/02/03/04/06, X-41. Decyzje po 7-dniowym pomiarze ruchu wychodzącego.

### 4.2 Nowości rynku 2025–2026, których macierz nie ma

| # | Funkcja | Kto ma | Waga dla MŚP/WP |
|---|---|---|---|
| 1 | **NIS2/KSC**: wpis do wykazu, zgłaszanie incydentów 24 h / 72 h / 30 dni | ustawa od 2.04.2026 | **WYSOKA** (PB-24) |
| 2 | **Blokada botów AI per domena** (kategorie: trening, wyszukiwarki, scrapery) | cyber_Folks (06.2026), Kinsta (gratis), Cloudways | **WYSOKA**, tanie (reguły WAF/.htaccess) |
| 3 | **Darmowa domena .pl na pierwszy rok** w pakiecie | home.pl, nazwa.pl | **WYSOKA** (cena) |
| 4 | **Generator strony WordPress z opisu firmy (AI)** | home.pl, cPanel v138 „Nova”, Hostinger, cyber_Folks _NOW | **WYSOKA** |
| 5 | Agent AI w panelu WordPressa | SiteGround, Hostinger Kodee | ŚREDNIA |
| 6 | **MCP**: podpięcie Claude/ChatGPT/Cursora do konta | cPanel v138, Plesk 18.0.80, Cloudways, Hostinger | ŚREDNIA (WYSOKA dla agencji); mamy publiczne API, więc to krótka droga |
| 7 | Kopie co 6 h (bazy WP) | cyber_Folks, Zenbox | ŚREDNIA |
| 8 | Audyt dostępności strony klienta (EAA) | cyber_Folks | ŚREDNIA |
| 9 | Automatyczna diagnoza wydajności z naprawą 1 klik | Hostinger, Cloudways Copilot | ŚREDNIA |
| 10 | **Logowanie do wp-admin jednym kliknięciem** | Kinsta, WP Toolkit, Installatron | ŚREDNIA, tanie |
| 11 | Generator llms.txt | cyber_Folks, Hostinger | NISKA–ŚREDNIA, tanie |
| 12 | Hosting aplikacji z AI (vibe-coding → Node.js) | cPanel, SiteGround, Hostinger | NISKA |
| 13 | Obszar roboczy AI, agenci biznesowi | SiteGround, Hostinger | NISKA |
| 14 | Hasła aplikacji do poczty | Hostinger | NISKA |
| 15 | Ochrona domeny (40 dni karencji, 2FA przy transferze) | Hostinger | NISKA |
| 16 | VPS z n8n / agentami jednym kliknięciem | cyber_Folks, Hostinger | NISKA |
| 17 | Zmiana nazwy domeny z przeniesieniem DNS | cPanel v138 | NISKA |
| 18 | SFTP dla dodatkowych kont FTP | Plesk | NISKA |
| 19 | Historia prób ACME | DirectAdmin 1.710 (przyjdzie z aktualizacją) | NISKA |
| 20 | Alerty o wycieku danych | Hostinger | NISKA |
| 21 | Certyfikaty SSL max 200 dni (od 03.2026), docelowo 47 | branża | NISKA–ŚREDNIA (przypomnienia dla certyfikatów wgranych ręcznie) |

### 4.3 Gdzie rynek nas dogonił (PRZEWAGA → realnie PARYTET)

- **Asystent AI (L-11)**: robo_Folks od 10.2025 wykonuje akcje w DirectAdminie, cPanel i Plesk mają asystentów, Kodee robi ponad 350 akcji. U nas FLAGA/CZĘŚCIOWY. **Największa luka wizerunkowa.**
- **KSeF (M-11)**: od 2026 obowiązkowy, to higiena, a nie przewaga. dhosting pokazuje w panelu numer KSeF i kod QR, więc **M-14 (numer KSeF widoczny dla klienta) to realna luka**, nawet przy fakturach z zewnętrznego programu (wystarczy pole na numer KSeF obok numeru faktury).
- Health-check i weryfikacja DNS (K-09, F-04/F-05): Plesk i robo_Folks robią to z naprawą.
- Monitoring i alerty (K-10/K-11): nazwa.pl (SMS), Hostinger.
- E-mail marketing (Q-05): nazwa.pl, Hostinger Reach, SiteGround (z AI). U nas dodatkowo widmo 3.1.
- Autoskalowanie (J-08): dhosting EWH do 64 GB, nazwa.pl Pay-Per-Use. Limit kosztu i kalkulator (J-09/J-10) mogą zostać naszą przewagą.
- Staging (I-09/I-10/I-12): cyber_Folks ma synchronizację w obie strony w Installatronie.
- Publiczne API (L-07): nowa poprzeczka to MCP.
- Migracja (I-17…I-21): Hostinger (upload kopii / agent), nazwa.pl w 24 h. Delta-sync i cutover prawdopodobnie zostają przewagą.
- 2FA w webmailu (E-24): Hostinger, nazwa.pl, WEBD.
- Retencja kopii (H-04): górna półka w PL to 28–30 dni (cyber_Folks 4×4, LH.pl 30). „180 dni” w dhosting dotyczy tylko poczty.

Tło rynku: NVMe + LiteSpeed + Imunify360 to standard. Rabaty na pierwszy rok 50–70%, odnowienia 3–7× drożej; porównywarki liczą koszt z 24 miesięcy (nasza stała cena to argument). EAA obowiązuje od 06.2025.

---

## 5. Świadome skróty w kodzie (`ponytail:`, 28)

Najważniejsze do domknięcia na węźle (D3):

- formaty DirectAdmina dla usuwania rekordów DNS, modyfikacji FTP i POP oraz kluczy DNSSEC;
- tekst DA „użytkownik nie istnieje” przy usuwaniu konta;
- `suspend()` bez warunkowego przejścia przed wywołaniem DA (reszta po poprawce karencji);
- naprawy węzła z ryzykiem „danger” bez potwierdzenia po stronie serwera.

Pozostałe mają rozsądne progi (cache w pamięci jednej repliki, plan jednego typu, strefa UTC w odznakach, kwota CAPI z klienta).

W kodzie nie ma żadnych TODO/FIXME.

---

## 6. Proponowana kolejność

1. **Dziś / jutro rano (bez węzła):** 1.1, 1.2, 1.3, 1.5, 1.8 (faktury, korekty, Stripe) z testami na PostgreSQL; widma 3.1–3.4 i 3.6–3.8; poprawki tekstów verris.pl z §2 (jeden commit do akceptacji).
2. **Twoje decyzje:** NIS2 (prawnik, termin), rekompensaty SLA (włączyć czy zmienić tekst), PHP 7.4, narzut resellera (rozliczać czy ukryć), drzewa EKO (partner czy usunąć), darmowa domena .pl, AI w panelu.
3. **Po zakupie węzła:** przebieg D3 wg „Sprawdzone na żywym węźle” (94 pozycje), w pierwszej kolejności Z-18, kopie H-*, PHP, poczta i DNS.
4. **Tanie przewagi po starcie:** blokada botów AI, logowanie do wp-admin jednym kliknięciem, llms.txt, pole numeru KSeF na fakturze, MCP na bazie publicznego API.

---

### Źródła (przegląd rynku)

- NIS2 a DNS: di.com.pl/nis2-dns-domeny-kto-podlega · hostingnews.pl/nis2-hosting-domeny
- cyber_Folks: blokada botów AI · generator llms.txt · EAA · backup 4×4 · staging w Installatronie · VPS n8n (cyberfolks.pl/blog, cyberfolks.pl/pomoc); robo_Folks: mambiznes.pl
- Kinsta Bot Protection (businesswire.com, 09.06.2026); Kinsta changelog (kinsta.com/changelog)
- home.pl hosting WP z AI (pomoc.home.pl/komunikaty); nazwa.pl (nazwa.pl, Pay-Per-Use na blogu)
- cPanel AI / v138 (prnewswire.co.uk; panellicense.com); Plesk 18.0.80 (plesk.com/blog); podwyżka Plesk (webhosting.today)
- Hostinger aktualizacje 2025 i 2026 (hostinger.com/blog/product-updates-2025, -2026); Domain Shield (hostinger.com/support)
- SiteGround AI Agent, AI Studio, aktualizacje (siteground.com)
- Cloudways Roadmap, Copilot GA, MCP Cloud (cloudways.com)
- dhosting KSeF na fakturach (dhosting.pl/community); EWH (dhosting.pl)
- DirectAdmin 1.710 (docs.directadmin.com/changelog)
- Ważność SSL 200 dni (sslinsights.com); ceny odnowień (hostgrade.pl)
- Recenzje: jakwybrachosting.pl (cyber_Folks, Zenbox), hostingrank.pl (LH.pl), kreatorystronwww.pl (cyber_Folks _NOW)
