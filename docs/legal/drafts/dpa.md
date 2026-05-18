# Umowa powierzenia przetwarzania danych osobowych (DPA)

> **DRAFT — wymaga lawyer review.** Zawierana między Klientem (administratorem danych osobowych przetwarzanych w ramach jego usługi hostowanej w Verris) a Verris (podmiotem przetwarzającym).
>
> Spełnia wymogi art. 28 RODO. Stanowi załącznik do Regulaminu świadczenia usług hostingowych Verris (w sytuacji, gdy Klient w ramach swojej usługi przetwarza dane osobowe osób trzecich — np. klienci sklepu internetowego Klienta hostowanego na Verris).

---

## §1. Strony

### Administrator (dalej: „Klient")

- Imię i nazwisko / nazwa firmy: `<wypełniane automatycznie z danych Klienta w Panelu>`
- Adres / siedziba: `<wypełniane automatycznie>`
- NIP: `<wypełniane automatycznie>`
- E-mail kontaktowy: `<wypełniane automatycznie>`

### Podmiot przetwarzający (dalej: „Verris")

- **`<TODO: pełna nazwa firmy>`**
- z siedzibą `<TODO: adres>`,
- wpisana do `<TODO: KRS / CEIDG>`,
- NIP `<TODO>`,
- reprezentowana przez `<TODO>`,
- e-mail w sprawach RODO: `rodo@verris.pl`.

## §2. Przedmiot, charakter i cel powierzenia

1. Klient powierza Verris przetwarzanie danych osobowych w celu świadczenia przez Verris usług hostingowych zgodnie z **Regulaminem świadczenia usług hostingowych Verris** oraz wybranym przez Klienta Planem.
2. Charakter powierzenia: **technical data processing** — Verris przechowuje, transferuje i udostępnia infrastrukturę dla danych Klienta, **nie analizuje ich treści**.
3. Powierzenie obejmuje wyłącznie czynności niezbędne do świadczenia usługi (przechowywanie plików, baz danych, wiadomości e-mail, snapshotów backupowych, logów technicznych).

## §3. Czas trwania powierzenia

1. Niniejsza Umowa wchodzi w życie z chwilą rozpoczęcia korzystania przez Klienta z Usług Verris.
2. Powierzenie trwa przez cały okres obowiązywania Regulaminu i wygasa wraz z rozwiązaniem umowy o świadczenie Usług.
3. Po wygaśnięciu powierzenia Verris postępuje z danymi osobowymi zgodnie z §10.

## §4. Rodzaj danych i kategorie osób

### 4.1 Rodzaj powierzanych danych osobowych

W zależności od charakteru działalności Klienta i treści, które zdecyduje się hostować, mogą to być:

- dane podstawowe (imię, nazwisko, adres e-mail, telefon),
- dane adresowe (ulica, miasto, kraj, kod pocztowy),
- dane finansowe (numer konta, NIP — jeśli Klient prowadzi sklep / księgowość),
- dane logowania użytkowników strony Klienta (zazwyczaj zahashowane hasła),
- treści generowane przez użytkowników (komentarze, zdjęcia, dokumenty),
- inne dane osobowe, które Klient zdecyduje się przechowywać i przetwarzać w ramach swojej usługi.

### 4.2 Kategorie osób, których dane są przetwarzane

- klienci końcowi Klienta (np. użytkownicy sklepu internetowego, czytelnicy bloga, członkowie społeczności),
- pracownicy i kontrahenci Klienta,
- inni podmioty, które wchodzą w interakcję z usługą Klienta.

### 4.3 Wyłączenia

Powierzenie **nie obejmuje** danych osobowych Klienta jako osoby fizycznej ani osób reprezentujących Klienta — te dane Verris przetwarza jako odrębny **administrator** na podstawie Polityki prywatności Verris.

## §5. Obowiązki Verris (podmiotu przetwarzającego)

Verris zobowiązuje się do:

1. **Przetwarzania danych wyłącznie na udokumentowane polecenie Klienta** (art. 28 ust. 3 lit. a RODO). Niniejsza Umowa stanowi takie polecenie. Każde dodatkowe polecenie Klient kieruje na e-mail `rodo@verris.pl` lub przez Panel.
2. **Zapewnienia poufności** osobom upoważnionym do przetwarzania danych (umowy o zachowaniu poufności z pracownikami, NDA z podwykonawcami).
3. **Wdrożenia odpowiednich środków technicznych i organizacyjnych** (art. 32 RODO), opisanych w **Załączniku 1** do niniejszej Umowy.
4. **Pomocy Klientowi w spełnianiu jego obowiązków** wynikających z RODO, w szczególności:
   - obsłudze żądań od osób, których dane dotyczą (art. 15-22 RODO),
   - zgłaszaniu naruszeń ochrony danych (art. 33-34 RODO),
   - przeprowadzaniu oceny skutków dla ochrony danych (art. 35 RODO).
