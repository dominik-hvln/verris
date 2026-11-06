import * as bcrypt from 'bcrypt';
import { AuthService, KOMUNIKAT_REJESTRACJI } from './auth.service.js';

/**
 * Paczka 109 — A1-07 (rejestracja i zmiana adresu nie zdradzają, że konto istnieje) i P5-09 (drugie kliknięcie
 * w link potwierdzający: „już potwierdzony”, nie „nieprawidłowy lub wygasł”).
 * Na starym kodzie: 409 „Email already exists”, 400 „Ten adres e-mail jest już używany.”, 400 przy drugim kliknięciu.
 */
const HASLO = 'Poprawne-Haslo-2026!';

function zbuduj(opts: { istniejacy?: Record<string, unknown> | null; token?: Record<string, unknown> | null } = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn(async (a: { where: { email?: string; id?: string } }) => {
        if (a.where.id) return { id: 'ja', email: 'ja@firma.pl', firstName: 'Ja', passwordHash: HASH, role: 'USER' };
        return opts.istniejacy ?? null;
      }),
      update: vi.fn(() => 'update'),
    },
    userAuthToken: {
      findUnique: vi.fn(async () => opts.token ?? null),
      updateMany: vi.fn(() => 'burn'),
      create: vi.fn(() => 'create'),
      update: vi.fn(() => 'use'),
    },
    $transaction: vi.fn(async (ops: unknown) => ops),
  };
  const mailer = { send: vi.fn(async () => undefined) };
  const audit = { record: vi.fn(async () => undefined) };
  const pwned = { assertNotPwned: vi.fn(async () => undefined) };
  const config = { get: vi.fn(() => 'https://panel.test') };
  const n = {} as never;
  const svc = new AuthService(prisma as never, n, n, n, n, n, audit as never, n, mailer as never, config as never, n, n, pwned as never);
  return { svc, prisma, mailer, pwned };
}
let HASH: string;
beforeAll(async () => {
  HASH = await bcrypt.hash(HASLO, 4);
});
const czekaj = () => new Promise((r) => setTimeout(r, 0));

describe('A1-07 – rejestracja na zajęty adres', () => {
  it('potwierdzone konto: odpowiedź jak przy sukcesie, mail „ten adres ma już konto”, bez nowego konta; HIBP sprawdzone tak samo', async () => {
    const { svc, prisma, mailer, pwned } = zbuduj({ istniejacy: { id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', role: 'USER', emailVerifiedAt: new Date(), anonymizedAt: null } });
    const wynik = await svc.register({ email: 'jan@firma.pl', password: HASLO } as never);
    expect(wynik).toEqual({ ok: true, email: 'jan@firma.pl', message: KOMUNIKAT_REJESTRACJI });
    expect(pwned.assertNotPwned).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await czekaj();
    const mail = (mailer.send.mock.calls[0] as unknown as [{ to: string; tag: string; text: string }])[0];
    expect(mail).toMatchObject({ to: 'jan@firma.pl', tag: 'auth.konto-istnieje' });
    expect(mail.text).toContain('https://panel.test/forgot-password');
  });

  it('niepotwierdzone konto: zamiast „konto istnieje” – nowy link potwierdzający', async () => {
    const { svc, prisma, mailer } = zbuduj({ istniejacy: { id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', role: 'USER', emailVerifiedAt: null, anonymizedAt: null } });
    await svc.register({ email: 'jan@firma.pl', password: HASLO } as never);
    await czekaj();
    expect(prisma.userAuthToken.create).toHaveBeenCalled();
    expect((mailer.send.mock.calls[0] as unknown as [{ tag: string }])[0].tag).not.toBe('auth.konto-istnieje');
  });
});

describe('A1-07 – zmiana adresu na zajęty', () => {
  it('odpowiedź { ok: true } jak przy wolnym adresie, adres konta bez zmian, właściciel adresu dostaje mail', async () => {
    const { svc, prisma, mailer } = zbuduj({ istniejacy: { id: 'u2', email: 'zajety@firma.pl', firstName: null, role: 'USER', emailVerifiedAt: new Date(), anonymizedAt: null } });
    await expect(svc.requestEmailChange('ja', 'Zajety@Firma.pl', HASLO)).resolves.toEqual({ ok: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await czekaj();
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'zajety@firma.pl', tag: 'auth.konto-istnieje' }));
  });
});

describe('P5-09 – link potwierdzający e-mail drugi raz', () => {
  const token = (extra: Record<string, unknown>) => ({
    id: 't1', userId: 'u1', purpose: 'EMAIL_VERIFICATION', usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    user: { id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', emailVerifiedAt: new Date(), anonymizedAt: null, role: 'USER' },
    ...extra,
  });

  it('adres już potwierdzony → { ok, juzPotwierdzony }, bez zapisu', async () => {
    const { svc, prisma } = zbuduj({ token: token({}) });
    await expect(svc.confirmEmailVerification({ token: 'abc' })).resolves.toEqual({ ok: true, juzPotwierdzony: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('nieznany token albo zużyty bez potwierdzenia – dalej błąd', async () => {
    await expect(zbuduj({ token: null }).svc.confirmEmailVerification({ token: 'x' })).rejects.toThrow(/nieprawidłowy lub wygasł/);
    const zuzyty = token({ user: { id: 'u1', email: 'j', firstName: null, emailVerifiedAt: null, anonymizedAt: null, role: 'USER' } });
    await expect(zbuduj({ token: zuzyty }).svc.confirmEmailVerification({ token: 'x' })).rejects.toThrow(/nieprawidłowy lub wygasł/);
  });
});
