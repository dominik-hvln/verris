# Dokumenty prawne Verris 1.3.0 → 1.4.0 – lista zmian i publikacja

> **Status: do publikacji · 2026-11-19 (paczka 133) · nic nie jest opublikowane.**
> Jedna publikacja Regulaminu, Polityki prywatności, Polityki cookies i Umowy powierzenia (DPA) w wersji 1.4.0
> (`ops/scripts/prod-legal-publish-live.sh` → `prod-legal-publish-draft-review.sh` publikuje wszystkie cztery pliki
> z tym samym numerem). Powód: Kreator marki w cenie Hostingu oraz jednorazowe zakupy Pakiet marki i Kolejna marka –
> nowe funkcje (§24 ust. 1 Regulaminu: „wprowadzenie nowych Usług lub funkcji”). Wersja 1.3.0 opublikowana
> 10.11.2026 zostaje w bazie jako archiwum.
>
> Decyzja właściciela z 19.11.2026: „dokumenty mogę śmiało publikować” – bez zewnętrznego prawnika (tak jak 1.3.0,
> decyzja 3.11). Projekt `DO_ZATWIERDZENIA_kreator-marki.md` jest wbudowany; jego punkty [PRAWNIK]/[DECYZJA]
> rozstrzygnięto wariantem najbezpieczniejszym dla Verris i uczciwym dla klienta – część C.
>
> To nie jest porada prawna. Część A jest dla klientów (mail i pole „Zmiany”), część B dla operatora, część C –
> rozstrzygnięcia i ryzyka bez prawnika, część D – mapa dokument ↔ kod.

---

## A. Co się zmienia – dla klientów

### A.1 Tekst maila do klientów (ponowna akceptacja)

**Temat:** Kreator marki – nowe wersje regulaminu i polityki prywatności (1.4.0)

> Cześć,
>
> od [DATA PUBLIKACJI] obowiązują nowe wersje dokumentów Verris: Regulaminu, Polityki prywatności, Polityki
> cookies i Umowy powierzenia danych (wersja 1.4.0). Przy najbliższym logowaniu poprosimy Cię o akceptację
> Regulaminu i potwierdzenie zapoznania się z Polityką prywatności. Zmiany dotyczą nowego Kreatora marki:
>
> - **Kreator marki w cenie hostingu** – opisujesz firmę, AI proponuje kierunki logo, a Ty dopracowujesz wybrany
>   i pobierasz pliki: logo, kolory, kroje, favicon i stopkę e-mail. W okresie próbnym hostingu projektujesz
>   i oglądasz podgląd; pliki pobierzesz po opłaceniu hostingu.
> - **Pakiet marki i kolejna marka** – płatne jednorazowo, bez abonamentu. Udostępniamy je od razu po zapłacie,
>   dlatego przy zakupie prosimy o zgodę na to i potwierdzenie, że w tym zakresie tracisz prawo odstąpienia od
>   umowy. Potwierdzenie zgody wysyłamy e-mailem. Od umowy hostingu odstąpisz jak dotąd.
> - **Prawa do logo** – do pobranego logo i materiałów dostajesz bezterminową licencję: możesz ich używać w firmie,
>   zmieniać je, przekazać drukarni czy agencji i zgłosić logo jako znak towarowy. Licencji nie wypowiemy.
> - **Uczciwie o znaku towarowym** – logo z kreatora nie jest znakiem zastrzeżonym. Nie sprawdzamy rejestrów znaków
>   i nie gwarantujemy, że podobnego znaku nikt nie używa – przed drukiem i zgłoszeniem sprawdź znak w TMview.
>   Pokażemy Ci, jak to zrobić.
> - **AI i Twoje dane** – propozycje przygotowuje model AI Anthropic (już na liście podprocesorów). Przekazujemy mu
>   opis firmy, Twoje polecenia i – gdy wgrywasz logo – jego obraz. Danych z wizytówki i stopki e-mail do AI nie
>   wysyłamy; te dane przetwarzamy na Twoje polecenie (Umowa powierzenia §2 ust. 6). Pliki logo mają w metadanych
>   informację, że powstały z pomocą AI.
>
> Pełne teksty i porównanie z poprzednimi wersjami znajdziesz w panelu: Dokumenty prawne → Historia wersji. Jeśli nie
> akceptujesz zmian, możesz wypowiedzieć umowę bez kosztów – niewykorzystaną część opłat zwrócimy proporcjonalnie
> (Regulamin §24 ust. 3).
>
> Zespół Verris

### A.2 Pole „Zmiany” przy publikacji

**Regulamin (TERMS) 1.4.0**
```
- Kreator marki w cenie Hostingu oraz jednorazowe zakupy Pakiet marki i Kolejna marka (§1 pkt 6 i 18–24, §10 ust. 3, nowy §13b).
- Licencja niewyłączna i nieodwołalna na pobrane logo i materiały, z prawem do zmian i zgłoszenia znaku towarowego (§13b ust. 4–6).
- Bez gwarancji unikalności i zdolności rejestrowej znaku; sprawdzenie w TMview (§13b ust. 8–10).
- Utrata prawa odstąpienia przy Pakiecie marki i Kolejnej marce za wyraźną zgodą, z potwierdzeniem e-mailem (§13b ust. 13, §21 ust. 5).
```

**Polityka prywatności (PRIVACY) 1.4.0**
```
- Nowy pkt 2.13 – dane w Kreatorze marki: brief, polecenia, wgrane logo, dane do wizytówki i stopki, potwierdzenia z datą.
- Anthropic także dla Kreatora marki, w tym obraz wgranego logo; dane z wizytówki i stopki nie trafiają do AI (pkt 5.1).
- Cel, podstawa i okresy przechowywania Kreatora marki (pkt 4); usunięcie danych marek z kontem (pkt 7).
```

**Polityka cookies (COOKIES) 1.4.0**
```
- Bez zmian merytorycznych – numer wersji wspólny dla wszystkich dokumentów. Kreator marki nie zapisuje cookies ani danych w pamięci przeglądarki.
```

