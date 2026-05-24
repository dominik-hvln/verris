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
          label: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ]);
    return { permissions: Object.values(CustomerPermission), members, invites };
  }

  async listAudit(ownerUserId: string, actorUserId: string, limit = 50) {
    await this.assertOwner(ownerUserId, actorUserId);
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        userId: ownerUserId,
        action: { startsWith: 'CUSTOMER_IAM_' },
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
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Ten adres e-mail ma już konto Verris. Użyj innego adresu subkonta.');
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
        label: dto.label?.trim() || null,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    await this.audit.record({
      action: 'CUSTOMER_IAM_INVITE_CREATED',
      userId: ownerUserId,
      actorUserId,
      details: { inviteId: invite.id, email, permissions: dto.permissions },
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
    });
    await this.mailer.send({
      ...message,
      userId: ownerUserId,
      category: 'TRANSACTIONAL',
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
      throw new ConflictException('Konto z tym adresem już istnieje.');
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
      },
      select: { id: true, email: true, customerPermissions: true, subaccountLabel: true },
    });
    await this.audit.record({
      action: 'CUSTOMER_IAM_MEMBER_UPDATED',
      userId: ownerUserId,
      actorUserId,
      details: { memberId, permissions: dto.permissions },
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
