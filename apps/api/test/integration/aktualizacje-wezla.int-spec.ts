import { AuditService } from '../../src/common/audit/audit.service.js';
import { AlarmyService, AKCJA_ALARMU } from '../../src/alarmy/alarmy.service.js';
import { TelemetryService } from '../../src/telemetry/telemetry.service.js';
import { prisma, rozlacz, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * 21.10 — weryfikator aktualizacji na prawdziwej bazie (migracja 20261021200000: Server.aktualizacje/aktualizacjeAt):
 * raport agenta zapisany telemetrią, alarm o nowej poprawce raz (deduplikacja po wpisie ALARM_OPS w dzienniku),
 * raport bez bloku `aktualizacje` niczego nie kasuje.
 */
describe('Weryfikator aktualizacji: telemetria → Server.aktualizacje i alarm', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('raport trafia do bazy, alarm o nowej poprawce Important idzie raz; stary raport zostaje przy telemetrii bez bloku', async () => {
    const p = prisma() as never;
    const w = await utworzWezel();
    const mailer = { send: vi.fn(async () => ({ delivered: true })) };
    const alarmy = new AlarmyService(p, mailer as never, new AuditService(p), { get: () => undefined } as never);
    const telemetria = new TelemetryService(p, alarmy);
    const raport = {
      sprawdzono: '2026-10-21T18:00:00Z',
      dnf: { poprawki: [{ advisory: 'ALSA-2026:1001', waga: 'Important', pakiet: 'alt-php83-cli-8.3.12-1.el10.x86_64', cve: ['CVE-2026-109618'] }] },
      custombuild: null,
      altPhp: { '8.3': '8.3.11' },
    };

    await telemetria.processLveMetrics({ serverId: w.id, accounts: [], aktualizacje: raport });
    await telemetria.processLveMetrics({ serverId: w.id, accounts: [], aktualizacje: raport });
    await telemetria.processLveMetrics({ serverId: w.id, accounts: [], node: { cagefsEnabled: true } });

    const s = await prisma().server.findUniqueOrThrow({ where: { id: w.id } });
    expect(s.aktualizacjeAt).toBeInstanceOf(Date);
    expect(s.aktualizacje).toEqual({
      sprawdzono: '2026-10-21T18:00:00.000Z',
      dnf: { poprawki: raport.dnf.poprawki },
      custombuild: null,
      altPhp: { '8.3': '8.3.11' },
    });
    const wpisy = await prisma().auditLog.findMany({ where: { action: AKCJA_ALARMU } });
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0].details).toMatchObject({ klucz: `aktualizacje:${w.id}:ALSA-2026:1001` });
  });
});
