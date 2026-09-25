import { TotpService } from './totp.service';
import { TwoFactorService } from './two-factor.service';

/** Kod TOTP jest jednorazowy: ten sam (albo starszy) krok nie zaloguje drugi raz. */
describe('TwoFactorService.verifyCodeForLogin — ochrona przed ponownym użyciem kodu', () => {
  const SEKRET = 'JBSWY3DPEHPK3PXP';
  function stanowisko() {
    let ostatni: number | null = null;
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({ twoFactorSecret: 'enc', twoFactorRecoveryCodesEnc: null, isTwoFactorEnabled: true })),
        updateMany: jest.fn(async (a: { where: { OR: Array<{ twoFactorLastStep: null | { lt: number } }> }; data: { twoFactorLastStep: number } }) => {
          const krok = a.data.twoFactorLastStep;
          if (ostatni !== null && ostatni >= krok) return { count: 0 };
          ostatni = krok;
          return { count: 1 };
        }),
      },
    };
    const totp = new TotpService();
    const svc = new TwoFactorService(prisma as never, { decrypt: () => SEKRET } as never, {} as never, totp, {} as never, {} as never);
    return { svc, totp, prisma };
  }

  it('pierwsze użycie → OK, ponowne tym samym kodem → odmowa', async () => {
    const s = stanowisko();
    const kod = s.totp.current(SEKRET);
    await expect(s.svc.verifyCodeForLogin('u1', kod)).resolves.toBe(true);
    await expect(s.svc.verifyCodeForLogin('u1', kod)).resolves.toBe(false);
    expect(s.prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'u1' }) }));
  });

  it('zły kod → odmowa bez zapisu kroku', async () => {
    const s = stanowisko();
    await expect(s.svc.verifyCodeForLogin('u1', '000000' === s.totp.current(SEKRET) ? '111111' : '000000')).resolves.toBe(false);
    expect(s.prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('matchStep zwraca krok, który pasował (±1 okno)', () => {
    const totp = new TotpService();
    const t = 1_790_000_000;
    const krok = Math.floor(t / 30);
    expect(totp.matchStep(SEKRET, totp.current(SEKRET, t), t)).toBe(krok);
    expect(totp.matchStep(SEKRET, totp.current(SEKRET, t - 30), t)).toBe(krok - 1);
    expect(totp.matchStep(SEKRET, totp.current(SEKRET, t - 90), t)).toBeNull();
  });
});
