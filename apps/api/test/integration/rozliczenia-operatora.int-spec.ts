import { Prisma, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { DoladowanieService } from '../../src/billing/doladowanie.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { WalletAutoTopupService } from '../../src/billing/wallet-auto-topup.service.js';
import { RozliczeniaOperatoraService } from '../../src/billing/rozliczenia-operatora.service.js';
import { traktowanieZKodu } from '../../src/billing/vat.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * F3.6 — ścieżki pieniężne rozliczeń operatora na prawdziwym Postgresie: wpłata przelewem i korekta salda
 * zaksięgowane raz mimo równoległych żądań (unikalny klucz księgi + blokada wiersza klienta), saldo nigdy poniżej zera,
 * ponowienie auto-doładowania obciąża kartę raz. Atrapy: Stripe, mailer, EKO.
 */
const pusty = new Proxy({}, { get: () => async () => undefined }) as never;
const maile: string[] = [];
const obciazenia: string[] = [];
let odpowiedzKarty: 'succeeded' | 'odmowa' = 'succeeded';
const stripe = {
  isConfigured: () => true,
  createOffSessionPaymentIntent: async (i: { idempotencyKey: string }) => {
    await new Promise((r) => setTimeout(r, 50));
    if (odpowiedzKarty === 'odmowa') throw new Error('Your card was declined.');
    obciazenia.push(i.idempotencyKey);
    return { id: `pi_${obciazenia.length}`, status: 'succeeded' };
  },
};

function serwis() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: async (m: { to: string }) => void maile.push(m.to) };
  const vat = { ustal: async () => ({ traktowanie: traktowanieZKodu('PL', 23, 'PL')!, vies: null }) };
  const doladowanie = new DoladowanieService(p, ledger, vat as never);
  const billing = new BillingService(
    p, ledger, null as never, audit, { get: () => undefined } as never,
    null as never, null as never, mailer as never, pusty,
    { safeAward: async () => undefined, awardWalletTopup: async () => 0 } as never,
    doladowanie,
  );
  const auto = new WalletAutoTopupService(p, stripe as never, audit, mailer as never, { get: () => undefined } as never);
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  return new RozliczeniaOperatoraService(p, ledger, doladowanie, billing, audit, auto, promo);
}

