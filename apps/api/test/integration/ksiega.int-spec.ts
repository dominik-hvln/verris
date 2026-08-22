import { AutoscalingEngineService } from '../../src/autoscaling/autoscaling-engine.service';
import { AccountDeletionService } from '../../src/compliance/account-deletion.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  atrapy,
  ksiegaWezla,
  prawdaOWezle,
  prisma,
  rozlacz,
  utworzKonto,
  utworzPlan,
  utworzWezel,
  wyczyscBaze,
} from './setup';

/**
 * X-04 — cykl życia księgi pojemności na PRAWDZIWEJ bazie.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CZEGO NIE SPRAWDZIŁY POPRZEDNIE WARSTWY
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   ksiega-niezmiennik.spec.ts  arytmetyka jest poprawna       (bez bazy)
 *   test/ksiega-wezla.spec.ts   serwisy używają tej arytmetyki (czyta kod)
 *   ops/sql/sprawdz-baze…       stan po migracji jest właściwy (bez serwisów)
 *   TEN PLIK                    serwis + baza dają właściwy wynik
 *
 * Ostatnie ogniwo: czy serwis woła funkcje księgi we WŁAŚCIWYM MOMENCIE,
 * z właściwymi argumentami, w transakcji, która faktycznie się zatwierdza.
 * Tego nie da się sprawdzić ani symulacją, ani czytaniem kodu.
 *
 * Fałszywe zostaje wyłącznie to, co jest naprawdę na zewnątrz: DirectAdmin,
 * poczta, dziennik audytu. Baza i logika są prawdziwe.
 */

