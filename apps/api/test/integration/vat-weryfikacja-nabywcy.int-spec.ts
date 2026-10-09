import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma, Role } from '@verris/database';
import { DoladowanieService } from '../../src/billing/doladowanie.service.js';
import { VatNabywcyService } from '../../src/billing/vat-nabywcy.service.js';
import { VatWeryfikacjaService } from '../../src/billing/vat-weryfikacja.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Decyzja 09.10 — cena netto (np) dla nabywcy spoza UE tylko po weryfikacji obsługi; zmiana
 * kraju/NIP po pierwszej płatności tylko przez obsługę, z wpisem w dzienniku i zerowaniem weryfikacji.
 * Na prawdziwej bazie: księgowanie wpłaty (K + dokument) i zapis AuditLog w transakcji.
 */
function uslugi() {
  const p = prisma() as never;
  const vies = { sprawdz: async () => { throw new Error('VIES nie powinien być pytany dla kraju spoza UE'); } };
  const ps = { getSellerCompany: async () => ({ nip: '7251234567' }) };
  const vat = new VatNabywcyService(p, vies as never, ps as never);
  const dol = new DoladowanieService(p, new WalletLedgerService(p), vat);
  const wer = new VatWeryfikacjaService(p);
  const users = new UsersService(
    p, { get: () => undefined } as never, {} as never, {} as never,
    { safeAward: () => undefined, awardBillingProfileComplete: async () => undefined } as never, {} as never,
  );
  return { dol, wer, users };
}

