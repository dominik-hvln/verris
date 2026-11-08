import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  maPlatnyHosting,
  POWOD_ZMIANY_BEZ_CENY_KARTY,
  POWOD_ZMIANY_PO_REZYGNACJI,
  zaplanujOkresPro,
  POWOD_BEZ_HOSTINGU,
  POWOD_BEZ_PLATNEGO_HOSTINGU,
  POWOD_DRUGI_ABONAMENT,
  POWOD_ZAMOWIENIE_CZEKA,
  sprawdzZakupKreatoraPro,
} from './kreator-pro.js';
import { wersjaKreatora } from './wersja-kreatora.js';

/**
 * Paczka 121 — reguły abonamentu Kreator Pro (decyzja 8.11.2026) na atrapie zapytań o subskrypcje.
 * Te same zapytania na Postgresie: test/integration/kreator-pro.int-spec.ts.
 */
type Usluga = { userId: string; rodzaj: string; status: string; isTrial?: boolean; trialConvertedAt?: Date | null };

function baza(uslugi: Usluga[]) {
  const pasuje = (u: Usluga, where: { userId: string; status: { in: string[] }; plan: { productKind: string | { in: string[] } } }) => {
    const pk = where.plan.productKind;
    return u.userId === where.userId && where.status.in.includes(u.status) && (typeof pk === 'string' ? u.rodzaj === pk : pk.in.includes(u.rodzaj));
  };
  const wiersz = (u: Usluga) => ({ id: `${u.rodzaj}-${u.status}`, isTrial: u.isTrial ?? false, trialConvertedAt: u.trialConvertedAt ?? null, status: u.status, plan: { productKind: u.rodzaj } });
  return {
    subscription: {
      findMany: async ({ where }: { where: never }) => uslugi.filter((u) => pasuje(u, where)).map(wiersz),
      findFirst: async ({ where }: { where: never }) => uslugi.filter((u) => pasuje(u, where)).map(wiersz)[0] ?? null,
    },
  } as never;
}

const hosting = (status = 'ACTIVE', proba = false): Usluga => ({ userId: 'u1', rodzaj: 'HOSTING', status, isTrial: proba });
const pro = (status = 'ACTIVE'): Usluga => ({ userId: 'u1', rodzaj: 'KREATOR_PRO', status });

