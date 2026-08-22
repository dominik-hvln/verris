import { PrismaClient } from '@verris/database';

/**
 * X-04 — wspólna obsługa testów integracyjnych.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CO ODRÓŻNIA TE TESTY OD JEDNOSTKOWYCH
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Wszystkie dotychczasowe testy API podstawiały fałszywą Prismę. Dowodziły, że
 * logika jest poprawna — nie że zapytanie do bazy zwraca to, czego się po nim
 * spodziewamy. Różnica nie jest teoretyczna: `groupBy` z filtrem po statusie,
 * `increment` w transakcji i wybór najnowszej próbki na subskrypcję to rzeczy,
 * które w atrapie zawsze działają, a w Postgresie mogą nie.
 *
 * Tutaj baza jest prawdziwa. Fałszywe zostaje wyłącznie to, co jest naprawdę
 * na zewnątrz: DirectAdmin, poczta, dziennik audytu.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IZOLACJA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Każdy test zaczyna od czystej bazy. TRUNCATE ... CASCADE zamiast kasowania
 * po kolei, bo kolejność zależności jest długa i łatwo o pominięcie tabeli,
 * które objawia się jako „test przechodzi u mnie, pada w CI".
 *
 * Testy NIE mogą biec równolegle na jednej bazie — jest to wymuszone przez
 * `maxWorkers: 1` w jest.integration.cjs.
 */

/** Tabele czyszczone przed każdym testem. Kolejność bez znaczenia — CASCADE. */
const TABELE = [
  'StripeWebhookEvent',
  'Invoice',
  'InvoiceCounter',
  'WalletTransaction',
  'UsageMetric',
  'Account',
  'Subscription',
  'Server',
  'Plan',
  'User',
];

let klient: PrismaClient | null = null;

export function prisma(): PrismaClient {
  if (!klient) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'Testy integracyjne wymagają DATABASE_URL wskazującego na BAZĘ TESTOWĄ. ' +
          'Nigdy nie uruchamiaj ich przeciwko bazie z danymi — zaczynają od TRUNCATE.',
      );
    }
    klient = new PrismaClient();
  }
  return klient;
}

export async function wyczyscBaze(): Promise<void> {
  const p = prisma();
  await p.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABELE.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}

