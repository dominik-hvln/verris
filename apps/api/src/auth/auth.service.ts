import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, Role, UserAuthTokenPurpose } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, PasswordResetConfirmDto, PasswordResetRequestDto, RegisterDto } from './auth.dto';
import { TwoFactorService } from './totp/two-factor.service';
import { SuspiciousActivityService } from '../security/suspicious-activity.service';
import { ConsentsService } from '../compliance/consents.service';
import { MarketingPreferencesService } from '../compliance/marketing-preferences.service';
import { AuditService } from '../common/audit/audit.service';
import { RodoActions } from '../common/audit/audit.actions';
import { LoginEventService } from './login-event.service';
import { MailerService } from '../mail/mailer.service';
import {
  welcomeTemplate,
  passwordResetRequestTemplate,
  emailVerifyTemplate,
  emailVerifiedOkTemplate,
} from '../mail/templates/auth-notifications';
import { passwordChangedTemplate } from '../mail/templates/security-notifications';
import { generateAuthToken, hashAuthToken } from './auth-token.util';

const PASSWORD_RESET_TTL_MINUTES = 15;
const EMAIL_VERIFICATION_TTL_HOURS = 24;

interface RegisterSuccess {
  ok: true;
  email: string;
  message: string;
}

interface LoginSuccess {
  access_token: string;
  user: {
    id: string;
    email: string;
    role: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface LoginChallenge {
  twoFactorRequired: true;
  /** Short-lived JWT marking that step 1 (password) succeeded. */
  challengeToken: string;
}

interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly twoFactor: TwoFactorService,
    private readonly suspicious: SuspiciousActivityService,
    private readonly consents: ConsentsService,
    private readonly marketingPrefs: MarketingPreferencesService,
    private readonly audit: AuditService,
    private readonly loginEvents: LoginEventService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, ctx: RequestContext = {}): Promise<RegisterSuccess> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    const referralCode = `EKO-${randomBytes(4).toString('hex').toUpperCase()}`;
    const ecoBadgeToken = randomBytes(18).toString('base64url');

