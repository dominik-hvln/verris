import { EcoBadgeService, ECO_BADGE_MAX_PUNKTOW_DZIENNIE, kluczSieci } from './eco-badge.service.js';

/** Audyt bezpieczeństwa 13.10: punkty EKO z piksela nie mogą rosnąć bez końca od liczby adresów IP. */
describe('EcoBadge — nadużycia piksela', () => {
  it('deduplikacja po sieci: ten sam /24 i /64 to jeden klucz', () => {
    expect(kluczSieci('1.2.3.4')).toBe(kluczSieci('1.2.3.250'));
    expect(kluczSieci('::ffff:1.2.3.4')).toBe(kluczSieci('1.2.3.9'));
    expect(kluczSieci('1.2.3.4')).not.toBe(kluczSieci('1.2.4.4'));
    expect(kluczSieci('2001:db8:1:2::1')).toBe(kluczSieci('2001:db8:1:2:ffff:ffff:ffff:ffff'));
    expect(kluczSieci('2001:db8::1')).toBe(kluczSieci('2001:0db8:0000:0000:1:2:3:4'));
    expect(kluczSieci('2001:db8:1:2::1')).not.toBe(kluczSieci('2001:db8:1:3::1'));
  });

  it('dzienny limit: po ECO_BADGE_MAX_PUNKTOW_DZIENNIE dzisiaj kolejne progi nie dają punktów', async () => {
    const tx = { user: { update: vi.fn() }, ecoPointsLedgerEntry: { create: vi.fn() } };
    const prisma = {
      user: { findFirst: vi.fn(async () => ({ id: 'u1', ecoBadgeImpressions: 9 })) },
      ecoBadgeImpressionDedup: { create: vi.fn(async () => ({})) },
      ecoPointsLedgerEntry: { aggregate: vi.fn(async () => ({ _sum: { delta: ECO_BADGE_MAX_PUNKTOW_DZIENNIE } })) },
      $transaction: vi.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    };
    const svc = new EcoBadgeService(
      prisma as never,
      { getClientConfig: async () => ({ ecoBadgeImpressionsPerPoint: 10 }) } as never,
      { get: () => null } as never,
    );
    svc.recordImpression('tok', { ipAddress: '5.6.7.8', userAgent: 'x' }, { source: 'pixel' });
    await vi.waitFor(() => expect(tx.user.update).toHaveBeenCalled());
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { ecoBadgeImpressions: 10 } });
    expect(tx.ecoPointsLedgerEntry.create).not.toHaveBeenCalled();
  });
});
