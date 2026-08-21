# Analiza konkurencji — Verris vs rynek (czerwiec 2026, wersja rozszerzona)

Dokument strategiczny i operacyjny. Cel: precyzyjnie pokazać **co mamy**, **co się
pokrywa z konkurencją**, **gdzie mamy przewagę** oraz **czego nam brakuje / co jest
za słabo** — z severity, szacunkiem wysiłku i mapą na sprinty (backlog CMP).

Główny punkt odniesienia: **dhosting** (najbliższy modelowi Verris: baza + zużycie).
Pozostali: home.pl, cyberFolks, Seohost, Hostinger.

> Metodyka: dane o konkurencji z publicznych źródeł 2026 (strony, cenniki, pomoc,
> recenzje). Funkcje Verris — z repozytorium i wdrożeń produkcyjnych. Tam gdzie nie
> mamy pewności co do konkurenta: **„(do weryfikacji)”**. Legenda macierzy:
> **✓** pełne · **◐** częściowe / do dopieszczenia · **✗** brak · **?** do weryfikacji.

---

## 1. Streszczenie zarządcze

1. **Model pay-as-you-go jest już sprawdzony w PL** (dhosting EWH od lat). To
   *de-risk* popytu, nie zagrożenie. Verris wygrywa **egzekucją**, nie wynalazkiem.
2. **Funkcjonalnie jesteśmy na poziomie lub powyżej** najlepszego konkurenta —
   przewagę dają: jeden portfel na całość, brak pułapki cenowej, **EKO per konto**,
   **prowadzenie za rękę + naprawa 1-klik**, KSeF natywnie, passkeys, nowoczesny stack.
3. **Nasze realne ryzyko jest niefunkcjonalne**: brak historii/zaufania, brak
   wsparcia 24/7, mniej dopieszczone self-service backupy, brak no-code buildera,
   niedojrzała reputacja IP poczty, mniejsza skala. To są priorytety sprintów.
4. **Najmocniejszy, w 100% prawdziwy hak marketingowy:** koniec ze **skokiem ceny
   przy odnowieniu** (dhosting ~2×, Seohost ~2,6×, Hostinger wielokrotnie).

---

## 2. dhosting — pełny teardown

**Pozycjonowanie:** „Niezawodny hosting, domeny, darmowa migracja”. Lata na rynku,
ambicje ekspansji (USA). Panel **dPanel** chwalony za prostotę i pracę zespołową.

**Model rozliczeniowy — Elastyczny Web Hosting (EWH):**
- Abonament bazowy z gwarantowanymi CPU/RAM/SSD.
- **Nadwyżki ponad bazę** rozliczane **godzinowo**, w trybie **prepaid**.
- Limity kosztów (dzienny/tygodniowy/miesięczny) w dPanel + **kalkulator zasobów** na stronie.
- Skalowanie „za zgodą i tylko przy zapotrzebowaniu”.

**Cennik (netto, orientacyjnie 2026):**
- EWH 2.0: ~**200 zł 1. rok → ~399 zł** kolejne (**~2×**).
- SWH (tańszy): ~**89 zł → ~229 zł** (**~2,6×**).

**Co mają mocnego (i dopieszczonego):**

| Obszar | Stan u dhosting | Wniosek dla nas |
|---|---|---|
| Backupy | Dzienne, 7 dni + na żądanie, **restore 1-klik** (strona i baza) z panelu | Dorównać UX-em (CMP-1) |
| Staging | Kopia strony do testów | Mamy + push-to-live |
| WordPress | Wsparcie + **AI Site Builder** (no-code) | Brakuje nam buildera (CMP-4) |
| SSL | Darmowy Let's Encrypt, automatyczny | Parytet |
| Wsparcie | **24/7**, chwalone | Nasza luka (CMP-2) |
| Migracja | Darmowa (asystowana) | Mamy self-service — dostroić importery (CMP-10) |
| dPanel | Intuicyjny, zespołowy | My: prowadzenie za rękę + naprawa 1-klik (przewaga) |
| Kalkulator | Zasobów, na stronie | Zrobić lepszy (CMP-7) |

