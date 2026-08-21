# Security Hardening Baseline (Control-plane + Nodes)

## Goal

Apply a repeatable hardening baseline across:

- control-plane servers (client/admin/staff panels + API),
- compute nodes (DirectAdmin/CloudLinux),
- any supporting hosts.

This document covers prevention for abuse incidents (netscan/C2) and common server threats.

## Scope

1. Host baseline hardening:
   - SSH hardening
   - fail2ban
   - kernel/sysctl hardening
   - security auto-updates
   - ingress firewall
2. Outbound lock-down:
   - egress deny-by-default policy
   - strict allowlist by host role
   - IOC-specific block rules
3. Validation + rollback checkpoints.

## Scripts

- `ops/scripts/security-hardening-baseline.sh` — SSH, fail2ban, UFW ingress + **instaluje stos poniżej**
- `ops/scripts/security-install-verris-security.sh` — IOC, auditd, timer watch
- `ops/scripts/security-control-plane-egress.sh` — iptables DROP IOC (Docker-safe)
- `ops/scripts/security-egress-watch.sh` — monitoring co 5 min
- `ops/scripts/security-egress-lockdown.sh` — strict nft egress (**tylko node**)
- `ops/scripts/security-incident-collect.sh` — triage po incydencie

Szczegóły operacyjne: `docs/ops/SECURITY_PREVENTION_STACK.md`.

## Rollout order (mandatory)

1. Pick one non-critical host first.
2. Run baseline in dry-run.
3. Apply baseline.
4. Validate access and core services.
5. Run egress lock-down in dry-run and review generated policy.
6. Apply egress lock-down from out-of-band console.
7. Validate production traffic.
8. Repeat host-by-host.

Never apply strict egress policy to all hosts at once.

## Control-plane commands

```bash
sudo bash ops/scripts/security-hardening-baseline.sh --role control-plane --dry-run
sudo bash ops/scripts/security-hardening-baseline.sh --role control-plane
```

`security-egress-lockdown.sh` is intentionally disabled for `control-plane` role, because nftables override can remove Docker NAT and break panel/API connectivity.

## Compute node commands

```bash
sudo bash ops/scripts/security-hardening-baseline.sh --role node --dry-run
sudo bash ops/scripts/security-hardening-baseline.sh --role node

sudo bash ops/scripts/security-egress-lockdown.sh --role node --dry-run
sudo bash ops/scripts/security-egress-lockdown.sh --role node --apply
```

## Validation checklist (after each host)

- SSH access still works via key.
- `fail2ban-client status` shows active jail for ssh.
- Firewall shows expected open ports only:
  - control-plane: `22`, `80`, `443`
  - node: `22`, `80`, `443`, `2222`
- API/panels health checks are green.
- DirectAdmin node still reachable (for node hosts).
- No unexpected blocked legitimate outbound traffic.
- For control-plane: Docker NAT still present (`iptables -t nat -S` shows MASQUERADE for Docker subnets).
- For node: public hosting access ports work (`21`, `587`, `993`), while `3306` remains restricted (control-plane only unless explicitly opened).

## Incident-specific validation (current case)

- `nft list ruleset` contains deny rule for `216.218.185.162`.
- No new Hetzner abuse report after rollout.
- No new Spamhaus XBL detections.

## Emergency rollback

If service disruption happens:

```bash
sudo nft flush ruleset
sudo systemctl restart nftables || true
sudo ufw disable || true
```

Then restore host connectivity, fix allowlist, and re-apply.

## Operational requirements

- Maintain per-host allowlist inventory in ops notes.
- Re-review allowlist after adding any new vendor integration.
- Keep incident artifacts for at least 1 year.
