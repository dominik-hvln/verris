import { ServiceUnavailableException } from '@nestjs/common';
import { NodeSelectorService } from '../../src/subscriptions/node-selector.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  dodajProbke,
  prisma,
  rozlacz,
  utworzKonto,
  utworzPlan,
  utworzWezel,
  wyczyscBaze,
} from './setup';

/**
 * X-04 — placement kont przeciwko PRAWDZIWEJ bazie.
 *
 * Testy jednostkowe tego serwisu podstawiały fałszywą Prismę i dowodziły, że
 * arytmetyka pojemności jest poprawna. Nie dowodziły, że:
 *
 *   · `groupBy` z filtrem `status: { not: 'DELETED' }` faktycznie pomija te konta,
 *   · zapytanie o `UsageMetric` z oknem świeżości zwraca to, co ma zwrócić,
 *   · wybór najnowszej próbki na subskrypcję działa na prawdziwym `ORDER BY`,
 *   · `Float` z Postgresa (overcommit) wraca jako liczba, a nie jako Decimal.
 *
 * Każda z tych rzeczy w atrapie działa zawsze.
 */

describe('X-04 — NodeSelectorService przeciwko prawdziwej bazie', () => {
  let selektor: NodeSelectorService;

  beforeAll(() => {
    selektor = new NodeSelectorService(prisma() as unknown as PrismaService);
  });

  beforeEach(async () => {
    await wyczyscBaze();
  });

  afterAll(async () => {
    await rozlacz();
  });

  describe('pojemność handlowa', () => {
    it('bez nadsubskrypcji mieści 16 kont po 8 GB na węźle 128 GB', async () => {
      const wezel = await utworzWezel();
      const plan = await utworzPlan();

      let zmieszczone = 0;
      for (let i = 0; i < 20; i++) {
        try {
          await selektor.pickServerForPlan(plan);
        } catch (e) {
          expect(e).toBeInstanceOf(ServiceUnavailableException);
          break;
        }
        await utworzKonto({ serverId: wezel.id, planId: plan.id });
        zmieszczone++;
      }

      expect(zmieszczone).toBe(16);
    });

    it('overcommit 4× wpuszcza konto tam, gdzie 1× odmawia', async () => {
      const wezel = await utworzWezel();
      const plan = await utworzPlan();
      for (let i = 0; i < 16; i++) {
        await utworzKonto({ serverId: wezel.id, planId: plan.id });
      }
      await dodajProbke({
        serverId: wezel.id,
        subscriptionId: (await prisma().subscription.findFirstOrThrow()).id,
        ramMb: 4096,
      });

      await expect(selektor.pickServerForPlan(plan)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      await prisma().server.update({
        where: { id: wezel.id },
        data: { overcommitRam: 4, overcommitCpu: 4 },
      });

      const wybrany = await selektor.pickServerForPlan(plan);
      expect(wybrany.id).toBe(wezel.id);
      // Postgres zwraca Float jako number — gdyby wracał jako string albo
      // Decimal, cała arytmetyka pojemności liczyłaby się na tekście.
      expect(typeof wybrany.overcommitRam).toBe('number');
      expect(wybrany.overcommitRam).toBe(4);
    });
  });

  describe('konta usunięte nie zajmują miejsca w limicie', () => {
    it('maxAccounts liczy tylko konta żywe', async () => {
      const wezel = await utworzWezel({ maxAccounts: 3 });
      const plan = await utworzPlan();

      for (let i = 0; i < 3; i++) {
        await utworzKonto({ serverId: wezel.id, planId: plan.id });
      }
      await expect(selektor.pickServerForPlan(plan)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      // Jedno konto znika — miejsce w limicie musi się zwolnić.
      const konto = await prisma().account.findFirstOrThrow();
      await prisma().account.update({
        where: { id: konto.id },
        data: { status: 'DELETED' },
      });
      await prisma().server.update({
        where: { id: wezel.id },
        data: {
          allocatedCpu: { decrement: konto.cpuLimit },
          allocatedMemory: { decrement: konto.ramLimitMb },
          allocatedDisk: { decrement: konto.diskLimitMb },
        },
      });

      const wybrany = await selektor.pickServerForPlan(plan);
      expect(wybrany.id).toBe(wezel.id);
    });
  });

  describe('bramka fizyczna — telemetria z prawdziwej tabeli', () => {
    it('realne zużycie blokuje węzeł, mimo zapasu handlowego', async () => {
      const wezel = await utworzWezel({
        overcommitRam: 4,
        reservedHeadroomPercent: 20,
      });
      const plan = await utworzPlan();
      const { subscription } = await utworzKonto({ serverId: wezel.id, planId: plan.id });

      // Sprzedane: jedno konto. Realnie: maszyna zjedzona.
      await dodajProbke({
        serverId: wezel.id,
        subscriptionId: subscription.id,
        ramMb: 120 * 1024,
      });

      await expect(selektor.pickServerForPlan(plan)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('próbka starsza niż okno świeżości nie liczy się wcale', async () => {
      const wezel = await utworzWezel({ overcommitRam: 4 });
      const plan = await utworzPlan();
      const { subscription } = await utworzKonto({ serverId: wezel.id, planId: plan.id });

      // 90 minut temu — poza oknem 30 minut. Węzeł traktowany jak bez telemetrii,
      // więc overcommit degraduje do 1,0 i mieści jeszcze 15 kont.
      await dodajProbke({
        serverId: wezel.id,
        subscriptionId: subscription.id,
        ramMb: 120 * 1024,
        minutTemu: 90,
      });

      const wybrany = await selektor.pickServerForPlan(plan);
      expect(wybrany.id).toBe(wezel.id);
    });

    it('liczy JEDNĄ najnowszą próbkę na subskrypcję, nie sumuje okna', async () => {
      const wezel = await utworzWezel({ overcommitRam: 4 });
      const plan = await utworzPlan();
      const { subscription } = await utworzKonto({ serverId: wezel.id, planId: plan.id });

      // Sześć próbek po 20 GB w oknie świeżości. Zsumowane dałyby 120 GB
      // i zablokowały węzeł. Poprawnie liczy się tylko najnowsza.
      for (let i = 0; i < 6; i++) {
        await dodajProbke({
          serverId: wezel.id,
          subscriptionId: subscription.id,
          ramMb: 20 * 1024,
          minutTemu: i * 5 + 1,
        });
      }

      const wybrany = await selektor.pickServerForPlan(plan);
      expect(wybrany.id).toBe(wezel.id);
    });
  });

  describe('wybór spośród kilku węzłów', () => {
    it('woli węzeł realnie luźniejszy, nie ten mniej sprzedany', async () => {
      const plan = await utworzPlan();
      const zajety = await utworzWezel({ name: 'zajety', overcommitRam: 4 });
      const wolny = await utworzWezel({ name: 'wolny', overcommitRam: 4 });

      const a = await utworzKonto({ serverId: zajety.id, planId: plan.id });
      for (let i = 0; i < 8; i++) {
        await utworzKonto({ serverId: wolny.id, planId: plan.id });
      }
      const b = await prisma().subscription.findFirstOrThrow({
        where: { account: { serverId: wolny.id } },
      });

      await dodajProbke({
        serverId: zajety.id,
        subscriptionId: a.subscription.id,
        ramMb: 100 * 1024,
      });
      await dodajProbke({ serverId: wolny.id, subscriptionId: b.id, ramMb: 4 * 1024 });

      const wybrany = await selektor.pickServerForPlan(plan);
      expect(wybrany.id).toBe(wolny.id);
    });

    it('pomija węzeł cordonowany i węzeł bez raportu pojemności', async () => {
      const plan = await utworzPlan();
      await utworzWezel({ name: 'cordon', acceptsNewAccounts: false });
      await utworzWezel({ name: 'bez-pojemnosci', totalMemoryMb: null, totalCpuCores: null });
      const dobry = await utworzWezel({ name: 'dobry' });

      const wybrany = await selektor.pickServerForPlan(plan);
      expect(wybrany.id).toBe(dobry.id);
    });

    it('gdy wszystkie węzły są w MAINTENANCE, komunikat mówi o serwisie', async () => {
      const plan = await utworzPlan();
      await utworzWezel({
        status: 'MAINTENANCE',
        maintenanceReason: 'wymiana dysku',
      });

      await expect(selektor.pickServerForPlan(plan)).rejects.toThrow(/serwis infrastruktury/);
    });
  });
});