**Słabe punkty dhosting (nasze okazje):**
- **Skok ceny przy odnowieniu ~2×** — główny ból klienta.
- **Brak realnych metryk EKO** per konto (kWh/CO₂).
- EWH to nadal **roczna baza + nadwyżki**, nie czysty portfel godzinowy na całość oferty.
- **WAF nieszczelny** (testy: nie blokuje wszystkiego) — pole na przewagę „bezpieczeństwo”.
- UX klasyczny — brak „prowadzenia za rękę”/automatycznej naprawy problemów.

---

## 3. Pozostali konkurenci (skrót)

| Gracz | Model | Mocne | Słabe / okazja |
|---|---|---|---|
| **home.pl** | Abonament | Skala, marka, domeny, B2B | Drogo, ciężki UX, brak usage-billingu, lock-in |
| **cyberFolks** | Abonament | Marketing, wsparcie, LiteSpeed/performance | Brak prawdziwego pay-as-you-go |
| **Seohost** | Abonament | Tanie wejście, nisza SEO (osobne IP) | Odnowienie ~2,6×, podwyżki 30–35% |
| **Hostinger** | Abonament (intro→renewal) | Globalna skala, ceny intro, **AI builder**, „green” (RES) | Duże skoki odnowień; „green” to ogólne RES-y (nie metryki per konto); słabszy lokalnie (KSeF, PL-support) |

---

## 4. Macierz parytetu funkcji (granularna)

