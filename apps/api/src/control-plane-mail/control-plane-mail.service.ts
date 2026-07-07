import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  ControlPlaneMailboxKind,
  ControlPlaneMailboxStatus,
  ControlPlaneSystemAddressRole,
  Prisma,
  Role,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ControlPlaneMailActions } from '../common/audit/audit.actions';
import { PostfixMapSyncService } from './postfix-map-sync.service';
import { SogoAuthSyncService } from './sogo-auth-sync.service';
import { MailerService } from '../mail/mailer.service';
import { generateAuthToken, hashAuthToken } from '../auth/auth-token.util';
import { mailForwardConfirmTemplate } from '../mail/templates/mail-forward-notifications';
import {
  CONTROL_PLANE_MAIL_DOMAIN,
  LOCAL_PART_RE,
  RESERVED_LOCAL_PARTS,
} from './control-plane-mail.constants';
import type {
  CreateControlPlaneMailboxDto,
  CreateMailAliasDto,
  CreateMailForwardDto,
  UpdateControlPlaneMailboxDto,
  UpdateSystemAddressesDto,
} from './dto/control-plane-mail.dto';

const MAIL_FORWARD_CONFIRM_TTL_HOURS = 72;

@Injectable()
export class ControlPlaneMailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mapSync: PostfixMapSyncService,
    private readonly sogoAuth: SogoAuthSyncService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async listMailboxes(opts?: { kind?: ControlPlaneMailboxKind; status?: ControlPlaneMailboxStatus }) {
    const rows = await this.prisma.controlPlaneMailbox.findMany({
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
    return rows.map((row) => this.serializeMailbox(row));
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
    return this.serializeMailbox(row);
  }

  /** JSON-safe mailbox (BigInt → string, no password hash). */
  private serializeMailbox<T extends { usedBytes: bigint; passwordHash?: string | null }>(
    row: T,
  ): Omit<T, 'usedBytes' | 'passwordHash'> & { usedBytes: string } {
    const { passwordHash: _omit, usedBytes, ...rest } = row;
    return { ...rest, usedBytes: usedBytes.toString() };
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
    if (existing) {
      throw new ConflictException(
        `Skrzynka ${email} już istnieje. Odśwież stronę — jeśli nie widzisz hasła IMAP, użyj „Reset hasła”.`,
      );
    }

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
    if (imapPassword) {
      await this.sogoAuth.upsert(email, imapPassword);
    }

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
    await this.sogoAuth.upsert(mb.email, imapPassword);
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
    const aliasDomain = aliasEmail.slice(at + 1);
    if (aliasDomain !== CONTROL_PLANE_MAIL_DOMAIN) {
      throw new BadRequestException(
        `Alias musi być w domenie @${CONTROL_PLANE_MAIL_DOMAIN}. Dla adresu zewnętrznego użyj przekierowania (forward).`,
      );
    }
    // Reserved local-parts (abuse@, postmaster@, dmarc@…) are intentionally
    // allowed as ALIASES: the endpoint is ADMIN-only and RFC 2142 / DSA art. 12
    // require these addresses to be deliverable. The reservation still blocks
    // creating standalone mailboxes under these names (assertValidLocalPart).
    this.assertValidLocalPart(local, { allowReserved: true });

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

  async addForward(mailboxId: string, dto: CreateMailForwardDto, actorUserId: string) {
    const mb = await this.getMailbox(mailboxId);
    const forwardTo = dto.forwardTo.trim().toLowerCase();
    if (forwardTo === mb.email) {
      throw new BadRequestException('Adres docelowy musi być inny niż skrzynka źródłowa.');
    }

    const existing = await this.prisma.controlPlaneMailForward.findFirst({
      where: { mailboxId, forwardTo },
    });
    if (existing?.confirmedAt) {
      throw new ConflictException(`Przekierowanie na ${forwardTo} jest już aktywne.`);
    }
    if (existing) {
      await this.prisma.controlPlaneMailForward.delete({ where: { id: existing.id } });
    }

    const rawToken = generateAuthToken();
    const keepCopy = dto.keepCopy !== false;

    const forward = await this.prisma.controlPlaneMailForward.create({
      data: {
        mailboxId,
        forwardTo,
        keepCopy,
        confirmationToken: hashAuthToken(rawToken),
      },
    });

    const apiBase =
      this.config.get<string>('PUBLIC_API_URL') ??
      this.config.get<string>('API_BASE_URL') ??
      'https://api.verris.pl';
    const confirmUrl = `${apiBase.replace(/\/$/, '')}/public/mail/forward-confirm?token=${encodeURIComponent(rawToken)}`;

    const panelUrl =
      this.config.get<string>('ADMIN_PANEL_URL') ??
      this.config.get<string>('CLIENT_PANEL_URL') ??
      'https://panel.verris.pl';
    const message = mailForwardConfirmTemplate({
      to: forwardTo,
      mailboxEmail: mb.email,
      confirmUrl,
      expiresHours: MAIL_FORWARD_CONFIRM_TTL_HOURS,
      panelUrl,
    });
    await this.mailer.send(message);

    await this.audit.record({
      action: ControlPlaneMailActions.MAIL_FORWARD_ADDED,
      actorUserId,
      userId: mb.userId ?? undefined,
      details: { mailbox: mb.email, forwardTo, keepCopy, pending: true },
    });

    return {
      forward,
      message: `Wysłano link potwierdzający na ${forwardTo}. Przekierowanie włączy się po kliknięciu.`,
    };
  }

  async deleteForward(forwardId: string, actorUserId: string) {
    const row = await this.prisma.controlPlaneMailForward.findUnique({
      where: { id: forwardId },
      include: { mailbox: true },
    });
    if (!row) throw new NotFoundException('Przekierowanie nie istnieje.');

    await this.prisma.controlPlaneMailForward.delete({ where: { id: forwardId } });

    await this.audit.record({
      action: ControlPlaneMailActions.MAIL_FORWARD_REMOVED,
      actorUserId,
      userId: row.mailbox.userId ?? undefined,
      details: { mailbox: row.mailbox.email, forwardTo: row.forwardTo },
    });

    if (row.confirmedAt) {
      await this.mapSync.writeMapsToDisk().catch(() => undefined);
    }
    return { ok: true };
  }

  async confirmMailForward(rawToken: string): Promise<{ ok: boolean; html: string }> {
    const token = rawToken.trim();
    if (!token) {
      return { ok: false, html: this.forwardConfirmHtml(false, 'Brak tokenu w linku.') };
    }

    const tokenHash = hashAuthToken(token);
    const row = await this.prisma.controlPlaneMailForward.findFirst({
      where: { confirmationToken: tokenHash },
      include: { mailbox: true },
    });

    if (!row) {
      return {
        ok: false,
        html: this.forwardConfirmHtml(false, 'Link jest nieprawidłowy lub został już użyty.'),
      };
    }

    const expiresAt = new Date(row.createdAt.getTime() + MAIL_FORWARD_CONFIRM_TTL_HOURS * 3600_000);
    if (new Date() > expiresAt) {
      await this.prisma.controlPlaneMailForward.delete({ where: { id: row.id } });
      return { ok: false, html: this.forwardConfirmHtml(false, 'Link wygasł — poproś admina o nowe przekierowanie.') };
    }

    await this.prisma.controlPlaneMailForward.update({
      where: { id: row.id },
      data: { confirmedAt: new Date(), confirmationToken: null },
    });

    await this.mapSync.writeMapsToDisk().catch(() => undefined);

    await this.audit.record({
      action: ControlPlaneMailActions.MAIL_FORWARD_CONFIRMED,
      details: { mailbox: row.mailbox.email, forwardTo: row.forwardTo },
    });

    return {
      ok: true,
      html: this.forwardConfirmHtml(
        true,
        `Przekierowanie włączone: ${row.mailbox.email} → ${row.forwardTo}`,
      ),
    };
  }

  private forwardConfirmHtml(success: boolean, message: string): string {
    const title = success ? 'Przekierowanie potwierdzone' : 'Nie udało się potwierdzić';
    const color = success ? '#10b981' : '#f43f5e';
    return `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:1rem;color:#e5e5e5;background:#0a0a0a">
<h1 style="color:${color}">${title}</h1><p>${message}</p><p style="color:#737373;font-size:0.875rem">Verris — poczta zespołu</p></body></html>`;
  }

  async importMailboxesFromCsv(
    csv: string,
    dryRun: boolean,
    actorUserId: string,
  ): Promise<{
    dryRun: boolean;
    rows: Array<{ email: string; forwardTo?: string; action: string; error?: string }>;
    created: number;
  }> {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    const rows: Array<{ email: string; forwardTo?: string; action: string; error?: string }> = [];
    let created = 0;

    for (const line of lines) {
      const parts = line.split(/[,;]/).map((p) => p.trim().replace(/^"|"$/g, ''));
      const email = (parts[0] ?? '').toLowerCase();
      const forwardTo = parts[1]?.toLowerCase() || undefined;

      if (!email || !email.includes('@')) {
        rows.push({ email: email || line, action: 'skip', error: 'Nieprawidłowy email' });
        continue;
      }

      const at = email.indexOf('@');
      const domain = email.slice(at + 1);
      if (domain !== CONTROL_PLANE_MAIL_DOMAIN) {
        rows.push({ email, forwardTo, action: 'skip', error: `Domena musi być ${CONTROL_PLANE_MAIL_DOMAIN}` });
        continue;
      }

      const existing = await this.prisma.controlPlaneMailbox.findUnique({ where: { email } });
      if (existing) {
        rows.push({ email, forwardTo, action: 'exists' });
        continue;
      }

      if (dryRun) {
        rows.push({ email, forwardTo, action: 'would_create' });
        created += 1;
        continue;
      }

      const localPart = email.slice(0, at);
      try {
        this.assertValidLocalPart(localPart);
        const { mailbox } = await this.createMailbox(
          {
            localPart,
            kind: ControlPlaneMailboxKind.STAFF,
            domain: CONTROL_PLANE_MAIL_DOMAIN,
          },
          actorUserId,
        );
        rows.push({ email, forwardTo, action: 'created' });
        created += 1;

        if (forwardTo) {
          await this.addForward(mailbox.id, { forwardTo, keepCopy: true }, actorUserId);
          rows[rows.length - 1].action = 'created+forward_pending';
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rows.push({ email, forwardTo, action: 'error', error: msg });
      }
    }

    if (!dryRun && created > 0) {
      await this.audit.record({
        action: ControlPlaneMailActions.MAILBOX_IMPORT,
        actorUserId,
        details: { created, totalLines: lines.length } as Prisma.InputJsonValue,
      });
      await this.mapSync.writeMapsToDisk().catch(() => undefined);
    }

    return { dryRun, rows, created };
  }

  async getSystemAddresses() {
    return this.prisma.controlPlaneSystemAddress.findMany({ orderBy: { role: 'asc' } });
  }

  async updateSystemAddresses(dto: UpdateSystemAddressesDto, actorUserId: string) {
    const domain = CONTROL_PLANE_MAIL_DOMAIN;
    const fieldToRole: Array<[keyof UpdateSystemAddressesDto, ControlPlaneSystemAddressRole]> = [
      ['noreply', ControlPlaneSystemAddressRole.NOREPLY],
      ['support', ControlPlaneSystemAddressRole.SUPPORT],
      ['security', ControlPlaneSystemAddressRole.SECURITY],
      ['rodo', ControlPlaneSystemAddressRole.RODO],
      ['billing', ControlPlaneSystemAddressRole.BILLING],
      ['dmarcRua', ControlPlaneSystemAddressRole.DMARC_RUA],
      ['panel', ControlPlaneSystemAddressRole.PANEL],
    ];

    const changes: Array<{ role: ControlPlaneSystemAddressRole; from: string; to: string }> = [];

    for (const [field, role] of fieldToRole) {
      const raw = dto[field];
      if (raw === undefined) continue;

      const email = raw.trim().toLowerCase();
      const at = email.indexOf('@');
      if (at < 1) throw new BadRequestException(`Nieprawidłowy adres dla roli ${role}.`);
      const emailDomain = email.slice(at + 1);
      if (emailDomain !== domain) {
        throw new BadRequestException(`Adres systemowy musi być w domenie @${domain}.`);
      }
      const local = email.slice(0, at);
      if (!LOCAL_PART_RE.test(local)) {
        throw new BadRequestException('Nieprawidłowy local-part adresu systemowego.');
      }

      const prev = await this.prisma.controlPlaneSystemAddress.findUnique({ where: { role } });
      if (!prev) throw new NotFoundException(`Brak adresu systemowego: ${role}`);
      if (prev.email === email) continue;

      const taken = await this.prisma.controlPlaneSystemAddress.findFirst({
        where: { email, NOT: { role } },
      });
      if (taken) {
        throw new ConflictException(`Adres ${email} jest już przypisany do roli ${taken.role}.`);
      }

      await this.prisma.controlPlaneSystemAddress.update({
        where: { role },
        data: { email },
      });
      changes.push({ role, from: prev.email, to: email });
    }

    if (changes.length === 0) {
      return this.getSystemAddresses();
    }

    await this.audit.record({
      action: ControlPlaneMailActions.SYSTEM_ADDRESS_CHANGED,
      actorUserId,
      details: { changes } as Prisma.InputJsonValue,
    });

    return this.getSystemAddresses();
  }

  /** Domyślny From dla roli (fallback: panel@verris.pl). */
  async resolveSystemFromEmail(role: ControlPlaneSystemAddressRole): Promise<string> {
    const row = await this.prisma.controlPlaneSystemAddress.findUnique({ where: { role } });
    return row?.email ?? `panel@${CONTROL_PLANE_MAIL_DOMAIN}`;
  }

  async syncPostfixMaps() {
    const maps = await this.mapSync.generateMaps();
    const write = await this.mapSync.writeMapsToDisk();
    const pendingForwards = await this.prisma.controlPlaneMailForward.count({
      where: { confirmedAt: null },
    });
    return {
      ...maps,
      write,
      postmapRequired: write.ok,
      pendingForwards,
      hint: write.ok
        ? 'Mapy zapisane w /etc/postfix/verris. Na hoście uruchom postmap + reload (prod-mail-postmap-reload.sh). Forwardy wymagają potwierdzenia linkiem.'
        : write.message,
    };
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

  private assertValidLocalPart(localPart: string, opts?: { allowReserved?: boolean }) {
    if (!LOCAL_PART_RE.test(localPart)) {
      throw new BadRequestException('Nieprawidłowy local-part adresu.');
    }
    if (!opts?.allowReserved && RESERVED_LOCAL_PARTS.has(localPart)) {
      throw new BadRequestException(
        `Local-part „${localPart}” jest zarezerwowany — możesz go wskazać wyłącznie jako alias istniejącej skrzynki.`,
      );
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
    // Node bcrypt hashes are not accepted by Dovecot passwd-file; use doveadm.
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync(
      'doveadm',
      ['pw', '-s', 'BLF-CRYPT', '-p', plain],
      { encoding: 'utf8', timeout: 15_000 },
    );
    const hash = stdout.trim();
    if (!hash.startsWith('{BLF-CRYPT}')) {
      throw new Error('doveadm pw returned unexpected hash format');
    }
    return hash;
  }
}
