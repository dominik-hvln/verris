import { MigrationStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { MigrationOrchestratorService } from '../../src/subscriptions/migration-orchestrator.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Próba bety 06.10: zgłoszenie „[PILNE] Migracja d3.hvln.pl…” (eskalacja z 03.10) wisiało 3 dni bez opiekuna
 * i bez terminu SLA (nie trafiło do „po terminie”), a klient widział je jako swoją wiadomość z powodem
 * technicznym i zdaniem o sekretach w panelu staff. Eskalacja tworzyła ticket z pominięciem TicketsService.
 */
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const config = { get: () => undefined };
  const notifications = { create: async () => undefined, notify: async () => undefined };
  const ai = { supportSuggestion: async () => null };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, ai as never);
  const tickets = new TicketsService(p, mailer as never, config as never, null as never, audit, notifications as never, opieka);
  return new MigrationOrchestratorService(p, {} as never, audit, notifications as never, null as never, null as never, tickets);
}

describe('Eskalacja migracji do zespołu — zgłoszenie jak każde inne', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('opiekun, termin SLA i potwierdzenie; treść bez powodu technicznego', async () => {
    const agent = await prisma().user.create({ data: { email: `ag-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', firstName: 'Anna' } });
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan({ productKind: 'HOSTING' })).id });
    const req = await prisma().migrationRequest.create({
      data: { subscriptionId: k.subscription.id, userId: k.user.id, sourceBundleEnc: 'x', status: MigrationStatus.RUNNING } as never,
    });

    await uslugi().escalateToStaff(req.id, 'Krok imap nie powiódł się po 3/3 próbach: imap sync failed (rc=2)');

    const t = await prisma().ticket.findFirstOrThrow({ where: { userId: k.user.id }, include: { replies: true } });
    expect(t.assignedToId).toBe(agent.id);
    expect(t.priority).toBe('URGENT');
    expect(t.slaResponseDueAt).not.toBeNull();
    expect(t.replies.some((r) => r.automatic === 'POTWIERDZENIE')).toBe(true);
    expect(`${t.subject}\n${t.message}`).not.toMatch(/rc=2|imap|staff|Sekret/i);
    const m = await prisma().migrationRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(m.ticketId).toBe(t.id);
    expect(m.attentionReason).toContain('rc=2');
  });
});