**Umowa powierzenia (DPA) 1.4.0**
```
- Dane osób wpisane do wizytówki i stopki e-mail w Kreatorze marki w zakresie powierzenia (§2 ust. 2 i 6, §4 ust. 1).
- Załącznik 2: Anthropic nie otrzymuje danych z wizytówki i stopki; Hetzner – magazyn plików także z logo z Kreatora marki.
```

### A.3 Pełna lista zmian (dla operatora i do Historii wersji)

**Regulamin 1.4.0** (`terms.md`) – wzorem wprowadzenia §13a w 1.3.0:
- Nagłówek i stopka: 1.4.0; „Wersja 1.4.0 zastępuje wersję 1.3.0 z 10 listopada 2026 r.” (data publikacji 1.3.0 –
  `claude/paczka-109-stan.md`: „dokumenty 1.3.0 opublikowane 10.11”).
- §1 pkt 6 – Usługi: „Hosting … wraz z Verris Kreatorem (§13a) i Kreatorem marki (§13b)” oraz „Pakiet marki i Kolejna
  marka (§13b)”.
- §1 pkt 18–24 (nowe definicje): Kreator marki, Logo, Materiały, Biblioteka, Wydany Wariant, Pakiet marki, Kolejna marka.
- §10 ust. 3 – w ramach Hostingu także Kreator marki (§13b).
- §13b (nowy, 17 ustępów):
  - ust. 1 – w cenie Hostingu, niezależnie od Kreatora Pro, limity „opisane w Panelu”; okres próbny: propozycje, edycja
    i podgląd tak, pliki, stopka e-mail i użycie na opublikowanej stronie po opłaceniu Hostingu (decyzja 19.11);
  - ust. 2 – trzy ścieżki (nowa marka, wgrane logo, odświeżenie), Biblioteka + AI, bez ręcznego projektowania;
  - ust. 3 – Pakiet marki (jeden na Konto) i Kolejna marka: treści cyfrowe, cena i zakres „Panel wskazuje przed
    zakupem (Cennik, §9)” – bez kwot, jak §13a ust. 9–10; nie Subskrypcja; tylko przy opłaconym Hostingu; pula bez
    terminu ważności, przy działającym Hostingu;
  - ust. 4–6 – licencja niewyłączna na Wydany Wariant (pola eksploatacji, opracowania, dalsze licencje, rejestracja
    znaku), nieodwołalna, zobowiązanie do niewykonywania praw (także do Biblioteki), elementy z AI, brak gwarancji
    ochrony autorskiej (C.1 pkt 1–5);
  - ust. 7 – Biblioteka zostaje przy Verris;
  - ust. 8 – podobne znaki: rejestr odcisków jako wewnętrzny mechanizm, bez zobowiązania (decyzja 19.11);
  - ust. 9–10 – brak gwarancji rejestrowej, TMview, potwierdzenie przed plikami do druku; zastrzeżenie dla konsumentów,
    ograniczenie tylko wobec pozostałych Klientów (C.1 pkt 7);
  - ust. 11 – brief i polecenia (znane marki odrzucane przed AI, bez zużycia limitu);
  - ust. 12 – wgrane logo: oświadczenie z datą, zwolnienie z roszczeń tylko B2B (C.1 pkt 8);
  - ust. 13 – prawo odstąpienia przy Pakiecie marki i Kolejnej marce (art. 38 ust. 1 pkt 13 upk), zgoda wymagana,
    potwierdzenie e-mailem (C.1 pkt 9 – kod dopisany w paczce 133);
  - ust. 14 – oznaczenie AI w metadanych (AI Act bez przesądzania statusu Verris, C.1 pkt 11);
  - ust. 15 – kroje SIL OFL 1.1;
  - ust. 16 – dane w Materiałach: Verris jako podmiot przetwarzający (DPA §2 ust. 6), nie do AI;
  - ust. 17 – usunięcie marki, koniec Hostingu, odcisk kształtu bez powiązania, bez rekompensat §15.
- §19 ust. 2 – przykład danych powierzonych: osoby wpisane do wizytówki lub stopki e-mail w Kreatorze marki.
- §21 – nowy ust. 5 (Pakiet marki i Kolejna marka → §13b ust. 13), dotychczasowy ust. 5 (zwrot płatności) jako ust. 6,
  ust. 1 „z zastrzeżeniem ust. 3–5”. Do §21 ust. 5 nic w kodzie i dokumentach nie odsyłało.
- §24 – bez zmian: nowe funkcje mieszczą się w katalogu ust. 1 (C.1 pkt 15).

**Polityka prywatności 1.4.0** (`privacy.md`): nagłówek (zastępuje 1.3.0 z 10.11.2026); nowy pkt 2.13 Kreator marki
(dane briefu, polecenia, wgrane logo, dane do wizytówki i stopki, liczniki, zakupy, potwierdzenia z datą; Anthropic
z obrazem wgranego logo, bez danych z wizytówki i stopki; pliki do pobrania tworzone na żądanie; rola administratora
i podmiotu przetwarzającego; odcisk kształtu po usunięciu bez powiązania); pkt 3 – dane z wizytówki i stopki jako
powierzenie; pkt 4 – nowy wiersz „Kreator marki” (lit. b; potwierdzenia lit. c i f; okresy – C.1 pkt 13); pkt 5.1 –
Hetzner (logo wgrane w Kreatorze marki), Anthropic (Kreator marki, obraz wgranego logo); pkt 7 – marki, wgrane pliki
i dane do wizytówki usuwane z kontem, zakupy zostają jako rozliczenia; pkt 8 – automatyczne odrzucenie briefu
i podobnego znaku to reguły jakości bez skutków prawnych.

**Polityka cookies 1.4.0** (`cookies.md`): tylko numer wersji. Sprawdzone w kodzie: panel Kreatora marki
(`apps/client-panel/src/app/dashboard/kreator-marki/**`, `lib/kreator-marki.ts`, trasy `app/api/kreator-marki/**`)
i strona `verris.pl/kreator-marki` nie używają `localStorage`/`sessionStorage` ani cookies; API modułu
(`apps/api/src/kreator-marki/**`) nie ustawia cookies (pliki publiczne – token w adresie).

