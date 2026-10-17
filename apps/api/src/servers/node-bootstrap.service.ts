import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { NodeDnsService } from './node-dns.service.js';
import { renderBootstrapScript } from './servers.service.js';


export interface NodeBootstrapEventView {
  phase: string;
  status: string;
  message: string | null;
  createdAt: string;
}
export interface NodeBootstrapStatus {
  serverId: string;
  phase: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  events: NodeBootstrapEventView[];
}

export const KNOWN_PHASES = new Set([
  'PENDING', 'PREFLIGHT', 'DA', 'AGENT', 'HARDENING', 'CLOUDLINUX', 'QUOTA', 'STACK', 'REGISTER', 'CANARY', 'TLS', 'DONE', 'FAILED',
]);
const KNOWN_STATUSES = new Set(['STARTED', 'OK', 'FAILED', 'REBOOT']);

@Injectable()
export class NodeBootstrapService {
  private readonly logger = new Logger(NodeBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly nodeDns: NodeDnsService,
  ) {}

  private apiBaseUrl(): string {
    return (
      this.config.get<string>('publicApiUrl') ??
      this.config.get<string>('PUBLIC_API_URL') ??
      this.config.get<string>('API_BASE_URL') ??
      'https://api.verris.pl'
    );
  }

  /** Odszyfrowane klucze licencyjne węzła (wstrzykiwane do skryptu bootstrapu). */
  async licenseKeysFor(serverId: string): Promise<{
    daLicenseKey: string | null;
    clActivationKey: string | null;
    lsSerial: string | null;
  }> {
    const s = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { daLicenseKeyEnc: true, clActivationKeyEnc: true, lsSerialEnc: true },
    });
    const dec = (v: string | null | undefined) => {
      if (!v) return null;
      try {
        return this.crypto.decrypt(v);
      } catch {
        return null;
      }
    };
    return {
      daLicenseKey: dec(s?.daLicenseKeyEnc),
      clActivationKey: dec(s?.clActivationKeyEnc),
      lsSerial: dec(s?.lsSerialEnc),
    };
  }

  /** Zapis (szyfrowanie) kluczy licencyjnych z wizarda. */
  async setLicenseKeys(
    serverId: string,
    keys: { daLicenseKey?: string | null; clActivationKey?: string | null; lsSerial?: string | null },
  ): Promise<{ ok: true }> {
    const data: Prisma.ServerUpdateInput = {};
    if (keys.daLicenseKey !== undefined)
      data.daLicenseKeyEnc = keys.daLicenseKey ? this.crypto.encrypt(keys.daLicenseKey.trim()) : null;
    if (keys.clActivationKey !== undefined)
      data.clActivationKeyEnc = keys.clActivationKey ? this.crypto.encrypt(keys.clActivationKey.trim()) : null;
    if (keys.lsSerial !== undefined)
      data.lsSerialEnc = keys.lsSerial ? this.crypto.encrypt(keys.lsSerial.trim()) : null;
    await this.prisma.server.update({
      where: { id: serverId },
      data,
    });
    return { ok: true };
  }

  /**
   * Skrypt fazy AGENT — ISTNIEJĄCY, sprawdzony instalator handshake+agent LVE
   * (renderBootstrapScript). Reużywamy go w całości, bez duplikacji.
   */
  async agentScript(serverId: string, bootstrapToken: string): Promise<string> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Węzeł nie istnieje.');
    const deployPubKey = (process.env.VERRIS_NODE_DEPLOY_SSH_PUBKEY ?? '').trim();
    return renderBootstrapScript({
      apiUrl: this.apiBaseUrl(),
      bootstrapToken,
      serverName: server.name ?? server.id,
      deployPubKeyB64: deployPubKey ? Buffer.from(deployPubKey, 'utf8').toString('base64') : null,
    });
  }

  private get events() {
    return this.prisma.nodeBootstrapEvent;
  }

  /**
   * Waliduje token bootstrapu dla raportowania postępu. Inaczej niż handshake
   * NIE konsumuje tokenu (postęp jest raportowany wielokrotnie, także po
   * restartach) — sprawdza tylko hash + brak revoke + brak wygaśnięcia.
   */
  async serverIdForBootstrapToken(plaintext: string): Promise<string> {
    if (!plaintext || !plaintext.startsWith('eko_btk_')) {
      throw new UnauthorizedException('Nieprawidłowy token bootstrapu.');
    }
    const tokenHash = this.crypto.sha256Hex(plaintext);
    const found = await this.prisma.bootstrapToken.findUnique({
      where: { tokenHash },
      include: { server: { select: { id: true } } },
    });
    if (!found) throw new UnauthorizedException('Nieznany token bootstrapu.');
    if (found.revokedAt) throw new UnauthorizedException('Token bootstrapu cofnięty.');
    if (found.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Token bootstrapu wygasł.');
    return found.server.id;
  }

  /** Zapis raportu fazy: event historii + aktualizacja stanu na Server. */
  async recordReport(input: {
    serverId: string;
    phase: string;
    status: string;
    message?: string | null;
  }): Promise<{ ok: true }> {
    const phase = KNOWN_PHASES.has(input.phase) ? input.phase : 'PENDING';
    const status = KNOWN_STATUSES.has(input.status) ? input.status : 'STARTED';
    const message = (input.message ?? '').toString().slice(0, 1000) || null;

    await this.events.create({
      data: { serverId: input.serverId, phase, status, message },
    });

    const now = new Date();
    const data: Prisma.ServerUpdateInput = { bootstrapPhase: phase, bootstrapUpdatedAt: now };
    if (status === 'FAILED') data.bootstrapError = message;
    if (status === 'OK' || status === 'STARTED') data.bootstrapError = null;
    // Ustaw startedAt tylko raz (przy pierwszym raporcie).
    const srv = await this.prisma.server.findUnique({
      where: { id: input.serverId },
      select: { id: true },
    });
    if (!srv) throw new NotFoundException('Węzeł nie istnieje.');

    await this.prisma.server.update({
      where: { id: input.serverId },
      data: {
        ...data,
        bootstrapStartedAt: (await this.ensureStartedAt(input.serverId)) ?? now,
      },
    });

    this.logger.log(`Bootstrap ${input.serverId}: ${phase}/${status}${message ? ` — ${message}` : ''}`);

    // Konsolidacja: gdy węzeł dojdzie do CANARY (stack + agent gotowe), odpalamy po stronie control-plane
    // NS glue i rekord A nazwy hosta w OVH (nie blokuje raportu). Faza TLS czeka na ten rekord — przy jej
    // starcie (także ponowionej po błędzie) ponawiamy, gdy wcześniejsza próba się nie udała i już nie trwa.
    if (status === 'STARTED' && (phase === 'CANARY' || phase === 'TLS')) {
      const juzZrobione =
        phase === 'TLS' &&
        (this.nsWToku.has(input.serverId) ||
          Boolean((await this.prisma.server.findUnique({ where: { id: input.serverId }, select: { nsProvisionedAt: true } }))?.nsProvisionedAt));
      if (!juzZrobione) void this.provisionNsBestEffort(input.serverId, phase);
    }
    return { ok: true };
  }

  /** Węzły z trwającym zakładaniem NS (raport TLS przychodzi sekundę po CANARY — bez drugiego, równoległego przebiegu). */
  private readonly nsWToku = new Set<string>();

  /** Zwraca obietnicę dla testów; w recordReport wołane bez czekania. */
  async provisionNsBestEffort(serverId: string, phase: 'CANARY' | 'TLS'): Promise<void> {
    // 17.10: dotąd brak OVH, wyjątek i kroki z błędem kończyły się ciszą albo zdarzeniem „OK” — faza TLS czekała
    // potem 15 min na rekord A, którego nikt nie założył. Teraz wynik jest w historii bootstrapu.
    const zapisz = (ok: boolean, message: string) =>
      this.events.create({ data: { serverId, phase, status: ok ? 'OK' : 'FAILED', message: message.slice(0, 1000) } });
    if (!this.nodeDns.isConfigured()) {
      await zapisz(false, 'OVH nie jest skonfigurowane — rekord A nazwy hosta i NS trzeba założyć ręcznie');
      return;
    }
    if (this.nsWToku.has(serverId)) return;
    this.nsWToku.add(serverId);
    try {
      const res = await this.nodeDns.provisionNodeNameservers(serverId, { ipv6: null });
      const bledy = res.steps.filter((s) => s.status === 'error').map((s) => `${s.step}${s.detail ? `: ${s.detail}` : ''}`);
      await zapisz(
        res.ok,
        res.ok
          ? `OVH: rekord A nazwy hosta i NS ${res.ns1}, ${res.ns2} (control-plane)`
          : `OVH: błędy przy zakładaniu DNS — ${bledy.join('; ')}`,
      );
    } catch (err) {
      this.logger.warn(`OVH NS glue (bootstrap) nie powiódł się dla ${serverId}: ${(err as Error).message}`);
      await zapisz(false, `OVH: ${(err as Error).message}`).catch(() => undefined);
    } finally {
      this.nsWToku.delete(serverId);
    }
  }

  private async ensureStartedAt(serverId: string): Promise<Date | null> {
    const s = await this.prisma.server.findUnique({ where: { id: serverId }, select: { bootstrapStartedAt: true } });
    return s?.bootstrapStartedAt ?? null;
  }

  async getStatus(serverId: string): Promise<NodeBootstrapStatus> {
    const s = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        bootstrapPhase: true,
        bootstrapError: true,
        bootstrapStartedAt: true,
        bootstrapUpdatedAt: true,
      },
    });
    if (!s) throw new NotFoundException('Węzeł nie istnieje.');

    const events = await this.events.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      serverId,
      phase: s.bootstrapPhase ?? null,
      error: s.bootstrapError ?? null,
      startedAt: s.bootstrapStartedAt ? s.bootstrapStartedAt.toISOString() : null,
      updatedAt: s.bootstrapUpdatedAt ? s.bootstrapUpdatedAt.toISOString() : null,
      events: events.map((e) => ({
        phase: e.phase,
        status: e.status,
        message: e.message ?? null,
        createdAt: (e.createdAt as Date).toISOString(),
      })),
    };
  }
}
