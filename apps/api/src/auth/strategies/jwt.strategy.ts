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
    });
    if (!user) {
      throw new UnauthorizedException('Token refers to a non-existent user');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      // E-5 impersonation hooks (will be set by /admin/users/:id/impersonate).
      actorUserId: payload.actorUserId,
      impersonatedBy: payload.impersonatedBy,
    };
  }
}
