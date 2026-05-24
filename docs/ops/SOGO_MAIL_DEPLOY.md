# SOGo + Dovecot + Postfix — poczta zespołu @verris.pl (MAIL-4)

> **Decyzja produktowa:** webmail i kalendarz przez **SOGo**; pracownicy mogą też używać **Outlook / Thunderbird / Apple Mail** (IMAP 993, SMTP 587).  
> Panel Verris: **admin** zarządza skrzynkami; **staff** widzi dane połączenia (bez własnego webmaila w React).

## Architektura

```
Internet ──MX──► Postfix (host, mail.verris.pl)
                    ├── virtual_mailbox_maps (z API)
                    ├── Dovecot LMTP → Maildir /var/mail/vhosts/verris.pl/
                    └── SOGo (web + CalDAV/CardDAV) ──► Dovecot auth

Pracownik:
  • Przeglądarka → https://mail.verris.pl/SOGo
  • Desktop    → IMAP mail.verris.pl:993, SMTP :587
  • Tickety    → powiadomienia na User.email (= skrzynka @verris.pl)
```

## Wymagania wstępne

- MAIL-3 ✅ (SPF, DKIM, DMARC, MX → `mail.verris.pl`)
- Postfix na hoście ([`POSTFIX_PANEL_RELAY.md`](./POSTFIX_PANEL_RELAY.md))
- DNS A/AAAA dla `mail.verris.pl` → IP panelu
- UFW: **25/tcp**, **587/tcp**, **443/tcp** (SOGo za Caddy)

## 1. Pakiety (Debian 12 / bookworm)

```bash
apt-get update
apt-get install -y dovecot-core dovecot-imapd dovecot-lmtpd \
  sogo sogo-activesync \
  postgresql-client

mkdir -p /var/mail/vhosts/verris.pl
chown -R vmail:vmail /var/mail/vhosts 2>/dev/null || chown -R postfix:postfix /var/mail/vhosts
mkdir -p /etc/postfix/verris
```

## 2. Postfix — wirtualne skrzynki

W `/etc/postfix/main.cf` (dopisz):

```ini
virtual_mailbox_domains = verris.pl
virtual_mailbox_maps = hash:/etc/postfix/verris/virtual_mailbox_maps
virtual_alias_maps = hash:/etc/postfix/verris/virtual_alias_maps
virtual_mailbox_base = /var/mail/vhosts
virtual_minimum_uid = 5000
virtual_uid_maps = static:5000
virtual_gid_maps = static:5000
virtual_transport = lmtp:unix:private/dovecot-lmtp

# Odbiór z internetu (obok loopback-only dla wysyłki z Docker):
inet_interfaces = loopback-only, eth0
# lub po testach: inet_interfaces = all + mynetworks restrykcje
```

> **Uwaga:** obecna konfiguracja ma `inet_interfaces = loopback-only` — dla MAIL-4 trzeba włączyć odbiór na interfejsie publicznym i UFW `25/tcp`.

Mapy generuje API Verris (`POST /admin/mailboxes/sync-postfix`) do `/etc/postfix/verris/`, potem na hoście:

```bash
postmap /etc/postfix/verris/virtual_mailbox_maps
postmap /etc/postfix/verris/virtual_alias_maps
systemctl reload postfix
```

Zmienne w `.env.prod` (api):

```env
CONTROL_PLANE_MAIL_MAPS_DIR=/etc/postfix/verris
CONTROL_PLANE_MAIL_DATA_ROOT=/var/mail/vhosts
CONTROL_PLANE_MAIL_HOST=mail.verris.pl
SOGO_WEB_URL=https://mail.verris.pl/SOGo
```

Zamontuj katalog map do kontenera API (fragment `docker-compose.prod.yml`):

```yaml
api:
  volumes:
    - /etc/postfix/verris:/etc/postfix/verris
```

## 3. Dovecot

Plik `/etc/dovecot/dovecot.conf` (skrót — dostosuj do dystrybucji):

```ini
mail_location = maildir:/var/mail/vhosts/%d/%n
auth_mechanisms = plain login
passdb {
  driver = passwd-file
  args = /etc/postfix/verris/dovecot-passwd
}
userdb {
  driver = static
  args = uid=5000 gid=5000 home=/var/mail/vhosts/%d/%n
}
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}
protocols = imap lmtp
ssl = required
ssl_cert = </etc/letsencrypt/live/mail.verris.pl/fullchain.pem
ssl_key = </etc/letsencrypt/live/mail.verris.pl/privkey.pem
```

`dovecot-passwd` generowany z API (format: `user@verris.pl:{BLF-CRYPT}$2y$...`).

```bash
systemctl enable --now dovecot
```

## 4. SOGo

Konfiguracja zależy od pakietu (`/etc/sogo/sogo.conf`). Kluczowe:

- `SOGoMailingMechanism = smtp`
- `SMTPServer = 127.0.0.1:25`
- `SOGoUserSources` → Dovecot lub SQL (zalecane: **Dovecot** jako auth)
- `SOGoProfileURL` = `https://mail.verris.pl/SOGo`

Dokumentacja upstream: https://www.sogo.nu/files/pdf/SOGoInstallationGuide.pdf

Po instalacji:

```bash
systemctl enable --now sogo
```

## 5. Caddy — `mail.verris.pl`

Dopisz do `ops/Caddyfile` (prod):

```
mail.verris.pl {
    reverse_proxy 127.0.0.1:20000
}
```

(port SOGo domyślnie — zweryfikuj `WOPort` w `sogo.conf`)

W `.env.prod`:

```env
CADDY_MAIL_DOMAIN=mail.verris.pl
```

## 6. UFW

```bash
ufw allow 25/tcp comment 'SMTP MX inbound'
ufw allow 587/tcp comment 'SMTP submission staff'
ufw allow 993/tcp comment 'IMAPS staff desktop'
ufw reload
```

## 7. Panel admin — skrzynki

**Admin → Ustawienia → Poczta zespołu** (`/settings/team-mail`):

1. Utwórz skrzynkę STAFF (local-part, powiąż User STAFF/ADMIN).
2. Skopiuj **hasło IMAP** (pokazywane raz).
3. **Synchronizuj mapy Postfix**.
4. Pracownik: SOGo lub Outlook — dane w **Staff → Poczta @verris**.

## 8. Smoke

| # | Test |
|---|------|
| 1 | `echo test \| mail -s subj twoja.skrzynka@verris.pl` z zewnątrz lub mail-tester |
| 2 | Logowanie SOGo na `https://mail.verris.pl/SOGo` |
| 3 | IMAP w Thunderbird (993 / STARTTLS 587) |
| 4 | Mail między dwoma pracownikami `@verris.pl` |
| 5 | Ticket przypisany → powiadomienie na skrzynkę pracownika |

## 9. Skrypt na serwerze

```bash
cd /opt/verris && ./ops/scripts/prod-mail-apply-maps.sh
```

Powiązane: [`MAIL-4_CONTROL_PLANE_MAIL.md`](../MAIL-4_CONTROL_PLANE_MAIL.md), [`HOSTING_LAUNCH_TASKS.md`](../HOSTING_LAUNCH_TASKS.md).
