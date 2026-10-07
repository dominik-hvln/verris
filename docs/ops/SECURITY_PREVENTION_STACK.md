# Verris — warstwa zapobiegania (powtórka incydentu XBL / C2)

Po incydencie **Spamhaus XBL / Ranbyus** na `204.168.174.138` (czerwiec 2026) dodano **powtarzalny stos** obrony hosta + monitoring.

## Co robi każda warstwa

| Warstwa | Skrypt / plik | Efekt |
|--------|----------------|--------|
| **Baseline** | `security-hardening-baseline.sh` | SSH tylko klucz, fail2ban, auto-updates, UFW ingress |
| **IOC drop** | `security-control-plane-egress.sh` | `iptables` DROP do znanych IP C2 (nie rusza Docker NAT) |
| **UFW backup** | instalator | `ufw deny out` do IOC |
| **Egress log** | control-plane egress | log kernela przy nowym TCP/80 i /443 (forenzja) |
| **Anti-netscan** | control-plane egress | DROP przy >80 nowych TCP/80,443 / 60s (netscan) |
| **Strict egress** | `--strict` + allowlist (baza + domeny klientów) | nowe TCP/80,443 tylko do znanych hostów (ipset) |
| **Watch 5 min** | `security-egress-watch.sh` + timer | IOC, burst HTTP/S, SYN-SENT, unikalne DST w kern.log |
| **Auditd** | `verris-security.rules` | alert na zmiany cron/systemd |
| **Node egress** | `security-egress-lockdown.sh --role node` | deny-by-default wyjście na węzłach DA |
| **Prometheus** | `verris_security_findings` | alert `VerrisSecurityWatchFindings` |

## Jednorazowa instalacja (control-plane)

Na serwerze z repozytorium w `/opt/verris` — **na LIVE preferuj** `security-install` (nie resetuje UFW, nie instaluje `iptables-persistent`):

```bash
cd /opt/verris
git pull
sudo bash ops/scripts/security-install-verris-security.sh --role control-plane
```

Pełny `security-hardening-baseline.sh` uruchamiaj tylko na **świeżym** hoście lub po `--dry-run`; na działającym CP **`ufw --force reset`** może na chwilę uciąć SSH/Docker.

```bash
sudo bash ops/scripts/security-hardening-baseline.sh --role control-plane --dry-run
sudo bash ops/scripts/security-hardening-baseline.sh --role control-plane
```

### SSH odmawia polegania (port 22 zamknięty)

1. Wejdź przez **Hetzner Console** (KVM).
2. Sprawdź: `systemctl status ssh`, `ss -lntp | grep :22`, `ufw status`.
3. Przywróć ingress: `ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw default allow routed && ufw enable`
4. Ponów `security-install-verris-security.sh` (dopina 22/80/443 przed regułami IOC).

## Węzły hostingowe (node-pl-01, …)

```bash
sudo bash ops/scripts/security-hardening-baseline.sh --role node
sudo bash ops/scripts/security-egress-lockdown.sh --role node --dry-run
sudo bash ops/scripts/security-egress-lockdown.sh --role node --apply
sudo bash ops/scripts/security-install-verris-security.sh --role node
```

## Lista IOC

Edytuj na hoście:

`/etc/verris/security/ioc-ips.txt`

Po zmianie:

```bash
sudo bash ops/scripts/security-control-plane-egress.sh
```

## Monitoring

- Logi: `/var/log/verris-security/`
- Timer: `systemctl status verris-security-watch.timer`
- Metryka: `verris_security_findings` (node_exporter textfile)
- Grafana/Prometheus: reguła `VerrisSecurityWatchFindings`

Po aktualizacji `docker-compose.prod.yml` (textfile collector):

```bash
cd /opt/verris
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d node-exporter prometheus
```

## Wpływ na klientów hostingowych

- **Control-plane:** reguły dotyczą tylko hosta API/paneli (Docker NAT nietknięty). Klienci nie łączą się bezpośrednio z egress hosta CP w normalnym flow.
- **Węzeł DA:** `security-egress-lockdown` blokuje **nowe** połączenia wychodzące z **systemu węzła** poza listą (DNS, HTTP/S, SMTP, FTP, IMAP, DA, MySQL). Ruch **przychodzący** klientów (WWW, poczta, FTP) **nie jest** filtrowany tym łańcuchem.
- **Nie wdrażaj** `--strict` na control-plane bez pełnej allowlisty — może uciąć deploy/API.

