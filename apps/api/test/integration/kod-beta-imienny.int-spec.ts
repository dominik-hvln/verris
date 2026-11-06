import { WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { BetaService } from '../../src/beta/beta.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Paczka 109 (P5-02, P5-12) — kod z zaproszenia do testów jest imienny. Realizuje go tylko konto z adresem
 * z zaproszenia, jedno konto zbiera najwyżej jeden kod BETA, a ten sam klient wpisujący kod drugi raz słyszy
 * „już na Twoim portfelu”, nie „w pełni wykorzystany”. Na starym kodzie: obcy dostawał +150 K (saldo 300 K).
 */
const p = () => prisma() as never;
const promo = () => new PromoService(p(), new WalletLedgerService(p()), new AuditService(p()), { send: async () => ({}) } as never, { get: () => undefined } as never);
const beta = () => new BetaService(p(), { send: async () => ({ delivered: true }) } as never, { get: () => undefined } as never, new AuditService(p()));

const konto = (email: string) => prisma().user.create({ data: { email, passwordHash: 'x', walletBalance: 0 } });
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);

describe('P5-02 / P5-12 imienny kod BETA', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('kod z cudzego zaproszenia: odmowa bez kredytu; zaproszona osoba realizuje swój kod', async () => {
    const admin = await prisma().user.create({ data: { email: 'admin-beta@test.verris.pl', passwordHash: 'x', role: 'ADMIN' } });
    const tomek = await konto('tomek.p5@test.verris.pl');
    const tomek2 = await konto('tomek2.p5@test.verris.pl');
    const { code } = await beta().zapros({ email: 'Tomek2.P5@test.verris.pl' }, admin.id);

    await expect(promo().redeemPromo(tomek.id, code)).rejects.toThrow('przypisany do innego adresu e-mail');
    expect(await saldo(tomek.id)).toBe(0);

    const wynik = await promo().redeemPromo(tomek2.id, code.toLowerCase());
    expect(wynik.amountPln).toBe('150.00');
    expect(await saldo(tomek2.id)).toBe(150);
  });

  it('ten sam klient drugi raz (także małymi literami) – „już na Twoim portfelu”, saldo bez zmian', async () => {
    const admin = await prisma().user.create({ data: { email: 'admin-beta@test.verris.pl', passwordHash: 'x', role: 'ADMIN' } });
    const k = await konto('anna.beta@test.verris.pl');
    const { code } = await beta().zapros({ email: 'anna.beta@test.verris.pl' }, admin.id);
    await promo().redeemPromo(k.id, code);
    await expect(promo().redeemPromo(k.id, ` ${code.toLowerCase()} `)).rejects.toThrow(/już na Twoim portfelu \(\+150,00 K/);
    expect(await saldo(k.id)).toBe(150);
  });

  it('jedno konto – najwyżej jeden kod BETA, także przy dwóch zaproszeniach na ten sam adres naraz', async () => {
    const admin = await prisma().user.create({ data: { email: 'admin-beta@test.verris.pl', passwordHash: 'x', role: 'ADMIN' } });
    const k = await konto('dwa.kody@test.verris.pl');
    const pierwszy = await beta().zapros({ email: 'dwa.kody@test.verris.pl' }, admin.id);
    // Drugie zaproszenie na ten sam adres (np. ręcznie przez admina) — zapros pilnuje tylko niewykorzystanych.
    await prisma().promoCode.update({ where: { code: pierwszy.code }, data: { redemptionCount: 1 } });
    const drugi = await beta().zapros({ email: 'dwa.kody@test.verris.pl' }, admin.id);
    await prisma().promoCode.update({ where: { code: pierwszy.code }, data: { redemptionCount: 0 } });

    const s = promo();
    const wyniki = await Promise.allSettled([s.redeemPromo(k.id, pierwszy.code), s.redeemPromo(k.id, drugi.code)]);
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    expect(await saldo(k.id)).toBe(150);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.PROMO_CREDIT } })).toBe(1);

    // Po fakcie — kolejny kod BETA na to samo konto też odmówiony.
    const pozostaly = wyniki[0].status === 'fulfilled' ? drugi.code : pierwszy.code;
    await expect(s.redeemPromo(k.id, pozostaly)).rejects.toThrow(/kredyt z zaproszenia do testów|już/);
    expect(await saldo(k.id)).toBe(150);
    const liczniki = await prisma().promoCode.findMany({ where: { code: { in: [pierwszy.code, drugi.code] } }, select: { redemptionCount: true } });
    expect(liczniki.reduce((a, b) => a + b.redemptionCount, 0)).toBe(1);
  });
});
