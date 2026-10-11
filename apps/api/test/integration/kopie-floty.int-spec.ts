import { NodeBackupAgentController } from '../../src/servers/node-backup.agent.controller.js';
import { KopieFlotyService } from '../../src/servers/kopie-floty.js';
import { MetricsService } from '../../src/observability/metrics.service.js';
import { statusOffsite } from '../../src/servers/offsite-status.js';
import { atrapy, prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

const DOBA = 24 * 60 * 60 * 1000;

/**
 * F3.3 — kopie floty na prawdziwej bazie (migracja 20261011160000: Account.offsiteBackup*): raport przebiegu węzła
 * z wynikiem każdego konta → stan kont, widok „Kopie floty”, metryka verris_backup_accounts_stale i status kopii
 * widziany przez klienta. Raport starego skryptu (bez listy kont) niczego w kontach nie zmienia.
 */
describe('F3.3 — kopie floty: raport węzła per konto → widok, metryka, status klienta', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('udane, nieudane i obce konta; widok floty; metryka liczy konta bez świeżej kopii', async () => {
    const p = prisma() as never;
    const plan = await utworzPlan();
    const w1 = await utworzWezel();
    const w2 = await utworzWezel();
    const ok = await utworzKonto({ serverId: w1.id, planId: plan.id });
    const zle = await utworzKonto({ serverId: w1.id, planId: plan.id });
    const stare = await utworzKonto({ serverId: w1.id, planId: plan.id });
    const obce = await utworzKonto({ serverId: w2.id, planId: plan.id });
    const usuniete = await utworzKonto({ serverId: w1.id, planId: plan.id, status: 'DELETED' });
    const tydzien = new Date(Date.now() - 7 * DOBA);
    // Konta „sprzed tygodnia”; konto `stare` ma ostatnią udaną kopię sprzed 5 dni.
    await prisma().account.updateMany({ where: { id: { in: [ok.account.id, zle.account.id, stare.account.id, obce.account.id] } }, data: { createdAt: tydzien } });
    await prisma().account.update({ where: { id: stare.account.id }, data: { offsiteBackupOkAt: new Date(Date.now() - 5 * DOBA), offsiteBackupBytes: 10n } });
    await prisma().account.update({ where: { id: zle.account.id }, data: { offsiteBackupOkAt: new Date(Date.now() - DOBA), offsiteBackupBytes: 77n } });

    const audit = atrapy.audit();
    const agent = new NodeBackupAgentController(p, audit as never);
    await agent.offsiteReport({ serverId: w1.id } as never, {
      ok: false,
      accounts: 2,
      bytes: 999,
      durationSec: 60,
      info: 'rclone rc=3: admin-backup failed for: ' + zle.account.daUsername,
      konta: [
        { u: ok.account.daUsername, ok: true, b: 4096 },
        { u: zle.account.daUsername, ok: false, b: 0 },
        // Konto innego węzła i konto usunięte o tym samym loginie nie są ruszane.
        { u: obce.account.daUsername, ok: true, b: 1 },
        { u: usuniete.account.daUsername, ok: true, b: 1 },
      ],
    });

    const konto = (id: string) => prisma().account.findUniqueOrThrow({ where: { id }, include: { server: true } });
    const a = await konto(ok.account.id);
    expect(a.offsiteBackupOkAt).not.toBeNull();
    expect(Number(a.offsiteBackupBytes)).toBe(4096);
    const z = await konto(zle.account.id);
    expect(Number(z.offsiteBackupBytes)).toBe(77);
    expect(z.offsiteBackupFailedAt!.getTime()).toBeGreaterThan(z.offsiteBackupOkAt!.getTime());
    expect((await konto(obce.account.id)).offsiteBackupOkAt).toBeNull();
    expect((await konto(usuniete.account.id)).offsiteBackupOkAt).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NODE_OFFSITE_BACKUP_FAILED', details: expect.objectContaining({ kontZapisanych: 2, nieudane: [zle.account.daUsername] }) }));

    // Klient konta z nieudaną ostatnią kopią: chroniony poprzednią, z jej datą — a nie „ostatnia: dziś”.
    expect(statusOffsite(z)).toMatchObject({ protected: true, lastRunAt: z.offsiteBackupOkAt!.toISOString(), lastRunOk: false });

    // Stary skrypt (bez listy kont) — konta bez zmian.
    await agent.offsiteReport({ serverId: w1.id } as never, { ok: true, accounts: 3 });
    expect(Number((await konto(ok.account.id)).offsiteBackupBytes)).toBe(4096);

    const kopie = new KopieFlotyService(p, { podglad: async () => ({ skonfigurowany: true, host: 'h', port: 23, user: 'u', sciezka: 's', retencjaDni: 30, zmienionoAt: null }) } as never);
    const flota = await kopie.stan(undefined);
    expect(flota.podsumowanie).toMatchObject({ kont: 4, ok: 1, nieudane: 1, przeterminowane: 1, bezKopii: 1 });
    expect(flota.konta.map((k) => [k.login, k.stan])).toEqual([
      [zle.account.daUsername, 'nieudana'],
      [obce.account.daUsername, 'brak'],
      [stare.account.daUsername, 'przeterminowana'],
    ]);
    expect(flota.konta[0].rozmiar).toBe(77);
    // Widok nie zdradza adresu ani loginu magazynu kopii.
    expect(JSON.stringify(flota)).not.toMatch(/"host"|"user"|"sciezka"/);
    const wezel1 = flota.wezly.find((w) => w.id === w1.id)!;
    expect(wezel1.przebieg).toMatchObject({ ok: true, konta: 3 });
    expect(wezel1.konta).toMatchObject({ kont: 3, ok: 1, nieudane: 1, bezSwiezej: 1 });
    expect(flota.wezly.find((w) => w.id === w2.id)!.przebieg).toBeNull();

    // Przegląd F3.3 — próby odtworzenia były tylko dla ADMIN: NOC/L2/audytor widzą wynik i rodzaj źródła, bez
    // zasobnika, obiektu i „właściciela” (login@host panelu sterującego).
    await prisma().restoreDrill.create({
      data: {
        startedAt: new Date(Date.now() - 120_000), finishedAt: new Date(), durationSec: 120, result: 'OK',
        objectName: 'verris-2026-10-10-0300.sql.gz', source: 'verris-backups-prod/postgres', rowCounts: {}, owner: 'deploy@cp-waw1',
      },
    });
    const dlaZespolu = await kopie.stan(undefined);
    expect(dlaZespolu.proby).toEqual([expect.objectContaining({ result: 'OK', durationSec: 120, source: 'postgres' })]);
    expect(JSON.stringify(dlaZespolu.proby)).not.toMatch(/verris-backups-prod|cp-waw1|sql\.gz/);
    expect((await kopie.stan(undefined, { admin: true })).proby[0].source).toBe('verris-backups-prod/postgres');

    const tylkoW2 = await kopie.stan(w2.id);
    expect(tylkoW2.konta.map((k) => k.login)).toEqual([obce.account.daUsername]);
    expect(tylkoW2.wezly).toHaveLength(1);

    // Metryka: konta starsze niż próg bez udanej kopii w progu — `obce` (brak) i `stare` (5 dni). `zle` ma udaną sprzed doby.
    const metryki = await new MetricsService(p).getPrometheusMetrics();
    expect(metryki).toMatch(/^verris_backup_accounts_stale 2$/m);
  });
});
