# `PROD-02` — Kreator klienta i pasek postępu w sidebarze

| | |
|---|---|
| **Sprint** | nowy zakres produktowy |
| **Priorytet** | WYSOKA |
| **Nakład** | M/L — do rozbicia na etapy |
| **Zależy od** | — |
| **Status** | **rozpisane, decyzje podjęte 2026-08-26, nie zaczęte** |
| **Data** | 2026-08-26 |

---

## Cel

Kreator prosty, ale pokrywający wszystko, czego klient może potrzebować. Postęp w procentach
widoczny **w sidebarze nad belką użytkownika, na każdym widoku** — nie tylko wewnątrz kreatora.

## Stan faktyczny — trzy rzeczy, które trzeba wiedzieć przed projektowaniem

### 1. To, co nazywamy kreatorem, kreatorem nie jest

`onboarding-wizard.tsx` (164 linie) to **baner-checklista** na górze dashboardu. Nie ma stanu
„krok N", nie ma „dalej"/„wstecz". Są cztery rozłączne warianty:

| Warunek | Co pokazuje |
|---|---|
| brak usługi | powitanie z jednym przyciskiem → `/dashboard/services/new` |
| trwa provisioning | 1 krok informacyjny |
| produkt pocztowy | 2 kroki: skrzynki, MX/DNS |
| hosting | 4 kroki: strona, DNS, SSL, poczta |

### 2. Dwa z czterech kroków hostingu **nie mogą się nigdy ukończyć**

`done` dla kroków `site` i `mail` jest **zahardkodowane na `false`** (`onboarding-wizard.tsx`,
linie 78, 82, 85). Realną detekcję mają tylko `dns` (`snapshot.dnsOk`) i `ssl`
(`snapshot.tlsOk`). Licznik w podtytule brzmi `(${doneCount}/${steps.length} gotowe)`, więc
klient, który skonfigurował wszystko idealnie, widzi **2/4**. Dla poczty maksimum to 1/2.

To nie jest brak funkcji — to licznik, który kłamie w dół. Ta sama rodzina co `X-39`: panel
pokazuje liczbę tam, gdzie nie ma wiedzy.

### 3. Stan onboardingu nie istnieje nigdzie poza przeglądarką

- Jedyny trwały ślad to `localStorage`, klucz `verris_onboarding_dismissed_v1`.
- **W bazie nie ma żadnego pola onboardingowego** — `model User` nie zna ani
  `onboardingCompleted`, ani `setupStep`, ani niczego pokrewnego.
- Postęp nie jest zapamiętywany — jest przeliczany od zera przy każdym renderze z danych
  health **pierwszej usługi z listy** (`services[0]`).
- Zamknięcie banera jest **nieodwracalne z poziomu UI** — nie ma gdzie go przywrócić.
- Efekt: klient, który zamknął baner na laptopie, zobaczy go znów na telefonie. Klient, który
  zamknął go przez pomyłkę, nie odzyska go nigdy.

**„Procent ukończenia konfiguracji" nie istnieje — ani w bazie, ani w API, ani w panelu.**

### 4. Trzy kreatory, trzy różne implementacje kroków

| Kreator | Kroki | Wskaźnik postępu |
|---|---|---|
| onboarding | 4 warianty, bez nawigacji | tekst „2/4 gotowe" |
| `migration-wizard.tsx` | 4, `useState<number>` | własny `StepIndicator` — kółka z kreskami |
| `domain-purchase-wizard.tsx` | 4, `useState<Step>` (union stringów) | „pigułki", renderowane inline w JSX |

Wspólnego komponentu **nie ma**. Indeks kroku w kreatorze domen liczony jest łańcuchem
`? :` po nazwach. Każdy nowy kreator będzie czwartą implementacją tego samego.

### 5. Sidebar

`layout.tsx` (417 linii), `"use client"`, sidebar **nie ma osobnego komponentu**. Belka
użytkownika: linie 311-336, na dole, **poza obszarem przewijanym** — czyli widoczna zawsze,
na każdym widoku. Dokładnie tam, gdzie ma trafić pasek.

Dane: `useEffect` → server action `fetchSidebarUser()` → `GET /users/me`. Zwracany typ
`SidebarUser` ma 12 pól i **ani jednego onboardingowego**. Refetch przy każdej zmianie ścieżki
oraz na zdarzenie `wallet:refresh`.

Miejsce na pasek jest bez przebudowy: kontener `<div className="p-5">` (linia 311) nad kartą
użytkownika, albo dodatkowy wiersz wewnątrz karty (linia 315).

## Zakres

### A. Postęp musi mieć źródło prawdy

Dziś liczy się z health jednej usługi w komponencie klienckim. Docelowo: **API liczy postęp,
panel go wyświetla.**

- **Postęp doklejony do `/users/me`** (decyzja 2026-08-26): sidebar i tak woła ten endpoint przy
  każdej zmianie ścieżki, więc postęp dojedzie bez dodatkowego zapytania. **Warunek: wynik musi
  być cache'owany po stronie API**, bo inaczej liczymy go przy każdej nawigacji, także tam,
  gdzie nikt go nie ogląda.
- Procent liczony po stronie serwera z realnych sygnałów, nie z zahardkodowanych `false`.
- Kroki bez możliwości detekcji **nie wchodzą do mianownika**, dopóki detekcji nie mają.
  Lepszy licznik z trzech kroków niż licznik z czterech, który nie dojdzie do stu.