**DPA 1.4.0** (`dpa.md`): §2 ust. 2 – charakter przetwarzania w Kreatorze marki; nowy §2 ust. 6 – dane wpisane do
wizytówki, stopki e-mail i innych materiałów (przechowywanie, pliki na żądanie bez przechowywania, bez AI, usunięcie
z marką albo kontem); §4 ust. 1 – nowa pozycja „dane pracowników i współpracowników Klienta wpisane do wizytówki
i stopki e-mail” (kategoria osób „pracownicy i współpracownicy Klienta” już jest w §4 ust. 2); Załącznik 2 – Hetzner
(logo wgrane w Kreatorze marki), Anthropic (bez danych z wizytówki i stopki; brief, polecenia i obraz logo jako dane
administratora – Polityka pkt 2.13). Lista dalszych podmiotów bez zmian.

**Poza publikacją w panelu (pliki w repo):** `subprocessors.md` 1.4.0 (Hetzner – logo w MinIO, Anthropic – Kreator
marki: cel i zakres danych z obrazem logo), `../consumer-info.md` 1.4.0 (główne cechy: Kreator marki, Pakiet marki
i kolejna marka; wyjątek 3 od prawa odstąpienia), `DO_ZATWIERDZENIA_kreator-marki.md` oznaczony „WBUDOWANE w 1.4.0”.

**Kod (paczka 133):**
- `apps/api/src/kreator-marki/zakup-marki.ts` + `mail/templates/kreator-marki-notifications.ts` – e-mail „Potwierdzenie
  zakupu – Pakiet marki / Kolejna marka w Kreatorze marki” po udostępnieniu zakupu (przejście OCZEKUJE → OPLACONY,
  dokładnie raz; portfel, karta i Paynow): chwila zgody i udostępnienia (czas polski), cena, zakres Pakietu, utrata
  prawa odstąpienia z odesłaniem do §13b ust. 13 i §21 ust. 5, dane sprzedawcy, faktury, licencja, reklamacje, link do
  Regulaminu. Przed paczką 133 zgoda była tylko w bazie i dzienniku – bez trwałego nośnika prawo odstąpienia nie
  wygasało (C.1 pkt 9). Test: `kreator-marki/zakup-marki-potwierdzenie.spec.ts` (czerwony na starym kodzie).
- `apps/client-panel/src/lib/kreator-marki.ts` – komunikaty z odesłaniami do §13b (ostrzeżenie: ust. 9–10, TMview:
  ust. 8–10, wgrane logo: ust. 12, zgoda: ust. 13, eksport: ust. 14 i licencja ust. 4–6); zgoda mówi „z chwilą
  udostępnienia” (jak art. 38 ust. 1 pkt 13) i zapowiada e-mail.
- Resztki obietnicy unikalności, których paczka 132 nie objęła: księga znaku PDF (`libs/kreator/src/marka/ksiega.ts`:
  „Verris nie wydaje tego samego znaku … innej firmie”), `CZYTAJ.txt` w ZIP (`generator-plikow.ts`: „Sprawdzenie
  w Verris dotyczy tylko znaków wydanych…”), artykuł pomocy „Logo a znak towarowy” (`cli/seed-kb-cms.ts`: „nie wyda tego
  samego znaku dwóm firmom”) – zastąpione brakiem gwarancji; dopisana informacja o licencji (§13b ust. 4–6).
- `apps/www/src/app/(frontend)/kreator-marki/page.tsx` – FAQ: płatne są Pakiet marki i kolejna marka (było „tylko
  Pakiet”), nowe pytania „Do kogo należą prawa do logo?” i „Czy mogę odstąpić od zakupu Pakietu marki?”.
- Testy: nowy `apps/api/src/test/dokumenty-prawne-1-4-0.spec.ts` (wersja, detektor admina, §13b, odesłania, panel ↔
  ustępy, licencja niewyłączna, brak obietnicy unikalności, konsument, kod okresu próbnego i zakupu, Polityka,
  usunięcie konta, DPA §2 ust. 6); `dokumenty-prawne-1-3-0.spec.ts` bez numeru bieżącej wersji (jak 1.2.0 w 1.3.0).

---

## B. Publikacja – instrukcja dla operatora

Kolejność ma znaczenie: dokumenty 1.4.0 obiecują e-mail z potwierdzeniem zgody (paczka 133) i opisują Kreator marki
z paczek 130–132. Bez wdrożenia kodu nie publikować. Moduł zostaje wyłączony, dopóki dokumenty nie są opublikowane
(ekran admina ostrzega, a `verris.pl/kreator-marki` zwraca 404).

### B.1 Push i wdrożenie paczek 127–133 (Mac, Dominik)
1. Nałóż paczkę 133 na Macu tak jak poprzednie (paczki 127–132 są już nałożone – nie nakładaj ich drugi raz).
   Sprawdź, że ostatni commit to „Paczka 133”, a drzewo jest czyste:
```bash
git log --oneline -8
git status --short
```
2. Wypchnij `main` – GitHub Actions przejdzie bramki i wdroży obrazy (`ops/scripts/prod-deploy-ghcr.sh`, w tym
   migrację Kreatora marki `20261119180000_kreator_marki` z paczki 131 przez `prisma migrate deploy`):
```bash
git push origin main
```
3. Poczekaj na zielony przebieg wdrożenia w GitHub Actions (health-check `/healthz`; przy błędzie skrypt sam wraca
   do ostatniego dobrego obrazu – wtedy nie publikuj).

### B.2 Sprawdzenie serwera przed publikacją
1. Na control-plane repo musi mieć teksty 1.4.0 (skrypt publikacji czyta pliki z `/opt/verris/docs/legal/drafts`):
```bash
cd /opt/verris
git log --oneline -1
grep -m1 "Wersja" docs/legal/drafts/terms.md
grep -m1 "Wersja" docs/legal/drafts/privacy.md
```
   Oczekiwane: commit paczki 133 i `**Wersja 1.4.0 · obowiązuje od [DATA PUBLIKACJI]**`. Jeśli widać 1.3.0 – najpierw
   zaktualizuj repo na serwerze (`git pull --ff-only`), nie publikuj starych plików.
