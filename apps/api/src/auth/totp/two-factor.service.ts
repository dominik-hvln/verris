import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { TotpService } from './totp.service';
import { MailerService } from '../../mail/mailer.service';
import {
  twoFactorEnabledTemplate,
  twoFactorDisabledTemplate,
} from '../../mail/templates/security-notifications';

const ISSUER = 'Verris';

interface RecoveryStorage {
  /** SHA-256 hex of each unused recovery code. Consumed entries are removed. */
  remaining: string[];
}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly totp: TotpService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Step 1 — generate (or rotate) a pending TOTP secret. The secret is stored
   * encrypted; `isTwoFactorEnabled` stays `false` until the user proves they
   * can produce a valid code via `confirmEnrollment`.
   */
  async startEnrollment(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isTwoFactorEnabled) {
      throw new ConflictException('2FA is already enabled. Disable it first to re-enroll.');
    }

    const secret = this.totp.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: this.crypto.encrypt(secret) },
    });

    return {
      secret,
      otpauthUri: this.totp.buildUri({
        secret,
        label: user.email,
        issuer: ISSUER,
      }),
    };
  }

  /**
   * Step 2 — confirm the freshly generated secret with a live code. Once this
   * succeeds, 2FA is active and a fresh batch of recovery codes is issued.
   * The plaintext recovery codes are returned exactly once.
   */
  async confirmEnrollment(userId: string, code: string, ip?: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isTwoFactorEnabled) {
      throw new ConflictException('2FA is already enabled');
    }
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Start enrollment first');
    }

    const secret = this.crypto.decrypt(user.twoFactorSecret);
    if (!this.totp.verify(secret, code)) {
      throw new UnauthorizedException('Niepoprawny kod TOTP. Sprawdź zegar w aplikacji.');
    }

    const recoveryCodes = this.totp.generateRecoveryCodes();
    const storage: RecoveryStorage = {
      remaining: recoveryCodes.map((c) => this.crypto.sha256Hex(c)),
    };

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: true,
        twoFactorEnrolledAt: new Date(),
        twoFactorRecoveryCodesEnc: this.crypto.encrypt(JSON.stringify(storage)),
      },
    });

    await this.audit.record({
      action: 'TWO_FACTOR_ENABLED',
      userId,
      actorUserId: userId,
      ipAddress: ip,
    });

    void this.notifyTwoFactorEnabled({
      to: user.email,
      firstName: user.firstName,
      enrolledAt: new Date(),
      recoveryCodes,
    }).catch((err) => {
      this.logger.warn(
        `notifyTwoFactorEnabled failed for user=${userId}: ${(err as Error).message}`,
      );
    });

    return { recoveryCodes };
  }

  /**
   * Disables 2FA. Requires either the user's current password or a current
   * TOTP code to prevent attacker take-over after session theft.
   */
  async disable(opts: {
    userId: string;
    password?: string;
    code?: string;
    ip?: string | null;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: opts.userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.isTwoFactorEnabled) {
      throw new ConflictException('2FA is not enabled');
    }

    let verified = false;
    if (opts.code && user.twoFactorSecret) {
      verified = this.totp.verify(this.crypto.decrypt(user.twoFactorSecret), opts.code);
    }
    if (!verified && opts.password) {
      verified = await bcrypt.compare(opts.password, user.passwordHash);
    }

    if (!verified) {
      throw new UnauthorizedException(
        'Aby wyłączyć 2FA podaj poprawne hasło lub aktualny kod TOTP.',
      );
    }

    await this.prisma.user.update({
      where: { id: opts.userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorEnrolledAt: null,
        twoFactorRecoveryCodesEnc: null,
      },
    });

    await this.audit.record({
      action: 'TWO_FACTOR_DISABLED',
      userId: opts.userId,
      actorUserId: opts.userId,
      ipAddress: opts.ip,
    });

    void this.notifyTwoFactorDisabled({
      to: user.email,
      firstName: user.firstName,
      disabledAt: new Date(),
    }).catch((err) => {
      this.logger.warn(
        `notifyTwoFactorDisabled failed for user=${opts.userId}: ${
          (err as Error).message
        }`,
      );
    });
  }

  private async notifyTwoFactorEnabled(opts: {
    to: string;
    firstName: string | null;
    enrolledAt: Date;
    recoveryCodes: string[];
  }): Promise<void> {
    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const message = twoFactorEnabledTemplate({
      to: opts.to,
      firstName: opts.firstName,
      enrolledAt: opts.enrolledAt,
      recoveryCodes: opts.recoveryCodes,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'SECURITY' });
  }

  private async notifyTwoFactorDisabled(opts: {
    to: string;
    firstName: string | null;
    disabledAt: Date;
  }): Promise<void> {
    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const message = twoFactorDisabledTemplate({
      to: opts.to,
      firstName: opts.firstName,
      disabledAt: opts.disabledAt,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'SECURITY' });
  }

  /**
   * Returns whether the user has 2FA active without leaking the secret. Used
   * by the panel to decide whether to render "Enable" or "Disable" CTA.
   */
  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isTwoFactorEnabled: true,
        twoFactorEnrolledAt: true,
        twoFactorSecret: true,
        twoFactorRecoveryCodesEnc: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    let recoveryCodesRemaining = 0;
    if (user.twoFactorRecoveryCodesEnc) {
      try {
        const storage = JSON.parse(
          this.crypto.decrypt(user.twoFactorRecoveryCodesEnc),
        ) as RecoveryStorage;
        recoveryCodesRemaining = storage.remaining.length;
      } catch (err) {
        this.logger.warn(
          `Could not decode recovery codes for user=${userId}: ${(err as Error).message}`,
        );
      }
    }
    return {
      enabled: user.isTwoFactorEnabled,
      enrolledAt: user.twoFactorEnrolledAt?.toISOString() ?? null,
      pendingEnrollment: !!user.twoFactorSecret && !user.isTwoFactorEnabled,
      recoveryCodesRemaining,
    };
  }

  // ---------------------------------------------------------------------------
  // Login helpers
  // ---------------------------------------------------------------------------

  /**
   * Verifies a TOTP code OR a recovery code against a user's stored secrets.
   * Recovery codes are consumed (deleted) on success — single-use by design.
   */
  async verifyCodeForLogin(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorSecret: true,
        twoFactorRecoveryCodesEnc: true,
        isTwoFactorEnabled: true,
      },
    });
    if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) return false;

    // Try TOTP first.
    if (this.totp.verify(this.crypto.decrypt(user.twoFactorSecret), code)) {
      return true;
    }

    // Fall back to recovery code (one-time use).
    if (!user.twoFactorRecoveryCodesEnc) return false;
    let storage: RecoveryStorage;
    try {
      storage = JSON.parse(
        this.crypto.decrypt(user.twoFactorRecoveryCodesEnc),
      ) as RecoveryStorage;
    } catch (err) {
      this.logger.warn(
        `Could not decode recovery codes for user=${userId}: ${(err as Error).message}`,
      );
      return false;
    }

    const cleaned = code.trim().toLowerCase();
    const candidateHash = this.crypto.sha256Hex(cleaned);
    const idx = storage.remaining.indexOf(candidateHash);
    if (idx === -1) return false;

    storage.remaining.splice(idx, 1);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorRecoveryCodesEnc: this.crypto.encrypt(JSON.stringify(storage)),
      },
    });

    await this.audit.record({
      action: 'TWO_FACTOR_RECOVERY_CODE_USED',
      userId,
      actorUserId: userId,
      details: { remaining: storage.remaining.length },
    });

    return true;
  }
}
