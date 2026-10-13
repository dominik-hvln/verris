import { UnauthorizedException } from '@nestjs/common';
import { SuspiciousActivityService } from './suspicious-activity.service.js';
import { AuthService } from '../auth/auth.service.js';

/**
 * Audyt 13.10:
 *  - email-lockout-anonymous-account-denial — 10 złych haseł z dowolnego IP blokowało logowanie (i break-glass)
 *    właściciela z poprawnym hasłem; każde odrzucenie blokadą przedłużało okno.
 *  - login-2fa:no-per-account-attempt-bound — kod 2FA bez limitu prób na konto (limit tylko per IP trasy).
 */
type Proba = { email: string; ip: string | null; succeeded: boolean; reason: string; createdAt: Date };

function baza(proby: Proba[]) {
  const pasuje = (p: Proba, w: Record<string, unknown>) =>
    p.email === w.email &&
    p.succeeded === w.succeeded &&
    (w.ip === undefined || p.ip === w.ip) &&
    (typeof w.reason === 'string' ? p.reason === w.reason : !(w.reason && (w.reason as { not: string }).not === p.reason));
  return { loginAttempt: { count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => proby.filter((p) => pasuje(p, where)).length) } };
}
const teraz = () => new Date();
const zle = (n: number, ip: string, reason = 'bad_password'): Proba[] =>
  Array.from({ length: n }, () => ({ email: 'ofiara@firma.pl', ip, succeeded: false, reason, createdAt: teraz() }));

describe('Blokady logowania — źródło porażek, nie samo konto', () => {
  it('10 złych haseł z IP A nie blokuje logowania z IP B; z IP A — blokuje', async () => {
    const s = new SuspiciousActivityService(baza(zle(10, '198.51.100.1')) as never, {} as never, {} as never);
    expect(await s.isEmailLockedOut('ofiara@firma.pl', '203.0.113.7')).toBe(false);
    expect(await s.isEmailLockedOut('ofiara@firma.pl', '198.51.100.1')).toBe(true);
  });

  it('odrzucenia samą blokadą (too_many_attempts) nie liczą się do progu', async () => {
    const s = new SuspiciousActivityService(baza([...zle(5, '198.51.100.1'), ...zle(20, '198.51.100.1', 'too_many_attempts')]) as never, {} as never, {} as never);
    expect(await s.isEmailLockedOut('ofiara@firma.pl', '198.51.100.1')).toBe(false);
  });

  it('kod 2FA: 10 błędnych kodów z różnych IP blokuje kolejne próby na koncie (także starym wyzwaniem)', async () => {
    const proby = Array.from({ length: 10 }, (_, i) => zle(1, `198.51.100.${i}`, '2fa_failed')[0]);
    const s = new SuspiciousActivityService(baza(proby) as never, {} as never, {} as never);
    expect(await s.isTwoFactorLockedOut('ofiara@firma.pl')).toBe(true);

    const twoFactor = { verifyCodeForLogin: vi.fn(async () => true) };
    const jwt = { verify: vi.fn(() => ({ sub: 'u1', email: 'ofiara@firma.pl', purpose: '2fa-challenge' })) };
    const n = {} as never;
    const auth = new AuthService(n, jwt as never, twoFactor as never, s as never, n, n, n, n, n, n, n, n, n);
    await expect(auth.verifyTwoFactor({ challengeToken: 't', code: '123456' }, { ip: '203.0.113.9' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(twoFactor.verifyCodeForLogin).not.toHaveBeenCalled();
  });
});
