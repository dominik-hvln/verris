> **ARCHIWUM — dokument nieaktualny.** Zarchiwizowany 2026-08-21 przy porządkowaniu repozytorium po audycie parytetu funkcji.
> **Zastępuje go:** raport audytu z listą 11 blokerów oraz dokumenty w `docs/legal/`
> Aktualny stan każdej funkcji: `audyt/dane/macierz.csv`. Wartość tego pliku jest wyłącznie historyczna.

---

# Ocena: zgodność prawna + cyberbezpieczeństwo (2026-06-10)

Ocena stanu Verris pod kątem (1) zgodności prawnej / RODO i (2) bezpieczeństwa
danych, kont, plików, baz i FTP. Bazuje na przeglądzie kodu, ops i dokumentacji
prawnej w repo. **To ocena techniczno-organizacyjna, nie opinia prawna** — punkty
oznaczone 🧑‍⚖️ wymagają zatwierdzenia przez radcę/adwokata.

---

## TL;DR

**Bezpieczeństwo: dobry, dojrzały poziom jak na hosting wchodzący na rynek.** Po
naprawach z poprzednich etapów (blokery finansowe, hash tokenów węzła, TLS do DA,
rate limiting, VPN paneli, WAF, passkeys, FTPS) fundamenty są solidne. Zostały
**3 rzeczy WARTE dorobienia przed/tuż po LIVE** (kopie zapasowe kont klientów
off-node z self-restore, szyfrowanie backupów, MFA wymuszone na staffie) i kilka
hardeningów drugiego rzędu.

**Prawnie: architektura compliance jest na miejscu** (zgody, eksport danych,
prawo do usunięcia, retencja, DPA, lista subprocesorów, procedura naruszeń 72h).
**Blocker prawny to nie kod, lecz formalności**: drafty dokumentów muszą przejść
**review prawnika** (szczególnie VAT od bonów przedpłaconych i KSeF), trzeba
uzupełnić dane rejestrowe spółki i podpisać DPA z każdym subprocesorem.

---

# CZĘŚĆ 1 — CYBERBEZPIECZEŃSTWO

## 1.1 Co jest dobrze zrobione (potwierdzone w kodzie)

**Uwierzytelnianie i dostęp**
- Hasła: bcrypt; lockout per e-mail bez enumeracji; 2FA TOTP; **passkeys/WebAuthn**
  (odporne na phishing); `tokenVersion` → „wyloguj wszędzie" + bump po resecie;
  natychmiastowa blokada konta w JwtStrategy (nie po wygaśnięciu JWT).
- **Panele admin/staff za VPN WireGuard** (restrykcja Caddy `remote_ip`), klucze
  generowane z poziomu panelu admina, rewokacja do ~1 min.
- Wymuszenie 2FA dla ról ADMIN/STAFF (env `REQUIRE_2FA_FOR_STAFF`).
- Rate limiting globalny + ostre limity na `/auth/*` i endpointach mailowych.

**Dane wrażliwe i sekrety**
- Sekrety (hasła DA, PSK VPN) szyfrowane **AES-256-GCM** kluczem KMS; CLI rotacji.
- Identity token węzła i bootstrap tokeny **hashowane SHA-256** w DB.
- TLS do DirectAdmin **weryfikowany domyślnie** (per-node escape hatch flagowany
  w audycie węzła); webhooki Stripe z weryfikacją HMAC + dedupe po `event.id`.
- Nagłówki bezpieczeństwa (HSTS, nosniff, X-Frame-Options DENY) na Caddy;
  `trust proxy` → prawdziwe IP w audycie.

**Izolacja klientów (hosting)**
- **CloudLinux CageFS** (izolacja kont), **LVE** (limity zasobów), **MySQL Governor**.
- **ModSecurity WAF + OWASP CRS** (B2), domyślnie tryb detekcji, przełączalny.
- **FTPS wymuszony** (TLS-only) w profilu hostingowym (dodane teraz).
- Operacje na plikach/bazach klienta (WP install, staging) wykonywane **jako
  użytkownik konta** (`su -l`, CageFS), nigdy jako root w kontekście danych klienta.

**Sieć i infrastruktura**
- DB i Redis tylko w sieci wewnętrznej Docker (nie wystawione); jedynie Caddy publiczny.
- Egress lockdown (nftables deny-by-default) na węzłach; baseline hardening (SSH,
  fail2ban, sysctl, auto-updates), marker raportowany do audytu.
- Codzienny backup PostgreSQL; monitoring (Prometheus/Grafana za forward-auth).

## 1.2 WARTE dorobienia PRZED / tuż po LIVE

### S-1 · WYSOKIE · Kopie zapasowe kont klientów off-node + self-restore
Dziś jest backup **bazy control-plane** i ad-hoc DA site-backup, ale **brak
zautomatyzowanych, regularnych kopii kont klientów (pliki+bazy) trzymanych POZA
węzłem** z możliwością samodzielnego przywrócenia. To w hostingu współdzielonym
**pierwsze pytanie po awarii** i najczęstsza przyczyna utraty zaufania.
**Rekomendacja:** harmonogram per węzeł (restic/borg → S3/MinIO **w innym DC**),
retencja 14–28 dni, UI „przywróć plik/bazę/całość" w panelu klienta. (To pokrywa
się z taskiem B1 z roadmapy — najwyższy priorytet rozwojowy.)

