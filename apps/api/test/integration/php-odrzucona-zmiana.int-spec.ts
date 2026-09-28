import { AuditService } from '../../src/common/audit/audit.service.js';
import { NodeTasksService } from '../../src/servers/node-tasks.service.js';
import { PhpService } from '../../src/subscriptions/php.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Test D3 na t1 (28.09): węzeł odrzucił PHP 8.2 („nie jest zainstalowana”), a panel dalej pokazywał
 * 8.2 jako aktualną wersję i wyświetlał klientowi surowy log zadania ze ścieżkami skryptów.
 */
describe('PHP — odrzucona zmiana wersji', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('wraca do poprzedniej wersji, klient widzi tylko linię BŁĄD', async () => {
    const p = prisma() as never;
    const wezel = await utworzWezel({ identityToken: 'tok-php' });
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan()).id });
    await prisma().account.update({ where: { id: k.account.id }, data: { phpVersion: '8.3' } });
    const php = new PhpService(p, new AuditService(p), { getAvailablePhpVersions: async () => ['8.3', '8.2'] } as never);

    const po = await php.setVersionForSubscription(k.subscription.id, k.user.id, '8.2');
    expect(po.version).toBe('8.2');

    const t = await prisma().nodeTask.findFirstOrThrow({ where: { accountId: k.account.id, kind: 'PHP_APPLY' } });
    await prisma().nodeTask.update({ where: { id: t.id }, data: { status: 'RUNNING', startedAt: new Date() } });
    await new NodeTasksService(p, new AuditService(p), null as never).failTaskFromNode({
      serverId: wezel.id,
      taskId: t.id,
      error: `=== Verris task ${t.id} (kind=PHP_APPLY) ===\nCommand: /usr/local/bin/verris-php-apply.sh\n---\n[php-apply] BŁĄD: wersja PHP 8.2 nie jest zainstalowana na serwerze`,
    });

    const stan = await php.statusForSubscription(k.subscription.id, k.user.id);
    expect(stan.version).toBe('8.3');
    expect(stan.lastTask?.errorMessage).toBe('wersja PHP 8.2 nie jest zainstalowana na serwerze');
  });
});
