import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { TrialService } from '../../src/subscriptions/trial.service.js';
import { LimitWysylkiProbyService } from '../../src/subscriptions/limit-wysylki-proby.service.js';
import { DomainRegistrarService } from '../../src/domains/domain-registrar.service.js';
import { LIMIT_WYSYLKI_PROBY, maTylkoProbne } from '../../src/subscriptions/okres-probny.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * 1.11 — ograniczenia okresu próbnego na prawdziwej bazie: limit wysyłki 100/dobę (zadanie węzła), przywrócenie
 * domyślnego po konwersji, bez domen i bez dodatkowej mocy, dopóki klient ma tylko próbę.
 */
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const ledger = new WalletLedgerService(p);
  const limit = new LimitWysylkiProbyService(p, audit);
  const subs = new SubscriptionsService(
    p, audit, ledger, null as never, null as never, null as never, null as never,
    { send: async () => ({}) } as never, { get: () => undefined } as never, null as never, null as never,
    null as never, null as never,
  );
  const trial = new TrialService(p, audit, { send: async () => ({}) } as never, ledger, null as never, null as never, { get: () => undefined } as never, limit);
  return { limit, subs, trial };
}

async function proba(opts: { saldo?: number; mailSendLimit?: number | null } = {}) {
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
  await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: opts.saldo ?? 0 } });
  await prisma().subscription.update({
    where: { id: k.subscription.id },
    data: { isTrial: true, status: 'ACTIVE', trialEndsAt: new Date(Date.now() + 10 * 24 * 3600_000) },
  });
  if (opts.mailSendLimit !== undefined) {
    await prisma().account.update({ where: { id: k.account.id }, data: { mailSendLimit: opts.mailSendLimit } });
  }
  return k;
}

const zadaniaLimitu = (accountId: string) =>
  prisma().nodeTask.findMany({ where: { accountId, kind: 'MAIL_QUEUE' }, orderBy: { createdAt: 'asc' } });

describe('1.11 – ograniczenia okresu próbnego', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('uzgadnianie zleca węzłowi limit 100/dobę kontu próbnemu – raz, bez dubli', async () => {
    const k = await proba();
    const { limit } = uslugi();
    await expect(limit.uzgodnij()).resolves.toBe(1);
    await expect(limit.uzgodnij()).resolves.toBe(0);
    const t = await zadaniaLimitu(k.account.id);
    expect(t).toHaveLength(1);
    expect(t[0].payload).toEqual({ mode: 'limit', daUser: k.account.daUsername, limit: String(LIMIT_WYSYLKI_PROBY) });
    expect(t[0].serverId).toBe(k.account.serverId);
  });

  it('konto z potwierdzonym limitem próby i płatna usługa – bez zadań', async () => {
    await proba({ mailSendLimit: LIMIT_WYSYLKI_PROBY });
    const platna = await proba();
    await prisma().subscription.update({ where: { id: platna.subscription.id }, data: { isTrial: false } });
    await expect(uslugi().limit.uzgodnij()).resolves.toBe(0);
    expect(await prisma().nodeTask.count()).toBe(0);
  });

  it('węzeł nie potwierdził (FAILED) – ponowienie dopiero po 6 godzinach, błąd zostaje widoczny', async () => {
    const k = await proba();
    const { limit } = uslugi();
    await limit.uzgodnij();
    const [t] = await zadaniaLimitu(k.account.id);
    await prisma().nodeTask.update({ where: { id: t.id }, data: { status: 'FAILED', errorMessage: 'Serwer nie potwierdził nowego limitu' } });
    await expect(limit.uzgodnij()).resolves.toBe(0);
    await prisma().nodeTask.update({ where: { id: t.id }, data: { createdAt: new Date(Date.now() - 7 * 3600_000) } });
    await expect(limit.uzgodnij()).resolves.toBe(1);
    expect((await zadaniaLimitu(k.account.id)).map((x) => x.status)).toEqual(['FAILED', 'QUEUED']);
  });

  it('konwersja na płatny zleca przywrócenie domyślnego limitu za zadaniem limitu próby', async () => {
    const k = await proba({ saldo: 100 });
    const { limit, trial } = uslugi();
    await limit.uzgodnij();
    await trial.convertFromWallet(k.user.id, k.subscription.id);
    const t = await zadaniaLimitu(k.account.id);
    expect(t.map((x) => (x.payload as { limit?: string }).limit)).toEqual([String(LIMIT_WYSYLKI_PROBY), 'domyslny']);
    // Po konwersji uzgadnianie już tej usługi nie dotyka.
    await expect(limit.uzgodnij()).resolves.toBe(0);
  });

  it('konwersja, zanim limit próby był zlecony – nic do przywracania', async () => {
    const k = await proba({ saldo: 100 });
    await uslugi().trial.convertFromWallet(k.user.id, k.subscription.id);
    expect(await zadaniaLimitu(k.account.id)).toHaveLength(0);
  });

  it('domeny: tylko próba → blokada; płatna usługa obok albo brak usług → bez blokady', async () => {
    const k = await proba();
    expect(await maTylkoProbne(prisma() as never, k.user.id)).toBe(true);
    const provider = { get: vi.fn(() => { throw new Error('rejestrator nie powinien być wołany'); }) };
    const reg = new DomainRegistrarService(prisma() as never, null as never, null as never, provider as never, null as never, null as never, null as never, null as never, null as never);
    const registrant = {} as never;
    await expect(reg.register(k.user.id, k.user.id, { name: 'nowa-domena.pl', registrant, withdrawalWaiverConsent: true })).rejects.toThrow(ForbiddenException);
    await expect(reg.transfer(k.user.id, k.user.id, { name: 'nowa-domena.pl', authCode: 'x', registrant, withdrawalWaiverConsent: true })).rejects.toThrow(
      'W czasie okresu próbnego nie zarejestrujesz domeny',
    );
    expect(provider.get).not.toHaveBeenCalled();

    const wezel = await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const platny = await utworzKonto({ serverId: wezel.id, planId: plan.id });
    await prisma().subscription.update({ where: { id: platny.subscription.id }, data: { status: 'ACTIVE', isTrial: false, userId: k.user.id } });
    expect(await maTylkoProbne(prisma() as never, k.user.id)).toBe(false);
    const bezUslug = await prisma().user.create({ data: { email: 'tylko-domena@test.verris.pl', passwordHash: 'x' } });
    expect(await maTylkoProbne(prisma() as never, bezUslug.id)).toBe(false);
  });

  it('autoskalowanie: włączenie w próbie odrzucone, wyłączenie wolno, po konwersji wolno włączyć', async () => {
    const k = await proba({ saldo: 100 });
    const { subs, trial } = uslugi();
    await expect(subs.setAutoscaling({ userId: k.user.id, subscriptionId: k.subscription.id, enabled: true })).rejects.toThrow(ForbiddenException);
    await expect(subs.setAutoscaling({ userId: k.user.id, subscriptionId: k.subscription.id, enabled: false })).resolves.toBeTruthy();
    await trial.convertFromWallet(k.user.id, k.subscription.id);
    const s = await subs.setAutoscaling({ userId: k.user.id, subscriptionId: k.subscription.id, enabled: true });
    expect(s.autoscalingEnabled).toBe(true);
  });
});
