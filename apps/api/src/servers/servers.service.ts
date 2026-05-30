import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { BootstrapTokenService } from './bootstrap-token.service';
import { DirectAdminService } from './directadmin.service';
import { Prisma, ServerStatus } from '@verris/database';
import { InitServerDto } from './dto/init-server.dto';
import { HandshakeDto } from './dto/handshake.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdateDirectAdminConfigDto } from './dto/directadmin-config.dto';
import { renderBootstrapNodeTasksInstallFragment, renderProbesTasksHook } from './node-tasks-agent.install';

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly tokens: BootstrapTokenService,
    private readonly directAdmin: DirectAdminService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Admin: lifecycle
  // ---------------------------------------------------------------------------

  async initServer(
    dto: InitServerDto,
    actorUserId: string,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    // Reserve a placeholder ipAddress unique value until handshake fills it in.
    // We use the server id as a sentinel — it's unique by construction.
    const reservedIp = `pending:${this.crypto.generateRandomToken(8)}`;

    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        hostname: dto.hostname ?? null,
        region: dto.region ?? null,
        ipAddress: reservedIp,
        status: ServerStatus.INIT,
        notes: dto.notes ?? null,
      },
    });

    const issued = await this.tokens.issue({
      serverId: server.id,
      createdById: actorUserId,
    });

    await this.audit.record({
      action: 'SERVER_INIT',
      actorUserId,
      details: { serverId: server.id, name: server.name },
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return {
      server,
      bootstrapToken: issued.plaintext,
      bootstrapTokenId: issued.token.id,
      expiresAt: issued.token.expiresAt,
    };
  }

  /**
   * Generates a single-use bootstrap script for a server.
   * Re-issues a fresh bootstrap token so admins can paste an up-to-date script
   * even if the previous token expired or was used.
   */
  async generateBootstrapScript(serverId: string, actorUserId: string) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    if (server.status !== ServerStatus.INIT && server.status !== ServerStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Bootstrap script is only available for servers in INIT or PENDING_APPROVAL state (current: ${server.status}).`,
      );
    }

    const issued = await this.tokens.issue({
      serverId: server.id,
      createdById: actorUserId,
    });

    const apiUrl = this.config.get<string>('publicApiUrl')!;
    const script = renderBootstrapScript({
      apiUrl,
      bootstrapToken: issued.plaintext,
      serverName: server.name ?? server.id,
    });

    await this.audit.record({
      action: 'SERVER_BOOTSTRAP_SCRIPT_ISSUED',
      actorUserId,
      details: { serverId: server.id, tokenId: issued.token.id },
    });

    return {
      serverId: server.id,
      script,
      bootstrapToken: issued.plaintext,
      expiresAt: issued.token.expiresAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Bootstrap handshake from a node
  // ---------------------------------------------------------------------------

  async handleHandshake(
    serverId: string,
    dto: HandshakeDto,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found for bootstrap token');

    if (server.status === ServerStatus.ACTIVE || server.status === ServerStatus.MAINTENANCE) {
      // Idempotency: accept additional handshakes from already-active servers
      // as a no-op so the bootstrap script never breaks an existing node. We
      // intentionally do *not* return the identity token here — it was
      // delivered exactly once on the first successful handshake.
      return {
        ...this.toPublicServer(server),
        identityToken: null,
      };
    }

    // Check that the new ipAddress would not collide with another server.
    const collision = await this.prisma.server.findFirst({
      where: { ipAddress: dto.ipAddress, NOT: { id: serverId } },
    });
    if (collision) {
      throw new ConflictException(
        `IP address ${dto.ipAddress} is already registered to another server (#${collision.id}).`,
      );
    }

    const identityToken = this.crypto.generateRandomToken(32);

    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: {
        ipAddress: dto.ipAddress,
        totalCpuCores: dto.totalCpuCores,
        totalMemoryMb: dto.totalMemoryMb,
        totalDiskMb: dto.totalDiskMb ?? undefined,
        publicKey: dto.publicKey ?? undefined,
        agentVersion: dto.agentVersion ?? undefined,
        identityToken,
        lastHandshakeAt: new Date(),
        status: ServerStatus.PENDING_APPROVAL,
      },
    });

    await this.audit.record({
      action: 'SERVER_HANDSHAKE',
      details: {
        serverId: updated.id,
        ipAddress: updated.ipAddress,
        totalCpuCores: updated.totalCpuCores,
        totalMemoryMb: updated.totalMemoryMb,
      },
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    // Return the identity token *exactly once* so the agent can store it for
    // subsequent telemetry pushes. After this response it never leaves the DB.
    return {
      ...this.toPublicServer(updated),
      identityToken,
    };
  }

  async approveServer(
    serverId: string,
    actorUserId: string,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    if (server.status !== ServerStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Only servers in PENDING_APPROVAL state can be approved (current: ${server.status}).`,
      );
    }

    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: {
        status: ServerStatus.ACTIVE,
        approvedAt: new Date(),
        approvedById: actorUserId,
      },
    });

    await this.audit.record({
      action: 'SERVER_APPROVED',
      actorUserId,
      details: { serverId },
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Admin: configuration & queries
  // ---------------------------------------------------------------------------

  async listServers() {
    const servers = await this.prisma.server.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { accounts: true } },
      },
    });
    return servers.map((s) => this.toPublicServer(s));
  }

  async getServer(id: string) {
    const server = await this.prisma.server.findUnique({
      where: { id },
      include: { _count: { select: { accounts: true } } },
    });
    if (!server) throw new NotFoundException('Server not found');
    return this.toPublicServer(server);
  }

  async updateServer(id: string, dto: UpdateServerDto, actorUserId: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    const updated = await this.prisma.server.update({
      where: { id },
      data: {
        name: dto.name ?? server.name,
        hostname: dto.hostname ?? server.hostname,
        region: dto.region ?? server.region,
        notes: dto.notes ?? server.notes,
        status: dto.status ?? server.status,
      },
    });

    await this.audit.record({
      action: 'SERVER_UPDATED',
      actorUserId,
      details: { serverId: id, changes: { ...dto } } as Prisma.InputJsonValue,
    });

    return this.toPublicServer(updated);
  }

  /**
   * Sprint 4 / A-08 — przełączenie węzła do trybu MAINTENANCE (i z powrotem).
   * - `enable=true`  → MAINTENANCE + zapis powodu, zaczyna blokować NodeSelector.
   * - `enable=false` → ACTIVE (jeśli był MAINTENANCE) + reset powodu.
   * Audyt: `ADMIN_NODE_MAINTENANCE_MODE_TOGGLED`.
   */
  async setMaintenanceMode(
    serverId: string,
    actorUserId: string,
    input: { enable: boolean; reason?: string | null },
  ) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    if (input.enable) {
      if (server.status !== ServerStatus.ACTIVE && server.status !== ServerStatus.MAINTENANCE) {
        throw new BadRequestException(
          `Maintenance mode można włączyć tylko dla węzłów ACTIVE/MAINTENANCE (jest: ${server.status}).`,
        );
      }
      const reason = input.reason?.trim() || null;
      const updated = await this.prisma.server.update({
        where: { id: serverId },
        data: {
          status: ServerStatus.MAINTENANCE,
          maintenanceReason: reason,
          maintenanceStartedAt: server.status === ServerStatus.MAINTENANCE
            ? server.maintenanceStartedAt
            : new Date(),
          maintenanceStartedById:
            server.status === ServerStatus.MAINTENANCE
              ? server.maintenanceStartedById
              : actorUserId,
        },
      });
      await this.audit.record({
        action: 'ADMIN_NODE_MAINTENANCE_MODE_TOGGLED',
        actorUserId,
        details: {
          serverId,
          to: 'MAINTENANCE',
          reason,
          previousStatus: server.status,
        } as Prisma.InputJsonValue,
      });
      return this.toPublicServer(updated);
    }

    if (server.status !== ServerStatus.MAINTENANCE) {
      throw new BadRequestException(
        `Wyłączenie maintenance dotyczy tylko węzłów w MAINTENANCE (jest: ${server.status}).`,
      );
    }

    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: {
        status: ServerStatus.ACTIVE,
        maintenanceReason: null,
        maintenanceStartedAt: null,
        maintenanceStartedById: null,
      },
    });
    await this.audit.record({
      action: 'ADMIN_NODE_MAINTENANCE_MODE_TOGGLED',
      actorUserId,
      details: {
        serverId,
        to: 'ACTIVE',
        previousReason: server.maintenanceReason,
      } as Prisma.InputJsonValue,
    });
    return this.toPublicServer(updated);
  }

  async setDirectAdminConfig(id: string, dto: UpdateDirectAdminConfigDto, actorUserId: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    const data: Record<string, unknown> = {
      daHost: dto.daHost,
      daPort: dto.daPort,
      daUsername: dto.daUsername,
      daUseTls: dto.daUseTls ?? server.daUseTls,
    };

    if (dto.daPassword) {
      data.daPasswordEnc = this.crypto.encrypt(dto.daPassword);
    }

    const updated = await this.prisma.server.update({ where: { id }, data });

    await this.audit.record({
      action: 'SERVER_DA_CONFIG_UPDATED',
      actorUserId,
      details: {
        serverId: id,
        daHost: dto.daHost,
        daUsername: dto.daUsername,
        passwordChanged: Boolean(dto.daPassword),
      },
    });

    return this.toPublicServer(updated);
  }

  testDirectAdmin(id: string) {
    return this.directAdmin.testConnection(id);
  }

  /** Strips encrypted secrets / internal identity values from API responses. */
  private toPublicServer<T extends { daPasswordEnc?: string | null; identityToken?: string | null }>(
    server: T,
  ) {
    const { daPasswordEnc: _enc, identityToken: _id, ...rest } = server;
    return {
      ...rest,
      daPasswordSet: Boolean(_enc),
    };
  }
}

function renderBootstrapScript(opts: { apiUrl: string; bootstrapToken: string; serverName: string }) {
  // Single-use bootstrap script. The plaintext token is embedded once and
  // becomes invalid as soon as the node successfully completes its handshake.
  return `#!/usr/bin/env bash
# Verris bootstrap — initial handshake for "${opts.serverName}"
# This script:
#   1. Gathers capacity info (IP/CPU/RAM/disk) and registers the node with the
#      Verris control plane via /servers/handshake.
#   2. Persists the returned X-Server-Id and X-Server-Token in /etc/verris.conf
#      (mode 0600, root-only) so the metrics agent can authenticate later.
#   3. Installs the metrics agent (/usr/local/bin/verris-agent.sh) and a
#      systemd timer (or fallback cron) that pushes lveinfo samples every
#      minute to /telemetry/lve.
#
# Re-running after success is harmless if the bootstrap token is still valid,
# but normally the token is marked as used after the first successful run.
#
# TIP: run inside tmux/screen — LiteSpeed install may take long; SSH may drop.
#      If interrupted, export LITESPEED_SERIAL_NO again and re-run this script.

set -euo pipefail

API_URL="${opts.apiUrl}"
BOOTSTRAP_TOKEN="${opts.bootstrapToken}"
CONFIG_FILE="/etc/verris.conf"
AGENT_PATH="/usr/local/bin/verris-agent.sh"
LOG_FILE="/var/log/verris-agent.log"

require_root() {
  if [ "$(id -u)" != "0" ]; then
    echo "[verris] This bootstrap must run as root. Use sudo." >&2
    exit 1
  fi
}

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[verris] Missing required command: $1" >&2
    exit 1
  fi
}

require_root
ensure_command curl
ensure_command awk
ensure_command sed

if ! command -v lveinfo >/dev/null 2>&1 && ! command -v cloudlinux-statistic >/dev/null 2>&1; then
  echo "[verris] CloudLinux LVE tools not found (lveinfo / cloudlinux-statistic)." >&2
  echo "[verris] Install CloudLinux on this node first — see admin panel node wizard." >&2
  exit 1
fi

LITESPEED_SERIAL_NO="\${LITESPEED_SERIAL_NO:-}"
if [ ! -x /usr/local/lsws/bin/lswsctrl ]; then
  if [ -z "$LITESPEED_SERIAL_NO" ]; then
    echo "[verris] LiteSpeed is not installed and LITESPEED_SERIAL_NO is missing." >&2
    echo "[verris] Export LITESPEED_SERIAL_NO and rerun bootstrap." >&2
    exit 1
  fi
  echo "[verris] Installing LiteSpeed Web Server..."
  bash <(curl -fsSL https://get.litespeed.sh) "$LITESPEED_SERIAL_NO"
fi

if ! ls /usr/local/lsws/lsphp*/bin/lsphp >/dev/null 2>&1; then
  echo "[verris] LSPHP binary not found under /usr/local/lsws/lsphp*/bin/lsphp" >&2
  echo "[verris] Install LSPHP from LiteSpeed repository before continuing." >&2
  exit 1
fi

if [ -d /usr/local/lsws/admin/conf/cert ]; then
  chown -R lsadm:lsadm /usr/local/lsws/admin/conf/cert/* 2>/dev/null || true
fi

/usr/local/lsws/bin/lswsctrl start >/dev/null 2>&1 || true
if ! /usr/local/lsws/bin/lswsctrl status >/dev/null 2>&1; then
  echo "[verris] LiteSpeed service is not healthy after startup." >&2
  exit 1
fi

if command -v ss >/dev/null 2>&1; then
  if ! ss -lnt | awk '{print $4}' | grep -E '(:7080)$' >/dev/null 2>&1; then
    echo "[verris] LiteSpeed WebAdmin port 7080 is not listening." >&2
    exit 1
  fi
fi

if [ -n "\${LSWS_WEBADMIN_ALLOW_IP:-}" ] && [ -f /usr/local/lsws/admin/conf/admin_config.xml ]; then
  cp /usr/local/lsws/admin/conf/admin_config.xml /usr/local/lsws/admin/conf/admin_config.xml.bak
  sed -i '' "s|<allow>.*</allow>|<allow>\${LSWS_WEBADMIN_ALLOW_IP}</allow>|" /usr/local/lsws/admin/conf/admin_config.xml 2>/dev/null \
    || sed -i "s|<allow>.*</allow>|<allow>\${LSWS_WEBADMIN_ALLOW_IP}</allow>|" /usr/local/lsws/admin/conf/admin_config.xml
  /usr/local/lsws/bin/lswsctrl restart >/dev/null 2>&1 || true
fi

PUBLIC_IP="\${PUBLIC_IP:-}"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP=$(curl -fsSL https://api.ipify.org || curl -fsSL http://checkip.amazonaws.com || hostname -I | awk '{print $1}')
fi
PUBLIC_IP=$(echo -n "$PUBLIC_IP" | tr -d '[:space:]')

CPU_CORES=$(nproc)
MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
DISK_MB=$(df -mP / | awk 'NR==2 {print $2}')

PUB_KEY=""
if [ -f /root/.ssh/id_ed25519.pub ]; then
  PUB_KEY=$(cat /root/.ssh/id_ed25519.pub)
elif [ -f /root/.ssh/id_rsa.pub ]; then
  PUB_KEY=$(cat /root/.ssh/id_rsa.pub)
fi

PAYLOAD=$(cat <<JSON
{
  "ipAddress": "$PUBLIC_IP",
  "totalCpuCores": $CPU_CORES,
  "totalMemoryMb": $MEM_MB,
  "totalDiskMb": $DISK_MB,
  "publicKey": "$PUB_KEY",
  "agentVersion": "agent-2"
}
JSON
)

echo "[verris] Sending handshake to $API_URL ..."
RESPONSE=$(curl -fsSL -w "\\n%{http_code}" -X POST "$API_URL/servers/handshake" \\
  -H "Content-Type: application/json" \\
  -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" \\
  -d "$PAYLOAD")

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS" != "201" ]; then
  echo "[verris] Handshake failed with HTTP $HTTP_STATUS" >&2
  echo "$BODY" >&2
  exit 1
fi

# Pull serverId and identityToken out of the JSON response without depending
# on jq (some bare CloudLinux installs don't ship it). The values are simple
# JSON strings so a permissive grep+sed is good enough.
SERVER_ID=$(printf '%s' "$BODY" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -n1)
IDENTITY_TOKEN=$(printf '%s' "$BODY" | sed -n 's/.*"identityToken"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -n1)

if [ -z "$SERVER_ID" ]; then
  echo "[verris] Handshake response did not include serverId. Aborting." >&2
  echo "$BODY" >&2
  exit 1
fi

if [ -n "$IDENTITY_TOKEN" ]; then
  install -m 0600 -o root -g root /dev/null "$CONFIG_FILE"
  cat > "$CONFIG_FILE" <<CFG
# Verris agent configuration — KEEP SECRET (chmod 600)
VERRIS_API_URL="$API_URL"
VERRIS_SERVER_ID="$SERVER_ID"
VERRIS_IDENTITY_TOKEN="$IDENTITY_TOKEN"
CFG
  echo "[verris] Stored agent credentials in $CONFIG_FILE"
elif [ ! -f "$CONFIG_FILE" ]; then
  echo "[verris] Handshake re-run before approval — no identity token returned and no existing config. Run the bootstrap with a fresh token." >&2
  exit 1
else
  echo "[verris] Re-handshake (no new identity token issued) — keeping existing $CONFIG_FILE."
fi

# -----------------------------------------------------------------------------
# Install metrics agent
# -----------------------------------------------------------------------------

cat > "$AGENT_PATH" <<'AGENT'
#!/usr/bin/env bash
# Verris metrics agent — sends 1-minute LVE buckets to the control plane.
set -euo pipefail
CONFIG_FILE="/etc/verris.conf"
[ -r "$CONFIG_FILE" ] || { echo "[verris-agent] Missing $CONFIG_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "\${VERRIS_API_URL:?missing VERRIS_API_URL}"
: "\${VERRIS_SERVER_ID:?missing VERRIS_SERVER_ID}"
: "\${VERRIS_IDENTITY_TOKEN:?missing VERRIS_IDENTITY_TOKEN}"

BUCKET_DURATION=60
BUCKET_START=$(date -u -d "@$(( ($(date +%s) / BUCKET_DURATION) * BUCKET_DURATION - BUCKET_DURATION ))" +%FT%TZ 2>/dev/null \\
  || date -u -r $(( ($(date +%s) / BUCKET_DURATION) * BUCKET_DURATION - BUCKET_DURATION )) +%FT%TZ)

ACCOUNTS_JSON="[]"

# Prefer cloudlinux-statistic if present; fall back to lveinfo. Both share the
# same field semantics (CPU% averaged over the period, memory in pages × 4 KB,
# IO in kbps). If neither is available, ship an empty payload — it still
# refreshes the heartbeat on the control plane.
if ! command -v cloudlinux-statistic >/dev/null 2>&1 && ! command -v lveinfo >/dev/null 2>&1; then
  echo "[verris-agent] CloudLinux tools missing (cloudlinux-statistic/lveinfo). Install CloudLinux LVE first." >&2
  exit 2
fi
if command -v cloudlinux-statistic >/dev/null 2>&1; then
  RAW=$(cloudlinux-statistic --period=last_minute --output=csv 2>/dev/null || true)
  if [ -n "$RAW" ]; then
    ACCOUNTS_JSON=$(printf '%s\\n' "$RAW" \\
      | awk -F',' 'NR>1 && $1!="" {
          username=$1
          cpu=$2+0
          mem_mb=($3+0)*4/1024
          disk_mb=($4+0)
          io_kbps=($5+0)
          gsub(/\\"/, "\\\\\\"", username)
          printf "%s{\\"username\\":\\"%s\\",\\"cpuUsagePercent\\":%.2f,\\"memUsageMb\\":%.2f,\\"diskUsageMb\\":%.2f,\\"ioUsageKbps\\":%.2f}", (NR==2?"":","), username, cpu, mem_mb, disk_mb, io_kbps
        } END {}' \\
      | awk 'BEGIN{print "["} {print} END{print "]"}')
  fi
elif command -v lveinfo >/dev/null 2>&1; then
  RAW=$(lveinfo --period=1m -o id,aCPU,aEP,aMEM,aIO --csv 2>/dev/null || true)
  if [ -n "$RAW" ]; then
    ACCOUNTS_JSON=$(printf '%s\\n' "$RAW" \\
      | awk -F',' 'NR>1 && $1!="" {
          username=$1
          cpu=$2+0
          mem_mb=($4+0)*4/1024
          io_kbps=($5+0)
          printf "%s{\\"username\\":\\"%s\\",\\"cpuUsagePercent\\":%.2f,\\"memUsageMb\\":%.2f,\\"diskUsageMb\\":0,\\"ioUsageKbps\\":%.2f}", (NR==2?"":","), username, cpu, mem_mb, io_kbps
        } END {}' \\
      | awk 'BEGIN{print "["} {print} END{print "]"}')
  fi
fi

PAYLOAD=$(cat <<JSON
{
  "bucketDurationS": $BUCKET_DURATION,
  "bucketStart": "$BUCKET_START",
  "agentVersion": "agent-2",
  "accounts": $ACCOUNTS_JSON
}
JSON
)

curl -fsS --max-time 20 -X POST "$VERRIS_API_URL/telemetry/lve" \\
  -H "Content-Type: application/json" \\
  -H "X-Server-Id: $VERRIS_SERVER_ID" \\
  -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \\
  -d "$PAYLOAD" >/dev/null
AGENT
chmod 0755 "$AGENT_PATH"
echo "[verris] Installed metrics agent at $AGENT_PATH"

# Wire the agent — prefer systemd, fall back to cron.
if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  cat > /etc/systemd/system/verris-agent.service <<UNIT
[Unit]
Description=Verris LVE metrics agent
After=network-online.target

[Service]
Type=oneshot
ExecStart=$AGENT_PATH
StandardOutput=append:$LOG_FILE
StandardError=append:$LOG_FILE
UNIT

  cat > /etc/systemd/system/verris-agent.timer <<TIMER
[Unit]
Description=Run Verris LVE metrics agent every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s
Unit=verris-agent.service

[Install]
WantedBy=timers.target
TIMER

  systemctl daemon-reload
  systemctl enable --now verris-agent.timer
  echo "[verris] Enabled verris-agent.timer (systemd)"
elif [ -d /etc/cron.d ]; then
  cat > /etc/cron.d/verris-agent <<CRON
# Verris LVE metrics agent
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root $AGENT_PATH >> $LOG_FILE 2>&1
CRON
  echo "[verris] Installed cron job /etc/cron.d/verris-agent"
else
  echo "[verris] WARNING: no systemd nor cron available — install a 1-minute scheduler manually for $AGENT_PATH" >&2
fi

PROBES_PATH="/usr/local/bin/verris-probes.sh"
PROBES_LOG="/var/log/verris-probes.log"

cat > "$PROBES_PATH" <<'PROBES'
#!/usr/bin/env bash
# Verris local prober — pulls the probe list for this server from the
# control plane and runs each check from the node itself, then pushes the
# results back to /agent/probes/local. Catches failures invisible to the
# control-plane prober (e.g. service crashed but external CDN still serves).
set -euo pipefail
CONFIG_FILE="/etc/verris.conf"
[ -r "$CONFIG_FILE" ] || { echo "[verris-probes] Missing $CONFIG_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "\${VERRIS_API_URL:?missing VERRIS_API_URL}"
: "\${VERRIS_SERVER_ID:?missing VERRIS_SERVER_ID}"
: "\${VERRIS_IDENTITY_TOKEN:?missing VERRIS_IDENTITY_TOKEN}"

LIST=$(curl -fsS --max-time 10 -X GET "$VERRIS_API_URL/agent/probes/list" \\
  -H "X-Server-Id: $VERRIS_SERVER_ID" \\
  -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" || true)
if [ -z "$LIST" ]; then
  exit 0
fi

# Each probe is on its own line as <id>|<kind>|<target>. We use a Python
# one-liner because it's available on every CloudLinux box and avoids
# wrestling with awk over JSON.
PARSED=$(printf '%s' "$LIST" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for p in data.get("probes", []):
    print(p["id"] + "|" + p["kind"] + "|" + p["target"])
' 2>/dev/null || true)

if [ -z "$PARSED" ]; then
  exit 0
fi

probe_one() {
  local id="$1" kind="$2" target="$3"
  local start_ms=$(date +%s%3N)
  local ok="false"
  local err=""
  local latency=0
  case "$kind" in
    HTTP|HTTPS|DA_API)
      if curl -fsS --max-time 5 -o /dev/null "$target" 2>/dev/null; then
        ok="true"
      else
        err="curl_fail"
      fi
      ;;
    SMTP|IMAP|POP3|MYSQL|SSH)
      local host port
      host="\${target%%:*}"
      port="\${target##*:}"
      if [ -z "$host" ] || [ -z "$port" ] || [ "$host" = "$target" ]; then
        err="invalid_target"
      elif command -v nc >/dev/null 2>&1 && nc -z -w 5 "$host" "$port" 2>/dev/null; then
        ok="true"
      else
        err="tcp_fail"
      fi
      ;;
    DNS)
      if command -v getent >/dev/null 2>&1 && getent hosts "$target" >/dev/null 2>&1; then
        ok="true"
      else
        err="dns_fail"
      fi
      ;;
    *)
      err="unknown_kind"
      ;;
  esac
  local end_ms=$(date +%s%3N)
  latency=$(( end_ms - start_ms ))
  if [ "$ok" = "true" ]; then
    printf '{"probeId":"%s","ok":true,"latencyMs":%d}' "$id" "$latency"
  else
    printf '{"probeId":"%s","ok":false,"latencyMs":%d,"errorCode":"%s"}' "$id" "$latency" "$err"
  fi
}

SAMPLES=""
SEP=""
while IFS='|' read -r id kind target; do
  [ -z "$id" ] && continue
  SAMPLES+="$SEP$(probe_one "$id" "$kind" "$target")"
  SEP=","
done <<< "$PARSED"

PAYLOAD=$(cat <<JSON
{
  "takenAt": "$(date -u +%FT%TZ)",
  "samples": [$SAMPLES]
}
JSON
)

curl -fsS --max-time 15 -X POST "$VERRIS_API_URL/agent/probes/local" \\
  -H "Content-Type: application/json" \\
  -H "X-Server-Id: $VERRIS_SERVER_ID" \\
  -H "X-Server-Token: $VERRIS_IDENTITY_TOKEN" \\
  -d "$PAYLOAD" >/dev/null
${renderProbesTasksHook()}
PROBES
chmod 0755 "$PROBES_PATH"
echo "[verris] Installed local prober at $PROBES_PATH"

if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  cat > /etc/systemd/system/verris-probes.service <<UNIT
[Unit]
Description=Verris local prober
After=network-online.target

[Service]
Type=oneshot
ExecStart=$PROBES_PATH
StandardOutput=append:$PROBES_LOG
StandardError=append:$PROBES_LOG
UNIT

  cat > /etc/systemd/system/verris-probes.timer <<TIMER
[Unit]
Description=Run Verris local prober every minute

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=5s
Unit=verris-probes.service

[Install]
WantedBy=timers.target
TIMER

  systemctl daemon-reload
  systemctl enable --now verris-probes.timer
  echo "[verris] Enabled verris-probes.timer (systemd)"
elif [ -d /etc/cron.d ]; then
  cat > /etc/cron.d/verris-probes <<CRON
# Verris local prober
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root $PROBES_PATH >> $PROBES_LOG 2>&1
CRON
  echo "[verris] Installed cron job /etc/cron.d/verris-probes"
fi

# -----------------------------------------------------------------------------
# Node task worker (hosting profile from admin panel)
# -----------------------------------------------------------------------------
${renderBootstrapNodeTasksInstallFragment()}

echo "[verris] Bootstrap complete. Server is awaiting admin approval in the panel."
echo "$BODY"
`;
}
