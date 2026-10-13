import * as bcrypt from 'bcrypt';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TotpService } from './totp.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { AuthController } from '../auth.controller.js';

/**
 * Audyt bezpieczeństwa 13.10: kody odzyskiwania 2FA szły mailem otwartym tekstem — kto przejął skrzynkę
 * (to ona służy też do resetu hasła), miał i hasło, i drugi składnik. Kody są teraz tylko w odpowiedzi
 * (panel pokazuje je raz), a nową partię wydaje osobna trasa za hasłem + bieżącym kodem z aplikacji.
 */
describe('2FA — kody odzyskiwania tylko w panelu, nie w mailu', () => {
  const SEKRET = 'JBSWY3DPEHPK3PXP';
  const totp = new TotpService();

  async function stanowisko(over: Record<string, unknown> = {}) {
    const user: Record<string, unknown> = {
      id: 'u1',
      email: 'jan@example.com',
      firstName: 'Jan',
      passwordHash: await bcrypt.hash('haslo-poprawne', 4),
      twoFactorSecret: 'enc',
      isTwoFactorEnabled: true,
      twoFactorRecoveryCodesEnc: 'stare',
      ...over,
    };
    const prisma = {
      user: {
        findUnique: vi.fn(async () => user),
        update: vi.fn(async (a: { data: Record<string, unknown> }) => Object.assign(user, a.data)),
      },
    };
    const crypto = {
      decrypt: () => SEKRET,
      encrypt: (s: string) => `enc:${s}`,
      sha256Hex: (s: string) => `h:${s}`,
    };
    const audit = { record: vi.fn(async () => undefined) };
    const mailer = { send: vi.fn(async (_m: { html?: string; text?: string; subject?: string }) => undefined) };
    const config = { get: () => undefined };
    const svc = new TwoFactorService(prisma as never, crypto as never, audit as never, totp, mailer as never, config as never);
    return { svc, prisma, audit, mailer, user };
  }

  const tresc = (m: { html?: string; text?: string; subject?: string }) => `${m.subject}\n${m.text}\n${m.html}`;

  it('potwierdzenie 2FA: kody w odpowiedzi, ale żadnego z nich w mailu', async () => {
    const s = await stanowisko({ isTwoFactorEnabled: false, twoFactorRecoveryCodesEnc: null });
    const { recoveryCodes } = await s.svc.confirmEnrollment('u1', totp.current(SEKRET));
    expect(recoveryCodes).toHaveLength(10);
    await vi.waitFor(() => expect(s.mailer.send).toHaveBeenCalledTimes(1));
    const mail = tresc(s.mailer.send.mock.calls[0][0]);
    for (const k of recoveryCodes) expect(mail).not.toContain(k);
    expect(mail).toContain('nie wysyłamy ich e-mailem');
  });

  it('nowa partia: hasło + kod z aplikacji → nowe kody, stare unieważnione, mail bez kodów, wpis w audycie', async () => {
    const s = await stanowisko();
    const { recoveryCodes } = await s.svc.regenerateRecoveryCodes({ userId: 'u1', password: 'haslo-poprawne', code: totp.current(SEKRET) });
    expect(recoveryCodes).toHaveLength(10);
    expect(s.user.twoFactorRecoveryCodesEnc).toBe(`enc:${JSON.stringify({ remaining: recoveryCodes.map((c) => `h:${c}`) })}`);
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'TWO_FACTOR_RECOVERY_CODES_REGENERATED', userId: 'u1' }));
    await vi.waitFor(() => expect(s.mailer.send).toHaveBeenCalledTimes(1));
    const mail = tresc(s.mailer.send.mock.calls[0][0]);
    for (const k of recoveryCodes) expect(mail).not.toContain(k);
  });

  it('nowa partia: złe hasło albo zły kod → odmowa bez zmiany kodów', async () => {
    const s = await stanowisko();
    await expect(s.svc.regenerateRecoveryCodes({ userId: 'u1', password: 'zle', code: totp.current(SEKRET) })).rejects.toBeInstanceOf(UnauthorizedException);
    const zly = totp.current(SEKRET) === '000000' ? '111111' : '000000';
    await expect(s.svc.regenerateRecoveryCodes({ userId: 'u1', password: 'haslo-poprawne', code: zly })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(s.prisma.user.update).not.toHaveBeenCalled();
    expect(s.user.twoFactorRecoveryCodesEnc).toBe('stare');
  });

  it('trasa: w sesji wsparcia (impersonacja) operator nie wydaje klientowi kodów', () => {
    const twoFactor = { regenerateRecoveryCodes: vi.fn() };
    const ctl = Object.create(AuthController.prototype) as AuthController;
    (ctl as unknown as { twoFactor: unknown }).twoFactor = twoFactor;
    expect(() =>
      ctl.twoFactorRecoveryRegenerate({ userId: 'u1', impersonatedBy: 'op1' }, { password: 'x', code: '123456' }, { ip: '1.2.3.4' } as never),
    ).toThrow(ForbiddenException);
    expect(twoFactor.regenerateRecoveryCodes).not.toHaveBeenCalled();
  });
});
