import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { funkcjaDlaKonta, funkcjaDlaUzytkownika } from './funkcje-testowe.js';
import { VpsController, VpsDostepGuard } from '../vps/vps.controller.js';
import { MeFeatureFlagsController } from '../product-ops/me-feature-flags.controller.js';

/**
 * VPS i narzut resellera włączane z env API per konto (jak AI_TYLKO_KONTA): obraz panelu budowany jest
 * bez NEXT_PUBLIC_FEATURE_*, więc operator nie miał jak włączyć funkcji do testu na produkcji.
 */
const konfig = (w: Record<string, string>) => ({ get: (k: string) => w[k] });
const prismaZEmailem = (email: string | null) => ({ user: { findUnique: vi.fn(async () => (email ? { email } : null)) } });

describe('funkcje testowe — reguła per konto', () => {
  it('brak zmiennych: wyłączone dla każdego', () => {
    expect(funkcjaDlaKonta(konfig({}), 'FEATURE_VPS', 'test@hvln.pl')).toBe(false);
    expect(funkcjaDlaKonta(konfig({ FEATURE_VPS: 'false' }), 'FEATURE_VPS', 'test@hvln.pl')).toBe(false);
  });

  it('FLAGA=true: wszyscy', () => {
    expect(funkcjaDlaKonta(konfig({ FEATURE_VPS: 'true' }), 'FEATURE_VPS', 'ktos@firma.pl')).toBe(true);
    expect(funkcjaDlaKonta(konfig({ FEATURE_RESELLER_MARKUP: 'TRUE' }), 'FEATURE_RESELLER_MARKUP', null)).toBe(true);
  });

  it('lista kont: tylko te e-maile (bez względu na wielkość liter), nawet przy FLAGA=false i mimo FLAGA=true', () => {
    const c = konfig({ FEATURE_VPS: 'false', FEATURE_VPS_TYLKO_KONTA: 'test@hvln.pl, Drugi@hvln.pl' });
    expect(funkcjaDlaKonta(c, 'FEATURE_VPS', 'TEST@hvln.pl')).toBe(true);
    expect(funkcjaDlaKonta(c, 'FEATURE_VPS', 'drugi@hvln.pl')).toBe(true);
    expect(funkcjaDlaKonta(c, 'FEATURE_VPS', 'ktos@firma.pl')).toBe(false);
    expect(funkcjaDlaKonta(c, 'FEATURE_VPS', undefined)).toBe(false);
    expect(funkcjaDlaKonta(konfig({ FEATURE_VPS: 'true', FEATURE_VPS_TYLKO_KONTA: 'test@hvln.pl' }), 'FEATURE_VPS', 'ktos@firma.pl')).toBe(false);
    // wpis bez „@” nie jest listą kont — decyduje flaga
    expect(funkcjaDlaKonta(konfig({ FEATURE_VPS: 'true', FEATURE_VPS_TYLKO_KONTA: 'true' }), 'FEATURE_VPS', 'ktos@firma.pl')).toBe(true);
    // lista jednej funkcji nie włącza drugiej
    expect(funkcjaDlaKonta(c, 'FEATURE_RESELLER_MARKUP', 'test@hvln.pl')).toBe(false);
  });

  it('po id konta: bez listy nie pyta bazy; z listą sprawdza e-mail konta', async () => {
    const p = prismaZEmailem('test@hvln.pl');
    expect(await funkcjaDlaUzytkownika(konfig({ FEATURE_VPS: 'true' }), p as never, 'FEATURE_VPS', 'u1')).toBe(true);
    expect(p.user.findUnique).not.toHaveBeenCalled();
    const lista = konfig({ FEATURE_VPS_TYLKO_KONTA: 'test@hvln.pl' });
    expect(await funkcjaDlaUzytkownika(lista, p as never, 'FEATURE_VPS', 'u1')).toBe(true);
    expect(await funkcjaDlaUzytkownika(lista, prismaZEmailem('ktos@firma.pl') as never, 'FEATURE_VPS', 'u2')).toBe(false);
    expect(await funkcjaDlaUzytkownika(lista, p as never, 'FEATURE_VPS', undefined)).toBe(false);
  });
});

describe('VPS dla klienta — odmowa bez flagi', () => {
  const ctx = (userId?: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user: userId ? { userId } : undefined }) }) }) as unknown as ExecutionContext;
  const straznik = (w: Record<string, string>, email: string | null) => new VpsDostepGuard(konfig(w) as never, prismaZEmailem(email) as never);

  it('kontroler klienta VPS jest chroniony strażnikiem flagi (wszystkie trasy)', () => {
    expect(Reflect.getMetadata('__guards__', VpsController)).toContain(VpsDostepGuard);
  });

  it('bez zmiennych: 403; konto z listy: wpuszczone; inne konto: 403; FEATURE_VPS=true: każdy', async () => {
    await expect(straznik({}, 'test@hvln.pl').canActivate(ctx('u1'))).rejects.toBeInstanceOf(ForbiddenException);
    const lista = { FEATURE_VPS_TYLKO_KONTA: 'test@hvln.pl' };
    expect(await straznik(lista, 'test@hvln.pl').canActivate(ctx('u1'))).toBe(true);
    await expect(straznik(lista, 'ktos@firma.pl').canActivate(ctx('u2'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(await straznik({ FEATURE_VPS: 'true' }, null).canActivate(ctx('u3'))).toBe(true);
  });
});

describe('/me/feature-flags — panel dostaje vps i resellerMarkup dla zalogowanego konta', () => {
  const prisma = (email: string) => ({
    featureFlag: { findMany: vi.fn(async () => []) },
    subscription: { findMany: vi.fn(async () => []) },
    user: { findUnique: vi.fn(async () => ({ email })) },
  });
  const moje = (w: Record<string, string>, email: string) =>
    new MeFeatureFlagsController(prisma(email) as never, konfig(w) as never).moje({ userId: 'u1' });

  it('bez zmiennych: obie false', async () => {
    expect(await moje({}, 'test@hvln.pl')).toEqual({ vps: false, resellerMarkup: false });
  });

  it('listy kont: true tylko dla konta z listy danej funkcji', async () => {
    const cfg = { FEATURE_VPS_TYLKO_KONTA: 'test@hvln.pl', FEATURE_RESELLER_MARKUP: 'true' };
    expect(await moje(cfg, 'test@hvln.pl')).toEqual({ vps: true, resellerMarkup: true });
    expect(await moje(cfg, 'ktos@firma.pl')).toEqual({ vps: false, resellerMarkup: true });
  });
});
