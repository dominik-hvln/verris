# Hetzner Abuse Incident - 2026-06-01 (Netscan + Spamhaus XBL)

## Scope

- Provider notice: outbound netscan traffic from `204.168.174.138`.
- External listing: Spamhaus XBL (`tinba` C2 pattern, sinkhole `216.218.185.162:80`).
- Deadline from provider: mitigation confirmation required before `2026-06-02 22:20 UTC`.

This runbook is for immediate containment, evidence collection, and provider response.

## Severity

- Classification: **P0 security incident** (possible host compromise / malware activity).
- GO impact: **blocker** until containment + validation complete.

## Immediate containment (execute on affected host now)

1. Isolate server egress to minimum:
   - keep only required outbound destinations for control-plane operations
   - block generic outbound 80/443 from unknown processes/users
2. Rotate all secrets potentially exposed on that host:
   - `JWT_SECRET`
   - `APP_KMS_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - any node bootstrap token and DA/API credentials
3. Force session invalidation for panel users after JWT rotation.
4. Preserve forensic evidence before cleanup/reinstall.

## Evidence collection checklist

Run and archive outputs (timestamped file names):

```bash
date -u
hostnamectl
who -a
last -a | head -100
ss -plantu
lsof -nPi
ps auxfww
systemctl list-units --type=service --state=running
journalctl --since "2026-06-01 21:30:00 UTC" --until "2026-06-01 23:30:00 UTC"
crontab -l
ls -la /etc/cron* /var/spool/cron
iptables-save || true
nft list ruleset || true
```

Also collect:

- API/service logs: `journalctl -u verris-api --since "..."`
- Caddy/nginx logs in the same window
- any EDR/AV detections
- package integrity checks (`debsums`/`rpm -Va` if available)

## Eradication and hardening plan

1. Stop and remove unknown binaries/processes/cron entries.
2. Patch OS and critical packages (`apt update && apt upgrade -y`).
3. Enforce strict firewall policy:
   - inbound allow-list only (`22`, `80`, `443`, required internal ports)
   - outbound allow-list for required providers/services only
4. Enable/verify:
   - SSH key-only auth, no password login
   - fail2ban
   - unattended security updates
5. Rebuild compromised host from clean image if integrity is uncertain.
6. Re-run smoke checks for panel/API/node after remediation.

## Validation before closure

- no unknown outbound connections in 24h monitoring window
- no hits on Spamhaus/XBL follow-up checks
- no repeated Hetzner abuse alerts
- all rotated secrets applied and old ones revoked

## Short response template to Hetzner

Use this exact short response (edit identifiers if needed):

---

Subject: Re: Abuse report - 204.168.174.138

Hello,

Thank you for the notification. We investigated the traffic from `204.168.174.138` and treated it as a critical security incident.

What likely happened:
- The server initiated unauthorized outbound connections consistent with automated scanning/malware-like behavior (including the indicators you provided).

What we already did:
- Isolated outbound traffic and blocked suspicious egress patterns.
- Started incident response and forensic evidence collection.
- Rotated sensitive credentials/secrets and invalidated active sessions where applicable.
- Reviewed running processes/services/cron entries and removed suspicious artifacts.

What we are doing next:
- Completing full host integrity validation and hardening.
- Rebuilding from a clean image if any compromise cannot be fully ruled out.
- Keeping strict outbound filtering and additional monitoring in place to prevent recurrence.

We will send a follow-up update after final validation.

Best regards,
Verris Security Team

---

## Prevention (po zamknięciu incydentu)

Zainstaluj na control-plane i węzłach stos z `docs/ops/SECURITY_PREVENTION_STACK.md`:

```bash
cd /opt/verris
sudo bash ops/scripts/security-hardening-baseline.sh --role control-plane
sudo bash ops/scripts/security-egress-lockdown.sh --role node --apply   # na każdym węźle DA
```

## Follow-up in repo governance

- Track this as OPS blocker in `docs/LIVE_VERIFICATION_MATRIX.md`.
- Add post-incident summary in `docs/LIVE_VERIFICATION_REPORT.md`.
- Keep artifacts for minimum 1 year (per incident policy).