2. Kto zaakceptował 1.3.0 (publikacja od razu zakłada, że zmiany tylko dodają funkcje – C.1 pkt 15). Otwórz `psql`
   w kontenerze bazy i wklej zapytanie; wynik zapisz w notatce publikacji:
```bash
cd /opt/verris && docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```
```sql
SELECT u.email, c."documentVersion", c."grantedAt"
FROM "UserConsent" c JOIN "User" u ON u.id = c."userId"
WHERE c."documentKind" IN ('TERMS', 'DPA') AND c."withdrawnAt" IS NULL
ORDER BY c."grantedAt";
```
   Jeśli są prawdziwi klienci, publikacja i tak może wejść od razu (zmiany dodają funkcje), ale mail z A.1 wyślij
   tego samego dnia.
3. Kopia bazy przed publikacją (publikacja zmienia `isCurrent` i wymusza ponowną akceptację) – tak jak przy 1.3.0,
   zwykłą procedurą kopii platformy (`prod-env-backup.sh` + zrzut Postgresa).

### B.3 Publikacja (skrypt, wszystkie cztery dokumenty naraz)
Ten sam skrypt i te same zmienne co przy 1.3.0 (`LEGAL_LIVE_VERSION`, `LEGAL_CHANGELOG`):
```bash
cd /opt/verris && LEGAL_LIVE_VERSION=1.4.0 LEGAL_CHANGELOG="Wersja 1.4.0 – Kreator marki w cenie hostingu, Pakiet marki i kolejna marka (Regulamin §13b): licencja na pobrane logo i materiały, brak gwarancji znaku towarowego i sprawdzenie w TMview, utrata prawa odstąpienia przy Pakiecie marki za zgodą potwierdzaną e-mailem (§13b ust. 13, §21 ust. 5); dane w Kreatorze marki (Polityka prywatności pkt 2.13); dane z wizytówki i stopki w umowie powierzenia (DPA §2 ust. 6). Polityka cookies bez zmian merytorycznych." ./ops/scripts/prod-legal-publish-live.sh
```
Skrypt podstawia datę w miejsce `[DATA PUBLIKACJI]`, odmawia publikacji przy `[UZUPEŁNIĆ…]`/`[TODO…]` i nie nadpisze
istniejącej wersji 1.4.0 inną treścią. Wariant z osobnymi „Zmianami” (A.2) – panel admina → RODO, jak
w `ZMIANY_1.1.0-1.2.0.md` B.3, z numerem 1.4.0 (kolejność: DPA i COOKIES, potem PRIVACY, na końcu TERMS).

### B.4 Smoke po publikacji (ten sam dzień)
1. Strony dokumentów pokazują 1.4.0 z dzisiejszą datą (jeśli `curl` nic nie zwraca, bo strona renderuje się
   w przeglądarce – sprawdź te same adresy w przeglądarce):
```bash
for d in terms privacy cookies dpa; do curl -s https://panel.verris.pl/legal/$d | grep -o "Wersja 1.4.0[^<]*" | head -1; done
```
2. Konto testowe: po zalogowaniu okno ponownej akceptacji pokazuje Regulamin i Politykę 1.4.0 z polem „Zmiany”;
   po akceptacji w Ustawienia → Prywatność i dane („Twoje zgody”) widać 1.4.0 (numer w treści = numer w zgodach).
3. `/legal/terms` – jest „§13b. Kreator marki, Pakiet marki i Kolejna marka” i §21 ust. 6 „Zwrot płatności”.

### B.5 Włączenie Kreatora marki (Admin → Wiedza i AI → Kreator marki, `/settings/kreator-marki`)
1. Ostrzeżenie o dokumentach znika („Regulamin (1.4.0) i Polityka prywatności (1.4.0)…” – detektor
   `DOKUMENT_Z_KREATOREM_MARKI`). Jeśli dalej widać 1.3.0 – publikacja się nie udała, nie włączaj.
2. Sprawdź konfigurację: ceny Pakietu marki i kolejnej marki, limity w cenie hostingu, model AI, klucz Anthropic;
   **„Pakiet marki w Kreatorze Pro rocznym” zostaje wyłączony** (decyzja 19.11 – marka niezależna od Pro; C.1 pkt 6).
