import { MigrationStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { MigrationOrchestratorService } from '../../src/subscriptions/migration-orchestrator.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * 14.10 — hasła źródła w zleceniu przekazanym obsłudze (ATTENTION) najwyżej 14 dni od eskalacji, przypomnienie
 * dla zespołu 3 dni wcześniej, raz na zlecenie. Na prawdziwym Postgresie: filtry dat i filtr JSON zdarzenia.
 */
const DZIEN = 24 * 60 * 60 * 1000;
const temu = (dni: number) => new Date(Date.now() - dni * DZIEN);

describe('Retencja haseł migracji w stanie ATTENTION', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('15 dni — hasła usunięte; 12 dni — jedno przypomnienie; 2 dni — bez zmian', async () => {
    const p = prisma();
    const powiadomienia: Array<{ userId: string; title: string }> = [];
    const notifications = { create: async (n: { userId: string; title: string }) => { powiadomienia.push(n); } };
    const s = new MigrationOrchestratorService(p as never, {} as never, new AuditService(p as never), notifications as never, null as never, null as never, null as never);
    await p.user.create({ data: { email: `st-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan({ productKind: 'HOSTING' })).id });
    const zlecenie = (dni: number, domena: string) =>
      p.migrationRequest.create({
        data: { subscriptionId: k.subscription.id, userId: k.user.id, sourceBundleEnc: 'enc:x', status: MigrationStatus.ATTENTION, needsAttention: true, attentionAt: temu(dni), targetDomain: domena } as never,
      });
    const stare = await zlecenie(15, 'stare.pl');
    const czeka = await zlecenie(12, 'czeka.pl');
    const swieze = await zlecenie(2, 'swieze.pl');

    const r1 = await s.purgeExpiredSecrets();
    const r2 = await s.purgeExpiredSecrets();
    expect([r1, r2]).toEqual([{ purged: 1, przypomniano: 1 }, { purged: 0, przypomniano: 0 }]);

    const stan = async (id: string) => p.migrationRequest.findUniqueOrThrow({ where: { id }, select: { secretsPurgedAt: true, sourceBundleEnc: true } });
    expect(await stan(stare.id)).toMatchObject({ sourceBundleEnc: '' });
    expect((await stan(stare.id)).secretsPurgedAt).not.toBeNull();
    expect(await stan(czeka.id)).toEqual({ secretsPurgedAt: null, sourceBundleEnc: 'enc:x' });
    expect(await stan(swieze.id)).toEqual({ secretsPurgedAt: null, sourceBundleEnc: 'enc:x' });

    const zdarzenia = await p.subscriptionEvent.findMany({ where: { type: 'MIGRATION_SECRETS_EXPIRING' } });
    expect(zdarzenia.map((e) => (e.details as { migrationRequestId: string }).migrationRequestId)).toEqual([czeka.id]);
    expect(powiadomienia.map((n) => n.title).sort()).toEqual([
      'Migracja czeka.pl: hasła starego hostingu znikną za 3 dni',
      'Migracja stare.pl: hasła starego hostingu usunięte',
    ]);
  });
});
