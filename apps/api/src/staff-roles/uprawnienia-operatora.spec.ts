import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator.js';
import { dostepOperatora, roleZWiersza } from './uprawnienia-operatora.js';

/** PB-47 — operator z kilkoma rolami: uprawnienia są sumą (staffRoleId + przypisania). */
const rola = (id: string, permissions: string[]) => ({ id, name: `Rola ${id}`, permissions });

function prismaZ(row: unknown) {
  return { user: { findUnique: vi.fn(async () => row) } };
}

function kontekst(user: unknown, wymagane: string[]): ExecutionContext {
  const handler = () => undefined;
  Reflect.defineMetadata(STAFF_PERMISSIONS_KEY, wymagane, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PB-47 — suma uprawnień operatora', () => {
  const wiersz = {
    staffRole: rola('a', ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE']),
    staffRoleAssignments: [{ role: rola('a', ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE']) }, { role: rola('b', ['BILLING_MANAGE']) }],
  };

  it('dostepOperatora: role bez powtórzeń, uprawnienia = suma', async () => {
    const prisma = prismaZ(wiersz);
    const d = await dostepOperatora(prisma, 'op1');
    expect(d.role.map((r) => r.id)).toEqual(['a', 'b']);
    expect(d.uprawnienia.sort()).toEqual(['BILLING_MANAGE', 'CUSTOMERS_MANAGE', 'CUSTOMERS_VIEW']);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'op1' }, select: expect.objectContaining({ staffRoleAssignments: expect.anything() }) }),
    );
  });

  it('roleZWiersza: same przypisania (bez staffRoleId) i brak konta', () => {
    expect(roleZWiersza({ staffRole: null, staffRoleAssignments: [{ role: rola('c', ['NODES_VIEW']) }] }).map((r) => r.id)).toEqual(['c']);
    expect(roleZWiersza(null)).toEqual([]);
  });

  it('strażnik wpuszcza, gdy wymagane uprawnienia pochodzą z RÓŻNYCH ról', async () => {
    const guard = new StaffPermissionsGuard(new Reflector(), prismaZ(wiersz) as never);
    await expect(guard.canActivate(kontekst({ userId: 'op1', role: 'STAFF' }, ['CUSTOMERS_MANAGE', 'BILLING_MANAGE']))).resolves.toBe(true);
  });

  it('strażnik odmawia, gdy żadna rola nie daje uprawnienia', async () => {
    const guard = new StaffPermissionsGuard(new Reflector(), prismaZ(wiersz) as never);
    await expect(guard.canActivate(kontekst({ userId: 'op1', role: 'STAFF' }, ['NODES_MANAGE']))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('strażnik czyta konto principal przy impersonacji, a błąd bazy = brak uprawnień', async () => {
    const prisma = prismaZ(wiersz);
    const guard = new StaffPermissionsGuard(new Reflector(), prisma as never);
    await guard.canActivate(kontekst({ userId: 'klient', principalUserId: 'op1', role: 'STAFF' }, ['BILLING_MANAGE']));
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'op1' } }));

    const zepsuta = { user: { findUnique: vi.fn(async () => { throw new Error('db'); }) } };
    const g2 = new StaffPermissionsGuard(new Reflector(), zepsuta as never);
    await expect(g2.canActivate(kontekst({ userId: 'op1', role: 'STAFF' }, ['BILLING_MANAGE']))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
