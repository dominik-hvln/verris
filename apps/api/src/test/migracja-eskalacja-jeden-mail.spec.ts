import { TicketsService } from '../tickets/tickets.service.js';
import { MigrationWorkerScheduler } from '../subscriptions/migration-worker.scheduler.js';

/**
 * t1, 08.10 (uwaga Dominika): nieudana migracja przekazana zespołowi = DWA maile do klienta —
 * potwierdzenie automatycznego zgłoszenia (PB-37) i „Migrację przejął nasz zespół”.
 * Decyzja: zostaje mail migracji, wzbogacony o opiekuna, termin i przycisk do zgłoszenia;
 * zgłoszenie założone przez eskalację nie wysyła własnego potwierdzenia.
 */
function ticketsSvc() {
  const send = vi.fn().mockResolvedValue(undefined);
  const wyslij = vi.fn().mockResolvedValue(false);
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    ticket: {
      create: vi.fn().mockResolvedValue({
        id: 'tik_1', subject: 'S', status: 'OPEN', createdAt: new Date(), assignedToId: null,
        slaResponseDueAt: new Date(Date.now() + 3_600_000), user: { email: 'k@x.pl' }, assignedTo: null,
      }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    ticketEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const svc = new TicketsService(
    prisma as never,
    { send } as never,
    { get: () => 'https://panel.test' } as never,
    null as never,
    { record: vi.fn() } as never,
    { create: vi.fn() } as never,
    { wyslij, przygotujSzkic: vi.fn().mockResolvedValue(undefined) } as never,
  );
  return { svc, send, wyslij };
}

describe('eskalacja migracji — jeden mail do klienta', () => {
  it('zwykłe zgłoszenie nadal wysyła potwierdzenie klientowi', async () => {
    const { svc, send, wyslij } = ticketsSvc();
    await svc.create('u1', { subject: 'S', message: 'M' } as never);
    expect(wyslij).toHaveBeenCalledWith('tik_1', 'POTWIERDZENIE');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'k@x.pl' }));
  });

  it('zgłoszenie z eskalacji (bezPotwierdzenia) nie wysyła potwierdzenia', async () => {
    const { svc, send, wyslij } = ticketsSvc();
    await svc.create('u1', { subject: 'S', message: 'M' } as never, { bezPotwierdzenia: true });
    expect(wyslij).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ to: 'k@x.pl' }));
  });

  it('mail „przejął nasz zespół” podaje opiekuna, termin i prowadzi do zgłoszenia', () => {
    const s = new MigrationWorkerScheduler({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const m = s['buildAttentionMail'](
      'k@x.pl',
      { id: 'mig12345abc', targetDomain: 'firma.pl', subscription: { account: null } },
      'Jan',
      { id: 'tik98765xyz', opiekun: 'Anna K.', termin: 'najpóźniej dziś do 14:00' },
    );
    for (const t of [m.text, m.html]) {
      expect(t).toContain('Anna K.');
      expect(t).toContain('najpóźniej dziś do 14:00');
      expect(t).toContain('/dashboard/support/tik98765xyz');
    }
  });
});
