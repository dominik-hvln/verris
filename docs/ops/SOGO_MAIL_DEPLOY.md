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

## 1. Host: Dovecot + Postfix; SOGo w Docker (Ubuntu 24.04)

Na **Ubuntu 24.04 (noble)** natywne pakiety `sogo` z repozytorium Alinto nie instalują się (zależności GNUstep). Używamy:

- **Host:** `dovecot-*`, wirtualne skrzynki Postfix (`./ops/scripts/prod-sogo-mail-bootstrap.sh`)
- **Docker:** SOGo + MariaDB (`./ops/scripts/prod-sogo-mail-up.sh`, `ops/docker-compose.sogo-mail.yml`)

```bash
cd /opt/verris
./ops/scripts/prod-sogo-mail-bootstrap.sh   # vmail, dovecot, postfix, UFW
# Caddy: mail.verris.pl → ops-sogo-1 (sieć verris_verris_public)
```

Debian 12 (bookworm) — opcjonalnie natywne pakiety `sogo` z https://packages.sogo.nu (wymaga klucza GPG w `/etc/apt/keyrings/sogo.asc` jako **armored**, nie dearmor).

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

**Odbiór z internetu (MX):** na hoście musi być `smtpd_recipient_restrictions` z `reject_unauth_destination` — **nie** `smtpd_relay_restrictions = permit_mynetworks, reject` (blokuje odpowiedzi z zewnątrz). Naprawa: `./ops/scripts/prod-mail-inbound-fix.sh`.

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

Stack Docker (`ops/sogo/conf.d/` → `ops/sogo/runtime/` przez `prod-sogo-mail-up.sh`):

- `mail.yaml` — IMAP/SMTP do Dovecot/Postfix na hoście
- `database.yaml` — profile SOGo (MariaDB)
- `auth.yaml` — **`SOGoUserSources` (SQL)** — wymagane do logowania w `/SOGo` (sam `SOGoIMAPServer` nie wystarcza)
- `WOWorkersCount: 3` — wymagane przy auth przez IMAP/SQL

Hasło webmailu: tabela `sogo_mail_auth` (widok `sogo_auth_view`), synchronizowana z API przy **utworzeniu skrzynki** i **„Generuj hasło IMAP”** (`SOGO_MYSQL_*` w `.env.prod` = hasło z `ops/sogo/.env.sogo`).

Na istniejącej bazie SOGo (volume już utworzony):

```bash
./ops/scripts/prod-sogo-auth-schema.sh
./ops/scripts/prod-sogo-mail-up.sh   # przebuduje runtime z auth.yaml
docker compose -f ops/docker-compose.sogo-mail.yml --env-file ops/sogo/.env.sogo up -d --force-recreate sogo
```

Po wdrożeniu: **ponownie wygeneruj hasło IMAP** w panelu admin (stare hasła nie trafiły do `sogo_mail_auth`).

Dokumentacja upstream: https://www.sogo.nu/files/pdf/SOGoInstallationGuide.pdf

Po instalacji:

```bash
systemctl enable --now sogo
```

## 5. Caddy — `mail.verris.pl`

W `ops/Caddyfile` (prod) kontener SOGo w sieci Docker `verris_verris_public`:

```
{$CADDY_MAIL_DOMAIN} {
    reverse_proxy ops-sogo-1:80
}
```

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

Antyspam inbound: [`RSPAMD_MAIL.md`](./RSPAMD_MAIL.md).

Powiązane: [`MAIL-4_CONTROL_PLANE_MAIL.md`](../MAIL-4_CONTROL_PLANE_MAIL.md), [`HOSTING_LAUNCH_TASKS.md`](../HOSTING_LAUNCH_TASKS.md).