describe('Kreator Pro – zakup (paczka 121)', () => {
  it('bez hostingu → 403 „wymaga działającego hostingu”', async () => {
    await expect(sprawdzZakupKreatoraPro(baza([]), 'u1')).rejects.toThrow(new ForbiddenException(POWOD_BEZ_HOSTINGU));
    // Zawieszony hosting to nie działający hosting.
    await expect(sprawdzZakupKreatoraPro(baza([hosting('SUSPENDED')]), 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hosting tylko w okresie próbnym → 403 „po opłaceniu hostingu”', async () => {
    const blad = await sprawdzZakupKreatoraPro(baza([hosting('ACTIVE', true)]), 'u1').catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(ForbiddenException);
    expect((blad as Error).message).toBe(POWOD_BEZ_PLATNEGO_HOSTINGU);
    expect(POWOD_BEZ_PLATNEGO_HOSTINGU).toContain('po opłaceniu hostingu');
  });

  it('płatny hosting (także po próbie zamienionej na płatną) → zakup dozwolony', async () => {
    await expect(sprawdzZakupKreatoraPro(baza([hosting()]), 'u1')).resolves.toBeUndefined();
    await expect(
      sprawdzZakupKreatoraPro(baza([{ ...hosting('PAST_DUE', true), trialConvertedAt: new Date() }]), 'u1'),
    ).resolves.toBeUndefined();
  });

  it.each(['ACTIVE', 'PAST_DUE', 'SUSPENDED', 'PROVISIONING'])('drugi abonament przy istniejącym %s → 409', async (status) => {
    await expect(sprawdzZakupKreatoraPro(baza([hosting(), pro(status)]), 'u1')).rejects.toThrow(new ConflictException(POWOD_DRUGI_ABONAMENT));
  });

  it('zamówienie czekające na płatność → 409 z prośbą o opłacenie albo anulowanie', async () => {
    await expect(sprawdzZakupKreatoraPro(baza([hosting(), pro('PENDING_PAYMENT')]), 'u1')).rejects.toThrow(new ConflictException(POWOD_ZAMOWIENIE_CZEKA));
  });

  it.each(['CANCELED', 'EXPIRED'])('zakończony abonament (%s) nie blokuje nowego', async (status) => {
    await expect(sprawdzZakupKreatoraPro(baza([hosting(), pro(status)]), 'u1')).resolves.toBeUndefined();
  });
});

describe('Kreator Pro – wersja kreatora (paczka 121)', () => {
  it('ACTIVE i PAST_DUE (karencja) → pro; zawieszony, wygasły, anulowany → hosting (strony zostają)', async () => {
    expect(await wersjaKreatora(baza([hosting(), pro('ACTIVE')]), 'u1')).toBe('pro');
    expect(await wersjaKreatora(baza([hosting(), pro('PAST_DUE')]), 'u1')).toBe('pro');
    for (const s of ['SUSPENDED', 'EXPIRED', 'CANCELED', 'PENDING_PAYMENT']) {
      expect(await wersjaKreatora(baza([hosting(), pro(s)]), 'u1')).toBe('hosting');
    }
  });

  it('Pro bez działającego płatnego hostingu nie włącza się: tylko próba → proba, brak hostingu → brak dostępu', async () => {
    expect(await wersjaKreatora(baza([hosting('ACTIVE', true), pro()]), 'u1')).toBe('proba');
    expect(await wersjaKreatora(baza([hosting('SUSPENDED'), pro()]), 'u1')).toBeNull();
    expect(await wersjaKreatora(baza([pro()]), 'u1')).toBeNull();
  });
});

describe('Kreator Pro – płatny hosting i zmiana okresu (paczka 123)', () => {
  it('maPlatnyHosting: działający albo zawieszony płatny hosting – tak; anulowany, wygasły, sama próba, brak – nie', async () => {
    expect(await maPlatnyHosting(baza([hosting()]), 'u1')).toBe(true);
    expect(await maPlatnyHosting(baza([hosting('SUSPENDED')]), 'u1')).toBe(true);
    expect(await maPlatnyHosting(baza([hosting('CANCELED'), hosting('EXPIRED')]), 'u1')).toBe(false);
    expect(await maPlatnyHosting(baza([hosting('ACTIVE', true)]), 'u1')).toBe(false);
    expect(await maPlatnyHosting(baza([pro()]), 'u1')).toBe(false);
  });

  function abonament(x: Record<string, unknown> = {}) {
    const wiersz = {
      id: 'sub-pro', interval: 'MONTH', cancelAt: null, paymentSource: 'WALLET', stripeSubscriptionId: null,
      plan: { stripePriceMonthlyId: 'price_m', stripePriceYearlyId: 'price_y' }, ...x,
    };
    const updateMany = vi.fn(async () => ({ count: 1 }));
    return { db: { subscription: { findFirst: vi.fn(async () => wiersz), updateMany } } as never, updateMany };
  }

  it('zapis docelowego okresu; ten sam okres = rezygnacja ze zmiany', async () => {
    const a = abonament();
    expect(await zaplanujOkresPro(a.db, 'u1', 'YEAR')).toEqual({ nastepnyOkres: 'YEAR' });
    expect(a.updateMany).toHaveBeenLastCalledWith({ where: { id: 'sub-pro', cancelAt: null }, data: { nastepnyInterwal: 'YEAR' } });
    expect(await zaplanujOkresPro(a.db, 'u1', 'MONTH')).toEqual({ nastepnyOkres: null });
    expect(a.updateMany).toHaveBeenLastCalledWith({ where: { id: 'sub-pro', cancelAt: null }, data: { nastepnyInterwal: null } });
  });

  it('odmowy: brak aktywnego abonamentu 404, wyłączone odnowienie 409, rozliczenie ręczne 409, karta bez ceny Stripe 409', async () => {
    const brak = { subscription: { findFirst: async () => null, updateMany: vi.fn() } } as never;
    await expect(zaplanujOkresPro(brak, 'u1', 'YEAR')).rejects.toBeInstanceOf(NotFoundException);
    await expect(zaplanujOkresPro(abonament({ cancelAt: new Date() }).db, 'u1', 'YEAR')).rejects.toThrow(POWOD_ZMIANY_PO_REZYGNACJI);
    await expect(zaplanujOkresPro(abonament({ paymentSource: 'MANUAL' }).db, 'u1', 'YEAR')).rejects.toBeInstanceOf(ConflictException);
    const karta = abonament({ paymentSource: 'STRIPE_CARD', stripeSubscriptionId: 'sub_1', plan: { stripePriceMonthlyId: 'price_m', stripePriceYearlyId: null } });
    await expect(zaplanujOkresPro(karta.db, 'u1', 'YEAR')).rejects.toThrow(POWOD_ZMIANY_BEZ_CENY_KARTY);
    expect(karta.updateMany).not.toHaveBeenCalled();
  });
});
