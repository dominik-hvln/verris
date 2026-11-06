import { WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { AccountDeletionService } from '../../src/compliance/account-deletion.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';
import * as bcrypt from 'bcrypt';

/**
 * A2-07 / decyzja 9 (paczka 109) — usunięcie konta: przed potwierdzeniem klient widzi saldo (i część do zwrotu),
 * domeny, usługi i prawdziwą datę; z numerem rachunku powstaje wniosek o zwrot opłaconych kredytów (bez kodów,
 * poleceń i rekompensat) jako zgłoszenie dla obsługi z terminem 14 dni. Cofnięcie usunięcia wycofuje wniosek.
 * Na starym kodzie: ani podsumowania, ani wniosku — ścieżka usuwania nie tworzyła zwrotu.
 */
const IBAN_PL = 'PL61109010140000071219812874';

function usuwanie() {
  const p = prisma() as never;
  return new AccountDeletionService(p, new AuditService(p), {} as never, { send: async () => ({}) } as never, { get: () => undefined } as never);
}

async function klient(saldo: number) {
  const passwordHash = await bcrypt.hash('Haslo-do-testu-1', 4);
  return prisma().user.create({ data: { email: `usun-${Date.now()}-${Math.random()}@test.verris.pl`, passwordHash, walletBalance: saldo } });
}

const tx = (userId: string, type: WalletTxType, amount: number, balanceAfter: number, idempotencyKey?: string) =>
  prisma().walletTransaction.create({ data: { userId, type, amount, balanceAfter, currency: 'PLN', idempotencyKey } });

describe('A2-07 usunięcie konta – podsumowanie i wniosek o zwrot salda', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().wniosekZwrotuSalda.deleteMany();
  });
  afterAll(rozlacz);

  it('podsumowanie: saldo 250 K = 200 zł wpłaty + 150 K kodu BETA − 100 zużyte → zwrot 200 zł (kod zjedzony pierwszy, 50 K kodu bez zwrotu)', async () => {
    const k = await klient(250);
    await tx(k.id, WalletTxType.TOPUP, 200, 200);
    await tx(k.id, WalletTxType.PROMO_CREDIT, 150, 350, `promo-beta:${k.id}`);
    await tx(k.id, WalletTxType.CHARGE_SUBSCRIPTION, -100, 250);
    await prisma().domain.create({ data: { userId: k.id, name: 'mojafirma.pl', status: 'ACTIVE', registrarProvider: 'openprovider', expiresAt: new Date('2027-05-01T00:00:00Z') } });
    await prisma().domain.create({ data: { userId: k.id, name: 'obca.pl', status: 'ACTIVE' } });

    const p = await usuwanie().podsumowanie(k.id);
    expect(p).toMatchObject({ saldo: '250.00', doZwrotu: '200.00', nieZwracane: '50.00', terminZwrotuDni: 14, wniosekZwrotu: null });
    expect(p.domeny).toEqual([{ nazwa: 'mojafirma.pl', wygasa: '2027-05-01T00:00:00.000Z', autoOdnowienie: false }]);
    expect(new Date(p.dataUsuniecia).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
  });

  it('wniosek z numerem rachunku: wiersz NOWY z kwotą i terminem 14 dni + zgłoszenie w rozliczeniach; rekompensata SLA nie wchodzi do zwrotu', async () => {
    const k = await klient(130);
    await tx(k.id, WalletTxType.TOPUP, 100, 100);
    await tx(k.id, WalletTxType.ADJUSTMENT, 30, 130, `sla-sub1-2026-10`);
    const wynik = await usuwanie().request({
      userId: k.id,
      password: 'Haslo-do-testu-1',
      zwrot: { numerRachunku: IBAN_PL.slice(2).replace(/(\d{4})/g, '$1 '), odbiorca: 'Jan Kowalski' },
    });
    expect(wynik.wniosekZwrotu).toMatchObject({ kwota: '100.00' });
    const w = await prisma().wniosekZwrotuSalda.findFirstOrThrow({ where: { userId: k.id } });
    expect(w).toMatchObject({ status: 'NOWY', numerRachunku: IBAN_PL, odbiorca: 'Jan Kowalski' });
    expect(Number(w.kwota)).toBe(100);
    expect(Math.round((w.terminDo.getTime() - w.createdAt.getTime()) / 86_400_000)).toBe(14);
    const t = await prisma().ticket.findUniqueOrThrow({ where: { id: w.ticketId! } });
    expect(t).toMatchObject({ userId: k.id, department: 'BILLING', status: 'OPEN' });
    expect(t.message).toContain(IBAN_PL);
    expect((await usuwanie().podsumowanie(k.id)).wniosekZwrotu).toMatchObject({ kwota: '100.00', rachunek: 'PL •••• 2874' });
  });

  it('zły numer rachunku → 400, bez wniosku o usunięcie i bez wniosku o zwrot', async () => {
    const k = await klient(50);
    await tx(k.id, WalletTxType.TOPUP, 50, 50);
    await expect(
      usuwanie().request({ userId: k.id, password: 'Haslo-do-testu-1', zwrot: { numerRachunku: '61 1090 1014 0000 0712 1981 2875', odbiorca: 'Jan' } }),
    ).rejects.toThrow(/rachunku/);
    expect(await prisma().accountDeletionRequest.count({ where: { userId: k.id } })).toBe(0);
    expect(await prisma().wniosekZwrotuSalda.count()).toBe(0);
  });

  it('same kredyty z kodu – bez wniosku o zwrot; cofnięcie usunięcia wycofuje wniosek i zamyka zgłoszenie', async () => {
    const tylkoKod = await klient(150);
    await tx(tylkoKod.id, WalletTxType.PROMO_CREDIT, 150, 150);
    const r = await usuwanie().request({ userId: tylkoKod.id, password: 'Haslo-do-testu-1', zwrot: { numerRachunku: IBAN_PL, odbiorca: 'Jan' } });
    expect(r.wniosekZwrotu).toBeNull();

    const k = await klient(80);
    await tx(k.id, WalletTxType.TOPUP, 80, 80);
    await usuwanie().request({ userId: k.id, password: 'Haslo-do-testu-1', zwrot: { numerRachunku: IBAN_PL, odbiorca: 'Jan' } });
    await usuwanie().cancel(k.id);
    const w = await prisma().wniosekZwrotuSalda.findFirstOrThrow({ where: { userId: k.id } });
    expect(w.status).toBe('ODRZUCONY');
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: w.ticketId! } })).status).toBe('CLOSED');
  });
});
