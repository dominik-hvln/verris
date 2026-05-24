# Dostarczalność (anty-SPAM) — verris.pl

> **Przyczyna SPAM (2026-05-24):** OpenDKIM **nie podpisywał** wiadomości (`connect to Milter inet:localhost:8891: Connection refused` — zduplikowane linie `Socket` w `/etc/opendkim.conf`). Naprawione: jedna linia `Socket`, restart `opendkim`, log: `DKIM-Signature field added`.

## Checklist po każdej zmianie DNS / Postfix

| # | Test | Oczekiwane |
|---|------|------------|
| 1 | `opendkim-testkey -d verris.pl -s default` | `key OK` |
| 2 | `ss -tlnp \| grep 8891` | `opendkim` nasłuchuje |
| 3 | Test wysyłki + log | `DKIM-Signature field added` w `/var/log/mail.log` |
| 4 | Nagłówki w skrzynce | `spf=pass`, `dkim=pass`, `dmarc=pass` |
| 5 | [mail-tester.com](https://www.mail-tester.com) | ≥ **9/10** |
| 6 | PTR | `204.168.174.138` → `mail.verris.pl` |

## Wymagania techniczne (LIVE)

### Nadawca (alignment)

- **Envelope From** i nagłówek **From** z tej samej domeny `@verris.pl` (np. `noreply@verris.pl`, `panel@verris.pl`).
- Unikać `root@Panel`, `...@Panel` — psuje reputację i DMARC.
- W API: domyślnie `panel@verris.pl` + nazwa **Verris** — edycja: admin **Ustawienia → Poczta (SMTP)** (`mail.fromName`, `mail.fromAddress` w DB). Dedykowane adresy per rola — MAIL-4.

### Postfix / OpenDKIM

```bash
postconf myhostname smtp_helo_name   # mail.verris.pl
systemctl status opendkim
ss -tlnp | grep 8891
grep "DKIM-Signature field added" /var/log/mail.log | tail -3
```

Jeśli milter znowu `Connection refused` — sprawdź **jedną** linię `Socket inet:8891@localhost` w `/etc/opendkim.conf`.

### DNS (OVH)

- SPF z `ip4` + `ip6` + `a:mail.verris.pl`
- DKIM `default._domainkey`
- DMARC `_dmarc` (start `p=quarantine`, potem `reject`)
- **Jeden** rekord MX → `mail.verris.pl`

### Reputacja IP (świeży serwer)

- Pierwsze dni: unikaj masowych kampanii; tylko transakcje (IAM, billing, tickety).
- Po MAIL-4: osobne adresy `noreply@`, `support@`, `security@` zamiast losowych From.
- Opcjonalnie później: **Rspamd** na hoście (scoring wychodzącej) — nie wymagane jeśli DKIM+SPF+PTR OK.

## Szybka naprawa na prod (runbook)

```bash
# 1. OpenDKIM nasłuchuje
systemctl restart opendkim && ss -tlnp | grep 8891

# 2. Test podpisu
swaks --to twoj@email.pl --from noreply@verris.pl --server 127.0.0.1 --port 25 \
  --header "Subject: DKIM verify" --body "test"
grep "DKIM-Signature field added" /var/log/mail.log | tail -1

# 3. Admin panel → Ustawienia → Poczta → wyślij test
```

## Jeśli nadal SPAM

1. Oznacz „Nie spam” w skrzynce — buduje reputację nadawcy u odbiorcy.
2. Sprawdź nagłówek `Authentication-Results` — który test pada?
3. `dig +short default._domainkey.verris.pl TXT` — zgodny z serwerem?
4. Czy hvln.pl / Gmail widzi **nowy** mail po naprawie DKIM (stare bez podpisu mogły trafić do spamu trwale w tej sesji).

Powiązane: [`OVH_DNS_VERRIS_PL.md`](./OVH_DNS_VERRIS_PL.md), [`MAIL-4_CONTROL_PLANE_MAIL.md`](./MAIL-4_CONTROL_PLANE_MAIL.md).