3. Dostępność: **„Wszyscy klienci z hostingiem”**, włącznik **Włączony** → Zapisz.
4. `https://verris.pl/kreator-marki` odpowiada 200 (strona pobiera ofertę z API – może potrwać do kilku minut):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://verris.pl/kreator-marki
```
5. Zakup testowy na koncie testowym z opłaconym hostingiem: Kreator marki → Pakiet marki → płatność z portfela,
   z zaznaczoną zgodą. Oczekiwane: Pakiet aktywny i e-mail „[Verris] Potwierdzenie zakupu – Pakiet marki” z datą zgody
   i odesłaniem do §13b ust. 13. W adminie (dziennik wysyłek) wpis z tagiem `kreator-marki.zakup` i statusem wysłania.
   Zakup testowy rozlicz zwykłą korektą jak inne testy na produkcji.

### B.6 Pomoc i szablony odpowiedzi
1. Odśwież szkice artykułów pomocy (seed jest idempotentny – nowe teksty z paczki 133, w tym „Prawa do logo”,
   trafiają do szkiców napisanych przez „Zespół Verris”; ręcznych edycji w CMS nie nadpisuje):
```bash
cd /opt/verris && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api /usr/local/bin/api-entrypoint.sh node apps/api/dist-cli/cli/seed-kb-cms.js
```
2. Admin → Baza wiedzy (`/knowledge-base`): opublikuj 8 szkiców z kategorii „Kreator stron” o Kreatorze marki („Jak
   stworzyć logo w Kreatorze marki”, „Mam już logo – materiały Key Visual”, „Odświeżenie logo”, „Pliki logo – który do
   czego…”, „Druk: wizytówka i CMYK”, „Logo a znak towarowy – TMview krok po kroku”, „Stopka e-mail z logo”, „Marka na
   stronie z Kreatora stron”). Liczby w artykułach to ceny i limity domyślne – jeśli w B.5 pkt 2 są inne, popraw je
   w CMS przed publikacją.
3. Szablony odpowiedzi (dodaje brakujące, nieaktywne; istniejących nie zmienia):
```bash
cd /opt/verris && bash ops/scripts/prod-seed-canned.sh
```
4. Admin → Ustawienia → Szablony odpowiedzi (`/settings/canned-responses`): włącz trzy szablony „Kreator marki – …”
   (prośba o zmianę logo, logo „jak znana marka”, drukarnia / CMYK).

### B.7 Mail do klientów
Wyślij mail z A.1 (z datą publikacji) do wszystkich aktywnych kont – tym samym kanałem co przy 1.3.0.

---

## C. Rozstrzygnięcia i ryzyka (bez prawnika)

### C.1 Rozstrzygnięcia – każde z uzasadnieniem

1. **Licencja niewyłączna zamiast przeniesienia praw albo licencji wyłącznej (§13b ust. 4).** Przeniesienie
   autorskich praw majątkowych (art. 53 pr. aut.) i licencja wyłączna (art. 67 ust. 5) wymagają formy pisemnej pod
   rygorem nieważności, a akceptacja Regulaminu w Panelu jej nie spełnia (art. 78 i 78¹ k.c. – podpis własnoręczny
   albo kwalifikowany). Licencja niewyłączna nie wymaga formy szczególnej, więc jest skuteczna przez akceptację.
   Wyłączność kłóciłaby się też z decyzją 19.11 o braku gwarancji unikalności. Pola eksploatacji są wymienione
   (art. 41 ust. 2), zgoda na opracowania (art. 46) i dalsze licencje (art. 67 ust. 3) – wprost, bo bez nich
   klient nie mógłby dać pliku drukarni ani agencji, a zgłoszenie i rejestracja znaku towarowego są polem eksploatacji.
2. **Nieodwołalność (§13b ust. 5).** Licencja na czas nieoznaczony, a Verris zrzeka się wypowiedzenia z art. 68 pr.
   aut. (licencja dłuższa niż 5 lat staje się licencją na czas nieoznaczony i co do zasady można ją wypowiedzieć).
   Bez wyjątku „naruszenie Regulaminu”: Verris nie potrzebuje odbierać logo, a odebranie znaku, pod którym klient
   prowadzi firmę, byłoby nieproporcjonalne i wobec konsumenta podważalne. Zabezpieczenie na wypadek, gdyby
   zrzeczenie się wypowiedzenia uznano za nieskuteczne: zobowiązanie do niewykonywania wobec klienta praw do Wydanego
   Wariantu i do Biblioteki w zakresie, w jakim wariant z niej korzysta (umowa o niedochodzenie roszczeń).
3. **Umowa pisemna na żądanie – pominięta.** (a) Przeniesienie praw do wariantu będącego opracowaniem szablonu
   z Biblioteki wymaga, by Verris miał te prawa z umowy z autorem Biblioteki z odpowiednimi polami (C.2 pkt 2) –
   obietnica w Regulaminie wyprzedzałaby to, co Verris może dać; (b) wyłączność kłóci się z brakiem gwarancji
   unikalności (podobny wariant może dostać inny klient); (c) każda umowa to ręczna obsługa z podpisem
   kwalifikowanym. Licencja z ust. 4–5 plus rejestracja znaku towarowego dają klientowi ochronę oznaczenia (prawo
   ochronne na znak nie zależy od praw autorskich). Gdy klient zapyta – indywidualnie, poza Regulaminem, po
   sprawdzeniu praw do Biblioteki.
4. **Elementy z AI i brak gwarancji utworu (§13b ust. 6).** Verris nie twierdzi, że wariant jest utworem (art. 1
   ust. 1 pr. aut. – twórca-człowiek); do elementów wygenerowanych w całości przez AI nie rości sobie praw, a gdyby mu
   przysługiwały – obejmuje je licencja. Uczciwa informacja zamiast obietnicy ochrony, której nikt nie zapewni.
5. **Chwila udzielenia licencji = „Wydany Wariant” (§1 pkt 22).** Pobranie plików albo użycie na opublikowanej stronie
   z Kreatora – w obu przypadkach po opłaceniu Hostingu. Spójne z decyzją 19.11 (w okresie próbnym propozycje, edycja
   i podgląd tak, pliki i użycie po opłaceniu) i z kodem (`blokadaPliku` → `PROBA`, publikacja strony w próbie
   zablokowana). Podgląd w próbie nie daje licencji.
6. **Marka niezależna od Kreatora Pro; ceny bez kwot (§13b ust. 1 i 3).** Jak §13a ust. 9–10 w 1.3.0: zakres, limity
   i cena „wskazane w Panelu przed zakupem (Cennik, §9)” – ceny zmienia admin bez wdrożenia, a Regulamin się nie
   rozjedzie. „Niezależnie od abonamentu Kreator Pro” jest prawdziwe także wtedy, gdyby admin włączył Pakiet w Pro
   rocznym (to byłaby korzyść dla klienta), ale decyzja 19.11 każe ten przełącznik zostawić wyłączony (B.5 pkt 2).
   Pakiet jest na Konto (kod: `pakietyKonta`, jeden opłacony Pakiet na Konto), nie „dla jednej marki” jak w projekcie.
7. **Odpowiedzialność wobec konsumentów (§13b ust. 10).** Ust. 6 i 8–10 opisują zakres usługi (co Kreator robi, a czego
   nie), a nie wyłączają odpowiedzialności; wprost: nie ograniczają odpowiedzialności wobec Konsumenta i JDG na prawach
   konsumenta, w tym za zgodność treści cyfrowej z umową (rozdział 5b upk) – bez tego zastrzeżenia zdania o „braku
   gwarancji” mogłyby być uznane za klauzule niedozwolone (art. 385¹ i 385³ pkt 2 k.c., art. 385⁵ dla JDG).
   Wyłączenie odpowiedzialności za zdolność rejestrową i podobieństwo – tylko wobec pozostałych Klientów, z wyjątkiem
   szkody umyślnej (art. 473 § 2 k.c.), w granicach §18 ust. 3. Potwierdzenie TMview to potwierdzenie zapoznania się
   z informacją, a nie przejęcie ryzyka przez konsumenta.
8. **Wgrane logo (§13b ust. 12).** Oświadczenie o prawach – od wszystkich; zwolnienie z roszczeń osób trzecich – tylko
   od Klientów niebędących konsumentami ani JDG na prawach konsumenta (wobec konsumenta takie zwolnienie mogłoby być
   abuzywne). Konsument odpowiada na zasadach ogólnych. Licencja z ust. 4–6 nie obejmuje cudzego, wgranego logo –
   tylko to, co przygotował Kreator.
9. **Prawo odstąpienia (§13b ust. 13, §21 ust. 5) i e-mail z potwierdzeniem.** Pakiet marki i Kolejna marka to treść
   cyfrowa niedostarczana na nośniku materialnym; prawo odstąpienia wygasa (art. 38 ust. 1 pkt 13 upk) przy wyraźnej
   i uprzedniej zgodzie, informacji o utracie prawa i potwierdzeniu na trwałym nośniku (art. 21 ust. 1). Sprawdzone
   w kodzie: zgoda była wymagana i zapisana (`zgodaTresciCyfrowejAt`, `BRAK_ZGODY`, wpis w dzienniku), ale **e-maila nie
   było** – bez niego prawo odstąpienia by nie wygasło. Dopisane w paczce 133 (A.3 „Kod”), z testem. Zgoda jest
   warunkiem zakupu („bez tej zgody Panel nie przyjmuje zamówienia”) – jak oświadczenie przy domenie (§12 ust. 8),
   zamiast wariantu „bez zgody dostęp po 14 dniach”, którego kod nie ma i który komplikuje rozliczenie puli. Zgody
   zbieramy od wszystkich kupujących (kod nie rozróżnia konsumentów), Regulamin wymaga jej od Konsumenta i JDG.
   Tekst checkboxa poprawiony z „po rozpoczęciu dostarczania” na „z chwilą udostępnienia” (treść jednorazowa –
   udostępnienie = spełnienie świadczenia), z odesłaniem do §13b ust. 13 i zapowiedzią e-maila.
10. **Odstąpienie od Hostingu a pobrane logo (§13b ust. 5 zd. ostatnie).** Konsument może odstąpić od Hostingu w 14
    dni (płaci proporcjonalnie), a logo pobrał w ramach Hostingu. Zamiast własnej sankcji – odesłanie do ustawowych
    skutków odstąpienia dla treści cyfrowych (powstrzymanie się od korzystania). Pakiet marki i Kolejna marka nie są
    objęte odstąpieniem od Hostingu (ust. 13 zd. ostatnie).
11. **AI Act art. 50 (§13b ust. 14).** Informacja, że pliki mają oznaczenie w metadanych (IPTC Digital Source Type –
    `pliki-graficzne.ts`, `zloz.ts`), „w zakresie, w jakim zastosowanie mają przepisy” rozporządzenia 2024/1689 – bez
    przesądzania, czy Verris jest dostawcą systemu generującego obrazy. Bez zakazu usuwania metadanych (to nie jest
    obowiązek klienta z art. 50 ust. 2).
12. **Dane pracowników Klienta w wizytówce i stopce.** Verris = podmiot przetwarzający (DPA §2 ust. 6, §4 ust. 1;
    Regulamin §13b ust. 16, §19 ust. 2; Polityka pkt 2.13 i 3); brief, polecenia, wgrane logo, potwierdzenia i zakupy –
    Verris jako administrator (Polityka). Sprawdzone w kodzie: `DaneKontaktoweMarki` nie trafiają do zapytań AI
    (`libs/kreator/src/marka/ai/**` nie czyta `kontakt`), pliki z nimi są generowane przy pobraniu i nie trafiają do
    magazynu – więc Anthropic nie jest dalszym podmiotem dla tych danych i lista z DPA §7 się nie zmienia.
13. **Retencja potwierdzeń (Polityka pkt 4).** Zgodnie z kodem: oświadczenie o prawach i potwierdzenie TMview są w danych
    marki (usuwane z marką i z kontem – `account-deletion.service.ts`, krok 3e'') oraz jako wpisy dziennika zmian
    (`KREATOR_MARKI_ZGODA`, `KREATOR_MARKI_WGRANO`) z datą, bez treści – zostają po usunięciu konta (jak inne zgody,
    pkt 4 „Obrona i dochodzenie roszczeń” i „Wykonywanie obowiązków z RODO”: do przedawnienia, co do zasady 6 lat,
    art. 118 KC). Zgoda na treść cyfrową – przy zakupie (`KreatorMarkaZakup` zostaje po usunięciu konta „jak faktury”)
    i w dzienniku (`KREATOR_MARKI_ZAKUP`). Podstawa: lit. c (potwierdzenie z upk) i lit. f (dowód).
14. **Obraz logo do Anthropic.** Nowa kategoria danych u istniejącego podprocesora, przetwarzana przez Verris jako
    administratora: dopisana w Polityce pkt 2.13 i 5.1, w `subprocessors.md` (cel i zakres) i w DPA Załącznik 2 (jako
    wyjaśnienie – bez danych powierzonych). Lista podprocesorów bez zmian, więc bez 30 dni z DPA §7 (test pilnuje
    listy nazw w pkt 5.1).
15. **Publikacja od razu (§24 ust. 4), nie po 30 dniach (§24 ust. 2).** Zmiany wprowadzają nowe, dobrowolne funkcje
    i jednorazowe zakupy; dotychczasowych warunków nie pogarszają (§21 dostaje wyjątek tylko dla nowych zakupów,
    którego nikt jeszcze nie kupił). Jak przy 1.3.0. Warunek: zapytanie z B.2 pkt 2.
16. **Odciski znaków po usunięciu konta – opisane krótko (Polityka pkt 2.13, Regulamin §13b ust. 17).** Odcisk to
    rodzina kształtu, parametry, skrót obrazu i znormalizowana branża, po usunięciu bez `userId` i `markaId` – Verris
    nie ma środków, by powiązać go z osobą (motyw 26 RODO). Opis zamiast pominięcia: kosztuje jedno zdanie, a zapobiega
    zarzutowi „ukrytej retencji” – Regulamin i tak wspomina mechanizm.
17. **Pozostałości obietnicy unikalności.** Paczka 132 nie objęła księgi znaku (PDF dla klienta), `CZYTAJ.txt` w ZIP
    i jednego akapitu pomocy – poprawione (A.3 „Kod”); test pilnuje fraz.

### C.2 Ryzyka bez prawnika

1. **Zrzeczenie się wypowiedzenia licencji (art. 68 pr. aut.).** Część doktryny uważa je za nieskuteczne przy licencji
   na czas nieoznaczony. Łagodzi to zobowiązanie do niewykonywania praw (ust. 5) i to, że klient zwykle chroni logo
   rejestracją znaku. Ryzyko praktyczne niskie (Verris nie ma interesu w wypowiadaniu).
2. **Prawa do Biblioteki.** Licencja działa tylko „w zakresie, w jakim Verris przysługują prawa”. Rodziny kształtów,
   szablony materiałów i księgi powstały w repozytorium (kod `libs/kreator/src/marka/sygnety/**`, `kv/**`, `ksiega.ts`);
   jeśli którąkolwiek rodzinę lub szablon zaprojektował ktoś spoza HVLN (zleceniobiorca, grafik), potrzebna jest
   pisemna umowa przenosząca prawa na Verris z polami: opracowania, udzielanie licencji klientom, rejestracja znaku przez
   klientów, i zobowiązanie do niewykonywania praw osobistych. Sprawdzić przed włączeniem modułu. Kroje – SIL OFL
   (dozwolone w logo).
3. **Zgodność treści cyfrowej i prawa osób trzecich (konsumenci).** Dyrektywa 2019/770 (art. 10) i rozdział 5b upk:
   jeśli logo narusza cudze prawa i to ogranicza korzystanie, konsument ma uprawnienia jak przy braku zgodności –
   niezależnie od informacji w §13b ust. 9–10. Potwierdzenie TMview nie jest „wyraźną i oddzielną akceptacją
   odstępstwa” od wymogów obiektywnych (zbierane przed plikami do druku, nie przy zawarciu umowy). Łagodzi:
   generator z Biblioteki, odrzucanie znanych marek, instrukcja TMview. Skutek finansowy ograniczony (cena Hostingu
   lub Pakietu), ryzyko wizerunkowe zostaje.
4. **Zgoda jako warunek zakupu.** Model „bez zgody nie kupisz” bywa krytykowany jako zgoda niedobrowolna; przyjęty
   jak przy domenach (§12 ust. 8) i powszechny na rynku treści cyfrowych.
5. **E-mail potwierdzenia nie dojdzie.** Mailer nie przerywa zakupu przy błędzie (treść jest już udostępniona); wtedy
   prawo odstąpienia nie wygasło. Procedura: przy odstąpieniu od Pakietu marki sprawdzić w dzienniku wysyłek wpis
   `kreator-marki.zakup` dla konta; bez wysłanego maila – uznać odstąpienie i zwrócić kwotę (Regulamin §21 ust. 6).
   E-mail idzie sekundy po udostępnieniu, nie przed nim – art. 38 ust. 1 pkt 13 wymaga przekazania potwierdzenia, nie
   wskazuje kolejności co do sekundy; ryzyko minimalne.
6. **Numery przepisów bez dostępu do tekstów jednolitych.** Art. 38 ust. 1 pkt 13, art. 21 ust. 1 i rozdział 5b upk
   (po nowelizacji z 2022 r., w mocy od 1.01.2023), art. 41, 46, 53, 67, 68 pr. aut., art. 385¹–385⁵, 473 k.c. –
   podane z wiedzy, bez sprawdzenia w ISAP w tej sesji (brak sieci). Przed publikacją warto zerknąć w ISAP na
   art. 38 upk (numeracja punktów) – jeśli się nie zgadza, poprawić numer w §13b ust. 13, `consumer-info.md`
   i komentarzach kodu (treść postanowień się nie zmienia).
7. **AI Act.** Status Verris (dostawca vs podmiot stosujący) i terminy stosowania art. 50 po ewentualnym „Digital
   Omnibus” niezweryfikowane; tekst Regulaminu niczego nie przesądza.
8. **Dziennik zmian bez automatycznego usuwania po przedawnieniu.** Wpisy potwierdzeń (jak wszystkie wpisy dziennika)
   nie są kasowane po 6 latach – Polityka obiecuje „do upływu terminów przedawnienia”. Ta sama luka dotyczy już
   historii zgód z 1.x; do retencji przy najbliższej pracy nad `retention.scheduler.ts`.
9. **Dane marek po wygaśnięciu Hostingu.** Zostają na Koncie do usunięcia marki albo Konta (Regulamin §13b ust. 17,
   Polityka), a DPA §10 mówi o usunięciu powierzonych danych 14 dni po „zakończeniu umowy o świadczenie Usług”. Dla
   Konta umowa trwa, ale dla danych z wizytówki to dwuznaczne – ta sama sytuacja co strony z Kreatora w 1.3.0.
10. **Pula Pakietu marki po końcu Hostingu i usunięciu Konta.** Pula nie wygasa w czasie, ale działa tylko przy
    Hostingu; usunięcie Konta kończy ją bez zwrotu (pliki zostają u klienta). Opisane wprost w §13b ust. 3; konsument
    mógłby to kwestionować przy zakończeniu Hostingu z winy Verris – wtedy zwrot proporcjonalny na zasadach ogólnych.
11. **RCPD** (`../rcpd.md`) nie ma czynności „Kreator marki” (ani „Verris Kreator” – C pkt 8 z 1.3.0). Dopisać przy
    przeglądzie: dane briefu, wgrane logo, potwierdzenia, odbiorcy Anthropic i Hetzner; jako podmiot przetwarzający –
    dane z wizytówki i stopki (art. 30 ust. 2 RODO).
12. **Adres TMview** (`ADRES_TMVIEW` w panelu, `TMVIEW` na www) – oznaczony w kodzie „do weryfikacji przed startem”.
    Kliknąć raz przed włączeniem modułu.
13. **Komentarz w `schema.prisma`** przy `KreatorMarkaOdcisk` dalej mówi o „obietnicy”. Komentarz wewnętrzny, bez
    wpływu na klienta; zmiana wymaga regeneracji klienta Prisma – zostawione do najbliższej migracji.

---

## D. Mapa: dokument ↔ kod

| Zapis | Kod |
| --- | --- |
| Regulamin §13b ust. 1 (w cenie Hostingu, limity, okres próbny) | `apps/api/src/kreator-marki/limity-marki.ts` (`stanLimitow`, wersja `proba`), `dane-marki.ts` (`blokadaPliku` → `PROBA`), `kreator-marki.service.ts` (`KOMUNIKATY.proba`), `dostawca-marki.ts` (marka w podglądzie strony) |
| §13b ust. 3 (Pakiet na Konto, Kolejna marka, cena w Panelu, nie w próbie) | `konfiguracja-marki.ts` (`DOMYSLNA_KONFIGURACJA_MARKI`, ceny w adminie), `zakup-marki.ts` (`POWOD_PROBA_ZAKUP`, `POWOD_PAKIET_KUPIONY`), `limity-marki.ts` (`pakietyKonta`, pula łączna) |
| §13b ust. 4–6 (licencja, Wydany Wariant) | `generator-plikow.ts` (`CZYTAJ.txt` – odesłanie do §13b ust. 4–6), `libs/kreator/src/marka/ksiega.ts` (informacje prawne), panel `lib/kreator-marki.ts` (`INFORMACJA_EKSPORTU`) |
| §13b ust. 8 (podobne znaki bez zobowiązania) | `kreator-marki.service.ts` (`PROG_PODOBIENSTWA`, 409 `PODOBNY_ZNAK`), `libs/kreator/src/marka/odcisk.ts` |
| §13b ust. 9–10 (TMview, potwierdzenie przed plikami do druku) | `dane-marki.ts` (`TMVIEW_WYMAGANY`), `kreator-marki.service.ts` (`zgody`, `KREATOR_MARKI_ZGODA`), panel `TEKST_ZGODY_TMVIEW`, `OSTRZEZENIE_NAGLOWKA`, `KROKI_TMVIEW` |
| §13b ust. 11 (brief, znane marki przed AI) | `libs/kreator/src/marka/ai/znane-marki.ts`, `kreator-marki.service.ts` (`sprawdzPolecenieMarki` przed `rezerwujAlbo`) |
| §13b ust. 12 (wgrane logo, oświadczenie z datą) | `kreator-marki.service.ts` (`KreatorMarkaPlik.oswiadczenieAt`, `KREATOR_MARKI_WGRANO`), panel `TEKST_OSWIADCZENIA_PRAW` |
| §13b ust. 13, §21 ust. 5 (zgoda, potwierdzenie e-mailem) | `zakup-marki.ts` (`BRAK_ZGODY`, `zgodaTresciCyfrowejAt`, `potwierdz`), `mail/templates/kreator-marki-notifications.ts` (`kreatorMarkiZakupTemplate`), panel `TEKST_ZGODY_TRESCI_CYFROWEJ`, `zakup-marki.tsx` |
| §13b ust. 14 (metadane AI) | `pliki-graficzne.ts` (`pakietXmp`), `libs/kreator/src/marka/zloz.ts` (`<metadata>` SVG) |
| §13b ust. 15 (kroje OFL) | `ofl.ts`, `generator-plikow.ts` (kroje.zip), `libs/kreator/src/marka/reguly.ts` (tylko kroje z katalogu) |
| §13b ust. 16, DPA §2 ust. 6 (dane z wizytówki i stopki, bez AI) | `libs/kreator/src/marka/model.ts` (`DaneKontaktoweMarki`), `kreator-marki.service.ts` (`kontakt`), `stopka-email.ts`; zapytania AI: `libs/kreator/src/marka/ai/**` (bez `kontakt`) |
| §13b ust. 17, Polityka pkt 7 i 2.13 (usunięcie, odciski) | `compliance/account-deletion.service.ts` (krok 3e'', pliki 6d), `compliance/data-export.service.ts` (`brand-creator-*.json`) |
| Polityka pkt 2.13, 5.1; DPA Zał. 2 (Anthropic, obraz logo) | `kreator-marki.service.ts` (`wywolaj` – obraz PNG w pierwszej wiadomości), `libs/kreator/src/marka/ai/analiza-logo.ts`, `ai/ai-provider.service.ts` (dziennik kosztów bez treści) |
| Polityka pkt 4 (retencja potwierdzeń) | `common/audit/audit.actions.ts` (`KreatorMarkiActions`), `compliance/retention.scheduler.ts` (IP w dzienniku 24 mies.), `KreatorMarkaZakup` bez usuwania |
| Admin: dokumenty „wymieniają moduł” | `kreator-marki.admin.controller.ts` (`DOKUMENT_Z_KREATOREM_MARKI`), `apps/admin-panel/src/app/(dashboard)/settings/kreator-marki/kreator-marki-form.tsx` |
| www `/kreator-marki` (obietnice) | `apps/www/src/app/(frontend)/kreator-marki/page.tsx` (FAQ: prawa, odstąpienie, płatne dodatki) |
| Testy dokumentów | `apps/api/src/test/dokumenty-prawne-1-4-0.spec.ts`, `dokumenty-prawne-1-3-0.spec.ts`, `kreator-marki/zakup-marki-potwierdzenie.spec.ts` |
