import { MigrationWorkerScheduler } from './migration-worker.scheduler.js';

/**
 * PB-44 (D3 13.10) — zgłoszenie migracji wewnętrznej widzi klient: bez notatki operatora i nazwy węzła,
 * a o kopii piszemy „zleciliśmy” — w chwili tworzenia zgłoszenia kopia jest dopiero zlecona, nie gotowa.
 */
describe('Migracja wewnętrzna — treść zgłoszenia dla klienta', () => {
  const s = new MigrationWorkerScheduler({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const tresc = (s as unknown as { buildTicketMessage: (t: string, d: unknown, dom: string | null) => string }).buildTicketMessage(
    'MIGRATION_INTERNAL_REQUESTED',
    { notes: 'węzeł n1 przeciążony', targetServerId: 'cb174788' },
    'd3.hvln.pl',
  );

  it('kopia „zlecona”, nie „wykonana”', () => {
    expect(tresc).toContain('zleciliśmy kopię zapasową');
    expect(tresc).not.toContain('wykonaliśmy');
  });

  it('bez notatki operatora i identyfikatora węzła', () => {
    expect(tresc).toContain('d3.hvln.pl');
    expect(tresc).not.toContain('przeciążony');
    expect(tresc).not.toContain('cb174788');
  });
});
