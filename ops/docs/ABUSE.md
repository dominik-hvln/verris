# Obsługa nadużyć (abuse@verris.pl)

**Właściciel procedury:** Dominik Kowalski (HVLN) · **Zastępstwo:** operator z uprawnieniem
`SUBSCRIPTIONS_MANAGE` w panelu staff/admin · **Podstawa:** Regulamin §16–17 (AUP, DSA art. 16–17),
umowa z Hetzner (zgłoszenia abuse od dostawcy) · **Wersja:** 2026-09-23

Adres `abuse@verris.pl` jest punktem kontaktowym DSA dla zgłaszających, organów państw członkowskich,
Komisji i Rady Usług Cyfrowych (PL i EN). Skrzynka musi istnieć i być czytana, zanim regulamin
zostanie opublikowany.

## 1. Skąd przychodzą zgłoszenia

| Źródło | Kanał | Uwagi |
| --- | --- | --- |
| Osoby trzecie, posiadacze praw | `abuse@verris.pl`; formularz w stopce (Regulamin §17 ust. 1) — do zbudowania razem z landingiem (PB-06) | wymagane elementy zgłoszenia: Regulamin §17 ust. 2 |
| Hetzner (dostawca serwerów) | e-mail z `abuse@hetzner.com` + panel Robot/Cloud | **własny termin dostawcy** (zwykle 24 h) — nieodpowiedzenie grozi blokadą IP całego serwera |
| CERT Polska / CSIRT NASK, Spamhaus, inne listy | e-mail, zgłoszenia automatyczne | traktować jak Hetzner — dotyczą reputacji całej infrastruktury |
| Organy (policja, prokuratura, UODO, DSA) | e-mail, pismo | wyłącznie właściciel; nie informować klienta, jeśli organ tego zabrania |
| Własne systemy | alert wysyłki (N-14, cordon), RBL (monitoring reputacji), IOC, anty-skan | zgłoszenie wewnętrzne, bez zgłaszającego |

## 2. Kategorie i czasy reakcji

Czas liczony od wpływu zgłoszenia. „Działanie” = usunięcie lub zablokowanie zasobu, zawieszenie
konta albo uzasadniona decyzja, że naruszenia nie ma.

| Kategoria | Przykłady | Potwierdzenie | Działanie |
| --- | --- | --- | --- |
| **P0 — krytyczne** | treści wykorzystujące małoletnich (CSAM), terroryzm, phishing, malware, C&C, atak wychodzący z naszej infrastruktury, zgłoszenie Hetznera | do 4 h | **do 24 h**; CSAM i terroryzm — niezwłocznie po weryfikacji, bez czekania na klienta |
| **P1 — pilne** | spam z konta klienta, otwarty przekaźnik SMTP/resolver, kopanie kryptowalut, wpis na RBL | do 24 h | do 48 h |
| **P2 — standard** | prawa autorskie i znaki towarowe, dane osobowe, zniesławienie, inne naruszenia AUP | do 24 h (dni robocze) | do 5 dni roboczych |

Poza godzinami pracy P0 obsługuje właściciel (telefon + powiadomienia z `abuse@`). Gdy nie da się
dotrzymać terminu Hetznera, najpierw zawieszamy zasób, potem wyjaśniamy.

## 3. Ścieżka zgłoszenia

1. **Rejestracja.** Sprawa toczy się w skrzynce `abuse@verris.pl` (webmail zespołu, SOGo), w folderach **Nowe → W toku → Zamknięte**, w jednym wątku na zgłoszenie; numer sprawy = data + kolejny numer (np. `2026-10-01/1`) w temacie. Działania w panelu (zawieszenie, kwarantanna, impersonacja) zostawiają ślad w dzienniku audytu. Panel nie zakłada dziś ticketu z maila ani w imieniu osoby trzeciej — do rozważenia po starcie, gdy zgłoszeń będzie więcej niż kilka w miesiącu.
2. **Potwierdzenie** do zgłaszającego (szablon A), w terminie z tabeli.
3. **Weryfikacja:** czy zasób jest u nas (domena → konto/usługa, IP → węzeł), czy zgłoszenie zawiera elementy z §17 ust. 2, czy naruszenie jest oczywiste. Zbieramy dowody: zrzut, nagłówki, logi, sumy kontrolne plików — przed jakąkolwiek zmianą.
4. **Decyzja** (kto decyduje: niżej). Środek proporcjonalny — najpierw pojedynczy plik/strona/skrzynka, całe konto tylko gdy to konieczne (§17 ust. 4).
5. **Wykonanie w panelu:**
   - zawieszenie usługi — admin: Subskrypcje → usługa → „Zawieś” (A-25), odwieszenie tamże (A-26);
   - blokada wysyłki poczty — admin: Dostarczalność → konto w kwarantannie (N-14, automatyczna przy przekroczeniu progów);
   - pojedynczy plik — menedżer plików (impersonacja klienta z banerem, ślad w audycie);
   - atak wychodzący — dodatkowo IOC/zapora hosta (`ops/scripts/security-control-plane-egress.sh`).
