import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { TwoFactorService } from './totp/two-factor.service';
import { SuspiciousActivityService } from '../security/suspicious-activity.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly twoFactor: TwoFactorService,
    private readonly suspicious: SuspiciousActivityService,
  ) {}

  async register(dto: RegisterDto): Promise<LoginSuccess> {
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

      return created;
    });

    return this.generateAccessTokenResponse(user);
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

    await this.suspicious.recordSuccess({
      email: user.email,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return this.generateAccessTokenResponse(user);
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
}
