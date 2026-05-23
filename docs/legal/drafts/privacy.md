# Polityka prywatności Verris

> **DRAFT — wymaga lawyer review.** Spełnia obowiązek informacyjny z art. 13 i 14 RODO.

## 1. Administrator danych

Administratorem Twoich danych osobowych jest:

- **HVLN Dominik Kowalski**
- z siedzibą pod adresem Zacisze 2A, 65-775 Zielona Góra,
- wpisany do Centralnej Ewidencji i Informacji o Działalności Gospodarczej,
- NIP 9292069367, REGON 521024260,
- e-mail kontaktowy: `kontakt@hvln.pl`,
- e-mail w sprawach RODO: `iod@hvln.pl`.

Wszystkie pytania dotyczące przetwarzania danych osobowych kierujesz na adres `iod@hvln.pl`, a my odpowiadamy w ciągu 30 dni.

## 2. Jakie dane przetwarzamy

W trakcie korzystania z Verris zbieramy i przetwarzamy:

### 2.1 Dane konta i Klienta

- adres e-mail, hasło (przechowywane jako hash bcrypt — nigdy nie widzimy hasła w postaci jawnej),
- imię i nazwisko,
- numer telefonu (opcjonalnie),
- nazwa firmy, NIP, adres siedziby (jeśli faktura B2B),
- preferowany język i strefa czasowa,
- dane uwierzytelniania dwuskładnikowego (TOTP secret zaszyfrowany AES-256-GCM, kody backup zahashowane bcrypt).

### 2.2 Dane techniczne i operacyjne

- adres IP, User-Agent, znacznik czasu logowania (`LoginAttempt`, retencja 90 dni),
- dane sesji (token JWT przechowywany w cookie httpOnly),
- logi audytu operacji (`AuditLog`, retencja 12 miesięcy),
- logi bezpieczeństwa (`SecurityAlert`, retencja 12 miesięcy),
- logi e-mail (status doręczenia, retencja 12 miesięcy).

### 2.3 Dane finansowe

- saldo Portfela i historia transakcji,
- numery faktur i ich treść (retencja 5 lat — wymóg polskiego prawa podatkowego),
- token Stripe Customer (`stripeCustomerId`) i identyfikatory zapisanych metod płatności (sam numer karty jest u Stripe — my widzimy tylko ostatnie 4 cyfry i typ karty),
- historia subskrypcji.

### 2.4 Dane Usługi (DirectAdmin / hosting)

- nazwa konta DirectAdmin, używane domeny, baza danych, e-mail,
- dane techniczne serwera (zużycie CPU, RAM, dysku — agregaty, nie zawartość plików).
- **NIE przetwarzamy** treści Twoich stron, wiadomości e-mail, baz danych — to Twoje dane, my udostępniamy tylko infrastrukturę. W zakresie tej infrastruktury jesteśmy podmiotem przetwarzającym (zob. **DPA**).

### 2.5 Dane wsparcia

- treść zgłoszeń (ticketów), załączniki, e-maile,
- preferencje powiadomień e-mail.

### 2.6 Subkonta (IAM)

Jeśli jesteś **Właścicielem Konta** i zapraszasz Subkonta, przetwarzamy także:

- adres e-mail Subkonta, imię (jeśli podane), przypisane uprawnienia i role,
- logi akceptacji zaproszenia, logowania i operacji w Panelu w zakresie uprawnień,
- wpisy audytu IAM (zaproszenia, zmiany uprawnień, wyłączenia).

Właściciel Konta jest **administratorem** danych osób zaproszonych jako Subkonta w zakresie decyzji o zaproszeniu i nadaniu uprawnień; Verris przetwarza te dane jako **podmiot przetwarzający** na polecenie Właściciela (Regulamin §5a) oraz jako administrator w zakresie technicznym świadczenia Usługi.

## 3. Cele i podstawy prawne przetwarzania

Przetwarzamy Twoje dane na podstawach z art. 6 RODO:

| Cel | Podstawa | Czas retencji |
| --- | --- | --- |
| Świadczenie Usługi (założenie konta, hosting, billing, support) | art. 6 ust. 1 lit. b — wykonanie Umowy | przez czas trwania Umowy + grace 14 dni |
| Wystawianie faktur i rozliczenia podatkowe | art. 6 ust. 1 lit. c — obowiązek prawny (ustawa o VAT, ordynacja podatkowa) | 5 lat od końca roku rozliczeniowego |
| Bezpieczeństwo Usługi (logi, ochrona przed nadużyciami, audyt) | art. 6 ust. 1 lit. f — uzasadniony interes Verris i Klientów | 90 dni dla LoginAttempt, 12 miesięcy dla AuditLog/SecurityAlert |
| Komunikacja z Klientem (transakcyjne e-maile, alerty bezpieczeństwa) | art. 6 ust. 1 lit. b — wykonanie Umowy | 12 miesięcy dla EmailLog |
| Marketing własny (newsletter, oferty Verris) | art. 6 ust. 1 lit. a — zgoda (jeśli wyrazisz) | do czasu wycofania zgody |
| Profilowanie marketingowe | art. 6 ust. 1 lit. a — zgoda (jeśli wyrazisz) | do czasu wycofania zgody |
| Reklamacje i obsługa roszczeń | art. 6 ust. 1 lit. f + lit. c | 6 lat od końca Umowy (przedawnienie roszczeń, art. 118 KC) |
| Statystyki i analityka serwisu | art. 6 ust. 1 lit. f — uzasadniony interes (poprawa jakości) | dane zagregowane, niezidentyfikowane |

## 4. Komu udostępniamy dane

Twoje dane mogą być przekazywane następującym kategoriom odbiorców:

### 4.1 Podmioty przetwarzające (procesorzy)

Działają na nasze zlecenie i wyłącznie w celach przez nas wskazanych, na podstawie umów powierzenia (art. 28 RODO):

- **Stripe Payments Europe Ltd.** (Irlandia, EOG) — operator płatności kartą, BLIK/P24, Apple Pay, Google Pay.
- **Dostawca infrastruktury VPS** (EOG) — hosting control-plane Verris (API, panele, baza danych).
- **MinIO (instancja self-hosted na infrastrukturze Verris, EOG)** — backupy, załączniki ticketów, eksporty RODO.
- **Dostawca SMTP / poczty transakcyjnej** (EOG — nazwa do uzupełnienia przed publikacją, np. Resend EU) — wysyłka e-maili transakcyjnych.

Pełna lista: [`subprocessors.md`](./subprocessors.md) (aktualizowana przed LIVE i przy każdej zmianie).

### 4.2 Organy państwowe

Możemy zostać zobowiązani do udostępnienia danych:

- organom ścigania (Policja, Prokuratura, ABW) — na podstawie postanowienia sądu lub przepisu prawa,
- Urzędowi Skarbowemu / KSeF — w zakresie faktur,
- PUODO — w przypadku kontroli zgodności z RODO,
- sądom — w toku postępowań cywilnych.

### 4.3 Doradcy prawni i księgowi

Nasza kancelaria prawna i biuro księgowe mają dostęp do danych w zakresie niezbędnym do świadczenia usług na naszą rzecz, na podstawie umów o zachowaniu poufności.

## 5. Przekazywanie danych poza EOG

Wszyscy nasi subprocessors działają w obrębie Europejskiego Obszaru Gospodarczego (EOG), więc Twoje dane nie są przekazywane poza UE.

W przypadku, gdyby kiedykolwiek miało nastąpić przekazanie danych poza EOG (np. Stripe może w wyjątkowych sytuacjach przetwarzać dane w USA), zostaną zastosowane odpowiednie zabezpieczenia w postaci **Standardowych Klauzul Umownych (SCC)** zatwierdzonych przez Komisję Europejską oraz, jeśli odbiorca jest certyfikowany, **Data Privacy Framework (DPF)**.

## 6. Twoje prawa

Na podstawie RODO przysługują Ci następujące prawa, z których możesz skorzystać w dowolnym momencie:

### 6.1 Prawo dostępu (art. 15 RODO)

Możesz zażądać kopii swoich danych. W Panelu w sekcji „Prywatność i RODO" przygotowaliśmy automatyczny eksport — generujemy paczkę ZIP w 24h.

### 6.2 Prawo do sprostowania (art. 16 RODO)

