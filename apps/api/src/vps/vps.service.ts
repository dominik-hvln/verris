import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VpsStatus, WalletTxType } from '@verris/database';
import { createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { MailerService } from '../mail/mailer.service';
import { vpsReadyTemplate } from '../mail/templates/vps-notifications';
import { HetznerClient } from './hetzner.client';
import type { OrderVpsDto } from './dto/vps.dto';

function sanitizeName(raw: string): string {
  const base = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const short = randomBytes(3).toString('hex');
  return `vps-${(base || 'srv').slice(0, 24)}-${short}`;
}

@Injectable()
export class VpsService {
  private readonly logger = new Logger(VpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly wallet: WalletLedgerService,
    private readonly hetzner: HetznerClient,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  isAvailable(): boolean {
    return this.hetzner.isConfigured();
  }

  // --- SSH keys ---

  async listSshKeys(userId: string) {
    const rows = await this.prisma.sshKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((k) => ({
      id: k.id,
      name: k.name,
      fingerprint: k.fingerprint,
      createdAt: k.createdAt.toISOString(),
    }));
  }

  async addSshKey(userId: string, input: { name: string; publicKey: string }) {
    const publicKey = input.publicKey.trim().replace(/\s+$/g, '');
    if (!/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-\S+)\s+[A-Za-z0-9+/=]+/.test(publicKey)) {
      throw new BadRequestException('Niepoprawny format klucza publicznego SSH.');
    }
    const blob = publicKey.split(/\s+/)[1] ?? publicKey;
    const fingerprint = createHash('sha256').update(blob).digest('hex').slice(0, 32);
    const existing = await this.prisma.sshKey.findUnique({
      where: { userId_fingerprint: { userId, fingerprint } },
    });
    if (existing) throw new ConflictException('Ten klucz SSH jest już dodany.');
    const key = await this.prisma.sshKey.create({
      data: { userId, name: input.name.trim() || 'klucz', publicKey, fingerprint },
    });
    await this.audit.record({ action: 'SSH_KEY_ADDED', userId, actorUserId: userId, details: { keyId: key.id } });
    return { id: key.id, name: key.name, fingerprint: key.fingerprint, createdAt: key.createdAt.toISOString() };
  }

  async deleteSshKey(userId: string, id: string) {
    const key = await this.prisma.sshKey.findFirst({ where: { id, userId } });
    if (!key) throw new NotFoundException('Klucz SSH nie istnieje.');
    if (key.hetznerKeyId) {
      await this.hetzner.deleteSshKey(key.hetznerKeyId).catch(() => undefined);
    }
    await this.prisma.sshKey.delete({ where: { id } });
    await this.audit.record({ action: 'SSH_KEY_DELETED', userId, actorUserId: userId, details: { keyId: id } });
    return { ok: true as const };
  }

  /** Ensure the given keys exist in the Hetzner project; return their numeric ids. */
  private async ensureHetznerKeys(userId: string, sshKeyIds: string[]): Promise<number[]> {
    const keys = await this.prisma.sshKey.findMany({ where: { id: { in: sshKeyIds }, userId } });
    const ids: number[] = [];
    for (const k of keys) {
      if (k.hetznerKeyId) {
        ids.push(Number(k.hetznerKeyId));
        continue;
      }
      const created = await this.hetzner.createSshKey({
        name: `verris-${userId.slice(0, 8)}-${k.id.slice(0, 8)}`,
        publicKey: k.publicKey,
      });
      await this.prisma.sshKey.update({ where: { id: k.id }, data: { hetznerKeyId: String(created.id) } });
      ids.push(created.id);
    }
    return ids;
  }

  async listPlans() {
    const rows = await this.prisma.vpsPlan.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
    });
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      vcpu: p.vcpu,
      ramGb: p.ramGb,
      diskGb: p.diskGb,
      trafficTb: p.trafficTb,
      location: p.location,
      priceMonthly: p.priceMonthly.toString(),
      currency: p.currency,
    }));
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.vpsInstance.findMany({
      where: { userId, status: { not: VpsStatus.DELETED } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
    return rows.map((v) => this.toDto(v));
  }

  async getForUser(userId: string, id: string) {
    const v = await this.prisma.vpsInstance.findFirst({
      where: { id, userId },
      include: { plan: true },
    });
    if (!v) throw new NotFoundException('VPS not found');
    return this.toDto(v);
  }

  /** Order + provision a VPS. Wallet is debited first; Hetzner failure refunds. */
  async order(userId: string, dto: OrderVpsDto) {
    if (!this.isAvailable()) {
      throw new BadRequestException('Sprzedaż VPS jest chwilowo niedostępna.');
    }
    const plan = await this.prisma.vpsPlan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive || !plan.isPublic) {
      throw new NotFoundException('Plan VPS nie istnieje lub jest niedostępny.');
    }
    const price = new Prisma.Decimal(plan.priceMonthly);

    // 1) Create the instance row first (PROVISIONING) as the billing anchor.
    const instance = await this.prisma.vpsInstance.create({
      data: {
        userId,
        planId: plan.id,
        name: dto.name?.trim() || plan.name,
        status: VpsStatus.PROVISIONING,
        priceMonthly: price,
        currency: plan.currency,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // 2) Debit wallet (fail-closed).
    await this.wallet.debit({
      userId,
      type: WalletTxType.CHARGE_USAGE,
      amount: price,
      description: `VPS ${plan.name} (pierwszy miesiąc)`,
      idempotencyKey: `vps-${instance.id}-initial`,
    });

    // 3) Provision on Hetzner; refund + ERROR on failure.
    try {
      const sshKeyIds =
        dto.sshKeyIds && dto.sshKeyIds.length
          ? await this.ensureHetznerKeys(userId, dto.sshKeyIds)
          : [];
      const created = await this.hetzner.createServer({
        name: sanitizeName(instance.name),
        serverType: plan.hetznerServerType,
        image: plan.hetznerImage,
        location: plan.location,
        sshKeyIds,
      });
      const updated = await this.prisma.vpsInstance.update({
        where: { id: instance.id },
        data: {
          status: VpsStatus.RUNNING,
          hetznerServerId: String(created.server.id),
          location: created.server.datacenter?.location?.name ?? plan.location,
          ipv4: created.server.public_net?.ipv4?.ip ?? null,
          ipv6: created.server.public_net?.ipv6?.ip ?? null,
          rootPasswordEnc: created.rootPassword ? this.crypto.encrypt(created.rootPassword) : null,
        },
        include: { plan: true },
      });
      await this.audit.record({
        action: 'VPS_PROVISIONED',
        userId,
        actorUserId: userId,
        details: { instanceId: instance.id, plan: plan.slug, hetznerServerId: String(created.server.id) },
      });
      void this.sendReady(userId, updated.name, updated.ipv4).catch(() => undefined);
      return { ...this.toDto(updated), rootPassword: created.rootPassword };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.wallet.credit({
        userId,
        type: WalletTxType.REFUND,
        amount: price,
        description: `Zwrot: provisioning VPS nie powiódł się (${plan.name})`,
        idempotencyKey: `vps-${instance.id}-initial-refund`,
      });
      await this.prisma.vpsInstance.update({
        where: { id: instance.id },
        data: { status: VpsStatus.ERROR, lastError: msg.slice(0, 2000) },
      });
      this.logger.error(`VPS provisioning failed (instance=${instance.id}): ${msg}`);
      throw err;
    }
  }

  async power(userId: string, id: string, action: 'on' | 'off' | 'reboot') {
    const v = await this.requireOwned(userId, id);
    if (!v.hetznerServerId) throw new ConflictException('VPS nie jest jeszcze gotowy.');
    if (action === 'on') await this.hetzner.powerOn(v.hetznerServerId);
    else if (action === 'off') await this.hetzner.powerOff(v.hetznerServerId);
    else await this.hetzner.reboot(v.hetznerServerId);

    const status =
      action === 'on' ? VpsStatus.RUNNING : action === 'off' ? VpsStatus.STOPPED : VpsStatus.REBOOTING;
    await this.prisma.vpsInstance.update({ where: { id }, data: { status } });
    await this.audit.record({
      action: 'VPS_POWER_ACTION',
      userId,
      actorUserId: userId,
      details: { instanceId: id, action },
    });
    return { ok: true as const, status };
  }

  async remove(userId: string, id: string) {
    const v = await this.requireOwned(userId, id);
    await this.prisma.vpsInstance.update({ where: { id }, data: { status: VpsStatus.DELETING } });
    if (v.hetznerServerId) {
      try {
        await this.hetzner.deleteServer(v.hetznerServerId);
      } catch (err) {
        this.logger.error(`VPS delete on Hetzner failed (instance=${id}): ${(err as Error).message}`);
        // Continue to mark deleted locally; orphan cleanup is an ops concern.
      }
    }
    await this.prisma.vpsInstance.update({
      where: { id },
      data: { status: VpsStatus.DELETED, deletedAt: new Date() },
    });
    await this.audit.record({
      action: 'VPS_DELETED',
      userId,
      actorUserId: userId,
      details: { instanceId: id, hetznerServerId: v.hetznerServerId },
    });
    return { ok: true as const };
  }

  // --- admin: plan catalogue ---

  async adminListPlans() {
    return this.prisma.vpsPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async serverTypes() {
    return this.hetzner.listServerTypes();
  }

  async createPlan(dto: import('./dto/vps.dto').CreateVpsPlanDto, actorUserId: string) {
    const existing = await this.prisma.vpsPlan.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Plan VPS o slug "${dto.slug}" już istnieje.`);
    const plan = await this.prisma.vpsPlan.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        description: dto.description ?? null,
        hetznerServerType: dto.hetznerServerType,
        hetznerImage: dto.hetznerImage ?? 'ubuntu-24.04',
        location: dto.location ?? 'nbg1',
        vcpu: dto.vcpu,
        ramGb: dto.ramGb,
        diskGb: dto.diskGb,
        trafficTb: dto.trafficTb ?? 20,
        priceMonthly: new Prisma.Decimal(dto.priceMonthly),
        currency: (dto.currency ?? 'PLN').toUpperCase(),
        isPublic: dto.isPublic ?? true,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.record({ action: 'VPS_PLAN_CREATED', actorUserId, details: { planId: plan.id, slug: plan.slug } });
    return plan;
  }

  async updatePlan(id: string, dto: Partial<import('./dto/vps.dto').CreateVpsPlanDto>, actorUserId: string) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.priceMonthly != null) data.priceMonthly = new Prisma.Decimal(dto.priceMonthly);
    if (dto.currency) data.currency = dto.currency.toUpperCase();
    const plan = await this.prisma.vpsPlan.update({ where: { id }, data: data as never });
    await this.audit.record({ action: 'VPS_PLAN_UPDATED', actorUserId, details: { planId: id } });
    return plan;
  }

  async deletePlan(id: string, actorUserId: string) {
    // Soft-disable to avoid breaking instances referencing the plan.
    const plan = await this.prisma.vpsPlan.update({
      where: { id },
      data: { isActive: false, isPublic: false },
    });
    await this.audit.record({ action: 'VPS_PLAN_DISABLED', actorUserId, details: { planId: id } });
    return plan;
  }

  private async sendReady(userId: string, name: string, ipv4: string | null) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!u) return;
    await this.mailer.send({
      ...vpsReadyTemplate({ to: u.email, firstName: u.firstName, name, ipv4, panelUrl: this.panelUrl() }),
      userId,
      category: 'TRANSACTIONAL',
    });
  }

  private async requireOwned(userId: string, id: string) {
    const v = await this.prisma.vpsInstance.findFirst({ where: { id, userId } });
    if (!v || v.status === VpsStatus.DELETED) throw new NotFoundException('VPS not found');
    return v;
  }

  private toDto(v: {
    id: string;
    name: string;
    status: VpsStatus;
    ipv4: string | null;
    ipv6: string | null;
    location: string | null;
    priceMonthly: Prisma.Decimal;
    currency: string;
    currentPeriodEnd: Date | null;
    createdAt: Date;
    plan: { name: string; slug: string; vcpu: number; ramGb: number; diskGb: number };
  }) {
    return {
      id: v.id,
      name: v.name,
      status: v.status,
      ipv4: v.ipv4,
      ipv6: v.ipv6,
      location: v.location,
      priceMonthly: v.priceMonthly.toString(),
      currency: v.currency,
      currentPeriodEnd: v.currentPeriodEnd?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
      plan: { name: v.plan.name, slug: v.plan.slug, vcpu: v.plan.vcpu, ramGb: v.plan.ramGb, diskGb: v.plan.diskGb },
    };
  }
}
