import { WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { DoladowanieService } from '../../src/billing/doladowanie.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import { PartnerCommissionScheduler } from '../../src/partners/partner-commission.scheduler.js';
import { dopasujProwizjeDoGotowki } from '../../src/partners/prowizje-a-cofniecia.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Decyzja 15.10 (#2) — kradziona karta → doładowanie → zakup → zwrot/spór przy pustym portfelu. Cofnięcie nie zostawiało
 * śladu w księdze (saldo 0), więc prowizja partnera liczyła wpłatę jako gotówkę i po karencji szła przelewem.
 * Teraz: znacznik na wpłacie (kwotaCofnieta) i przeliczenie prowizji niewypłaconych; wypłacone — do decyzji admina.
 */
const pusty = new Proxy({}, { get: () => async () => undefined }) as never;

function billing() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  // Tylko „zwrot zrobiony w panelu Paynow” — bez wywołań API.
  const cfg: Record<string, string> = { paynowApiKey: 'k', paynowSignatureKey: 's', paynowApiUrl: 'https://api.sandbox.paynow.pl' };
  return new BillingService(
    p, ledger, null as never, new AuditService(p), { get: (k: string) => cfg[k] } as never,
    null as never, null as never, { send: async () => undefined } as never, pusty,
    { safeAward: async () => undefined, awardWalletTopup: async () => 0 } as never,
    new DoladowanieService(p, ledger, pusty),
  );
}

let n = 0;
async function scena() {
  n += 1;
  const p = prisma();
  const admin = await p.user.create({ data: { email: `adm-pc-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
  const partner = await p.user.create({ data: { email: `par-pc-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
  await p.referralProgramEnrollment.create({ data: { userId: partner.id, status: 'APPROVED' } });
  // Polecony wydał całą wpłatę — portfel pusty.
  const polecony = await p.user.create({ data: { email: `pol-pc-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', referredByUserId: partner.id, walletBalance: 0 } });
  const wplata = await p.walletTransaction.create({
    data: { userId: polecony.id, type: WalletTxType.TOPUP, amount: 100, balanceAfter: 100, idempotencyKey: `paynow:PC-${n}`, paymentProvider: 'PAYNOW', paymentRef: `PC-${n}`, metadata: { wplata: { kwota: '100.00' } } },
  });
  await p.paynowPlatnosc.create({
    data: { userId: polecony.id, kwotaMinor: 10000, paymentId: `PC-${n}`, status: 'CONFIRMED', walletTxId: wplata.id, meta: { kind: 'wallet_topup' } },
  });
  const prowizja = (nazwa: string, status: 'PENDING' | 'AVAILABLE' | 'PAID', base: number, minutTemu: number) =>
    p.partnerCommission.create({
      data: {
        partnerUserId: partner.id, referredUserId: polecony.id, kind: 'RECURRING_PCT', dedupeKey: `tx:${nazwa}-${n}`, baseAmount: base, pct: 10,
        amount: base / 10, status, createdAt: new Date(Date.now() - minutTemu * 60_000), description: nazwa,
      },
    });
  const wyplacona = await prowizja('wyplacona', 'PAID', 30, 30);
  const dojrzala = await prowizja('dojrzala', 'AVAILABLE', 40, 20);
  const wKarencji = await prowizja('karencja', 'PENDING', 30, 10);
  return { admin, partner, polecony, wplata, wyplacona, dojrzala, wKarencji };
}
const stan = (id: string) => prisma().partnerCommission.findUniqueOrThrow({ where: { id } });

describe('decyzja 15.10 (#2) — cofnięcie wpłaty poleconego a prowizje partnera', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('pełny zwrot przy pustym portfelu: znacznik na wpłacie, niewypłacone prowizje anulowane, wypłacona do decyzji admina', async () => {
    const s = await scena();
    await billing().zwrocPlatnoscPaynow({ walletTxId: s.wplata.id, actorUserId: s.admin.id, wPaneluPaynow: true });

    expect((await prisma().walletTransaction.findUniqueOrThrow({ where: { id: s.wplata.id } })).kwotaCofnieta?.toFixed(2)).toBe('100.00');
    expect((await stan(s.wKarencji.id)).status).toBe('CANCELED');
    expect((await stan(s.dojrzala.id)).status).toBe('CANCELED');
    expect(await stan(s.wyplacona.id)).toMatchObject({ status: 'PAID' });
    const alarm = await prisma().notification.findFirstOrThrow({ where: { userId: s.admin.id } });
    expect(alarm.body).toContain('zmniejszono o 7.00 zł');
    expect(alarm.body).toContain('od 30.00 zł tej wpłaty są już wypłacone');

    // Nowa opłata poleconego nie daje prowizji — gotówki po cofnięciu nie ma.
    await prisma().walletTransaction.create({ data: { userId: s.polecony.id, type: WalletTxType.CHARGE_SUBSCRIPTION, amount: -50, balanceAfter: 0 } });
    const cfg = { enabled: true, commissionPct: 10, holdDays: 30, freeHostingThreshold: 0, freeHostingCredit: 0 };
    await new PartnerCommissionScheduler(prisma() as never, { getPartnerProgram: async () => cfg } as never).run();
    expect(await prisma().partnerCommission.count({ where: { referredUserId: s.polecony.id, status: { not: 'CANCELED' } } })).toBe(1);
  });

  it('częściowy zwrot: zdejmuje od najnowszych — karencja anulowana, dojrzała pomniejszona; drugi przebieg nic nie zmienia', async () => {
    const s = await scena();
    await billing().zwrocPlatnoscPaynow({ walletTxId: s.wplata.id, kwota: 50, actorUserId: s.admin.id, wPaneluPaynow: true });
    expect((await stan(s.wKarencji.id)).status).toBe('CANCELED');
    const d = await stan(s.dojrzala.id);
    expect([d.status, d.baseAmount?.toFixed(2), d.amount.toFixed(2)]).toEqual(['AVAILABLE', '20.00', '2.00']);
    expect((await stan(s.wyplacona.id)).status).toBe('PAID');
    const drugi = await dopasujProwizjeDoGotowki(prisma() as never, s.polecony.id);
    expect([drugi.zmniejszono.toFixed(2), drugi.pozostalo.toFixed(2)]).toEqual(['0.00', '0.00']);
  });
});