### S-2 · WYSOKIE · Backupy off-site + szyfrowanie at-rest
`backup-postgres.sh` działa, ale **mirror off-site jest domyślnie wyłączony**
(`MIRROR_EXTERNAL_ENABLED=0`), a dumpy nie są szyfrowane przed wysłaniem. Dump
zawiera dane osobowe → wyciek backupu = naruszenie RODO.
**Rekomendacja:** włączyć off-site na niezależnym dostawcy + szyfrować dumpy
(`age`/GPG) przed uploadem; klucz odtwarzania trzymany osobno. **Test restore**
z udokumentowaną datą przed LIVE.

### S-3 · ŚREDNIE · Skaner malware na kontach (uzupełnienie WAF)
WAF chroni warstwę HTTP, ale **nie wykrywa już wgranego malware/backdoorów**
(częste przy włamaniach przez podatne wtyczki WP). ModSecurity to nie antywirus.
**Rekomendacja:** ImunifyAV (darmowy skaner) lub `clamav` + reguły YARA w cronie
węzła; wyniki do panelu, kwarantanna + mail do klienta. Imunify360 (płatny) gdy
budżet pozwoli — daje też proaktywny WAF + patch management.

### S-4 · ŚREDNIE · Wymuszenie silnych haseł + sprawdzanie wycieków
Brak widocznej polityki złożoności haseł / sprawdzania w bazach wycieków (HIBP
k-anonimowość). Przy hostingu konta klientów to częsty wektor.
**Rekomendacja:** minimalna entropia hasła przy rejestracji/zmianie + opcjonalny
check HIBP range API; passkeys jako preferowana ścieżka (już jest).

## 1.3 Hardening drugiego rzędu (po LIVE)

- **S-5** Skrócić TTL JWT dla USER (dziś 1 dzień) do 2–4 h + refresh token, albo
  rotacja `tokenVersion` przy wrażliwych zmianach (część już jest).
- **S-6** CSP na panelach (dziś tylko nagłówki podstawowe) — ograniczy XSS w panelu.
- **S-7** Alerty bezpieczeństwa na człowieka: podpiąć i **przetestować** kanał
  (Slack/SMS) dla reguł Prometheusa + **zewnętrzny uptime monitor** niezależny od
  własnej infry (gdy padnie control-plane, padną też własne alerty).
- **S-8** Okresowy `pnpm audit` / Dependabot + skan obrazów Docker (Trivy) w CI.
- **S-9** Bug bounty / security.txt + adres `security@` (responsible disclosure).
- **S-10** Rotacja kluczy: harmonogram rotacji `APP_KMS_KEY`, `JWT_SECRET`,
  login keys DA (CLI rotacji KMS już istnieje — dodać kalendarz/przypomnienie).
- **S-11** Pen-test zewnętrzny przed większą skalą (nie blokuje startu kontrolowanego).

## 1.4 Co już naprawiliśmy w tej serii prac
F-01..F-19 (blokery finansowe, hash tokenów, TLS DA, rate-limit, trust proxy,
webhook dedupe, rollback provisioningu…), VPN paneli, HSTS, 2FA staff, passkeys,
WAF, FTPS. Szczegóły w `AUDYT_PRZED_LIVE_2026-06-09.md` i `WDROZENIE_2026-06-10.md`.

---

# CZĘŚĆ 2 — ZGODNOŚĆ PRAWNA / RODO

## 2.1 Co jest na miejscu (w kodzie)
- **Zgody** (`UserConsent`) zapisywane przy rejestracji z wersją dokumentu, IP, UA;
  re-consent wymuszany przy publikacji nowej wersji regulaminu/polityki.
- **Prawo dostępu / przenoszenia** — moduł `data-export` (eksport danych usera).
- **Prawo do usunięcia** — `account-deletion` z anonimizacją + harmonogram hard-delete.
- **Retencja** — scheduler czyści/anonimizuje stare logowania i IP w audycie
  (24 mies.), dedupe webhooków 90 dni.
- **DPA** (art. 28) — generator PDF + lista subprocesorów; **cookies** (PTel/ePrivacy).
- **Procedura naruszeń** — `INCIDENT_RESPONSE.md` z klasyfikacją i **terminem 72h**
  (art. 33–34 RODO), kanały zgłoszeń.
- **Minimalizacja w UI** — błędy provisioningu nie pokazują surowych danych DA klientowi.

## 2.2 Blokery / do domknięcia PRZED przyjęciem pierwszego klienta

