# Onboard węzła compute Verris — runbook LIVE

Dokumentacja kroków bootstrap i onboardingu węzła compute (Node-PL-01 i kolejne).
Cel: **jeden powtarzalny flow** bez ręcznych poprawek między bootstrap a pierwszym provisioningiem.

> **NODE-01 (2026-09-26): to jest jedyny runbook dodania węzła.** Kreator w panelu admin
> (`/nodes/wizard`) prowadzi przez te same kroki w tej samej kolejności. `NODE_BOOTSTRAP_V2.md`
> opisuje projekt, walidatory i DoD — procedura jest tutaj. Dawna „Szybka inicjalizacja”
> (`/nodes/init`) przekierowuje do kreatora.

## Architektura

| Warstwa | Rola |
|--------|------|
| **Control-plane** (`204.168.174.138`) | API, panel admin/klient, PostgreSQL, Redis |
| **Compute node** (np. `62.238.0.223`) | CloudLinux, DirectAdmin, LiteSpeed, agent Verris |
| **Integracja DA** | Admin API (login key) → provisioning; User API (hasło konta) → panel klienta |

## Flow end-to-end

```mermaid
flowchart TD
  A[Kreator: Instalacja — rekord + licencje] --> B[Bootstrap v2 na węźle: CL, DA, LS, agent, canary]
  B --> C[/etc/verris.conf + agent metrics + probes + task agent/]
  C --> BK[Kreator: Akceptacja + DA API, Backup offsite]
  BK --> D[node-onboard-live.sh]
  D --> E[DA: IP + pakiety starter/pro/business]
  D --> F[Governor MariaDB 10.6 + profil hostingowy]
  D --> G[Agent zadań verris-tasks.timer]
  E --> H[Admin: konfiguracja DA + Test]
  F --> H
  G --> H
  H --> I[Approve ACTIVE]
  I --> J[Klient: wykup usługi]
  J --> K[Provisioning: ensureUserPackage + createAccount + LVE]
  K --> L[Klient: Magic Login → DA]
```

## Faza 1 — Serwer (DC)

1. **OS:** AlmaLinux 9.x lub 10.x, minimal, dostęp root (krok „Wymagania” kreatora ma komendy przygotowania OS).
2. **Rekord A** w OVH: `node-pl-NN.verris.pl` → publiczne IP węzła (wymagany przed akceptacją).
3. Licencje: klucz aktywacji **CloudLinux**, klucz **DirectAdmin**, serial **LiteSpeed** (trial na testy).

## Faza 2 — Instalacja: kreator → bootstrap v2

1. Admin → **Węzły** → **Dodaj węzeł (kreator)** → krok **„Instalacja (bootstrap v2)”**: nazwa, region, hostname (FQDN) → **Utwórz węzeł**.
2. W tym samym kroku wpisz licencje (zapisywane zaszyfrowane w bazie) i skopiuj **jednolinijkowiec**.
3. Na węźle jako root uruchom jednolinijkowiec. Skrypt instaluje usługę `verris-bootstrap` (systemd oneshot), która
   wykonuje fazy **PREFLIGHT → CLOUDLINUX (+reboot) → DA → STACK (LiteSpeed) → AGENT → CANARY → DONE**
   i wznawia się po każdym restarcie. Każda faza raportuje się na żywo w kreatorze.
   - CLOUDLINUX: `cldeploy -k <klucz>` + reboot (pomijana, gdy kernel LVE już działa);
   - DA: oficjalny `setup.sh` (pomijana, gdy `/usr/local/directadmin` istnieje);
   - STACK: LiteSpeed przez DA CustomBuild (pomijana bez seriala);
   - AGENT: handshake `POST /servers/handshake`, `/etc/verris.conf`, verris-agent, verris-probes, verris-tasks;
   - CANARY: control-plane zakłada NS glue w OVH i pakiety DA.
4. **Instalacja ręczna** (licencja przypięta do IP, nietypowy OS) — sekcja awaryjna w tym samym kroku kreatora
   ma te same komendy; po niej i tak uruchom jednolinijkowiec v2 (pominie zrobione fazy).
5. Kreator → **„Akceptacja i DA API”**: Approve (status ACTIVE) + login key DA (Faza 4) + test.
6. Kreator → **„Backup offsite”**: rclone + `/etc/verris-backup.conf` (bez tego Onboard LIVE nie przejdzie).

