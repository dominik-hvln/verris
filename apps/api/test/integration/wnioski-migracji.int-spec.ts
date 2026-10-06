import { AuditService } from '../../src/common/audit/audit.service.js';
import { MigrationWorkerScheduler } from '../../src/subscriptions/migration-worker.scheduler.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Wnioski o migrację (stary flow G-6/G-7): po 20 obsłużonych wnioskach w historii nowe nie były
 * już przetwarzane (harmonogram brał 20 najstarszych w ogóle), a nakładające się przebiegi robiły
 * drugą kopię i drugie zgłoszenie.
 */
let kopie = 0;
const uslugi = () => {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const nic = { get: () => undefined, create: async () => undefined, supportSuggestion: async () => null };
  const tickets = new TicketsService(p, mailer as never, nic as never, null as never, audit, nic as never, new OpiekaZgloszenService(p, mailer as never, nic as never, audit, nic as never, nic as never));
  return new MigrationWorkerScheduler(
    p,
    { createHostingSiteBackupNow: async () => { kopie += 1; await new Promise((r) => setTimeout(r, 50)); } } as never,
    audit, mailer as never, null as never, tickets,
  );
};

describe('Wnioski o migrację', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    kopie = 0;
  });
  afterAll(rozlacz);

  it('nowy wniosek po 20 obsłużonych jest przetworzony; dwa przebiegi naraz — jedna kopia i jedno zgłoszenie', async () => {
    const wezel = await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
    for (let i = 0; i < 20; i++) {
      const r = await prisma().subscriptionEvent.create({
        data: { subscriptionId: k.subscription.id, type: 'MIGRATION_INTERNAL_REQUESTED', details: {}, createdAt: new Date(Date.now() - (100 - i) * 60_000) },
      });
      await prisma().subscriptionEvent.create({ data: { subscriptionId: k.subscription.id, type: 'MIGRATION_INTERNAL_QUEUED', details: { requestId: r.id } } });
    }
    const nowy = await prisma().subscriptionEvent.create({ data: { subscriptionId: k.subscription.id, type: 'MIGRATION_INTERNAL_REQUESTED', details: {} } });
    const s = uslugi();
    await Promise.all([s.processQueuedMigrations(), s.processQueuedMigrations()]);
    expect(kopie).toBe(1);
    const obsluga = await prisma().subscriptionEvent.findMany({ where: { type: 'MIGRATION_INTERNAL_QUEUED', details: { path: ['requestId'], equals: nowy.id } } });
    expect(obsluga).toHaveLength(1);
    expect(await prisma().ticket.count({ where: { userId: k.user.id } })).toBe(1);
  });
});
