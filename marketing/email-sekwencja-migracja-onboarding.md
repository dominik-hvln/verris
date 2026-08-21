# Verris — sekwencje e-mail: nurture migracyjny + onboarding

Od leada (`generate_lead`) do pierwszej wpłaty (`purchase`) i dalej — do aktywnego, zadowolonego
klienta. Wysyłka: **AWS SES**. Ton marki: konkret, „Ty", zero korpomowy, bez wykrzykników.

---

## 0. Zasady prawne (twarde — czytaj przed pisaniem czegokolwiek)

| Typ wiadomości | Podstawa | Wymóg |
|---|---|---|
| **Marketingowa** (nurture, oferta) | zgoda (PKE) | **Uprzednia zgoda + double opt-in**, link rezygnacji w każdym mailu, dane nadawcy |
| **Transakcyjna/serwisowa** (onboarding po zakupie, status migracji, faktury) | wykonanie umowy | Zgoda niepotrzebna, ale **nie wolno** doklejać do niej treści marketingowych |
| **Porzucone zamówienie** | strefa szara | Wysyłaj **tylko** do osób z kontem (relacja usługowa) albo po zgodzie marketingowej |

Dodatkowo: nie kupujemy i nie używamy cudzych baz. Ceny **brutto**. Przy promocji — najniższa cena
z 30 dni (Omnibus). SLA wyłącznie „99,5% z rekompensatami". Zero fałszywego scarcity („ostatnie
miejsca", licznik do zera). Każdy mail przed wysyłką → `marketing:brand-review`.

**Wymagania techniczne:** SPF + DKIM + DMARC na domenie wysyłkowej (rekomendacja: subdomena, np.
`send.verris.pl`, żeby nie psuć reputacji poczty firmowej), nagłówek `List-Unsubscribe` (one-click),
wersja tekstowa maila, lista suppression (twarde odbicia + wypisy) respektowana globalnie.

---

## 1. Mapa lejka i wyzwalacze

```
  Formularz „Zaplanuj migrację" / kontakt
        │  generate_lead
        ▼
  [E0] Potwierdzenie zapisu (double opt-in)  ──(brak potwierdzenia 7 dni)──► koniec, usuń z listy
        │  consent_confirmed
        ▼
  FLOW A — Nurture migracyjny (6 maili / 14 dni)
        │
        ├──(purchase)──────────────► FLOW B — Onboarding (wyjdź z A)
        ├──(sign_up bez purchase)──► FLOW C — Porzucone zamówienie
        └──(wypis / brak reakcji)──► koniec
```

Wyzwalacze pochodzą ze zdarzeń, które już mamy: `generate_lead`, `sign_up`, `begin_checkout`,
`purchase`, `stripe_checkout_success`.

> **Uwaga produktowa:** dziś jedyne miejsce zbierania leadów to formularz `/kontakt`. Rekomenduję
> dodać na `/przenies-strone` lekkie „Zaplanuj migrację — wyślemy plan w 3 krokach" (e-mail + zgoda).
> Bez tego Flow A ma bardzo wąskie wejście.

---

## 2. FLOW A — Nurture migracyjny (marketingowy, wymaga zgody)

Cel: przekonać, że przeprowadzka jest bezpieczna, darmowa i opłacalna. **6 maili / 14 dni.**
Wyjście natychmiastowe przy `purchase`.

---

### E0 — Potwierdzenie zapisu (double opt-in) · natychmiast

**Temat A:** Potwierdź zapis — plan migracji czeka
**Temat B:** Jeszcze jeden klik i wysyłamy plan migracji
**Preheader:** Kliknij, żeby potwierdzić adres. Bez tego nic nie wyślemy.

> Cześć,
>
> zapisałeś się po plan przeniesienia strony do Verris. Zanim cokolwiek wyślemy, potwierdź swój adres — tak nakazuje prawo i zdrowy rozsądek.
>
> **[Potwierdzam adres]**
>
> Jeśli to nie Ty — zignoruj tę wiadomość. Nic się nie wydarzy.