    let referredByUserId: string | undefined;
    if (dto.ref?.trim()) {
      const code = dto.ref.trim().toUpperCase();
      const referrer = await this.prisma.user.findFirst({
        where: { referralCode: code },
      });
      if (referrer) referredByUserId = referrer.id;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'USER',
          walletBalance: 0,
          referralCode,
          ecoBadgeToken,
          referredByUserId,
        },
      });

      if (referredByUserId) {
        await tx.user.update({
          where: { id: created.id },
          data: { ecoPoints: { increment: 3 } },
        });
        await tx.user.update({
          where: { id: referredByUserId },
          data: { ecoPoints: { increment: 5 } },
        });
        await tx.ecoPointsLedgerEntry.createMany({
          data: [
            { userId: created.id, delta: 3, reason: 'REFERRAL_REGISTER_REFEREE' },
            { userId: referredByUserId, delta: 5, reason: 'REFERRAL_REGISTER_REFERRER' },
          ],
        });
      }

      // RODO Sprint 1 / L-03 — record terms+privacy consents (creates
      // `UserConsent` rows + sets `User.lastConsentVersion*` fields atomically).
      // Throws ForbiddenException if no current legal documents are published.
      await this.consents.recordRegistrationConsents(tx, created.id, {
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      // Marketing preferences row — `marketingEmail` reflects the optional
      // checkbox. `loginAlertsEmail` defaults to true (security-positive).
      await this.marketingPrefs.ensureTx(tx, created.id, {
        marketingEmail: dto.acceptMarketing === true,
      });

      return created;
    });

    // RODO audit trail — emitted outside transaction so audit failures don't
    // roll back the new account. Both consents recorded as `CONSENT_GRANTED`.
    await Promise.all([
      this.audit.record({
        action: RodoActions.CONSENT_GRANTED,
        userId: user.id,
        actorUserId: user.id,
        details: { kind: 'TERMS', source: 'REGISTRATION' },
        ipAddress: ctx.ip ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
      }),
      this.audit.record({
        action: RodoActions.CONSENT_GRANTED,
        userId: user.id,
        actorUserId: user.id,
        details: { kind: 'PRIVACY', source: 'REGISTRATION' },
        ipAddress: ctx.ip ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
      }),
      dto.acceptMarketing === true
        ? this.audit.record({
            action: RodoActions.MARKETING_OPT_IN,
            userId: user.id,
            actorUserId: user.id,
            details: { source: 'REGISTRATION' },
            ipAddress: ctx.ip ?? undefined,
            userAgent: ctx.userAgent ?? undefined,
          })
        : Promise.resolve(),
    ]);

    void this.issueEmailVerification(user.id, user.email, user.firstName).catch((err) => {
      this.logger.warn(
        `register: verification mail failed for ${user.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return {
      ok: true,
      email: user.email,
      message:
        'Konto utworzone. Sprawdź skrzynkę e-mail i kliknij link potwierdzający, aby się zalogować.',
    };
  }

  /** Always returns ok — no email enumeration. */
  async requestEmailVerification(dto: { email: string }): Promise<{ ok: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        role: true,
        emailVerifiedAt: true,
        anonymizedAt: true,
        loginBlocked: true,
        customerOwnerId: true,
        subaccountDisabledAt: true,
      },
    });
    if (
      !user ||
      user.anonymizedAt ||
      user.role !== Role.USER ||
      user.emailVerifiedAt ||
      user.loginBlocked ||
      (user.customerOwnerId && user.subaccountDisabledAt)
    ) {
      return { ok: true };
    }

    void this.issueEmailVerification(user.id, user.email, user.firstName).catch((err) => {
      this.logger.warn(
        `requestEmailVerification: mail failed for ${user.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    return { ok: true };
  }

  async confirmEmailVerification(dto: { token: string }): Promise<{ ok: true }> {
    const tokenHash = hashAuthToken(dto.token.trim());
    const row = await this.prisma.userAuthToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            emailVerifiedAt: true,
            anonymizedAt: true,
            role: true,
          },
        },
      },
    });
    if (
      !row ||
      row.purpose !== UserAuthTokenPurpose.EMAIL_VERIFICATION ||
      row.usedAt ||
      row.expiresAt.getTime() < Date.now() ||
      row.user.anonymizedAt ||
      row.user.emailVerifiedAt
    ) {
      throw new BadRequestException('Link potwierdzenia e-mail jest nieprawidłowy lub wygasł.');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: now },
      }),
      this.prisma.userAuthToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      }),
      this.prisma.userAuthToken.updateMany({
        where: {
          userId: row.userId,
          purpose: UserAuthTokenPurpose.EMAIL_VERIFICATION,
          usedAt: null,
        },
        data: { usedAt: now },
      }),
    ]);

    const panelUrl = this.clientPanelUrl();
    void this.notifyWelcome(row.user).catch(() => undefined);
    const verifiedMsg = emailVerifiedOkTemplate({
      to: row.user.email,
      firstName: row.user.firstName,
      panelUrl,
    });
    void this.mailer
      .send({ ...verifiedMsg, userId: row.user.id, category: 'TRANSACTIONAL' })
      .catch(() => undefined);

    return { ok: true };
  }

  private async issueEmailVerification(
    userId: string,
    email: string,
    firstName: string | null,
  ): Promise<void> {
    const rawToken = generateAuthToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.userAuthToken.updateMany({
        where: {
          userId,
          purpose: UserAuthTokenPurpose.EMAIL_VERIFICATION,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      }),
      this.prisma.userAuthToken.create({
        data: {
          userId,
          purpose: UserAuthTokenPurpose.EMAIL_VERIFICATION,
          tokenHash: hashAuthToken(rawToken),
          expiresAt,
        },
      }),
    ]);

    const panelUrl = this.clientPanelUrl();
    const verifyUrl = `${panelUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const message = emailVerifyTemplate({
      to: email,
      firstName,
      verifyUrl,
      expiresHours: EMAIL_VERIFICATION_TTL_HOURS,
      panelUrl,
    });
    await this.mailer.send({ ...message, userId, category: 'TRANSACTIONAL' });
  }

  /** Always returns ok — no email enumeration. */
  async requestPasswordReset(dto: PasswordResetRequestDto): Promise<{ ok: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        role: true,
        loginBlocked: true,
        anonymizedAt: true,
        subaccountDisabledAt: true,
        customerOwnerId: true,
      },
    });
    if (!user || user.anonymizedAt) {
      return { ok: true };
    }
    if (user.role !== Role.USER) {
      return { ok: true };
    }
    if (user.loginBlocked || (user.customerOwnerId && user.subaccountDisabledAt)) {
      return { ok: true };
    }

    const rawToken = generateAuthToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.userAuthToken.updateMany({
        where: {
          userId: user.id,
          purpose: UserAuthTokenPurpose.PASSWORD_RESET,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      }),
      this.prisma.userAuthToken.create({
        data: {
          userId: user.id,
          purpose: UserAuthTokenPurpose.PASSWORD_RESET,
          tokenHash: hashAuthToken(rawToken),
          expiresAt,
        },
      }),
    ]);

    const panelUrl = this.clientPanelUrl();
    const resetUrl = `${panelUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const message = passwordResetRequestTemplate({
      to: user.email,
      firstName: user.firstName,
      resetUrl,
      expiresMinutes: PASSWORD_RESET_TTL_MINUTES,
      panelUrl,
    });
    void this.mailer.send({ ...message, userId: user.id, category: 'TRANSACTIONAL' }).catch((err) => {
      this.logger.warn(
        `requestPasswordReset: mail failed for ${user.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return { ok: true };
  }

  async confirmPasswordReset(dto: PasswordResetConfirmDto): Promise<{ ok: true }> {
    const tokenHash = hashAuthToken(dto.token.trim());
    const row = await this.prisma.userAuthToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, firstName: true, anonymizedAt: true } } },
    });
    if (
      !row ||
      row.purpose !== UserAuthTokenPurpose.PASSWORD_RESET ||
      row.usedAt ||
      row.expiresAt.getTime() < Date.now() ||
      row.user.anonymizedAt
    ) {
      throw new BadRequestException('Link resetu hasła jest nieprawidłowy lub wygasł.');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      }),
      this.prisma.userAuthToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.userAuthToken.updateMany({
        where: {
          userId: row.userId,
          purpose: UserAuthTokenPurpose.PASSWORD_RESET,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      }),
    ]);

    const panelUrl = this.clientPanelUrl();
    const message = passwordChangedTemplate({
      to: row.user.email,
      firstName: row.user.firstName,
      changedAt: new Date(),
      deviceLabel: null,
      ipAddress: null,
      panelUrl,
    });
    void this.mailer.send({ ...message, userId: row.userId, category: 'TRANSACTIONAL' }).catch(() => undefined);

    return { ok: true };
  }

  /**
   * Step 1 of login: validate email + password. If 2FA is enabled, return a
   * short-lived `challengeToken` instead of a full JWT — the panel must call
   * `verifyTwoFactor()` with a TOTP/recovery code to complete the login.
   */
  async login(
    dto: LoginDto,
    ctx: RequestContext = {},
  ): Promise<LoginSuccess | LoginChallenge> {
    // E-8 — short-circuit if too many recent failures for this email. We
    // throw the same generic error so a hostile observer can't tell whether
    // the email exists or whether the rate limit is active.
    if (await this.suspicious.isEmailLockedOut(dto.email)) {
      await this.suspicious.recordFailure({
        email: dto.email,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        reason: 'too_many_attempts',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      await this.suspicious.recordFailure({
        email: dto.email,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        reason: 'unknown_user',
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.suspicious.recordFailure({
        email: dto.email,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        reason: 'bad_password',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    this.assertNotLoginBlocked(user);
    this.assertEmailVerified(user);

    if (user.isTwoFactorEnabled) {
      // Issue a 5-minute "2fa-challenge" token. It carries `sub` and a special
      // `purpose` claim so the JWT strategy refuses to mint regular requests
      // with it (we'll add a second guard for the verify endpoint). We do NOT
      // record a `success` here — the second factor still has to pass.
      const challengeToken = this.jwtService.sign(
        { sub: user.id, email: user.email, purpose: '2fa-challenge' },
        { expiresIn: '5m' },
      );
      return { twoFactorRequired: true, challengeToken };
    }

    await this.suspicious.recordSuccess({
      email: dto.email,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    await this.loginEvents.record({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      loginMethod: 'password',
    });
    return this.generateAccessTokenResponse(user);
  }

  /**
   * Step 2 of login: verify TOTP or recovery code. Trades the challenge
   * token (carried in `challengeToken`) for a real access token.
   */
  async verifyTwoFactor(
    dto: { challengeToken: string; code: string },
    ctx: RequestContext = {},
  ): Promise<LoginSuccess> {
    let payload: { sub: string; purpose?: string; email?: string };
    try {
      payload = this.jwtService.verify(dto.challengeToken);
    } catch {
      throw new UnauthorizedException('Sesja 2FA wygasła. Zaloguj się ponownie.');
    }
    if (payload.purpose !== '2fa-challenge') {
      throw new BadRequestException('Invalid challenge token');
    }
    const cleaned = dto.code?.trim();
    if (!cleaned) {
      throw new BadRequestException('Code is required');
    }

    const ok = await this.twoFactor.verifyCodeForLogin(payload.sub, cleaned);
    if (!ok) {
      if (payload.email) {
        await this.suspicious.recordFailure({
          email: payload.email,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          reason: '2fa_failed',
        });
      }
      throw new UnauthorizedException('Niepoprawny kod 2FA');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');

    this.assertNotLoginBlocked(user);
    this.assertEmailVerified(user);

    await this.suspicious.recordSuccess({
      email: user.email,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    await this.loginEvents.record({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      loginMethod: 'password+2fa',
    });
    return this.generateAccessTokenResponse(user);
  }

  private assertNotLoginBlocked(user: User) {
    if (user.role === Role.USER && user.loginBlocked) {
      throw new UnauthorizedException(
        'Konto zostało tymczasowo zablokowane. Skontaktuj się z pomocą techniczną.',
      );
    }
    if (user.customerOwnerId && user.subaccountDisabledAt) {
      throw new UnauthorizedException('Subkonto zostało wyłączone przez właściciela.');
    }
  }

  private assertEmailVerified(user: User) {
    if (user.role === Role.USER && !user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Potwierdź adres e-mail — sprawdź skrzynkę lub poproś o nowy link na stronie logowania.',
      );
    }
  }

  private generateAccessTokenResponse(user: User): LoginSuccess {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  private clientPanelUrl(): string {
    return (
      this.config.get<string>('CLIENT_PANEL_URL') ??
      this.config.get<string>('clientPanelUrl') ??
      'https://panel.verris.pl'
    ).replace(/\/$/, '');
  }

  private async notifyWelcome(user: Pick<User, 'id' | 'email' | 'firstName'>): Promise<void> {
    const panelUrl = this.clientPanelUrl();
    const message = welcomeTemplate({
      to: user.email,
      firstName: user.firstName,
      panelUrl,
    });
    await this.mailer.send({ ...message, userId: user.id, category: 'TRANSACTIONAL' });
  }
}
