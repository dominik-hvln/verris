import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CloudLinuxTelemetryDto } from './telemetry.dto.js';
import { TelemetryService } from './telemetry.service.js';
import { faultyKonta, przekroczeniaFloty, raportDoZapisu } from './faulty-lve.js';

/** Walidacja jak globalny ValidationPipe (whitelist + forbidNonWhitelisted). */
function bledy(body: unknown) {
  const dto = plainToInstance(CloudLinuxTelemetryDto, body);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
}

function zapisz(body: Record<string, unknown>) {
  const update = vi.fn().mockResolvedValue({});
  const svc = new (TelemetryService as unknown as new (...a: unknown[]) => TelemetryService)({ server: { update } });
  return svc.processLveMetrics({ serverId: 's1', accounts: [], ...body } as never).then(() => update.mock.calls[0][0].data);
}

const TERAZ = Date.parse('2026-10-11T12:00:00Z');

describe('F2.6 — faulty limitów z węzła', () => {
  it('stary agent bez bloku faults przechodzi walidację i nie nadpisuje ostatniego raportu', async () => {
    expect(bledy({ agentVersion: 'lve-agent/1.1', accounts: [], node: { cagefsEnabled: true } })).toEqual([]);
    const data = await zapisz({ node: { cagefsEnabled: true } });
    expect(data).not.toHaveProperty('lveFaults');
    expect(data).not.toHaveProperty('lveFaultsAt');
  });

  it('nowy agent: okna 24 h i 7 dni przechodzą walidację; złe okno albo ujemny fault — nie', () => {
    const faults = {
      windows: [
        { hours: 24, accounts: [{ username: 'u1', ep: 12, nproc: 0 }] },
        { hours: 168, accounts: [{ username: 'u1', ep: 40, pmem: 2 }], truncated: false },
      ],
    };
    expect(bledy({ accounts: [], faults })).toEqual([]);
    expect(bledy({ accounts: [], faults: { windows: [{ hours: 48, accounts: [] }] } })).not.toEqual([]);
    expect(bledy({ accounts: [], faults: { windows: [{ hours: 24, accounts: [{ username: 'u1', ep: -1 }] }] } })).not.toEqual([]);
    expect(bledy({ accounts: [], faults: { windows: [{ hours: 24, accounts: [{ username: 'u1', lve: 1 }] }] } })).not.toEqual([]);
  });

  it('zapis: tylko konta z faultami, brakujące zasoby jako 0, błąd narzędzia zapisany zamiast okien', async () => {
    const data = await zapisz({
      faults: { windows: [{ hours: 24, accounts: [{ username: 'u1', ep: 3 }, { username: 'u2' }], truncated: true }] },
    });
    expect(data.lveFaults).toEqual({
      okna: [{ godzin: 24, konta: { u1: { cpu: 0, ep: 3, nproc: 0, pmem: 0, io: 0, iops: 0 } }, obcieto: true }],
      blad: null,
    });
    expect(data.lveFaultsAt).toBeInstanceOf(Date);
    const zBledem = await zapisz({ faults: { error: 'lvestats: database is locked' } });
    expect(zBledem.lveFaults).toEqual({ okna: [], blad: 'lvestats: database is locked' });
  });

  it('karta konta: brak raportu = brak danych (null), okno bez konta = zera, raport sprzed godziny = nieaktualny', () => {
    expect(faultyKonta({ lveFaults: null, lveFaultsAt: null }, 'u1', TERAZ)).toMatchObject({ odczytano: null, nieaktualne: true, doba: null, tydzien: null });
    const raport = raportDoZapisu({ windows: [{ hours: 24, accounts: [{ username: 'u1', ep: 5, cpu: 1 }] }] });
    const swiezy = { lveFaults: raport, lveFaultsAt: new Date(TERAZ - 5 * 60_000) };
    expect(faultyKonta(swiezy, 'u1', TERAZ)).toMatchObject({ nieaktualne: false, doba: { ep: 5, cpu: 1, nproc: 0 }, tydzien: null });
    expect(faultyKonta(swiezy, 'u9', TERAZ).doba).toEqual({ cpu: 0, ep: 0, nproc: 0, pmem: 0, io: 0, iops: 0 });
    expect(faultyKonta({ ...swiezy, lveFaultsAt: new Date(TERAZ - 60 * 60_000) }, 'u1', TERAZ).nieaktualne).toBe(true);
  });

  it('okno ucięte (więcej kont z faultami niż w raporcie) bez konta = brak danych, nie zera', () => {
    const raport = raportDoZapisu({
      windows: [
        { hours: 24, accounts: [{ username: 'u1', ep: 5 }], truncated: false },
        { hours: 168, accounts: [{ username: 'u1', ep: 50 }], truncated: true },
      ],
    });
    const serwer = { lveFaults: raport, lveFaultsAt: new Date(TERAZ - 60_000) };
    expect(faultyKonta(serwer, 'u9', TERAZ)).toMatchObject({ doba: { ep: 0 }, tydzien: null });
    expect(faultyKonta(serwer, 'u1', TERAZ).tydzien).toMatchObject({ ep: 50 });
    // Klucz z prototypu obiektu to nie konto z raportu.
    expect(faultyKonta(serwer, 'constructor', TERAZ).doba).toEqual({ cpu: 0, ep: 0, nproc: 0, pmem: 0, io: 0, iops: 0 });
  });

  it('flota: konta z faultami z wielu węzłów, od najgorszego w dobie, z usługą po (węzeł, login)', () => {
    const r1 = raportDoZapisu({
      windows: [
        { hours: 24, accounts: [{ username: 'a', ep: 2 }] },
        { hours: 168, accounts: [{ username: 'a', ep: 9 }, { username: 'b', pmem: 4 }] },
      ],
    });
    const r2 = raportDoZapisu({ windows: [{ hours: 24, accounts: [{ username: 'a', nproc: 30 }] }] });
    const { wiersze, wezly } = przekroczeniaFloty(
      [
        { id: 's1', name: 'node-1', hostname: null, lveFaults: r1, lveFaultsAt: new Date(TERAZ) },
        { id: 's2', name: null, hostname: 'n2.example', lveFaults: r2, lveFaultsAt: new Date(TERAZ) },
        { id: 's3', name: 'node-3', hostname: null, lveFaults: { okna: [], blad: 'brak lvestats' }, lveFaultsAt: new Date(TERAZ) },
      ],
      [
        { serverId: 's1', daUsername: 'a', subscriptionId: 'sub-a1', domain: 'a.pl' },
        { serverId: 's2', daUsername: 'a', subscriptionId: 'sub-a2', domain: 'a2.pl' },
      ],
      TERAZ,
    );
    expect(wiersze.map((w) => [w.serverId, w.username, w.subscriptionId, w.razemDoba, w.razemTydzien])).toEqual([
      ['s2', 'a', 'sub-a2', 30, 0],
      ['s1', 'a', 'sub-a1', 2, 9],
      ['s1', 'b', null, 0, 4],
    ]);
    expect(wiersze[0].tydzien).toBeNull();
    expect(wezly.find((w) => w.serverId === 's3')).toMatchObject({ blad: 'brak lvestats', wezel: 'node-3' });
    expect(wezly.find((w) => w.serverId === 's2')?.wezel).toBe('n2.example');
  });
});
