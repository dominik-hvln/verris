import { MigrationsAdminController } from './migrations.admin.controller.js';

/** Plan E, patch 9 — karta usługi pobiera zlecenia migracji tylko tej usługi (ponów krok, rozwiąż uwagę). */
describe('MigrationsAdminController.list — filtr usługi', () => {
  function kontroler() {
    const prisma = { migrationRequest: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) } };
    return { c: new MigrationsAdminController(prisma as never), prisma };
  }

  it('subscriptionId zawęża listę; nieznany status nie zdejmuje filtra usługi', async () => {
    const k = kontroler();
    await k.c.list('COSTAM', 's1');
    expect(k.prisma.migrationRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { subscriptionId: 's1' } }));
    await k.c.list('ATTENTION', 's1');
    expect(k.prisma.migrationRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { status: 'ATTENTION', subscriptionId: 's1' } }));
  });

  it('bez parametrów — cała flota', async () => {
    const k = kontroler();
    await k.c.list();
    expect(k.prisma.migrationRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});
