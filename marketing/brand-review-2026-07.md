# Brand-review — verris.pl, landing, blog, kampanie (2026-07)

Zakres: strona `apps/www` (wszystkie podstrony), landing `/przenies-strone`, 14 wpisów bloga,
plan Google Ads, plan Meta Ads, sekwencje e-mail, kreacje. Kryteria: zasady twarde ze skilla
`verris-marketing` (compliance) + ton marki.

Legenda: **[BLOCKER]** wstrzymuje publikację · **[HIGH]** poprawić przed kampanią ·
**[MED]** decyzja Dominika · **[OK]** zweryfikowane, bez uwag.

---

## 1. [BLOCKER] Claim „wydajność do 24×" — brak pokrycia · **POPRAWIONE**

Zasada: *obietnice tylko takie, które mają pokrycie w specyfikacji*.

**Problem:** „Maksymalna wydajność do 24× w piku" sugerowała 24-krotny wzrost wydajności. W rzeczywistości
**24 to liczba vCPU, nie mnożnik**. Realne mnożniki względem bazy:

| Zasób | Baza | Max | Mnożnik |
|---|---|---|---|
| CPU | 2 vCPU | 24 vCPU | **12×** |
| RAM | 8 GB | 64 GB | 8× |
| Dysk | 50 GB | 1000 GB | 20× |

**Poprawione (przed → po):**
- „Maksymalna wydajność **do 24×** w piku" → „Maksymalna moc w piku — **do 24 vCPU**"
- „wydajność do 24× w piku" (stat) → „moc CPU do **12× bazy**"
- „…24 vCPU — wydajność do 24× w piku" → „…24 vCPU — **do 12× mocy CPU względem bazy**"

Miejsca: `Pricing.tsx`, `page.tsx` (homepage), `hosting/page.tsx`, `lib/features.ts`, prototyp
`verris-home.html`. Zweryfikowane: w repo nie ma już żadnego „24×".

---

## 2. [HIGH] Twierdzenie o konkurencji · **POPRAWIONE**

**Było:** „Statystyki odwiedzin bez danych osobowych i bez banera zgód. **Konkurencja każe wpinać GA.**"
**Jest:** „…bez banera zgód — **zamiast wpinania zewnętrznych skryptów**."

Powód: uogólnione twierdzenie o praktykach konkurencji to reklama porównawcza bez weryfikowalnego,
reprezentatywnego porównania (i bez daty/źródła). Neutralne sformułowanie niesie ten sam sens bez ryzyka.

---

## 3. [MED] KSeF jako badge zaufania — decyzja Dominika

Zasada mówi: *nie używać jako wyróżników: faktury KSeF, polski support (to standard)*.

- **Stopka** („Faktury gotowe na KSeF" w linii informacyjnej) — **OK**, to fakt, nie wyróżnik.
- **Trust strip na `/przenies-strone`** — „Faktury gotowe na KSeF" stoi jako jeden z 4 znaczków
  zaufania, obok SLA i danych w UE. To już jest użycie jako wyróżnik.
- **Wpis blogowy** `hosting-z-faktura-ksef.md` — pisze wprost „to standard, nie luksus". **OK**
  (temat SEO, nie claim przewagi).

**Rekomendacja:** w trust stripie LP podmienić KSeF na realny wyróżnik, np. *„Kopie z samodzielnym
odtwarzaniem"* albo *„Analityka bez cookies"*. Nie zmieniałem — to Twoja decyzja.

---

## 4. [MED] Ostry sąd o rynku — decyzja Dominika

Fraza „Rynek hostingu ma trzy sprawdzone sposoby na Twoje pieniądze. Wszystkie są legalne.
**Żaden nie jest uczciwy.**" (LP `/przenies-strone` + mail E2 sekwencji nurture).

Nie łamie zasad (brak nazw konkurentów, brak nieprawdy), ale to mocny sąd wartościujący o całym rynku.
Świadoma decyzja: **zostawić** (mocne pozycjonowanie „hosting bez gwiazdek") albo złagodzić do
„Żaden nie jest wobec Ciebie uczciwy". Zostawiłem bez zmian.

---

## 5. [OK] Zweryfikowane — bez uwag

| Obszar | Status |
|---|---|
| **Ceny brutto PLN** | ✓ wszędzie (45 zł/mies, 399 zł/rok), także w `pricing.md` i kreacjach |
| **Omnibus** (najniższa cena z 30 dni) | ✓ n/d — nie prowadzimy promocji; brak cen przekreślonych |
| **SLA** | ✓ wyłącznie „99,5% z rekompensatami"; nigdzie „100% uptime" (tylko jako to, czego *nie* obiecujemy) |
| **Green claims** | ✓ brak; „ECO" występuje wyłącznie jako nazwa funkcji zwalniającej zasoby |
| **Fałszywe scarcity** | ✓ brak („ostatnie miejsca", liczniki, „tylko dziś") |
| **Nazwy konkurentów w treściach publicznych** | ✓ brak (dhosting/cyberfolks tylko w dokumentach wewnętrznych) |
| **„Bez limitu"** (strony/skrzynki/transfer) | ✓ zawsze z notą fair use („realnym ogranicznikiem są zasoby konta") — homepage, cennik, FAQ, `pricing.md` |
| **„Nielimitowane zasoby"** | ✓ nigdzie — zasoby mają jawną specyfikację i jawny limit maks. |
| **Prawo odstąpienia** | ✓ opisane z zastrzeżeniem proporcjonalnego rozliczenia (FAQ LP) |
| **RODO/PKE w mailach** | ✓ double opt-in, link rezygnacji, dane nadawcy, rozdział marketing/transakcje |
| **Disclaimer prawny** | ✓ wpis `rodo-a-hosting.md` zawiera „nie stanowi porady prawnej" |
| **Dostępność (EAA)** | ✓ `alt` wymagany w kolekcji Media; kontrast Mint/Pine i Paper/Pine ≥ 4,5:1; info nie tylko kolorem |
| **Meta Ads copy** | ✓ ceny brutto, brak scarcity, brak nazw konkurentów |
| **Prośba o opinię (mail B5)** | ✓ bez gratyfikacji (gratyfikowane opinie = ryzyko UOKiK) |

---

## 6. Do zrobienia przed startem kampanii (nie-compliance, ale blokuje jakość)

- [ ] **TTF Schibsted Grotesk 800 + Hanken Grotesk** → `branding/04_typography/`; przegenerować
      kreacje rastrowe (dziś Work Sans jako zamiennik roboczy). **Nie publikować lockupów logo
      z wordmarkiem** do tego czasu.
- [ ] **Autor wpisów bloga** (pole `author` już jest w CMS) — E-E-A-T i schema `BlogPosting`.
- [ ] Decyzje z pkt. 3 i 4 powyżej.
- [ ] Tytuł homepage skrócić do ~55 znaków (dziś 62 — ryzyko ucięcia w SERP; szczegóły w audycie SEO).

---

## Podsumowanie

Jeden **blocker** (claim „24×") — poprawiony w kodzie i prototypie. Jedna poprawka **HIGH**
(twierdzenie o konkurencji) — wprowadzona. Dwie kwestie **MED** czekają na Twoją decyzję.
Reszta materiałów przechodzi compliance bez uwag: ceny brutto, brak green claims, brak scarcity,
SLA wyłącznie 99,5%, „bez limitu" zawsze z notą fair use, maile zgodne z PKE/RODO.
