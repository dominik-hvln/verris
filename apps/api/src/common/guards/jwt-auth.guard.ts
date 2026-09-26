import { ExecutionContext, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AuditService } from '../audit/audit.service.js';
import { CustomerPermissionsGuard } from './customer-permissions.guard.js';

/**
 * Logowanie + uprawnienia subkonta w jednym kroku. Strażnik uprawnień subkonta NIE może być
 * globalny (APP_GUARD): globalne strażniki działają przed @UseGuards(JwtAuthGuard), więc
 * req.user był pusty i każde subkonto przechodziło jak właściciel (26.09 — subkonto
 * z samym „Usługi: podgląd” kupiło usługę z portfela właściciela).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly iam: CustomerPermissionsGuard;

  constructor(reflector: Reflector, @Optional() audit?: AuditService) {
    super();
    this.iam = new CustomerPermissionsGuard(reflector, audit);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(ctx))) return false;
    return this.iam.canActivate(ctx);
  }
}
