import { PrismaService } from '../../src/prisma/prisma.service.js';
import { KopieFlotyService } from '../../src/servers/kopie-floty.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Weryfikacja 11.10: po pierwszym raporcie kopii per konto (Account.offsiteBackupBytes = BigInt) karta usługi
 * w adminie zwracała 500 — `include: { account: … }` wkładał BigInt do odpowiedzi, a JSON.stringify go nie umie.
 * PrismaService pomija to pole w każdym odczycie; „Kopie floty” wybiera je jawnie i dalej pokazuje rozmiar.
 */
describe('Account.offsiteBackupBytes nie psuje odpowiedzi z kontem w całości', () => {
  const ps = new PrismaService();
  beforeEach(wyczyscBaze);
  afterAll(async () => {
    await ps.$disconnect();
    await rozlacz();
  });

  it('karta usługi (subskrypcja z kontem) serializuje się do JSON; Kopie floty dalej znają rozmiar', async () => {
    const plan = await utworzPlan();
    const wezel = await utworzWezel();
    const { account } = await utworzKonto({ serverId: wezel.id, planId: plan.id });
    await prisma().account.update({
      where: { id: account.id },
      data: { offsiteBackupOkAt: new Date(), offsiteBackupBytes: 385_001_672n },
    });

    // To samo zapytanie co SubscriptionsAdminController.detail (karta usługi w adminie).
    const karta = await ps.subscription.findUniqueOrThrow({
      where: { id: account.subscriptionId },
      include: {
        plan: true,
        account: { include: { server: { select: { id: true, name: true, region: true, hostname: true } } } },
        events: { take: 50 },
      },
    });
    expect(() => JSON.stringify(karta)).not.toThrow();
    expect(karta.account).not.toBeNull();
    expect(JSON.parse(JSON.stringify(karta)).account).not.toHaveProperty('offsiteBackupBytes');

    // Bezpośredni odczyt konta też bez BigInt.
    await expect(ps.account.findUniqueOrThrow({ where: { id: account.id } }).then((a) => JSON.stringify(a))).resolves.toContain(account.id);

    // Jawny select nadal zwraca pole (globalne pominięcie go nie blokuje).
    const z = await ps.account.findUniqueOrThrow({ where: { id: account.id }, select: { offsiteBackupBytes: true } });
    expect(Number(z.offsiteBackupBytes)).toBe(385_001_672);

    const kopie = new KopieFlotyService(ps as never, {
      podglad: async () => ({ skonfigurowany: true, host: 'h', port: 23, user: 'u', sciezka: 's', retencjaDni: 30, zmienionoAt: null }),
    } as never);
    const flota = await kopie.stan(undefined, { admin: true });
    expect(() => JSON.stringify(flota)).not.toThrow();
    const wezelFloty = flota.wezly.find((w) => w.id === wezel.id);
    expect(wezelFloty).toBeDefined();
  });
});