let n = 0;
const klient = async (saldo = 0, extra: Record<string, unknown> = {}) => {
  n += 1;
  return prisma().user.create({ data: { email: `f36-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo, ...extra } as never });
};
const saldo = async (id: string) => (await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance.toFixed(2);
const FIN = { userId: '00000000-0000-4000-8000-0000000000f1', role: 'STAFF' };
const dzis = new Date();

describe('F3.6 — wpłata przelewem na portfel', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    maile.length = 0;
  });
  afterAll(rozlacz);

  it('pięć równoległych zaksięgowań tego samego przelewu: K wchodzą raz, jeden dokument, jeden mail, jeden wpis dla klienta', async () => {
    const k = await klient(10);
    const s = serwis();
    const wyniki = await Promise.allSettled(
      Array.from({ length: 5 }, () => s.zaksiegujPrzelew({ userId: k.id, operator: FIN, kwota: 123.45, tytul: 'Faktura VDR/1 doładowanie', referencja: ' ab-1234  xyz ', dataWplaty: dzis })),
    );
    expect(wyniki.every((w) => w.status === 'fulfilled')).toBe(true);
    const nowe = wyniki.filter((w) => w.status === 'fulfilled' && !w.value.duplikat);
    expect(nowe).toHaveLength(1);

    const wpisy = await prisma().walletTransaction.findMany({ where: { userId: k.id, type: WalletTxType.TOPUP } });
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0]).toMatchObject({ idempotencyKey: 'przelew:AB-1234 XYZ', paymentProvider: 'PRZELEW', paymentRef: 'AB-1234 XYZ', description: 'Wpłata przelewem — Faktura VDR/1 doładowanie' });
    expect(await saldo(k.id)).toBe('133.45');
    // Dokument istniejącą ścieżką „przy doładowaniu” (bez zmian w logice faktur).
    expect(await prisma().invoice.count({ where: { userId: k.id, provider: 'WALLET_TOPUP', providerRef: wpisy[0].id } })).toBe(1);
    expect(await prisma().auditLog.count({ where: { userId: k.id, action: 'WALLET_TOPUP_COMPLETED' } })).toBe(1);
    expect(await prisma().auditLog.count({ where: { userId: k.id, action: 'WALLET_MANUAL_PAYMENT_POSTED' } })).toBe(1);
    const zespol = await prisma().auditLog.findMany({ where: { userId: k.id, action: 'OPERATOR_ACCOUNT_CHANGED' } });
    expect(zespol).toHaveLength(1);
    expect(zespol[0].actorUserId).toBe(FIN.userId);
    // Księga (eksport RODO) bez id pracownika.
    expect(JSON.stringify(wpisy[0].metadata)).not.toContain(FIN.userId);
    expect(maile).toEqual([k.email]);
  });

  it('ta sama referencja z inną kwotą albo na innym koncie: 409 i nic nie wchodzi', async () => {
    const a = await klient();
    const b = await klient();
    const s = serwis();
    await s.zaksiegujPrzelew({ userId: a.id, operator: FIN, kwota: 50, tytul: 'Wplata', referencja: 'REF-0001', dataWplaty: dzis });
    await expect(s.zaksiegujPrzelew({ userId: a.id, operator: FIN, kwota: 51, tytul: 'Wplata', referencja: 'ref-0001', dataWplaty: dzis })).rejects.toThrow(/inną kwotą/);
    await expect(s.zaksiegujPrzelew({ userId: b.id, operator: FIN, kwota: 50, tytul: 'Wplata', referencja: 'REF-0001', dataWplaty: dzis })).rejects.toThrow(/innym koncie/);
    expect(await saldo(a.id)).toBe('50.00');
    expect(await saldo(b.id)).toBe('0.00');
  });

  it('subkonto, konto zespołu (dla STAFF), data z przyszłości i cudze zgłoszenie — odmowa bez księgowania', async () => {
    const wlasciciel = await klient();
    const sub = await klient(0, { customerOwnerId: wlasciciel.id });
    const zespol = await klient(0, { role: 'ADMIN' });
    const inny = await klient();
    const cudze = await prisma().ticket.create({ data: { userId: inny.id, subject: 'Przelew', message: 'x' } });
    const s = serwis();
    const p = { operator: FIN, kwota: 10, tytul: 'Wplata', dataWplaty: dzis };
    await expect(s.zaksiegujPrzelew({ ...p, userId: sub.id, referencja: 'R-1111' })).rejects.toThrow(/subkonto/);
    await expect(s.zaksiegujPrzelew({ ...p, userId: zespol.id, referencja: 'R-2222' })).rejects.toThrow(/portfele klientów/);
    await expect(s.zaksiegujPrzelew({ ...p, userId: wlasciciel.id, referencja: 'R-3333', dataWplaty: new Date(Date.now() + 3 * 86400000) })).rejects.toThrow(/przyszłości/);
    await expect(s.zaksiegujPrzelew({ ...p, userId: wlasciciel.id, referencja: 'R-4444', zgloszenie: `#${cudze.id.slice(0, 8)}` })).rejects.toThrow(/zgłoszenia u tego klienta/);
    expect(await prisma().walletTransaction.count()).toBe(0);
  });
});