let n = 0;
async function klient(country: string, role: Role = Role.USER) {
  n += 1;
  return prisma().user.create({
    data: { email: `vat-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', country, nip: 'CHE-123.456.789', role },
  });
}

const wplata = (dol: DoladowanieService, userId: string, klucz: string) =>
  dol.zaksieguj({
    userId, kwotaMinor: 10000, waluta: 'pln', idempotencyKey: klucz, paymentRef: `pi_${klucz}`, opis: 'Doładowanie',
    zaplaconoAt: new Date(),
  });

describe('Weryfikacja VAT nabywcy spoza UE', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().platformSetting.upsert({
      where: { key: 'faktury.model' }, create: { key: 'faktury.model', value: 'przy_doladowaniu' }, update: { value: 'przy_doladowaniu' },
    });
  });
  afterAll(rozlacz);

  it('kraj spoza UE bez weryfikacji: 23%, 100 K za 100 zł, dokument z VAT 18,70 — spójny z wpłatą', async () => {
    const { dol } = uslugi();
    const u = await klient('CH');
    const r = await wplata(dol, u.id, 'a1');
    expect(r.kredytK.toFixed(2)).toBe('100.00');
    const w = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(new Prisma.Decimal(w.walletBalance).toFixed(2)).toBe('100.00');
    const f = await prisma().invoice.findFirstOrThrow({ where: { userId: u.id } });
    expect(f.amount.toFixed(2)).toBe('100.00');
    expect(f.vatAmount?.toFixed(2)).toBe('18.70');
    expect(f.netAmount!.plus(f.vatAmount!).toFixed(2)).toBe('100.00');
    expect((f.buyerSnapshot as { vat: { kod: string; stawka: number } }).vat).toMatchObject({ kod: 'PL', stawka: 23 });
  });

  it('po weryfikacji obsługi: np, 123 K za 100 zł, dokument bez VAT; wpis w dzienniku z podstawą', async () => {
    const { dol, wer } = uslugi();
    const op = await klient('PL', Role.STAFF);
    const u = await klient('CH');
    const st = await wer.zweryfikuj(u.id, 'Rejestr handlowy CH, potwierdzone przez księgową', { userId: op.id, role: Role.STAFF });
    expect(st).toMatchObject({ kraj: 'CH', pozaUe: true, wymagaWeryfikacji: false, weryfikacja: { przez: op.id, kraj: 'CH', aktualna: true } });
    const r = await wplata(dol, u.id, 'b1');
    expect(r.kredytK.toFixed(2)).toBe('123.00');
    const f = await prisma().invoice.findFirstOrThrow({ where: { userId: u.id } });
    expect(f.amount.toFixed(2)).toBe('100.00');
    expect(f.vatAmount?.toFixed(2)).toBe('0.00');
    expect((f.buyerSnapshot as { vat: { kod: string; stawka: number | null } }).vat).toMatchObject({ kod: 'POZA_UE', stawka: null });
    const log = await prisma().auditLog.findFirstOrThrow({ where: { userId: u.id, action: 'VAT_NABYWCA_ZWERYFIKOWANY' } });
    expect(log.actorUserId).toBe(op.id);
    expect(log.details).toMatchObject({ kraj: 'CH', podstawa: 'Rejestr handlowy CH, potwierdzone przez księgową' });
  });

  it('klient po pierwszej płatności nie zmieni sam kraju — 403 „Zmianę kraju rozliczenia zgłoś obsłudze”', async () => {
    const { dol, users } = uslugi();
    const u = await klient('CH');
    await expect(users.updateProfile(u.id, { country: 'US' })).resolves.toBeDefined(); // przed płatnością wolno
    await wplata(dol, u.id, 'c1');
    await expect(users.updateProfile(u.id, { country: 'DE' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(users.updateProfile(u.id, { country: 'DE' })).rejects.toThrow('Zmianę kraju rozliczenia zgłoś obsłudze');
    await expect(users.updateProfile(u.id, { nip: '1' })).rejects.toBeInstanceOf(ForbiddenException);
    const w = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(w.country).toBe('US');
    // Ten sam kraj w zapisie formularza — przechodzi.
    await expect(users.updateProfile(u.id, { country: 'US', city: 'Austin' })).resolves.toBeDefined();
  });

  it('zmiana kraju przez operatora: wpis w dzienniku (przed/po) i wyzerowana weryfikacja → następna wpłata 23%', async () => {
    const { dol, wer } = uslugi();
    const op = await klient('PL', Role.STAFF);
    const u = await klient('CH');
    await wer.zweryfikuj(u.id, 'Rejestr handlowy CH, potwierdzone', { userId: op.id, role: Role.STAFF });
    await wplata(dol, u.id, 'd1');
    const st = await wer.zmienDane(u.id, { country: 'US', powod: 'Zgłoszenie #123 — przeprowadzka' }, { userId: op.id, role: Role.STAFF });
    expect(st).toMatchObject({ kraj: 'US', wymagaWeryfikacji: true, weryfikacja: null });
    const log = await prisma().auditLog.findFirstOrThrow({ where: { userId: u.id, action: 'VAT_NABYWCA_DANE_ZMIENIONE' } });
    expect(log.actorUserId).toBe(op.id);
    expect(log.details).toMatchObject({ kraj: { przed: 'CH', po: 'US' }, weryfikacjaWyzerowana: true, powod: 'Zgłoszenie #123 — przeprowadzka' });
    const r = await wplata(dol, u.id, 'd2');
    expect(r.kredytK.toFixed(2)).toBe('100.00');
  });

  it('weryfikacja nie dotyczy PL ani UE (tam VIES); personel nie działa na kontach operatorów; cofnięcie z wpisem', async () => {
    const { wer } = uslugi();
    const op = await klient('PL', Role.STAFF);
    const de = await klient('DE');
    await expect(wer.zweryfikuj(de.id, 'cokolwiek dłuższego', { userId: op.id, role: Role.STAFF })).rejects.toBeInstanceOf(BadRequestException);
    const inny = await klient('US', Role.STAFF);
    await expect(wer.zweryfikuj(inny.id, 'cokolwiek dłuższego', { userId: op.id, role: Role.STAFF })).rejects.toBeInstanceOf(ForbiddenException);
    const us = await klient('US');
    await wer.zweryfikuj(us.id, 'Rejestr firm US, EIN potwierdzony', { userId: op.id, role: Role.STAFF });
    const st = await wer.cofnij(us.id, 'Księgowa nie potwierdziła', { userId: op.id, role: Role.STAFF });
    expect(st.wymagaWeryfikacji).toBe(true);
    expect(await prisma().auditLog.count({ where: { userId: us.id, action: 'VAT_NABYWCA_WERYFIKACJA_COFNIETA' } })).toBe(1);
  });
});
