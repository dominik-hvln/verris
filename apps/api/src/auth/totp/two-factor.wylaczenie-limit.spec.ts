import { HttpException } from '@nestjs/common';
import { TotpService } from './totp.service.js';
import { TwoFactorService, WYLACZENIE_2FA_MAKS_PROB } from './two-factor.service.js';

/**
 * A1-02 — wyłączenie 2FA: porażki liczone na konto, po 5 w 15 minut blokada (429) — także dla poprawnego kodu.
 * Na starym kodzie: 40 błędnych kodów → 40 × 401, a potem poprawny kod wyłączał 2FA.
 */
describe('TwoFactorService.disable – limit nieudanych prób (A1-02)', () => {
  const SEKRET = 'JBSWY3DPEHPK3PXP';
  function stanowisko() {
    const proby: Array<{ email: string; reason: string; succeeded: boolean }> = [];
    const prisma = {
      user: {
        findUnique: vi.fn(async () => ({ id: 'u1', email: 'Ala@Firma.pl', isTwoFactorEnabled: true, twoFactorSecret: 'enc', passwordHash: '$2b$10$x' })),
        update: vi.fn(async () => ({})),
      },
      loginAttempt: {
        count: vi.fn(async (a: { where: { email: string; reason: string } }) => proby.filter((p) => p.email === a.where.email && p.reason === a.where.reason && !p.succeeded).length),
        create: vi.fn(async (a: { data: { email: string; reason: string; succeeded: boolean } }) => (proby.push(a.data), a.data)),
      },
    };
    const totp = new TotpService();
    const svc = new TwoFactorService(
      prisma as never,
      { decrypt: () => SEKRET } as never,
      { record: vi.fn(async () => undefined) } as never,
      totp,
      { send: vi.fn(async () => ({})) } as never,
      { get: () => undefined } as never,
    );
    return { svc, totp, prisma, proby };
  }
  const zly = (dobry: string) => (dobry === '000000' ? '111111' : '000000');

  it('po 5 błędnych kodach kolejna próba – nawet z poprawnym kodem – dostaje 429, 2FA zostaje włączone', async () => {
    const s = stanowisko();
    const dobry = s.totp.current(SEKRET);
    for (let i = 0; i < WYLACZENIE_2FA_MAKS_PROB; i++) {
      await expect(s.svc.disable({ userId: 'u1', code: zly(dobry) })).rejects.toMatchObject({ status: 401 });
    }
    expect(s.proby).toHaveLength(WYLACZENIE_2FA_MAKS_PROB);
    expect(s.proby[0]).toMatchObject({ email: 'ala@firma.pl', reason: '2fa_disable_failed', succeeded: false });
    const blad = await s.svc.disable({ userId: 'u1', code: dobry }).catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(HttpException);
    expect((blad as HttpException).getStatus()).toBe(429);
    expect(s.prisma.user.update).not.toHaveBeenCalled();
  });

  it('poniżej limitu poprawny kod wyłącza 2FA', async () => {
    const s = stanowisko();
    const dobry = s.totp.current(SEKRET);
    await expect(s.svc.disable({ userId: 'u1', code: zly(dobry) })).rejects.toMatchObject({ status: 401 });
    await s.svc.disable({ userId: 'u1', code: dobry });
    expect(s.prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isTwoFactorEnabled: false }) }));
  });
});
