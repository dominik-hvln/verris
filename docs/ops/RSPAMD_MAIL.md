# Rspamd — antyspam poczty @verris.pl (MAIL-4e)

> **Cel:** filtrowanie **przychodzącego** SMTP (MX) i łagodny skan wysyłki z Docker; podpis DKIM nadal przez **OpenDKIM** (`:8891`).

## Architektura

```
Internet → Postfix :25 (smtpd)
              └── milter Rspamd :11332  → reject / X-Spam / deliver

API/SOGo → Postfix :25 (submission / mynetworks)
              └── milter Rspamd :11332 (whitelist Docker)
              └── milter OpenDKIM :8891 → DKIM-Signature
```

## Instalacja na hoście

```bash
cd /opt/verris
chmod +x ops/scripts/prod-rspamd-install.sh
./ops/scripts/prod-rspamd-install.sh
```

Konfiguracja w repo: `ops/rspamd/local.d/` → kopiowana do `/etc/rspamd/local.d/`.

## Weryfikacja

```bash
systemctl status rspamd redis-server
rspamadm configtest   # oczekiwane: "syntax OK" (bez nested settings / routine errors)
ss -tlnp | grep 11332 # start ~10–30 s po restart
postconf smtpd_milters non_smtpd_milters
rspamadm stat
journalctl -u rspamd -n 30 --no-pager
```

Wyślij test z zewnątrz na `twoja.skrzynka@verris.pl` — w logach Rspamd widać symbol score.

## Dostrajanie

| Plik | Znaczenie |
|------|-----------|
| `local.d/actions.conf` | próg `reject` (domyślnie 15) |
| `local.d/greylisting.conf` | wyłączone (szybszy pierwszy mail) |
| `local.d/settings.conf` | whitelist IP Docker/localhost dla wysyłki |
| `local.d/dkim_signing.conf` | `false` — podpis tylko OpenDKIM |

Po zmianie: `systemctl restart rspamd && systemctl reload postfix`.

## Uwagi LIVE

- **Nie** otwieraj `11332` w UFW — milter tylko localhost.
- Fałszywe pozytywy: obniż `reject` lub dodaj adres nadawcy do whitelist (mapy / settings).
- Gmail spam przy `dkim=pass` to zwykle reputacja/treść, nie Rspamd — patrz [`MAIL_DELIVERABILITY.md`](./MAIL_DELIVERABILITY.md).

Powiązane: [`SOGO_MAIL_DEPLOY.md`](./SOGO_MAIL_DEPLOY.md), [`MAIL-4_CONTROL_PLANE_MAIL.md`](../MAIL-4_CONTROL_PLANE_MAIL.md).
