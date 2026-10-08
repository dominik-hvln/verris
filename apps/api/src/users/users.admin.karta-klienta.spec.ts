import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@verris/database';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { UsersAdminController } from './users.admin.controller.js';
import { UsersAdminService } from './users.admin.service.js';

/**
 * PB-46 (decyzja 08.10) — karta klienta w panelu obsługi i admina ma te same sekcje, różni się tylko
 * uprawnieniami. Notatka wewnętrzna: podgląd z CUSTOMERS_VIEW, zapis z CUSTOMERS_MANAGE; blokada logowania
 * z CUSTOMERS_MANAGE; zmiana e-maila i reset hasła — tylko ADMIN. Sprawdzamy zachowanie prawdziwych
 * strażników i to, co API oddaje operatorowi STAFF.
 */

const TARGET = {
  id: 'u1',
  email: 'anna@test.pl',
  firstName: 'Anna',
  lastName: null,
  companyName: null,
  nip: null,
  role: Role.USER,
  walletBalance: { toString: () => '0.00' },
  walletCurrency: 'PLN',
  createdAt: new Date('2026-01-10T00:00:00Z'),
  isTwoFactorEnabled: false,
  stripeCustomerId: null,
  anonymizedAt: null,
  deletionRequestedAt: null,
  loginBlocked: false,
  loginBlockedReason: null,
  adminInternalNote: 'Dzwoni zwykle po 16, woli telefon niż mail.',
  canAccessGrafana: false,
  resellerOwner: null,
  walletAutoTopup: null,
  customerOwner: null,
};

function serwis() {
  const pusto = { findMany: vi.fn(async () => []) };
  const prisma = {
    user: { findUnique: vi.fn(async () => TARGET) },
    subscription: pusto,
    ticket: pusto,
    domain: pusto,
    walletTransaction: pusto,
    invoice: pusto,
    paymentMethod: pusto,
    auditLog: pusto,
    paynowPlatnosc: pusto,
  };
  const status = { findOpenIncidentsForServers: vi.fn(async () => []) };
  return new UsersAdminService(prisma as never, {} as never, {} as never, {} as never, status as never, {} as never, {} as never);
}

describe('PB-46 profil 360° — notatka wewnętrzna', () => {
  it('STAFF dostaje notatkę (wcześniej null, choć `operational-detail` ją oddawał)', async () => {
    const p = await serwis().getCustomer360('u1', { actorUserId: 's1', actorRole: Role.STAFF });
    expect(p.user.adminInternalNote).toBe(TARGET.adminInternalNote);
  });

  it('ADMIN dostaje notatkę jak dotąd', async () => {
    const p = await serwis().getCustomer360('u1', { actorUserId: 'a1', actorRole: Role.ADMIN });
    expect(p.user.adminInternalNote).toBe(TARGET.adminInternalNote);
  });
});

type Metoda = 'customerProfile' | 'operationalDetail' | 'patchOperational' | 'runDnsTls' | 'changeEmail' | 'resetPassword';

async function wpuszcza(metoda: Metoda, role: Role, uprawnienia: string[]): Promise<boolean> {
  const reflector = new Reflector();
  const kontekst = {
    getHandler: () => UsersAdminController.prototype[metoda],
    getClass: () => UsersAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'op1', role } }) }),
  } as never;
  const prisma = { user: { findUnique: async () => ({ staffRole: { permissions: uprawnienia } }) } };
  try {
    if (!new RolesGuard(reflector).canActivate(kontekst)) return false;
    return await new StaffPermissionsGuard(reflector, prisma as never).canActivate(kontekst);
  } catch (e) {
    if (e instanceof ForbiddenException) return false;
    throw e;
  }
}

describe('PB-46 strażnicy karty klienta (zachowanie, nie metadane)', () => {
  const PODGLAD = ['CUSTOMERS_VIEW'];
  const ZARZADZANIE = ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE'];

  it.each(['customerProfile', 'operationalDetail', 'runDnsTls'] as const)(
    'STAFF z CUSTOMERS_VIEW: %s wpuszczony (podgląd notatki, diagnostyka DNS/TLS)',
    async (m) => {
      expect(await wpuszcza(m, Role.STAFF, PODGLAD)).toBe(true);
    },
  );

  it('STAFF z samym CUSTOMERS_VIEW nie zapisze notatki ani blokady (PATCH operational → 403)', async () => {
    expect(await wpuszcza('patchOperational', Role.STAFF, PODGLAD)).toBe(false);
  });

  it('STAFF z CUSTOMERS_MANAGE zapisze notatkę i blokadę', async () => {
    expect(await wpuszcza('patchOperational', Role.STAFF, ZARZADZANIE)).toBe(true);
  });

  it('STAFF bez roli nie widzi karty', async () => {
    expect(await wpuszcza('customerProfile', Role.STAFF, [])).toBe(false);
  });

  it.each(['changeEmail', 'resetPassword'] as const)('%s: STAFF nawet z CUSTOMERS_MANAGE — 403; ADMIN — tak', async (m) => {
    expect(await wpuszcza(m, Role.STAFF, ZARZADZANIE)).toBe(false);
    expect(await wpuszcza(m, Role.ADMIN, [])).toBe(true);
  });
});

describe('PB-46 PATCH operational — blokada, notatka i flaga konta wewnętrznego', () => {
  function kontroler() {
    const admin = { patchCustomerOperational: vi.fn(async () => ({ ok: true })) };
    const c = new UsersAdminController(admin as never, {} as never, {} as never);
    return { c, admin };
  }
  const req = { headers: {}, ip: '127.0.0.1', socket: {} } as never;
  const staff = { userId: 's1', email: 's@verris.pl', role: Role.STAFF };

  it('flagę „konto wewnętrzne” od STAFF rozstrzyga serwis wg uprawnień (PB-47: CUSTOMERS_INTERNAL_FLAG, inaczej 403 WYMAGA_WNIOSKU) — kontroler przekazuje aktora', async () => {
    const { c, admin } = kontroler();
    await c.patchOperational(staff, 'u1', { loginBlocked: true, isInternal: true }, req);
    expect(admin.patchCustomerOperational).toHaveBeenCalledWith(
      'u1',
      's1',
      { loginBlocked: true, isInternal: true },
      expect.any(Object),
      { role: Role.STAFF, userId: 's1' },
    );
  });

  it('STAFF zapisze blokadę i notatkę (bez flagi konta wewnętrznego)', async () => {
    const { c, admin } = kontroler();
    await c.patchOperational(staff, 'u1', { loginBlocked: true, loginBlockedReason: 'spam', adminInternalNote: 'x' }, req);
    expect(admin.patchCustomerOperational).toHaveBeenCalledWith(
      'u1',
      's1',
      { loginBlocked: true, loginBlockedReason: 'spam', adminInternalNote: 'x' },
      expect.any(Object),
      { role: Role.STAFF, userId: 's1' },
    );
  });

  it('ADMIN nadal zmienia flagę konta wewnętrznego', async () => {
    const { c, admin } = kontroler();
    await c.patchOperational({ userId: 'a1', email: 'a@verris.pl', role: Role.ADMIN }, 'u1', { isInternal: true }, req);
    expect(admin.patchCustomerOperational).toHaveBeenCalledTimes(1);
  });
});
