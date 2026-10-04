import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { NodeStackReadinessService } from './node-stack-readiness.service.js';

/**
 * t1 02.10: „Napraw pakiety DA” / „Wyślij pakiety na flotę” nadpisują pakiety, a DA nakłada pakiet ponownie
 * na jego użytkowników — ssh=OFF z planu zdejmował SSH włączone przez klienta (powłoka /bin/false).
 * Po naprawie pakietów SSH wraca tym samym zadaniem węzła co przełącznik w panelu.
 */
describe('NodeStackReadinessService.repairDaPackages — SSH klientów przeżywa naprawę pakietów', () => {
  const zad = (mode: string, status: NodeTaskStatus = NodeTaskStatus.COMPLETED) => ({ status, payload: { mode } });
  function uslugaZ(zadaniaKont: Record<string, ReturnType<typeof zad>[]>) {
    const prisma = {
      account: {
        findMany: vi.fn(async () => Object.keys(zadaniaKont).map((id) => ({ id, daUsername: `u-${id}` }))),
      },
      nodeTask: {
        findMany: vi.fn(async ({ where }: { where: { accountId: string } }) => zadaniaKont[where.accountId]),
        create: vi.fn(async () => ({})),
      },
    };
    const da = { syncPlanPackagesForServer: vi.fn(async () => ({ synced: ['verris-hosting'] })) };
    const svc = new NodeStackReadinessService(prisma as never, da as never, {} as never);
    return { svc, prisma, da };
  }

  it('włączone SSH (ostatnia zmiana „enable”) dostaje zadanie enable; wyłączone, bez historii i w toku — nie', async () => {
    const { svc, prisma, da } = uslugaZ({
      wlaczone: [zad('keys'), zad('enable'), zad('disable')],
      wylaczone: [zad('disable'), zad('enable')],
      bezHistorii: [],
      wToku: [zad('enable', NodeTaskStatus.QUEUED), zad('enable')],
      nieudane: [zad('enable', NodeTaskStatus.FAILED), zad('disable')],
    });
    const wynik = await svc.repairDaPackages('srv1');
    expect(da.syncPlanPackagesForServer).toHaveBeenCalledWith('srv1', { nadpisz: true });
    expect(wynik).toEqual({ synced: ['verris-hosting'], przywroconeSsh: 1 });
    expect(prisma.nodeTask.create).toHaveBeenCalledTimes(1);
    expect(prisma.nodeTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serverId: 'srv1',
        accountId: 'wlaczone',
        kind: NodeTaskKind.SSH_ACCESS,
        status: NodeTaskStatus.QUEUED,
        payload: expect.objectContaining({ mode: 'enable', daUser: 'u-wlaczone' }),
      }),
    });
  });
});
