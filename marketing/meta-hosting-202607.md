# Plan kampanii Meta Ads — `meta-*-hosting-202607`

Para dla `gads-search-hosting-202607`. Google Ads łapie **popyt istniejący** (ktoś szuka „zmiana
hostingu"). Meta buduje **popyt utajony** — trafia do firm, które przepłacają, ale jeszcze tego nie
nazwały. Oś przekazu ta sama: **migracja + koniec pułapki odnowieniowej**.

Landing: `https://verris.pl/przenies-strone` (działa, ma kalkulator, HowTo/FAQ schema).
Pixel: `2263705751037556` (wpięty przez GTM, consent-gated). Status: **do uruchomienia po blokerach**.

---

## 1. Cel i KPI

| Poziom | Cel | KPI | Wartość docelowa (pierwsze 60 dni) |
|---|---|---|---|
| Główny | Rejestracje i zamówienia hostingu | `purchase`, `sign_up` | CPA ≤ 120 zł (LTV roczne 349 zł) |
| Pośredni | Intencja zakupu | `begin_checkout` | koszt/zdarzenie ≤ 25 zł |
| Górny lejek | Ruch jakościowy na LP | CTR, koszt/sesję | CTR ≥ 1,0%, ≤ 0,60 zł/klik |

> **Zastrzeżenie pomiarowe:** Consent Mode v2 jest domyślnie `denied`, a Pixel startuje dopiero po
> zgodzie marketingowej. Dane konwersji są z natury **niepełne** — nie porównuj 1:1 z GA4 ani
> z Google Ads. Przy tym budżecie liczby będą też statystycznie słabe; decyzje podejmuj na trendach,
> nie na pojedynczych dniach.

---

## 2. Budżet

Start: **900 zł/mies brutto** (~30 zł/dzień), podział:

- **70% prospecting** (~21 zł/dz) — kampania zimna, cel Traffic → LP.
- **30% remarketing** (~9 zł/dz) — dopiero gdy Pixel zbierze ruch (min. ~2 tyg.).

Po 60 dniach, jeśli CPA się domyka, skalować o 20–30% miesięcznie (nie skokowo — reset uczenia).

---

## 3. Struktura kampanii

### Kampania A — `meta-awareness-hosting-202607` (prospecting)
- **Cel Meta:** Ruch (Traffic) → optymalizacja na kliknięcia linku (na starcie), po ~50 zdarzeniach
  `begin_checkout`/tyg. przełączyć na cel Sales (konwersje).
- **Umiejscowienia:** Advantage+ placements (FB feed, IG feed, Stories, Reels) — wyłączyć Audience Network.
- **Zestawy reklam (3, budżet równy):**
  1. **Właściciele firm / JDG** — zainteresowania: mała firma, przedsiębiorczość, WordPress, strony WWW.
  2. **E-commerce** — WooCommerce, sklep internetowy, Shopify, marketing e-commerce.
  3. **Agencje i freelancerzy** — web development, WordPress, freelancing, projektowanie stron.
- **Geo:** Polska. **Wiek:** 25–60. **Język:** polski.
- **Wykluczenia:** osoby, które już odwiedziły `panel.verris.pl` (klienci).

### Kampania B — `meta-remarketing-hosting-202608` (start po 2 tyg.)
- **Cel Meta:** Sales (konwersje) → `begin_checkout` / `purchase`.
- **Zestawy (kolejność malejącej intencji):**
  1. Odwiedzający `/przenies-strone` lub `/cennik` w ostatnich 14 dniach (bez konwersji).
  2. Osoby, które użyły kalkulatora (zdarzenie `cta_click` z `cta=calculator`).
  3. Zaangażowani w profile FB/IG (90 dni).
- **Częstotliwość:** limit 2–3 wyświetlenia/tydz., żeby nie palić odbiorców.

> **Lookalike** dopiero po ~100 realnych konwersjach — wcześniej podstawa danych jest za słaba.

---

## 4. Kreacje (gotowe w `marketing/kreacje/`)

| Format | Plik | Umiejscowienie |
|---|---|---|
| 1080×1080 | `meta/*_1080x1080.png` | Feed FB/IG |
| 1080×1350 | `meta/*_1080x1350.png` | Feed IG (pion) |
| 1080×1920 | `meta/*_1080x1920.png` | Stories / Reels |

Warianty do testu A/B (po jednym na zestaw, rotacja co 2 tyg.):
- **Wariant A — „Znowu drożej przy odnowieniu?"** (ból: pułapka odnowieniowa).
- **Wariant B — „Hosting bez gwiazdek."** (marka: uczciwe zasady).

> Kreacje rastrowe mają dziś Work Sans jako **zamiennik roboczy** — po wgraniu TTF Schibsted/Hanken
> do `branding/04_typography/` przegenerować przed startem.

---

## 5. Copy (do testu, po 3 warianty)

**Primary text (A — ból):**
1. „Pierwszy rok tani, odnowienie trzy razy droższe? W Verris cena z cennika obowiązuje od pierwszego dnia. Przeprowadzkę strony i poczty bierzemy na siebie — za 0 zł."
2. „Płacisz za moc, której Twoja strona nie używa. Autoskalowanie nalicza tylko godziny realnego zużycia — a tryb ECO zwalnia zasoby, gdy ruch spada."
3. „Sprawdź swoją fakturę za hosting. Jeśli po roku wzrosła — nie musiało tak być. 39 zł/mies brutto, jedna cena, bez gwiazdek."

**Primary text (B — marka):**
1. „Hosting bez gwiazdek. Jedna cena od pierwszego dnia, migracja i SSL w cenie, SLA 99,5% z rekompensatami zapisanymi w regulaminie."
2. „Polski hosting z autoskalowaniem. Płacisz tyle, ile widzisz — bez pułapek odnowień i pakietów na zapas."

**Nagłówki (headline, ≤40 zn.):** „Przenieś stronę za 0 zł" · „Hosting bez gwiazdek" · „39 zł/mies, bez pułapek"

**Opis (description):** „Migracja i SSL w cenie. SLA 99,5% z rekompensatami."

**CTA:** *Dowiedz się więcej* (prospecting) / *Załóż konto* (remarketing).

---

## 6. Pomiar

Zdarzenia idą przez **GTM** (hub), a Pixel odpala się wyłącznie po zgodzie marketingowej
(`fbq('consent','grant')` z banera). Mapowanie dataLayer → Meta:

| dataLayer | Meta Pixel |
|---|---|
| `page_view` | PageView |
| `cta_click` | (custom, opcjonalnie) |
| `search` (wyszukiwarka domen) | Search |
| `generate_lead` | Lead |
| `begin_checkout` | InitiateCheckout |
| `purchase` (w panelu) | Purchase (wartość PLN) |

Do zrobienia przed startem: **Conversions API (CAPI)** przez GTM server-side lub integrację Meta —
bez tego jakość sygnału po stronie iOS/blokerów będzie niska.

---

## 7. Compliance (twarde)

- **Meta Controller Addendum** zaakceptowany przed startem remarketingu.
- Ceny **brutto** w każdej kreacji i copy; przy promocji — najniższa cena z 30 dni (Omnibus).
- **Zero fałszywego scarcity** („ostatnie miejsca", „tylko dziś") — nie stosujemy.
- **Bez nazw konkurentów** w reklamach; porównania wyłącznie ogólne („typowy hosting").
- SLA wyłącznie „99,5% z rekompensatami" — nigdy „100%".
- Brak twierdzeń środowiskowych (ECO = nazwa funkcji, nie claim ekologiczny).
- Remarketing wyłącznie na zgodzie (Consent Mode v2); custom audiences z uploadu list — tylko po
  potwierdzeniu podstawy prawnej.
- Każda finalna kreacja i copy → `marketing:brand-review`.

---

## 8. Harmonogram

| Faza | Czas | Co się dzieje |
|---|---|---|
| 0. Setup | przed startem | Controller Addendum, weryfikacja Pixela, CAPI, kreacje z docelowymi fontami |
| 1. Nauka | tyg. 1–2 | Tylko prospecting, bez zmian w kampanii (nie resetuj uczenia) |
| 2. Remarketing | tyg. 3 | Dołączenie kampanii B, limit częstotliwości |
| 3. Optymalizacja | tyg. 4–8 | Wyłączanie słabych zestawów, rotacja kreacji co 2 tyg. |
| 4. Skalowanie | od tyg. 9 | +20–30% budżetu/mies, jeśli CPA ≤ 120 zł |

---

## 9. Zasady optymalizacji (kiedy reagować)

- **Nie zmieniaj nic w fazie nauki** (pierwsze 2 tyg. / do ~50 zdarzeń na zestaw).
- Zestaw z CTR < 0,5% po 1000 wyświetleniach → wymień kreację, nie zestaw.
- Zestaw z kosztem/klik > 1 zł przy CTR ≥ 1% → problem z LP/ofertą, nie z targetowaniem.
- Częstotliwość > 3 w 7 dni → rotuj kreację.
- Przy tak małym budżecie **nie dziel budżetu na więcej niż 3 zestawy** — rozmyjesz uczenie.

---

## 10. Ryzyka

1. **Niepełne dane** (Consent Mode + iOS) → decyzje na trendach, CAPI podnosi jakość sygnału.
2. **Mały budżet → wolne uczenie** → nie mnożyć zestawów, nie zmieniać kampanii co kilka dni.
3. **Meta jako kanał popytu utajonego** ma dłuższy zwrot niż Search → oceniaj po 60 dniach, nie po 7.
4. **Kreacje z zamiennikiem fontu** → przed startem podmienić na docelowe.

---

## Blokery przed startem

- [ ] Meta Controller Addendum zaakceptowany
- [ ] Pixel `2263705751037556` zweryfikowany w GTM (odpala się po zgodzie)
- [ ] Conversions API (CAPI) wpięte
- [ ] TTF Schibsted/Hanken → przegenerowane kreacje
- [ ] `marketing:brand-review` kreacji i copy
