#!/usr/bin/env bash
# Wdrożenie security + egress na węźle hostingowym z control-plane (jump SSH).
# Uruchamiaj na CP jako root: cd /opt/verris && ./ops/scripts/prod-rollout-node-via-jump.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NODE_HOST="${NODE_HOST:-root@62.238.0.223}"
NODE_SSH_KEY="${NODE_SSH_KEY:-/root/.ssh/verris_node_deploy}"
RSYNC_SSH="ssh -i ${NODE_SSH_KEY} -o BatchMode=yes"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

[ "$(id -u)" = "0" ] || { echo "Run as root on control-plane" >&2; exit 1; }
[ -f "$NODE_SSH_KEY" ] || { echo "Missing $NODE_SSH_KEY" >&2; exit 1; }

log "Sync ops/ → ${NODE_HOST}:/opt/verris/"
ssh -i "$NODE_SSH_KEY" -o BatchMode=yes "${NODE_HOST#*@}" "mkdir -p /opt/verris" 2>/dev/null || true
rsync -az -e "$RSYNC_SSH" "${REPO_ROOT}/ops/" "${NODE_HOST}:/opt/verris/ops/"

log "security-install (node)"
ssh -i "$NODE_SSH_KEY" -o BatchMode=yes "$NODE_HOST" \
  "bash /opt/verris/ops/scripts/security-install-verris-security.sh --role node"

log "egress-lockdown dry-run"
ssh -i "$NODE_SSH_KEY" -o BatchMode=yes "$NODE_HOST" \
  "bash /opt/verris/ops/scripts/security-egress-lockdown.sh --role node --dry-run"

if [ "${SKIP_EGRESS_APPLY:-0}" != "1" ]; then
  log "egress-lockdown apply"
  ssh -i "$NODE_SSH_KEY" -o BatchMode=yes "$NODE_HOST" \
    "bash /opt/verris/ops/scripts/security-egress-lockdown.sh --role node --apply"
fi

log "Done. Verify: systemctl status verris-security-watch.timer; curl -kI https://node-pl-01.verris.pl:2222/"
