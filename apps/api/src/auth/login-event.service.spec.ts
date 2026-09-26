import { LoginEventService } from './login-event.service.js';

/** G-22 — powiadomienie o logowaniu z nowego urządzenia. */
function zbuduj(opts: { wczesniej: number; znane: boolean; alerty?: boolean | null }) {
  const prisma = {
    loginEvent: {
      count: vi.fn(async () => opts.wczesniej),
      findFirst: vi.fn(async () => (opts.znane ? { id: 'e0' } : null)),
      create: vi.fn(async () => ({})),
    },
    marketingPreferences: {
      findUnique: vi.fn(async () => (opts.alerty === undefined || opts.alerty === null ? null : { loginAlertsEmail: opts.alerty })),
    },
  };
  const mailer = { send: vi.fn(async () => undefined) };
  const config = { get: vi.fn(() => 'https://panel.test') };
  const svc = new LoginEventService(prisma as never, mailer as never, config as never);
  const zaloguj = () =>
    svc.record({ userId: 'u1', email: 'jan@firma.pl', firstName: 'Jan', ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Chrome/120.0 Safari/537', loginMethod: 'password' });
  return { prisma, mailer, zaloguj };
}
const poczekaj = () => new Promise((r) => setImmediate(r));

describe('LoginEventService — G-22', () => {
  it('nowe urządzenie po wcześniejszych logowaniach → mail bezpieczeństwa', async () => {
    const { mailer, prisma, zaloguj } = zbuduj({ wczesniej: 3, znane: false });
    await zaloguj();
    await poczekaj();
    expect(prisma.loginEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isNewDevice: true }) }));
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'jan@firma.pl', fromRole: 'SECURITY' }));
  });

  it('znane urządzenie, pierwsze logowanie po rejestracji albo wyłączone alerty → bez maila', async () => {
    for (const o of [{ wczesniej: 3, znane: true }, { wczesniej: 0, znane: false }, { wczesniej: 3, znane: false, alerty: false }]) {
      const { mailer, zaloguj } = zbuduj(o);
      await zaloguj();
      await poczekaj();
      expect(mailer.send).not.toHaveBeenCalled();
    }
  });

  it('to samo urządzenie w tej samej sieci /24 daje ten sam odcisk (bez fałszywych alarmów po zmianie IP w sieci)', () => {
    const svc = new LoginEventService({} as never, {} as never, {} as never) as unknown as { computeFingerprint(ip: string, ua: string): string };
    expect(svc.computeFingerprint('203.0.113.7', 'UA')).toBe(svc.computeFingerprint('203.0.113.200', 'UA'));
    expect(svc.computeFingerprint('203.0.113.7', 'UA')).not.toBe(svc.computeFingerprint('198.51.100.7', 'UA'));
  });
});