*(Brak potwierdzenia po 7 dniach → usuń rekord. Nie przypominamy więcej niż raz.)*

---

### E1 — Plan migracji w 3 krokach · natychmiast po potwierdzeniu

**Temat A:** Twój plan migracji: 3 kroki, zero przestoju
**Temat B:** Jak przenieść stronę bez przerwy w działaniu
**Preheader:** Migracja odbywa się obok działającej strony. Przełączasz się, gdy wszystko sprawdzone.

> Przeniesienie strony brzmi groźnie tylko do momentu, gdy ktoś pokaże, jak to wygląda naprawdę. Wygląda tak:
>
> **1. Zamawiasz hosting.** Twoja obecna strona cały czas działa u dotychczasowego dostawcy.
> **2. Przekazujesz dostępy.** Przenosimy pliki, bazy i pocztę — za 0 zł. Możesz też użyć migratora w panelu.
> **3. Przełączasz DNS.** Dopiero gdy sprawdzisz, że wszystko działa.
>
> Bez przestoju. Bez utraty pozycji w Google. Bez dopłat za bazy danych.
>
> **[Zobacz, jak działa migracja]** → verris.pl/przenies-strone
>
> W kolejnych dniach wyślemy Ci trzy rzeczy: jak sprawdzić, czy przepłacasz, ile realnie kosztuje hosting i co zrobić z pocztą. Bez spamu — jeśli to nie dla Ciebie, wypisz się jednym klikiem.

---

### E2 — Sprawdź swoją fakturę · +2 dni

**Temat A:** Sprawdź, ile płacisz po odnowieniu
**Temat B:** Trzy sposoby, w jakie hosting zarabia na Tobie
**Preheader:** Wszystkie legalne. Żaden uczciwy.

> Rynek hostingu ma trzy sprawdzone sposoby na Twoje pieniądze:
>
> **Promocja-przynęta.** Pierwszy rok za grosze, odnowienie kilkukrotnie droższe. Rachunek przychodzi wtedy, gdy przenosiny wydają się trudniejsze niż dopłata.
>
> **Pakiet na zapas.** Płacisz za moc, której strona nie używa przez 11 miesięcy w roku.
>
> **Cicha dopłata.** Auto-odnowienia domen i dodatków, o których dowiadujesz się z obciążenia karty.
>
> W Verris cena z cennika obowiązuje od pierwszego dnia — 45 zł/mies lub 399 zł/rok brutto. Domeny odnawiamy wyłącznie po opłaceniu. Odnowienie wyłączysz jednym przełącznikiem.
>
> **[Zobacz, czym się różnimy]** → verris.pl/przenies-strone#porownanie
>
> PS Wyciągnij ostatnią fakturę za hosting i porównaj z ceną sprzed roku. To zajmie minutę.

---

### E3 — Ile to realnie kosztuje · +4 dni

**Temat A:** Policz, ile kosztuje moc na godziny
**Temat B:** Nie kupuj mocy na zapas
**Preheader:** Kalkulator autoskalowania — sprawdź swój przypadek w 30 sekund.

> Klasyczny hosting każe wybrać pakiet z góry. Za mały — strona padnie w kampanii. Za duży — płacisz za nic przez większość roku.
>
> U nas bazę masz w cenie (50 GB NVMe, 8 GB RAM, 2 vCPU), a nadwyżkę płacisz **godzinowo** — tylko wtedy, gdy strona jej realnie potrzebuje. Gdy ruch spada, tryb ECO zwalnia zasoby i naliczanie się kończy.
>
> **[Policz swój koszt]** → verris.pl/przenies-strone#kalkulator
>
> Stawki są jawne: 0,001323 zł za 1% CPU/h · 0,0882 zł za 1 GB RAM/h · 0,0008 zł za 1 GB dysku/h. Brutto. Bez gwiazdek.