Większość danych aktualizujesz samodzielnie w Panelu (sekcja „Profil"). Jeśli czegoś nie da się zmienić z poziomu Panelu, napisz na `iod@hvln.pl`.

### 6.3 Prawo do usunięcia („prawo do bycia zapomnianym", art. 17 RODO)

Możesz usunąć konto w Panelu w sekcji „Prywatność i RODO" → „Usuń konto". Wniosek przyjmiemy, lecz:

- **Grace period: 14 dni** — do tego czasu konto jest zawieszone i możesz je przywrócić.
- Po 14 dniach konto zostanie **zanonimizowane** — usuniemy dane osobowe, zachowujemy zanonimizowany ledger transakcji i numerów faktur (5 lat — obowiązek prawny).
- Cofnięcie zgody na marketing nie wymaga usunięcia konta — wystarczy wyłączyć w „Powiadomieniach".

### 6.4 Prawo do ograniczenia przetwarzania (art. 18 RODO)

Możesz wystąpić o czasowe wstrzymanie przetwarzania (np. w trakcie sporu). Skontaktuj się z `iod@hvln.pl`.

### 6.5 Prawo do przenoszenia danych (art. 20 RODO)

W ramach automatycznego eksportu (pkt 6.1) otrzymujesz dane w formacie JSON gotowym do importu u innego dostawcy.

### 6.6 Prawo do sprzeciwu (art. 21 RODO)

Możesz wnieść sprzeciw wobec przetwarzania na podstawie uzasadnionego interesu (lit. f) lub marketingu. Przyjmiemy sprzeciw, chyba że wykażemy ważne, prawnie uzasadnione podstawy do dalszego przetwarzania (np. obrona roszczeń).

### 6.7 Prawo do cofnięcia zgody

Możesz cofnąć każdą wyrażoną zgodę (np. na marketing) w dowolnym momencie w Panelu w „Powiadomieniach". Cofnięcie nie wpływa na zgodność z prawem przetwarzania dokonanego przed cofnięciem.

### 6.8 Prawo do skargi

Możesz wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (PUODO):

- adres: ul. Stawki 2, 00-193 Warszawa,
- e-mail: kancelaria@uodo.gov.pl,
- web: https://uodo.gov.pl.

## 7. Zautomatyzowane podejmowanie decyzji

Nie podejmujemy wobec Klientów zautomatyzowanych decyzji wywołujących skutki prawne, ani nie stosujemy profilowania w rozumieniu art. 22 RODO.

Wyjątkiem są **automatyczne reguły bezpieczeństwa**: blokowanie konta po wielu nieudanych logowaniach, blokowanie podejrzanej aktywności (np. brute-force). Te decyzje są tymczasowe (15 minut do 24h), zawsze możesz skontaktować się z supportem aby je odwrócić.

## 8. Bezpieczeństwo danych

Stosujemy następujące techniczne i organizacyjne środki ochrony:

- **Szyfrowanie w tranzycie:** wszystkie połączenia TLS 1.3 (HSTS, certyfikaty Let's Encrypt).
- **Szyfrowanie w spoczynku:** TOTP secrets, klucze API są szyfrowane AES-256-GCM kluczem `APP_KMS_KEY` rotowanym co 6 miesięcy.
- **Hashing haseł:** bcrypt (cost factor 12).
- **2FA:** zalecane dla wszystkich kont, wymagane dla kont admin/staff.
- **Ograniczenie dostępu:** zasada „need-to-know" — Zespół Verris ma dostęp do danych tylko w zakresie niezbędnym do swojej roli (RBAC). Każdy dostęp zarejestrowany w `AuditLog`.
- **Impersonacja:** gdy operator support zaglądy w Twoje konto, zawsze zostaje to odnotowane w logach z uzasadnieniem i czasem trwania (max 30 minut).
- **Monitoring i alarmy:** 24/7 monitoring nadużyć (`SecurityAlert`), niezależny zewnętrzny monitor uptime (`status.verris.pl`).
- **Backupy:** szyfrowane, retencja i off-site zgodnie z aktualną checklistą operacyjną Verris.
- **Pen-testy:** zewnętrzne audyty bezpieczeństwa planowane cyklicznie po uruchomieniu środowiska produkcyjnego.

## 9. Naruszenie ochrony danych

W przypadku naruszenia ochrony danych prowadzącego do wysokiego ryzyka naruszenia praw lub wolności osób fizycznych, zawiadomimy Cię bez zbędnej zwłoki. W każdym przypadku zawiadomimy PUODO w ciągu 72 godzin (art. 33 RODO).

## 10. Zmiany Polityki

Zastrzegamy prawo do aktualizacji niniejszej Polityki. Każda nowa wersja jest publikowana w Panelu z wymaganiem ponownej akceptacji przy kolejnym logowaniu (re-consent flow). Pełna historia wersji jest dostępna w Panelu w sekcji „Prywatność i RODO".

---

**Wersja: DRAFT 0.2 (przed lawyer review)**  
**Data: maj 2026**  
**Lawyer review status: pending — gotowiec do przesłania prawnikowi**
