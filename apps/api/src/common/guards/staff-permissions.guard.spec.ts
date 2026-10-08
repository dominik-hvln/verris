import { Controller, ExecutionContext, ForbiddenException, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffPerm, StaffPermAny } from '../decorators/staff-permissions.decorator.js';
import { WniosekMozliwy } from '../../wnioski/wniosek-mozliwy.decorator.js';
import { StaffPermissionsGuard } from './staff-permissions.guard.js';

/**
 * L1-KARTA — @StaffPermAny („którekolwiek z”) obok @StaffPerm („wszystkie”). Na metodzie zastępuje @StaffPerm
 * klasy: odczyt karty usługi wpuszcza L1 (CUSTOMERS_VIEW) i NOC (SUBSCRIPTIONS_MANAGE), zapisy zostają za klasą.
 */
@Controller('test')
@StaffPerm('SUBSCRIPTIONS_MANAGE')
class Atrapa {
  @Get('a') @StaffPermAny('CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE') odczyt() {}
  @Get('b') zapis() {}
  @Get('c') @StaffPerm('CUSTOMERS_VIEW', 'BILLING_VIEW') wszystkie() {}
  @Get('d') @StaffPerm('BILLING_VIEW') @StaffPermAny('CUSTOMERS_VIEW', 'NODES_VIEW') obie() {}
  @Get('e') @StaffPermAny('BILLING_MANAGE') @WniosekMozliwy('WALLET_CREDIT') wniosek() {}
}

type Metoda = 'odczyt' | 'zapis' | 'wszystkie' | 'obie' | 'wniosek';

function guard(uprawnienia: string[]) {
  const prisma = { user: { findUnique: async () => ({ staffRole: { id: 'r', name: 'r', permissions: uprawnienia } }) } };
  return new StaffPermissionsGuard(new Reflector(), prisma as never);
}

function ctx(metoda: Metoda, user: unknown): ExecutionContext {
  return {
    getHandler: () => Atrapa.prototype[metoda],
    getClass: () => Atrapa,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const OP = { userId: 'op', role: 'STAFF' };
const wpuszcza = (metoda: Metoda, uprawnienia: string[], user: unknown = OP) =>
  guard(uprawnienia)
    .canActivate(ctx(metoda, user))
    .catch((e) => {
      if (e instanceof ForbiddenException) return false;
      throw e;
    });

describe('StaffPermissionsGuard — @StaffPermAny (L1-KARTA)', () => {
  it('any-of: wystarcza jedno z uprawnień (każde z osobna)', async () => {
    expect(await wpuszcza('odczyt', ['CUSTOMERS_VIEW'])).toBe(true);
    expect(await wpuszcza('odczyt', ['SUBSCRIPTIONS_MANAGE'])).toBe(true);
  });

  it('any-of: bez żadnego z uprawnień — odmowa', async () => {
    expect(await wpuszcza('odczyt', [])).toBe(false);
    expect(await wpuszcza('odczyt', ['TICKETS_MANAGE', 'BILLING_VIEW'])).toBe(false);
  });

  it('any-of na metodzie zastępuje @StaffPerm klasy; metody bez niego nadal wymagają uprawnienia z klasy', async () => {
    expect(await wpuszcza('odczyt', ['CUSTOMERS_VIEW'])).toBe(true);
    expect(await wpuszcza('zapis', ['CUSTOMERS_VIEW'])).toBe(false);
    expect(await wpuszcza('zapis', ['SUBSCRIPTIONS_MANAGE'])).toBe(true);
  });

  it('all-of bez zmian: jedno z dwóch wymaganych nie wystarcza', async () => {
    expect(await wpuszcza('wszystkie', ['CUSTOMERS_VIEW'])).toBe(false);
    expect(await wpuszcza('wszystkie', ['CUSTOMERS_VIEW', 'BILLING_VIEW'])).toBe(true);
  });

  it('@StaffPerm i @StaffPermAny na tej samej metodzie: wszystkie z pierwszego i jedno z drugiego', async () => {
    expect(await wpuszcza('obie', ['BILLING_VIEW'])).toBe(false);
    expect(await wpuszcza('obie', ['NODES_VIEW'])).toBe(false);
    expect(await wpuszcza('obie', ['BILLING_VIEW', 'NODES_VIEW'])).toBe(true);
  });

  it('ADMIN wchodzi bez uprawnień, klient (USER) nie wchodzi nawet z kompletem', async () => {
    expect(await wpuszcza('odczyt', [], { userId: 'a', role: 'ADMIN' })).toBe(true);
    expect(await wpuszcza('odczyt', ['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE'], { userId: 'c', role: 'USER' })).toBe(false);
    expect(await wpuszcza('odczyt', ['CUSTOMERS_VIEW'], null)).toBe(false);
  });

  it('odmowa na any-of z rejestru wniosków — kod WYMAGA_WNIOSKU jak dotąd', async () => {
    await expect(guard([]).canActivate(ctx('wniosek', OP))).rejects.toMatchObject({
      response: { code: 'WYMAGA_WNIOSKU', operacja: 'WALLET_CREDIT' },
    });
  });
});
