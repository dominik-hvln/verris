import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role, User } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { TotpService } from './totp/totp.service';
import {
  breakGlassCodesIssuedTemplate,
  breakGlassUsedAlertTemplate,
} from '../mail/templates/security-notifications';

interface BreakGlassStorage {
  /** SHA-256 hex of each unused break-glass code. Consumed entries removed. */
  remaining: string[];
}

interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

/** Outcome of evaluating a privileged user's password-login attempt. */
export type StaffLoginDecision = 'allow' | 'enroll-required' | 'block-use-passkey';

/**
 * Passkey policy for privileged accounts (ADMIN/STAFF).
 *
 * Enforcement is gated by env `REQUIRE_PASSKEY_FOR_STAFF=1` (mirrors the
 * existing `REQUIRE_2FA_FOR_STAFF` switch) so it can be turned on *after* the
 * seed accounts have enrolled a passkey — otherwise you lock yourself out.
 *
 * Lifecycle:
 *  1. Enforcement on, user has 0 passkeys → password login allowed but the
 *     login response carries `passkeyEnrollmentRequired: true`; the panel forces
 *     enrollment before anything else.
 *  2. User logs in with a passkey for the first time → `passkeyEnforcedAt` is
 *     stamped. The credential has now been proven end-to-end.
 *  3. Enforcement on + `passkeyEnforcedAt` set → the password-only path is
 *     rejected. The only ways in are the passkey itself or the break-glass
 *     fallback (password + TOTP + single-use code, alerts every admin).
 */
@Injectable()
export class PasskeyPolicyService {
  private readonly logger = new Logger(PasskeyPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly totp: TotpService,
  ) {}

  isEnforcedForStaff(): boolean {
    return (
      (this.config.get<string>('REQUIRE_PASSKEY_FOR_STAFF') ??
        process.env.REQUIRE_PASSKEY_FOR_STAFF) === '1'
    );
  }

  private isPrivileged(user: Pick<User, 'role'>): boolean {
    return user.role === Role.ADMIN || user.role === Role.STAFF;
  }

  async countPasskeys(userId: string): Promise<number> {
    return this.prisma.webAuthnCredential.count({ where: { userId } });
  }

  /**
   * Decide what happens when a privileged user authenticates with a password.
   * USERs and unenforced environments always `allow`.
   */
  async evaluatePasswordLogin(user: User): Promise<StaffLoginDecision> {
    if (!this.isPrivileged(user) || !this.isEnforcedForStaff()) return 'allow';
    const passkeys = await this.countPasskeys(user.id);
    if (user.passkeyEnforcedAt && passkeys > 0) return 'block-use-passkey';
    return 'enroll-required';
  }

  /**
   * Whether the panel should force passkey enrollment after this login. True
   * for privileged users under enforcement who don't yet have a working passkey.
   */
  async needsEnrollment(user: Pick<User, 'id' | 'role'>): Promise<boolean> {
    if (!this.isPrivileged(user) || !this.isEnforcedForStaff()) return false;
    return (await this.countPasskeys(user.id)) === 0;
  }

