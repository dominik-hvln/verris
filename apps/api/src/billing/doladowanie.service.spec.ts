import { Prisma } from '@verris/database';
import { DoladowanieService } from './doladowanie.service.js';
import { WalletLedgerService } from './wallet-ledger.service.js';
import { VatNabywcyService } from './vat-nabywcy.service.js';

/**
 * M-09/M-10/M-34 — doładowanie: ile K, jaka stawka, dokument przy wpłacie.
 * Prawdziwy WalletLedgerService na atrapie Prismy — sprawdzamy, co ląduje w bazie.
 */
function zbuduj(opts: {
  kraj?: string;
  nip?: string | null;
  model?: string;
  vies?: boolean | null;
  kurs?: number;
} = {}) {
  const ustawienia: Record<string, string> = { 'faktury.model': opts.model ?? 'przy_doladowaniu', 'faktury.tryb': 'zewnetrzny' };
  const wpisy: Array<Record<string, unknown>> = [];
  const dokumenty: Array<Record<string, unknown>> = [];
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('platform_settings')) {
        const v = ustawienia[String(vals[0])];
        return v ? [{ value: v }] : [];
      }
      if (sql.includes('FOR UPDATE')) return [{ id: 'u1', walletBalance: new Prisma.Decimal(1000), walletCurrency: 'PLN' }];
      if (sql.includes('InvoiceCounter')) return [{ seq: 7 }];
      if (sql.includes('"Invoice"')) return [];
      return [];
    }),
    user: {
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => ({ country: opts.kraj ?? 'PL', nip: opts.nip ?? null })),
    },
    walletTransaction: {
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        const w = { id: `w${wpisy.length + 1}`, ...a.data };
        wpisy.push(w);
        return w;
      }),
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null),
    },
    invoice: {
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        dokumenty.push(a.data);
        return { id: 'inv1', number: String(a.data.number) };
      }),
    },
  };
  const prisma = { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const ledger = new WalletLedgerService(prisma as never);
  const vies = { sprawdz: vi.fn(async () => ({ wazny: opts.vies ?? null, kodKraju: 'DE', numer: '1', nazwa: null, data: 'd', identyfikator: 'WAPI', blad: null })) };
  const ps = { getSellerCompany: vi.fn(async () => ({ nip: '7251234567' })) };
  const svc = new DoladowanieService(prisma as never, ledger, new VatNabywcyService(prisma as never, vies as never, ps as never));
  const orig = global.fetch;
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ rates: [{ no: '183/A/NBP/2026', effectiveDate: '2026-09-22', mid: opts.kurs ?? 4.25 }] }),
  })) as never;
  return { svc, wpisy, dokumenty, vies, przywroc: () => (global.fetch = orig) };
}

const zaksieguj = (svc: DoladowanieService, kwotaMinor: number, waluta = 'pln', meta?: Record<string, string>) =>
  svc.zaksieguj({
    userId: 'u1', kwotaMinor, waluta, meta, idempotencyKey: `k${kwotaMinor}${waluta}`, paymentRef: 'pi', opis: 'x',
    zaplaconoAt: new Date('2026-09-23T10:00:00Z'),
  });

describe('DoladowanieService', () => {
  it('klient z PL, PLN: 1 zł = 1 K, dokument 23% przy wpłacie', async () => {
    const t = zbuduj();
    const r = await zaksieguj(t.svc, 10000);
    t.przywroc();
    expect(r.kredytK.toFixed(2)).toBe('100.00');
    expect(t.dokumenty).toHaveLength(1);
    const d = t.dokumenty[0] as { amount: Prisma.Decimal; vatAmount: Prisma.Decimal; provider: string; number: string };
    expect(d.amount.toFixed(2)).toBe('100.00');
    expect(d.vatAmount.toFixed(2)).toBe('18.70');
    expect(d.provider).toBe('WALLET_TOPUP');
    expect(d.number).toMatch(/^VDR\//);
  });

  it('firma z UE z ważnym VIES: np, odwrotne obciążenie, 1,23 K za 1 zł', async () => {
    const t = zbuduj({ kraj: 'DE', nip: 'DE123456789', vies: true });
    const r = await zaksieguj(t.svc, 10000);
    t.przywroc();
    expect(r.kredytK.toFixed(2)).toBe('123.00');
    const d = t.dokumenty[0] as { vatAmount: Prisma.Decimal; buyerSnapshot: { vat: { kod: string; adnotacja: string; vies: { identyfikator: string } } } };
    expect(d.vatAmount.toFixed(2)).toBe('0.00');
    expect(d.buyerSnapshot.vat).toMatchObject({ kod: 'OO', adnotacja: 'odwrotne obciążenie', vies: { identyfikator: 'WAPI' } });
  });

  it('wpłata w EUR: K po kursie NBP z dnia poprzedniego, dokument w EUR z VAT w PLN', async () => {
    const t = zbuduj({ kurs: 4.25 });
    const r = await zaksieguj(t.svc, 2000, 'eur');
    t.przywroc();
    expect(r.kredytK.toFixed(2)).toBe('85.00');
    const d = t.dokumenty[0] as { currency: string; buyerSnapshot: { vat: { vatPln: string; kurs: { tabela: string } } } };
    expect(d.currency).toBe('EUR');
    expect(d.buyerSnapshot.vat.kurs.tabela).toBe('183/A/NBP/2026');
    expect(d.buyerSnapshot.vat.vatPln).toBe((3.74 * 4.25).toFixed(2));
  });

  it('stawka z metadanych płatności wygrywa z bieżącym VIES', async () => {
    const t = zbuduj({ kraj: 'DE', nip: 'DE1', vies: false });
    const r = await zaksieguj(t.svc, 1000, 'pln', { vatKod: 'OO', vatStawka: 'np', vatKraj: 'DE' });
    t.przywroc();
    expect(r.kredytK.toFixed(2)).toBe('12.30');
    expect(t.vies.sprawdz).not.toHaveBeenCalled();
  });

  it('model przy_obciazeniu: wpłata bez dokumentu (stary model Z-01)', async () => {
    const t = zbuduj({ model: 'przy_obciazeniu' });
    await zaksieguj(t.svc, 5000);
    t.przywroc();
    expect(t.dokumenty).toHaveLength(0);
  });

  it('obciążenie w modelu przy_doladowaniu: bez dokumentu i ze znacznikiem dla faktury zbiorczej', async () => {
    const t = zbuduj();
    const ledger = (t.svc as unknown as { ledger: WalletLedgerService }).ledger;
    await ledger.debit({ userId: 'u1', amount: 45, type: 'CHARGE_SUBSCRIPTION' as never });
    t.przywroc();
    expect(t.dokumenty).toHaveLength(0);
    expect(t.wpisy[0].metadata).toEqual({ m34: 'przy_doladowaniu' });
  });

  it('obciążenie w modelu przy_obciazeniu: dokument jak dotąd', async () => {
    const t = zbuduj({ model: 'przy_obciazeniu' });
    const ledger = (t.svc as unknown as { ledger: WalletLedgerService }).ledger;
    await ledger.debit({ userId: 'u1', amount: 45, type: 'CHARGE_SUBSCRIPTION' as never });
    t.przywroc();
    expect(t.dokumenty).toHaveLength(1);
  });
});
