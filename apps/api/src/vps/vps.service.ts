import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VpsStatus, WalletTxType } from '@verris/database';
import { createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { WalletLedgerService } from '../billing/wallet-ledger.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { vpsReadyTemplate } from '../mail/templates/vps-notifications.js';
import { HetznerClient } from './hetzner.client.js';
import type { OrderVpsDto } from './dto/vps.dto.js';
import { PLATFORM_SETTING_KEYS } from '../platform-settings/platform-settings.keys.js';
import { ETYKIETA_VPS, odswiezRozmiary, politykaSnapshotow, usunSnapshotyVps } from './vps-snapshoty.js';

const WSTRZYMANY =
  'VPS jest wstrzymany z powodu braku środków. Doładuj portfel — włączymy go automatycznie przy najbliższym odnowieniu (codziennie o 4:00).';

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
    if (!v) throw new NotFoundException('Nie znaleziono serwera VPS.');
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

    // 2) Debit wallet (fail-closed). Bez środków rekord znika — wcześniej zostawał na liście klienta
    //    jako „zakładany” na zawsze (odnowienia go pomijają, nikt go nie sprzątał).
    try {
      await this.wallet.debit({
        userId,
        type: WalletTxType.CHARGE_USAGE,
        amount: price,
        description: `VPS ${plan.name} (pierwszy miesiąc)`,
        idempotencyKey: `vps-${instance.id}-initial`,
      });
    } catch (err) {
      await this.prisma.vpsInstance.delete({ where: { id: instance.id } });
      throw err;
    }

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
        details: {
          instanceId: instance.id,
          plan: plan.slug,
          hetznerServerId: String(created.server.id),
          // Dowód oświadczenia konsumenckiego (art. 15 ust. 3 / 21 ust. 2 upk):
          // żądanie rozpoczęcia świadczenia przed upływem terminu odstąpienia.
          immediatePerformanceConsent: dto.immediatePerformanceConsent,
          consentStatement:
            'Żądam rozpoczęcia świadczenia usługi przed upływem 14-dniowego terminu odstąpienia i przyjmuję do wiadomości obowiązek zapłaty za świadczenia spełnione do chwili odstąpienia (Regulamin §4 ust. 4, §21).',
        },
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
    // Okres nieopłacony = VPS wstrzymany za brak płatności. Wcześniej klient mógł go po prostu
    // włączyć i korzystać przez całą karencję bez płacenia.
    if (action === 'on' && v.currentPeriodEnd && v.currentPeriodEnd.getTime() <= Date.now()) {
      throw new ConflictException(WSTRZYMANY);
    }
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
    // Q-08 — snapshoty przeżywają serwer u dostawcy i dalej kosztują.
    await usunSnapshotyVps(this.prisma, this.hetzner, id);
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

  // --- Q-08 snapshoty i reinstalacja, Q-07 konsola ---

  /** VPS klienta gotowy do operacji: istnieje u dostawcy i nie jest wstrzymany za brak płatności. */
  private async requireActionable(userId: string, id: string) {
    const v = await this.requireOwned(userId, id);
    if (!v.hetznerServerId) throw new ConflictException('VPS nie jest jeszcze gotowy.');
    if (v.currentPeriodEnd && v.currentPeriodEnd.getTime() <= Date.now()) throw new ConflictException(WSTRZYMANY);
    return { ...v, hetznerServerId: v.hetznerServerId };
  }

  async listSnapshots(userId: string, id: string) {
    const v = await this.requireOwned(userId, id);
    const polityka = await politykaSnapshotow(this.prisma);
    const aktywne = await this.prisma.vpsSnapshot.count({ where: { vpsInstanceId: id, deletedAt: null } });
    const stan = aktywne && v.hetznerServerId ? await odswiezRozmiary(this.prisma, this.hetzner, id) : new Map();
    const rows = await this.prisma.vpsSnapshot.findMany({
      where: { vpsInstanceId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return {
      enabled: polityka.cenaZaGb != null,
      pricePerGbMonthly: polityka.cenaZaGb,
      limit: polityka.limit,
      snapshots: rows.map((r) => ({
        id: r.id,
        description: r.description,
        createdAt: r.createdAt.toISOString(),
        sizeGb: r.sizeGb?.toString() ?? null,
        // Brak obrazu u dostawcy (np. usunięty poza panelem) = niedostępny, nie „gotowy”.
        status: (stan.get(r.hetznerImageId)?.status ?? 'unavailable') as 'available' | 'creating' | 'unavailable',
      })),
    };
  }

  async createSnapshot(userId: string, id: string, description?: string) {
    const v = await this.requireActionable(userId, id);
    const polityka = await politykaSnapshotow(this.prisma);
    if (!polityka.cenaZaGb) throw new BadRequestException('Snapshoty są niedostępne.');
    // ponytail: limit sprawdzany przed utworzeniem bez blokady — dwa równoległe żądania mogą go przekroczyć o 1
    // (trasa ma limit częstotliwości); blokada wiersza VPS-a, jeśli to wyjdzie w praktyce.
    const aktywne = await this.prisma.vpsSnapshot.count({ where: { vpsInstanceId: id, deletedAt: null } });
    if (aktywne >= polityka.limit) {
      throw new ConflictException(`Osiągnięto limit snapshotów dla tego serwera (${polityka.limit}). Usuń starszy, aby utworzyć nowy.`);
    }
    const opis = description?.trim() || `Snapshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const { image } = await this.hetzner.createSnapshot(v.hetznerServerId, {
      description: opis,
      labels: { [ETYKIETA_VPS]: id },
    });
    const row = await this.prisma.vpsSnapshot.create({
      data: {
        vpsInstanceId: id,
        hetznerImageId: String(image.id),
        description: opis,
        sizeGb: image.image_size != null ? new Prisma.Decimal(image.image_size) : null,
      },
    });
    await this.audit.record({
      action: 'VPS_SNAPSHOT_CREATED',
      userId,
      actorUserId: userId,
      details: { instanceId: id, snapshotId: row.id, hetznerImageId: row.hetznerImageId },
    });
    return {
      id: row.id,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      sizeGb: row.sizeGb?.toString() ?? null,
      status: image.status,
    };
  }

  private async requireSnapshot(id: string, snapshotId: string) {
    const snap = await this.prisma.vpsSnapshot.findFirst({ where: { id: snapshotId, vpsInstanceId: id, deletedAt: null } });
    if (!snap) throw new NotFoundException('Snapshot nie istnieje.');
    return snap;
  }

  async deleteSnapshot(userId: string, id: string, snapshotId: string) {
    await this.requireOwned(userId, id);
    const snap = await this.requireSnapshot(id, snapshotId);
    try {
      await this.hetzner.deleteImage(snap.hetznerImageId);
    } catch (err) {
      // Obrazu już nie ma u dostawcy — usunięcie osiągnęło cel. Każdy inny błąd idzie do klienta.
      if (!(err instanceof NotFoundException)) throw err;
    }
    await this.prisma.vpsSnapshot.update({ where: { id: snap.id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      action: 'VPS_SNAPSHOT_DELETED',
      userId,
      actorUserId: userId,
      details: { instanceId: id, snapshotId: snap.id, hetznerImageId: snap.hetznerImageId },
    });
    return { ok: true as const };
  }

  /** Przywrócenie serwera ze snapshotu tego samego VPS-a — nadpisuje dysk. Zwraca akcję do śledzenia. */
  async restoreSnapshot(userId: string, id: string, snapshotId: string) {
    const v = await this.requireActionable(userId, id);
    const snap = await this.requireSnapshot(id, snapshotId);
    const res = await this.hetzner.rebuild(v.hetznerServerId, snap.hetznerImageId);
    await this.audit.record({
      action: 'VPS_SNAPSHOT_RESTORED',
      userId,
      actorUserId: userId,
      details: { instanceId: id, snapshotId: snap.id, hetznerImageId: snap.hetznerImageId, actionId: res.actionId },
    });
    return { actionId: String(res.actionId) };
  }

  /** Systemy dostępne do reinstalacji — tylko dla architektury tego serwera. */
  async listOsImages(userId: string, id: string) {
    const v = await this.requireActionable(userId, id);
    return this.systemImages(v.hetznerServerId);
  }

  private async systemImages(hetznerServerId: string) {
    const server = await this.hetzner.getServer(hetznerServerId);
    const arch = server?.server_type?.architecture;
    if (!arch) throw new BadGatewayException('Nie udało się pobrać listy systemów. Spróbuj ponownie za chwilę.');
    const obrazy = await this.hetzner.listSystemImages(arch);
    return obrazy
      .filter((o) => o.name)
      .map((o) => ({ name: o.name as string, description: o.description }))
      .sort((a, b) => a.description.localeCompare(b.description, 'pl'));
  }

  /** Reinstalacja systemu z listy obrazów systemowych — kasuje dane. Nowe hasło root pokazujemy raz. */
  async rebuild(userId: string, id: string, image: string) {
    const v = await this.requireActionable(userId, id);
    // Tylko obraz z listy systemów — inaczej klient mógłby podać ID cudzego snapshotu z tego samego projektu.
    if (!(await this.systemImages(v.hetznerServerId)).some((o) => o.name === image)) {
      throw new BadRequestException('Wybrany system nie jest dostępny.');
    }
    const res = await this.hetzner.rebuild(v.hetznerServerId, image);
    if (res.rootPassword) {
      await this.prisma.vpsInstance.update({ where: { id }, data: { rootPasswordEnc: this.crypto.encrypt(res.rootPassword) } });
    }
    await this.audit.record({
      action: 'VPS_REBUILT',
      userId,
      actorUserId: userId,
      details: { instanceId: id, image, actionId: res.actionId },
    });
    return { actionId: String(res.actionId), rootPassword: res.rootPassword };
  }

  /** Stan akcji asynchronicznej — tylko akcji dotyczącej serwera tego klienta. */
  async actionStatus(userId: string, id: string, actionId: string) {
    const v = await this.requireOwned(userId, id);
    if (!/^\d{1,20}$/.test(actionId) || !v.hetznerServerId) throw new NotFoundException('Operacja nie istnieje.');
    const a = await this.hetzner.getAction(actionId);
    if (!a.resources.some((r) => r.type === 'server' && String(r.id) === v.hetznerServerId)) {
      throw new NotFoundException('Operacja nie istnieje.');
    }
    return { status: a.status, progress: a.progress };
  }

  /**
   * Q-07 — sesja konsoli (VNC przez websocket). Żądana po naszej stronie, token dostawcy nie opuszcza API;
   * hasło jest jednorazowe dla tej sesji i nie trafia do dziennika.
   */
  async console(userId: string, id: string) {
    const v = await this.requireActionable(userId, id);
    const res = await this.hetzner.requestConsole(v.hetznerServerId);
    await this.audit.record({ action: 'VPS_CONSOLE_OPENED', userId, actorUserId: userId, details: { instanceId: id } });
    return { wssUrl: res.wssUrl, password: res.password };
  }

  // --- admin: ustawienia snapshotów ---

  async adminSnapshotSettings() {
    const p = await politykaSnapshotow(this.prisma);
    return { pricePerGbMonthly: p.cenaZaGb, limit: p.limit };
  }

  async updateSnapshotSettings(input: { pricePerGbMonthly?: string | null; limit: number }, actorUserId: string) {
    const raw = (input.pricePerGbMonthly ?? '').trim().replace(',', '.');
    const n = Number(raw);
    if (raw && !(Number.isFinite(n) && n > 0)) {
      throw new BadRequestException('Cena musi być kwotą większą od zera albo pusta (snapshoty wyłączone).');
    }
    const cena = raw ? String(Number(n.toFixed(4))) : '';
    const K = PLATFORM_SETTING_KEYS;
    await this.prisma.$transaction(
      ([[K.VPS_SNAPSHOT_PRICE_PER_GB, cena], [K.VPS_SNAPSHOT_LIMIT, String(input.limit)]] as const).map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          create: { key, value, updatedByUserId: actorUserId },
          update: { value, updatedByUserId: actorUserId },
        }),
      ),
    );
    await this.audit.record({
      action: 'VPS_SNAPSHOT_SETTINGS_UPDATED',
      userId: actorUserId,
      actorUserId,
      details: { pricePerGbMonthly: cena || null, limit: input.limit },
    });
    return this.adminSnapshotSettings();
  }

  // --- admin: plan catalogue ---

  async adminListPlans() {
    return this.prisma.vpsPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async serverTypes() {
    return this.hetzner.listServerTypes();
  }

  async createPlan(dto: import('./dto/vps.dto.js').CreateVpsPlanDto, actorUserId: string) {
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

  async updatePlan(id: string, dto: Partial<import('./dto/vps.dto.js').CreateVpsPlanDto>, actorUserId: string) {
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
    if (!v || v.status === VpsStatus.DELETED) throw new NotFoundException('Nie znaleziono serwera VPS.');
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
