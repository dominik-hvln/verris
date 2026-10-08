import { ConflictException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { MigrationOrchestratorService } from '../../src/subscriptions/migration-orchestrator.service.js';
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

/**
 * PB-44 (recenzja) — migracja wewnętrzna zlecana przez operatora:
 * 1) powód operatora i id węzła nie trafiają do klienta (ani w treści zgłoszenia, ani w historii migracji usługi),
 * 2) drugi wniosek dla tej samej usługi, gdy pierwszy jest otwarty, dostaje 409 — także gdy dwa przychodzą naraz.
 */
describe('Migracja wewnętrzna zlecana przez operatora (PB-44)', () => {
  const orkiestrator = () => {
    const p = prisma() as never;
    return new MigrationOrchestratorService(p, null as never, new AuditService(p), null as never, null as never, null as never, null as never);
  };
  const POWOD = 'Węzeł n1 przeciążony — zgłoszenie #12';

  beforeEach(async () => {
    await wyczyscBaze();
    kopie = 0;
  });
  afterAll(rozlacz);

  async function przygotuj() {
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const zrodlo = await utworzWezel();
    const cel = await utworzWezel();
    const k = await utworzKonto({ serverId: zrodlo.id, planId: plan.id });
    const operator = await prisma().user.create({ data: { email: `operator-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    return { cel, k, operator };
  }

  it('klient nie widzi powodu operatora, węzła ani operatora — w zgłoszeniu i w historii migracji', async () => {
    const { cel, k, operator } = await przygotuj();
    const o = orkiestrator();
    await o.requestInternalMigrationByAdmin(k.subscription.id, operator.id, { targetServerId: cel.id, notes: POWOD });
    await uslugi().processQueuedMigrations();

    const zgloszenie = await prisma().ticket.findFirstOrThrow({ where: { userId: k.user.id } });
    expect(zgloszenie.message).not.toContain(POWOD);
    expect(zgloszenie.message).not.toContain(cel.id);
    expect(zgloszenie.message).toContain(k.account.domain);

    const dlaKlienta = JSON.stringify(await o.listMigrationTimelineForUser(k.subscription.id, k.user.id));
    for (const sekret of [POWOD, cel.id, operator.id, k.account.daUsername]) expect(dlaKlienta).not.toContain(sekret);
    expect(dlaKlienta).toContain(zgloszenie.id);

    // Obsługa nadal widzi wszystko (historia na karcie usługi w panelu staff/admin).
    const dlaObslugi = JSON.stringify(await o.listMigrationTimelineForAdmin(k.subscription.id));
    for (const jawne of [POWOD, cel.id, operator.id]) expect(dlaObslugi).toContain(jawne);
  });

  it('drugi wniosek przy otwartym → 409; dwa naraz → jeden wniosek; po porażce albo zamkniętym zgłoszeniu można zlecić znowu', async () => {
    const { cel, k, operator } = await przygotuj();
    const o = orkiestrator();
    const zlec = () => o.requestInternalMigrationByAdmin(k.subscription.id, operator.id, { targetServerId: cel.id, notes: POWOD });
    const wnioski = () => prisma().subscriptionEvent.count({ where: { subscriptionId: k.subscription.id, type: 'MIGRATION_INTERNAL_REQUESTED' } });

    const naraz = await Promise.allSettled([zlec(), zlec()]);
    expect(naraz.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const odrzucony = naraz.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(odrzucony.reason).toBeInstanceOf(ConflictException);
    expect(await wnioski()).toBe(1);

    // Obsłużony przez worker (zgłoszenie otwarte) — nadal otwarty.
    await uslugi().processQueuedMigrations();
    await expect(zlec()).rejects.toThrow(ConflictException);

    // Zgłoszenie zamknięte → przeniesienie zakończone, można zlecić kolejne.
    await prisma().ticket.updateMany({ where: { userId: k.user.id }, data: { status: 'CLOSED' } });
    const drugi = await zlec();
    expect(await wnioski()).toBe(2);

    // Porażka kopii przed migracją zamyka wniosek.
    await prisma().subscriptionEvent.create({
      data: { subscriptionId: k.subscription.id, type: 'MIGRATION_INTERNAL_FAILED', details: { requestId: drugi.migrationId, stage: 'pre_backup' } },
    });
    await expect(zlec()).resolves.toMatchObject({ ok: true });
    expect(await wnioski()).toBe(3);
  });
});
