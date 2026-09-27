import { AuditService } from '../../src/common/audit/audit.service.js';
import { MarketingCampaignService } from '../../src/marketing/marketing-campaign.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — newsletter Verris do klientów (segment ze zgodą) na prawdziwej bazie: paczki odbiorców
 * i wypisy w trakcie wysyłki. Atrapa poczty zapisuje EmailLog z campaignId, tak jak prawdziwa.
 */
const wyslane: string[] = [];
const mailer = {
  send: async (m: { to: string; userId: string; campaignId: string }) => {
    wyslane.push(m.to);
    await prisma().emailLog.create({ data: { toEmail: m.to, userId: m.userId, campaignId: m.campaignId, subject: 's', status: 'SENT', category: 'MARKETING' } as never });
    return { delivered: true };
  },
};
const serwis = () => {
  const p = prisma() as never;
  return new MarketingCampaignService(p, mailer as never, new AuditService(p), { get: () => undefined } as never);
};

describe('X-04 newsletter Verris', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    wyslane.length = 0;
  });
  afterAll(rozlacz);

  it('wypisy z pierwszej paczki w trakcie wysyłki nie gubią odbiorców z następnej', async () => {
    const LICZBA = (MarketingCampaignService as unknown as { BATCH_SIZE: number }).BATCH_SIZE + 5;
    const ids: string[] = [];
    for (let i = 0; i < LICZBA; i++) {
      const u = await prisma().user.create({ data: { email: `n${String(i).padStart(3, '0')}@test.verris.pl`, passwordHash: 'x', marketingPreferences: { create: { marketingEmail: true, unsubscribeToken: `ut-${i}-${Date.now()}` } } } as never });
      ids.push(u.id);
    }
    const c = await prisma().marketingCampaign.create({ data: { name: 'Jesień', subject: 'Nowości', bodyMarkdown: 'x', segment: 'NEWSLETTER_OPT_IN', status: 'SENDING', startedAt: new Date() } });
    const s = serwis();
    await s.sendNextBatch(c.id);
    // Trzech odbiorców z pierwszej paczki wypisuje się z newslettera.
    const pierwsi = [...ids].sort().slice(0, 3);
    await prisma().marketingPreferences.updateMany({ where: { userId: { in: pierwsi } }, data: { marketingEmail: false } });
    while (!(await s.sendNextBatch(c.id)).done) { /* kolejne paczki */ }
    expect(new Set(wyslane).size).toBe(LICZBA);
    expect(wyslane).toHaveLength(LICZBA);
  });
});
