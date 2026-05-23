# MAIL-3 — SPF, DKIM, DMARC (verris.pl)

> Po uruchomieniu Postfix na panelu. Wpisz datę wdrożenia DNS w [`HOSTING_LAUNCH_TASKS.md`](../HOSTING_LAUNCH_TASKS.md).

## 1. SPF (TXT na `verris.pl`)

```
v=spf1 mx a:mail.verris.pl ip4:<PUBLIC_IP_PANEL> ~all
```

Zastąp `<PUBLIC_IP_PANEL>` adresem serwera control-plane (np. `204.168.174.138`).

## 2. DKIM (opendkim na hoście)

```bash
apt-get install -y opendkim opendkim-tools
# Selector: default → rekord default._domainkey.verris.pl
opendkim-genkey -s default -d verris.pl
```

Rekord DNS:

```
default._domainkey.verris.pl TXT "v=DKIM1; k=rsa; p=<PUBLIC_KEY>"
```

Podłącz opendkim do Postfix (`milter` w `main.cf`) — szczegóły w [`POSTFIX_PANEL_RELAY.md`](./POSTFIX_PANEL_RELAY.md).

## 3. DMARC (TXT na `_dmarc.verris.pl`)

```
v=DMARC1; p=quarantine; rua=mailto:dominik@hvln.pl; pct=100; adkim=s; aspf=s
```

Po stabilnym dostarczaniu: `p=reject`.

## 4. Weryfikacja

- [ ] [mail-tester.com](https://www.mail-tester.com) — wynik ≥ 8/10
- [ ] Test z admina: **Ustawienia → Poczta (SMTP) → Wyślij test**
- [ ] Nagłówki przychodzące: `Authentication-Results: spf=pass dkim=pass`

**Status:** ⏳ DNS u operatora domeny
