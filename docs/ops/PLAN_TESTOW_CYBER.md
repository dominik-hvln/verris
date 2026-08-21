# Plan testów bezpieczeństwa CYBER-1…11

<!-- Uratowane z PRODUCTION_READINESS_2026-07.md przy porządkowaniu repo 2026-08-21.
     Reszta tamtego dokumentu trafiła do docs/archiwum/ jako nieaktualna. -->

> Lista zadań nadal aktualna. Audyt 2026-08-20 dodaje do niej kontekst: **CYBER-5 i CYBER-6
> (skany sekretów i zależności w CI) są dziś niewykonalne, bo CI nie istnieje** — patrz `X-01`
> w macierzy, sprint 1. **CYBER-3** ma częściowe pokrycie (`outbound-abuse.guard.ts`), ale bez UI
> dla operatora (`N-14`). Sam plan nie jest przypisany do sprintów — to backlog bezpieczeństwa
> do rozłożenia po starcie w ramach epiku `E-06`.

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
