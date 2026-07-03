# Verris — Production Readiness, KSeF, Cyberbezpieczeństwo i Kierunki Rozwoju

> Dokument skonsolidowany. Stan na: **2 lipca 2026**.
> Cel: jedno miejsce z (1) odhaczalną checklistą gotowości produkcyjnej,
> (2) decyzją o KSeF, (3) planem testów cyberbezpieczeństwa, (4) roadmapą
> rozwoju z opisami modułów i taskami.
>
> Zasady przewodnie (bez zmian): 100% LIVE (zero mocków na prod),
> bezpieczeństwo + RODO, „klient zaopiekowany w każdym widoku", weryfikacja
> względem realnych API (DirectAdmin/CloudLinux/LiteSpeed/OVH/Stripe/MF).

---

## 0. Werdykt w jednym akapicie

Platforma jest **funkcjonalnie kompletna** (236 zadań zamkniętych, zero
`TODO/FIXME` w kodzie, CI/CD + rolling deploy + auto-rollback działa, poczta
transakcyjna na Amazon SES z DKIM/DMARC). **Nie jest jeszcze w 100% „ready for
production"** z trzech powodów, z których żaden nie jest brakiem funkcji:
1. brak **walidacji E2E na licencjonowanym węźle** (licencje CL/LS/DA),
2. niewykonane **blokujące kroki startowe** (legal publish, Stripe live, sekrety),
3. brak **zewnętrznych audytów** (pen-test + przegląd prawny) oraz
   **rozstrzygnięcia KSeF** (nasz kod celuje w nieaktualny FA(2)/KSeF 1.0).

---

## 1. Otwarte taski (jedyne niezamknięte z backlogu)

| ID | Opis | Priorytet | Blokada |
|----|------|-----------|---------|
| #73 | Pełny E2E na żywym koncie (provisioning DA → strona → mail → backup → autoskalowanie) | P1 | Licencja LiteSpeed/CloudLinux |
| #71 | Sentry — monitoring błędów runtime (DSN + pakiet) | P1 | — (szybkie) |
| #72 | Treści Bazy Wiedzy + usunięcie danych testowych z prod | P1 | — |
| #208 | API-GATE — włączanie publicznego API per klient | P2 | — |

---

## 2. Blokery startu (BLOCKING — do odhaczenia przy wdrożeniu)

Wymagają decyzji/akcji operatora, nie kodu. Panel admina ma auto-check:
**Ustawienia → Gotowość do startu LIVE** (`GET /admin/live-readiness`).

- [ ] **Dokumenty prawne opublikowane** — Regulamin + Polityka prywatności
      (bez nich rejestracja jest blokowana w kodzie). Zalecane: DPA + Cookies.
      Drafty: `docs/legal/drafts/`. **Wymaga przeglądu prawnika.**
- [ ] **Stripe LIVE** — `sk_live_…` + produkcyjny `STRIPE_WEBHOOK_SECRET`
      (weryfikacja podpisu webhooka na prod).
- [ ] **Sekrety `.env.prod`** — `APP_KMS_KEY` (≥32 B, backup!), `JWT_SECRET`,
      `POSTGRES_PASSWORD`. Poczta ✅ (SES).
- [ ] **Rotacja danych SMTP SES** — te wklejone wcześniej do czatu należy
      wygenerować od nowa i podmienić w panelu.
- [ ] **Dane firmy do faktur** — nazwa, NIP, adres (+ ewentualnie KSeF).
- [ ] **Węzeł hostingowy z licencjami** — min. 1 zaakceptowany node:
      CloudLinux + LVE + LiteSpeed + LSPHP + DirectAdmin. Odblokowuje #73.
- [ ] **DNS/TLS** — rekordy paneli+API na control-plane, 80/443 otwarte, Caddy OK.
- [ ] **Backup KMS/JWT** — sekrety zapisane w menedżerze haseł/secret vault
      (utrata `APP_KMS_KEY` = utrata dostępu do zaszyfrowanych danych).

---

## 3. Testy wewnętrzne (checklisty istnieją — trzeba je przejść)

