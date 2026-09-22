import { TelemetryService } from './telemetry.service';

/** NODE-03 — pojemność węzła odświeża się z telemetrii, nie tylko przy handshake. */
function run(node: Record<string, unknown> | undefined) {
  const update = jest.fn().mockResolvedValue({});
  const svc = new (TelemetryService as unknown as new (...a: unknown[]) => TelemetryService)({ server: { update } });
  return svc.processLveMetrics({ serverId: 's1', accounts: [], node } as never).then(() => update.mock.calls[0][0].data);
}

describe('NODE-03 pojemność z telemetrii', () => {
  it('raport z pojemnością aktualizuje rdzenie, RAM i dysk węzła', async () => {
    const data = await run({ totalCpuCores: 32, totalMemoryMb: 262144, totalDiskMb: 3_800_000 });
    expect(data).toMatchObject({ totalCpuCores: 32, totalMemoryMb: 262144, totalDiskMb: 3_800_000 });
  });

  it('stary agent bez pól pojemności niczego nie zeruje', async () => {
    const data = await run({ cagefsEnabled: true });
    expect(data).not.toHaveProperty('totalCpuCores');
    expect(data).not.toHaveProperty('totalMemoryMb');
    expect(data).not.toHaveProperty('totalDiskMb');
  });
});
