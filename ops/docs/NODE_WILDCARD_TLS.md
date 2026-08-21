# Wildcard TLS dla węzłów compute — model centralny (control-plane)

> **Źródło prawdy:** cert `*.verris.pl` wystawiany na **serwerze panelu**, deployowany SSH na każdy ACTIVE węzeł.  
> Nie wystawiaj wildcard ręcznie na węzłach — `node-wildcard-tls-ovh.sh` tylko awaryjnie.

## Architektura

```
Control-plane (204.168.174.138)
  certbot DNS-01 + OVH  →  /etc/letsencrypt/live/verris-wildcard/
  cron + renew hook     →  SCP + install DA (cacert.pem) na każdy węzeł ACTIVE
```

| Komponent | Ścieżka |
|-----------|---------|
| Skrypt główny | `ops/scripts/verris-node-wildcard-tls.sh` |
| Bootstrap (jednorazowo) | `ops/scripts/verris-node-wildcard-tls-bootstrap.sh` |
| OVH credentials | `/root/.secrets/ovh-dns.ini` (chmod 600, **nie w repo**) |
| SSH → węzły | `/root/.ssh/verris_node_deploy` (ten sam pubkey co `verris_cursor_deploy`) |
| Log | `/var/log/verris-node-tls.log` |
| Cron | `/etc/cron.d/verris-node-wildcard-tls` (pon 04:00) |

## Jednorazowy bootstrap (control-plane)

Wymaga `VERRIS_NODE_DEPLOY_SSH_PUBKEY` w `.env.prod` (pubkey do SSH root@węzły — ten sam co `/root/.ssh/verris_node_deploy.pub`).

Bootstrap węzła **automatycznie** dodaje ten klucz do `/root/.ssh/authorized_keys`. Agent `verris-tasks` utrzymuje go przy każdym pollu.

```bash
# 1) Klucz prywatny na control-plane (jednorazowo, jeśli brak)
scp -i ~/.ssh/verris_cursor_deploy ~/.ssh/verris_cursor_deploy \
  root@204.168.174.138:/root/.ssh/verris_node_deploy
ssh root@204.168.174.138 'chmod 600 /root/.ssh/verris_node_deploy'

# 2) OVH API (DNS-01) — plik ini lub env (patrz OVH_WILDCARD_TLS_SETUP.md)

# 3) Bootstrap + pierwszy deploy
ssh root@204.168.174.138 'cd /opt/verris && bash ops/scripts/verris-node-wildcard-tls-bootstrap.sh'
```

## Nowy węzeł (node-pl-02, …)

1. **DNS OVH:** `node-pl-02` A → publiczne IP węzła
2. **Panel admin:** hostname = `node-pl-02.verris.pl`, status ACTIVE
3. **Bootstrap Verris** z panelu admin — klucz deploy trafia na węzeł automatycznie
4. **Control-plane** (cert już istnieje):

```bash
bash /opt/verris/ops/scripts/verris-node-wildcard-tls.sh --deploy-only --node=node-pl-02.verris.pl
```

Cert wildcard już istnieje na CP — wystarczy push na nowy węzeł.

## Komendy

| Komenda | Działanie |
|---------|-----------|
| `verris-node-wildcard-tls.sh` | renew/issue + deploy wszystkich ACTIVE |
| `--deploy-only` | tylko push istniejącego certu |
| `--deploy-only --node=host` | jeden węzeł |
| `--dns-only` | tylko cert + checklist DNS |

## Wymagania per węzeł

| Host | Typ | Cel |
|------|-----|-----|
| `node-pl-01` | A | IP węzła |
| `node-pl-02` | A | IP węzła |

Panel klienta linkuje `https://node-pl-XX.verris.pl:2222` — **nie używaj surowego IP** (cert nie obejmuje IP).

## Weryfikacja

```bash
dig +short node-pl-01.verris.pl A
curl -vI https://node-pl-01.verris.pl:2222/ 2>&1 | grep -E 'subject:|issuer:|verify'
# subject: CN=*.verris.pl
```

Health score → **Panel DA (TLS)** = OK.

## Powiązane

- [`OVH_WILDCARD_TLS_SETUP.md`](./OVH_WILDCARD_TLS_SETUP.md) — klucze OVH API
- [`NODE_ONBOARD_RUNBOOK.md`](./NODE_ONBOARD_RUNBOOK.md)
- [`docs/ops/CURSOR_DEPLOY_SSH.md`](../../docs/ops/CURSOR_DEPLOY_SSH.md)
