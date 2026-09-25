# PB-06 / PB-07 — treści verris.pl do akceptacji (2026-09-25)

Zasada: na stronie jest tylko to, co ma pokrycie w macierzy (`audyt/dane/macierz.csv`) i w kodzie.
Audyt 38 twierdzeń z `/`, `/hosting`, `/cennik`, `/przenies-strone`: 25 w porządku, 13 poprawionych albo odłożonych.

## Poprawione (było nieprawdziwe)

| Było | Jest | Dlaczego |
|---|---|---|
| „tryb ECO zwalnia moc po piku” (14 miejsc) | „po piku autoskalowanie wraca do bazy” | Tryb ECO w produkcie zmienia politykę kopii (codziennie → co tydzień), nie skaluje zasobów (Q-04). |
| „cena z cennika od pierwszego dnia, bez promocji-przynęty” | „odnowienie zawsze po cenie z cennika (45 zł / 399 zł); rabat na start widzisz przed zapłatą” | Decyzja właściciela: rabat startowy zostaje (trial.cardEnabled, −10% / −15%). Przewagą jest brak szoku przy odnowieniu, nie brak rabatu. |
| Apple Pay, Google Pay | karta, BLIK, przelew online (Przelewy24, Stripe) | Checkout ustawia tylko `card` i `p24`; portfele zależą od ustawień Stripe (OPERATIONAL_CHECKLIST — nieodhaczone). Po włączeniu w Stripe można wrócić. |
| przypomnienia „7 dni przy rocznym, 3 dni przy miesięcznym” | „7, 3 i 1 dzień wcześniej” | Tak działa `renewal-reminder.scheduler.ts`. |
| „wyłączenie odnowienia jednym przełącznikiem” | „rezygnacja z odnowienia w panelu w dwóch kliknięciach” | W panelu jest przycisk „Zrezygnuj” z potwierdzeniem. |
| „opłata rozliczana proporcjonalnie” (odstąpienie) | „zasady odstąpienia i zwrotu opisuje regulamin; zwrot realizuje wsparcie” | Panel mówi, że zwrot nie jest automatyczny. |
| „domeny odnawiają się wyłącznie po opłaceniu” | „domena nie odnowi się bez Twojej decyzji” | Kod OK (autoRenew=false), ale szkic regulaminu §12 ust. 5 sugeruje odnowienie z portfela — **do poprawy w regulaminie**. |
| „konfiguracja zoptymalizowana pod WordPress” (/hosting) | „WordPress jednym kliknięciem i staging” | LiteSpeed Cache (J-02) czeka na sprawdzenie na węźle. |

Stopka w CMS (Payload → globalny „Footer”): domyślny tekst poprawiony w kodzie, ale **zapisana na produkcji wartość** może nadal zawierać Apple Pay / Google Pay — sprawdź w adminie CMS.

## Zostaje, ale wymaga D3 przed kampanią

- Kopia poza serwerem „z każdego z ostatnich 30 dni” (H-04/H-14), kopia bezpieczeństwa przed przywróceniem (H-09) — zrobione w kodzie, czekają na węzeł.
- Migracja poczty migratorem (E-21) — po poprawce bezpieczeństwa, czeka na węzeł.
- Program resellerski „wielu klientów z jednego panelu” (O-05…O-07 CZĘŚCIOWE).
- Rejestracja domen — za flagą `REGISTRAR_PROVIDER`; preflight startu blokuje go bez niej.
- „50 GB NVMe” — brak dowodu sprzętowego, potwierdzić przy zakupie węzła (PB-02).

## Nowe: /specyfikacja (PB-07)

Strona gotowa, ukryta (`SPECYFIKACJA_OPUBLIKOWANA = false` w `apps/www/src/lib/oferta.ts` → 404, brak w menu i sitemapie).
Pokazuje tylko wiersze DZIAŁA; wiersze zrobione w kodzie, a czekające na węzeł (CloudLinux, LiteSpeed, PostgreSQL, Redis,
WAF, kopia off-site, CalDAV…) włącza `SPEC_PO_WERYFIKACJI = true` w samej stronie — po D3.
SLA: strona `/funkcje/sla` już istnieje.

## Pomiar (PB-08)

GTM (Consent Mode v2, domyślnie wszystko odrzucone) na całej stronie; na landingu `generate_lead` (wartość 399) po udanym
wysłaniu formularza migracji → konwersja „Lead” w Google Ads. Do zrobienia przez właściciela: wstrzymać zdublowany tag „GA4”
w kontenerze i sprawdzić w GTM Preview, że konwersja liczy się raz.

## Przy okazji znalezione i naprawione w kodzie

`ops/scripts/prod-sync-server-da-packages.sh` nie znał planu `verris-hosting` i nadpisałby jego pakiet DirectAdmina limitami
„starter” (1 domena, 25 skrzynek), a API nie poprawia istniejącego pakietu. Dodany wpis + test parytetu z `da-package-spec.ts`.
