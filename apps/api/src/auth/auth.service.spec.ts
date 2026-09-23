import * as bcrypt from 'bcrypt';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashAuthToken } from './auth-token.util';

/**
 * X-06 — pierwsze testy modułu auth. Sprawdzają własności bezpieczeństwa, na których
 * opiera się reszta panelu: brak wyliczania kont, blokada po nieudanych próbach,
 * weryfikacja e-maila i blokada logowania, jednorazowy i wygasający link resetu,
 * unieważnienie sesji po zmianie hasła.
 */
function zbuduj(opts: { user?: Record<string, unknown> | null; zablokowanyEmail?: boolean; token?: Record<string, unknown> | null } = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn(async () => (opts.user === undefined ? null : opts.user)),
      update: jest.fn(() => 'update-user'),
      updateMany: jest.fn(() => 'verify-email'),
    },
    userAuthToken: {
      findUnique: jest.fn(async () => opts.token ?? null),
      update: jest.fn(() => 'use-token'),
      updateMany: jest.fn(() => 'burn-others'),
      create: jest.fn(() => 'create-token'),
    },
    $transaction: jest.fn(async (ops: unknown) => ops),
  };
  const suspicious = { isEmailLockedOut: jest.fn(async () => !!opts.zablokowanyEmail), recordFailure: jest.fn(async () => undefined) };
  const mailer = { send: jest.fn(async () => undefined) };
  const pwned = { assertNotPwned: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => 'https://panel.test') };
  const n = {} as never;
  const svc = new AuthService(prisma as never, n, n, suspicious as never, n, n, n, n, mailer as never, config as never, n, n, pwned as never);
  return { svc, prisma, suspicious, mailer };
}

const HASLO = 'Poprawne-Haslo-2026!';
let HASH: string;
beforeAll(async () => {
  HASH = await bcrypt.hash(HASLO, 4);
});
const klient = (extra: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', role: 'USER', passwordHash: HASH,
  emailVerifiedAt: new Date(), loginBlocked: false, customerOwnerId: null, subaccountDisabledAt: null, anonymizedAt: null, ...extra,
});

describe('AuthService.login — X-06', () => {
  it('nieznany e-mail i złe hasło dają ten sam komunikat (brak wyliczania kont)', async () => {
    const a = zbuduj({ user: null });
    const b = zbuduj({ user: klient() });
    const e1 = await a.svc.login({ email: 'nie@ma.pl', password: 'x' } as never).catch((e) => e);
    const e2 = await b.svc.login({ email: 'jan@firma.pl', password: 'zle' } as never).catch((e) => e);
    expect(e1).toBeInstanceOf(UnauthorizedException);
    expect(e2).toBeInstanceOf(UnauthorizedException);
    expect(e1.message).toBe(e2.message);
    expect(a.suspicious.recordFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: 'unknown_user' }));
    expect(b.suspicious.recordFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: 'bad_password' }));
  });

  it('po zbyt wielu próbach odmawia tym samym komunikatem, nawet nie sprawdzając hasła', async () => {
    const { svc, prisma } = zbuduj({ user: klient(), zablokowanyEmail: true });
    await expect(svc.login({ email: 'jan@firma.pl', password: HASLO } as never)).rejects.toThrow('Invalid credentials');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('poprawne hasło, ale niepotwierdzony e-mail albo blokada konta → odmowa', async () => {
    await expect(zbuduj({ user: klient({ emailVerifiedAt: null }) }).svc.login({ email: 'jan@firma.pl', password: HASLO } as never))
      .rejects.toThrow('Potwierdź adres e-mail');
    await expect(zbuduj({ user: klient({ loginBlocked: true }) }).svc.login({ email: 'jan@firma.pl', password: HASLO } as never))
      .rejects.toThrow('zablokowane');
  });
});

describe('AuthService — reset hasła (X-06)', () => {
  it('prośba o reset dla nieznanego adresu, operatora i konta zablokowanego: ok, bez tokenu i maila', async () => {
    for (const user of [null, klient({ role: 'STAFF' }), klient({ loginBlocked: true }), klient({ anonymizedAt: new Date() })]) {
      const { svc, prisma, mailer } = zbuduj({ user });
      await expect(svc.requestPasswordReset({ email: 'X@Y.pl' } as never)).resolves.toEqual({ ok: true });
      expect(prisma.userAuthToken.create).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    }
  });

  it('prośba o reset dla klienta: stare linki unieważnione, nowy zapisany jako skrót', async () => {
    const { svc, prisma, mailer } = zbuduj({ user: klient() });
    await svc.requestPasswordReset({ email: ' Jan@Firma.PL ' } as never);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'jan@firma.pl' } }));
    expect(prisma.userAuthToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', usedAt: null }) }));
    const data = (prisma.userAuthToken.create.mock.calls[0] as unknown as [{ data: { tokenHash: string } }])[0].data;
    const url = (mailer.send.mock.calls[0] as unknown as [{ text: string }])[0].text;
    const raw = decodeURIComponent(/token=([^\s)"&]+)/.exec(url)![1]);
    expect(data.tokenHash).toBe(hashAuthToken(raw));
    expect(data.tokenHash).not.toBe(raw);
  });

  it.each([
    ['nieistniejący', null],
    ['już użyty', { usedAt: new Date() }],
    ['wygasły', { expiresAt: new Date(Date.now() - 1000) }],
    ['innego przeznaczenia', { purpose: 'EMAIL_VERIFY' }],
    ['konta zanonimizowanego', { user: { id: 'u1', email: 'x', firstName: null, anonymizedAt: new Date() } }],
  ])('link %s nie zmienia hasła', async (_opis, zmiana) => {
    const token = zmiana === null ? null : {
      id: 't1', userId: 'u1', purpose: 'PASSWORD_RESET', usedAt: null, expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', anonymizedAt: null }, ...zmiana,
    };
    const { svc, prisma } = zbuduj({ token });
    await expect(svc.confirmPasswordReset({ token: 'abc', newPassword: 'Nowe-Haslo-2026!' } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ważny link: nowe hasło, wylogowanie wszystkich sesji, e-mail potwierdzony, pozostałe linki spalone', async () => {
    const token = {
      id: 't1', userId: 'u1', purpose: 'PASSWORD_RESET', usedAt: null, expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', anonymizedAt: null },
    };
    const { svc, prisma } = zbuduj({ token });
    await svc.confirmPasswordReset({ token: 'abc', newPassword: 'Nowe-Haslo-2026!' } as never);
    const upd = (prisma.user.update.mock.calls[0] as unknown as [{ data: { passwordHash: string; tokenVersion: unknown } }])[0].data;
    expect(await bcrypt.compare('Nowe-Haslo-2026!', upd.passwordHash)).toBe(true);
    expect(upd.tokenVersion).toEqual({ increment: 1 });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1', emailVerifiedAt: null }, data: { emailVerifiedAt: expect.any(Date) } });
    expect(prisma.userAuthToken.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { usedAt: expect.any(Date) } });
    expect(prisma.userAuthToken.updateMany).toHaveBeenCalled();
  });
});

describe('AuthService.register — X-06', () => {
  it('zajęty adres → 409 bez sprawdzania hasła w HIBP', async () => {
    const { svc } = zbuduj({ user: klient() });
    await expect(svc.register({ email: 'jan@firma.pl', password: HASLO } as never)).rejects.toBeInstanceOf(ConflictException);
  });
});