describe('F3.6 — korekta salda (±)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('równoległe wysłanie tej samej korekty: zapis raz; opis dla klienta bez powodu i nazwiska, ze zgłoszeniem', async () => {
    const k = await klient(20);
    const zgl = await prisma().ticket.create({ data: { userId: k.id, subject: 'Saldo', message: 'x' } });
    const s = serwis();
    const z = { userId: k.id, operator: FIN, kierunek: 'plus' as const, kwota: 7.5, powod: 'Zwrot za awarię węzła 10.10', zgloszenie: `#${zgl.id.slice(0, 8)}`, klucz: '4f9c2a1e-0000-4000-8000-000000000001' };
    const w = await Promise.all([s.korektaSalda(z), s.korektaSalda(z), s.korektaSalda(z)]);
    expect(w.filter((x) => !x.duplikat)).toHaveLength(1);
    expect(await saldo(k.id)).toBe('27.50');
    const wpis = await prisma().walletTransaction.findFirstOrThrow({ where: { userId: k.id, type: WalletTxType.ADJUSTMENT } });
    expect(wpis.description).toBe(`Korekta salda — obsługa Verris (zgłoszenie #${zgl.id.slice(0, 8)})`);
    expect(wpis.description).not.toContain('awarię');
    expect(await prisma().auditLog.count({ where: { userId: k.id, action: 'WALLET_OPERATOR_ADJUSTED' } })).toBe(1);
    const dziennik = await prisma().auditLog.findFirstOrThrow({ where: { userId: k.id, action: 'OPERATOR_ACCOUNT_CHANGED' } });
    expect(dziennik.details).toMatchObject({ akcja: 'korekta-salda', powod: 'Zwrot za awarię węzła 10.10', kwota: '7.50' });
    // Ten sam klucz z inną kwotą — pomyłka formularza, nie druga korekta.
    await expect(s.korektaSalda({ ...z, kwota: 8 })).rejects.toThrow(/klucz operacji/);
  });

  it('minus: nigdy poniżej zera — równoległe korekty o różnych kluczach przechodzą tylko do wysokości salda', async () => {
    const k = await klient(25);
    const s = serwis();
    const wyniki = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        s.korektaSalda({ userId: k.id, operator: FIN, kierunek: 'minus', kwota: 10, powod: 'Cofnięcie błędnego uznania', klucz: `minus-klucz-000${i}` }),
      ),
    );
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(2);
    const odmowy = wyniki.filter((w): w is PromiseRejectedResult => w.status === 'rejected');
    expect(odmowy).toHaveLength(2);
    expect(String(odmowy[0].reason)).toMatch(/poniżej zera/);
    expect(await saldo(k.id)).toBe('5.00');
    const ruchy = await serwis().ruchyPortfela(k.id, FIN, {});
    expect(ruchy.total).toBe(2);
    expect(ruchy.wiersze.map((r) => r.amount)).toEqual(['-10.00', '-10.00']);
    expect(new Prisma.Decimal(ruchy.saldo).toFixed(2)).toBe('5.00');
  });

  it('powód krótszy niż 10 znaków — odmowa', async () => {
    const k = await klient(5);
    await expect(serwis().korektaSalda({ userId: k.id, operator: FIN, kierunek: 'plus', kwota: 1, powod: 'bo tak', klucz: 'krotki-powod-01' })).rejects.toThrow(/powód/);
  });
});