## Tryb STRICT (wymagany na control-plane LIVE)

Ogranicza **nowe** połączenia TCP/80 i /443 tylko do hostów z allowlisty (ipset).

```bash
cd /opt/verris
sudo bash ops/scripts/security-control-plane-egress.sh --strict
```

> **Tryb zostaje (2026-10-06).** Tryb ostatniego udanego przebiegu leży w `/etc/verris/security/egress-tryb`.
> Przebieg **bez opcji** (tak woła go instalator, a przez instalator `security-hardening-baseline.sh`)
> tryb **zachowuje**: zapisany strict jest odtwarzany (bez ponownego warunku pomiaru — był zatwierdzony),
> nie zdejmowany. Jedyna droga powrotu ze strict to jawna flaga:
>
> ```bash
> sudo bash ops/scripts/security-control-plane-egress.sh --wylacz-strict
> ```
>
> Zdejmuje `VERRIS_EGRESS_STRICT` (IPv4 i IPv6), zapisuje tryb domyślny i utrwala reguły.
>
> **Domeny klientów — poza allowlistą hosta (decyzja 2026-10-06).** DNS domeny ustawia klient, więc
> wpis domeny klienta pozwalał mu skierować strict i anty-skan hosta na dowolny adres. Host ich nie
> potrzebuje: sprawdzanie stron i webhooki idą z kontenera API (FORWARD, X-41), którego strict ani
> anty-skan nie dotyczą. `security-sync-cp-egress-hosts.sh` usunięty; instalator kasuje plik
> `egress-allow-hostnames.local.txt` zapisany kiedyś przez sync, a skrypt egress go nie czyta.

> **SEC-01/05/06 (od 2026-09-22):** instalator **nie** włącza już strict automatycznie
> (wcześniej robił to z `|| true`, a sam strict był atrapą — nic nie odrzucał).
> Strict naprawdę odrzuca i **odmawia (kod 1)**, dopóki:
> 1. pomiar egressu (ipset `verris_egress_seen`, zakładany przez przebieg domyślny) nie trwa ≥ 7 dni,
> 2. każdy zmierzony cel TCP/80,443 hosta jest w allowliście.
>
> Kolejność: przebieg domyślny → 7 dni → `--pomiar` (raport: co host robi i czego brakuje
> w allowliście) → uzupełnienie allowlisty → `--strict`. Przy incydencie:
> `--wymus-strict` (pomija warunek pomiaru, świadomie).
>
> **SEC-06 (2026-10-06): adresy CDN.** Usługi za CloudFront/AWS/Fastly (repo Dockera, Docker Hub,
> motd Ubuntu, Wordfence) zmieniają adresy co minutę, a zbiór allowlisty budowany jest z nazw raz.
> `verris-egress-odswiez.timer` co 15 s uruchamia `--odswiez`: dopisuje (bez podmiany zbioru) adresy,
> które resolwer hosta zwraca teraz dla nazw z allowlisty. Bez timera strict odcinałby apt i
> `compose pull` co jakiś czas. Zmierzone wcześniej adresy CDN, których DNS już nie zwraca, zostają
> w raporcie jako „NIE” — gdy każdy taki cel ma przypisaną nazwę z allowlisty (raport 2026-10-06
> w audycie, SEC-06), strict włącza się `--wymus-strict`.

**Ryzyko:** niepełna lista → ucięcie deploy/Stripe/apt hosta; nowa usługa zewnętrzna hosta = nowa nazwa w `egress-allow-hostnames.txt` (timer `--odswiez` dopisze jej adresy w ciągu 15 s).

## Kontenery — DOCKER-USER (X-41 etap 2)

Strict, IOC i anty-skan powyżej działają w **OUTPUT**, czyli tylko dla ruchu hosta.
Ruch kontenerów (API, www, panele) idzie przez **FORWARD → DOCKER-USER**. Dla niego
osobny łańcuch `VERRIS_FWD_EGZEKW` — **bez allowlisty domen** (API musi sięgać do
dowolnych hostów klientów), za to:

| Reguła | Dopasowanie | Log (prefiks) | Próg (zmienna na górze skryptu) |
|---|---|---|---|
| IOC | `-d` adres z `/etc/verris/security/ioc-ips.txt` (ta sama lista co host) | `VERRIS-FWD-IOC` | — |
| SMTP | nowe TCP na 25/465/587, per kontener (`hashlimit srcip`) | `VERRIS-FWD-SMTP` | `FWD_SMTP_LIMIT=60/min`, `FWD_SMTP_BURST=120` |
| Skan | każde nowe połączenie, per kontener (`hashlimit srcip`) | `VERRIS-FWD-SKAN` | `FWD_NOWE_LIMIT=20/sec`, `FWD_NOWE_BURST=1000` |

