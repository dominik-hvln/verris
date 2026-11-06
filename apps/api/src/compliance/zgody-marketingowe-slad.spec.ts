import { MarketingPreferencesService } from './marketing-preferences.service.js';

/**
 * A2-14 (paczka 109) — włączenie „Nowości” albo „Ofert partnerskich” nie zostawiało śladu (audyt tylko przy
 * newsletterze). Na starym kodzie test pada: `audit.record` nie jest wołany dla productUpdatesEmail/partnerOffersEmail.
 */
function stanowisko(przed: Record<string, boolean>) {
  const stan = { userId: 'u1', marketingEmail: false, productUpdatesEmail: false, partnerOffersEmail: false, ...przed };
  const prisma = {
    marketingPreferences: {
      upsert: vi.fn(async () => ({ ...stan })),
      update: vi.fn(async ({ data }: { data: Record<string, boolean> }) => ({ ...stan, ...data })),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { svc: new MarketingPreferencesService(prisma as never, audit as never), audit };
}

describe('Ślad zgód marketingowych (A2-14)', () => {
  it('każda kategoria marketingu zapisuje wpis przy zmianie – z nazwą kategorii, IP i przeglądarką', async () => {
    const { svc, audit } = stanowisko({});
    await svc.update('u1', { productUpdatesEmail: true, partnerOffersEmail: true }, { ipAddress: '1.2.3.4', userAgent: 'UA' });
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MARKETING_OPT_IN', ipAddress: '1.2.3.4', details: expect.objectContaining({ kategoria: 'productUpdatesEmail' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MARKETING_OPT_IN', details: expect.objectContaining({ kategoria: 'partnerOffersEmail' }) }),
    );
  });

  it('wyłączenie → MARKETING_OPT_OUT; bez zmiany wartości i dla powiadomień o usługach – bez wpisu', async () => {
    const { svc, audit } = stanowisko({ partnerOffersEmail: true, marketingEmail: true });
    await svc.update('u1', { partnerOffersEmail: false, marketingEmail: true, autoscalingEmail: false } as never);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MARKETING_OPT_OUT', details: expect.objectContaining({ kategoria: 'partnerOffersEmail' }) }),
    );
  });
});