describe('F3.6 — nieudane płatności i ponowienie auto-doładowania', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    obciazenia.length = 0;
    odpowiedzKarty = 'succeeded';
  });
  afterAll(rozlacz);

  async function zOdmowa() {
    const k = await klient(10, { stripeCustomerId: `cus_${n}`, defaultPaymentMethodId: `pm_${n}` });
    await prisma().walletAutoTopup.create({ data: { userId: k.id, enabled: true, threshold: 50, topupAmount: 100 } });
    odpowiedzKarty = 'odmowa';
    await serwis()['autoDoladowanie'].runEligibleChecks();
    odpowiedzKarty = 'succeeded';
    return k;
  }

  it('lista łączy Paynow, auto-doładowanie (bez dubla z webhooka) i odmowę karty Stripe; ponowić można tylko ostatnią próbę', async () => {
    const k = await zOdmowa();
    // Webhook payment_failed tej samej próby — na liście nie ma być drugi raz.
    await prisma().auditLog.create({ data: { userId: k.id, action: 'WALLET_AUTOTOPUP_PAYMENT_FAILED', details: { error: 'Your card was declined.' } } });
    await prisma().paynowPlatnosc.create({ data: { userId: k.id, kwotaMinor: 2500, paymentId: 'PN-1', status: 'REJECTED', meta: {} } });
    await prisma().paynowPlatnosc.create({ data: { userId: k.id, kwotaMinor: 2500, paymentId: 'PN-2', status: 'CONFIRMED', meta: {} } });
    const plan = await utworzPlan();
    const sub = await prisma().subscription.create({
      data: { userId: k.id, planId: plan.id, status: 'PAST_DUE', interval: 'MONTH', priceAmount: 45, currency: 'PLN', paymentSource: 'STRIPE_CARD', stripeSubscriptionId: 'sub_x' } as never,
    });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: sub.id, type: 'PAYMENT_FAILED', details: { source: 'STRIPE', reason: 'stripe:invoice:in_123:payment_failed' } } });

    const l = await serwis().nieudanePlatnosci({}, FIN);
    expect(l.wiersze.map((w) => w.zrodlo).sort()).toEqual(['AUTO_DOLADOWANIE', 'PAYNOW', 'STRIPE']);
    const auto = l.wiersze.find((w) => w.zrodlo === 'AUTO_DOLADOWANIE')!;
    expect(auto).toMatchObject({ kwota: '100.00', powod: 'Bank odrzucił płatność kartą.', ponowienie: { mozliwe: true } });
    expect(l.wiersze.find((w) => w.zrodlo === 'PAYNOW')!.ponowienie.mozliwe).toBe(false);
    expect((await serwis().nieudanePlatnosci({ zrodlo: 'PAYNOW' }, FIN)).wiersze).toHaveLength(1);
  });

  it('przegląd: personel nie widzi nieudanych płatności kont zespołu (administrator — tak)', async () => {
    const zespol = await klient(0, { role: 'STAFF' });
    const k = await klient(0);
    for (const u of [zespol, k]) {
      await prisma().paynowPlatnosc.create({ data: { userId: u.id, kwotaMinor: 2500, paymentId: `PN-${u.id.slice(0, 6)}`, status: 'REJECTED', meta: {} } });
      await prisma().auditLog.create({ data: { userId: u.id, action: 'WALLET_AUTO_TOPUP_FAILED', details: { message: 'Your card was declined.' } } });
    }
    const plan = await utworzPlan();
    const sub = await prisma().subscription.create({
      data: { userId: zespol.id, planId: plan.id, status: 'PAST_DUE', interval: 'MONTH', priceAmount: 45, currency: 'PLN', paymentSource: 'STRIPE_CARD', stripeSubscriptionId: 'sub_z' } as never,
    });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: sub.id, type: 'PAYMENT_FAILED', details: { source: 'STRIPE', reason: 'stripe:invoice:in_9:payment_failed' } } });

    const personel = await serwis().nieudanePlatnosci({}, FIN);
    expect(personel.wiersze.map((w) => w.klient.id)).not.toContain(zespol.id);
    expect(personel.wiersze.filter((w) => w.klient.id === k.id)).toHaveLength(2);
    expect((await serwis().nieudanePlatnosci({ userId: zespol.id }, FIN)).wiersze).toHaveLength(0);
    const admin = await serwis().nieudanePlatnosci({}, { userId: FIN.userId, role: 'ADMIN' });
    expect(admin.wiersze.filter((w) => w.klient.id === zespol.id).map((w) => w.zrodlo).sort()).toEqual(['AUTO_DOLADOWANIE', 'PAYNOW', 'STRIPE']);
  });

  it('przegląd: „Ponów” bez zapisanej karty — odmowa dla operatora, bez maila do klienta i bez obciążenia', async () => {
    const k = await zOdmowa();
    await prisma().user.update({ where: { id: k.id }, data: { defaultPaymentMethodId: null } });
    maile.length = 0;
    const s = serwis();
    const z = { userId: k.id, operator: FIN, powod: 'Klient prosi o ponowienie płatności' };
    const wyniki = await Promise.allSettled([s.ponowAutoDoladowanie(z), s.ponowAutoDoladowanie(z)]);
    expect(wyniki.every((w) => w.status === 'rejected' && /nie ma zapisanej karty/.test(String(w.reason)))).toBe(true);
    expect(maile).toHaveLength(0);
    expect(obciazenia).toHaveLength(0);
  });

  it('dwa równoległe „Ponów”: karta obciążona raz; drugie dostaje 409; po sukcesie kolejne ponowienie — 409', async () => {
    const k = await zOdmowa();
    const s = serwis();
    const z = { userId: k.id, operator: FIN, powod: 'Klient doładował kartę, prosi o ponowienie' };
    const wyniki = await Promise.allSettled([s.ponowAutoDoladowanie(z), s.ponowAutoDoladowanie(z)]);
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    expect(obciazenia).toHaveLength(1);
    expect(obciazenia[0]).toMatch(/:ponowienie:/);
    await expect(s.ponowAutoDoladowanie(z)).rejects.toThrow(/udało/);
    expect(obciazenia).toHaveLength(1);
  });

  it('ponowienie, które karta znów odrzuca: błąd dla operatora (nie „zlecono”) i wpis w dzienniku zespołu', async () => {
    const k = await zOdmowa();
    odpowiedzKarty = 'odmowa';
    await expect(serwis().ponowAutoDoladowanie({ userId: k.id, operator: FIN, powod: 'Ponowienie na prośbę klienta' })).rejects.toThrow(/nie przeszła/);
    const d = await prisma().auditLog.findFirstOrThrow({ where: { userId: k.id, action: 'OPERATOR_ACCOUNT_CHANGED' } });
    expect(d.details).toMatchObject({ akcja: 'ponowienie-auto-doladowania', wynik: 'blad' });
  });

  it('płatność w przetwarzaniu nie jest ponawiana', async () => {
    const k = await klient(10, { stripeCustomerId: 'cus_p', defaultPaymentMethodId: 'pm_p' });
    await prisma().walletAutoTopup.create({ data: { userId: k.id, enabled: true, threshold: 50, topupAmount: 100, lastAttemptOk: false, lastAttemptError: 'status=processing', lastAttemptAt: new Date() } });
    await expect(serwis().ponowAutoDoladowanie({ userId: k.id, operator: FIN, powod: 'Ponowienie na prośbę klienta' })).rejects.toThrow(/przetwarzaniu/);
    expect(obciazenia).toHaveLength(0);
  });
});

