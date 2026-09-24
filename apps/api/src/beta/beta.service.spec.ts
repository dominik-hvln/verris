import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import { BetaService, KREDYT_TESTOW, kodTestera } from './beta.service';

/** PB-26 — zaproszenia do testów: imienny kod 150 K / 1 użycie / 14 dni, mail best-effort, lista testerów. */
function stanowisko(opts: { aktywne?: boolean; mail?: 'ok' | 'suppressed' | 'throw'; kolizje?: number } = {}) {
  let kolizje = opts.kolizje ?? 0;
  const prisma = {
    betaInvite: {
      findFirst: jest.fn(async () => (opts.aktywne ? { id: 'x' } : null)),
      create: jest.fn(async (a: { data: { promoCode: { create: { code: string } } } }) => {
        if (kolizje-- > 0) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' });
        return { id: 'i1', promoCode: { code: a.data.promoCode.create.code } };
      }),
      update: jest.fn(async () => undefined),
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => ({ id: 'i1', promoCodeId: 'p1' })),
    },
    promoCode: { update: jest.fn(async () => undefined) },
    promoRedemption: { count: jest.fn(async () => 1) },
    subscription: { groupBy: jest.fn(async () => []) },
    ticket: { findMany: jest.fn(async () => []) },
  };
  const mailer = {
    send: jest.fn(async () => {
      if (opts.mail === 'throw') throw new Error('smtp down');
      return { delivered: opts.mail !== 'suppressed' };
    }),
  };
  const config = { get: jest.fn(() => 'https://panel.verris.pl/') };
  const svc = new BetaService(prisma as never, mailer as never, config as never, { record: jest.fn(async () => undefined) } as never);
  return { svc, prisma, mailer };
}

const utworzone = (s: ReturnType<typeof stanowisko>) =>
  (s.prisma.betaInvite.create.mock.calls.at(-1) as unknown as [{ data: Record<string, unknown> & { promoCode: { create: Record<string, unknown> } } }])[0].data;

describe('BetaService', () => {
  const teraz = new Date('2026-10-20T10:00:00Z');

  it('zaproszenie: kod BETA-, 150 K, jedno użycie, 14 dni; mail z kodem i linkiem do rejestracji', async () => {
    const s = stanowisko();
    const r = await s.svc.zapros({ email: ' Jan@Firma.PL ', name: 'Jan' }, 'admin1', teraz);
    const d = utworzone(s);
    expect(d.email).toBe('jan@firma.pl');
    expect(d.promoCode.create).toMatchObject({ kind: 'FIXED_CREDIT', maxRedemptions: 1, validTo: new Date('2026-11-03T10:00:00Z') });
    expect(String(d.promoCode.create.value)).toBe(String(KREDYT_TESTOW));
    expect(r.code).toMatch(/^BETA-[A-HJ-NP-Z2-9]{6}$/);
    const mail = (s.mailer.send.mock.calls[0] as unknown as [{ to: string; html: string; text: string }])[0];
    expect(mail.to).toBe('jan@firma.pl');
    expect(mail.text).toContain(r.code);
    expect(mail.html).toContain('https://panel.verris.pl/register');
    expect(r.mailWyslany).toBe(true);
    expect(s.prisma.betaInvite.update).toHaveBeenCalled();
  });

  it('awaria poczty nie kasuje zaproszenia — kod zostaje, oznaczony jako niewysłany', async () => {
    const s = stanowisko({ mail: 'throw' });
    const r = await s.svc.zapros({ email: 'a@b.pl' }, 'admin1', teraz);
    expect(r.mailWyslany).toBe(false);
    expect(s.prisma.betaInvite.update).not.toHaveBeenCalled();
  });

  it('kolizja wylosowanego kodu → losuje ponownie', async () => {
    const s = stanowisko({ kolizje: 2 });
    await expect(s.svc.zapros({ email: 'a@b.pl' }, 'admin1', teraz)).resolves.toMatchObject({ id: 'i1' });
    expect(s.prisma.betaInvite.create).toHaveBeenCalledTimes(3);
  });

  it('drugie ważne zaproszenie dla tej samej osoby i zły adres → 400', async () => {
    await expect(stanowisko({ aktywne: true }).svc.zapros({ email: 'a@b.pl' }, 'x', teraz)).rejects.toThrow(BadRequestException);
    await expect(stanowisko().svc.zapros({ email: 'nie-mail' }, 'x', teraz)).rejects.toThrow(BadRequestException);
  });

  it('kody bez znaków mylących (0/O, 1/I)', () => {
    for (let i = 0; i < 200; i++) expect(kodTestera()).not.toMatch(/BETA-.*[01OI]/);
  });

  it('lista: stan kodu, konto testera, aktywne usługi i zgłoszenia BETA', async () => {
    const s = stanowisko();
    const kod = (over: Record<string, unknown>) => ({ code: 'BETA-AAAAAA', active: true, validTo: new Date('2026-11-01'), redemptions: [], ...over });
    s.prisma.betaInvite.findMany.mockResolvedValueOnce([
      { id: '1', email: 'a@b.pl', name: null, sentAt: new Date(), promoCode: kod({ redemptions: [{ createdAt: new Date(), user: { id: 'u1', email: 'a@b.pl' } }] }) },
      { id: '2', email: 'c@d.pl', name: null, sentAt: null, promoCode: kod({ active: false }) },
      { id: '3', email: 'e@f.pl', name: null, sentAt: null, promoCode: kod({ validTo: new Date('2026-10-01') }) },
      { id: '4', email: 'g@h.pl', name: null, sentAt: null, promoCode: kod({}) },
    ] as never);
    s.prisma.subscription.groupBy.mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 1 } }] as never);
    s.prisma.ticket.findMany.mockResolvedValueOnce([{ userId: 'u1', status: 'OPEN' }, { userId: 'u1', status: 'CLOSED' }] as never);
    const l = await s.svc.lista(teraz);
    expect(l.map((x) => x.stan)).toEqual(['UZYTY', 'WYCOFANY', 'WYGASL', 'CZEKA']);
    expect(l[0]).toMatchObject({ aktywneUslugi: 1, zgloszenia: 2, zgloszeniaOtwarte: 1, konto: { email: 'a@b.pl' } });
  });

  it('wycofanie wyłącza kod (bez kasowania historii)', async () => {
    const s = stanowisko();
    await s.svc.wycofaj('i1', 'admin1');
    expect(s.prisma.promoCode.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { active: false } });
  });
});
