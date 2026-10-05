import { ServiceUnavailableException } from '@nestjs/common';
import { EmailMarketingService } from './email-marketing.service.js';

/**
 * Q-05 — e-mail marketing bez osobnego transportu (EMM_SMTP_URL) nie wysyła nic: ani kampanii,
 * ani potwierdzeń zapisu. Klient dostaje jasną odmowę, admin powód w dzienniku zdarzeń.
 * Z transportem każda wiadomość kampanii niesie `transport: 'EMM'` i link wypisu.
 */
function stanowisko(transport: boolean) {
  const campaign = {
    id: 'c1', subscriptionId: 's1', userId: 'u1', listId: 'l1', status: 'DRAFT', subject: 'Nowości',
    bodyMarkdown: 'Treść', ctaLabel: null, ctaUrl: null, cursorOffset: 0, createdAt: new Date(),
    list: { id: 'l1', name: 'Klienci', fromName: null, replyTo: null },
  };
  const prisma = {
    subscription: {
      findUnique: vi.fn(async () => ({ id: 's1', userId: 'u1', status: 'ACTIVE', plan: { productKind: 'EMAIL_MARKETING', emmMaxContacts: 1000, emmMonthlySends: 5000 } })),
    },
    emmList: { findUnique: vi.fn(async () => ({ id: 'l1', subscriptionId: 's1', userId: 'u1', name: 'Klienci', doubleOptIn: true })) },
    emmContact: {
      count: vi.fn(async () => 3),
      findFirst: vi.fn(async () => null),
      create: vi.fn(),
      findMany: vi.fn(async () => [{ id: 'k1', email: 'a@example.com', firstName: null, unsubToken: 'un_1' }]),
    },
    emmCampaign: {
      findUnique: vi.fn(async () => campaign),
      update: vi.fn(async () => ({ ...campaign, status: 'SENDING' })),
    },
    emmSend: { count: vi.fn(async () => 0), create: vi.fn(async () => ({ id: 'w1' })), update: vi.fn() },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const mailer = { emmTransportConfigured: () => transport, send: vi.fn(async () => ({ delivered: true })) };
  const outbound = { assertNotCordoned: async () => undefined, isCordoned: async () => false, recordSends: async () => undefined };
  const svc = new EmailMarketingService(prisma as never, audit as never, mailer as never, { get: () => undefined } as never, outbound as never);
  return { svc, prisma, audit, mailer, campaign };
}

describe('Q-05 — e-mail marketing tylko przez własny transport', () => {
  it('bez transportu: kampania zostaje roboczą, klient dostaje polski komunikat, admin powód w dzienniku', async () => {
    const s = stanowisko(false);
    const blad = await s.svc.sendCampaign('u1', 's1', 'c1').catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(ServiceUnavailableException);
    expect((blad as Error).message).toMatch(/^Wysyłka kampanii jest chwilowo niedostępna/);
    expect(s.prisma.emmCampaign.update).not.toHaveBeenCalled();
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMM_TRANSPORT_UNAVAILABLE', userId: 'u1' }));
  });

  it('bez transportu: kontakt na liście z double opt-in nie powstaje (nie zawiśnie jako oczekujący)', async () => {
    const s = stanowisko(false);
    await expect(s.svc.addContact('u1', 's1', 'l1', { email: 'nowy@example.com' } as never)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(s.prisma.emmContact.create).not.toHaveBeenCalled();
    expect(s.mailer.send).not.toHaveBeenCalled();
  });

  it('bez transportu: trwająca kampania wstrzymana przed zapisem wysyłek — nikt nie jest oznaczony jako wysłany', async () => {
    const s = stanowisko(false);
    s.campaign.status = 'SENDING';
    expect(await s.svc.sendNextBatch('c1')).toEqual({ done: true, processed: 0 });
    expect(s.prisma.emmSend.create).not.toHaveBeenCalled();
    expect(s.mailer.send).not.toHaveBeenCalled();
  });

  it('z transportem: wiadomość kampanii idzie kanałem EMM, z linkiem wypisu', async () => {
    const s = stanowisko(true);
    s.campaign.status = 'SENDING';
    await s.svc.sendNextBatch('c1');
    expect(s.mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        transport: 'EMM',
        category: 'MARKETING',
        listUnsubscribeUrl: expect.stringContaining('/emm/unsubscribe?token=un_1'),
      }),
    );
  });

  it('zawieszona usługa: trwająca kampania czeka, nic nie wychodzi', async () => {
    const s = stanowisko(true);
    s.campaign.status = 'SENDING';
    s.prisma.subscription.findUnique.mockResolvedValueOnce({ id: 's1', userId: 'u1', status: 'SUSPENDED', plan: { productKind: 'EMAIL_MARKETING', emmMaxContacts: 1000, emmMonthlySends: 5000 } });
    expect(await s.svc.sendNextBatch('c1')).toEqual({ done: true, processed: 0 });
    expect(s.mailer.send).not.toHaveBeenCalled();
  });
});
