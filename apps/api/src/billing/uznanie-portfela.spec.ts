import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { BillingAdminController } from './billing.admin.controller.js';

/**
 * Audyt bezpieczeństwa 13.10: POST admin/billing/wallet/credit omijał reguły korekty salda — personel uznawał
 * konta zespołu i subkonta, bez powodu, a klucz z ciała żądania szedł surowo do globalnej przestrzeni księgi.
 */
describe('Uznanie portfela przez obsługę', () => {
  function stanowisko(u: Record<string, unknown> | null, istniejacy: Record<string, unknown> | null = null) {
    const svc = Object.create(BillingService.prototype) as BillingService;
    const ledger = {
      findByIdempotencyKey: vi.fn(async () => istniejacy),
      credit: vi.fn(async () => ({ id: 'tx1', amount: { toString: () => '50', toFixed: () => '50.00' } })),
    };
    Object.assign(svc, {
      prisma: { user: { findUnique: vi.fn(async () => u) } },
      ledger,
      audit: { record: vi.fn(async () => undefined) },
      logger: { warn: vi.fn() },
      notifyAdminCredit: vi.fn(async () => undefined),
    });
    return { svc, ledger };
  }
  const klient = { role: 'USER', customerOwnerId: null, anonymizedAt: null };
  const powod = 'Rekompensata za awarię 13.10';

  it('STAFF: konto zespołu → 403, subkonto → 400, bez powodu → 400; księga nietknięta', async () => {
    for (const [u, blad, description] of [
      [{ ...klient, role: 'STAFF' }, ForbiddenException, powod],
      [{ ...klient, customerOwnerId: 'wl' }, BadRequestException, powod],
      [klient, BadRequestException, ''],
    ] as const) {
      const s = stanowisko(u);
      await expect(
        s.svc.adminCreditWallet({ userId: 'u1', amount: 50, description, actorUserId: 'op', actorRole: 'STAFF' }),
      ).rejects.toBeInstanceOf(blad);
      expect(s.ledger.credit).not.toHaveBeenCalled();
    }
  });

  it('STAFF: klient z powodem → uznanie; ADMIN bez ograniczeń roli', async () => {
    const s = stanowisko(klient);
    await s.svc.adminCreditWallet({ userId: 'u1', amount: 50, description: powod, actorUserId: 'op', actorRole: 'STAFF' });
    expect(s.ledger.credit).toHaveBeenCalledTimes(1);
    const a = stanowisko({ ...klient, role: 'STAFF' });
    await a.svc.adminCreditWallet({ userId: 'u1', amount: 50, actorUserId: 'adm', actorRole: 'ADMIN' });
    expect(a.ledger.credit).toHaveBeenCalledTimes(1);
  });

  it('klucz zajęty przez inną operację (inny klient albo kwota) → 409 bez zapisu', async () => {
    const s = stanowisko(klient, { userId: 'ktos-inny', amount: '50' });
    await expect(
      s.svc.adminCreditWallet({ userId: 'u1', amount: 50, description: powod, idempotencyKey: 'uznanie:k1', actorUserId: 'adm', actorRole: 'ADMIN' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(s.ledger.credit).not.toHaveBeenCalled();
  });

  it('trasa: klucz z ciała dostaje prefiks „uznanie:”, rola operatora idzie do serwisu', async () => {
    const billing = { adminCreditWallet: vi.fn(async () => ({})) };
    const ctl = new BillingAdminController(billing as never, {} as never);
    await ctl.creditWallet({ userId: 'u1', amount: 5, idempotencyKey: 'renewal:sub1:2026-10' } as never, { userId: 'op', role: 'STAFF' });
    expect(billing.adminCreditWallet).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'uznanie:renewal:sub1:2026-10', actorRole: 'STAFF' }));
  });

  // Przegląd paczki 42: subkonto nie dostaje uznania także od administratora; wniosek niesie rolę decydującego.
  it('ADMIN: subkonto → 400 bez zapisu', async () => {
    const s = stanowisko({ ...klient, customerOwnerId: 'wl' });
    await expect(s.svc.adminCreditWallet({ userId: 'u1', amount: 5, actorUserId: 'adm', actorRole: 'ADMIN' })).rejects.toBeInstanceOf(BadRequestException);
    expect(s.ledger.credit).not.toHaveBeenCalled();
  });
});
