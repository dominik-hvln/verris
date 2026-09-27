import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PartnersService } from '../../src/partners/partners.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — wypłaty prowizji partnerskich na prawdziwej bazie. Sedno: te same prowizje nie mogą
 * trafić do dwóch wypłat, a portfel partnera dostaje dokładnie ich sumę — także przy dwóch
 * równoległych żądaniach (podwójne kliknięcie, dwie karty).
 */

function serwis() {
  const p = prisma() as never;
  const ustawienia = { getPartnerProgram: async () => ({ enabled: true, commissionPct: 20, holdDays: 30, minPayout: 50 }) };
  return new PartnersService(p, new AuditService(p), new WalletLedgerService(p), ustawienia as never);
}

let n = 0;
async function partner(prowizje: number[]) {
  n += 1;
  const u = await prisma().user.create({ data: { email: `partner-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
  await prisma().referralProgramEnrollment.create({ data: { userId: u.id, status: 'APPROVED' } });
  for (const [i, kwota] of prowizje.entries()) {
    await prisma().partnerCommission.create({
      data: { partnerUserId: u.id, dedupeKey: `k-${u.id}-${i}`, amount: kwota, status: 'AVAILABLE' } as never,
    });
  }
  return u;
}
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const wyplaty = (id: string) => prisma().partnerPayout.findMany({ where: { partnerUserId: id } });

describe('X-04 wypłaty prowizji partnerskich', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('wypłata do portfela: suma prowizji, prowizje oznaczone jako wypłacone', async () => {
    const u = await partner([20, 20, 20]);
    const r = await serwis().requestWalletPayout(u.id);
    expect(r.amount).toBe(60);
    expect(await saldo(u.id)).toBe(60);
    expect(await prisma().partnerCommission.count({ where: { partnerUserId: u.id, status: 'PAID' } })).toBe(3);
  });

  it('dwa równoległe żądania wypłaty do portfela: portfel uznany raz, jedna wypłata', async () => {
    const u = await partner([20, 20, 20]);
    const s = serwis();
    const wyniki = await Promise.allSettled([s.requestWalletPayout(u.id), s.requestWalletPayout(u.id)]);
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    expect(await saldo(u.id)).toBe(60);
    expect(await wyplaty(u.id)).toHaveLength(1);
  });

  it('dwa równoległe zlecenia przelewu: jedno zlecenie do zatwierdzenia przez admina', async () => {
    const u = await partner([30, 30]);
    const s = serwis();
    const wyniki = await Promise.allSettled([
      s.requestBankPayout(u.id, 'PL61109010140000071219812874'),
      s.requestBankPayout(u.id, 'PL61109010140000071219812874'),
    ]);
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    const w = await wyplaty(u.id);
    expect(w).toHaveLength(1);
    expect(Number(w[0].amount)).toBe(60);
  });

  it('przelew i portfel naraz: prowizje trafiają tylko do jednej wypłaty', async () => {
    const u = await partner([30, 30]);
    const s = serwis();
    await Promise.allSettled([s.requestBankPayout(u.id, 'PL61109010140000071219812874'), s.requestWalletPayout(u.id)]);
    const w = await wyplaty(u.id);
    expect(w).toHaveLength(1);
    const wyplacone = w.reduce((a, x) => a + Number(x.amount), 0);
    expect(wyplacone).toBe(60);
    expect(await saldo(u.id)).toBe(w[0].method === 'WALLET' ? 60 : 0);
  });
});
