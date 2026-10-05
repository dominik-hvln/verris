import { WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { SslService } from '../../src/ssl/ssl.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * G-08 — płatny certyfikat SSL na prawdziwej bazie: portfel obciążony dokładnie raz (także przy dwukliku —
 * indeks częściowy SslOrder_w_toku_key), pełny zwrot przy odrzuceniu przez wystawcę, brak środków bez wystawcy.
 * Wystawca, serwer hostingowy, poczta i powiadomienia to atrapy (systemy zewnętrzne).
 */

let wystawcaPada = false;
let stan: 'pending' | 'failed' = 'pending';
const wystawca = {
  sslCreateOrder: vi.fn(async () => {
    if (wystawcaPada) throw new Error('OpenProvider: product not available');
    return '501';
  }),
  sslOrder: vi.fn(async () => ({ state: stan, certificate: null, caBundle: null, dns: null })),
  sslProducts: vi.fn(),
};

function usluga() {
  const p = prisma() as never;
  return new SslService(
    p,
    new AuditService(p),
    { encrypt: (v: string) => `enc:${v.length}`, decrypt: () => '' } as never,
    { getSsl: () => wystawca } as never,
    new WalletLedgerService(p),
    { getSslPrices: async () => ({ '5': { price: '89.99', name: 'PositiveSSL', wildcard: false } }) } as never,
    { listHostingDomainsForSubscription: async () => ({ domains: [{ name: 'firma.pl' }], fetchError: null }), createHostingDnsRecord: vi.fn() } as never,
    { create: vi.fn() } as never,
    { send: vi.fn(async () => undefined) } as never,
    { get: () => undefined } as never,
    {} as never,
  );
}

async function klient(saldo: number) {
  const plan = await utworzPlan();
  const user = await prisma().user.create({ data: { email: `ssl-${Date.now()}-${Math.random()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
  const sub = await prisma().subscription.create({ data: { userId: user.id, planId: plan.id, interval: 'MONTH', priceAmount: plan.priceMonthly } });
  return { userId: user.id, subId: sub.id };
}
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const zamowienie = { domain: 'firma.pl', productId: 5, validation: 'DNS' as const };

describe('G-08 płatny certyfikat SSL — pieniądze', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    wystawcaPada = false;
    stan = 'pending';
    vi.clearAllMocks();
  });
  afterAll(rozlacz);

  it('jedno obciążenie za cenę z cennika; drugie zamówienie w toku (dwuklik) odrzucone bez drugiego obciążenia', async () => {
    const svc = usluga();
    const k = await klient(200);
    const [a, b] = await Promise.allSettled([svc.zamow(k.userId, k.userId, k.subId, zamowienie), svc.zamow(k.userId, k.userId, k.subId, zamowienie)]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    const tx = await prisma().walletTransaction.findMany({ where: { userId: k.userId, type: WalletTxType.CHARGE_USAGE } });
    expect(tx).toHaveLength(1);
    expect(Number(tx[0].amount)).toBeCloseTo(-89.99, 2);
    expect(await saldo(k.userId)).toBeCloseTo(110.01, 2);
    const z = await prisma().sslOrder.findFirstOrThrow({ where: { userId: k.userId } });
    expect(z).toMatchObject({ status: 'VALIDATING', providerOrderId: '501', walletTxId: tx[0].id });
    expect(wystawca.sslCreateOrder).toHaveBeenCalledTimes(1);
  });

  it('wystawca odrzuca zamówienie: pełny zwrot, zamówienie FAILED, można zamówić ponownie', async () => {
    const svc = usluga();
    const k = await klient(200);
    wystawcaPada = true;
    await expect(svc.zamow(k.userId, k.userId, k.subId, zamowienie)).rejects.toThrow('opłata wróciła do portfela');
    expect(await saldo(k.userId)).toBe(200);
    expect((await prisma().sslOrder.findFirstOrThrow({ where: { userId: k.userId } })).status).toBe('FAILED');
    wystawcaPada = false;
    await expect(svc.zamow(k.userId, k.userId, k.subId, zamowienie)).resolves.toMatchObject({ status: 'VALIDATING' });
  });

  it('odrzucenie po weryfikacji (harmonogram, dwa przebiegi): zwrot dokładnie raz', async () => {
    const svc = usluga();
    const k = await klient(200);
    await svc.zamow(k.userId, k.userId, k.subId, zamowienie);
    stan = 'failed';
    await svc.synchronizuj();
    await svc.synchronizuj();
    expect(await saldo(k.userId)).toBe(200);
    const zwroty = await prisma().walletTransaction.findMany({ where: { userId: k.userId, type: WalletTxType.REFUND } });
    expect(zwroty).toHaveLength(1);
  });

  it('brak środków: bez wywołania wystawcy, portfel nietknięty', async () => {
    const svc = usluga();
    const k = await klient(10);
    await expect(svc.zamow(k.userId, k.userId, k.subId, zamowienie)).rejects.toThrow('Brak wystarczających środków');
    expect(wystawca.sslCreateOrder).not.toHaveBeenCalled();
    expect(await saldo(k.userId)).toBe(10);
  });
});
