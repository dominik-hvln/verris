import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { STAFF_PERMISSIONS_KEY } from '../decorators/staff-permissions.decorator';

/**
 * RBAC — egzekwuje granularne uprawnienia operatorów.
 *  - ADMIN: zawsze dozwolony (pełny dostęp).
 *  - STAFF: musi mieć przypisaną rolę zawierającą WSZYSTKIE wymagane uprawnienia.
 *  - USER: brak dostępu do endpointów oznaczonych @StaffPerm.
 * Uprawnienia roli czytane są z DB (StaffRole.permissions). Stosować PO JwtAuthGuard.
 */
@Injectable()
export class StaffPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(STAFF_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Brak autoryzacji.');
    if (user.role === 'ADMIN') return true;
    if (user.role !== 'STAFF') throw new ForbiddenException('Brak uprawnień do tej operacji.');

    const principalId = user.principalUserId ?? user.userId;
    type UserDelegate = {
      findUnique(args: unknown): Promise<{ staffRole: { permissions: string[] } | null } | null>;
    };
    const repo = (this.prisma as unknown as { user: UserDelegate }).user;
    const row = await repo
      .findUnique({ where: { id: principalId }, select: { staffRole: { select: { permissions: true } } } })
      .catch(() => null);
    const perms: string[] = row?.staffRole?.permissions ?? [];
    const ok = required.every((p) => perms.includes(p));
    if (!ok) throw new ForbiddenException('Twoja rola nie ma uprawnień do tej operacji.');
    return true;
  }
}