**Krytyczny fix (agent zadań):** unit systemd musi używać `ExecStart=/usr/bin/bash /usr/local/bin/verris-task-run.sh` — skrypt **z shebang** `#!/usr/bin/env bash`. Usunięcie shebang powodowało `203/EXEC`.

## Faza 3 — Onboard LIVE (jeden skrypt)

Skopiuj pakiet onboardu na węzeł — w układzie repo (`ops/scripts` z `lib/`, `ops/hosting-default-page`,
`ops/etc/verris/security`). Skrypty szukają plików względem repo; płaska kopia gubiła m.in. security-watch
(`security-install-verris-security.sh` potrzebuje `ops/etc/verris/security/*.txt`):

```bash
tar czf - ops/scripts ops/hosting-default-page ops/etc/verris/security \
  | ssh root@WĘZEŁ 'mkdir -p /root/verris && tar xzf - -C /root/verris'
```

Uruchom:

```bash
export DA_USER=admin
export DA_KEY='login-key-z-DA-Account-Manager'
bash /root/verris/ops/scripts/node-onboard-live.sh
```

**PB-29:** na końcu `node-live-readiness.sh` wysyła raport do control-plane (`POST /agent/tasks/onboard-report`,
także przy przerwaniu na bramce). Węzeł dostaje nowe konta dopiero po zielonym raporcie (0 × FAIL) i dopóki
agent nie zgłosi braku utwardzenia (`hardenedEnabled=false`). Wersje stosu bierze z manifestu floty
(`/etc/verris-stack.env`, źródło: `apps/api/src/servers/stos-wezla.ts`).

Skrypt `node-onboard-live.sh`:

| Krok | Co robi |
|------|---------|
| Preflight | CloudLinux, DA :2222, LiteSpeed, public IP |
| Security baseline | SSH/fail2ban/sysctl/auto-updates/firewall ingress + egress deny-by-default |
| Wymaga | `/etc/verris.conf` z bootstrapu |
| DA IP | Rejestruje publiczne IP w DA (wymagane przy `ip=` w provisioning — nie `shared`) |
| DA pakiety | `starter`, `pro`, `business` (= `Plan.slug` w panelu) |
| Migrator | Worker migracji (timer 2 min) + narzędzia transferu: rsync, sshpass, lftp, imapsync, wp-cli, klient mysql — instalowane automatycznie |
| LIVE readiness | Agent zadań + Governor/MariaDB 10.6 + profil hostingowy + weryfikacja |

> Security hardening jest domyślnie **włączony** przy onboardingu.
> Flaga `--skip-security` istnieje tylko awaryjnie (NIEZALECANA dla LIVE).

Logi: `/var/log/verris-node-onboard.log`, `/var/log/verris-live-readiness.log`.

### Governor / MariaDB — typowe problemy (Node-PL-01)

1. Brak użytkownika `mysql` → zainstaluj `cl-MariaDB106-server`.
2. Konflikt meta pakietów MariaDB → `node-hosting-profile.sh` robi reset modułu + recover.
3. Governor „can't connect to socket” → restart `db_governor`, `dbctl list` musi odpowiadać.

## Faza 4 — Konfiguracja DirectAdmin w panelu admin

Węzeł → **DirectAdmin**:

| Pole | Wartość (Node-PL-01) |
|------|----------------------|
| Host | Publiczne IP węzła **lub** hostname węzła (`node-pl-01.verris.pl`) — rekord A musi wskazywać na IP |
| Port | `2222` |
| User | `admin` |
| Password | **Login Key** (nie hasło admina) — scope: packages, accounts |
| TLS | ON (`rejectUnauthorized: false` w SDK) |

**Test połączenia** w panelu → lista domen admina.

Login key: DirectAdmin → Account Manager → Login Keys.

## Faza 5 — Provisioning (API)

Kolejność w `provisioning.service.ts`:

1. `ensureUserPackage(packageName)` — tworzy pakiet DA jeśli brak (slug planu).
2. `createAccount` z **`ip: server.ipAddress`** (fix: wcześniej `shared` → „A valid IP was not provided” na single-IP).
3. `setAccountLimits` — LVE/dysk z planu.
4. Zapis `Account.daPasswordEnc` (hasło konta, szyfrowane KMS).
5. Email `accountProvisionedTemplate` z loginem i hasłem.

### Błędy napotkane na LIVE

