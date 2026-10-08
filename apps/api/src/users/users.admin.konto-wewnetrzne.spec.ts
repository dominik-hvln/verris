import { ForbiddenException } from '@nestjs/common';
import { UsersAdminService } from './users.admin.service.js';
import { UsersAdminController } from './users.admin.controller.js';

/**
 * PB-47 (decyzja 08.10) — konto wewnętrzne wypada z MRR i churnu: zmienić flagę może ADMIN albo STAFF
 * z CUSTOMERS_INTERNAL_FLAG. Bez uprawnienia 403 z kodem WYMAGA_WNIOSKU; pozostałe pola bez zmian.
 */
function zbuduj(opts: { wewnetrzne?: boolean; uprawnienia?: string[] } = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn(async (args: { select?: Record<string, unknown> }) => {
        if (args.select?.staffRoleAssignments) {
          return { staffRole: { id: 'r', name: 'R', permissions: opts.uprawnienia ?? [] }, staffRoleAssignments: [] };
        }
        return { id: 'k1', role: 'USER', anonymizedAt: null, isInternal: opts.wewnetrzne ?? false, email: 'k@x.pl' };
      }),
      update: vi.fn(async () => ({})),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const svc = new UsersAdminService(prisma as never, {} as never, audit as never, {} as never, {} as never, {} as never, {} as never);
  return { svc, prisma, audit };
}

const STAFF = { role: 'STAFF', userId: 'op1' };
const ADMIN = { role: 'ADMIN', userId: 'adm' };

describe('PB-47 — zmiana flagi „konto wewnętrzne”', () => {
  it('STAFF bez CUSTOMERS_INTERNAL_FLAG → 403 z kodem WYMAGA_WNIOSKU, nic nie zapisano', async () => {
    const { svc, prisma } = zbuduj({ uprawnienia: ['CUSTOMERS_MANAGE'] });
    const blad = await svc.patchCustomerOperational('k1', 'op1', { isInternal: true }, {}, STAFF).catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(ForbiddenException);
    expect((blad as ForbiddenException).getResponse()).toMatchObject({ code: 'WYMAGA_WNIOSKU', operacja: 'CUSTOMER_INTERNAL_FLAG' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('STAFF z CUSTOMERS_INTERNAL_FLAG zmienia flagę (wpis w dzienniku)', async () => {
    const { svc, prisma, audit } = zbuduj({ uprawnienia: ['CUSTOMERS_MANAGE', 'CUSTOMERS_INTERNAL_FLAG'] });
    await svc.patchCustomerOperational('k1', 'op1', { isInternal: true }, {}, STAFF);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { isInternal: true } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADMIN_CUSTOMER_INTERNAL_FLAG_UPDATED', userId: 'k1', actorUserId: 'op1' }));
  });

  it('ADMIN zmienia flagę bez sprawdzania ról', async () => {
    const { svc, prisma } = zbuduj({ wewnetrzne: true });
    await svc.patchCustomerOperational('k1', 'adm', { isInternal: false }, {}, ADMIN);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { isInternal: false } });
  });

  it('STAFF bez uprawnienia: niezmieniona flaga w formularzu i inne pola przechodzą', async () => {
    const { svc, prisma } = zbuduj({ wewnetrzne: true, uprawnienia: ['CUSTOMERS_MANAGE'] });
    await svc.patchCustomerOperational('k1', 'op1', { isInternal: true, loginBlocked: true, adminInternalNote: 'n' }, {}, STAFF);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'k1' },
      data: { loginBlocked: true, adminInternalNote: 'n' },
    });
  });

  it('STAFF bez uprawnienia, sama niezmieniona flaga: bez zapisu i bez wpisu o zmianie flagi (nie cofa równoczesnej decyzji L4)', async () => {
    const { svc, prisma, audit } = zbuduj({ wewnetrzne: false, uprawnienia: ['CUSTOMERS_MANAGE'] });
    await expect(svc.patchCustomerOperational('k1', 'op1', { isInternal: false }, {}, STAFF)).resolves.toEqual({ ok: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  /**
   * Strażnik scalenia z PB-46 (gałąź pb46 ma w kontrolerze „isInternal tylko ADMIN” bez kodu WYMAGA_WNIOSKU).
   * Decyzja 08.10: reguła jest w serwisie (sprawdzZmianeKontaWewnetrznego) — kontroler przekazuje STAFF dalej.
   */
  it('kontroler nie odrzuca STAFF z flagą sam — przekazuje decyzję serwisowi razem z aktorem', async () => {
    const admin = { patchCustomerOperational: vi.fn(async () => ({ ok: true })) };
    const ctrl = new UsersAdminController(admin as never, {} as never, {} as never);
    const req = { ip: '10.0.0.1', headers: {} } as never;
    await ctrl.patchOperational({ userId: 'op1', role: 'STAFF' } as never, 'k1', { isInternal: true } as never, req);
    expect(admin.patchCustomerOperational).toHaveBeenCalledWith('k1', 'op1', { isInternal: true }, expect.anything(), {
      role: 'STAFF',
      userId: 'op1',
    });
  });
});
