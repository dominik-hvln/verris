import { DomainExpiryReminderScheduler } from './domain-expiry-reminder.scheduler.js';

/** Przypomnienia o wygaśnięciu domeny 30/14/7 dni (obietnica z verris.pl). */
function stanowisko(o: { domeny?: unknown[]; bylo?: boolean; cenaBlad?: boolean } = {}) {
  const teraz = Date.UTC(2026, 8, 25, 9, 5);
  const domena = {
    id: 'd1',
    name: 'firma.pl',
    userId: 'u1',
    expiresAt: new Date(teraz + 14 * 24 * 3600 * 1000 + 3600 * 1000),
    user: { email: 'k@firma.pl', firstName: 'Ala', anonymizedAt: null },
  };
  const prisma = {
    domain: { findMany: vi.fn(async () => o.domeny ?? [domena]) },
    auditLog: { findFirst: vi.fn(async () => (o.bylo ? { id: 'a' } : null)) },
  };
  const mailer = { send: vi.fn(async () => undefined) };
  const audit = { record: vi.fn(async () => undefined) };
  const registrar = {
    renewQuote: vi.fn(async () => {
      if (o.cenaBlad) throw new Error('rejestrator wyłączony');
      return { priceAmount: '59', currency: 'PLN' };
    }),
  };
  const svc = new DomainExpiryReminderScheduler(prisma as never, mailer as never, audit as never, { get: () => undefined } as never, registrar as never);
  return { svc, prisma, mailer, audit, teraz, domena };
}
const okno14 = { window: 'T_MINUS_14' as const, dni: 14, akcja: 'DOMAIN_EXPIRY_REMINDER_T14' };

describe('DomainExpiryReminderScheduler', () => {
  it('wysyła jeden mail z ceną odnowienia i zapisuje termin w dzienniku', async () => {
    const s = stanowisko();
    await expect(s.svc.okno(okno14, s.teraz)).resolves.toBe(1);
    const where = (s.prisma.domain.findMany.mock.calls[0] as unknown as [{ where: { status: string; expiresAt: { gte: Date; lt: Date } } }])[0].where;
    expect(where.status).toBe('ACTIVE');
    expect(where.expiresAt.lt.getTime() - where.expiresAt.gte.getTime()).toBe(24 * 3600 * 1000);
    const mail = (s.mailer.send.mock.calls[0] as unknown as [{ subject: string; text: string; tag: string }])[0];
    expect(mail.subject).toContain('firma.pl wygasa za 14 dni');
    expect(mail.text).toContain('59,00 zł / rok');
    expect(mail.text).not.toMatch(/automatyczne odnawianie/i);
    expect(mail.tag).toBe('hosting.domain-expiry-reminder.t14');
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DOMAIN_EXPIRY_REMINDER_T14', details: { domain: 'firma.pl', terminIso: s.domena.expiresAt.toISOString() } }),
    );
  });

  it('nie powtarza maila dla tego samego terminu', async () => {
    const s = stanowisko({ bylo: true });
    await expect(s.svc.okno(okno14, s.teraz)).resolves.toBe(0);
    expect(s.mailer.send).not.toHaveBeenCalled();
  });

  it('bez rejestratora cena „w panelu”; konto zanonimizowane — bez maila', async () => {
    const s = stanowisko({ cenaBlad: true });
    await s.svc.okno(okno14, s.teraz);
    expect((s.mailer.send.mock.calls[0] as unknown as [{ text: string }])[0].text).toContain('aktualna cena w panelu');
    const a = stanowisko({ domeny: [{ ...stanowisko().domena, user: { email: 'x@y.pl', firstName: null, anonymizedAt: new Date() } }] });
    await expect(a.svc.okno(okno14, a.teraz)).resolves.toBe(0);
  });
});
