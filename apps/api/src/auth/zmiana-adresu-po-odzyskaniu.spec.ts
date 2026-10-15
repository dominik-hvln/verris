import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { UsersAdminService } from '../users/users.admin.service.js';

/**
 * Audyt 13.10 (auth:recovery:pending-email-change-survives-password-reset) — napastnik z przejętą sesją zleca zmianę
 * adresu; właściciel resetuje hasło / zmienia hasło / wylogowuje wszędzie, a link EMAIL_CHANGE nadal działał:
 * po kliknięciu adres konta był napastnika i kolejny reset hasła szedł do niego. Każde odzyskanie poświadczeń
 * anuluje oczekującą zmianę adresu, a zmiana adresu pali linki wysłane na poprzedni adres.
 */
function prismaAtrapa(token?: Record<string, unknown>) {
  const p = {
    user: {
      findUnique: vi.fn(async () => null as unknown),
      findFirst: vi.fn(async () => null),
      update: vi.fn((a: unknown) => ({ op: 'user.update', a })),
      updateMany: vi.fn((a: unknown) => ({ op: 'user.updateMany', a })),
    },
    userAuthToken: {
      findUnique: vi.fn(async () => token ?? null),
      update: vi.fn((a: unknown) => ({ op: 'token.update', a })),
      updateMany: vi.fn((a: unknown) => ({ op: 'token.updateMany', a })),
    },
    userSession: { updateMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (ops: unknown) => ops),
  };
  return p;
}

const palonePrzeznaczenia = (p: ReturnType<typeof prismaAtrapa>) =>
  p.userAuthToken.updateMany.mock.calls.map((c) => (c[0] as { where: { purpose: unknown } }).where.purpose);

function auth(p: ReturnType<typeof prismaAtrapa>) {
  const n = {} as never;
  const audit = { record: vi.fn(async () => undefined) };
  return new AuthService(
    p as never, n, n, { isEmailLockedOut: vi.fn(), recordFailure: vi.fn() } as never, n, n, audit as never, n,
    { send: vi.fn(async () => undefined) } as never, { get: vi.fn(() => 'https://panel.test') } as never, n, n,
    { assertNotPwned: vi.fn(async () => undefined) } as never,
  );
}

describe('Oczekująca zmiana adresu nie przeżywa odzyskania konta', () => {
  it('reset hasła: pendingEmail = null i linki EMAIL_CHANGE spalone', async () => {
    const p = prismaAtrapa({
      id: 't1', userId: 'u1', purpose: 'PASSWORD_RESET', usedAt: null, expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', anonymizedAt: null },
    });
    await auth(p).confirmPasswordReset({ token: 'abc', newPassword: 'Nowe-Haslo-2026!' } as never);
    const dane = (p.user.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(dane.pendingEmail).toBeNull();
    expect(palonePrzeznaczenia(p)).toContain('EMAIL_CHANGE');
  });

  it('wyloguj wszędzie: pendingEmail = null i linki EMAIL_CHANGE spalone', async () => {
    const p = prismaAtrapa();
    await auth(p).logoutAllDevices('u1');
    const dane = (p.user.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(dane.pendingEmail).toBeNull();
    expect(palonePrzeznaczenia(p)).toContain('EMAIL_CHANGE');
  });

  it('zmiana hasła: pendingEmail = null i linki EMAIL_CHANGE spalone', async () => {
    const p = prismaAtrapa();
    p.user.findUnique.mockResolvedValue({ id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', passwordHash: await bcrypt.hash('Stare-Haslo-2026!', 4) });
    const n = {} as never;
    const users = new UsersService(p as never, { send: vi.fn(async () => undefined) } as never, { get: vi.fn(() => 'https://panel.test') } as never, n, n, n);
    await users.changePassword('u1', { currentPassword: 'Stare-Haslo-2026!', newPassword: 'Nowe-Haslo-2026!' } as never);
    const dane = (p.user.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(dane.pendingEmail).toBeNull();
    expect(palonePrzeznaczenia(p)).toContain('EMAIL_CHANGE');
  });

  it('potwierdzona zmiana adresu pali linki resetu i weryfikacji wysłane na poprzedni adres', async () => {
    const p = prismaAtrapa({
      id: 't2', userId: 'u1', purpose: 'EMAIL_CHANGE', usedAt: null, expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', pendingEmail: 'nowy@firma.pl', anonymizedAt: null },
    });
    await auth(p).confirmEmailChange('abc');
    const palone = palonePrzeznaczenia(p).flatMap((x) => (typeof x === 'object' && x && 'in' in x ? (x as { in: string[] }).in : [x]));
    expect(palone).toEqual(expect.arrayContaining(['PASSWORD_RESET', 'EMAIL_VERIFICATION']));
  });

  // Noc 15.10 (rewalidacja poprawek audytu): ta sama luka w odzyskaniu konta PRZEZ OBSŁUGĘ — operator resetuje hasło
  // (klient dzwoni, że ktoś przejął konto), a link EMAIL_CHANGE zlecony przez napastnika nadal działał.
  function admin(p: ReturnType<typeof prismaAtrapa>) {
    const n = {} as never;
    (p.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', role: 'USER', anonymizedAt: null });
    (p as unknown as { auditLog: unknown }).auditLog = { findMany: vi.fn(async () => []) };
    (p.userAuthToken as unknown as { create: unknown }).create = vi.fn((a: unknown) => ({ op: 'token.create', a }));
    return new UsersAdminService(p as never, n, { record: vi.fn(async () => undefined) } as never, { get: vi.fn(() => undefined) } as never, n, { isConfigured: () => false } as never, { send: vi.fn(async () => undefined) } as never);
  }

  it('reset hasła przez obsługę: pendingEmail = null i linki EMAIL_CHANGE spalone', async () => {
    const p = prismaAtrapa();
    await admin(p).resetCustomerPassword('u1', 'op1', { reason: 'klient zgłosił przejęcie konta' }, {}, { role: 'ADMIN' });
    const dane = (p.user.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(dane.pendingEmail).toBeNull();
    expect(palonePrzeznaczenia(p)).toContain('EMAIL_CHANGE');
  });

  it('zmiana adresu przez obsługę: pendingEmail = null, spalone linki EMAIL_CHANGE, resetu i weryfikacji (stary adres)', async () => {
    const p = prismaAtrapa();
    (p.user.findUnique as ReturnType<typeof vi.fn>).mockImplementation(async (q: { where: { id?: string; email?: string } }) =>
      q.where.email ? null : { id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', role: 'USER', anonymizedAt: null },
    );
    const svc = admin(p);
    (p.user.findUnique as ReturnType<typeof vi.fn>).mockImplementation(async (q: { where: { id?: string; email?: string } }) =>
      q.where.email ? null : { id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', role: 'USER', anonymizedAt: null },
    );
    await svc.changeCustomerEmail('u1', 'op1', 'nowy@firma.pl', 'klient podał nowy adres', {});
    const dane = (p.user.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(dane.pendingEmail).toBeNull();
    const palone = palonePrzeznaczenia(p).flatMap((x) => (x && typeof x === 'object' && 'in' in (x as object) ? (x as { in: string[] }).in : [x]));
    expect(palone).toEqual(expect.arrayContaining(['EMAIL_CHANGE', 'PASSWORD_RESET', 'EMAIL_VERIFICATION']));
  });
});
