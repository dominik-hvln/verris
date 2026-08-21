import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

type ResellerStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

interface ProfileRow {
  id: string;
  userId: string;
  status: ResellerStatus;
  brandName: string | null;
  markupPct: number;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Delegaty Prisma — klient regenerowany w buildzie prod. */
interface ProfileDelegate {
  findUnique(a: { where: { userId?: string; code?: string } }): Promise<ProfileRow | null>;
  findMany(a: Record<string, unknown>): Promise<ProfileRow[]>;
  create(a: { data: Record<string, unknown> }): Promise<ProfileRow>;
  update(a: { where: { userId: string }; data: Record<string, unknown> }): Promise<ProfileRow>;
  count(a: Record<string, unknown>): Promise<number>;
}

export interface ResellerOverview {
  status: ResellerStatus;
  brandName: string | null;
  markupPct: number;
  code: string;
  inviteLink: string;
  clientsCount: number;
  monthlyRetail: number;
  monthlyWholesale: number;
}
export interface ResellerClientView {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  services: { id: string; plan: string | null; status: string; wholesale: number; retail: number; currency: string }[];
}

@Injectable()
export class ResellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get repo(): ProfileDelegate {
    return (this.prisma as unknown as { resellerProfile: ProfileDelegate }).resellerProfile;
  }
  private clientUrl(): string {
    return (process.env.CLIENT_PANEL_URL ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  async getProfile(userId: string): Promise<ProfileRow | null> {
    return this.repo.findUnique({ where: { userId } });
  }

  private async clientsWithServices(resellerId: string, markupPct: number): Promise<ResellerClientView[]> {
    const clients = await (this.prisma as unknown as {
      user: {
        findMany(a: Record<string, unknown>): Promise<Array<{
          id: string; email: string; firstName: string | null; lastName: string | null; createdAt: Date;
          subscriptions: Array<{ id: string; status: string; priceAmount: unknown; currency: string; plan: { name: string | null } | null }>;
        }>>;
      };
    }).user.findMany({
      where: { resellerOwnerId: resellerId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, email: true, firstName: true, lastName: true, createdAt: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          select: { id: true, status: true, priceAmount: true, currency: true, plan: { select: { name: true } } },
        },
      },
    });
    const mk = 1 + markupPct / 100;
    return clients.map((c) => ({
      id: c.id,
      email: c.email,
      name: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
      createdAt: c.createdAt.toISOString(),
      services: c.subscriptions.map((s) => {
        const wholesale = Number(s.priceAmount);
        return { id: s.id, plan: s.plan?.name ?? null, status: s.status, wholesale, retail: Math.round(wholesale * mk * 100) / 100, currency: s.currency };
      }),
    }));
  }

  async getOverview(userId: string): Promise<ResellerOverview> {
    const p = await this.getProfile(userId);
    if (!p) throw new ForbiddenException('Konto nie jest resellerem.');
    const clients = await this.clientsWithServices(userId, p.markupPct);
    let wholesale = 0;
    let retail = 0;
    for (const c of clients) for (const s of c.services) { wholesale += s.wholesale; retail += s.retail; }
    return {
      status: p.status,
      brandName: p.brandName,
      markupPct: p.markupPct,
      code: p.code,
      inviteLink: `${this.clientUrl()}/register?reseller=${encodeURIComponent(p.code)}`,
      clientsCount: clients.length,
      monthlyRetail: Math.round(retail * 100) / 100,
      monthlyWholesale: Math.round(wholesale * 100) / 100,
    };
  }

  async listClients(userId: string): Promise<ResellerClientView[]> {
    const p = await this.getProfile(userId);
    if (!p) throw new ForbiddenException('Konto nie jest resellerem.');
    return this.clientsWithServices(userId, p.markupPct);
  }

  // ---- Admin ----

  private view(p: ProfileRow) {
    return {
      userId: p.userId,
      status: p.status,
      brandName: p.brandName,
      markupPct: p.markupPct,
      code: p.code,
      createdAt: p.createdAt.toISOString(),
    };
  }

  async adminList() {
    const rows = await this.repo.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    return rows.map((r) => this.view(r));
  }

  async adminEnable(targetUserId: string, input: { markupPct: number; brandName?: string }, actorUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true } });
    if (!target) throw new NotFoundException('Użytkownik nie istnieje.');
    if (target.role !== 'USER') throw new BadRequestException('Resellerem może być wyłącznie konto klienta.');
    const existing = await this.getProfile(targetUserId);
    const markupPct = Math.min(Math.max(Math.round(input.markupPct) || 0, 0), 300);
    let row: ProfileRow;
    if (existing) {
      row = await this.repo.update({ where: { userId: targetUserId }, data: { markupPct, brandName: input.brandName ?? null, status: 'ACTIVE' } });
    } else {
      row = await this.repo.create({
        data: { userId: targetUserId, markupPct, brandName: input.brandName ?? null, status: 'ACTIVE', code: `rsl_${randomBytes(5).toString('hex')}` },
      });
    }
    await this.audit.record({ action: 'RESELLER_ENABLED', userId: actorUserId, details: { targetUserId, markupPct } });
    return this.view(row);
  }

  async adminUpdate(targetUserId: string, input: { markupPct?: number; brandName?: string; status?: ResellerStatus }, actorUserId: string) {
    const existing = await this.getProfile(targetUserId);
    if (!existing) throw new NotFoundException('Ten użytkownik nie jest resellerem.');
    const data: Record<string, unknown> = {};
    if (input.markupPct != null) data.markupPct = Math.min(Math.max(Math.round(input.markupPct), 0), 300);
    if (input.brandName !== undefined) data.brandName = input.brandName || null;
    if (input.status) data.status = input.status;
    const row = await this.repo.update({ where: { userId: targetUserId }, data });
    await this.audit.record({ action: 'RESELLER_UPDATED', userId: actorUserId, details: { targetUserId, ...input } });
    return this.view(row);
  }
}
