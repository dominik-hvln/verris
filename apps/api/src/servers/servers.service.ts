import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  bladWspolczynnika,
  efektywnyOvercommit,
  etykietaSygnalu,
  opiszSygnal,
} from '../subscriptions/node-capacity';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { BootstrapTokenService } from './bootstrap-token.service';
import { DirectAdminService } from './directadmin.service';
import { NodeDnsService } from './node-dns.service';
import { NodeTasksService } from './node-tasks.service';
import { Prisma, Server, ServerStatus } from '@verris/database';
import { InitServerDto } from './dto/init-server.dto';
import { HandshakeDto } from './dto/handshake.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdateDirectAdminConfigDto } from './dto/directadmin-config.dto';
import { UpdateNameserversDto } from './dto/nameservers.dto';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { renderBootstrapNodeTasksInstallFragment, renderNodeDeploySshKeyBootstrapCall, renderProbesTasksHook } from './node-tasks-agent.install';

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
    private readonly platformSettings: PlatformSettingsService,
    private readonly nodeDns: NodeDnsService,
    private readonly nodeTasks: NodeTasksService,
  ) {}

  /**
   * Resolves the authoritative nameservers handed to accounts on a node:
   * per-node override (Server.ns1/2/3) wins, otherwise the platform default
   * (PlatformSetting `hosting.ns*` → env HOSTING_NS*). `source` tells the admin
   * UI which level supplied them.
   */
  async resolveNameservers(
    server: Pick<Server, 'ns1' | 'ns2' | 'ns3'>,
  ): Promise<{ ns1: string; ns2: string; ns3: string; source: 'node' | 'platform' | 'none' }> {
    const nodeNs = [server.ns1, server.ns2, server.ns3].map((v) => (v ?? '').trim());
    if (nodeNs[0] && nodeNs[1]) {
      return { ns1: nodeNs[0], ns2: nodeNs[1], ns3: nodeNs[2] ?? '', source: 'node' };
    }
    const platform = await this.platformSettings.getHostingNameservers();
    if (platform.ns1 && platform.ns2) {
      return { ...platform, source: 'platform' };
    }
    return { ns1: '', ns2: '', ns3: '', source: 'none' };
  }

  async getNodeNameservers(id: string) {
    const server = await this.prisma.server.findUnique({
      where: { id },
      select: { id: true, ns1: true, ns2: true, ns3: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    const [effective, platformDefault] = await Promise.all([
      this.resolveNameservers(server),
      this.platformSettings.getHostingNameservers(),
    ]);
    return {
      serverId: server.id,
      ns1: server.ns1,
      ns2: server.ns2,
      ns3: server.ns3,
      effective,
      platformDefault,
    };
  }

  async setNodeNameservers(id: string, dto: UpdateNameserversDto, actorUserId: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    const ns1 = normaliseNs(dto.ns1);
    const ns2 = normaliseNs(dto.ns2);
    const ns3 = normaliseNs(dto.ns3);
    if ((ns1 && !ns2) || (!ns1 && ns2)) {
      throw new BadRequestException(
        'Podaj oba ns1 i ns2 (DirectAdmin honoruje NS konta tylko gdy oba są ustawione) lub wyczyść oba, by dziedziczyć z platformy.',
      );
    }

    await this.prisma.server.update({
      where: { id },
      data: { ns1: ns1 || null, ns2: ns2 || null, ns3: ns3 || null },
    });

    await this.audit.record({
      action: 'SERVER_NAMESERVERS_UPDATED',
      actorUserId,
      details: { serverId: id, ns1, ns2, ns3 },
    });

    return this.getNodeNameservers(id);
  }

  // ---------------------------------------------------------------------------
  // Admin: lifecycle
  // ---------------------------------------------------------------------------

  async initServer(
    dto: InitServerDto,
    actorUserId: string,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    // Reserve a placeholder ipAddress unique value until handshake fills it in.
    // Audit F-12: keep the `pending-` prefix in sync with consumers that
    // filter out unresolved nodes (provisioning additionally validates the
    // IP shape, so any non-IP sentinel is safe).
    const reservedIp = `pending-${this.crypto.generateRandomToken(8)}`;

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
    const deployPubKey = (process.env.VERRIS_NODE_DEPLOY_SSH_PUBKEY ?? '').trim();
    const deployPubKeyB64 = deployPubKey
      ? Buffer.from(deployPubKey, 'utf8').toString('base64')
      : null;
    const script = renderBootstrapScript({
      apiUrl,
      bootstrapToken: issued.plaintext,
      serverName: server.name ?? server.id,
      deployPubKeyB64,
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
    ctx?: { ip?: string; userAgent?: string; bootstrapTokenId?: string },
  ) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found for bootstrap token');

    if (server.status === ServerStatus.ACTIVE || server.status === ServerStatus.MAINTENANCE) {
      // Idempotency: accept additional handshakes from already-active servers
      // as a no-op so the bootstrap script never breaks an existing node. We
      // intentionally do *not* return the identity token here — it was
      // delivered exactly once on the first successful handshake. Audit F-13:
      // the bootstrap token is NOT consumed for this no-op, so the operator
      // can re-run the same script later without regenerating it.
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
        // Audit F-03: persist ONLY the SHA-256 hash. The plaintext lives in
        // the handshake response (returned once) and in /etc/verris.conf on
        // the node — never in our DB or backups.
        identityToken: this.crypto.sha256Hex(identityToken),
        lastHandshakeAt: new Date(),
        status: ServerStatus.PENDING_APPROVAL,
      },
    });

    // The handshake mutated the server — only now is the single-use token
    // actually consumed (race-safe updateMany inside markUsed).
    if (ctx?.bootstrapTokenId) {
      await this.tokens.markUsed(ctx.bootstrapTokenId, { ipAddress: ctx?.ip });
    }

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
    // Bootstrap v2 DoD: an ACTIVE node must always have an FQDN so the wildcard
    // TLS cert and client-panel links resolve by hostname (never raw IP).
    const hostname = server.hostname?.trim() ?? '';
    if (!hostname || !hostname.includes('.')) {
      throw new BadRequestException(
        'Węzeł nie ma hostname (FQDN). Ustaw hostname przed akceptacją — wymagany dla wildcard TLS i linków panelu.',
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
      details: { serverId, hostname },
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    // Post-ACTIVE hook: request the wildcard TLS deploy for this node. The
    // certificate is issued centrally on the control plane (DNS-01 via OVH) and
    // pushed to the node's DA :2222; we record the request so the audit panel
    // tracks it and the operator can trigger it from one place.
    await this.requestWildcardTlsDeploy(updated, actorUserId).catch((err) => {
      this.logger.warn(
        `requestWildcardTlsDeploy failed for server=${serverId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    // Post-ACTIVE hook: auto-provision branded nameservers at OVH (glue + zone)
    // and assign them to the node. Best-effort and idempotent — if OVH isn't
    // configured or the node already has NS provisioned it no-ops. The admin can
    // also trigger/reconcile this from the node panel.
    await this.nodeDns.tryAutoProvision(serverId);

    // Post-ACTIVE: profil hostingowy (Governor, CageFS, Exim/Dovecot, FTP) — agent
    // pobiera skrypt z API i uruchamia z --skip-build (bez pełnego rebuild PHP/LS).
    await this.nodeTasks
      .queueHostingProfile(serverId, actorUserId, { skipBuild: true })
      .catch((err) => {
        this.logger.warn(
          `queueHostingProfile failed for server=${serverId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return updated;
  }

  /**
   * Requests the wildcard `*.verris.pl` TLS deploy for a freshly-approved node.
   *
   * The cert is issued centrally on the control plane (DNS-01 via OVH) and
   * pushed to the node's DirectAdmin `:2222`. If `VERRIS_TLS_DEPLOY_WEBHOOK` is
   * configured we POST the deploy request to the control-plane runner;
   * otherwise we record a pending request with the exact command so the
   * operator runs it from one place. Either way the audit log and node audit
   * panel track TLS readiness — no silent gap.
   */
  private async requestWildcardTlsDeploy(
    server: { id: string; hostname: string | null; name: string | null },
    actorUserId: string,
  ): Promise<void> {
    const hostname = server.hostname?.trim() ?? '';
    const webhook = (process.env.VERRIS_TLS_DEPLOY_WEBHOOK ?? '').trim();
    const command = `ops/scripts/verris-node-wildcard-tls.sh --node=${hostname}`;

    if (webhook) {
      try {
        const res = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId: server.id, hostname, command }),
        });
        if (!res.ok) {
          throw new Error(`webhook HTTP ${res.status}`);
        }
        await this.audit.record({
          action: 'SERVER_TLS_DEPLOY_REQUESTED',
          actorUserId,
          details: { serverId: server.id, hostname, via: 'webhook' },
        });
        return;
      } catch (err) {
        this.logger.warn(
          `TLS deploy webhook failed for server=${server.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await this.audit.record({
      action: 'SERVER_TLS_DEPLOY_PENDING',
      actorUserId,
      details: { serverId: server.id, hostname, command, via: 'manual' },
    });
    this.logger.log(
      `[verris] Wildcard TLS deploy pending for ${hostname} — run on control plane: ${command}`,
    );
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

  /**
   * Admin per-node drill-down: every hosting account placed on this node with
   * its owner, plan, effective + scaled limits and most recent telemetry
   * bucket. Powers the "Konta na węźle" table on the node detail page.
   */
  async getNodeAccounts(id: string) {
    const server = await this.prisma.server.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const accounts = await this.prisma.account.findMany({
      where: { serverId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        daUsername: true,
        domain: true,
        status: true,
        cpuLimit: true,
        ramLimitMb: true,
        diskLimitMb: true,
        scaledCpu: true,
        scaledRamMb: true,
        scaledDiskMb: true,
        subscriptionId: true,
        subscription: {
          select: { id: true, status: true, plan: { select: { name: true } } },
        },
        user: { select: { id: true, email: true } },
      },
    });

    const latest = await Promise.all(
      accounts.map((a) =>
        this.prisma.usageMetric.findFirst({
          where: { subscriptionId: a.subscriptionId },
          orderBy: { bucketStart: 'desc' },
          select: {
            bucketStart: true,
            cpuUsageAvg: true,
            memUsageAvgMb: true,
            diskUsageMb: true,
            ioUsageKbps: true,
          },
        }),
      ),
    );

    return {
      serverId: id,
      count: accounts.length,
      accounts: accounts.map((a, i) => ({
        id: a.id,
        daUsername: a.daUsername,
        domain: a.domain,
        status: a.status,
        cpuLimit: a.cpuLimit,
        ramLimitMb: a.ramLimitMb,
        diskLimitMb: a.diskLimitMb,
        scaledCpu: a.scaledCpu,
        scaledRamMb: a.scaledRamMb,
        scaledDiskMb: a.scaledDiskMb,
        subscriptionId: a.subscriptionId,
        subscriptionStatus: a.subscription?.status ?? null,
        planName: a.subscription?.plan?.name ?? null,
        ownerEmail: a.user?.email ?? null,
        latest: latest[i]
          ? {
              bucketStart: latest[i]!.bucketStart.toISOString(),
              cpuUsageAvg: latest[i]!.cpuUsageAvg,
              memUsageAvgMb: latest[i]!.memUsageAvgMb,
              diskUsageMb: latest[i]!.diskUsageMb,
              ioUsageKbps: latest[i]!.ioUsageKbps,
            }
          : null,
      })),
    };
  }

  /**
   * Admin per-node usage aggregate: capacity + allocation + a node-wide
   * telemetry time series (summed across every account's LVE buckets) so ops
   * can see the real load a node is carrying, not just allocated quotas.
   */
  async getNodeUsage(id: string, window: '24h' | '7d' = '24h') {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    const accounts = await this.prisma.account.findMany({
      where: { serverId: id },
      select: {
        subscriptionId: true,
        status: true,
        scaledCpu: true,
        scaledRamMb: true,
        scaledDiskMb: true,
      },
    });
    const subIds = accounts.map((a) => a.subscriptionId);

    const hours = window === '7d' ? 24 * 7 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = subIds.length
      ? await this.prisma.usageMetric.findMany({
          where: { subscriptionId: { in: subIds }, bucketStart: { gte: since } },
          orderBy: { bucketStart: 'asc' },
          select: {
            bucketStart: true,
            cpuUsageAvg: true,
            memUsageAvgMb: true,
            diskUsageMb: true,
            ioUsageKbps: true,
          },
        })
      : [];

    const buckets = new Map<
      string,
      { cpuUsageAvg: number; memUsageAvgMb: number; diskUsageMb: number; ioUsageKbps: number }
    >();
    for (const row of rows) {
      const key = row.bucketStart.toISOString();
      const acc = buckets.get(key) ?? {
        cpuUsageAvg: 0,
        memUsageAvgMb: 0,
        diskUsageMb: 0,
        ioUsageKbps: 0,
      };
      acc.cpuUsageAvg += row.cpuUsageAvg;
      acc.memUsageAvgMb += row.memUsageAvgMb;
      acc.diskUsageMb += row.diskUsageMb;
      acc.ioUsageKbps += row.ioUsageKbps;
      buckets.set(key, acc);
    }
    const series = [...buckets.entries()]
      .map(([bucketStart, v]) => ({
        bucketStart,
        cpuUsageAvg: Math.round(v.cpuUsageAvg * 10) / 10,
        memUsageAvgMb: Math.round(v.memUsageAvgMb),
        diskUsageMb: Math.round(v.diskUsageMb),
        ioUsageKbps: Math.round(v.ioUsageKbps),
      }))
      .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));

    return {
      window,
      server: {
        id: server.id,
        name: server.name,
        ipAddress: server.ipAddress,
        hostname: server.hostname,
        totalCpuCores: server.totalCpuCores,
        totalMemoryMb: server.totalMemoryMb,
        totalDiskMb: server.totalDiskMb,
        allocatedCpu: server.allocatedCpu,
        allocatedMemory: server.allocatedMemory,
        allocatedDisk: server.allocatedDisk,
      },
      accountCount: accounts.length,
      activeAccountCount: accounts.filter((a) => a.status === 'ACTIVE').length,
      scaledTotals: {
        cpu: accounts.reduce((s, a) => s + a.scaledCpu, 0),
        ramMb: accounts.reduce((s, a) => s + a.scaledRamMb, 0),
        diskMb: accounts.reduce((s, a) => s + a.scaledDiskMb, 0),
      },
      series,
      latest: series.at(-1) ?? null,
    };
  }

  /**
   * Audit F-18: status changes through the generic PATCH are restricted to
   * operational transitions. INIT → PENDING_APPROVAL happens only via the
   * bootstrap handshake; PENDING_APPROVAL → ACTIVE only via `approveServer`
   * (which enforces the FQDN requirement and runs the post-ACTIVE hooks).
   */
  private static readonly PATCH_STATUS_TRANSITIONS: Record<ServerStatus, ServerStatus[]> = {
    [ServerStatus.INIT]: [ServerStatus.DEPROVISIONING],
    [ServerStatus.PENDING_APPROVAL]: [ServerStatus.DEPROVISIONING],
    [ServerStatus.ACTIVE]: [
      ServerStatus.MAINTENANCE,
      ServerStatus.OFFLINE,
      ServerStatus.DEPROVISIONING,
    ],
    [ServerStatus.MAINTENANCE]: [
      ServerStatus.ACTIVE,
      ServerStatus.OFFLINE,
      ServerStatus.DEPROVISIONING,
    ],
    [ServerStatus.OFFLINE]: [
      ServerStatus.ACTIVE,
      ServerStatus.MAINTENANCE,
      ServerStatus.DEPROVISIONING,
    ],
    [ServerStatus.DEPROVISIONING]: [ServerStatus.OFFLINE],
  };

  async updateServer(id: string, dto: UpdateServerDto, actorUserId: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    if (dto.status && dto.status !== server.status) {
      const allowed = ServersService.PATCH_STATUS_TRANSITIONS[server.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Niedozwolona zmiana statusu ${server.status} → ${dto.status}. ` +
            `Aktywacja węzła przebiega przez handshake + „Zatwierdź węzeł" (wymóg FQDN i hooki TLS/NS/profil), ` +
            `a maintenance przez dedykowany przełącznik.`,
        );
      }
    }

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

  /**
   * OPS-1 — polityka pojemności węzła. Niezależna od MAINTENANCE:
   *  - acceptsNewAccounts=false „cordonuje" węzeł (istniejące konta działają,
   *    scheduler nie kładzie nowych) — bez wstrzymywania sprzedaży globalnie.
   *  - maxAccounts: twardy limit liczby kont (null = bez limitu).
   *  - reservedHeadroomPercent: 0–90, rezerwa pojemności FIZYCZNEJ pod burst.
   *  - overcommitCpu/Ram/Disk: Z-12, ile razy węzeł może sprzedać ponad swoją
   *    pojemność fizyczną. 1 = brak nadsubskrypcji (zachowanie sprzed Z-12).
   */
  async setCapacityPolicy(
    id: string,
    actorUserId: string,
    input: {
      acceptsNewAccounts?: boolean;
      maxAccounts?: number | null;
      reservedHeadroomPercent?: number;
      overcommitCpu?: number;
      overcommitRam?: number;
      overcommitDisk?: number;
    },
  ) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    const data: Record<string, unknown> = {};
    if (typeof input.acceptsNewAccounts === 'boolean') {
      data.acceptsNewAccounts = input.acceptsNewAccounts;
    }
    if (input.maxAccounts !== undefined) {
      if (input.maxAccounts === null) {
        data.maxAccounts = null;
      } else {
        if (!Number.isInteger(input.maxAccounts) || input.maxAccounts < 0) {
          throw new BadRequestException('maxAccounts musi być nieujemną liczbą całkowitą lub pusty.');
        }
        data.maxAccounts = input.maxAccounts;
      }
    }
    if (input.reservedHeadroomPercent !== undefined) {
      const v = input.reservedHeadroomPercent;
      if (!Number.isInteger(v) || v < 0 || v > 90) {
        throw new BadRequestException('reservedHeadroomPercent musi być z zakresu 0–90.');
      }
      data.reservedHeadroomPercent = v;
    }

    // Z-12 — współczynniki nadsubskrypcji. Walidacja siedzi w node-capacity.ts,
    // czyli w tym samym module, którego używa NodeSelector — żeby panel nie
    // mógł zapisać wartości, na którą placement i tak nie pozwoli.
    for (const nazwa of ['overcommitCpu', 'overcommitRam', 'overcommitDisk'] as const) {
      const v = input[nazwa];
      if (v === undefined) continue;
      const blad = bladWspolczynnika(nazwa, v);
      if (blad) throw new BadRequestException(blad);
      data[nazwa] = v;
    }

    const updated = await this.prisma.server.update({ where: { id }, data });

    await this.audit.record({
      action: 'ADMIN_NODE_CAPACITY_POLICY_UPDATED',
      actorUserId,
      details: { serverId: id, changes: data } as Prisma.InputJsonValue,
    });

    return this.toPublicServer(updated);
  }

  /**
   * OPS-4 (drain, część 1) — „wyłącz węzeł z rotacji". BEZPIECZNE: ustawia
   * cordon (acceptsNewAccounts=false), NIE rusza danych klientów. Faktyczne
   * przeniesienie kont to osobny, ręcznie potwierdzany krok (patrz plan migracji).
   */
  async drainNode(serverId: string, actorUserId: string, reason?: string | null) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: { acceptsNewAccounts: false },
    });
    await this.audit.record({
      action: 'ADMIN_NODE_DRAIN_STARTED',
      actorUserId,
      details: { serverId, reason: reason?.trim() || null } as Prisma.InputJsonValue,
    });
    return this.toPublicServer(updated);
  }

  /**
   * OPS-4 (drain, część 2) — READ-ONLY plan migracji kont z węzła. Dla każdego
   * konta sugeruje najmniej obciążony węzeł docelowy, który zmieści jego plan
   * (limity bazowe), uwzględniając tymczasowe alokacje w trakcie planowania.
   * Nic nie przenosi — to materiał decyzyjny dla operatora.
   */
  async getNodeMigrationPlan(serverId: string) {
    const source = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!source) throw new NotFoundException('Server not found');

    const accounts = await this.prisma.account.findMany({
      where: { serverId },
      select: {
        id: true,
        daUsername: true,
        domain: true,
        status: true,
        subscription: {
          select: {
            plan: { select: { name: true, cpuLimit: true, ramLimitMb: true, diskLimitMb: true } },
          },
        },
      },
      orderBy: { domain: 'asc' },
    });

    // Kandydaci docelowi: ACTIVE, przyjmujący konta, z pojemnością, ≠ źródło.
    const candidates = await this.prisma.server.findMany({
      where: {
        status: ServerStatus.ACTIVE,
        acceptsNewAccounts: true,
        id: { not: serverId },
      },
    });
    const targets = candidates
      .filter((c) => (c.totalCpuCores ?? 0) > 0 && (c.totalMemoryMb ?? 0) > 0 && (c.totalDiskMb ?? 0) > 0)
      .map((c) => ({
        id: c.id,
        name: c.name ?? c.hostname ?? c.id,
        totalCpu: (c.totalCpuCores ?? 0) * 100,
        totalRam: c.totalMemoryMb ?? 0,
        totalDisk: c.totalDiskMb ?? 0,
        // alokacje narastające w trakcie planowania (start = bieżące)
        usedCpu: c.allocatedCpu,
        usedRam: c.allocatedMemory,
        usedDisk: c.allocatedDisk,
        headroom: Math.min(Math.max(c.reservedHeadroomPercent ?? 0, 0), 90) / 100,
        // Z-12: planer drenażu miał DOKŁADNIE ten sam błąd co NodeSelector —
        // porównywał sumę limitów planów z pojemnością fizyczną. Skutek byłby
        // gorszy niż w sprzedaży: plan ewakuacji węzła mówiłby „nie ma dokąd
        // przenieść kont" w chwili, gdy miejsce jest. Overcommit liczymy
        // zachowawczo (bez telemetrii), bo drenaż to operacja awaryjna i lepiej,
        // żeby wskazał mniej miejsca, niż żeby przepełnił węzeł docelowy.
        oc: efektywnyOvercommit(
          {
            overcommitCpu: c.overcommitCpu,
            overcommitRam: c.overcommitRam,
            overcommitDisk: c.overcommitDisk,
            reservedHeadroomPercent: c.reservedHeadroomPercent,
          },
          false,
        ),
      }));

    const plan = accounts.map((acc) => {
      const p = acc.subscription?.plan;
      const need = {
        cpu: p?.cpuLimit ?? 0,
        ram: p?.ramLimitMb ?? 0,
        disk: p?.diskLimitMb ?? 0,
      };
      // wybierz najmniej obciążony target, który zmieści (z rezerwą)
      let best: (typeof targets)[number] | null = null;
      let bestLoad = Number.POSITIVE_INFINITY;
      for (const t of targets) {
        const pojCpu = t.totalCpu * t.oc.cpu;
        const pojRam = t.totalRam * t.oc.ram;
        const pojDisk = t.totalDisk * t.oc.disk;
        const freeCpu = pojCpu - t.usedCpu - t.totalCpu * t.headroom;
        const freeRam = pojRam - t.usedRam - t.totalRam * t.headroom;
        const freeDisk = pojDisk - t.usedDisk - t.totalDisk * t.headroom;
        if (freeCpu < need.cpu || freeRam < need.ram || freeDisk < need.disk) continue;
        const load = (t.usedCpu / pojCpu + t.usedRam / pojRam + t.usedDisk / pojDisk) / 3;
        if (load < bestLoad) {
          bestLoad = load;
          best = t;
        }
      }
      if (best) {
        best.usedCpu += need.cpu;
        best.usedRam += need.ram;
        best.usedDisk += need.disk;
      }
      return {
        accountId: acc.id,
        daUsername: acc.daUsername,
        domain: acc.domain,
        status: acc.status,
        planName: p?.name ?? '—',
        footprint: need,
        suggestedTarget: best ? { id: best.id, name: best.name } : null,
      };
    });

    const unplaceable = plan.filter((r) => r.suggestedTarget === null).length;
    return {
      sourceId: source.id,
      sourceName: source.name ?? source.hostname ?? source.id,
      acceptsNewAccounts: source.acceptsNewAccounts,
      accounts: plan,
      totalAccounts: plan.length,
      unplaceable,
      targetNodeCount: targets.length,
    };
  }

  async setDirectAdminConfig(id: string, dto: UpdateDirectAdminConfigDto, actorUserId: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    const data: Record<string, unknown> = {
      daHost: dto.daHost,
      daPort: dto.daPort,
      daUsername: dto.daUsername,
      daUseTls: dto.daUseTls ?? server.daUseTls,
      daAllowInvalidCert: dto.daAllowInvalidCert ?? server.daAllowInvalidCert,
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
        daAllowInvalidCert: (data.daAllowInvalidCert as boolean) ?? false,
      },
    });

    return this.toPublicServer(updated);
  }

  testDirectAdmin(id: string) {
    return this.directAdmin.testConnection(id);
  }

  /** Strips encrypted secrets / internal identity values from API responses. */
  /**
   * OPS-01 — do każdego węzła dokładamy OPIS SYGNAŁU ŻYCIA, wyliczany przy
   * odczycie z `lastHeartbeatAt`.
   *
   * Nie jest to kolumna i nie ma być: `status` pozostaje deklaracją intencji
   * administratora, a żywotność jest faktem obserwowanym. Trzymanie faktu w
   * kolumnie wymagałoby pilnowania, żeby dwa źródła prawdy się nie rozjechały —
   * a rozjeżdżają się zawsze i po cichu (patrz NODE-03: pojemność węzła
   * ustawiana raz w handshake i nigdy nieodświeżana, mimo komentarza w
   * schemacie obiecującego coś innego).
   *
   * Panel dostaje więc `status` ORAZ `sygnal` i pokazuje oba naraz:
   * „ACTIVE · nie odpowiada od 14 min". Do 2026-08-28 pokazywał samo „ACTIVE".
   */
  private toPublicServer<
    T extends {
      daPasswordEnc?: string | null;
      identityToken?: string | null;
      lastHeartbeatAt?: Date | null;
    },
  >(server: T) {
    const { daPasswordEnc: _enc, identityToken: _id, ...rest } = server;
    const sygnal = opiszSygnal(server.lastHeartbeatAt);
    return {
      ...rest,
      daPasswordSet: Boolean(_enc),
      sygnal: { ...sygnal, etykieta: etykietaSygnalu(sygnal) },
    };
  }
}