Ruch do kontenerów (`-o br-+`, `-o docker0`) i odpowiedzi (`ESTABLISHED`) nie liczą się
do limitów. Poczta aplikacji idzie przez Postfix hosta (`host.docker.internal`, łańcuch
INPUT), więc limit SMTP dotyczy tylko bezpośrednich połączeń z kontenera.
Łańcuchy z obserwacji (`VERRIS_FWD_OBSERW`) i blokady metadanych (`VERRIS_FWD_METADANE`)
zostają bez zmian.

Kolejność (na Panelu, `cd /opt/verris`, po `git pull`):

```bash
# 1. Pomiar — reguły tylko logują, nic nie odrzucają. Zapisuje datę początku pomiaru.
sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-pomiar

# 2. Po >= 48 h — kto przekroczyłby próg (adres SRC = kontener) i ile razy:
sudo journalctl -k --since "2 days ago" | grep -E 'VERRIS-FWD-(IOC|SMTP|SKAN)'
sudo iptables -L VERRIS_FWD_EGZEKW -v -n      # liczniki pakietów ponad próg
docker ps -q | xargs docker inspect --format '{{.Name}} {{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'
#    Pusto = można egzekwować. Wpisy od API (monitoring, webhooki) = podnieś próg, np.:
#    sudo FWD_NOWE_LIMIT=40/sec bash ops/scripts/security-control-plane-egress.sh --kontenery-pomiar

# 3. Egzekwowanie (odmawia z kodem 1 przed 48 h pomiaru):
sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-egzekwuj
#    Przy incydencie, świadomie bez pomiaru:
#    sudo FWD_POMIAR_MIN_DNI=0 bash ops/scripts/security-control-plane-egress.sh --kontenery-egzekwuj

# 4a. Rollback do samego logowania:
sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-pomiar
# 4b. Rollback całkowity (wypina i usuwa łańcuchy kontenerów):
sudo bash ops/scripts/security-control-plane-egress.sh --kontenery-wylacz
#    Awaryjnie, bez skryptu (plik trybu też, inaczej restart serwera przywróci egzekwowanie):
#    sudo iptables -D DOCKER-USER -j VERRIS_FWD_EGZEKW && sudo rm -f /etc/verris/security/egress-kontenery-tryb
```

Progi zmienione przez zmienną obowiązują do następnego uruchomienia bez niej (także do
restartu serwera) — trwała zmiana to edycja wartości domyślnych na górze
`security-control-plane-egress.sh`. Każde uruchomienie buduje łańcuchy od zera i nie dubluje
skoku w DOCKER-USER. Tryb kontenerów zapisuje się w `/etc/verris/security/egress-kontenery-tryb`;
po restarcie serwera `verris-egress.service` (`--przy-starcie`, po `docker.service`) odtwarza go
razem z regułami hosta, a `--kontenery-wylacz` kasuje ten plik. Docker nie modyfikuje reguł
dodanych do DOCKER-USER (https://docs.docker.com/engine/network/packet-filtering-firewalls/),
a łańcuchy `VERRIS_FWD_*` są nasze, więc restart samego demona ich nie rusza. Po restarcie
Dockera albo serwera sprawdź: `sudo iptables -S DOCKER-USER` (ma być `-j VERRIS_FWD_EGZEKW`);
brak = ponów polecenie z kroku 1 albo 3 (usługa tylko ostrzega, gdy przy starcie nie było
jeszcze DOCKER-USER: `journalctl -u verris-egress`).

## Co dalej operacyjnie

1. Rotacja sekretów po incydencie (JWT, KMS, Stripe, DA) — jednorazowo.
2. Przegląd `journalctl` / auditd po alertach.
3. Rozważyć **rebuild** hosta z czystego obrazu, jeśli kompromitacji nie da się wykluczyć.
4. Co kwartał: `sudo bash ops/scripts/security-incident-collect.sh` jako ćwiczenie + review IOC list.

Zobacz też: `docs/ops/HETZNER_ABUSE_2026-06-01.md`, `docs/ops/SECURITY_HARDENING_BASELINE.md`.