5. **Zgłaszania Klientowi naruszenia ochrony danych** w czasie nieprzekraczającym **24 godzin** od stwierdzenia naruszenia, drogą e-mail na adres kontaktowy Klienta. Zgłoszenie zawiera: opis naruszenia, kategorie danych, kategorie i przybliżoną liczbę osób, prawdopodobne konsekwencje, środki zaradcze podjęte przez Verris.
6. **Korzystania z subprocessor'ów** wyłącznie w zakresie określonym w §7.
7. **Niewysyłania danych poza EOG** chyba że Klient wyrazi zgodę i zostaną wprowadzone odpowiednie zabezpieczenia (SCC, DPF).
8. **Zniszczenia lub zwrotu danych** po zakończeniu przetwarzania zgodnie z §10.
9. **Udostępnienia Klientowi informacji niezbędnych do wykazania zgodności** z RODO oraz **umożliwienia przeprowadzenia audytu** przez Klienta lub upoważnionego audytora — zgodnie z §9.

## §6. Środki bezpieczeństwa (art. 32 RODO)

Pełna lista w **Załączniku 1**. W skrócie:

- szyfrowanie w tranzycie (TLS 1.3),
- szyfrowanie wrażliwych pól w spoczynku (AES-256-GCM, klucz `APP_KMS_KEY` rotowany co 6 miesięcy),
- ścisła kontrola dostępu w oparciu o role (RBAC) oraz zasadę least-privilege,
- audyt każdego dostępu administratora do danych Klienta (`AuditLog`, retencja 12 miesięcy),
- wieloskładnikowe uwierzytelnianie wymagane dla kont wewnętrznych Verris (admin/staff),
- regularne backupy szyfrowane, retencja 30 dni, off-site,
- monitoring 24/7 zdarzeń bezpieczeństwa (`SecurityAlert`), własna procedura incident response,
- coroczne audyty bezpieczeństwa zewnętrzne (pen-test) — pierwszy planowany `<TODO>`,
- pracownicy Verris przeszkoleni z RODO, podpisali NDA.

## §7. Subprocessing (art. 28 ust. 2 RODO)

1. Klient wyraża **ogólną zgodę** na korzystanie przez Verris z dalszych podmiotów przetwarzających (subprocessors), niezbędnych do świadczenia Usługi.
2. Aktualna lista subprocessors jest publikowana i utrzymywana pod adresem `<TODO: URL subprocessors page>`. W szczególności:
   - **`<TODO: dostawca infrastruktury>`** (Hetzner / DigitalOcean / OVH — region EU): hosting fizycznych serwerów.
   - **`<TODO: SMTP provider>`** (Postmark / Resend / SES — region EU): wysyłka transakcyjnych e-maili wygenerowanych przez aplikacje Klienta (jeśli Klient korzysta z infrastruktury SMTP Verris).
   - **`<TODO: backup provider>`** (Backblaze B2 EU / AWS S3 EU): off-site backupy.
3. Verris **powiadomi Klienta z 30-dniowym wyprzedzeniem** e-mailem o planowanym wprowadzeniu nowego subprocessora lub zmianie istniejącego. Klient ma prawo zgłosić uzasadniony sprzeciw w tym terminie. W przypadku braku konsensusu Klient ma prawo wypowiedzieć Umowę bez konsekwencji.
4. Verris zapewnia, że każdy subprocessor podlega obowiązkom zgodnym z niniejszą Umową, w szczególności w zakresie środków bezpieczeństwa i ograniczeń terytorialnych.

## §8. Transfer poza EOG

1. Wszyscy subprocessors Verris działają na terytorium Europejskiego Obszaru Gospodarczego (EOG).
2. W przypadku konieczności transferu danych poza EOG (incydentalne sytuacje awaryjne lub zmiana subprocessora), Verris zastosuje:
   - **Standardowe Klauzule Umowne** (SCC) zatwierdzone przez Komisję Europejską (decyzja 2021/914),
   - dodatkowe środki techniczne wymagane przez orzeczenie TSUE *Schrems II* (np. szyfrowanie, pseudonimizacja),
   - **Data Privacy Framework** (DPF) jeśli odbiorca w USA jest certyfikowany.
3. Klient zostanie powiadomiony e-mailem o planowanym transferze poza EOG z 30-dniowym wyprzedzeniem.

## §9. Audyt