/** Lowercases + trims a nameserver hostname; '' when blank/invalid. */
function normaliseNs(raw?: string): string {
  const v = (raw ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!v) return '';
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(v)) {
    throw new BadRequestException(`Nieprawidłowy hostname serwera nazw: "${raw}".`);
  }
  return v;
}

export function renderBootstrapScript(opts: {
  apiUrl: string;
  bootstrapToken: string;
  serverName: string;
  deployPubKeyB64?: string | null;
}) {
  // Single-use bootstrap script. The plaintext token is embedded once and
  // becomes invalid as soon as the node successfully completes its handshake.
  return `#!/usr/bin/env bash
# Verris bootstrap — initial handshake for "${opts.serverName}"
# This script:
#   1. Gathers capacity info (IP/CPU/RAM/disk) and registers the node with the
#      Verris control plane via /servers/handshake.
#   2. Persists the returned X-Server-Id and X-Server-Token in /etc/verris.conf
#      (mode 0600, root-only) so the metrics agent can authenticate later.
#   3. Installs the node LVE agent (/usr/local/bin/verris-lve.sh) and a 1-min
#      systemd timer that enforces plan/account CloudLinux limits via lvectl
#      and pushes live /proc/lve/list telemetry to /telemetry/lve.
#   4. Installs control-plane deploy SSH public key in /root/.ssh/authorized_keys
#      (wildcard TLS + ops — wymaga VERRIS_NODE_DEPLOY_SSH_PUBKEY na panelu).
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
  "agentVersion": "agent-3"
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

${renderNodeDeploySshKeyBootstrapCall(opts.deployPubKeyB64 ?? null)}

# -----------------------------------------------------------------------------
# Telemetria + limity CloudLinux LVE
# -----------------------------------------------------------------------------
# Obsługiwane przez agenta verris-lve.sh (instalowany niżej w sekcji agenta
# zadań): reconcile limitów planów/kont przez lvectl oraz telemetria na żywo
# z /proc/lve/list → POST /telemetry/lve. Stary verris-agent.sh został wycofany —
# opierał się na lveinfo/cloudlinux-statistic, które na DA 1.697 + CloudLinux 10
# zwracają puste próbki (snapshot daemon nie nadąża), więc telemetria była zerowa.
# Sprzątanie po starym agencie (gdyby istniał z wcześniejszego bootstrapu):
systemctl disable --now verris-agent.timer 2>/dev/null || true
rm -f /etc/systemd/system/verris-agent.service /etc/systemd/system/verris-agent.timer \
      /etc/cron.d/verris-agent /usr/local/bin/verris-agent.sh 2>/dev/null || true
systemctl daemon-reload 2>/dev/null || true

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
TimeoutStartSec=7200
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
