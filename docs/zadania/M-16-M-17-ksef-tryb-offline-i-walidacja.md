# `M-16` + `M-17` — KSeF: tryb offline i walidacja przed wysyłką

| | |
|---|---|
| **Sprint** | blokery startu |
| **Priorytet** | **BLOKER STARTU** |
| **Nakład** | **przeszacowanie do korekty** — `M-16` był M, `M-17` był S; patrz „Rzeczywisty zakres” |
| **Zależy od** | decyzji księgowej + certyfikatu KSeF z portalu MF |
| **Status** | **rozpoznane, nie zaczęte** |
| **Data** | 2026-08-26 |

---

## Trzy fakty, od których trzeba zacząć

### 1. KSeF jest obowiązkowy od 1 kwietnia 2026 — czyli od pięciu miesięcy

Harmonogram: 1 lutego 2026 podatnicy powyżej 200 mln zł obrotu, **1 kwietnia 2026 wszyscy
pozostali**, 1 stycznia 2027 podmioty do 10 tys. zł sprzedaży miesięcznie.

To nie jest „bloker startu” w sensie „coś, co trzeba dorobić przed premierą”. To obowiązek,
który zaczyna działać **przy pierwszej fakturze wystawionej klientowi zewnętrznemu**.
Ministerstwo zapowiadało okres bez kar, ale jego zakres ma dopiero doprecyzować akt
wykonawczy — nie da się na tym oprzeć planu.

### 2. `KsefStatus.OFFLINE` istnieje w schemacie i nie jest ustawiany nigdy

```
schema.prisma:1518
  OFFLINE        // wystawiona w trybie offline (awaria KSeF) — do dosłania
```

`grep` po `apps/` nie znajduje ani jednego zapisu tej wartości.

**To jest trzeci raz ten sam wzorzec w tym projekcie.** `ServerStatus.OFFLINE` — nigdy nie
zapisywany (`OPS-01`). Reguła alertowa, która nie umiała powiedzieć „jest dobrze” (`X-35`).
Teraz `KsefStatus.OFFLINE`. Wartość w enumie wygląda jak zaimplementowana funkcja i jest
tylko zapisaną intencją.

### 3. Komentarz w kodzie opisuje tryb offline **niezgodnie z przepisami**

```
ksef.service.ts:22-26
  Tryb offline (awaria KSeF): wysyłka po prostu zostaje w PENDING i jest
  ponawiana — faktura PDF i tak trafia do klienta natychmiast, a przepisy
  przewidują dosłanie po przywróceniu dostępności.
```

Zdanie o dosłaniu jest prawdziwe. Reszta pomija to, co przepisy wymagają **wobec nabywcy**:
faktura przekazana poza KSeF w trybie offline musi nieść **dwa kody QR**. Dziś nie ma żadnego —
`grep` po `apps/api/src` i `apps/client-panel/src` nie znajduje ani jednego wystąpienia QR.

Komentarz, który zapewnia o zgodności z przepisami, jest gorszy niż jego brak: zniechęca do
sprawdzenia.

## Rzeczywisty zakres — cztery tryby, nie jeden

| Tryb | Kiedy | Termin przesłania do KSeF | Kody QR |
|---|---|---|---|
| **offline24** | problem z internetem po stronie wystawcy | niezwłocznie, **nie później niż następny dzień roboczy** | KOD I („OFFLINE”) + KOD II („CERTYFIKAT”) |
| **offline** (niedostępność) | planowane prace serwisowe ogłoszone w BIP MF | **następny dzień roboczy po zakończeniu** niedostępności | oba |
| **awaria** | awaria ogłoszona w BIP MF | **7 dni roboczych od zakończenia** awarii | oba |
| **awaria całkowita** | sytuacje nadzwyczajne, ogłoszone w mediach | **brak obowiązku** przesłania | żadne; dopuszczalny papier |

Datą wystawienia w trzech pierwszych trybach jest data wskazana przez podatnika w polu `P_1`
struktury faktury — nie moment przyjęcia przez KSeF.