### L-1 · 🧑‍⚖️ KRYTYCZNE · Review prawnika dokumentów + dane rejestrowe
Dokumenty są **DRAFT 0.2** („gotowce do prawnika"). Przed LIVE:
- uzupełnić **dane rejestrowe** spółki (nazwa, adres, NIP/KRS, sąd właściwy) we
  wszystkich dokumentach,
- przejść **lawyer review** całości, w szczególności:
  - 🧑‍⚖️ **VAT od bonów przedpłaconych (portfel/kredyty K)** — interpretacja
    „bon jednego przeznaczenia" (moment opodatkowania przy wpłacie) jest
    nietrywialna; wymaga twardego potwierdzenia + ewentualnie interpretacji KIS,
  - 🧑‍⚖️ **KSeF / faktury ustrukturyzowane** (2026) — dostosować wystawianie faktur,
  - 🧑‍⚖️ prawo odstąpienia 14 dni B2C vs „rozpoczęcie świadczenia" przy provisioningu.
- **Opublikować wersję LIVE** (`prod-legal-publish-live.sh`, wersja `1.0.0`).

### L-2 · WYSOKIE · DPA podpisane z subprocesorami + aktualna lista
Verris jako procesor danych klientów musi mieć **podpisane umowy powierzenia**
z każdym subprocesorem (Stripe, OVH, OpenProvider, dostawca DC/Hetzner, dostawca
maila). Lista `subprocessors.md` istnieje — trzeba ją **zweryfikować z realnym
stackiem** i podpisać DPA (większość ma standardowe DPA do akceptacji online).

### L-3 · WYSOKIE · Rola Verris: administrator vs procesor — rozdzielić
Verris jest **administratorem** danych swoich klientów (konto, płatności) i
jednocześnie **procesorem** danych, które klient trzyma na hostingu (jego użytkownicy,
pliki). Dokumenty muszą jasno rozdzielać te role; DPA dotyczy tej drugiej.
🧑‍⚖️ do potwierdzenia z prawnikiem, ale architektura (oddzielny DPA) już to zakłada.

### L-4 · ŚREDNIE · Rejestr czynności przetwarzania (art. 30)
Operacyjny dokument (nie w kodzie) — utworzyć i utrzymywać RCPD: jakie dane, cele,
podstawy, odbiorcy, retencja, transfery poza EOG. Wynika to wprost z RODO dla
podmiotu tej skali.

### L-5 · ŚREDNIE · Transfery poza EOG
Jeśli którykolwiek subprocesor przetwarza dane poza EOG (np. niektóre usługi
Stripe/US) — udokumentować podstawę (SCC / decyzja adekwatności) w privacy i RCPD.
🧑‍⚖️ do weryfikacji per dostawca.

### L-6 · ŚREDNIE · Skrzynki kontaktowe i IOD
Uruchomić i monitorować **`rodo@`/`iod@`** oraz **`abuse@`** i **`security@`**.
Ocenić, czy skala wymaga formalnego **IOD** (przy hostingu i przetwarzaniu na dużą
skalę często zalecany, choć nie zawsze obowiązkowy) — 🧑‍⚖️.

### L-7 · NISKIE · Retencja faktur i dokumentów księgowych
Faktury: 5 lat (prawo podatkowe) — upewnić się, że retencja `Invoice`/PDF tego nie
kasuje wcześniej (scheduler retencji nie powinien ruszać dokumentów księgowych).

## 2.3 Cyberbezpieczeństwo jako wymóg RODO (art. 32)
Art. 32 wymaga „odpowiednich środków technicznych i organizacyjnych". Powyższe
S-1/S-2 (backupy off-node + szyfrowanie) to **nie tylko dobra praktyka, ale wprost
realizacja art. 32** (zdolność do przywrócenia dostępności po incydencie +
poufność). Domknięcie ich wzmacnia też pozycję prawną.

---

# REKOMENDOWANA KOLEJNOŚĆ

**Przed pierwszym płatnym klientem (must):**
1. L-1 (lawyer review + dane rejestrowe + publikacja LIVE dokumentów) — formalność, ale twardy blocker.
2. L-2 (DPA z subprocesorami) + L-3 (rozdzielenie ról).
3. S-2 (backup off-site + szyfrowanie) + udokumentowany test restore.
4. S-7 (alerty na człowieka + zewnętrzny uptime monitor).

**Pierwszy miesiąc:**
5. S-1 (backupy kont klientów + self-restore) — najwyższy priorytet produktowy.
6. S-3 (skaner malware), S-4 (polityka haseł/HIBP).
7. L-4 (RCPD), L-5 (transfery EOG), L-6 (skrzynki/IOD).

**Po stabilizacji:**
8. S-5..S-11 (TTL JWT, CSP, audyt zależności, security.txt, rotacje, pen-test).

---

## Werdykt

- **Technicznie do startu kontrolowanego: TAK**, po domknięciu S-2 i S-7 (backup
  off-site + alerty). S-1 (backupy kont) zrobić jako #1 zaraz po starcie.
- **Prawnie do startu: warunkowo** — kod i procesy są gotowe, ale **wymagany
  podpis prawnika pod dokumentami + DPA z subprocesorami + dane rejestrowe**. To
  jedyna twarda bariera; jest organizacyjna, nie programistyczna.

> Nic z powyższego nie jest „dziurą, która wywróci start" — to lista dojrzewania
> typowa dla hostingu wchodzącego na rynek. Krytyczne luki techniczne z
> wcześniejszych audytów zostały już naprawione.
