import { Prisma } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PartnersService } from '../../src/partners/partners.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/** „Wypłacone” i „Odrzuć” kliknięte naraz: wypłata ma jeden stan, prowizje zgodne z nim. */
describe('Wypłata partnera', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('PAID i REJECTED naraz: wygrywa jedno, prowizje nie wracają do puli przy PAID', async () => {
    const partner = await prisma().user.create({ data: { email: `par-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const admin = await prisma().user.create({ data: { email: `adm-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const w = await prisma().partnerPayout.create({ data: { partnerUserId: partner.id, method: 'BANK', amount: new Prisma.Decimal(100), bankAccount: 'PL00' } as never });
    await prisma().partnerCommission.create({ data: { partnerUserId: partner.id, dedupeKey: `k-${w.id}`, amount: new Prisma.Decimal(100), status: 'AVAILABLE', payoutId: w.id } as never });
    const p = prisma() as never;
    const s = new PartnersService(p, new AuditService(p), new WalletLedgerService(p), null as never);
    await Promise.all([
      s.adminProcessPayout(w.id, 'PAID', admin.id).catch(() => undefined),
      s.adminProcessPayout(w.id, 'REJECTED', admin.id).catch(() => undefined),
    ]);
    const po = await prisma().partnerPayout.findUniqueOrThrow({ where: { id: w.id } });
    const prowizja = await prisma().partnerCommission.findFirstOrThrow({ where: { partnerUserId: partner.id } });
    if (po.status === 'PAID') {
      expect(prowizja.payoutId).toBe(w.id);
      expect(prowizja.status).toBe('PAID');
    } else {
      expect(po.status).toBe('REJECTED');
      expect(prowizja.payoutId).toBeNull();
      expect(prowizja.status).toBe('AVAILABLE');
    }
  });
});