### B. Kroki — czego klient faktycznie potrzebuje

**Podział na dwie grupy — decyzja 2026-08-26.**

**Kroki konieczne** (liczą się do procentu): usługa działa, domena podpięta, DNS, SSL,
skrzynki pocztowe dla produktu pocztowego, płatność i faktura. Klient dochodzi do 100%
uczciwie i pasek znika.

**Dobre praktyki** (osobna sekcja, **poza procentem**): kopia zapasowa i odtwarzanie
(`H-22` — *„klient w kryzysie tego nie znajdzie"*), SPF / DKIM / DMARC (`E-15`, `E-16`, `E-17`
— komponent `deliverability-panel.tsx` **już istnieje i jest osierocony**, nikt go nie
renderuje), dostęp dla współpracownika (IAM/subkonta), migracja z innego hostingu.

Sekcja dobrych praktyk pokazuje się zawsze, ale nigdy nie blokuje dojścia do stu procent.
Pasek, do którego nie da się dojść, przestaje cokolwiek znaczyć.

Warianty nadal wynikają z produktu, który klient kupił — tak jak dziś rozdziela się hosting
od poczty.

### C. Trwałość i możliwość powrotu

- Stan onboardingu w bazie, powiązany z kontem — nie z przeglądarką.
- Zamknięcie kreatora odwracalne: wejście z powrotem z Ustawień albo z samego paska postępu.
- Zamknięcie to „schowaj", nie „usuń".

### D. Pasek w sidebarze

- Nad belką użytkownika, widoczny na każdym widoku. **Na telefonie sidebar jest szufladą**,
  więc pasek musi mieć miejsce także tam albo trafić nad nią — to zadanie i tak dotyka tego
  layoutu (`Q-09`, WYSOKA).
- Procent + skrót do kreatora.
- **Przy wielu usługach pokazuje najniższy postęp i nazwę tej usługi** (decyzja 2026-08-26).
  Dzisiejszy snapshot bierze `services[0]` i drugą usługę ignoruje — klient może mieć usługę
  nietkniętą i widzieć komplet.
- **Znika przy 100%** — pasek, który zawsze świeci na pełnym, przestaje cokolwiek znaczyć.
- **Wraca dyskretnie po dokupieniu usługi** (decyzja 2026-08-26): nowa usługa obniża postęp
  i pasek pojawia się z powrotem w sidebarze, ale **baner powitalny na dashboardzie się nie
  odtwarza**. Klient dostaje sygnał, nie powtórkę z onboardingu.
- Dla subkont: pokazuje wyłącznie kroki, do których subkonto ma uprawnienia
  (`customerPermissions`), albo nie pokazuje się wcale. Subkonto nie ma jak ukończyć kroku,
  którego nie widzi — a pasek stojący na 40% bez możliwości ruchu to defekt, nie informacja.

### E. Jeden komponent kroków

Wspólny `Stepper` dla onboardingu, migracji i zakupu domeny. Nie jako refaktor dla estetyki —
jako warunek tego, żeby czwarty kreator nie był czwartą implementacją.

## Etapy

1. **Naprawa licznika, który kłamie** — usunięcie zahardkodowanych `done: false` albo
   wypadnięcie tych kroków z mianownika. Mała zmiana, natychmiastowa poprawa, niezależna
   od reszty.
2. **Model i wyliczanie postępu w API** — pole w bazie + serwis liczący, testy jednostkowe.
3. **Pasek w sidebarze** — konsumuje wynik z punktu 2.
4. **Kreator przepisany** — pełna lista kroków, nawigacja, trwały stan, możliwość powrotu.
5. **Wspólny `Stepper`** i przepięcie trzech kreatorów.

Punkt 1 przed resztą, bo dzisiejszy licznik pokazuje klientowi nieprawdę **teraz**.

## Czego to świadomie nie obejmuje

- **Onboardingu administratora i pracownika** — inne panele, inny zakres.
- **Wycieczki po interfejsie / podpowiedzi kontekstowych** — `proactive-hints.tsx` to osobny
  mechanizm oparty na rekomendacjach z `/services`; nie łączymy.
- **Grywalizacji postępu** — punkty, odznaki, nagrody za ukończenie. Poza zakresem.
- **Zmiany `sidebarQuickLinks`** — kafelki użytkownika zostają jak są.

## Decyzje podjęte 2026-08-26

| Pytanie | Decyzja |
|---|---|
| Co wchodzi do 100%? | **Tylko kroki konieczne.** Backup i deliverability jako osobna sekcja „dobre praktyki", poza procentem |
| Skąd panel bierze postęp? | **Doklejone do `/users/me`**, z cache'owaniem po stronie API |
| Wiele usług? | **Najniższy postęp spośród usług, z nazwą tej usługi** |
| Czy pasek wraca po dokupieniu usługi? | **Tak, ale tylko w sidebarze** — bez banera na dashboardzie |

## Pozostaje otwarte

- **Jak długo cache'ować postęp w API** i co go unieważnia. Zbyt długi cache = klient
  konfiguruje DNS i przez kwadrans widzi stary procent; zbyt krótki = liczymy przy każdej
  nawigacji, czyli dokładnie to, czego decyzja o `/users/me` miała uniknąć.
