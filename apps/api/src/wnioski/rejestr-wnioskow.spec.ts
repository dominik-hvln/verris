import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STAFF_PERMISSION_KEYS } from '../staff-roles/staff-permissions.catalog.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { BillingAdminController } from '../billing/billing.admin.controller.js';
import { UsersAdminController } from '../users/users.admin.controller.js';
import { STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator.js';
import { InvoicesAdminController } from '../billing/invoices.admin.controller.js';
import { zWnioskiem } from '../common/audit/audit.service.js';
import {
  REJESTR_WNIOSKOW,
  TYPY_WNIOSKOW,
  definicjaWniosku,
  typyDoDecyzji,
  wymaganeUprawnienia,
  type TypWniosku,
  type ZaleznosciWnioskow,
} from './rejestr-wnioskow.js';
import { komunikatBledu } from './wnioski.service.js';
import { WNIOSEK_MOZLIWY_KEY } from './wniosek-mozliwy.decorator.js';

/** PB-48 — rejestr typów wniosków, kod odmowy WYMAGA_WNIOSKU i dopisek wniosku w dzienniku. */
describe('PB-48 — rejestr wniosków', () => {
  it('każdy typ wymaga uprawnienia z katalogu: konto wewnętrzne, dwie operacje finansowe, e-mail i hasło klienta (D9)', () => {
    expect(TYPY_WNIOSKOW).toEqual(['CUSTOMER_INTERNAL_FLAG', 'WALLET_CREDIT', 'INVOICE_VOID', 'CUSTOMER_EMAIL_CHANGE', 'CUSTOMER_PASSWORD_RESET']);
    for (const t of TYPY_WNIOSKOW) {
      expect(STAFF_PERMISSION_KEYS).toContain(REJESTR_WNIOSKOW[t].uprawnienie);
      expect(STAFF_PERMISSION_KEYS).toContain(REJESTR_WNIOSKOW[t].doZlozenia);
    }
    expect(REJESTR_WNIOSKOW.CUSTOMER_INTERNAL_FLAG.uprawnienie).toBe('CUSTOMERS_INTERNAL_FLAG');
    expect(REJESTR_WNIOSKOW.WALLET_CREDIT.uprawnienie).toBe('BILLING_MANAGE');
    expect(definicjaWniosku('constructor')).toBeNull();
    expect(definicjaWniosku('NIEZNANY')).toBeNull();
  });

  it('wniosek nie daje więcej niż ścieżka bezpośrednia: wymagane uprawnienia ⊇ @StaffPerm endpointu operacji', () => {
    const bezposrednio: Record<TypWniosku, object> = {
      CUSTOMER_INTERNAL_FLAG: UsersAdminController.prototype.patchOperational,
      WALLET_CREDIT: BillingAdminController.prototype.creditWallet,
      INVOICE_VOID: InvoicesAdminController.prototype.anuluj,
      CUSTOMER_EMAIL_CHANGE: UsersAdminController.prototype.changeEmail,
      CUSTOMER_PASSWORD_RESET: UsersAdminController.prototype.resetPassword,
    };
    for (const t of TYPY_WNIOSKOW) {
      const straznik = (Reflect.getMetadata(STAFF_PERMISSIONS_KEY, bezposrednio[t]) as string[] | undefined) ?? [];
      expect(straznik.length).toBeGreaterThan(0);
      for (const p of straznik) expect(wymaganeUprawnienia(REJESTR_WNIOSKOW[t])).toContain(p);
    }
  });

  it('typy do decyzji: ADMIN wszystkie; STAFF tylko z REQUESTS_APPROVE i uprawnieniem operacji', () => {
    expect(typyDoDecyzji('ADMIN', [])).toEqual(TYPY_WNIOSKOW);
    expect(typyDoDecyzji('STAFF', ['BILLING_MANAGE'])).toEqual([]);
    expect(typyDoDecyzji('STAFF', ['REQUESTS_APPROVE'])).toEqual([]);
    expect(typyDoDecyzji('STAFF', ['REQUESTS_APPROVE', 'BILLING_MANAGE'])).toEqual(['WALLET_CREDIT', 'INVOICE_VOID']);
    // Konto wewnętrzne: komplet jak przy PATCH operational (CUSTOMERS_MANAGE w strażniku + flaga w serwisie).
    expect(typyDoDecyzji('STAFF', ['REQUESTS_APPROVE', 'CUSTOMERS_INTERNAL_FLAG'])).toEqual([]);
    expect(typyDoDecyzji('STAFF', ['REQUESTS_APPROVE', 'CUSTOMERS_MANAGE', 'CUSTOMERS_INTERNAL_FLAG'])).toEqual([
      'CUSTOMER_INTERNAL_FLAG',
      'CUSTOMER_EMAIL_CHANGE',
      'CUSTOMER_PASSWORD_RESET',
    ]);
    // D9 — e-mail i hasło klienta: akceptuje L4 (REQUESTS_APPROVE + CUSTOMERS_MANAGE) albo ADMIN.
    expect(typyDoDecyzji('STAFF', ['REQUESTS_APPROVE', 'CUSTOMERS_MANAGE'])).toEqual(['CUSTOMER_EMAIL_CHANGE', 'CUSTOMER_PASSWORD_RESET']);
    expect(typyDoDecyzji('USER', ['REQUESTS_APPROVE', 'BILLING_MANAGE'])).toEqual([]);
  });

  const zal = (o: { isInternal?: boolean; status?: string; email?: string; zajety?: boolean; mail?: boolean } = {}) => {
    const wywolania: unknown[][] = [];
    const z: ZaleznosciWnioskow = {
      prisma: {
        user: {
          findUnique: async (a: unknown) =>
            (a as { where: { email?: string } }).where.email
              ? o.zajety
                ? { id: 'inny' }
                : null
              : { isInternal: o.isInternal ?? false, email: o.email ?? 'anna@test.pl' },
        },
        invoice: { findUnique: async () => ({ id: 'f1', userId: 'k1', number: 'VDR/1', status: o.status ?? 'OPEN' }) },
      },
      uzytkownicy: {
        patchCustomerOperational: async (...a: unknown[]) => void wywolania.push(['patch', ...a]),
        changeCustomerEmail: async (...a: unknown[]) => (wywolania.push(['email', ...a]), { email: String(a[2]).toLowerCase() }),
        resetCustomerPassword: async (...a: unknown[]) => (wywolania.push(['haslo', ...a]), { linkWyslany: o.mail ?? true, email: 'anna@test.pl' }),
      },
      portfel: { adminCreditWallet: async (a) => (wywolania.push(['portfel', a]), { id: 'tx1', amount: { toString: () => '50.00' } }) },
      anulowanie: { anuluj: async (a) => (wywolania.push(['anuluj', a]), { id: 'f1', number: 'VDR/1', status: 'VOID' }) },
    };
    return { z, wywolania };
  };
  const k = { wniosekId: 'w1', klientId: 'k1', decydujacy: { userId: 'kier', role: 'STAFF' } };

  it('konto wewnętrzne: wykonuje istniejący serwis z uprawnieniem akceptującego; stan już osiągnięty = „bez zmian”', async () => {
    const d = REJESTR_WNIOSKOW.CUSTOMER_INTERNAL_FLAG;
    const { z, wywolania } = zal({ isInternal: false });
    expect(await d.bezZmian!({ isInternal: true }, 'k1', z)).toBeNull();
    await d.wykonaj({ isInternal: true }, k, z);
    expect(wywolania).toEqual([['patch', 'k1', 'kier', { isInternal: true }, { ipAddress: null, userAgent: null }, { userId: 'kier', role: 'STAFF' }]]);
    expect(await d.bezZmian!({ isInternal: true }, 'k1', zal({ isInternal: true }).z)).toMatch(/Bez zmian/);
    await expect(d.sprawdzPrzyZlozeniu!({ isInternal: true }, 'k1', zal({ isInternal: true }).z)).rejects.toThrow(/już jest oznaczone/);
  });

  it('zasilenie portfela: klucz idempotencji z id wniosku, actor = akceptujący', async () => {
    const { z, wywolania } = zal();
    const w = await REJESTR_WNIOSKOW.WALLET_CREDIT.wykonaj({ amount: 50, description: 'rekompensata' }, k, z);
    expect(wywolania).toEqual([['portfel', { userId: 'k1', amount: 50, description: 'rekompensata', idempotencyKey: 'wniosek:w1', actorUserId: 'kier' }]]);
    expect(w).toMatchObject({ walletTxId: 'tx1' });
    expect(REJESTR_WNIOSKOW.WALLET_CREDIT.opis({ amount: 50 })).toBe('Zasilenie portfela: 50,00 K');
  });

  it('anulowanie dokumentu: tylko nieopłacony dokument tego klienta; już anulowany = „bez zmian”', async () => {
    const d = REJESTR_WNIOSKOW.INVOICE_VOID;
    await expect(d.sprawdzPrzyZlozeniu!({ invoiceId: 'f1', powod: 'błędny dokument' }, 'inny', zal().z)).rejects.toThrow(/nie istnieje/);
    await expect(d.sprawdzPrzyZlozeniu!({ invoiceId: 'f1', powod: 'błędny dokument' }, 'k1', zal({ status: 'PAID' }).z)).rejects.toThrow(/korektą/);
    await expect(d.sprawdzPrzyZlozeniu!({ invoiceId: 'f1', powod: 'błędny dokument' }, 'k1', zal().z)).resolves.toBeUndefined();
    expect(await d.bezZmian!({ invoiceId: 'f1', powod: 'x' }, 'k1', zal({ status: 'VOID' }).z)).toMatch(/już anulowany/);
    const { z, wywolania } = zal();
    await d.wykonaj({ invoiceId: 'f1', powod: 'błędny dokument' }, k, z);
    expect(wywolania).toEqual([['anuluj', { invoiceId: 'f1', powod: 'błędny dokument', aktorUserId: 'kier' }]]);
  });

  it('D9 zmiana e-maila: ten sam albo zajęty adres — 400 przy złożeniu; wykonuje serwis z uzasadnieniem jako powodem', async () => {
    const d = REJESTR_WNIOSKOW.CUSTOMER_EMAIL_CHANGE;
    expect(d.uprawnienie).toBe('CUSTOMERS_MANAGE');
    expect(d.doZlozenia).toBe('CUSTOMERS_VIEW');
    await expect(d.sprawdzPrzyZlozeniu!({ newEmail: 'ANNA@test.pl' }, 'k1', zal().z)).rejects.toThrow(/taki sam/);
    await expect(d.sprawdzPrzyZlozeniu!({ newEmail: 'nowy@test.pl' }, 'k1', zal({ zajety: true }).z)).rejects.toThrow(/innego konta/);
    await expect(d.sprawdzPrzyZlozeniu!({ newEmail: 'nowy@test.pl' }, 'k1', zal().z)).resolves.toBeUndefined();
    expect(await d.bezZmian!({ newEmail: 'nowy@test.pl' }, 'k1', zal({ email: 'nowy@test.pl' }).z)).toMatch(/Bez zmian/);
    const { z, wywolania } = zal();
    const w = await d.wykonaj({ newEmail: 'Nowy@test.pl' }, { ...k, uzasadnienie: 'zgłoszenie #123: klient zmienił firmę' }, z);
    expect(wywolania).toEqual([['email', 'k1', 'kier', 'Nowy@test.pl', 'zgłoszenie #123: klient zmienił firmę', { ipAddress: null, userAgent: null }]]);
    expect(w.komunikat).toBe('Adres e-mail zmieniony na nowy@test.pl.');
  });

  it('D9 reset hasła: bez parametrów, link do klienta — wynik nie zawiera hasła; brak maila — komunikat', async () => {
    const d = REJESTR_WNIOSKOW.CUSTOMER_PASSWORD_RESET;
    expect(d.uprawnienie).toBe('CUSTOMERS_MANAGE');
    const { z, wywolania } = zal();
    const w = await d.wykonaj({}, { ...k, uzasadnienie: 'zgłoszenie #9: klient nie pamięta hasła' }, z);
    expect(wywolania).toEqual([['haslo', 'k1', 'kier', { reason: 'zgłoszenie #9: klient nie pamięta hasła' }, { ipAddress: null, userAgent: null }]]);
    expect(w).toEqual({ komunikat: 'Hasło zresetowane — link wysłany na anna@test.pl.' });
    expect((await d.wykonaj({}, k, zal({ mail: false }).z)).komunikat).toMatch(/nie wyszedł/);
  });

  it('komunikat błędu wykonawcy: wyjątek HTTP po polsku wprost, inny — z przedrostkiem, bez stosu', () => {
    expect(komunikatBledu(new ForbiddenException('Brak.'))).toBe('Brak.');
    expect(komunikatBledu(new Error('timeout'))).toBe('Operacja nie powiodła się: timeout');
  });
});

describe('PB-48 — 403 z kodem WYMAGA_WNIOSKU przy operacjach z rejestru', () => {
  const kontekst = (klasa: object, handler: object) =>
    ({
      getHandler: () => handler,
      getClass: () => klasa,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 's', role: 'STAFF' } }) }),
    }) as unknown as ExecutionContext;
  const straznik = (perms: string[]) =>
    new StaffPermissionsGuard(new Reflector(), { user: { findUnique: async () => ({ staffRole: { id: 'r', name: 'r', permissions: perms } }) } } as never);

  it.each([
    [BillingAdminController, 'creditWallet', 'WALLET_CREDIT', ['BILLING_VIEW'], ['BILLING_MANAGE']],
    [InvoicesAdminController, 'anuluj', 'INVOICE_VOID', ['BILLING_VIEW'], ['BILLING_MANAGE']],
    // D9 — L1/L2 (CUSTOMERS_VIEW) dostają „Wyślij wniosek”, L3 (CUSTOMERS_MANAGE) wykonuje sam.
    [UsersAdminController, 'changeEmail', 'CUSTOMER_EMAIL_CHANGE', ['CUSTOMERS_VIEW'], ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE']],
    [UsersAdminController, 'resetPassword', 'CUSTOMER_PASSWORD_RESET', ['CUSTOMERS_VIEW'], ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE']],
  ])('%o.%s → operacja %s', async (klasa, metoda, typ, bez, z) => {
    const handler = (klasa.prototype as unknown as Record<string, object>)[metoda];
    expect(Reflect.getMetadata(WNIOSEK_MOZLIWY_KEY, handler)).toBe(typ);
    const blad = await straznik(bez).canActivate(kontekst(klasa, handler)).catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(ForbiddenException);
    expect((blad as ForbiddenException).getResponse()).toMatchObject({ code: 'WYMAGA_WNIOSKU', operacja: typ });
    expect(await straznik(z).canActivate(kontekst(klasa, handler))).toBe(true);
  });

  it('trasa bez rejestru wniosków — zwykła odmowa, bez kodu', async () => {
    const handler = (InvoicesAdminController.prototype as unknown as Record<string, object>).wystawKorekte;
    const blad = await straznik([]).canActivate(kontekst(InvoicesAdminController, handler)).catch((e: unknown) => e);
    expect((blad as ForbiddenException).getResponse()).not.toHaveProperty('code');
  });
});

describe('PB-48 — dziennik operacji wykonanej z wniosku', () => {
  it('dopisuje wniosekId i wnioskującego do szczegółów; poza wnioskiem nic nie zmienia', () => {
    const w = { wniosekId: 'w1', wnioskujacyUserId: 'l1' };
    expect(zWnioskiem({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(zWnioskiem({ a: 1 }, w)).toEqual({ a: 1, wniosekId: 'w1', wnioskujacyUserId: 'l1' });
    expect(zWnioskiem(undefined, w)).toEqual({ wniosekId: 'w1', wnioskujacyUserId: 'l1' });
    expect(zWnioskiem([1], w)).toEqual({ wartosc: [1], wniosekId: 'w1', wnioskujacyUserId: 'l1' });
  });
});