**Nasz kod nie odróżnia żadnego z tych trybów od zwykłej kolejki.** Faktura czekająca, bo KSeF
akurat nie odpowiada, i faktura czekająca, bo cykl jeszcze nie zdążył — mają w bazie ten sam
`PENDING`. Terminy z tabeli wyżej liczą się od różnych zdarzeń, więc bez rozróżnienia nie da
się stwierdzić, czy którykolwiek został przekroczony.

## Czego brakuje technicznie

**KOD I** koduje: adres API, datę wystawienia z pola `P_1`, NIP sprzedawcy oraz wyróżnik
faktury liczony ze **skrótu kryptograficznego pliku XML**. Mamy już builder XML, więc skrót
jest w zasięgu ręki. Ten kod nie wymaga niczego dodatkowego.

**KOD II** wymaga **certyfikatu KSeF typu 2**, wydawanego przez portal KSeF (dostępne od
listopada 2025). Tego nie mamy i nie da się go „dopisać w kodzie” — to sprawa formalna,
którą trzeba załatwić w portalu MF.

Uwaga na fałszywy trop: `ksef-v2.client.ts` operuje na certyfikatach, ale to **klucze publiczne
MF** do szyfrowania sesji (`/security/public-key-certificates`), nie certyfikat wystawcy do
podpisywania kodu II. Dwie różne rzeczy o podobnej nazwie.

## `M-17` — walidacja przed wysyłką

`fa3-xml.builder.ts` składa XML **stringowo**. Walidacja lokalna istnieje
(`FaXmlValidationError` → `markRejected`), ale sprawdza kompletność danych, nie zgodność ze
schematem FA(3). Do tego smoke na środowisku `api-test` MF **nigdy nie został wykonany**.

Osobno, i to jest ostrzejsze niż samo `M-17`: `KSEF_ENABLED` ma domyślnie `'0'`, a `KSEF_ENV`
domyślnie `'test'`. **Włączenie KSeF bez zmiany środowiska wysyła faktury na środowisko
testowe MF**, a panel pokazuje je jako wysłane. To już jest odnotowane przy `M-11`, ale przy
obowiązku od kwietnia przestaje być ciekawostką.

## Czego NIE zrobię bez decyzji

To jest obszar podatkowy, nie inżynierski. Nie jestem doradcą podatkowym i nie będę
interpretował, który tryb stosuje się do Verris ani od kiedy liczyć terminy. Do rozstrzygnięcia
z księgową:

1. **Czy Verris w ogóle wystawia faktury podlegające KSeF już dziś** — `qualifies()` bierze
   faktury własne z numeracją VFV; Stripe-hosted są wyłączone jako `NOT_APPLICABLE` z adnotacją
   „jeśli prawnik zdecyduje inaczej, zmiana = jedna linia”. Ta decyzja nie została podjęta.
2. **Który z czterech trybów offline chcemy obsługiwać.** Obsługa wszystkich to najwięcej
   pracy; obsługa samego „awaria” jest niepełna, ale pokrywa najdłuższy termin.
3. **Czy występujemy o certyfikat KSeF typu 2.** Bez niego KOD II nie powstanie, a bez KOD II
   faktura offline nie spełnia wymogu — czyli tryb offline nie jest dla nas dostępny wcale
   i każda niedostępność KSeF blokuje wystawianie.

## Źródła

- Ministerstwo Finansów — tryb offline i niedostępność KSeF: <https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/tryb-offline-niedostepnosc-ksef/>
- Ministerstwo Finansów — kody weryfikujące QR: <https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/kody-weryfikujace-qr/>
- Porównanie czterech trybów: <https://ksiegowosc.infor.pl/ksef/7037541,ksef-2026-tryb-offline24-offline-awaria-i-awaria-calkowita-co-trz.html>
- Harmonogram obowiązku: <https://www.comarch.pl/krajowy-system-e-faktur-ksef/ksef-2026/>
- KOD I / KOD II i certyfikat typu 2: <https://akademialtca.pl/blog/czym-sa-kody-weryfikacyjne-ksef>, <https://altoadvisory.pl/baza-wiedzy/kody-qr-w-praktyce-ksef-i-fakturowanie/>

Odczyty z 2026-08-26. Przepisy w tym obszarze zmieniały się kilkakrotnie — przed wdrożeniem
warto je potwierdzić u księgowej, a nie u mnie.