- [ ] **Smoke E2E przed LIVE** — `docs/SMOKE_E2E_PRZED_LIVE.md` (42 punkty).
- [ ] **IAM smoke** — `docs/IAM_SMOKE_PROD.md` (role, uprawnienia, impersonacja).
- [ ] **Restore test (drill)** — `docs/ops/RESTORE_TEST.md`: realne odtworzenie
      konta z backupu off-node, nie tylko wykonanie backupu.
- [ ] **Deliverability / inbox placement** — po SES: test trafienia do Inbox
      (Gmail/Outlook/O365), DKIM+DMARC=pass, ewentualny warm-up
      (`docs/ops/EMAIL_DELIVERABILITY_WARMUP.md`).
- [ ] **Test obciążeniowy** — brak w checklistach; dodać: k6/Locust na panele+API
      + limity węzła (LVE) pod realnym ruchem. (patrz task CYBER-7).
- [ ] **BOK ticket smoke** — `docs/ops/BOK_TICKET_SMOKE.md`.
- [ ] **Grafana alerting smoke** — `docs/ops/GRAFANA_ALERTING.md`.
- [ ] **Watchdog poczty** (nowy) — wywołaj sztuczny wzrost FAILED i potwierdź alert.

---

## 4. Audyty zewnętrzne (przed startem komercyjnym)

- [ ] **Pen-test zewnętrzny** — zakres w `docs/ops/WAF_HARDENING_PENTEST.md`:
      OWASP Top 10 (panele + API), auth (passkey/2FA/reset/IDOR), izolacja kont
      (CageFS/LVE), skuteczność WAF (payloady SQLi/XSS/LFI/RCE), infra/TLS/nagłówki,
      tokeny node↔control-plane. Mamy wewnętrzny raport — brak **niezależnego wykonawcy**.
- [ ] **Przegląd prawny** — regulamin, polityka prywatności, DPA, cookies,
      zgodność RODO/UODO (retencja, powierzenie danych, prawa podmiotów).
- [ ] **Księgowość/podatki** — faktury/KSeF zgodne z wymogami 2026, stawki VAT.
- [ ] **(Opcjonalnie) audyt dostępności WCAG 2.2** — argument B2B/sektor publiczny.

---

## 5. KSeF — czy ufać własnej integracji, czy iść w zewnętrzne?

### 5.1. Stan faktyczny (z kodu)

