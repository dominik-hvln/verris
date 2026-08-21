# Model wsparcia 24/7 — Verris (CMP-2)

Cel: dorównać i przewyższyć wsparcie konkurencji (dhosting/cyberFolks chwalone za 24/7),
**bez przepalania budżetu na duży zespół od pierwszego dnia**. Zasada: maksymalnie dużo
spraw rozwiązuje się **samoobsługowo i automatycznie (tier-0)**, a ludzie wchodzą tam,
gdzie naprawdę trzeba. To wprost wykorzystuje nasze przewagi (prowadzenie za rękę,
diagnostyka, naprawa 1-klik).

> Status: dokument operacyjny. Część tier-0 jest już w produkcie (oznaczone ✅).
> Reszta to procedura + zatrudnienia finansowane z rundy pre-seed.

---

## 1. Piramida wsparcia

```
        ┌─────────────────────────────┐
        │  Tier-2  inżynieria / NOC    │  rzadkie, złożone (infra, dane)
        ├─────────────────────────────┤
        │  Tier-1  agent wsparcia      │  konta, billing, konfiguracja
        ├─────────────────────────────┤
        │  Tier-0  AUTOMAT + SAMOOBSŁUGA│  większość zgłoszeń, 24/7, koszt ~0
        └─────────────────────────────┘
```

Cel ilościowy: **≥ 60–70% spraw zamykanych na tier-0** (bez człowieka), dzięki czemu
mały zespół realnie ogarnia 24/7.

---

## 2. Tier-0 — automat i samoobsługa (rdzeń przewagi)

Działa 24/7, natychmiast, bez kosztu osobowego. Co już mamy:

- ✅ **Asystent „co dalej"** i prowadzenie za rękę w każdym widoku (GUIDE-1).
- ✅ **Diagnostyka usługi** — składa stan konta/węzła/monitoringu w konkretne wskazówki (ADM-2 + klient).
- ✅ **Naprawa jednym kliknięciem** — SSL/DNS/PHP i typowe problemy bez ticketu (GUIDE-3).
- ✅ **Backup + przywracanie 1-klik** — klient sam cofa zmiany (CMP-1).
- ✅ **Baza wiedzy w panelu** z klikalnymi podpowiedziami + podpowiedzi KB przy zakładaniu ticketu (SUP-1/2, FEAT KB).
- ✅ **Status page publiczny** + strona „Zaufanie/gwarancje" (CMP-3) — odciąża „czy coś nie działa?".
- ✅ **Powiadomienia proaktywne** (monitoring, SSL wygasa, niedobór portfela) — problem łapany zanim klient zgłosi.

Do dołożenia (tier-0):
- Tryb „kreatora rozwiązania" dla top-10 najczęstszych zgłoszeń (skrypt krok-po-kroku w panelu).
- Publiczne FAQ/KB zindeksowane pod SEO (część CMP-3/treści).

---

## 3. Tier-1 / Tier-2 — ludzie

| Tier | Zakres | Kto | Kanały |
|---|---|---|---|
| **Tier-1** | Konta, billing/portfel, konfiguracja, pytania ogólne | Agent wsparcia | Ticket w panelu, e-mail, czat (godziny robocze) |
| **Tier-2** | Infrastruktura, dane, incydenty węzła, migracje złożone | Inżynieria / NOC (founder + hire) | Eskalacja z tier-1, on-call |

Kanały kontaktu mamy: **system ticketów w panelu** (✅, z CSAT po zamknięciu — SUP-4) +
e-mail. Czat na żywo: do dodania (widget w panelu kierujący najpierw do tier-0).

---

## 4. SLA per plan (widoczne dla klienta)

Już mamy **widoczne SLA wsparcia per plan** (SUP-5) oraz **kredyty SLA za przestój
infrastruktury** (SLA-1). Proponowane czasy pierwszej odpowiedzi (FRT):

| Plan | FRT (cel) | Okno |
|---|---|---|
| Starter / trial | < 24 h | dni robocze |
| Standard | < 8 h | dni robocze + dyżur wieczorny |
| Pro / VPS | < 2 h | 7 dni / dyżur |
| Krytyczne (usługa DOWN) | < 30 min reakcji | **24/7 on-call** |

Krytyczne incydenty (usługa niedostępna) są obsługiwane 24/7 od startu — przez on-call,
nie przez pełną obsadę nocną.

---

## 5. Model 24/7 bez dużego zespołu (fazowo)

**Faza 1 (start, runda pre-seed):**
- Tier-0 automat 24/7 (już działa).
- Tier-1 ludzie w godzinach rozszerzonych (np. 8:00–22:00, 7 dni) — 1–2 osoby + founder.
- **On-call 24/7 tylko dla krytycznych** (alert z monitoringu/watchdog floty → telefon/Slack/PagerDuty-like).

**Faza 2 (po trakcji / seed):**
- Pełna obsada zmianowa lub partner outsourcingowy na noce.
- Rozszerzenie czatu na żywo 24/7.

Automatyczne alerty krytyczne już mamy: **ops watchdog floty** (offline węzła, dzienny
raport) + **monitoring stron** + **proaktywne powiadomienia**. To zasila on-call.

---

## 6. Metryki jakości (mierzymy od dnia 1)

- **CSAT** po zamknięciu ticketu (✅ SUP-4).
- **FRT** (czas pierwszej odpowiedzi) vs SLA per plan.
- **% spraw zamkniętych na tier-0** (cel ≥ 60–70%).
- **Deflection rate** KB/diagnostyki (ile zgłoszeń „rozeszło się" bez agenta).
- **Czas do rozwiązania (TTR)** dla tier-1/2.

Te metryki trafiają do dashboardu biznesowego (BIZ-1) jako wskaźniki operacyjne.

---

## 7. Co finansuje runda (powiązanie z CMP-2)

- 1–2 etaty Tier-1 (wsparcie) + część etatu inżynieria/NOC (Tier-2).
- Narzędzie on-call/alerting (escalation) + czat na żywo.
- Treści KB/FAQ pod SEO (deflection).

Efekt: **wsparcie 24/7 w odbiorze klienta** (krytyczne zawsze, reszta szybko), przy
koszcie osobowym znacznie niższym niż u konkurencji — bo tier-0 robi większość roboty.
W macierzy konkurencji to przesuwa „Wsparcie 24/7" z ◐ na ✓ po wdrożeniu Fazy 1.