| Błąd | Przyczyna | Fix |
|------|-----------|-----|
| `Package not found` | Brak pakietu `starter`/`pro`/`business` na węźle | `node-da-sync-plan-packages.sh` lub `ensureUserPackage` w API |
| `A valid IP was not provided` | `ip: shared` bez puli shared | `resolveDaAccountIp(server)` → `server.ipAddress` |
| Klient nie wchodzi do DA | Hasło tylko przy checkout / mailu | Panel klienta → **Magic Login** (login + hasło + URL) |

## Faza 6 — Dostęp klienta do DirectAdmin

- **URL panelu:** `https://{daHost}:{daPort}` — zwykle `https://62.238.0.223:2222`
- **Login:** `Account.daUsername` (np. `domi3055`)
- **Hasło:** zapisane przy provisioningu — panel klienta → usługa → **Magic Login**
- **Certyfikat:** self-signed DA — przeglądarka wymaga akceptacji wyjątku
- **Brak SSO** do DA z panelu Verris — tylko link + credentials

Weryfikacja techniczna (prod, Node-PL-01):

- Konto `domi3055` / domena `hvln.pl` — **ACTIVE**
- Admin API `SHOW_USER_CONFIG` — OK, `suspended=no`
- User API `SHOW_DOMAINS` — OK (`hvln.pl`)
- Port 2222 dostępny z internetu

## Pliki w repozytorium

| Plik | Opis |
|------|------|
| `ops/scripts/node-onboard-live.sh` | **Główny skrypt onboardingu** (zastępuje ręczną sekwencję) |
| `ops/scripts/node-live-readiness.sh` | Agent + profil + weryfikacja |
| `ops/scripts/node-hosting-profile.sh` | Governor, MariaDB, Exim/Dovecot, FTP, CustomBuild, LiteSpeed |
| `ops/scripts/node-verris-tasks-install.sh` | Instalacja agenta zadań |
| `ops/scripts/node-da-sync-plan-packages.sh` | Pakiety DA = plany |
| `ops/scripts/verris-tasks.sh` | Poll lease zadań |
| `ops/scripts/verris-task-run.sh` | Wykonanie pojedynczego zadania |
| `ops/scripts/security-hardening-baseline.sh` | Bazowy hardening hosta |
| `ops/scripts/security-egress-lockdown.sh` | Egress deny-by-default (nftables) |
| `apps/api/src/servers/node-bootstrap.script.ts` | Bootstrap v2 (wznawialny, fazy CL → DA → LS → agent → canary) |
| `apps/api/src/servers/servers.service.ts` | Skrypt fazy AGENT (handshake + agent), też „tylko agent” dla ręcznej instalacji |
| `apps/api/src/servers/node-tasks-agent.install.ts` | Fragment bootstrap → task agent |
| `apps/api/src/subscriptions/provisioning.service.ts` | Provisioning DA |
| `libs/directadmin-sdk/src/client.ts` | SDK + `ensureUserPackage` |

## Checklist po onboardingu

- [ ] `/etc/verris.conf` istnieje, `curl` lease API OK
- [ ] `systemctl is-active verris-agent.timer verris-tasks.timer`
- [ ] `dbctl list` — Governor OK
- [ ] `mysql -e SELECT 1` — MariaDB OK
- [ ] DA admin test w panelu — OK
- [ ] Pakiety `starter`, `pro`, `business` w DA
- [ ] Publiczne IP w `/usr/local/directadmin/data/admin/ips/`
- [ ] Smoke provisioning → klient widzi dane w Magic Login
- [ ] Port 2222 otwarty w firewallu (CSF: `2222/tcp`)
- [ ] Szablon strony domyślnej Verris w DA (`templates/custom/default` + `admin/domains/default`)

## Kolejne węzły (skrót)

1. Kreator → „Instalacja (bootstrap v2)”: rekord + licencje → jednolinijkowiec na węźle → faza „Gotowe”.
2. Kreator → „Akceptacja i DA API”: ACTIVE + login key + test.
3. Kreator → „Backup offsite”.
4. Kreator → „Onboard LIVE”: pakiet onboardu (tar przez ssh) → `ops/scripts/node-onboard-live.sh` (+ `DA_USER`/`DA_KEY`) — obowiązkowy przed klientami; zielony raport wpuszcza węzeł do przydziału kont.
5. Kreator → „Profil hostingowy” → „Gotowe”: smoke usługa.

---

*Ostatnia aktualizacja: onboard Node-PL-01 (`f333c769-dcd5-4013-a11d-261fdda7f127`), provisioning `domi3055` / `hvln.pl`.*
