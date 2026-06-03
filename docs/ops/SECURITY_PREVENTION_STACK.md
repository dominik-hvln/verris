# Verris — warstwa zapobiegania (powtórka incydentu XBL / C2)

Po incydencie **Spamhaus XBL / Ranbyus** na `204.168.174.138` (czerwiec 2026) dodano **powtarzalny stos** obrony hosta + monitoring.

## Co robi każda warstwa

| Warstwa | Skrypt / plik | Efekt |
|--------|----------------|--------|
| **Baseline** | `security-hardening-baseline.sh` | SSH tylko klucz, fail2ban, auto-updates, UFW ingress |
| **IOC drop** | `security-control-plane-egress.sh` | `iptables` DROP do znanych IP C2 (nie rusza Docker NAT) |
| **UFW backup** | instalator | `ufw deny out` do IOC |
| **Egress log** | control-plane egress | log kernela przy nowym TCP/80 (forenzja) |
| **Watch 5 min** | `security-egress-watch.sh` + timer | połączenia do IOC, burst HTTP, zmiana cron |
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

## Tryb STRICT (opcjonalny)

Ogranicza **nowe** połączenia TCP/80 i /443 tylko do hostów z `egress-allow-hostnames.txt` (ipset).

**Ryzyko:** zepsucie `git pull`, Stripe, Docker registry jeśli lista niepełna.

```bash
# Najpierw uzupełnij hosty (odkomentuj w pliku), potem:
sudo bash ops/scripts/security-control-plane-egress.sh --strict
```

## Co dalej operacyjnie

1. Rotacja sekretów po incydencie (JWT, KMS, Stripe, DA) — jednorazowo.
2. Przegląd `journalctl` / auditd po alertach.
3. Rozważyć **rebuild** hosta z czystego obrazu, jeśli kompromitacji nie da się wykluczyć.
4. Co kwartał: `sudo bash ops/scripts/security-incident-collect.sh` jako ćwiczenie + review IOC list.

Zobacz też: `docs/ops/HETZNER_ABUSE_2026-06-01.md`, `docs/ops/SECURITY_HARDENING_BASELINE.md`.
