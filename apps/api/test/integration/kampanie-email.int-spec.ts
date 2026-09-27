import { AuditService } from '../../src/common/audit/audit.service.js';
import { EmailMarketingService } from '../../src/email-marketing/email-marketing.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * X-04 — wysyłka kampanii e-mail marketingu na prawdziwej bazie: paczki po 100 odbiorców,
 * wypisy w trakcie wysyłki (ludzie klikają „wypisz” z pierwszych maili, zanim wyjdą kolejne)
 * i dwa nakładające się przebiegi dyspozytora. Poczta jest atrapą, która liczy wiadomości.
 */
const wyslane: string[] = [];
let opoznienieMs = 0;
const mailer = {
  send: async (m: { to: string }) => {
    await new Promise((r) => setTimeout(r, opoznienieMs));
    wyslane.push(m.to);
    return { delivered: true };
  },
};
const serwis = () => {
  const p = prisma() as never;
  return new EmailMarketingService(p, new AuditService(p), mailer as never, { get: () => undefined } as never, { isCordoned: async () => false, recordSends: async () => undefined, assertNotCordoned: async () => undefined } as never);
};

async function kampania(odbiorcow: number) {
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const u = await prisma().user.create({ data: { email: `emm-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
  const sub = await prisma().subscription.create({ data: { userId: u.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'ACTIVE' } });
  const list = await prisma().emmList.create({ data: { subscriptionId: sub.id, userId: u.id, name: 'Klienci', doubleOptIn: false } as never });
  for (let i = 0; i < odbiorcow; i++) {
    await prisma().emmContact.create({
      data: { listId: list.id, email: `o${String(i).padStart(3, '0')}@example.com`, status: 'SUBSCRIBED', unsubToken: `u-${list.id}-${i}` } as never,
    });
  }
  const c = await prisma().emmCampaign.create({
    data: { subscriptionId: sub.id, userId: u.id, listId: list.id, name: 'Jesień', subject: 'Nowości', bodyMarkdown: 'Treść', status: 'SENDING', startedAt: new Date(), recipientCount: odbiorcow, cursorOffset: 0 } as never,
  });
  return { c, list };
}

describe('X-04 kampanie e-mail', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    wyslane.length = 0;
    opoznienieMs = 0;
  });
  afterAll(rozlacz);

  it('wypisy z pierwszej paczki w trakcie wysyłki nie gubią odbiorców z następnej', async () => {
    const { c, list } = await kampania(105);
    const s = serwis();
    await s.sendNextBatch(c.id);
    expect(wyslane).toHaveLength(100);
    // Trzech odbiorców z pierwszej paczki klika „wypisz”.
    const pierwsi = await prisma().emmContact.findMany({ where: { listId: list.id }, orderBy: { id: 'asc' }, take: 3 });
    await prisma().emmContact.updateMany({ where: { id: { in: pierwsi.map((x) => x.id) } }, data: { status: 'UNSUBSCRIBED' } as never });
    while (!(await s.sendNextBatch(c.id)).done) { /* kolejne paczki */ }
    expect(new Set(wyslane).size).toBe(105);
    expect(wyslane).toHaveLength(105);
    expect((await prisma().emmCampaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('SENT');
  });

  it('dwa nakładające się przebiegi dyspozytora: każdy odbiorca dostaje jedną wiadomość', async () => {
    const { c } = await kampania(20);
    opoznienieMs = 5;
    const s = serwis();
    await Promise.all([s.sendNextBatch(c.id), s.sendNextBatch(c.id)]);
    expect(wyslane).toHaveLength(20);
    expect(await prisma().emmSend.count({ where: { campaignId: c.id } })).toBe(20);
  });
});