describe('X-04 — księga pojemności w cyklu życia konta', () => {
  beforeEach(async () => {
    await wyczyscBaze();
  });

  afterAll(async () => {
    await rozlacz();
  });

  describe('usunięcie konta zwalnia pojemność węzła', () => {
    it('księga wraca do zera po usunięciu jedynego konta', async () => {
      const wezel = await utworzWezel();
      const plan = await utworzPlan();
      const { account } = await utworzKonto({ serverId: wezel.id, planId: plan.id });

      expect(await ksiegaWezla(wezel.id)).toEqual({
        allocatedCpu: 200,
        allocatedMemory: 8192,
        allocatedDisk: 51200,
      });

      const usuwanie = new AccountDeletionService(
        prisma() as unknown as PrismaService,
        atrapy.audit() as never,
        atrapy.directAdmin() as never,
        atrapy.mailer() as never,
        atrapy.config() as never,
      );

      // W produkcji woła to scheduler kasowania; tutaj wołamy wprost, bo
      // przedmiotem testu jest skutek dla księgi, nie harmonogram.
      await usuwanie.purgeAccountOnDa(account.id);

      const po = await prisma().account.findUniqueOrThrow({ where: { id: account.id } });
      expect(po.status).toBe('DELETED');
      expect(await ksiegaWezla(wezel.id)).toEqual({
        allocatedCpu: 0,
        allocatedMemory: 0,
        allocatedDisk: 0,
      });
    });

    it('zwalnia limity EFEKTYWNE — razem z nadwyżką autoskalowania', async () => {
      const wezel = await utworzWezel();
      const plan = await utworzPlan();
      // Konto z nadwyżką: 8 GB bazy + 8 GB doskalowane.
      const { account } = await utworzKonto({
        serverId: wezel.id,
        planId: plan.id,
        scaledRamMb: 8192,
        scaledCpu: 200,
      });

      expect((await ksiegaWezla(wezel.id)).allocatedMemory).toBe(16384);

      const usuwanie = new AccountDeletionService(
        prisma() as unknown as PrismaService,
        atrapy.audit() as never,
        atrapy.directAdmin() as never,
        atrapy.mailer() as never,
        atrapy.config() as never,
      );
      await usuwanie.purgeAccountOnDa(account.id);

      // Gdyby zwalniało samą bazę planu, w księdze zostałoby 8192 na zawsze.
      expect(await ksiegaWezla(wezel.id)).toEqual({
        allocatedCpu: 0,
        allocatedMemory: 0,
        allocatedDisk: 0,
      });
    });

    it('usunięcie jednego z wielu kont nie rusza pozostałych', async () => {
      const wezel = await utworzWezel();
      const plan = await utworzPlan();
      const a = await utworzKonto({ serverId: wezel.id, planId: plan.id });
      await utworzKonto({ serverId: wezel.id, planId: plan.id });
      await utworzKonto({ serverId: wezel.id, planId: plan.id });

      const usuwanie = new AccountDeletionService(
        prisma() as unknown as PrismaService,
        atrapy.audit() as never,
        atrapy.directAdmin() as never,
        atrapy.mailer() as never,
        atrapy.config() as never,
      );
      await usuwanie.purgeAccountOnDa(a.account.id);

      expect(await ksiegaWezla(wezel.id)).toEqual(await prawdaOWezle(wezel.id));
      expect((await ksiegaWezla(wezel.id)).allocatedMemory).toBe(2 * 8192);
    });
  });

  describe('autoskalowanie dopisuje nadwyżkę do księgi', () => {
    function silnik() {
      return new AutoscalingEngineService(
        prisma() as unknown as PrismaService,
        atrapy.audit() as never,
        atrapy.directAdmin() as never,
        atrapy.mailer() as never,
        atrapy.config() as never,
        {
          billDueBlocks: jest.fn().mockResolvedValue(undefined),
          episodeSpendPln: jest.fn().mockResolvedValue(0),
        } as never,
      );
    }

    it('nadwyżka trafia do księgi razem ze zmianą stanu konta', async () => {
      const wezel = await utworzWezel({ overcommitRam: 4, overcommitCpu: 4 });
      const plan = await utworzPlan();
      const { account, subscription } = await utworzKonto({
        serverId: wezel.id,
        planId: plan.id,
      });

      const przed = await ksiegaWezla(wezel.id);

      const s = silnik();
      await (s as unknown as {
        applyChange(sub: unknown, opts: unknown): Promise<void>;
      }).applyChange(
        {
          ...(await prisma().subscription.findUniqueOrThrow({
            where: { id: subscription.id },
          })),
          account: await prisma().account.findUniqueOrThrow({ where: { id: account.id } }),
          plan: await prisma().plan.findUniqueOrThrow({ where: { id: plan.id } }),
          user: { email: 'x@test.pl', firstName: null },
        },
        {
          recent: [],
          nextScaledCpu: 100,
          nextScaledRamMb: 4096,
          nextScaledDiskMb: 10240,
          reason: 'test',
          direction: 'UP',
          disable: false,
          rules: [],
        },
      );

      const po = await ksiegaWezla(wezel.id);
      expect(po.allocatedCpu - przed.allocatedCpu).toBe(100);
      expect(po.allocatedMemory - przed.allocatedMemory).toBe(4096);
      expect(po.allocatedDisk - przed.allocatedDisk).toBe(10240);

      // Niezmiennik: księga zgadza się z sumą limitów efektywnych kont żywych.
      expect(po).toEqual(await prawdaOWezle(wezel.id));
    });

    it('zejście do baseline zwraca nadwyżkę do księgi', async () => {
      const wezel = await utworzWezel({ overcommitRam: 4, overcommitCpu: 4 });
      const plan = await utworzPlan();
      const { account, subscription } = await utworzKonto({
        serverId: wezel.id,
        planId: plan.id,
        scaledCpu: 200,
        scaledRamMb: 8192,
        scaledDiskMb: 20480,
      });

      const s = silnik();
      await (s as unknown as {
        applyChange(sub: unknown, opts: unknown): Promise<void>;
      }).applyChange(
        {
          ...(await prisma().subscription.findUniqueOrThrow({
            where: { id: subscription.id },
          })),
          account: await prisma().account.findUniqueOrThrow({ where: { id: account.id } }),
          plan: await prisma().plan.findUniqueOrThrow({ where: { id: plan.id } }),
          user: { email: 'x@test.pl', firstName: null },
        },
        {
          recent: [],
          nextScaledCpu: 0,
          nextScaledRamMb: 0,
          nextScaledDiskMb: 0,
          reason: 'test',
          direction: 'DOWN',
          disable: false,
          rules: [],
        },
      );

      expect(await ksiegaWezla(wezel.id)).toEqual({
        allocatedCpu: plan.cpuLimit,
        allocatedMemory: plan.ramLimitMb,
        allocatedDisk: plan.diskLimitMb,
      });
      expect(await ksiegaWezla(wezel.id)).toEqual(await prawdaOWezle(wezel.id));
    });
  });

  describe('niezmiennik po pełnym cyklu', () => {
    it('założenie → skalowanie → zejście → usunięcie zostawia węzeł pusty', async () => {
      const wezel = await utworzWezel({ overcommitRam: 4, overcommitCpu: 4 });
      const plan = await utworzPlan();
      const { account, subscription } = await utworzKonto({
        serverId: wezel.id,
        planId: plan.id,
      });

      const s = new AutoscalingEngineService(
        prisma() as unknown as PrismaService,
        atrapy.audit() as never,
        atrapy.directAdmin() as never,
        atrapy.mailer() as never,
        atrapy.config() as never,
        {
          billDueBlocks: jest.fn().mockResolvedValue(undefined),
          episodeSpendPln: jest.fn().mockResolvedValue(0),
        } as never,
      );

      const zastosuj = async (cpu: number, ram: number, disk: number, kierunek: string) => {
        await (s as unknown as {
          applyChange(sub: unknown, opts: unknown): Promise<void>;
        }).applyChange(
          {
            ...(await prisma().subscription.findUniqueOrThrow({
              where: { id: subscription.id },
            })),
            account: await prisma().account.findUniqueOrThrow({ where: { id: account.id } }),
            plan: await prisma().plan.findUniqueOrThrow({ where: { id: plan.id } }),
            user: { email: 'x@test.pl', firstName: null },
          },
          {
            recent: [],
            nextScaledCpu: cpu,
            nextScaledRamMb: ram,
            nextScaledDiskMb: disk,
            reason: 'test',
            direction: kierunek,
            disable: false,
            rules: [],
          },
        );
        // Niezmiennik sprawdzany po KAŻDYM kroku — inaczej dwa błędy mogłyby
        // się znieść i cykl skończyłby się poprawnym zerem mimo rozjazdu.
        expect(await ksiegaWezla(wezel.id)).toEqual(await prawdaOWezle(wezel.id));
      };

      await zastosuj(200, 8192, 20480, 'UP');
      await zastosuj(400, 16384, 40960, 'UP');
      await zastosuj(100, 2048, 40960, 'DOWN');
      await zastosuj(0, 0, 0, 'DOWN');

      const usuwanie = new AccountDeletionService(
        prisma() as unknown as PrismaService,
        atrapy.audit() as never,
        atrapy.directAdmin() as never,
        atrapy.mailer() as never,
        atrapy.config() as never,
      );
      await usuwanie.purgeAccountOnDa(account.id);

      expect(await ksiegaWezla(wezel.id)).toEqual({
        allocatedCpu: 0,
        allocatedMemory: 0,
        allocatedDisk: 0,
      });
    });
  });
});