6. **Uzasadnienie dla klienta** (szablon B) — wymagane przez DSA art. 17 i §17 ust. 6: co, na jakiej podstawie, fakty, czy wykryto automatycznie, jak się odwołać (reklamacja §20). Wyjątek: organ zakazuje informowania.
7. **Odpowiedź zgłaszającemu** o decyzji (szablon C); dla Hetznera/CERT — szablon D.
8. **Zamknięcie** wątku notatką na końcu: kategoria, czasy, decyzja, podstawa; przeniesienie do „Zamknięte”. Zgłoszenia są danymi do sprawozdania DSA (liczba, kategorie, czasy) — nie usuwać.

## 4. Kto decyduje

| Decyzja | Kto |
| --- | --- |
| Zawieszenie zasobu/usługi w P0 | każdy operator z uprawnieniem — od razu, właściciel informowany |
| Zawieszenie w P1/P2, wypowiedzenie umowy | właściciel |
| Przekazanie informacji organom ścigania (§17 ust. 7), odpowiedź organowi | wyłącznie właściciel |
| Odwołanie klienta (reklamacja) | właściciel, inna osoba niż ta, która zawiesiła, jeśli to możliwe |

## 5. Szablony

**A — potwierdzenie przyjęcia (do zgłaszającego)**
> Dzień dobry, potwierdzamy otrzymanie zgłoszenia dotyczącego [adres/zasób] (nasz numer: [#]). Zweryfikujemy je i poinformujemy o decyzji. Jeśli zgłoszenie nie zawiera adresu URL lub uzasadnienia, prosimy o uzupełnienie. — Zespół Verris, abuse@verris.pl

**B — uzasadnienie decyzji (do klienta, DSA art. 17)**
> Dzień dobry, [data, godzina] [usunęliśmy / zablokowaliśmy dostęp do / zawiesiliśmy] [zasób] w usłudze [nazwa]. Powód: [opis treści lub działania]. Podstawa: Regulamin §16 ust. [x] [oraz przepis]. Fakty: [źródło zgłoszenia, data, co stwierdziliśmy]. [Naruszenie wykryto automatycznie / na podstawie zgłoszenia]. Możesz się odwołać, składając reklamację w Panelu (Wsparcie → Nowe zgłoszenie) albo na kontakt@verris.pl (Regulamin §20) — odpowiemy w ciągu 14 dni. — Zespół Verris

**C — decyzja (do zgłaszającego)**
> Dzień dobry, w sprawie zgłoszenia [#] z dnia [data]: [treść została usunięta / dostęp zablokowany / nie stwierdziliśmy naruszenia, ponieważ …]. — Zespół Verris

**D — odpowiedź dla Hetznera / CERT (EN)**
> Hello, regarding ticket [ID] for IP [x]: the affected service belongs to our customer. On [UTC time] we [suspended the account / removed the malicious files / blocked outbound traffic]. Root cause: [short]. Preventive measures: [short]. We will monitor the host for [n] days. — Verris abuse team, abuse@verris.pl

## 6. Test procedury

Przed publikacją regulaminu i potem raz na kwartał: wysłać zgłoszenie testowe z zewnętrznej skrzynki na
`abuse@verris.pl` i sprawdzić, że dociera do skrzynki, dostaje potwierdzenie w terminie P2 i zamknięcie z
decyzją. Wynik (data, czasy) dopisać do PB-04 na tablicy.