---

### E4 — Co z pocztą i pozycjami w Google · +7 dni

**Temat A:** Dwa pytania, które słyszymy najczęściej
**Temat B:** Poczta i SEO przy zmianie hostingu
**Preheader:** Odpowiadamy konkretnie, bez „to zależy".

> **„Czy stracę pozycje w Google?"**
> Nie. Zmiana hostingu nie zmienia adresów URL ani treści. Krótkie wahania w czasie propagacji DNS są możliwe i ustępują. Szybszy serwer bywa wręcz pomocny — czas ładowania jest czynnikiem rankingowym.
>
> **„Co z pocztą?"**
> Przenosimy skrzynki razem ze stroną. Do momentu przełączenia DNS poczta działa u obecnego dostawcy, więc żadna wiadomość nie ginie.
>
> A gdyby coś poszło nie tak — masz SLA 99,5% z rekompensatami zapisanymi w regulaminie i kopie zapasowe, które przywrócisz sam, bez czekania na support.
>
> **[Przeczytaj pełne FAQ]** → verris.pl/przenies-strone#faq

---

### E5 — Zostało pytanie? · +10 dni

**Temat A:** Mam jedno pytanie do Ciebie
**Temat B:** Co Cię powstrzymuje przed przeprowadzką?
**Preheader:** Odpowiedz na tego maila — czyta go człowiek.

> Przez ostatnie dni pokazaliśmy, jak wygląda migracja, ile realnie kosztuje hosting i co dzieje się z pocztą oraz pozycjami w Google.
>
> Jeśli coś nadal jest niejasne — **odpowiedz na tego maila**. Trafi do nas, nie do bota. Odpiszemy konkretnie, nawet jeśli odpowiedź brzmi „w Twoim przypadku zostań tam, gdzie jesteś".
>
> A jeśli wszystko jest jasne:
>
> **[Załóż konto i przenieś stronę za 0 zł]** → panel.verris.pl

---

### E6 — Domykamy · +14 dni

**Temat A:** Kończymy serię (i nie zaczynamy nowej)
**Temat B:** Ostatni mail z tej serii
**Preheader:** Zostawiamy Ci komplet w jednym miejscu.

> To ostatni mail z tej serii — nie przepisujemy Cię automatycznie do żadnej kolejnej.
>
> Gdybyś wracał do tematu za miesiąc albo za rok, wszystko jest tutaj:
> · Jak działa migracja → verris.pl/przenies-strone
> · Cennik bez gwiazdek → verris.pl/cennik
> · Kalkulator autoskalowania → verris.pl/przenies-strone#kalkulator
>
> Gdy będziesz gotowy, przeprowadzka zajmie nam mniej czasu niż Tobie przeczytanie tej serii.
>
> **[Załóż konto]** → panel.verris.pl

