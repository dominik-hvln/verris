import { TelemetryService } from '../../src/telemetry/telemetry.service.js';
import { przekroczeniaZBazy } from '../../src/servers/przekroczenia-limitow.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F2.6 — faulty limitów na prawdziwej bazie (migracja 20261011130000: Server.lveFaults/lveFaultsAt): raport agenta
 * zapisany telemetrią, odczytany listą przekroczeń floty i węzła; stary agent bez faultów niczego nie zeruje.
 */
describe('F2.6 — faulty limitów: telemetria → lista przekroczeń', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('raport węzła trafia do bazy i na listę floty z usługą; konto usunięte zostaje bez usługi', async () => {
    const p = prisma() as never;
    const plan = await utworzPlan();
    const w1 = await utworzWezel();
    const w2 = await utworzWezel();
    const k1 = await utworzKonto({ serverId: w1.id, planId: plan.id });
    const k2 = await utworzKonto({ serverId: w1.id, planId: plan.id, status: 'DELETED' });
    const telemetria = new TelemetryService(p);

    await telemetria.processLveMetrics({
      serverId: w1.id,
      accounts: [],
      faults: {
        windows: [
          { hours: 24, accounts: [{ username: k1.account.daUsername, ep: 25, nproc: 1 }] },
          { hours: 168, accounts: [{ username: k1.account.daUsername, ep: 90 }, { username: k2.account.daUsername, pmem: 4 }] },
        ],
      },
    });
    await telemetria.processLveMetrics({ serverId: w2.id, accounts: [], faults: { error: 'cloudlinux-statistics --period=1d: brak danych' } });
    // Stary agent (bez bloku faults) nie kasuje ostatniego raportu.
    await telemetria.processLveMetrics({ serverId: w1.id, accounts: [], node: { cagefsEnabled: true } });

    const flota = await przekroczeniaZBazy(p, undefined, Date.now());
    expect(flota.wiersze.map((w) => [w.username, w.subscriptionId, w.razemDoba, w.razemTydzien])).toEqual([
      [k1.account.daUsername, k1.subscription.id, 26, 90],
      [k2.account.daUsername, null, 0, 4],
    ]);
    expect(flota.wezly.find((w) => w.serverId === w2.id)).toMatchObject({ blad: 'cloudlinux-statistics --period=1d: brak danych' });

    const wezel2 = await przekroczeniaZBazy(p, w2.id, Date.now());
    expect(wezel2.wiersze).toEqual([]);
    expect(wezel2.wezly).toHaveLength(1);
  });
});
