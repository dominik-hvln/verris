import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  ControlPlaneMailboxKind,
  ControlPlaneMailboxStatus,
  Prisma,
  Role,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ControlPlaneMailActions } from '../common/audit/audit.actions';
import { PostfixMapSyncService } from './postfix-map-sync.service';
import {
  CONTROL_PLANE_MAIL_DOMAIN,
  LOCAL_PART_RE,
  RESERVED_LOCAL_PARTS,
} from './control-plane-mail.constants';
import type {
  CreateControlPlaneMailboxDto,
  CreateMailAliasDto,
  UpdateControlPlaneMailboxDto,
} from './dto/control-plane-mail.dto';

@Injectable()
export class ControlPlaneMailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mapSync: PostfixMapSyncService,
    private readonly config: ConfigService,
  ) {}

  async listMailboxes(opts?: { kind?: ControlPlaneMailboxKind; status?: ControlPlaneMailboxStatus }) {
    return this.prisma.controlPlaneMailbox.findMany({
      where: {
        ...(opts?.kind ? { kind: opts.kind } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        _count: { select: { aliases: true, forwards: true } },
      },
      orderBy: { email: 'asc' },
    });
  }

  async getMailbox(id: string) {
    const row = await this.prisma.controlPlaneMailbox.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        aliases: true,
        forwards: true,
      },
    });
    if (!row) throw new NotFoundException('Skrzynka nie istnieje.');
    return row;
  }

  async createMailbox(
    dto: CreateControlPlaneMailboxDto,
    actorUserId: string,
  ): Promise<{ mailbox: Awaited<ReturnType<ControlPlaneMailService['getMailbox']>>; imapPassword?: string }> {
    const domain = (dto.domain ?? CONTROL_PLANE_MAIL_DOMAIN).trim().toLowerCase();
    const localPart = dto.localPart.trim().toLowerCase();
    this.assertValidLocalPart(localPart);

    const email = `${localPart}@${domain}`;
    const existing = await this.prisma.controlPlaneMailbox.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Ten adres e-mail już istnieje.');

    if (dto.userId) {
      await this.assertUserLinkable(dto.userId);
      const taken = await this.prisma.controlPlaneMailbox.findUnique({ where: { userId: dto.userId } });
      if (taken) throw new ConflictException('Ten użytkownik ma już przypisaną skrzynkę.');
    }

    let passwordHash: string | null = null;
    let imapPassword: string | undefined;
    if (dto.kind === ControlPlaneMailboxKind.STAFF) {
      imapPassword = this.generateMailboxPassword();
      passwordHash = await this.hashDovecotPassword(imapPassword);
    }

    const mailbox = await this.prisma.$transaction(async (tx) => {
      const created = await tx.controlPlaneMailbox.create({
        data: {
          localPart,
          domain,
          email,
          kind: dto.kind,
          displayName: dto.displayName?.trim() || null,
          userId: dto.userId ?? null,
          quotaMb: dto.quotaMb ?? 1024,
          imapEnabled: dto.kind === ControlPlaneMailboxKind.STAFF,
          passwordHash,
          createdById: actorUserId,
        },
      });

      if (dto.userId && dto.syncUserEmail !== false) {
        await tx.user.update({
          where: { id: dto.userId },
          data: { email },
        });
      }

      return created;
    });

    await this.audit.record({
      action: ControlPlaneMailActions.MAILBOX_CREATED,
      actorUserId,
      userId: dto.userId ?? undefined,
      details: { email, kind: dto.kind, localPart },
    });

    await this.mapSync.writeMapsToDisk().catch(() => undefined);

    return {
      mailbox: await this.getMailbox(mailbox.id),
      imapPassword,
    };
  }

  async updateMailbox(
    id: string,
    dto: UpdateControlPlaneMailboxDto,
    actorUserId: string,
  ) {
    const prev = await this.getMailbox(id);

    if (dto.userId) {
      await this.assertUserLinkable(dto.userId);
      const taken = await this.prisma.controlPlaneMailbox.findFirst({
        where: { userId: dto.userId, NOT: { id } },
      });
      if (taken) throw new ConflictException('Ten użytkownik ma już inną skrzynkę.');
    }

    await this.prisma.controlPlaneMailbox.update({
      where: { id },
      data: {
        status: dto.status,
        displayName: dto.displayName === undefined ? undefined : dto.displayName?.trim() || null,
        userId: dto.userId === undefined ? undefined : dto.userId,
        quotaMb: dto.quotaMb,
        imapEnabled: dto.imapEnabled,
      },
    });

    await this.audit.record({
      action: ControlPlaneMailActions.MAILBOX_UPDATED,
      actorUserId,
      userId: prev.userId ?? undefined,
      details: { email: prev.email, changes: { ...dto } } as Prisma.InputJsonValue,
    });

    await this.mapSync.writeMapsToDisk().catch(() => undefined);
    return this.getMailbox(id);
  }

  async resetMailboxPassword(
    id: string,
    actorUserId: string,
  ): Promise<{ imapPassword: string }> {
    const mb = await this.getMailbox(id);
    if (mb.kind !== ControlPlaneMailboxKind.STAFF) {
      throw new BadRequestException('Hasło IMAP tylko dla skrzynek STAFF.');
    }

    const imapPassword = this.generateMailboxPassword();
    const passwordHash = await this.hashDovecotPassword(imapPassword);

    await this.prisma.controlPlaneMailbox.update({
      where: { id },
      data: { passwordHash, imapEnabled: true },
    });

    await this.audit.record({
      action: ControlPlaneMailActions.MAILBOX_PASSWORD_RESET,
      actorUserId,
      userId: mb.userId ?? undefined,
      details: { email: mb.email },
    });

    await this.mapSync.writeMapsToDisk().catch(() => undefined);
    return { imapPassword };
  }

  async suspendMailbox(id: string, actorUserId: string) {
    return this.updateMailbox(
      id,
      { status: ControlPlaneMailboxStatus.SUSPENDED },
      actorUserId,
    );
  }

  async addAlias(mailboxId: string, dto: CreateMailAliasDto, actorUserId: string) {
    const mb = await this.getMailbox(mailboxId);
    const aliasEmail = dto.aliasEmail.trim().toLowerCase();
    const at = aliasEmail.indexOf('@');
    if (at < 1) throw new BadRequestException('Nieprawidłowy alias.');
    const local = aliasEmail.slice(0, at);
    this.assertValidLocalPart(local);

    const row = await this.prisma.controlPlaneMailAlias.create({
      data: { aliasEmail, targetId: mailboxId },
    });

    await this.audit.record({
      action: ControlPlaneMailActions.MAIL_ALIAS_ADDED,
      actorUserId,
      userId: mb.userId ?? undefined,
      details: { aliasEmail, target: mb.email },
    });

    await this.mapSync.writeMapsToDisk().catch(() => undefined);
    return row;
  }

  async deleteAlias(aliasId: string, actorUserId: string) {
    const row = await this.prisma.controlPlaneMailAlias.findUnique({
      where: { id: aliasId },
      include: { target: true },
    });
    if (!row) throw new NotFoundException('Alias nie istnieje.');

    await this.prisma.controlPlaneMailAlias.delete({ where: { id: aliasId } });

    await this.audit.record({
      action: ControlPlaneMailActions.MAIL_ALIAS_REMOVED,
      actorUserId,
      userId: row.target.userId ?? undefined,
      details: { aliasEmail: row.aliasEmail, target: row.target.email },
    });

    await this.mapSync.writeMapsToDisk().catch(() => undefined);
    return { ok: true };
  }

  async getSystemAddresses() {
    return this.prisma.controlPlaneSystemAddress.findMany({ orderBy: { role: 'asc' } });
  }

  async syncPostfixMaps() {
    const maps = await this.mapSync.generateMaps();
    const write = await this.mapSync.writeMapsToDisk();
    return { ...maps, write };
  }

  async getStaffConnectionInfo(userId: string) {
    const mailbox = await this.prisma.controlPlaneMailbox.findFirst({
      where: {
        userId,
        status: ControlPlaneMailboxStatus.ACTIVE,
        kind: ControlPlaneMailboxKind.STAFF,
      },
    });

    const mailHost =
      this.config.get<string>('CONTROL_PLANE_MAIL_HOST') ?? 'mail.verris.pl';
    const sogoUrl =
      this.config.get<string>('SOGO_WEB_URL') ?? `https://${mailHost}/SOGo`;

    if (!mailbox) {
      return {
        hasMailbox: false as const,
        mailHost,
        sogoUrl,
        hint: 'Skrzynka @verris.pl nie jest jeszcze przypisana — poproś administratora.',
      };
    }

    return {
      hasMailbox: true as const,
      email: mailbox.email,
      displayName: mailbox.displayName,
      quotaMb: mailbox.quotaMb,
      mailHost,
      sogoUrl,
      imap: {
        host: mailHost,
        port: 993,
        security: 'SSL/TLS',
        username: mailbox.email,
      },
      smtp: {
        host: mailHost,
        port: 587,
        security: 'STARTTLS',
        username: mailbox.email,
      },
      caldavUrl: `${sogoUrl.replace(/\/$/, '')}/dav/${encodeURIComponent(mailbox.email)}/Calendar/personal/`,
      documentation: 'Outlook, Thunderbird lub Apple Mail — użyj haseł IMAP z onboarding admina.',
    };
  }

  private assertValidLocalPart(localPart: string) {
    if (!LOCAL_PART_RE.test(localPart)) {
      throw new BadRequestException('Nieprawidłowy local-part adresu.');
    }
    if (RESERVED_LOCAL_PARTS.has(localPart)) {
      throw new BadRequestException(`Local-part „${localPart}” jest zarezerwowany.`);
    }
  }

  private async assertUserLinkable(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) throw new BadRequestException('Użytkownik niedostępny.');
    if (user.role !== Role.STAFF && user.role !== Role.ADMIN) {
      throw new BadRequestException('Skrzynkę można przypisać tylko do konta STAFF lub ADMIN.');
    }
  }

  private generateMailboxPassword(): string {
    return `${randomBytes(12).toString('base64url')}Aa1!`;
  }

  private async hashDovecotPassword(plain: string): Promise<string> {
    const hash = await bcrypt.hash(plain, 12);
    return `{BLF-CRYPT}${hash}`;
  }
}
