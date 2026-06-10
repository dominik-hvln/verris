import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { generateKeyPairSync, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';

/**
 * ETAP 8 — WireGuard VPN for the internal panels (admin/staff).
 *
 * Key material policy:
 *  - client PRIVATE key: generated here (X25519 via node:crypto), embedded in
 *    the one-time client config and NEVER persisted;
 *  - client PUBLIC key + PSK (KMS-encrypted): persisted — required to render
 *    the server-side peer list;
 *  - server keypair: lives only on the host (`vpn-wireguard-setup.sh`); the
 *    API knows just the PUBLIC key from env.
 *
 * The host pulls the desired peer list via GET /agent/vpn/peers-config
 * (X-Vpn-Sync-Token) and applies it with `wg syncconf` — same pull model as
 * the node task agent, so the API never needs root on the host.
 */
@Injectable()
export class VpnService {
  private readonly logger = new Logger(VpnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Config (env)
  // ---------------------------------------------------------------------------

  private serverPublicKey(): string | null {
    return (process.env.VPN_WG_SERVER_PUBLIC_KEY ?? '').trim() || null;
  }

  private endpoint(): string | null {
    return (process.env.VPN_WG_ENDPOINT ?? '').trim() || null;
  }

  /** VPN subnet, default 10.88.0.0/24 (server = .1). */
  private subnetBase(): { base: string; cidr: string } {
    const cidr = (process.env.VPN_WG_SUBNET ?? '10.88.0.0/24').trim();
    const base = cidr.split('/')[0]!.split('.').slice(0, 3).join('.');
    return { base, cidr };
  }

  /** What the CLIENT routes through the tunnel. Must include the panel IP. */
  private clientAllowedIps(): string {
    const { cidr } = this.subnetBase();
    return (process.env.VPN_WG_CLIENT_ALLOWED_IPS ?? '').trim() || cidr;
  }

  private clientDns(): string | null {
    return (process.env.VPN_WG_DNS ?? '').trim() || null;
  }

  isConfigured(): boolean {
    return Boolean(this.serverPublicKey() && this.endpoint());
  }

  // ---------------------------------------------------------------------------
  // Admin API
  // ---------------------------------------------------------------------------

  async overview() {
    const peers = await this.prisma.vpnPeer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return {
      configured: this.isConfigured(),
      endpoint: this.endpoint(),
      serverPublicKey: this.serverPublicKey(),
      subnet: this.subnetBase().cidr,
      clientAllowedIps: this.clientAllowedIps(),
      peers: peers.map((p) => this.toPublicPeer(p)),
    };
  }

  /**
   * Creates a peer and returns the ONE-TIME client config (with the private
   * key). The config cannot be retrieved again — revoke + recreate instead.
   */
  async createPeer(
    input: { name: string; ownerEmail?: string | null },
    actorUserId: string,
  ): Promise<{ peer: ReturnType<VpnService['toPublicPeer']>; clientConfig: string }> {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'VPN nie jest skonfigurowany — ustaw VPN_WG_SERVER_PUBLIC_KEY i VPN_WG_ENDPOINT ' +
          '(zob. ops/scripts/vpn-wireguard-setup.sh i DEPLOY.md → VPN).',
      );
    }
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Podaj nazwę (np. "Anna — laptop").');

    const { privateKeyB64, publicKeyB64 } = generateWireguardKeypair();
    const presharedKey = randomBytes(32).toString('base64');
    const assignedIp = await this.allocateIp();

    const peer = await this.prisma.vpnPeer.create({
      data: {
        name,
        ownerEmail: input.ownerEmail?.trim() || null,
        publicKey: publicKeyB64,
        presharedKeyEnc: this.crypto.encrypt(presharedKey),
        assignedIp,
        createdById: actorUserId,
      },
    });

    await this.audit.record({
      action: 'VPN_PEER_CREATED',
      actorUserId,
      details: { peerId: peer.id, name, assignedIp, ownerEmail: peer.ownerEmail },
    });

    const dns = this.clientDns();
    const clientConfig = [
      `# Verris VPN — ${name} (wygenerowano ${new Date().toISOString()})`,
      `# Konfiguracja jednorazowa: klucz prywatny NIE jest przechowywany na serwerze.`,
      `[Interface]`,
      `PrivateKey = ${privateKeyB64}`,
      `Address = ${assignedIp}/32`,
      ...(dns ? [`DNS = ${dns}`] : []),
      ``,
      `[Peer]`,
      `PublicKey = ${this.serverPublicKey()}`,
      `PresharedKey = ${presharedKey}`,
      `Endpoint = ${this.endpoint()}`,
      `AllowedIPs = ${this.clientAllowedIps()}`,
      `PersistentKeepalive = 25`,
      ``,
    ].join('\n');

    return { peer: this.toPublicPeer(peer), clientConfig };
  }

  async revokePeer(id: string, actorUserId: string) {
    const peer = await this.prisma.vpnPeer.findUnique({ where: { id } });
    if (!peer) throw new NotFoundException('Peer not found');
    if (!peer.enabled) return this.toPublicPeer(peer);

    const updated = await this.prisma.vpnPeer.update({
      where: { id },
      data: { enabled: false, revokedAt: new Date(), revokedById: actorUserId },
    });
    await this.audit.record({
      action: 'VPN_PEER_REVOKED',
      actorUserId,
      details: { peerId: id, name: peer.name, assignedIp: peer.assignedIp },
    });
    return this.toPublicPeer(updated);
  }

  // ---------------------------------------------------------------------------
  // Host sync (pull)
  // ---------------------------------------------------------------------------

  /**
   * Renders the `[Peer]` sections for `wg syncconf` on the host. Revoked
   * peers are simply absent — syncconf removes them atomically.
   */
  async renderServerPeersConfig(): Promise<string> {
    const peers = await this.prisma.vpnPeer.findMany({
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
    });
    const blocks = peers.map((p) => {
      const psk = p.presharedKeyEnc ? this.crypto.decrypt(p.presharedKeyEnc) : null;
      return [
        `# ${p.name}${p.ownerEmail ? ` <${p.ownerEmail}>` : ''} (${p.id})`,
        `[Peer]`,
        `PublicKey = ${p.publicKey}`,
        ...(psk ? [`PresharedKey = ${psk}`] : []),
        `AllowedIPs = ${p.assignedIp}/32`,
      ].join('\n');
    });
    return [
      `# Verris VPN — peers (managed by control plane, do not edit)`,
      `# generated=${new Date().toISOString()} count=${peers.length}`,
      '',
      ...blocks,
      '',
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Allocates the next free IP in the subnet (server = .1, clients .2–.254). */
  private async allocateIp(): Promise<string> {
    const { base } = this.subnetBase();
    const peers = await this.prisma.vpnPeer.findMany({ select: { assignedIp: true } });
    const taken = new Set(peers.map((p) => p.assignedIp));
    for (let host = 2; host <= 254; host++) {
      const candidate = `${base}.${host}`;
      if (!taken.has(candidate)) return candidate;
    }
    throw new ConflictException('Brak wolnych adresów w subnecie VPN.');
  }

  private toPublicPeer(peer: {
    id: string;
    name: string;
    ownerEmail: string | null;
    publicKey: string;
    assignedIp: string;
    enabled: boolean;
    revokedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: peer.id,
      name: peer.name,
      ownerEmail: peer.ownerEmail,
      publicKey: peer.publicKey,
      assignedIp: peer.assignedIp,
      enabled: peer.enabled,
      revokedAt: peer.revokedAt?.toISOString() ?? null,
      createdAt: peer.createdAt.toISOString(),
    };
  }
}

/**
 * WireGuard keys are raw X25519 keys, base64. Node's DER exports wrap the raw
 * key — the raw 32 bytes are the suffix of the DER structure.
 */
export function generateWireguardKeypair(): { privateKeyB64: string; publicKeyB64: string } {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
  const pubDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const privRaw = privDer.subarray(privDer.length - 32);
  const pubRaw = pubDer.subarray(pubDer.length - 32);
  return {
    privateKeyB64: Buffer.from(privRaw).toString('base64'),
    publicKeyB64: Buffer.from(pubRaw).toString('base64'),
  };
}