*(Po E6 → status „nurture_completed". Kolejny kontakt wyłącznie przy nowej, świadomej akcji.)*

---

## 3. FLOW B — Onboarding po zakupie (transakcyjny)

Wyzwalacz: `purchase` / `stripe_checkout_success`. **Nie doklejamy tu treści marketingowych.**

| # | Kiedy | Temat | Cel |
|---|---|---|---|
| B1 | natychmiast | „Witaj w Verris — co dalej" | Dostęp do panelu, 2 ścieżki migracji (zespół albo migrator) |
| B2 | +24 h, jeśli brak zgłoszenia migracji | „Przekaż dostępy, resztą zajmiemy się my" | Odblokowanie migracji, link do formularza |
| B3 | po zakończeniu kopiowania | „Twoja strona jest na Verris — sprawdź przed przełączeniem" | Test pod adresem tymczasowym, checklista |
| B4 | +1 dzień po przełączeniu DNS | „Działa. Zrób jeszcze te trzy rzeczy" | SSL, kopie zapasowe, test przywracania |
| B5 | +14 dni | „Jak Ci się pracuje na Verris?" | Prośba o opinię (Google) + kanał zgłoszeń |

**B1 (szkic):**

> Konto gotowe. Twoja obecna strona nadal działa u dotychczasowego dostawcy — nic się nie wyłączyło.
>
> Masz dwie drogi:
> **1. My przenosimy.** Przekaż dostępy, resztę zrobimy — pliki, bazy, pocztę. Za 0 zł.
> **2. Ty przenosisz.** Uruchom migrator w panelu i przejdź krok po kroku.
>
> **[Zleć migrację]** · **[Otwórz migrator]**
>
> Cokolwiek wybierzesz, DNS przełączysz dopiero wtedy, gdy sprawdzisz, że wszystko działa.

**B5** to jedyny mail z prośbą o opinię — świadomie: recenzje w Google są też najkrótszą drogą do
cytowań w AI (marki są 6,5× częściej cytowane przez źródła trzecie niż przez własną domenę).

---

## 4. FLOW C — Porzucone zamówienie

Wyzwalacz: `sign_up` lub `begin_checkout` bez `purchase` w ciągu 2 h.
**Warunek:** wysyłamy tylko do osób z założonym kontem (relacja usługowa) albo z zgodą marketingową.

| # | Kiedy | Temat | Treść |
|---|---|---|---|
| C1 | +2 h | „Coś przerwało zamówienie?" | Bez presji. Link do dokończenia + oferta pomocy przez odpowiedź na maila |
| C2 | +24 h | „Trzy rzeczy, o które zwykle pytają przed zakupem" | Odpowiedzi na obiekcje: przestój, poczta, rezygnacja. Potem koniec — bez trzeciego maila |

Maksymalnie **dwa** maile. Brak reakcji → cisza.

---

## 5. Pomiar

**UTM na każdym linku:**
`?utm_source=email&utm_medium=lifecycle&utm_campaign=nurture-migracja&utm_content=e3`

Zdarzenia do śledzenia: dostarczenie, otwarcie (świadomie traktowane orientacyjnie — Apple MPP
zawyża), klik, `begin_checkout`, `purchase`. Konwersję licz **z klika do zakupu**, nie z otwarcia.

**Benchmarki startowe** (lista z double opt-in, mała, świeża):

| Metryka | Oczekiwane |
|---|---|
| Potwierdzenie double opt-in | 55–70% zapisów |
| Otwarcia (E1–E3) | 40–55% |
| CTR | 4–8% |
| Konwersja lead → klient (14 dni) | 3–8% |
| Wypisy | < 0,5% na mail |

Przy małej liście **nie testuj A/B tematów** poniżej ~500 odbiorców na wariant — wynik będzie szumem.
Do tego czasu wybieraj temat „A" i notuj obserwacje jakościowe.

---

## 6. Wdrożenie — kolejność

1. Formularz „Zaplanuj migrację" na `/przenies-strone` (e-mail + checkbox zgody, `generate_lead`).
2. SES: subdomena wysyłkowa + SPF/DKIM/DMARC, suppression list, `List-Unsubscribe`.
3. Double opt-in (E0) + rejestr zgód (data, treść zgody, IP) — dowód zgody wymagany przez RODO.
4. Flow A (6 maili) → Flow B (5 maili) → Flow C (2 maile).
5. `marketing:brand-review` całości copy.
6. Start na małej próbce (np. pierwsze 50 leadów), potem skalowanie.

---

## Blokery

- [ ] Formularz leada na LP (dziś lead wpada tylko z `/kontakt`)
- [ ] SES: subdomena wysyłkowa + DKIM/SPF/DMARC
- [ ] Rejestr zgód (dowód double opt-in)
- [ ] Szablon HTML maila w brandzie (Pine/Mint, wersja tekstowa)
- [ ] `marketing:brand-review`