  /**
   * Called after a successful passkey login. The first time a privileged user
   * proves a passkey under enforcement we lock the password-only path.
   */
  async markEnforcedOnPasskeyLogin(user: User): Promise<void> {
    if (!this.isPrivileged(user) || !this.isEnforcedForStaff()) return;
    if (user.passkeyEnforcedAt) return;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passkeyEnforcedAt: new Date() },
    });
    await this.audit.record({
      action: 'PASSKEY_ENFORCEMENT_ACTIVATED',
      userId: user.id,
      actorUserId: user.id,
      details: { role: user.role },
    });
  }

  // ---------------------------------------------------------------------------
  // Break-glass codes — single-use emergency fallback
  // ---------------------------------------------------------------------------

  async breakGlassStatus(userId: string): Promise<{
    remaining: number;
    generatedAt: string | null;
    lastUsedAt: string | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        staffBreakGlassCodesEnc: true,
        staffBreakGlassGeneratedAt: true,
        staffBreakGlassUsedAt: true,
      },
    });
    let remaining = 0;
    if (user?.staffBreakGlassCodesEnc) {
      try {
        remaining = (
          JSON.parse(this.crypto.decrypt(user.staffBreakGlassCodesEnc)) as BreakGlassStorage
        ).remaining.length;
      } catch {
        remaining = 0;
      }
    }
    return {
      remaining,
      generatedAt: user?.staffBreakGlassGeneratedAt?.toISOString() ?? null,
      lastUsedAt: user?.staffBreakGlassUsedAt?.toISOString() ?? null,
    };
  }

  /**
   * Regenerate the break-glass code set. Requires re-auth with password + a
   * live TOTP code (2FA must be enabled — the fallback is meaningless without
   * it). Returns the plaintext codes exactly once.
   */
  async regenerateBreakGlass(
    userId: string,
    password: string,
    totpCode: string,
  ): Promise<{ codes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!this.isPrivileged(user)) {
      throw new UnauthorizedException('Break-glass dotyczy tylko kont ADMIN/STAFF.');
    }
    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException(
        'Najpierw włącz 2FA — kody awaryjne wymagają drugiego składnika.',
      );
    }
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    const totpOk = this.totp.verify(this.crypto.decrypt(user.twoFactorSecret), totpCode);
    if (!passwordOk || !totpOk) {
      throw new UnauthorizedException('Niepoprawne hasło lub kod TOTP.');
    }

    const codes = this.totp.generateRecoveryCodes(8);
    const storage: BreakGlassStorage = {
      remaining: codes.map((c) => this.crypto.sha256Hex(c)),
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        staffBreakGlassCodesEnc: this.crypto.encrypt(JSON.stringify(storage)),
        staffBreakGlassGeneratedAt: new Date(),
      },
    });
    await this.audit.record({
      action: 'BREAK_GLASS_CODES_REGENERATED',
      userId,
      actorUserId: userId,
      details: { count: codes.length },
    });

    const panelUrl =
      this.config.get<string>('ADMIN_PANEL_URL') ??
      this.config.get<string>('STAFF_PANEL_URL') ??
      'https://admin.verris.pl';
    void this.mailer
      .send({
        ...breakGlassCodesIssuedTemplate({
          to: user.email,
          firstName: user.firstName,
          issuedAt: new Date(),
          count: codes.length,
          panelUrl,
        }),
        userId,
        category: 'TRANSACTIONAL',
        fromRole: 'SECURITY',
      })
      .catch(() => undefined);

    return { codes };
  }

  /**
   * Validate + consume one break-glass code. Single-use. Returns true on
   * success. Does NOT alert here — caller alerts after the full login resolves.
   */
  async consumeBreakGlass(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { staffBreakGlassCodesEnc: true },
    });
    if (!user?.staffBreakGlassCodesEnc) return false;
    let storage: BreakGlassStorage;
    try {
      storage = JSON.parse(this.crypto.decrypt(user.staffBreakGlassCodesEnc)) as BreakGlassStorage;
    } catch {
      return false;
    }
    const candidate = this.crypto.sha256Hex(code.trim().toLowerCase());
    const idx = storage.remaining.indexOf(candidate);
    if (idx === -1) return false;
    storage.remaining.splice(idx, 1);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        staffBreakGlassCodesEnc: this.crypto.encrypt(JSON.stringify(storage)),
        staffBreakGlassUsedAt: new Date(),
      },
    });
    return true;
  }

  /** Audit + alert every ADMIN that a break-glass login just happened. */
  async alertBreakGlassUsed(user: User, ctx: RequestContext, remaining: number): Promise<void> {
    await this.audit.record({
      action: 'BREAK_GLASS_LOGIN_USED',
      userId: user.id,
      actorUserId: user.id,
      details: { role: user.role, remaining },
      ipAddress: ctx.ip ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
    });

    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, anonymizedAt: null },
      select: { id: true, email: true, firstName: true },
    });
    const panelUrl =
      this.config.get<string>('ADMIN_PANEL_URL') ??
      this.config.get<string>('STAFF_PANEL_URL') ??
      'https://admin.verris.pl';

    await Promise.all(
      admins.map((admin) =>
        this.mailer
          .send({
            ...breakGlassUsedAlertTemplate({
              to: admin.email,
              firstName: admin.firstName,
              accountEmail: user.email,
              role: user.role,
              usedAt: new Date(),
              ipAddress: ctx.ip ?? null,
              userAgent: ctx.userAgent ?? null,
              remaining,
              panelUrl,
            }),
            userId: admin.id,
            category: 'TRANSACTIONAL',
            fromRole: 'SECURITY',
          })
          .catch((err) =>
            this.logger.warn(
              `break-glass alert to ${admin.email} failed: ${(err as Error).message}`,
            ),
          ),
      ),
    );
  }
}
