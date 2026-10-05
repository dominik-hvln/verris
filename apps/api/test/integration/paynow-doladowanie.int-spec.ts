import { Prisma, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { DoladowanieService } from '../../src/billing/doladowanie.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import { podpisPowiadomienia } from '../../src/billing/paynow/paynow.client.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * 2026-10-05 — Paynow na prawdziwej bazie: dwa powiadomienia CONFIRMED i sprawdzenie po powrocie
 * klienta równocześnie → portfel uznany raz (unikalny idempotencyKey w księdze + warunkowe przejście
 * rekordu na CONFIRMED). Zwrot: K cofnięte raz także przy ponowieniu z tym samym refundId
 * (blokada rekordu FOR UPDATE + tablica zwrotyIds).
 */
const SIG = 'sig-key-int';
const PID = 'NOLV-8F9-08K-WGD';
const pusty = new Proxy({}, { get: () => async () => undefined }) as never;

function serwis(mailer: { send: (...a: unknown[]) => Promise<void> }) {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const cfg: Record<string, string> = { paynowApiKey: 'api-key-int', paynowSignatureKey: SIG, paynowApiUrl: 'https://api.sandbox.paynow.pl' };
  return new BillingService(
    p, ledger, null as never, new AuditService(p), { get: (k: string) => cfg[k] } as never,
    null as never, null as never, mailer as never, pusty,
    { safeAward: async () => undefined, awardWalletTopup: async () => 0 } as never,
    new DoladowanieService(p, ledger, pusty),
  );
}

describe('Paynow: księgowanie i zwrot na Postgresie', () => {
  const fetchMock = vi.fn();
  beforeEach(async () => {
    await wyczyscBaze();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(rozlacz);

  it('2× CONFIRMED + sprawdzenie po powrocie równocześnie → jedno uznanie; zwrot cofa K raz', async () => {
    const u = await prisma().user.create({ data: { email: `pn-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const rek = await prisma().paynowPlatnosc.create({
      data: { userId: u.id, kwotaMinor: 4567, paymentId: PID, status: 'PENDING', meta: { kind: 'wallet_topup', vatKod: 'PL', vatStawka: '23', vatKraj: 'PL' } },
    });
    const mailer = { send: vi.fn(async () => undefined) };
    const b = serwis(mailer);
    const raw = Buffer.from(JSON.stringify({ paymentId: PID, externalId: rek.id, status: 'CONFIRMED', modifiedAt: '2026-10-05T10:00:00' }));
    const podpis = podpisPowiadomienia(SIG, raw);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ paymentId: PID, status: 'CONFIRMED' }) });

    const wyniki = await Promise.allSettled([
      b.handlePaynowNotification(raw, podpis),
      b.handlePaynowNotification(raw, podpis),
      b.sprawdzPlatnoscPaynow(u.id, rek.id),
    ]);
    // Przegrany wyścigu może rzucić (Paynow ponowi) — ważne, że pieniądze weszły raz.
    expect(wyniki.some((w) => w.status === 'fulfilled')).toBe(true);
    await b.handlePaynowNotification(raw, podpis); // ponowienie po ewentualnym błędzie

    const wpisy = await prisma().walletTransaction.findMany({ where: { userId: u.id, type: WalletTxType.TOPUP } });
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0]).toMatchObject({ idempotencyKey: `paynow:${PID}`, paymentProvider: 'PAYNOW', paymentRef: PID });
    expect(wpisy[0].amount.toFixed(2)).toBe('45.67');
    const po = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.walletBalance.toFixed(2)).toBe('45.67');
    expect(await prisma().paynowPlatnosc.findUniqueOrThrow({ where: { id: rek.id } })).toMatchObject({ status: 'CONFIRMED', walletTxId: wpisy[0].id });
    expect(await prisma().auditLog.count({ where: { action: 'WALLET_TOPUP_COMPLETED' } })).toBe(1);

    // Zwrot 20 zł; drugie wywołanie dostaje od Paynow ten sam refundId (ponowienie) — K nie schodzą drugi raz.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ refundId: 'RE6-9YD-ULU-MRL', status: 'PENDING' }) });
    await b.zwrocPlatnoscPaynow({ walletTxId: wpisy[0].id, kwota: 20, actorUserId: u.id });
    await b.zwrocPlatnoscPaynow({ walletTxId: wpisy[0].id, kwota: 20, actorUserId: u.id });
    const poZwrocie = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(poZwrocie.walletBalance.toFixed(2)).toBe('25.67');
    const r = await prisma().paynowPlatnosc.findUniqueOrThrow({ where: { id: rek.id } });
    expect(r.zwrotyIds).toEqual(['RE6-9YD-ULU-MRL']);
    expect(r.zwroconoMinor).toBe(2000);
    const cofniecia = await prisma().walletTransaction.findMany({ where: { userId: u.id, type: WalletTxType.ADJUSTMENT } });
    expect(cofniecia).toHaveLength(1);
    expect(new Prisma.Decimal(cofniecia[0].amount).toFixed(2)).toBe('-20.00');
  });
});
