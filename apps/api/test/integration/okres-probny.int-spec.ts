import { WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { TrialService } from '../../src/subscriptions/trial.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * X-04 — koniec okresu próbnego vs przejście na płatny w tej samej chwili, na prawdziwej bazie.
 * Stan końcowy musi być spójny: albo usługa płatna, aktywna i opłacona raz, albo wygasła,
 * zawieszona i bez obciążenia — nigdy „zapłacone, a konto zawieszone”.
 */
const zawieszone: string[] = [];
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const ledger = new WalletLedgerService(p);
  const subs = new SubscriptionsService(
    p, audit, ledger, null as never, null as never, null as never, null as never,
    { send: async () => ({}) } as never, { get: () => undefined } as never, null as never, null as never,
    null as never, null as never,
  );
  (subs as unknown as { suspendOnDa: (s: string, u: string) => Promise<void> }).suspendOnDa = async (_s, u) => void zawieszone.push(u);
  const trial = new TrialService(p, audit, { send: async () => ({}) } as never, ledger, null as never, null as never, { get: () => undefined } as never);
  return { subs, trial, ledger };
}

async function trial(saldo: number) {
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
  await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: saldo } });
  await prisma().subscription.update({
    where: { id: k.subscription.id },
    data: { isTrial: true, status: 'ACTIVE', trialEndsAt: new Date(Date.now() - 60_000) },
  });
  return k;
}
const stan = async (subId: string, userId: string, accountId: string) => ({
  sub: await prisma().subscription.findUniqueOrThrow({ where: { id: subId } }),
  saldo: Number((await prisma().user.findUniqueOrThrow({ where: { id: userId } })).walletBalance),
  konto: (await prisma().account.findUniqueOrThrow({ where: { id: accountId } })).status,
  obciazenia: await prisma().walletTransaction.count({ where: { userId, type: WalletTxType.CHARGE_SUBSCRIPTION } }),
});

describe('X-04 okres próbny', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zawieszone.length = 0;
  });
  afterAll(rozlacz);

  it('klient przechodzi na płatny w trakcie wygaszania (zawieszanie na serwerze trwa): bez „zapłacone i zawieszone”', async () => {
    const k = await trial(100);
    const { subs, trial: t } = uslugi();
    let konwersja: Promise<unknown> = Promise.resolve();
    (subs as unknown as { suspendOnDa: (s: string, u: string) => Promise<void> }).suspendOnDa = async (_s, u) => {
      konwersja = t.convertFromWallet(k.user.id, k.subscription.id).catch(() => undefined);
      await konwersja;
      zawieszone.push(u);
    };
    await subs.expireTrial(k.subscription.id).catch(() => undefined);
    await konwersja;
    const s = await stan(k.subscription.id, k.user.id, k.account.id);
    const platna = s.sub.status === 'ACTIVE' && !s.sub.isTrial;
    if (platna) {
      expect(s.konto).not.toBe('SUSPENDED');
      expect(zawieszone).toHaveLength(0);
    } else {
      expect(s.sub.status).toBe('EXPIRED');
      expect(s.saldo).toBe(100);
    }
  });

  it('wygaszenie wpada w trakcie konwersji (po obciążeniu portfela): pieniądze wracają albo usługa zostaje płatna', async () => {
    const k = await trial(100);
    const { subs, trial: t, ledger } = uslugi();
    const debit = ledger.debit.bind(ledger);
    (ledger as unknown as { debit: typeof ledger.debit }).debit = async (i) => {
      const tx = await debit(i);
      await subs.expireTrial(k.subscription.id).catch(() => undefined);
      return tx;
    };
    await t.convertFromWallet(k.user.id, k.subscription.id).catch(() => undefined);
    const s = await stan(k.subscription.id, k.user.id, k.account.id);
    const platna = s.sub.status === 'ACTIVE' && !s.sub.isTrial;
    if (platna) {
      expect(s.konto).not.toBe('SUSPENDED');
    } else {
      expect(s.sub.status).toBe('EXPIRED');
      expect(s.saldo).toBe(100);
    }
  });
});