describe('F3.6 — przypomnienia i zawieszenie (odczyt)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('klient z za małym saldem: przypomnienie T-3 w historii, prognoza zawieszenia z końcem okresu, na liście floty', async () => {
    const k = await klient(5);
    const plan = await utworzPlan();
    const koniec = new Date(Date.now() + 3 * 86400000);
    const s = await prisma().subscription.create({
      data: { userId: k.id, planId: plan.id, status: 'ACTIVE', interval: 'MONTH', priceAmount: 45, currency: 'PLN', paymentSource: 'WALLET', currentPeriodEnd: koniec } as never,
    });
    await prisma().auditLog.create({ data: { userId: k.id, action: 'SUBSCRIPTION_REMINDER_T3', details: { subscriptionId: s.id, amount: '45.00', shortfallAmount: '40.00' } } });
    const w = await serwis().windykacjaKlienta(k.id, FIN);
    expect(w.przypomnienia).toEqual([expect.objectContaining({ akcja: 'SUBSCRIPTION_REMINDER_T3', subscriptionId: s.id, brakuje: '40.00' })]);
    expect(w.uslugi[0]).toMatchObject({ etap: 'odnowienie', kwotaOdnowienia: '45.00', brakuje: '40.00', zawieszenie: koniec.toISOString() });
    const lista = await serwis().windykacjaLista();
    expect(lista.wiersze.map((x) => x.id)).toEqual([s.id]);
  });

  it('audyt Fali 3 — nadużycie dopisane do zawieszenia za brak płatności (zaleglosc): prognoza mówi o zaległości', async () => {
    const k = await klient(0);
    const plan = await utworzPlan();
    const s = await prisma().subscription.create({
      data: { userId: k.id, planId: plan.id, status: 'SUSPENDED', interval: 'MONTH', priceAmount: 45, currency: 'PLN', paymentSource: 'WALLET', currentPeriodEnd: new Date(Date.now() - 5 * 86400000) } as never,
    });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: s.id, type: 'SUSPENDED', details: { reason: 'GRACE_EXPIRED' }, createdAt: new Date(Date.now() - 3 * 86400000) } });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: s.id, type: 'SUSPENDED', details: { reason: 'ABUSE', zaleglosc: true } } });
    const w = await serwis().windykacjaKlienta(k.id, FIN);
    expect(w.uslugi[0]).toMatchObject({ etap: 'zawieszona', wygasniecie: null });
    expect(JSON.stringify(w.uslugi[0])).toMatch(/z zaległą płatnością/);
  });
});