1. Klient ma prawo do **kontroli zgodności** Verris z niniejszą Umową raz w roku, na własny koszt, po uprzednim 14-dniowym powiadomieniu.
2. Audyt może być przeprowadzony:
   - poprzez przegląd dokumentacji udostępnionej przez Verris (raporty SOC 2, ISO 27001 — `<TODO: gdy zdobyte>`, raporty pen-testów),
   - poprzez wywiady z personelem Verris,
   - w wyjątkowych przypadkach — fizyczna wizyta w lokalizacji Verris (po koordynacji terminu).
3. Verris dołoży starań, aby audyt nie zakłócał ciągłości świadczenia Usług.
4. Wyniki audytu są poufne. Klient zobowiązuje się do nieprzekazywania ich osobom trzecim bez zgody Verris (poza organami nadzoru).

## §10. Po zakończeniu przetwarzania

1. Po zakończeniu Umowy o świadczenie Usług (dobrowolnym lub wymuszonym):
   - Verris **przez 30 dni** zachowuje dane Klienta umożliwiając ich odzyskanie (eksport ZIP poprzez `<TODO: procedure>`).
   - Po 30 dniach Verris **trwale usuwa** wszystkie dane Klienta z aktywnej infrastruktury i backupów rolling.
   - Backupy off-site z okresem retencji powyżej 30 dni są nadpisywane zgodnie z polityką rotacji (max 90 dni do ostatecznego usunięcia).
2. Verris zachowuje:
   - Faktury VAT wystawione Klientowi (5 lat — obowiązek podatkowy).
   - Audit log dotyczący własnych operacji Verris (12 miesięcy).
3. Po usunięciu Verris wystawia, na żądanie Klienta, **certyfikat zniszczenia** drogą e-mail.

## §11. Odpowiedzialność

1. Strony ponoszą wzajemną odpowiedzialność na zasadach określonych w art. 82 RODO i przepisach Kodeksu cywilnego.
2. Odpowiedzialność Verris ograniczona jest jak w **Regulaminie świadczenia usług hostingowych** (§11) z zastrzeżeniem przepisów bezwzględnie obowiązujących.

## §12. Postanowienia końcowe

1. Niniejsza Umowa stanowi integralną część Regulaminu świadczenia usług hostingowych Verris.
2. Wszelkie zmiany Umowy wymagają formy elektronicznej (akceptacja w Panelu).
3. W sprawach nieuregulowanych zastosowanie ma RODO, ustawa o ochronie danych osobowych z 10 maja 2018 r. oraz Kodeks cywilny.
4. Językiem Umowy jest język polski. Wersja angielska może zostać sporządzona na żądanie Klienta — w razie sporu rozstrzygająca jest wersja polska.
5. Spory rozstrzyga sąd właściwy dla siedziby Verris.

---

## Załącznik 1 — Środki techniczne i organizacyjne

### Środki techniczne

| Obszar | Środek |
| --- | --- |
| Szyfrowanie | TLS 1.3, AES-256-GCM dla danych wrażliwych w spoczynku |
| Hashing haseł | bcrypt (cost 12) |
| Uwierzytelnianie | JWT, refresh tokens, opcjonalne 2FA dla Klienta, wymagane 2FA dla operatorów Verris |
| Kontrola dostępu | RBAC (USER/STAFF/ADMIN), zasada least-privilege |
| Logging | Audit log każdej operacji administratora, retencja 12 miesięcy |
| Backupy | Codzienny snapshot Postgres + plików, retencja 30 dni, szyfrowane, off-site |
| Monitoring | 24/7 detekcja anomalii (`SecurityAlert`), zewnętrzny status page |
| Sieć | Private network między API a bazą, firewall na poziomie compose i hosta |

### Środki organizacyjne

| Obszar | Środek |
| --- | --- |
| Zatrudnienie | NDA podpisane przez wszystkich pracowników i kontrahentów |
| Szkolenia | Roczne szkolenie RODO dla całego zespołu |
| Procedury | Incident response (`<TODO: link do dokumentu>`), data breach (24h notification) |
| Ocena ryzyka | Rejestr czynności przetwarzania (RoP), DPIA dla wysokorisk |
| Audyt | Roczny pen-test zewnętrzny, kwartalny przegląd uprawnień |

### Środki dostępu fizycznego

Verris nie posiada własnej infrastruktury fizycznej — fizyczna infrastruktura jest powierzona subprocessorowi `<TODO: dostawca>`, który posiada certyfikaty ISO 27001 / SOC 2 / odpowiednie poświadczenia bezpieczeństwa centrum danych. Verris regularnie weryfikuje aktualność tych certyfikatów.

---

**Wersja: DRAFT 0.1 (Sprint 0)**
**Data: maj 2026**
**Lawyer review status: pending**
