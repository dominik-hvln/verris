import { AuditService } from '../../src/common/audit/audit.service.js';
import { AccountDeletionService } from '../../src/compliance/account-deletion.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * X-04 — usunięcie konta (RODO art. 17) na prawdziwej bazie: anonimizacja po okresie karencji,
 * cofnięcie wniosku, które wyprzedziło przebieg harmonogramu, oraz usunięcie konta z węzła,
 * które zwalnia pojemność węzła raz, nie dwa razy. DirectAdmin i poczta są atrapami.
 */
let daDelete: string[] = [];
let opoznienieMs = 0;
const da = {
  getClientForServer: async () => ({
    deleteAccount: async (u: string) => {
      await new Promise((r) => setTimeout(r, opoznienieMs));
      daDelete.push(u);
    },
    suspendAccount: async () => undefined,
  }),
};
const serwis = () => {
  const p = prisma() as never;
  return new AccountDeletionService(p, new AuditService(p), da as never, { send: async () => ({}) } as never, { get: () => undefined } as never);
};

async function zWnioskiem(minionyTermin = true) {
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
  const termin = new Date(Date.now() + (minionyTermin ? -60_000 : 14 * 864e5));
  await prisma().accountDeletionRequest.create({ data: { userId: k.user.id, scheduledFor: termin } });
  await prisma().user.update({ where: { id: k.user.id }, data: { deletionRequestedAt: new Date() } });
  return { ...k, wezel };
}
const uzytkownik = (id: string) => prisma().user.findUniqueOrThrow({ where: { id } });

describe('X-04 usunięcie konta (RODO)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    daDelete = [];
    opoznienieMs = 0;
  });
  afterAll(rozlacz);

  it('po terminie: konto zanonimizowane, usługi anulowane, wniosek zamknięty', async () => {
    const k = await zWnioskiem();
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'ACTIVE' } });
    const s = serwis();
    for (const id of await s.listDue()) await s.executeAnonymization(id, null);
    expect((await uzytkownik(k.user.id)).anonymizedAt).not.toBeNull();
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } })).status).toBe('CANCELED');
    expect((await prisma().accountDeletionRequest.findUniqueOrThrow({ where: { userId: k.user.id } })).anonymizedAt).not.toBeNull();
  });

  it('klient cofnął wniosek po wybraniu listy do anonimizacji: dane zostają nietknięte', async () => {
    const k = await zWnioskiem();
    const s = serwis();
    const lista = await s.listDue();
    expect(lista).toContain(k.user.id);
    await s.cancel(k.user.id);
    await s.executeAnonymization(k.user.id, null).catch(() => undefined);
    const u = await uzytkownik(k.user.id);
    expect(u.anonymizedAt).toBeNull();
    expect(u.email).toBe(k.user.email);
  });

  it('po anonimizacji wniosku nie da się cofnąć', async () => {
    const k = await zWnioskiem();
    const s = serwis();
    await s.executeAnonymization(k.user.id, null);
    await expect(s.cancel(k.user.id)).rejects.toThrow();
  });

  it('dwa usunięcia tego samego konta z węzła naraz: pojemność węzła zwolniona raz', async () => {
    const k = await zWnioskiem();
    const przed = await prisma().server.findUniqueOrThrow({ where: { id: k.wezel.id } });
    await prisma().account.update({ where: { id: k.account.id }, data: { status: 'SUSPENDED' } });
    opoznienieMs = 100;
    const s = serwis();
    await Promise.all([s.purgeAccountOnDa(k.account.id), s.purgeAccountOnDa(k.account.id)]);
    const po = await prisma().server.findUniqueOrThrow({ where: { id: k.wezel.id } });
    expect(po.allocatedCpu).toBe(przed.allocatedCpu - k.account.cpuLimit);
    expect(po.allocatedMemory).toBe(przed.allocatedMemory - k.account.ramLimitMb);
    expect((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).status).toBe('DELETED');
  });
});
