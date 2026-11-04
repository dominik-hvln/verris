import { MigrationStatus, MigrationWorkerJobKind, MigrationWorkerJobStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { MigrationOrchestratorService } from '../../src/subscriptions/migration-orchestrator.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * P2-06 (decyzja 13) — „Dograj różnice” kolejkuje ostatnie kopiowanie bazy (MYSQL_DELTA, migracja 20261103150000)
 * i ponowną konfigurację strony; węzeł konta dostaje je po kolei, z dostępem do plików starej strony i oknem konserwacji.
 */
describe('Delta-sync z bazą na prawdziwym Postgresie', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('kolejka pliki → baza → konfiguracja → poczta, lease kolejno na węźle konta', async () => {
    const p = prisma();
    const bundle = {
      sourceDomain: 'sklep.pl',
      ftp: { protocol: 'sftp', host: 'ftp.stary.pl', port: 22, username: 'f', password: 'fp', remotePath: '/' },
      mysql: [{ host: 'db.stary.pl', port: 3306, username: 'du', password: 'dp', database: 'sklep' }],
      imap: [{ host: 'imap.stary.pl', port: 993, username: 'biuro@sklep.pl', password: 'ip' }],
      targets: { mysql: [{ database: 'konto_sklep', username: 'konto_u', password: 'tp' }] },
    };
    const crypto = { decrypt: () => JSON.stringify(bundle), encrypt: (s: string) => s };
    const s = new MigrationOrchestratorService(p as never, crypto as never, new AuditService(p as never), { create: async () => undefined } as never, null as never, null as never, null as never);
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: (await utworzPlan({ productKind: 'HOSTING' })).id });
    const zlecenie = await p.migrationRequest.create({
      data: {
        subscriptionId: k.subscription.id, userId: k.user.id, sourceBundleEnc: 'x', status: MigrationStatus.COMPLETED,
        targetDomain: 'sklep.pl', preBackupAt: new Date(), completedAt: new Date(),
        workerJobs: { create: [{ kind: MigrationWorkerJobKind.HTTP_POST_CHECK, status: MigrationWorkerJobStatus.COMPLETED, idempotencyKey: `t-${Date.now()}`, sequence: 90 }] },
      } as never,
    });

    await s.queueDeltaSync(k.subscription.id, k.user.id, zlecenie.id);
    const joby = await p.migrationWorkerJob.findMany({ where: { migrationRequestId: zlecenie.id, sequence: { gt: 90 } }, orderBy: { sequence: 'asc' } });
    expect(joby.map((j) => j.kind)).toEqual(['FILES_DELTA', 'MYSQL_DELTA', 'WP_FIXUP', 'IMAP_DELTA']);

    const kolejne: string[] = [];
    for (let i = 0; i < 4; i++) {
      const job = (await s.leaseFileWorkerJobForNode(wezel.id)) as { id: string; kind: string; konserwacja?: unknown; ftpFallback?: unknown } | null;
      expect(job).not.toBeNull();
      kolejne.push(job!.kind);
      if (job!.kind === 'MYSQL_DELTA') {
        expect(job!.konserwacja).toEqual({ minuty: 120 });
        expect(job!.ftpFallback).toMatchObject({ host: 'ftp.stary.pl' });
      }
      // drugi lease w trakcie kroku nic nie wydaje (kolejność w ramach zlecenia)
      expect(await s.leaseFileWorkerJobForNode(wezel.id)).toBeNull();
      await p.migrationWorkerJob.update({ where: { id: job!.id }, data: { status: MigrationWorkerJobStatus.COMPLETED, completedAt: new Date() } });
    }
    expect(kolejne).toEqual(['FILES_DELTA', 'MYSQL_DELTA', 'WP_FIXUP', 'IMAP_DELTA']);
  });
});