Nasz moduł (`apps/api/src/ksef/`) generuje **FA(2)** (schemat `FA (2)`, wersja
`1-0E`) i rozmawia ze **starym interfejsem KSeF 1.0** (namespace’y
`2021/10/01`, sesja „online", auth ns3 v2). W kodzie jest jawny komentarz
„PRZED LIVE zweryfikować na `ksef-test.mf.gov.pl`".

### 5.2. Dlaczego to jest ryzyko (fakty prawne 2026)

- **Od 1 lutego 2026 obowiązuje FA(3)** i **KSeF 2.0 API** — FA(2) i stary
  interfejs **przestają obowiązywać** dla faktur w obowiązkowym KSeF.
- Wdrożenie etapowe: **1.02.2026** (duzi podatnicy, >200 mln zł obrotu 2024 +
  obowiązkowe **odbieranie** faktur dla wszystkich), **1.04.2026** (pozostali,
  wystawianie B2B).
- MF opublikowało FA(3) + dokumentację KSeF 2.0; środowisko DEMO/przedprodukcyjne
  dostępne od Q4 2025.

**Wniosek:** nasza obecna integracja (FA(2)/KSeF 1.0) **nie jest zgodna** z
obowiązkowym KSeF 2026. W obecnej formie nie można jej „w 100% ufać" jako
rozwiązania produkcyjnego do e-faktur.

### 5.3. Trzy opcje

| Opcja | Opis | Plusy | Minusy |
|-------|------|-------|--------|
| **A. Przepisać na KSeF 2.0/FA(3) samodzielnie** | Nowy builder FA(3), nowy klient API 2.0, nowa autoryzacja (certyfikat/token), obsługa załączników | Pełna kontrola, brak kosztu zewn. per-faktura | Ciągły koszt utrzymania (MF zmienia schematy/terminy), ryzyko compliance po naszej stronie, wymaga śledzenia zmian prawnych |
| **B. Integrator/BSP zewnętrzny** (np. wyspecjalizowany dostawca e-faktur / KSeF-BSP) | Wysyłamy dane faktury do API partnera, on dba o zgodność FA(3)/2.0, podpisy, retry, archiwizację | Zdejmuje z nas ryzyko prawne i utrzymanie; szybciej do zgodności | Koszt (abonament/per-faktura), zależność od dostawcy, dane faktur przez trzeci podmiot (umowa powierzenia/RODO) |
| **C. Hybryda** | Warstwa abstrakcji `InvoicingProvider` (interfejs), za którą stoi albo nasz KSeF 2.0, albo integrator; przełączane flagą | Elastyczność, brak vendor lock-in, można zacząć od integratora i przejść na własne | Trochę więcej pracy architektonicznej na start |

### 5.4. Rekomendacja

**Idź w C (hybryda), start od B (integrator).** Uzasadnienie: przy naszej skali
i zbliżających się terminach compliance ważniejsze niż koszt. Integrator daje
zgodność „od ręki" i zdejmuje ryzyko prawne; warstwa abstrakcji chroni przed
vendor lock-in i pozwala później wnieść własny KSeF 2.0, jeśli wolumen faktur to
uzasadni. Obecny moduł FA(2) traktujemy jako **legacy do wygaszenia**, nie jako
docelowe rozwiązanie.

> **Decyzja do podjęcia przez Ciebie:** wybór konkretnego integratora KSeF-BSP
> (zweryfikuję aktualne opcje, ceny i zakres powierzenia danych, gdy wskażesz kierunek).

### 5.5. Taski KSeF

- **KSEF-2.0-1** — Warstwa abstrakcji `InvoicingProvider` (interfejs: `submit`,
  `status`, `download UPO`, `cancel/correct`) + feature flag `INVOICING_PROVIDER`.
- **KSEF-2.0-2** — Adapter integratora zewnętrznego (klient API partnera, mapowanie
  Invoice → payload, obsługa UPO/statusów, retry, archiwizacja 10 lat).
- **KSEF-2.0-3** — Umowa powierzenia danych (DPA) z integratorem + wpis do
  `subprocessors.md` + aktualizacja polityki prywatności.
- **KSEF-2.0-4** — (opcjonalnie, później) Własny builder **FA(3)** + klient
  **KSeF 2.0** za tym samym interfejsem; testy na DEMO MF.
- **KSEF-LEGACY-1** — Oznaczyć obecny moduł FA(2) jako `@deprecated`, ukryć w UI
  do czasu gotowości ścieżki 2.0 (żeby nikt nie wystawił nieważnej faktury).

---

## 6. Cyberbezpieczeństwo — co mamy, co dorobić, jak testować

### 6.1. Co już jest w systemie (baza)

- **Auth**: passkeys (WebAuthn) + 2FA TOTP, wymuszanie passkey dla admin/staff,
  polityka haseł, blokada logowania (loginBlocked), historia logowań + alerty.
- **Rate limiting** (globalny `RateLimitGuard`) + **fail2ban** na SSH.
- **WAF**: ModSecurity + OWASP CRS per konto (OFF/DETECTION/ON).
- **Izolacja kont**: CloudLinux CageFS/LVE.
- **Sieć**: Caddy TLS, **VPN WireGuard** przed panelami staff/admin, tokeny
  node↔control-plane, dedupe webhooków.
- **Sekrety at-rest**: szyfrowanie AES-256-GCM (`APP_KMS_KEY`).
- **RODO**: eksport/usunięcie danych, anonimizacja, DPA, retencja, audit log.
- **Poczta/anty-spam**: SPF/DKIM/DMARC, rspamd, monitoring RBL floty (CMP-5b),
  deliverability dashboard, List-Unsubscribe.
- **Ops**: rotacja sekretów (runbook), backupy off-node, monitoring/alerty.

### 6.2. Luki i twardzenie (do zrobienia)

- **CYBER-1 — Nagłówki bezpieczeństwa (panele)**: pełen zestaw
  `Content-Security-Policy`, `Strict-Transport-Security` (preload),
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` — audyt i
  domknięcie na Caddy/Next. (Test: securityheaders.com, Mozilla Observatory.)
- **CYBER-2 — Ochrona antybotowa rejestracji/logowania**: CAPTCHA/turnstile lub
  proof-of-work na rejestracji + progresywne opóźnienia; ochrona formularzy
  publicznych (kontakt, zgłoszenia z kreatora) przed spam-botami.
- **CYBER-3 — Ochrona przed nadużyciem wysyłki (outbound spam)**: twarde
  rate-limity SMTP per konto na węźle, limity EMM/newsletter, wykrywanie nagłych
  skoków wysyłki + auto-cordon konta; alert gdy IP węzła zbliża się do RBL
  (mamy monitoring RBL — dodać prewencję i throttling).
- **CYBER-4 — DDoS / L7 flood**: reguły Caddy (rate-limit per IP/route),
  rozważyć Cloudflare/anty-DDoS przed control-plane; circuit-breaker na API.
- **CYBER-5 — Sekrety w CI i repo**: skan `gitleaks`/`trufflehog` w pipeline,
  rotacja tokenów GHCR/deploy, zasada „secret tylko przez `gh secret set`".
- **CYBER-6 — Zależności i obrazy**: `npm audit` w CI (mamy jednorazowo),
  skan obrazów kontenerów (Trivy/Grype), Dependabot/Renovate na bieżąco.
- **CYBER-7 — Testy obciążeniowe i limity**: k6/Locust na panele+API, weryfikacja
  LVE pod obciążeniem, test wysycenia węzła (guardraile pojemności).
- **CYBER-8 — Backup integrity + off-site immutability**: szyfrowanie backupów,
  checksumy, kopie WORM/immutable (ochrona przed ransomware), regularny restore-drill.
- **CYBER-9 — Sentry/observability błędów** (= task #71): korelacja z audit log,
  alerty na anomalie (skok 5xx, skok FAILED maili, skok 401/403).
- **CYBER-10 — Twardnienie transmisji danych**: wymuszenie TLS 1.2+/1.3, HSTS,
  wewnętrzny ruch node↔control-plane przez VPN/mTLS, brak PII w URL/logach.
- **CYBER-11 — Zarządzanie podatnościami**: proces (kadencja skanów, SLA na łatki),
  strona `security.txt` + kanał zgłaszania podatności (responsible disclosure).

### 6.3. Testy bezpieczeństwa do przeprowadzenia

- [ ] **Pen-test zewnętrzny** (sekcja 4) — najważniejszy.
- [ ] **Skan podatności** — OWASP ZAP/Nuclei na panelach+API (automatyczny, w CI okresowo).
- [ ] **IDOR / kontrola dostępu** — próby dostępu do zasobów cudzego konta (pliki,
      DB, DNS, mail, faktury) na każdym endpointzie account-scoped.
- [ ] **Test izolacji kont na węźle** — brak wycieku między kontami (CageFS), brak
      eskalacji do roota, ograniczenia LVE działają.
- [ ] **Test anty-spam outbound** — symulacja przejętego konta wysyłającego spam →
      czy throttling/cordon/alert zadziałają, zanim IP trafi na RBL.
- [ ] **Test odporności na boty** — masowa rejestracja/login brute-force → rate-limit
      + fail2ban + antybot.
- [ ] **Test DDoS L7** — flood na login/API → degradacja kontrolowana, nie awaria.
- [ ] **Test szyfrowania at-rest/in-transit** — weryfikacja, że sekrety i backupy
      są zaszyfrowane, TLS wymuszony, brak downgrade.
- [ ] **Restore z ransomware scenario** — odtworzenie z immutable backup.

---

## 7. Kierunki rozwoju — moduły, funkcje, taski

> Nie blokują startu. Kolejność wg wartości biznesowej i różnicowania względem
> konkurencji (dhosting, cyberfolks, home.pl).

### 7.1. Compliance i płatności

- **PAY-1 — PayU/Przelewy24 obok Stripe** — polski rynek preferuje BLIK/przelewy;
  warstwa `PaymentProvider` (mamy Stripe) + adapter PayU. *(M)*
- **KSEF-2.0-*** — jak w sekcji 5. *(L)*
- **BILL-3 — Faktury cykliczne + korekty + noty** w UI klienta i admina. *(M)*

### 7.2. Niezawodność i skala floty

- **FLEET-1 — Redundancja geograficzna** (`docs/strategy/FLEET_SCALING.md`):
  multi-region węzły, failover, replikacja backupów między regionami. *(XL)*
- **FLEET-2 — Automatyczna migracja kont między węzłami** przy przeciążeniu/awarii
  (mamy drain + plan migracji; dokończyć egzekucję). *(L)*
- **OPS-6 — Status page z realnymi incydentami** + automatyczne wpisy z monitoringu. *(M)*

### 7.3. Produkt i różnicowanie

- **SEC-PAGE — Publiczna strona „Bezpieczeństwo"** z metrykami WAF (po pen-teście),
  passkeys, izolacja, RODO — realny argument B2B, którego konkurencja nie pokazuje. *(S)*
- **MIG-1 — Importery migracji per konkurent** (cPanel/DirectAdmin/plik+DB+mail)
  jako self-service — obniża próg przejścia do nas. *(L)*
- **BUILD-L — Kreator stron: dalszy rozwój** (więcej szablonów branżowych,
  e-commerce lite, integracje formularzy). *(M)*
- **AI-ASSIST — Autorski asystent w panelu** (diagnostyka „napraw jednym kliknięciem",
  podpowiedzi) — rozbudowa istniejących mechanizmów. *(M)*
- **RESELL-2 — Pełny white-label dla agencji** (własna domena panelu, branding,
  rozliczenia) — rozbudowa istniejącego programu resellera. *(L)*

### 7.4. Wsparcie i retencja

- **SUP-6 — Baza Wiedzy: pełne treści** (= task #72) + wyszukiwarka + oceny artykułów. *(S)*
- **SUP-7 — Chat/kanał wsparcia w panelu** (poza ticketami) + status on-call. *(M)*
- **NTF-3 — Powiadomienia push/web** dla krytycznych zdarzeń konta. *(S)*

### 7.5. Obserwowalność i jakość

- **OBS-1 — Sentry** (= #71) + dashboard błędów w adminie. *(S)*
- **OBS-2 — SLO/SLI + budżety błędów** na kluczowych ścieżkach (login, checkout,
  provisioning) z alertami. *(M)*
- **QA-1 — Rozszerzenie testów automatycznych** (E2E Playwright na panelach,
  testy kontraktowe integracji DA/Stripe/SES). *(L)*

---

## 8. Rekomendowana kolejność (harmonogram)

1. **Szybkie domknięcia**: #71 (Sentry/OBS-1), #72 (KB), #208 (API-GATE),
   CYBER-1 (nagłówki), CYBER-5/6 (skany sekretów/zależności w CI).
2. **KSeF**: decyzja o integratorze → KSEF-2.0-1/2/3 + KSEF-LEGACY-1 (zanim
   ktokolwiek wystawi fakturę na prod).
3. **Węzeł + licencje** → #73 (E2E) + restore-drill + test izolacji kont.
4. **Blokery startu** (sekcja 2): legal publish, Stripe live, sekrety, dane firmy.
5. **Audyty zewnętrzne**: pen-test + przegląd prawny; po nich inbox-placement,
   load-test (CYBER-7), anty-spam outbound (CYBER-3).
6. **GO/NO-GO** wg panelu (`Ustawienia → Gotowość do startu LIVE`).
7. **Po starcie**: roadmapa z sekcji 7 wg wartości biznesowej.

---

## 9. Skrót „co blokuje 100% ready"

| Kategoria | Status | Blokujące pozycje |
|-----------|--------|-------------------|
| Funkcje/kod | ✅ ~kompletne | #71, #72, #208 (drobne) |
| Węzeł/E2E | ⛔ | licencje CL/LS/DA → #73 |
| Start (legal/płatności/sekrety) | ⛔ | sekcja 2 |
| KSeF | ⛔ | FA(2)→FA(3)/KSeF 2.0 (sekcja 5) |
| Audyty zewn. | ⛔ | pen-test + prawnik |
| Cyberbezpieczeństwo | ◐ | baza jest; CYBER-1..11 do domknięcia |
