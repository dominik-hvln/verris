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

function serwis(audit: { record: ReturnType<typeof vi.fn> } = { record: vi.fn(async () => undefined) }, cel: typeof TARGET | Record<string, unknown> = TARGET) {
  const pusto = { findMany: vi.fn(async () => []) };
  const prisma = {
    user: { findUnique: vi.fn(async () => cel) },
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
  return new UsersAdminService(prisma as never, {} as never, audit as never, {} as never, status as never, {} as never, {} as never);
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

describe('decyzja 08.10 — otwarcie karty klienta przez operatora w dzienniku', () => {
  it('STAFF otwiera kartę → wpis OPERATOR_CUSTOMER_CARD_VIEWED (klient = userId, operator = actor, zakładka)', async () => {
    const audit = { record: vi.fn(async () => undefined) };
    await serwis(audit).getCustomer360('u1', { actorUserId: 's1', actorRole: Role.STAFF, sekcja: 'rozliczenia' });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'OPERATOR_CUSTOMER_CARD_VIEWED',
      userId: 'u1',
      actorUserId: 's1',
      details: { sekcja: 'rozliczenia' },
    });
  });

  it('zakładka „Dziennik” na karcie nie liczy otwarć karty do 40 ostatnich zdarzeń', async () => {
    const svc = serwis();
    await svc.getCustomer360('u1', { actorUserId: 's1', actorRole: Role.STAFF });
    const prisma = (svc as unknown as { prisma: { auditLog: { findMany: ReturnType<typeof vi.fn> } } }).prisma;
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', action: { not: 'OPERATOR_CUSTOMER_CARD_VIEWED' } } }),
    );
  });

  it('ADMIN też zostawia wpis (każdy operator)', async () => {
    const audit = { record: vi.fn(async () => undefined) };
    await serwis(audit).getCustomer360('u1', { actorUserId: 'a1', actorRole: Role.ADMIN });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'OPERATOR_CUSTOMER_CARD_VIEWED', actorUserId: 'a1', details: {} }));
  });

  it('odmowa (STAFF na koncie nie-klienta) nie jest otwarciem — brak wpisu', async () => {
    const audit = { record: vi.fn(async () => undefined) };
    await expect(
      serwis(audit, { ...TARGET, role: Role.STAFF }).getCustomer360('u1', { actorUserId: 's1', actorRole: Role.STAFF }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('kontroler przekazuje do dziennika tylko krótki identyfikator zakładki', async () => {
    const admin = { getCustomer360: vi.fn(async () => ({})) };
    const c = new UsersAdminController(admin as never, {} as never, {} as never);
    const op = { userId: 's1', email: 's@verris.pl', role: Role.STAFF };
    await c.customerProfile(op as never, 'u1', 'uslugi');
    await c.customerProfile(op as never, 'u1', 'x<script>');
    await c.customerProfile(op as never, 'u1');
    expect(admin.getCustomer360.mock.calls.map((a) => (a as unknown[])[1])).toEqual([
      { actorUserId: 's1', actorRole: Role.STAFF, sekcja: 'uslugi' },
      { actorUserId: 's1', actorRole: Role.STAFF, sekcja: undefined },
      { actorUserId: 's1', actorRole: Role.STAFF, sekcja: undefined },
    ]);
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

describe('Fala 1B — „Kto oglądał” (staff-audit) z adresem operatora', () => {
  it('wiersz ma actorEmail operatora, który otworzył kartę', async () => {
    const wpis = { id: 'l1', action: 'OPERATOR_CUSTOMER_CARD_VIEWED', ipAddress: null, userAgent: null, actorUserId: 'op1', impersonatedBy: null, details: { sekcja: 'dziennik' }, createdAt: new Date('2026-10-10T08:00:00Z') };
    const prisma = {
      user: {
        findUnique: vi.fn(async () => ({ id: 'u1', email: 'anna@test.pl', role: Role.USER })),
        findMany: vi.fn(async () => [{ id: 'op1', email: 'ola@verris.pl' }]),
      },
      auditLog: { findMany: vi.fn(async () => [wpis]) },
    };
    const s = new UsersAdminService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const r = await s.getCustomerAuditTrail({ targetUserId: 'u1', actorUserId: 'a1', actorRole: Role.ADMIN, limit: 200 });
    expect(r.rows[0]).toMatchObject({ action: 'OPERATOR_CUSTOMER_CARD_VIEWED', actorUserId: 'op1', actorEmail: 'ola@verris.pl' });
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ['op1'] } }, select: { id: true, email: true } });
  });
});
