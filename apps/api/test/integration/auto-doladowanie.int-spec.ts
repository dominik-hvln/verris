import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletAutoTopupService } from '../../src/billing/wallet-auto-topup.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — auto-doładowanie portfela z zapisanej karty (Stripe off-session) na prawdziwej bazie:
 * próg, okres karencji, dwa nakładające się przebiegi harmonogramu, odmowa karty i 3DS.
 * Stripe jest atrapą, która liczy obciążenia — prawdziwy Stripe scaliłby tylko żądania z tym
 * samym kluczem idempotencji, a klucz zmienia się co godzinę.
 */
const obciazenia: { klucz: string; kwota: number }[] = [];
let odpowiedz: 'succeeded' | 'requires_action' | 'odmowa' = 'succeeded';
let opoznienieMs = 0;
const stripe = {
  isConfigured: () => true,
  createOffSessionPaymentIntent: async (i: { amountMinor: number; idempotencyKey: string }) => {
    await new Promise((r) => setTimeout(r, opoznienieMs));
    if (odpowiedz === 'odmowa') throw new Error('Your card was declined.');
    obciazenia.push({ klucz: i.idempotencyKey, kwota: i.amountMinor });
    return { id: `pi_${obciazenia.length}`, status: odpowiedz };
  },
};
const maile: string[] = [];
const serwis = () => {
  const p = prisma() as never;
  return new WalletAutoTopupService(p, stripe as never, new AuditService(p), { send: async (m: { to: string }) => void maile.push(m.to) } as never, { get: () => undefined } as never);
};

let n = 0;
async function klient(saldo: number, reguła: Record<string, unknown> = {}) {
  n += 1;
  const u = await prisma().user.create({
    data: { email: `auto-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo, stripeCustomerId: `cus_${n}`, defaultPaymentMethodId: `pm_${n}` },
  });
  await prisma().walletAutoTopup.create({ data: { userId: u.id, enabled: true, threshold: 50, topupAmount: 100, ...reguła } });
  return u;
}
const regula = (userId: string) => prisma().walletAutoTopup.findUniqueOrThrow({ where: { userId } });

describe('X-04 auto-doładowanie portfela', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    obciazenia.length = 0;
    maile.length = 0;
    odpowiedz = 'succeeded';
    opoznienieMs = 0;
  });
  afterAll(rozlacz);

  it('saldo poniżej progu: jedno obciążenie na kwotę reguły; powyżej progu: nic', async () => {
    await klient(20);
    await klient(80);
    await serwis().runEligibleChecks();
    expect(obciazenia).toEqual([expect.objectContaining({ kwota: 10000 })]);
  });

  it('w okresie karencji (webhook jeszcze nie dopisał środków) kolejny przebieg nie obciąża drugi raz', async () => {
    const u = await klient(20);
    await serwis().runEligibleChecks();
    await serwis().runEligibleChecks();
    expect(obciazenia).toHaveLength(1);
    expect((await regula(u.id)).cooldownUntil).not.toBeNull();
  });

  it('dwa nakładające się przebiegi harmonogramu: karta obciążona raz', async () => {
    await klient(20);
    opoznienieMs = 100;
    await Promise.all([serwis().runEligibleChecks(), serwis().runEligibleChecks()]);
    expect(obciazenia).toHaveLength(1);
  });

  it('odmowa karty: bez obciążenia, karencja, mail do klienta; 3DS też kończy się karencją i mailem', async () => {
    const a = await klient(10);
    odpowiedz = 'odmowa';
    await serwis().runEligibleChecks();
    const r = await regula(a.id);
    expect(r.lastAttemptOk).toBe(false);
    expect(r.lastAttemptError).toMatch(/declined/);
    expect(r.cooldownUntil).not.toBeNull();
    expect(maile).toHaveLength(1);

    const b = await klient(10);
    odpowiedz = 'requires_action';
    await serwis().runEligibleChecks();
    expect((await regula(b.id)).lastAttemptOk).toBe(false);
    expect(maile).toHaveLength(2);
  });
});
