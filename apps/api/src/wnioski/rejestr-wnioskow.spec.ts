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
  it('każdy typ wymaga uprawnienia z katalogu; na start: konto wewnętrzne + dwie operacje finansowe', () => {
    expect(TYPY_WNIOSKOW).toEqual(['CUSTOMER_INTERNAL_FLAG', 'WALLET_CREDIT', 'INVOICE_VOID']);
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
    expect(typyDoDecyzji('STAFF', ['REQUESTS_APPROVE', 'CUSTOMERS_MANAGE', 'CUSTOMERS_INTERNAL_FLAG'])).toEqual(['CUSTOMER_INTERNAL_FLAG']);
    expect(typyDoDecyzji('USER', ['REQUESTS_APPROVE', 'BILLING_MANAGE'])).toEqual([]);
  });

  const zal = (o: { isInternal?: boolean; status?: string } = {}) => {
    const wywolania: unknown[][] = [];
    const z: ZaleznosciWnioskow = {
      prisma: {
        user: { findUnique: async () => ({ isInternal: o.isInternal ?? false }) },
        invoice: { findUnique: async () => ({ id: 'f1', userId: 'k1', number: 'VDR/1', status: o.status ?? 'OPEN' }) },
      },
      uzytkownicy: { patchCustomerOperational: async (...a: unknown[]) => void wywolania.push(['patch', ...a]) },
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
    [BillingAdminController, 'creditWallet', 'WALLET_CREDIT'],
    [InvoicesAdminController, 'anuluj', 'INVOICE_VOID'],
  ])('%o.%s → operacja %s', async (klasa, metoda, typ) => {
    const handler = (klasa.prototype as unknown as Record<string, object>)[metoda];
    expect(Reflect.getMetadata(WNIOSEK_MOZLIWY_KEY, handler)).toBe(typ);
    const blad = await straznik(['BILLING_VIEW']).canActivate(kontekst(klasa, handler)).catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(ForbiddenException);
    expect((blad as ForbiddenException).getResponse()).toMatchObject({ code: 'WYMAGA_WNIOSKU', operacja: typ });
    expect(await straznik(['BILLING_MANAGE']).canActivate(kontekst(klasa, handler))).toBe(true);
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
