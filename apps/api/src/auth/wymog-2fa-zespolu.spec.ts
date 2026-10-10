import * as bcrypt from 'bcrypt';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { KLUCZ_WYMOGU_2FA, stanWymogu2fa, wymog2faZEnv } from './wymog-2fa-zespolu.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { PlatformSettingsAdminController } from '../platform-settings/platform-settings.admin.controller.js';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';

/**
 * D10 (decyzja 10.10) — wymuszenie 2FA zespołu: przełącznik ADMIN-a w panelu ALBO REQUIRE_2FA_FOR_STAFF w env
 * (twarde włączenie, panel go nie wyłączy). Zmiana przełącznika w dzienniku.
 */
const ustawienie = (value: string | null) => ({
  platformSetting: { findUnique: vi.fn(async () => (value === null ? null : { value })) },
});

describe('D10 — stan wymogu 2FA', () => {
  it('env: „1” i „true” włączają, reszta nie', () => {
    expect(wymog2faZEnv({ REQUIRE_2FA_FOR_STAFF: '1' })).toBe(true);
    expect(wymog2faZEnv({ REQUIRE_2FA_FOR_STAFF: 'true' })).toBe(true);
    expect(wymog2faZEnv({ REQUIRE_2FA_FOR_STAFF: 'TRUE ' })).toBe(true);
    for (const v of ['0', '', 'false', undefined]) expect(wymog2faZEnv({ REQUIRE_2FA_FOR_STAFF: v })).toBe(false);
  });

  it('obowiązuje, gdy włączył go env ALBO przełącznik', async () => {
    expect(await stanWymogu2fa(ustawienie(null), {})).toEqual({ wlaczony: false, wymuszonyEnv: false, obowiazuje: false });
    expect(await stanWymogu2fa(ustawienie('1'), {})).toEqual({ wlaczony: true, wymuszonyEnv: false, obowiazuje: true });
    expect(await stanWymogu2fa(ustawienie('0'), { REQUIRE_2FA_FOR_STAFF: 'true' })).toEqual({ wlaczony: false, wymuszonyEnv: true, obowiazuje: true });
  });
});

describe('D10 — logowanie hasłem operatora bez 2FA', () => {
  const HASLO = 'Poprawne-Haslo-2026!';
  const env = process.env.REQUIRE_2FA_FOR_STAFF;
  afterEach(() => {
    if (env === undefined) delete process.env.REQUIRE_2FA_FOR_STAFF;
    else process.env.REQUIRE_2FA_FOR_STAFF = env;
  });

  async function logowanie(wartosc: string | null) {
    const operator = {
      id: 'op1', email: 'ola@verris.pl', role: 'STAFF', passwordHash: await bcrypt.hash(HASLO, 4), isTwoFactorEnabled: false,
      emailVerifiedAt: new Date(), loginBlocked: false, customerOwnerId: null, subaccountDisabledAt: null, anonymizedAt: null,
    };
    const prisma = { user: { findUnique: vi.fn(async () => operator) }, ...ustawienie(wartosc) };
    const suspicious = { isEmailLockedOut: vi.fn(async () => false), recordFailure: vi.fn(async () => undefined) };
    const audit = { record: vi.fn(async () => undefined) };
    // Dalej (passkey) — sygnał, że wymóg 2FA przepuścił logowanie.
    const passkey = { evaluatePasswordLogin: vi.fn(async () => { throw new Error('DALEJ'); }) };
    const n = {} as never;
    const svc = new AuthService(prisma as never, n, n, suspicious as never, n, n, audit as never, n, n, n, n, passkey as never, n);
    const wynik = await svc.login({ email: 'ola@verris.pl', password: HASLO } as never).catch((e: unknown) => e);
    return { wynik, audit };
  }

  it('przełącznik w panelu włączony → odmowa i wpis LOGIN_BLOCKED_2FA_REQUIRED (wcześniej tylko env)', async () => {
    delete process.env.REQUIRE_2FA_FOR_STAFF;
    const { wynik, audit } = await logowanie('1');
    expect(wynik).toBeInstanceOf(UnauthorizedException);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_BLOCKED_2FA_REQUIRED', userId: 'op1' }));
  });

  it('env=true wymusza mimo wyłączonego przełącznika', async () => {
    process.env.REQUIRE_2FA_FOR_STAFF = 'true';
    expect((await logowanie('0')).wynik).toBeInstanceOf(UnauthorizedException);
  });

  it('bez wymogu logowanie idzie dalej', async () => {
    delete process.env.REQUIRE_2FA_FOR_STAFF;
    expect(((await logowanie(null)).wynik as Error).message).toBe('DALEJ');
  });
});

describe('D10 — przełącznik w panelu (tylko ADMIN, w dzienniku)', () => {
  const env = process.env.REQUIRE_2FA_FOR_STAFF;
  afterEach(() => {
    if (env === undefined) delete process.env.REQUIRE_2FA_FOR_STAFF;
    else process.env.REQUIRE_2FA_FOR_STAFF = env;
  });

  function serwis(o: { wartosc?: string | null; totp?: boolean; passkeys?: number } = {}) {
    let wartosc = o.wartosc ?? null;
    const prisma = {
      platformSetting: {
        findUnique: vi.fn(async () => (wartosc === null ? null : { value: wartosc })),
        upsert: vi.fn(async (a: { update: { value: string } }) => {
          wartosc = a.update.value;
        }),
      },
      user: { findUnique: vi.fn(async () => ({ isTwoFactorEnabled: o.totp ?? true, _count: { webauthnCredentials: o.passkeys ?? 0 } })) },
    };
    const audit = { record: vi.fn(async () => undefined) };
    return { svc: new PlatformSettingsService(prisma as never, audit as never, {} as never), prisma, audit };
  }

  it('tylko ADMIN (klasa kontrolera), bez STAFF', () => {
    expect(new Reflector().getAllAndOverride(ROLES_KEY, [PlatformSettingsAdminController.prototype.ustawWymog2fa, PlatformSettingsAdminController])).toEqual(['ADMIN']);
  });

  it('włączenie: zapis, wpis w dzienniku, stan „obowiązuje”', async () => {
    delete process.env.REQUIRE_2FA_FOR_STAFF;
    const { svc, prisma, audit } = serwis();
    expect(await svc.ustawWymog2fa(true, 'adm')).toEqual({ wlaczony: true, wymuszonyEnv: false, obowiazuje: true });
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: KLUCZ_WYMOGU_2FA } }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PLATFORM_STAFF_2FA_REQUIREMENT_UPDATED', actorUserId: 'adm', details: { wlaczony: true, poprzednio: false, wymuszonyEnv: false } }),
    );
  });

  it('administrator bez TOTP i passkey nie włączy (zamknąłby sobie logowanie); z samym passkey — może', async () => {
    delete process.env.REQUIRE_2FA_FOR_STAFF;
    await expect(serwis({ totp: false }).svc.ustawWymog2fa(true, 'adm')).rejects.toBeInstanceOf(BadRequestException);
    await expect(serwis({ totp: false, passkeys: 1 }).svc.ustawWymog2fa(true, 'adm')).resolves.toMatchObject({ wlaczony: true });
  });

  it('env wymusza → panel nie wyłączy (409, bez zapisu)', async () => {
    process.env.REQUIRE_2FA_FOR_STAFF = '1';
    const { svc, prisma } = serwis({ wartosc: '1' });
    await expect(svc.ustawWymog2fa(false, 'adm')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });
});
