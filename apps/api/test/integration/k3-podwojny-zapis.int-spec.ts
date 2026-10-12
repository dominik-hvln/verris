/**
 * PRZEGLĄD 12.10 — K3: dwa równoległe zapisy tych samych limitów (dwuklik „Zapisz”, dwie karty admina).
 * Uruchom: DATABASE_URL=… npx vitest run -c vitest.integration.config.ts test/integration/k3-podwojny-zapis.int-spec.ts
 *
 * Przed poprawką CZERWONY: oba żądania czytają przed={} (bazaPrzed = 51200), oba robią
 * account.diskLimitMb increment +roznica i server.allocatedDisk += roznica — quota konta w bazie i księga węzła
 * rosną dwa razy, a limitOverrides zapisane raz. Późniejsze „Przywróć limity planu” odejmuje różnicę raz,
 * więc rozjazd zostaje na stałe.
 */
import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { LimityIndywidualneService } from '../../src/subscriptions/limity-indywidualne.service.js';
import { ksiegaWezla, prawdaOWezle, prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

// Atrapa węzła z małym opóźnieniem (realne wywołanie DA trwa ~setki ms) — oba żądania zdążą przeczytać stan przed zapisem.
const da = {
  getClientForServer: async () => ({
    customizeUserLimits: async () => new Promise((r) => setTimeout(r, 50)),
    assignUserPackage: async () => new Promise((r) => setTimeout(r, 50)),
  }),
};
const svc = () => new LimityIndywidualneService(prisma() as never, new AuditService(prisma() as never), da as never);

describe('K3 — równoległe zapisy limitów (przegląd 12.10)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('dwuklik z tymi samymi limitami: quota konta i księga węzła zmieniają się raz', async () => {
    const wezel = await utworzWezel();
    const plan = await utworzPlan(); // dysk 50 GB
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id, scaledDiskMb: 0 });
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: SubscriptionStatus.ACTIVE } });
    const admin = await prisma().user.create({ data: { email: `admin-k3r-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const zlecenie = { subscriptionId: k.subscription.id, operator: { userId: admin.id, role: 'ADMIN' }, powod: 'Umowa z klientem — większy dysk', limity: { diskLimitMb: 102400 } };

    const przed = await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } });
    await Promise.allSettled([svc().ustaw(zlecenie), svc().ustaw(zlecenie)]);

    const po = await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } });
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } });
    expect(s.limitOverrides).toEqual({ diskLimitMb: 102400 });
    // Oczekiwane: 51200 → 102400 (+51200 raz). Obecny kod: 51200 + 2×51200 = 153600.
    expect(po.diskLimitMb - przed.diskLimitMb).toBe(102400 - 51200);
    expect(await ksiegaWezla(wezel.id)).toEqual(await prawdaOWezle(wezel.id));
  });
});
