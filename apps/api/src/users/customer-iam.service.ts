import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerPermission,
  CustomerSubaccountInviteStatus,
  Prisma,
  Role,
} from '@verris/database';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { iamSubaccountInviteTemplate } from '../mail/templates/iam-invite-notification';
import {
  AcceptSubaccountInviteDto,
  InviteSubaccountDto,
  UpdateSubaccountDto,
} from './customer-iam.dto';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class CustomerIamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async overview(ownerUserId: string, actorUserId: string) {
    await this.assertOwner(ownerUserId, actorUserId);
    const [members, invites] = await Promise.all([
      this.prisma.user.findMany({
        where: { customerOwnerId: ownerUserId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          customerPermissions: true,
          subaccountLabel: true,
          subaccountDisabledAt: true,
          subaccountServiceIds: true,
          createdAt: true,
        },
      }),
      this.prisma.customerSubaccountInvite.findMany({
        where: { ownerUserId, status: CustomerSubaccountInviteStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          permissions: true,
          serviceIds: true,
          label: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ]);
    const [czlonkostwa, uslugi] = await Promise.all([
      this.prisma.customerMembership.findMany({
        where: { ownerUserId, disabledAt: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, permissions: true, serviceIds: true, label: true, createdAt: true,
          member: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
      this.uslugiWlasciciela(ownerUserId),
    ]);
    return {
      permissions: Object.values(CustomerPermission),
      members,
      invites,
      // PB-20 — osoby z własnym kontem Verris (deweloper, agencja), przełączające się na to konto.
      memberships: czlonkostwa.map((c) => ({
        id: c.id,
        email: c.member.email,
        name: [c.member.firstName, c.member.lastName].filter(Boolean).join(' ') || null,
        permissions: c.permissions,
        serviceIds: c.serviceIds,
        label: c.label,
        createdAt: c.createdAt.toISOString(),
      })),
      services: uslugi,
    };
  }

  /** Usługi do wyboru zakresu (żywe subskrypcje właściciela). */
  private async uslugiWlasciciela(ownerUserId: string) {
    const subs = await this.prisma.subscription.findMany({
      where: { userId: ownerUserId, status: { notIn: ['CANCELED', 'EXPIRED'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, plan: { select: { name: true } }, account: { select: { domain: true } } },
    });
    return subs.map((x) => ({ id: x.id, name: x.account?.domain ?? x.plan?.name ?? 'Usługa' }));
  }

  /** Zakres musi wskazywać usługi właściciela — cudze id odrzucamy, zamiast po cichu przyciąć. */
  private async zakres(ownerUserId: string, serviceIds: string[] | undefined): Promise<string[]> {
    const ids = [...new Set(serviceIds ?? [])];
    if (!ids.length) return [];
    const n = await this.prisma.subscription.count({ where: { id: { in: ids }, userId: ownerUserId } });
    if (n !== ids.length) throw new BadRequestException('Wybrane usługi nie należą do tego konta.');
    return ids;
  }

  async listAudit(ownerUserId: string, actorUserId: string, limit = 50) {
    await this.assertOwner(ownerUserId, actorUserId);
    const take = Math.min(Math.max(limit, 1), 100);
    // O-03 — nie tylko zarządzanie subkontami, ale też to, co subkonta zrobiły na koncie właściciela.
    const czlonkowie = [
      ...(await this.prisma.user.findMany({ where: { customerOwnerId: ownerUserId }, select: { id: true } })),
      // PB-20 — działania osób z własnym kontem też trafiają do dziennika właściciela.
      ...(await this.prisma.customerMembership.findMany({ where: { ownerUserId }, select: { memberUserId: true } })).map((m) => ({ id: m.memberUserId })),
    ];
    const rows = await this.prisma.auditLog.findMany({
      where: {
        userId: ownerUserId,
        OR: [{ action: { startsWith: 'CUSTOMER_IAM_' } }, ...(czlonkowie.length ? [{ actorUserId: { in: czlonkowie.map((c) => c.id) } }] : [])],
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        details: true,
        createdAt: true,
      },
    });
    const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))] as string[];
    const actors =
      actorIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true, firstName: true, lastName: true },
          });
    const actorById = new Map(actors.map((a) => [a.id, a]));
    return {
      entries: rows.map((row) => ({
        id: row.id,
        action: row.action,
        createdAt: row.createdAt.toISOString(),
        details: row.details,
        actor: row.actorUserId
          ? {
              id: row.actorUserId,
              email: actorById.get(row.actorUserId)?.email ?? null,
              name: formatActorName(actorById.get(row.actorUserId)),
            }
          : null,
      })),
    };
  }

  async invite(ownerUserId: string, actorUserId: string, dto: InviteSubaccountDto) {
    await this.assertOwner(ownerUserId, actorUserId);
    const email = dto.email.trim().toLowerCase();
    const serviceIds = await this.zakres(ownerUserId, dto.serviceIds);
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, customerOwnerId: true, anonymizedAt: true },
    });
    // PB-20 — adres z kontem Verris: zaproszenie przyjmuje się z własnego konta (bez nowego loginu).
    // Tylko główne konto klienta — subkonto albo konto operatora nie może być członkiem.
    if (existing) {
      if (existing.id === ownerUserId) throw new BadRequestException('Nie możesz zaprosić samego siebie.');
      if (existing.role !== Role.USER || existing.customerOwnerId || existing.anonymizedAt) {
        throw new ConflictException('Na ten adres nie można wysłać zaproszenia — użyj innego adresu.');
      }
      const jest = await this.prisma.customerMembership.findUnique({
        where: { ownerUserId_memberUserId: { ownerUserId, memberUserId: existing.id } },
        select: { disabledAt: true },
      });
      if (jest && !jest.disabledAt) throw new ConflictException('Ta osoba ma już dostęp do Twojego konta.');
    }
    const token = randomBytes(32).toString('base64url');
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { email: true },
    });
    const invite = await this.prisma.customerSubaccountInvite.create({
      data: {
        ownerUserId,
        invitedByUserId: actorUserId,
        email,
        tokenHash: hashToken(token),
        permissions: dto.permissions,
        serviceIds,
        label: dto.label?.trim() || null,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    await this.audit.record({
      action: 'CUSTOMER_IAM_INVITE_CREATED',
      userId: ownerUserId,
      actorUserId,
      details: { inviteId: invite.id, email, permissions: dto.permissions, serviceIds, maKonto: Boolean(existing) },
    });
    const panelUrl = (
      this.config.get<string>('CLIENT_PANEL_URL') ??
      this.config.get<string>('clientPanelUrl') ??
      'https://panel.verris.pl'
    ).replace(/\/$/, '');
    const message = iamSubaccountInviteTemplate({
      to: email,
      ownerEmail: owner?.email ?? 'właściciel konta',
      inviteUrl: this.inviteUrl(token),
      expiresDays: INVITE_TTL_DAYS,
      label: dto.label?.trim() || null,
      panelUrl,
      maKonto: Boolean(existing),
      uslugi: serviceIds.length ? (await this.uslugiWlasciciela(ownerUserId)).filter((u) => serviceIds.includes(u.id)).map((u) => u.name) : null,
    });
    await this.mailer.send({
      ...message,
      userId: ownerUserId,
      category: 'TRANSACTIONAL',
      fromRole: 'PANEL',
    });
    return { id: invite.id, email: invite.email, expiresAt: invite.expiresAt.toISOString() };
  }

  async accept(dto: AcceptSubaccountInviteDto) {
    const invite = await this.prisma.customerSubaccountInvite.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { owner: { select: { id: true, email: true } } },
    });
    if (!invite || invite.status !== CustomerSubaccountInviteStatus.PENDING) {
      throw new NotFoundException('Zaproszenie nie istnieje albo zostało już użyte.');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.customerSubaccountInvite.update({
        where: { id: invite.id },
        data: { status: CustomerSubaccountInviteStatus.EXPIRED },
      });
      throw new BadRequestException('Zaproszenie wygasło.');
    }
    const existing = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) {
      throw new ConflictException('Konto z tym adresem już istnieje — zaloguj się i przyjmij zaproszenie ze swojego konta.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash,
          role: Role.USER,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          customerOwnerId: invite.ownerUserId,
          customerPermissions: invite.permissions,
          subaccountServiceIds: invite.serviceIds,
          subaccountLabel: invite.label,
          walletBalance: new Prisma.Decimal(0),
        },
      });
      await tx.customerSubaccountInvite.update({
        where: { id: invite.id },
        data: {
          status: CustomerSubaccountInviteStatus.ACCEPTED,
          acceptedUserId: created.id,
          acceptedAt: new Date(),
        },
      });
      return created;
    });
    await this.audit.record({
      action: 'CUSTOMER_IAM_INVITE_ACCEPTED',
      userId: invite.ownerUserId,
      actorUserId: user.id,
      details: { inviteId: invite.id, subaccountUserId: user.id, email: user.email },
    });
    return { ok: true as const };
  }

  async updateMember(ownerUserId: string, actorUserId: string, memberId: string, dto: UpdateSubaccountDto) {
    await this.assertOwner(ownerUserId, actorUserId);
    const member = await this.assertMember(ownerUserId, memberId);
    const updated = await this.prisma.user.update({
      where: { id: member.id },
      data: {
        customerPermissions: dto.permissions,
        subaccountLabel: dto.label?.trim() || null,
        ...(dto.serviceIds !== undefined ? { subaccountServiceIds: await this.zakres(ownerUserId, dto.serviceIds) } : {}),
      },
      select: { id: true, email: true, customerPermissions: true, subaccountLabel: true, subaccountServiceIds: true },
    });
    await this.audit.record({
      action: 'CUSTOMER_IAM_MEMBER_UPDATED',
      userId: ownerUserId,
      actorUserId,
      details: { memberId, permissions: dto.permissions, serviceIds: dto.serviceIds },
    });
    return updated;
  }

  async disableMember(ownerUserId: string, actorUserId: string, memberId: string) {
    await this.assertOwner(ownerUserId, actorUserId);
    await this.assertMember(ownerUserId, memberId);
    await this.prisma.user.update({
      where: { id: memberId },
      data: { subaccountDisabledAt: new Date() },
    });
    await this.audit.record({
      action: 'CUSTOMER_IAM_MEMBER_DISABLED',
      userId: ownerUserId,
      actorUserId,
      details: { memberId },
    });
    return { ok: true as const };
  }

  async revokeInvite(ownerUserId: string, actorUserId: string, inviteId: string) {
    await this.assertOwner(ownerUserId, actorUserId);
    const invite = await this.prisma.customerSubaccountInvite.findFirst({
      where: { id: inviteId, ownerUserId },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.prisma.customerSubaccountInvite.update({
      where: { id: invite.id },
      data: { status: CustomerSubaccountInviteStatus.REVOKED, revokedAt: new Date() },
    });
    await this.audit.record({
      action: 'CUSTOMER_IAM_INVITE_REVOKED',
      userId: ownerUserId,
      actorUserId,
      details: { inviteId },
    });
    return { ok: true as const };
  }

  // ---- PB-20 — dostęp z własnego konta ----

  /** Co zobaczy strona zaproszenia (bez logowania): czy adres ma już konto i kto zaprasza. */
  async inviteInfo(token: string) {
    const invite = await this.prisma.customerSubaccountInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { email: true, status: true, expiresAt: true, serviceIds: true, owner: { select: { email: true } } },
    });
    if (!invite || invite.status !== CustomerSubaccountInviteStatus.PENDING || invite.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Zaproszenie nie istnieje, wygasło albo zostało już użyte.');
    }
    const maKonto = Boolean(await this.prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } }));
    return { email: invite.email, ownerEmail: invite.owner.email, maKonto, wybraneUslugi: invite.serviceIds.length > 0 };
  }

  /** Przyjęcie zaproszenia zalogowanym, własnym kontem — adres konta musi być adresem z zaproszenia. */
  async acceptExisting(principal: { userId: string; principalUserId?: string; actingFor?: string }, token: string) {
    const memberUserId = principal.principalUserId ?? principal.userId;
    if (principal.actingFor || memberUserId !== principal.userId) {
      throw new ForbiddenException('Przełącz się na swoje konto, aby przyjąć zaproszenie.');
    }
    const [invite, me] = await Promise.all([
      this.prisma.customerSubaccountInvite.findUnique({ where: { tokenHash: hashToken(token) } }),
      this.prisma.user.findUnique({ where: { id: memberUserId }, select: { email: true, role: true, customerOwnerId: true } }),
    ]);
    if (!invite || invite.status !== CustomerSubaccountInviteStatus.PENDING || invite.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Zaproszenie nie istnieje, wygasło albo zostało już użyte.');
    }
    if (!me || me.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException('To zaproszenie jest wysłane na inny adres e-mail niż Twoje konto.');
    }
    if (me.role !== Role.USER || me.customerOwnerId || invite.ownerUserId === memberUserId) {
      throw new ForbiddenException('Tego zaproszenia nie można przyjąć z tego konta.');
    }
    const m = await this.prisma.$transaction(async (tx) => {
      const czl = await tx.customerMembership.upsert({
        where: { ownerUserId_memberUserId: { ownerUserId: invite.ownerUserId, memberUserId } },
        create: { ownerUserId: invite.ownerUserId, memberUserId, permissions: invite.permissions, serviceIds: invite.serviceIds, label: invite.label },
        update: { permissions: invite.permissions, serviceIds: invite.serviceIds, label: invite.label, disabledAt: null },
      });
      await tx.customerSubaccountInvite.update({
        where: { id: invite.id },
        data: { status: CustomerSubaccountInviteStatus.ACCEPTED, acceptedUserId: memberUserId, acceptedAt: new Date() },
      });
      return czl;
    });
    await this.audit.record({
      action: 'CUSTOMER_IAM_INVITE_ACCEPTED',
      userId: invite.ownerUserId,
      actorUserId: memberUserId,
      details: { inviteId: invite.id, membershipId: m.id, email: me.email, wlasneKonto: true },
    });
    return { ok: true as const, ownerUserId: invite.ownerUserId };
  }

  async updateMembership(ownerUserId: string, actorUserId: string, id: string, dto: UpdateSubaccountDto) {
    await this.assertOwner(ownerUserId, actorUserId);
    const m = await this.prisma.customerMembership.findFirst({ where: { id, ownerUserId, disabledAt: null }, select: { id: true } });
    if (!m) throw new NotFoundException('Nie ma takiego dostępu.');
    await this.prisma.customerMembership.update({
      where: { id },
      data: {
        permissions: dto.permissions,
        label: dto.label?.trim() || null,
        ...(dto.serviceIds !== undefined ? { serviceIds: await this.zakres(ownerUserId, dto.serviceIds) } : {}),
      },
    });
    await this.audit.record({ action: 'CUSTOMER_IAM_MEMBERSHIP_UPDATED', userId: ownerUserId, actorUserId, details: { membershipId: id, permissions: dto.permissions, serviceIds: dto.serviceIds } });
    return { ok: true as const };
  }

  async disableMembership(ownerUserId: string, actorUserId: string, id: string) {
    await this.assertOwner(ownerUserId, actorUserId);
    const m = await this.prisma.customerMembership.findFirst({ where: { id, ownerUserId, disabledAt: null }, select: { id: true } });
    if (!m) throw new NotFoundException('Nie ma takiego dostępu.');
    await this.prisma.customerMembership.update({ where: { id }, data: { disabledAt: new Date() } });
    await this.audit.record({ action: 'CUSTOMER_IAM_MEMBERSHIP_DISABLED', userId: ownerUserId, actorUserId, details: { membershipId: id } });
    return { ok: true as const };
  }

  /** Konta, na które mogę się przełączyć (moje członkostwa). */
  async mojeKonta(memberUserId: string) {
    const rows = await this.prisma.customerMembership.findMany({
      where: { memberUserId, disabledAt: null, owner: { anonymizedAt: null, loginBlocked: false } },
      orderBy: { createdAt: 'asc' },
      select: {
        ownerUserId: true, serviceIds: true, label: true,
        owner: { select: { email: true, companyName: true, firstName: true, lastName: true } },
      },
    });
    return rows.map((r) => ({
      ownerUserId: r.ownerUserId,
      nazwa: r.owner.companyName || [r.owner.firstName, r.owner.lastName].filter(Boolean).join(' ') || r.owner.email,
      email: r.owner.email,
      etykieta: r.label,
      wybraneUslugi: r.serviceIds.length,
    }));
  }

  /** Sprawdzenie przed wydaniem tokenu z `actingFor` — to samo, co potem robi strategia JWT. */
  async mozePrzelaczyc(memberUserId: string, ownerUserId: string): Promise<boolean> {
    const m = await this.prisma.customerMembership.findUnique({
      where: { ownerUserId_memberUserId: { ownerUserId, memberUserId } },
      select: { disabledAt: true, owner: { select: { anonymizedAt: true, loginBlocked: true } } },
    });
    return Boolean(m && !m.disabledAt && !m.owner.anonymizedAt && !m.owner.loginBlocked);
  }

  private async assertOwner(ownerUserId: string, actorUserId: string) {
    if (ownerUserId !== actorUserId) {
      throw new ForbiddenException('Tylko właściciel konta może zarządzać IAM.');
    }
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, customerOwnerId: true, role: true },
    });
    if (!owner || owner.role !== Role.USER || owner.customerOwnerId) {
      throw new ForbiddenException('IAM jest dostępny tylko dla głównego konta klienta.');
    }
  }

  private async assertMember(ownerUserId: string, memberId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, customerOwnerId: ownerUserId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Subaccount not found');
    return member;
  }

  private inviteUrl(token: string): string {
    const base = this.config.get<string>('clientPanelUrl') ?? 'http://localhost:3001';
    return `${base.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function formatActorName(
  user: { firstName: string | null; lastName: string | null; email: string } | undefined,
): string | null {
  if (!user) return null;
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.email;
}
