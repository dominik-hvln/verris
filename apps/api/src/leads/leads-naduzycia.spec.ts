import { Reflector } from '@nestjs/core';
import { LeadsService } from './leads.service.js';
import { LeadsPublicController } from './leads-public.controller.js';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../common/guards/rate-limit.guard.js';

/**
 * Audyt bezpieczeństwa 13.10: publiczny formularz leadów wysyłał maile Verris z tekstem nadawcy (pole „imię”)
 * na dowolny adres, bez limitu na odbiorcę.
 */
describe('Formularz leadów — nadużycia wysyłki', () => {
  function stanowisko(poprzedni: boolean) {
    const prisma = {
      siteLead: {
        findFirst: vi.fn(async () => (poprzedni ? { id: 'stary' } : null)),
        create: vi.fn(async (a: { data: object }) => ({ id: 'l1', ...a.data })),
      },
    };
    const mailer = { send: vi.fn(async (_m: { to: string; text?: string; html?: string }) => undefined) };
    const audit = { record: vi.fn(async () => undefined) };
    const svc = new LeadsService(prisma as never, mailer as never, { get: () => undefined } as never, audit as never);
    return { svc, mailer, prisma };
  }
  const doNadawcy = (m: ReturnType<typeof stanowisko>['mailer']) => m.send.mock.calls.filter((c) => c[0].to === 'ofiara@example.com');

  it('potwierdzenie kontaktu nie powtarza pola „imię”', async () => {
    const s = stanowisko(false);
    await s.svc.submit({ kind: 'CONTACT', email: 'ofiara@example.com', name: 'Twoje konto zablokowane — wejdź na zly.example' } as never, {});
    await vi.waitFor(() => expect(doNadawcy(s.mailer)).toHaveLength(1));
    const m = doNadawcy(s.mailer)[0][0];
    expect(`${m.text}${m.html}`).not.toContain('zly.example');
  });

  it('drugie zgłoszenie na ten sam adres w ciągu doby → zapisane, ale bez maila do nadawcy', async () => {
    const s = stanowisko(true);
    await expect(s.svc.submit({ kind: 'CONTACT', email: 'Ofiara@example.com' } as never, {})).resolves.toEqual({ status: 'received' });
    await expect(
      s.svc.submit({ kind: 'MIGRATION', email: 'ofiara@example.com', marketingConsent: true } as never, {}),
    ).resolves.toEqual({ status: 'pending' });
    expect(s.prisma.siteLead.create).toHaveBeenCalledTimes(2);
    await new Promise((r) => setTimeout(r, 5));
    expect(doNadawcy(s.mailer)).toHaveLength(0);
  });

  it('trasa ma limit per IP i per adres odbiorcy', () => {
    const o = new Reflector().get<RateLimitOptions>(RATE_LIMIT_KEY, LeadsPublicController.prototype.submit);
    expect(o).toMatchObject({ keyByBodyField: 'email' });
    expect(o.limit).toBeLessThanOrEqual(5);
  });

  it('kontakt z tego dnia nie blokuje maila opt-in migracji (dedup tylko w ramach rodzaju formularza)', async () => {
    const s = stanowisko(false);
    await s.svc.submit({ kind: 'MIGRATION', email: 'ofiara@example.com', marketingConsent: true } as never, {});
    expect(s.prisma.siteLead.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ kind: 'MIGRATION' }) }));
  });
});
