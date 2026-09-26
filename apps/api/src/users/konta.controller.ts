import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { CustomerIamService } from './customer-iam.service.js';

class PrzelaczDto {
  /** Konto właściciela, na którym chcę pracować; brak = wracam na własne konto. */
  @IsOptional() @IsUUID('all') ownerUserId?: string | null;
}

type Zalogowany = { userId: string; principalUserId?: string; actingFor?: string; sid?: string; impersonatedBy?: string };

/**
 * PB-20 — przełącznik kont: deweloper/agencja z własnym loginem pracuje na kontach klientów,
 * którzy mu je udostępnili. Nowy token różni się tylko polem `actingFor` (ta sama sesja `sid`,
 * ta sama wersja tokenu) — wylogowanie urządzenia i „wyloguj wszędzie” działają jak dotąd.
 */
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class KontaController {
  constructor(
    private readonly iam: CustomerIamService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('accounts')
  konta(@CurrentUser() u: Zalogowany) {
    return this.iam.mojeKonta(u.principalUserId ?? u.userId);
  }

  @RateLimit({ limit: 60, windowMs: 60 * 1000, scope: 'auth:switch-account' })
  @Post('switch-account')
  async przelacz(@CurrentUser() u: Zalogowany, @Body() body: PrzelaczDto) {
    if (u.impersonatedBy) throw new ForbiddenException('Podczas podglądu konta przez obsługę nie można przełączać kont.');
    const ja = await this.prisma.user.findUnique({
      where: { id: u.principalUserId ?? u.userId },
      select: { id: true, email: true, role: true, tokenVersion: true, customerOwnerId: true },
    });
    if (!ja || ja.role !== 'USER' || ja.customerOwnerId) throw new ForbiddenException('Przełączanie kont jest dostępne tylko dla głównego konta klienta.');
    const cel = body.ownerUserId ?? null;
    if (cel && !(await this.iam.mozePrzelaczyc(ja.id, cel))) throw new ForbiddenException('Nie masz dostępu do tego konta.');
    const token = this.jwt.sign({
      email: ja.email,
      sub: ja.id,
      role: ja.role,
      tv: ja.tokenVersion,
      ...(u.sid ? { sid: u.sid } : {}),
      ...(cel ? { actingFor: cel } : {}),
    });
    if (cel) await this.audit.record({ action: 'CUSTOMER_IAM_ACCOUNT_SWITCH', userId: cel, actorUserId: ja.id });
    return { access_token: token, actingFor: cel };
  }
}
