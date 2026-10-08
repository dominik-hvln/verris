import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { STAFF_PERMISSIONS_ANY_KEY, STAFF_PERMISSIONS_KEY } from '../decorators/staff-permissions.decorator.js';
import { uprawnieniaOperatora } from '../../staff-roles/uprawnienia-operatora.js';
import { WNIOSEK_MOZLIWY_KEY } from '../../wnioski/wniosek-mozliwy.decorator.js';

/**
 * RBAC — egzekwuje granularne uprawnienia operatorów.
 *  - ADMIN: zawsze dozwolony (pełny dostęp).
 *  - STAFF: suma uprawnień jego ról (może mieć kilka) musi zawierać WSZYSTKIE wymagane uprawnienia.
 *  - @StaffPermAny na metodzie (L1-KARTA): wystarcza JEDNO z wymienionych uprawnień, a @StaffPerm klasy
 *    wtedy nie obowiązuje (@StaffPerm samej metody — nadal wszystkie). Na klasie — błąd konfiguracji (odmowa).
 *  - USER: brak dostępu do endpointów oznaczonych @StaffPerm / @StaffPermAny.
 * Uprawnienia czytane są z DB przez uprawnieniaOperatora (StaffRole.permissions wszystkich ról). Stosować PO JwtAuthGuard.
 */
@Injectable()
export class StaffPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // L1-KARTA — any-of czytamy tylko z metody; na klasie byłby po cichu pominięty i trasa bez @StaffPerm
    // stałaby otworem. Błąd konfiguracji zatrzymuje każde wywołanie (także ADMIN-a), więc wyjdzie od razu.
    if (this.reflector.get<string[] | undefined>(STAFF_PERMISSIONS_ANY_KEY, context.getClass())?.length) {
      throw new Error(`Błąd konfiguracji RBAC: @StaffPermAny tylko na metodzie (klasa ${context.getClass().name}).`);
    }
    const anyOf = this.reflector.get<string[] | undefined>(STAFF_PERMISSIONS_ANY_KEY, context.getHandler()) ?? [];
    const required =
      (anyOf.length > 0
        ? this.reflector.get<string[] | undefined>(STAFF_PERMISSIONS_KEY, context.getHandler())
        : this.reflector.getAllAndOverride<string[]>(STAFF_PERMISSIONS_KEY, [context.getHandler(), context.getClass()])) ?? [];
    if (required.length === 0 && anyOf.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Brak autoryzacji.');
    if (user.role === 'ADMIN') return true;
    if (user.role !== 'STAFF') throw new ForbiddenException('Brak uprawnień do tej operacji.');

    const principalId = user.principalUserId ?? user.userId;
    // PB-47 — suma uprawnień ze wszystkich ról operatora (jedno źródło: uprawnienia-operatora.ts).
    const perms: string[] = await uprawnieniaOperatora(this.prisma, principalId).catch(() => []);
    const ok = required.every((p) => perms.includes(p)) && (anyOf.length === 0 || anyOf.some((p) => perms.includes(p)));
    if (!ok) {
      // PB-48 — operacja z rejestru wniosków: kod odmowy, po którym panel proponuje „Wyślij wniosek”.
      const operacja = this.reflector.get<string | undefined>(WNIOSEK_MOZLIWY_KEY, context.getHandler());
      if (operacja) {
        throw new ForbiddenException({
          code: 'WYMAGA_WNIOSKU',
          operacja,
          message: 'Twoja rola nie ma uprawnień do tej operacji. Możesz wysłać wniosek do osoby z uprawnieniem.',
        });
      }
      throw new ForbiddenException('Twoja rola nie ma uprawnień do tej operacji.');
    }
    return true;
  }
}
