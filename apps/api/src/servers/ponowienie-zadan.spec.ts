import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { NodeTasksService } from './node-tasks.service.js';

/**
 * Audyt Fali 3 — „Ponów” nieudanego zadania (NODES_MANAGE) nie wykonuje ponownie operacji operatora z Fali 3, które mają
 * własne uprawnienia, powód i regułę właściciela (blokady IP, kolejka i limit poczty, trafienia WAF, kwarantanna).
 */
describe('NodeTasksService.retryFailedTask — operacje operatora', () => {
  function svc(kind: NodeTaskKind, payload: Record<string, unknown> = {}) {
    const zmiany: unknown[] = [];
    const s = new NodeTasksService(
      {
        nodeTask: {
          findUnique: async () => ({ id: 't1', kind, status: NodeTaskStatus.FAILED, serverId: 'w1', payload }),
          update: async (a: unknown) => void zmiany.push(a),
        },
      } as never,
      { record: async () => undefined } as never,
      {} as never,
    );
    return { s, zmiany };
  }

  it.each([
    [NodeTaskKind.IP_BLOCKS, { mode: 'allow', ip: '198.51.100.9' }],
    [NodeTaskKind.IP_BLOCKS, { mode: 'unban', ip: '198.51.100.9' }],
    [NodeTaskKind.MAIL_QUEUE, { mode: 'remove', ids: 'x' }],
    [NodeTaskKind.MAIL_QUEUE, { mode: 'limit', limit: '50' }],
    [NodeTaskKind.WAF_HITS, { domains: 'klient.pl' }],
    [NodeTaskKind.MALWARE_SCAN, { mode: 'kwarantanna' }],
    [NodeTaskKind.MALWARE_SCAN, { mode: 'przywroc' }],
    [NodeTaskKind.MALWARE_SCAN, { mode: 'usun' }],
  ])('%s %o → odmowa, zadanie bez zmian', async (kind, payload) => {
    const { s, zmiany } = svc(kind, payload);
    await expect(s.retryFailedTask('t1', 'l4')).rejects.toThrow(/nie ponawia się z listy zadań/);
    expect(zmiany).toEqual([]);
  });

  it.each([
    [NodeTaskKind.MALWARE_SCAN, { mode: 'scan' }],
    [NodeTaskKind.MALWARE_SCAN, { mode: 'list' }],
    [NodeTaskKind.MAIL_LOG, {}],
    [NodeTaskKind.PHP_APPLY, {}],
  ])('%s %o → ponowione', async (kind, payload) => {
    const { s, zmiany } = svc(kind, payload);
    await expect(s.retryFailedTask('t1', 'l4')).resolves.toEqual({ ok: true });
    expect(zmiany).toHaveLength(1);
  });
});
