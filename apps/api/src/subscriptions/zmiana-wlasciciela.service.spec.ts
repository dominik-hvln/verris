import { Role, SubscriptionStatus } from '@verris/database';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { STAFF_PERMISSIONS_ANY_KEY, STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator.js';
import { WNIOSEK_MOZLIWY_KEY } from '../wnioski/wniosek-mozliwy.decorator.js';
import { ZmianaWlascicielaAdminController } from './zmiana-wlasciciela.admin.controller.js';
import { odmowyZmianyWlasciciela, ZmianaWlascicielaService, type KlientZmiany, type StanZmianyWlasciciela } from './zmiana-wlasciciela.service.js';

const GODZINA = 3600_000;
const TERAZ = Date.UTC(2026, 9, 12, 12);

function klient(over: Partial<KlientZmiany> = {}): KlientZmiany {
  return {
    id: 'nowy',
    email: 'nowy@test.pl',
    firstName: null,
    role: 'USER',
    customerOwnerId: null,
    loginBlocked: false,
    anonymizedAt: null,
    deletionRequestedAt: null,
    emailVerifiedAt: new Date(TERAZ - 1000),
    billingOutside: false,
    resellerOwnerId: null,
    ...over,
  } as KlientZmiany;
}

function stan(o: { usluga?: Partial<StanZmianyWlasciciela['usluga']>; nowy?: Partial<KlientZmiany> | null; wToku?: Partial<StanZmianyWlasciciela['wToku']> } = {}): StanZmianyWlasciciela {
  return {
    usluga: {
      id: 's1',
      userId: 'stary',
      status: SubscriptionStatus.ACTIVE,
      isTrial: false,
      paymentSource: 'WALLET',
      stripeSubscriptionId: null,
      resellerMarkupPct: null,
      currentPeriodEnd: new Date(TERAZ + 10 * 24 * GODZINA),
      cancelAt: null,
      individualPrice: null,
      autoscalingEnabled: false,
      serviceTag: 'abcd1234',
      plan: { productKind: 'HOSTING' },
      account: { id: 'a1', domain: 'strona.pl', status: 'ACTIVE' },
      siteMonitor: null,
      user: klient({ id: 'stary', email: 'stary@test.pl' }),
      ...o.usluga,
    },
    nowy: o.nowy === null ? null : klient(o.nowy),
    wToku: { migracje: 0, przeniesieniaKonta: 0, odtworzenia: 0, ssl: 0, wnioski: 0, proformy: 0, ...o.wToku },
  };
}

const odmowy = (o: Parameters<typeof stan>[0]) => odmowyZmianyWlasciciela(stan(o), TERAZ);

describe('K2 — odmowy zmiany właściciela usługi', () => {
  it('aktywna usługa portfelowa, aktywny klient docelowy → można', () => {
    expect(odmowy({})).toEqual([]);
  });

  it('brak klienta o tym adresie i ten sam klient — jedyna odmowa', () => {
    expect(odmowy({ nowy: null })).toEqual(['Nie ma klienta z tym adresem e-mail.']);
    expect(odmowy({ nowy: { id: 'stary' } })).toEqual(['To ten sam klient — usługa już należy do tego konta.']);
  });

  it.each([
    ['usunięty', { anonymizedAt: new Date() }, /usunięte/],
    ['w trakcie usuwania', { deletionRequestedAt: new Date() }, /usunięte albo w trakcie usuwania/],
    ['zablokowany', { loginBlocked: true }, /zablokowane/],
    ['nieaktywny (niepotwierdzony e-mail)', { emailVerifiedAt: null }, /nie jest aktywne/],
    ['subkonto', { customerOwnerId: 'ktos' }, /główne konto klienta/],
    ['konto zespołu', { role: 'STAFF' }, /główne konto klienta/],
  ] as const)('nowy właściciel %s → odmowa', (_n, nowy, wzor) => {
    expect(odmowy({ nowy: nowy as Partial<KlientZmiany> })).toEqual([expect.stringMatching(wzor)]);
  });

  it.each([
    [SubscriptionStatus.PROVISIONING, /zakładania/],
    [SubscriptionStatus.PAST_DUE, /zaległą płatność.*nie przechodzi na nowego/],
    [SubscriptionStatus.SUSPENDED, /zawieszona/],
    [SubscriptionStatus.PENDING_PAYMENT, /pierwszą płatność/],
    [SubscriptionStatus.CANCELED, /zakończona/],
    [SubscriptionStatus.EXPIRED, /zakończona/],
  ])('usługa %s → odmowa', (status, wzor) => {
    expect(odmowy({ usluga: { status } })).toEqual([expect.stringMatching(wzor)]);
  });

  it('konto hostingowe nieaktywne (zakładane, usuwane) albo go brak → odmowa', () => {
    expect(odmowy({ usluga: { account: { id: 'a1', domain: 'x.pl', status: 'DELETED' } } })).toEqual([expect.stringMatching(/Konto hostingowe/)]);
    expect(odmowy({ usluga: { account: null } })).toEqual([expect.stringMatching(/Konto hostingowe/)]);
  });

  it('karta cykliczna (Stripe) → odmowa; karta bez subskrypcji Stripe — można', () => {
    expect(odmowy({ usluga: { paymentSource: 'STRIPE_CARD', stripeSubscriptionId: 'sub_1' } })).toEqual([expect.stringMatching(/kartą obecnego właściciela/)]);
    expect(odmowy({ usluga: { paymentSource: 'STRIPE_CARD', stripeSubscriptionId: null } })).toEqual([]);
  });

  it('PB-28: rozliczenie poza Verris tylko po jednej stronie → odmowa; po obu — można (także w oknie odnowienia, bo nic nie pobieramy)', () => {
    expect(odmowy({ nowy: { billingOutside: true } })).toEqual([expect.stringMatching(/poza Verris/)]);
    const obaPoza = { usluga: { paymentSource: 'MANUAL', user: klient({ id: 'stary', billingOutside: true }), currentPeriodEnd: new Date(TERAZ + GODZINA) }, nowy: { billingOutside: true } };
    expect(odmowy(obaPoza)).toEqual([]);
  });

  it('okres próbny, e-mail marketing, narzut cudzego resellera → odmowa', () => {
    expect(odmowy({ usluga: { isTrial: true } })).toEqual([expect.stringMatching(/okres próbny/)]);
    expect(odmowy({ usluga: { plan: { productKind: 'EMAIL_MARKETING' } } })).toEqual([expect.stringMatching(/e-mail marketingu/)]);
    expect(odmowy({ usluga: { resellerMarkupPct: 20, user: klient({ id: 'stary', resellerOwnerId: 'r1' }) } })).toEqual([expect.stringMatching(/narzut partnera/)]);
    expect(odmowy({ usluga: { resellerMarkupPct: 20, user: klient({ id: 'stary', resellerOwnerId: 'r1' }) }, nowy: { resellerOwnerId: 'r1' } })).toEqual([]);
  });

  it('mniej niż doba do odnowienia (portfel) → odmowa', () => {
    expect(odmowy({ usluga: { currentPeriodEnd: new Date(TERAZ + 20 * GODZINA) } })).toEqual([expect.stringMatching(/mniej niż doba/)]);
  });

  it.each([
    ['migracje', /przenoszenie strony/],
    ['przeniesieniaKonta', /przeniesienia konta/],
    ['odtworzenia', /odtwarzanie kopii/],
    ['ssl', /certyfikatu SSL/],
    ['wnioski', /wniosek operatora/],
    ['proformy', /otwartą proformę na odnowienie/],
  ] as const)('w toku: %s → odmowa', (klucz, wzor) => {
    expect(odmowy({ wToku: { [klucz]: 1 } })).toEqual([expect.stringMatching(wzor)]);
  });
});

describe('K2 — przenies(): walidacje przed transakcją', () => {
  // przenies() liczy okno odnowienia od zegara (Date.now()), a dane testu są ustawione względem TERAZ (12.10) —
  // bez stałego zegara test zaczął padać 21.10 wieczorem, gdy do „odnowienia” z danych została mniej niż doba.
  beforeEach(() => vi.useFakeTimers({ now: TERAZ, toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  function serwis() {
    const prisma = { $transaction: vi.fn() };
    return { s: new ZmianaWlascicielaService(prisma as never, { send: vi.fn() } as never, { get: () => undefined } as never), prisma };
  }
  const z = { subscriptionId: 's1', operator: { userId: 'adm', role: 'ADMIN' }, email: 'Nowy@Test.pl', powod: 'Sprzedaż firmy — zgłoszenie #ab12', potwierdzenie: ' nowy@test.pl ' };

  it('tylko ADMIN — STAFF dostaje 403 bez dotykania bazy', async () => {
    const { s, prisma } = serwis();
    await expect(s.przenies({ ...z, operator: { userId: 'op', role: 'STAFF' } })).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('powód krótszy niż 10 znaków → 400', async () => {
    const { s, prisma } = serwis();
    await expect(s.przenies({ ...z, powod: ' za krótki' })).rejects.toThrow(/min\. 10 znaków/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('potwierdzenie inne niż adres nowego właściciela → 400; wielkość liter i spacje bez znaczenia', async () => {
    const { s, prisma } = serwis();
    await expect(s.przenies({ ...z, potwierdzenie: 'nowy@test.p' })).rejects.toThrow(/nie zgadza się/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    vi.spyOn(s as unknown as { wczytaj: () => Promise<StanZmianyWlasciciela> }, 'wczytaj').mockResolvedValue(stan());
    prisma.$transaction.mockResolvedValue({ u: { id: 's1', currentPeriodEnd: null, cancelAt: null, autoscalingEnabled: false, siteMonitor: null }, stary: klient({ id: 'stary', email: 'stary@test.pl' }), nowy: klient(), domena: 'strona.pl', iam: {} });
    await expect(s.przenies(z)).resolves.toMatchObject({ nowyWlasciciel: { id: 'nowy' } });
  });
});

describe('K2 — kontroler: tylko ADMIN, bez wniosku', () => {
  it('klasa @Roles(ADMIN), metody bez nadpisania ról, bez @StaffPerm i bez wniosku', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ZmianaWlascicielaAdminController)).toEqual([Role.ADMIN]);
    for (const m of [ZmianaWlascicielaAdminController.prototype.podglad, ZmianaWlascicielaAdminController.prototype.przenies]) {
      expect(Reflect.getMetadata(ROLES_KEY, m)).toBeUndefined();
      expect(Reflect.getMetadata(STAFF_PERMISSIONS_KEY, m)).toBeUndefined();
      expect(Reflect.getMetadata(STAFF_PERMISSIONS_ANY_KEY, m)).toBeUndefined();
      expect(Reflect.getMetadata(WNIOSEK_MOZLIWY_KEY, m)).toBeUndefined();
    }
  });
});