export async function rozlacz(): Promise<void> {
  if (klient) {
    await klient.$disconnect();
    klient = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fabryki — minimum pól wymaganych przez schemat, reszta domyślna
// ═══════════════════════════════════════════════════════════════════════════

let licznik = 0;
const kolejny = () => ++licznik;

/** Węzeł o pojemności Hetzner AX102 z modelu PB-01. */
export async function utworzWezel(over: Record<string, unknown> = {}) {
  const n = kolejny();
  return prisma().server.create({
    data: {
      name: `wezel-${n}`,
      ipAddress: `10.0.0.${n % 250}`,
      status: 'ACTIVE',
      acceptsNewAccounts: true,
      totalCpuCores: 32,
      totalMemoryMb: 128 * 1024,
      totalDiskMb: 1920 * 1024,
      allocatedCpu: 0,
      allocatedMemory: 0,
      allocatedDisk: 0,
      reservedHeadroomPercent: 0,
      overcommitCpu: 1,
      overcommitRam: 1,
      overcommitDisk: 1,
      ...over,
    },
  });
}

/** Pakiet produkcyjny: 2 vCPU / 8 GB / 50 GB za 45 zł brutto. */
export async function utworzPlan(over: Record<string, unknown> = {}) {
  const n = kolejny();
  return prisma().plan.create({
    data: {
      slug: `plan-${n}`,
      name: `Plan ${n}`,
      cpuLimit: 200,
      ramLimitMb: 8 * 1024,
      diskLimitMb: 50 * 1024,
      priceMonthly: 45.0,
      priceYearly: 399.0,
      ...over,
    },
  });
}

/**
 * Konto wraz z użytkownikiem i subskrypcją — bo Account bez nich nie istnieje.
 *
 * Aktualizuje też księgę węzła, tak jak robi to provisioning. Bez tego kroku
 * testy zaczynałyby od stanu, który w produkcji nie może wystąpić: konta na
 * węźle, o których węzeł nie wie.
 */
export async function utworzKonto(opts: {
  serverId: string;
  planId: string;
  cpuLimit?: number;
  ramLimitMb?: number;
  diskLimitMb?: number;
  scaledCpu?: number;
  scaledRamMb?: number;
  scaledDiskMb?: number;
  status?: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  ksiegujNaWezle?: boolean;
}) {
  const n = kolejny();
  const p = prisma();
  const plan = await p.plan.findUniqueOrThrow({ where: { id: opts.planId } });

  const cpu = opts.cpuLimit ?? plan.cpuLimit + (opts.scaledCpu ?? 0);
  const ram = opts.ramLimitMb ?? plan.ramLimitMb + (opts.scaledRamMb ?? 0);
  const disk = opts.diskLimitMb ?? plan.diskLimitMb + (opts.scaledDiskMb ?? 0);

  const user = await p.user.create({
    data: { email: `konto-${n}@test.verris.pl`, passwordHash: 'x' },
  });
  const sub = await p.subscription.create({
    data: {
      userId: user.id,
      planId: opts.planId,
      interval: 'MONTH',
      priceAmount: plan.priceMonthly,
    },
  });
  const account = await p.account.create({
    data: {
      daUsername: `usr${n}`,
      domain: `konto-${n}.test`,
      userId: user.id,
      serverId: opts.serverId,
      subscriptionId: sub.id,
      status: opts.status ?? 'ACTIVE',
      cpuLimit: cpu,
      ramLimitMb: ram,
      diskLimitMb: disk,
      scaledCpu: opts.scaledCpu ?? 0,
      scaledRamMb: opts.scaledRamMb ?? 0,
      scaledDiskMb: opts.scaledDiskMb ?? 0,
    },
  });

  const ksieguj = opts.ksiegujNaWezle ?? (opts.status ?? 'ACTIVE') !== 'DELETED';
  if (ksieguj) {
    await p.server.update({
      where: { id: opts.serverId },
      data: {
        allocatedCpu: { increment: cpu },
        allocatedMemory: { increment: ram },
        allocatedDisk: { increment: disk },
      },
    });
  }

  return { user, subscription: sub, account };
}

/** Próbka telemetrii — to, czym NodeSelector mierzy realne zużycie węzła. */
export async function dodajProbke(opts: {
  serverId: string;
  subscriptionId: string;
  accountId?: string;
  minutTemu?: number;
  cpu?: number;
  ramMb?: number;
  diskMb?: number;
}) {
  const bucketStart = new Date(Date.now() - (opts.minutTemu ?? 1) * 60_000);
  return prisma().usageMetric.create({
    data: {
      subscriptionId: opts.subscriptionId,
      accountId: opts.accountId,
      serverId: opts.serverId,
      bucketStart,
      bucketDurationS: 300,
      cpuUsageAvg: opts.cpu ?? 0,
      cpuUsageMax: opts.cpu ?? 0,
      memUsageAvgMb: opts.ramMb ?? 0,
      memUsageMaxMb: opts.ramMb ?? 0,
      diskUsageMb: opts.diskMb ?? 0,
    },
  });
}

/** Księga węzła prosto z bazy — bez pośrednictwa jakiegokolwiek serwisu. */
export async function ksiegaWezla(serverId: string) {
  const s = await prisma().server.findUniqueOrThrow({ where: { id: serverId } });
  return {
    allocatedCpu: s.allocatedCpu,
    allocatedMemory: s.allocatedMemory,
    allocatedDisk: s.allocatedDisk,
  };
}

/** Prawda: suma limitów efektywnych kont żywych, policzona zapytaniem SQL. */
export async function prawdaOWezle(serverId: string) {
  const [row] = await prisma().$queryRawUnsafe<
    Array<{ cpu: bigint | null; ram: bigint | null; disk: bigint | null }>
  >(
    `SELECT SUM("cpuLimit") AS cpu, SUM("ramLimitMb") AS ram, SUM("diskLimitMb") AS disk
       FROM "Account" WHERE "serverId" = $1 AND "status" <> 'DELETED'`,
    serverId,
  );
  return {
    allocatedCpu: Number(row?.cpu ?? 0),
    allocatedMemory: Number(row?.ram ?? 0),
    allocatedDisk: Number(row?.disk ?? 0),
  };
}

/** Atrapy tego, co jest naprawdę na zewnątrz. */
export const atrapy = {
  audit: () => ({ record: jest.fn().mockResolvedValue(undefined) }),
  mailer: () => ({
    sendMail: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(undefined),
  }),
  config: (wartosci: Record<string, unknown> = {}) => ({
    get: jest.fn((k: string) => wartosci[k]),
  }),
  directAdmin: () => ({
    getClientForServer: jest.fn().mockResolvedValue({
      setAccountLimits: jest.fn().mockResolvedValue(undefined),
      suspendAccount: jest.fn().mockResolvedValue(undefined),
      deleteAccount: jest.fn().mockResolvedValue(undefined),
      accountExists: jest.fn().mockResolvedValue(true),
    }),
  }),
};
