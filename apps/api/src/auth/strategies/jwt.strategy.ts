import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwtSecret')!,
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    purpose?: string;
    actorUserId?: string;
    impersonatedBy?: string;
  }) {
    // Reject "2fa-challenge" tokens — those are issued mid-login and must NEVER
    // grant access to protected endpoints. They can only be redeemed via
    // POST /auth/login/2fa.
    if (payload.purpose && payload.purpose !== 'access') {
      throw new UnauthorizedException('Token cannot be used for this request');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        customerOwnerId: true,
        customerPermissions: true,
        subaccountDisabledAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('Token refers to a non-existent user');
    }
    if (user.customerOwnerId && user.subaccountDisabledAt) {
      throw new UnauthorizedException('Subaccount is disabled');
    }

    return {
      userId: user.customerOwnerId ?? user.id,
      principalUserId: user.id,
      email: user.email,
      role: user.role,
      customerOwnerId: user.customerOwnerId,
      customerPermissions: user.customerPermissions,
      // E-5 impersonation hooks (will be set by /admin/users/:id/impersonate).
      actorUserId: payload.actorUserId,
      impersonatedBy: payload.impersonatedBy,
    };
  }
}
