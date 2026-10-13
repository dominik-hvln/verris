import { ForbiddenException } from '@nestjs/common';
import { EmailMarketingService } from './email-marketing.service.js';

/**
 * Audyt 13.10 (sendConfirmationEmail:outside-send-quota-and-cordon) — maile potwierdzające zapis (double opt-in)
 * szły na adresy podane przez klienta z pominięciem kordonu i liczników CYBER-3: import 5000 adresów = 5000 maili.
 */
function stanowisko(o: { kordon?: boolean; progPo?: number } = {}) {
  let wyslane = 0;
  const prisma = {
    subscription: {
      findUnique: vi.fn(async () => ({ id: 's1', userId: 'u1', status: 'ACTIVE', plan: { productKind: 'EMAIL_MARKETING', emmMaxContacts: 100000, emmMonthlySends: 100000 } })),
    },
    emmList: { findUnique: vi.fn(async () => ({ id: 'l1', subscriptionId: 's1', userId: 'u1', name: 'Klienci', doubleOptIn: true })) },
    emmContact: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `k-${String(data.email)}`, ...data })),
    },
  };
  const mailer = { emmTransportConfigured: () => true, send: vi.fn(async () => ({ delivered: true })) };
  let kordon = !!o.kordon;
  const outbound = {
    assertNotCordoned: vi.fn(async () => {
      if (kordon) throw new ForbiddenException('kordon');
    }),
    isCordoned: vi.fn(async () => kordon),
    recordSends: vi.fn(async () => {
      wyslane++;
      if (o.progPo !== undefined && wyslane >= o.progPo) {
        kordon = true;
        throw new ForbiddenException('próg');
      }
    }),
  };
  const svc = new EmailMarketingService(prisma as never, { record: vi.fn() } as never, mailer as never, { get: () => undefined } as never, outbound as never);
  return { svc, prisma, mailer, outbound };
}

const wiersze = (n: number) => Array.from({ length: n }, (_, i) => ({ email: `osoba${i}@example.com` }));

describe('E-mail marketing — potwierdzenia zapisu pod kordonem i licznikami CYBER-3', () => {
  it('konto pod kordonem: import i dodanie kontaktu → 403, bez maili i bez kontaktów', async () => {
    const s = stanowisko({ kordon: true });
    await expect(s.svc.importContacts('u1', 's1', 'l1', { consentConfirmed: true, rows: wiersze(3) } as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.svc.addContact('u1', 's1', 'l1', { email: 'x@example.com' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.mailer.send).not.toHaveBeenCalled();
    expect(s.prisma.emmContact.create).not.toHaveBeenCalled();
  });

  it('każde potwierdzenie liczone w CYBER-3 (source emm-confirm)', async () => {
    const s = stanowisko();
    await s.svc.importContacts('u1', 's1', 'l1', { consentConfirmed: true, rows: wiersze(4) } as never);
    expect(s.mailer.send).toHaveBeenCalledTimes(4);
    expect(s.outbound.recordSends).toHaveBeenCalledTimes(4);
    expect(s.outbound.recordSends).toHaveBeenCalledWith('u1', 1, { subscriptionId: 's1', source: 'emm-confirm' });
  });

  it('próg przekroczony w trakcie importu → kordon i koniec importu (reszta nie powstaje ani nie dostaje maila)', async () => {
    const s = stanowisko({ progPo: 3 });
    const r = await s.svc.importContacts('u1', 's1', 'l1', { consentConfirmed: true, rows: wiersze(10) } as never);
    expect(s.mailer.send).toHaveBeenCalledTimes(3);
    expect(r.added).toBe(3);
    expect(s.prisma.emmContact.create).toHaveBeenCalledTimes(3);
  });
});
