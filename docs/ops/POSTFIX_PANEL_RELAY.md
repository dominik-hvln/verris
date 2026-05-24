# Postfix na serwerze panelu (domyślna wysyłka LIVE)

> API w kontenerze Docker przekazuje maile na **Postfix na hoście** (`localhost:25`, bez AUTH).  
> Admin może później włączyć **zewnętrzny relay** w panelu: **Ustawienia → Poczta (SMTP)**.

## Wymagania

- Control-plane (ten sam host co Docker)
- Domena nadawcza np. `panel@verris.pl` — rekordy **SPF**, **DKIM**, **DMARC** (MAIL-3)
- W `.env.prod`: `SMTP_HOST=localhost`, `SMTP_PORT=25`, `SMTP_SECURE=none`

## Instalacja (Debian/Ubuntu)

```bash
apt-get update && apt-get install -y postfix mailutils opendkim opendkim-tools

# Podczas instalacji Postfix: "Internet Site", system mail name = verris.pl (lub FQDN hosta)
```

### `/etc/postfix/main.cf` (skrót)

```ini
myhostname = mail.verris.pl
myorigin = verris.pl
inet_interfaces = loopback-only
mydestination =
relayhost =
mynetworks = 127.0.0.0/8 [::1]/128 172.16.0.0/12
```

`172.16.0.0/12` obejmuje typową sieć Docker — kontener API musi móc połączyć się z hostem na port 25.

**UFW:** jeśli firewall jest aktywny, dodaj regułę (inaczej kontener dostaje timeout na `:25`):

```bash
ufw allow from 172.16.0.0/12 to any port 25 proto tcp comment 'Postfix from Docker'
ufw reload
```

**SMTPUTF8 / IPv6:** niektóre MX wymagają wyłączenia wymuszonego UTF8 lub preferencji IPv4:

```bash
postconf -e 'smtp_address_preference = ipv4'
postconf -e 'myhostname = mail.verris.pl'
postconf -e 'smtp_helo_name = mail.verris.pl'
systemctl reload postfix
```

Jeśli API nie widzi hostowego `localhost`, w `docker-compose.prod.yml` dla serwisu `api` dodaj:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

i tymczasowo `SMTP_HOST=host.docker.internal` w `.env.prod` (lub mapowanie `network_mode` — preferuj `extra_hosts`).

### DKIM (opendkim)

Skonfiguruj selector `default` dla domeny `verris.pl` i dopisz rekord DNS `default._domainkey.verris.pl`.

Pełna checklista DNS (SPF/DMARC): [`MAIL_DNS_CHECKLIST.md`](./MAIL_DNS_CHECKLIST.md).  
Anty-SPAM / DKIM: [`MAIL_DELIVERABILITY.md`](./MAIL_DELIVERABILITY.md).  
Skrzynki zespołu (MAIL-4): [`MAIL-4_CONTROL_PLANE_MAIL.md`](./MAIL-4_CONTROL_PLANE_MAIL.md).

## Test

```bash
# z hosta
echo "test body" | mail -s "Postfix local test" twoj@email.pl

# z kontenera API
docker compose -f docker-compose.prod.yml exec api node -e "
  const net=require('net');
  const s=net.connect(25,'host.docker.internal',()=>{s.write('QUIT\\r\\n');});
  s.on('data',d=>console.log(d.toString()));
"
```

W panelu admin: **Poczta (SMTP) → Wyślij test na mój e-mail**.

## Zewnętrzny relay (opcjonalnie)

Panel admin → **Poczta (SMTP)** → tryb **Zewnętrzny relay SMTP**. Hasło zapisywane szyfrowane (`APP_KMS_KEY`). Zmiana działa **bez restartu API**.

Powiązane: [`GRAFANA_ALERTING.md`](./GRAFANA_ALERTING.md), [`HOSTING_LAUNCH_TASKS.md`](../HOSTING_LAUNCH_TASKS.md) MAIL-*.