| # | Funkcja | Verris | dhosting | Reszta rynku |
|---|---|:--:|:--:|:--:|
| **Infrastruktura** ||||
| 1 | Serwer WWW LiteSpeed | ✓ | ? | ◐ (cyberFolks ✓) |
| 2 | CloudLinux LVE (izolacja kont) | ✓ | ✓ | ◐ |
| 3 | Własne centra danych / skala | ✗ (węzły Hetzner/OVH) | ✓ | ✓ |
| **Rozliczenia** ||||
| 4 | Prepaid wallet jako uniwersalna waluta | ✓ | ◐ (prepaid do nadwyżek) | ✗ |
| 5 | Rozliczanie godzinowe na całą ofertę | ✓ | ◐ (tylko nadwyżki ponad bazę) | ✗ |
| 6 | Limity / bezpiecznik kosztów | ✓ | ✓ | ✗ |
| 7 | Brak skoku ceny przy odnowieniu | ✓ | ✗ (~2×) | ✗ (~2–2,6×+) |
| **Dane i ciągłość** ||||
| 8 | Backup dzienny + retencja | ✓ (off-site) | ✓ (7 dni) | ✓ |
| 9 | Restore 1-klik w panelu klienta (strona+DB) | ◐ (do dopieszczenia) | ✓ | ◐ |
| 10 | Backup off-site (poza węzłem) | ✓ | ? | ? |
| 11 | Staging + push-to-live | ✓ | ◐ (staging ✓; push-to-live ?) | ◐ |
| **Aplikacje / WWW** ||||
| 12 | Instalator WordPress 1-klik | ✓ | ✓ | ✓ |
| 13 | Kreator stron no-code / AI builder | ✗ | ✓ | ◐ (Hostinger ✓) |
| 14 | Marketplace 1-klik (Nextcloud/PrestaShop…) | ✓ | ◐ | ◐ |
| 15 | PHP selector (wersja per konto) | ✓ | ✓ | ✓ |
| **Poczta** ||||
| 16 | Skrzynki + webmail (Roundcube) | ✓ | ✓ | ✓ |
| 17 | Dashboard deliverability (SPF/DKIM/DMARC/RBL) | ✓ | ◐ | ✗ |
| 18 | Dojrzała reputacja IP / warm-up | ✗ (nowe IP) | ✓ | ✓ |
| **Domeny / DNS / SSL** ||||
| 19 | Rejestracja domeny w checkout | ✓ | ✓ | ✓ |
| 20 | Szeroki katalog + konkurencyjne ceny domen | ◐ | ✓ | ✓ |
| 21 | Pełny manager DNS | ✓ | ✓ | ✓ |
| 22 | Darmowy SSL auto (Let's Encrypt) | ✓ | ✓ | ✓ |
| **Bezpieczeństwo** ||||
| 23 | WAF (ModSecurity/OWASP) | ✓ | ◐ (nieszczelny) | ◐ |
| 24 | Passkeys (logowanie bez hasła) | ✓ | ✗ | ✗/rzadko |
| 25 | 2FA + aktywne sesje + log aktywności | ✓ | ◐ | ✗ |
| 26 | RODO: eksport / usunięcie danych | ✓ | ◐ | ◐ |
| **Monitoring / SLA** ||||
| 27 | Monitoring uptime / SSL-expiry / czas odpowiedzi | ✓ | ◐ | ◐ |
| 28 | Kredyty SLA za przestój | ✓ | ◐ | ✗ |
| **Wyróżniki** ||||
| 29 | Realne EKO per konto (kWh/CO₂) | ✓ | ✗ | ✗ (Hostinger: ogólne „green”) |
| 30 | KSeF natywnie | ✓ | ◐ (do weryfikacji) | ◐ |
| **UX / obsługa** ||||
| 31 | Prowadzenie za rękę + asystent „co dalej” | ✓ | ✗ | ✗ |
| 32 | Naprawa 1-klik (SSL/DNS/PHP) bez ticketu | ✓ | ✗ | ✗ |
| 33 | Tryb prosty / zaawansowany | ✓ | ✗ | ✗ |
| 34 | Wsparcie 24/7 (ludzie) | ◐ | ✓ | ◐ (cyberFolks ✓) |
| 35 | Migracja self-service 1-click | ✓ | ◐ (darmowa, asystowana) | ◐ |
| **VPS / platforma** ||||
| 36 | VPS/Cloud + API provisioning + klucze SSH | ✓ (Hetzner) | ◐ (VPS ✓; API ?) | ◐ |
| 37 | Nowoczesny stack + zero-downtime deploy | ✓ | ? | ? |
| **Niefunkcjonalne** ||||
| 38 | Lata na rynku / recenzje / zaufanie | ✗ | ✓ | ✓ |

---

## 5. Co się POKRYWA (parytet — nie sprzedajemy jako wyróżnik)

Prepaid + rozliczanie nadwyżek + limity kosztów (dhosting EWH) · darmowy SSL ·
staging · instalator WordPress · dzienne backupy · WAF (oba niedoskonałe) ·
darmowa migracja · manager DNS · PHP selector · webmail.

---

## 6. Nasza PRZEWAGA + trwałość (jak łatwo skopiować)

| Przewaga | Wartość | Trwałość przewagi |
|---|---|---|
| Jeden portfel godzinowy na całą ofertę | „Płać tylko za to, co używasz” na wszystkim | **Średnia** — dhosting może rozszerzyć EWH |
| Brak pułapki cenowej przy odnowieniu | Najmocniejszy hak migracyjny | **Średnia** — to decyzja cenowa konkurencji |
| **EKO per konto (kWh/CO₂)** | Argument ESG/CSR, PR | **Wysoka** — wymaga telemetrii i podejścia od zera |
| Prowadzenie za rękę + naprawa 1-klik + asystent | Niższy próg, mniej ticketów, wyższy NPS | **Wysoka** — głęboko w produkcie/UX |
| KSeF natywnie | Obowiązek 2026 | **Średnia** (czasowa — inni dogonią) |
| Passkeys + sesje + log + RODO | Bezpieczeństwo/zaufanie | **Średnia** |
| Nowoczesny stack + autoskalowanie LVE realtime + zero-downtime | Marża operacyjna, stabilność | **Wysoka** — dług technologiczny konkurencji |
| Pełna automatyzacja operatora (kreator węzła, cockpit migracji, diagnostyka, MRR/churn) | Niski koszt operacyjny | **Wysoka** |

> Wniosek: najtrwalsze przewagi to **EKO, UX „prowadzenie za rękę”, automatyzacja
> operatora i nowoczesny stack**. Na nich budujemy narrację — bo cenę i pojedyncze
> funkcje konkurent skopiuje szybciej.

---

## 7. Czego nam BRAKUJE / za słabo — severity, wysiłek, sprint

| ID | Luka | Severity | Wysiłek | Sprint |
|---|---|:--:|:--:|:--:|
| **CMP-1** | Restore 1-klik (strona+DB) w panelu klienta | **Wysoki** | Śr | P0 |
| **CMP-2** | Wsparcie 24/7 (tier-0 auto + on-call + SLA) | **Wysoki** | Śr–Duży | P0 |
| **CMP-3** | Zaufanie: status page, benchmarki, opinie, gwarancje | **Wysoki** | Śr | P0 |
| **CMP-4** | Kreator stron no-code / starter-templates | Średni | Duży | P1 |
| **CMP-5** | Deliverability poczty: warm-up IP + reputacja | Średni | Śr | P1 |
| **CMP-6** | Domeny: katalog + konkurencyjne ceny | Średni | Śr | P1 |
| **CMP-7** | Interaktywny kalkulator kosztów (marketing) | Niski–Śr | Mały | P1 |
| **CMP-8** | Hardening WAF + pen-test + komunikacja | Średni | Śr | P2 |
| **CMP-9** | Skala floty + redundancja geograficzna | Średni | Duży (capex) | P2 |
| **CMP-10** | Importery migracji per konkurent | Średni | Śr | P2 |

**Dlaczego taka kolejność:** P0 to rzeczy, które przy starcie decydują o recenzjach
i konwersji (backupy, wsparcie, zaufanie) — tu dhosting jest mocny i tam nas porównają.
P1 podnosi konwersję (builder, kalkulator, poczta, domeny). P2 to przewaga
średnioterminowa i skalowanie z rundy.

---

## 8. Strategia konkurencyjna

- **Narracja:** nie „wymyśliliśmy zużycie” (dhosting to ma), lecz „zrobiliśmy to
  lepiej i na wszystkim — jeden portfel, bez pułapki cenowej, z realnym EKO i panelem,
  który prowadzi za rękę i sam naprawia problemy”.
- **Hak migracyjny #1:** „koniec ze skokiem ceny w 2. roku”. Kampania celowana w
  klientów dhosting/Seohost/Hostinger ~2 mies. przed ich odnowieniem.
- **Hak #2 (B2B/ESG):** EKO per konto + KSeF natywnie.
- **Kanał:** migracja 1-click (CMP-10) jako główny silnik pozyskania + partnerstwa
  z agencjami (panel obniża ich koszt wsparcia).

## 9. Ryzyka konkurencyjne (co zrobią, gdy urośniemy)

- dhosting może **rozszerzyć EWH** do pełnego portfela i **wyrównać cenę odnowienia** —
  dlatego nie opieramy całej narracji na cenie, tylko na EKO/UX/automatyzacji.
- Duzi (home.pl, Hostinger) mogą **dociąć ceną** — nie wchodzimy w wojnę cenową,
  gramy wartością i niszą (PL, ESG, opieka).
- **Zaufanie** to nasza największa niefunkcjonalna luka — budujemy je dowodami
  (status page, benchmarki, SLA, opinie) od pierwszego dnia.

Źródła (publiczne, 2026): dhosting.pl (oferta, dPanel, EWH 2.0, kalkulator zasobów,
pomoc/backupy, AI Site Builder), recenzje (jakwybrachosting, wojciechmatula, hostgrade,
hostingonline), Seohost.pl, Hostinger (pricing, renewable energy), Statista / Data
Bridge / Grand View (rozmiar rynku).

---

## 10. Potwierdzenie zakresu konkurencji (czerwiec 2026)

Zweryfikowane publicznie: **dhosting, home.pl, cyberFolks, Seohost — wszyscy mają
VPS oraz serwery dedykowane**; home.pl i Seohost oferują też **2FA** w panelu;
home.pl/Hostinger komunikują „green/green IT" (ogólne, nie metryki per konto).

Wniosek dla macierzy: **VPS, poczta, domeny, backupy i 2FA to parytet rynkowy** —
nie sprzedajemy ich jako wyróżnik. Realne, potwierdzone przewagi Verris: model
rozliczeniowy (portfel + godziny na całość), brak skoku ceny przy odnowieniu,
**EKO per konto (kWh/CO₂)**, prowadzenie za rękę + naprawa 1-klik, **passkeys**
(konkurencja ma 2FA, nie passkeys).

## 11. Prognoza i założenia (ilustracyjne — do walidacji)

> Model oddolny, ostrożny. Nie stanowi gwarancji wyników; służy rozmowie z inwestorem.

| Założenie | Wartość |
|---|---|
| Start komercyjny | Q3 2026 |
| ARPU (blended) | ~35 → 45 zł/mc (hosting/poczta/VPS + upsell autoskalowania) |
| Klienci płacący (koniec roku) | ~300 (2026) → ~1 800 (2027) → ~6 000 (2028) |
| Churn miesięczny | ~3% (portfel prepaid obniża odpływ) |
| Marża brutto | ~65% (infra Hetzner/OVH + wysoka automatyzacja) |
| Główne kanały | migracje 1-click, free trial, partnerstwa z agencjami |

| Rok | MRR (koniec roku) | ARR |
|---|---|---|
| 2026 | ~11 tys. zł | ~0,13 mln zł |
| 2027 | ~75 tys. zł | ~0,9 mln zł |
| 2028 | ~270 tys. zł | ~3,2 mln zł |

Wrażliwość: kluczowe dźwignie to tempo pozyskania (migracje/agencje), ARPU
(upsell autoskalowania + VPS) i churn (retencja przez portfel). Lean runda pre-seed
(~650 tys. zł, ~12 mies.) finansuje dojście do ~500–800 płacących klientów oraz
twardych danych (CAC / churn / retencja) pod rundę seed — nie do pełnego break-even.

---

## 12. Status realizacji backlogu CMP (na bieżąco)

| ID | Pozycja | Status |
|---|---|---|
| CMP-1 | Backupy: restore 1-klik w panelu klienta | ✅ kod gotowy (deploy: panel klienta) |
| CMP-2 | Model wsparcia 24/7 (tier-0 + on-call + SLA) | ✅ dokument `docs/ops/SUPPORT_MODEL_24-7.md` |
| CMP-3 | Zaufanie: status page + strona gwarancji | ✅ status page (był) + `/zaufanie` (nowe); benchmarki/opinie = post-launch |
| CMP-7 | Interaktywny kalkulator kosztów | ✅ `status-page/public/kalkulator.html` |
| CMP-10 | Importery migracji per konkurent | ✅ presety + instrukcje w formularzu migracji klienta |
| CMP-4 | Kreator stron no-code | ✅ **pełny działający kreator** (`SiteBuilderTab` — edytor blokowy, motyw, podgląd, publikacja `index.html` na konto) + szablony |
| CMP-5 | Deliverability poczty: warm-up IP + reputacja | ✅ runbook `docs/ops/EMAIL_DELIVERABILITY_WARMUP.md` (egzekucja na węźle + 1 mały task kodu) |
| CMP-6 | Domeny: katalog + konkurencyjne ceny | ✅ strategia `docs/strategy/DOMAINS_PRICING.md` (fundament w kodzie + decyzje cenowe) |
| CMP-8 | Hardening WAF + pen-test | ✅ runbook `docs/ops/WAF_HARDENING_PENTEST.md` |
| CMP-9 | Skalowanie floty + redundancja | ✅ plan `docs/strategy/FLEET_SCALING.md` |

Wdrożenia z tej serii to głównie panel klienta + apka status-page (kalkulator, strona
zaufania) — bez zmian w schemacie bazy.
