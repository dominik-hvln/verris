import { MigrationStatus } from '@verris/database';
import {
  MIGRATION_SECRET_PRZYPOMNIENIE_ATTENTION_DAYS,
  MIGRATION_SECRET_TTL_ATTENTION_DAYS,
  MigrationOrchestratorService,
} from './migration-orchestrator.service.js';

/**
 * 14.10 — retencja haseł źródła migracji. Zlecenie przekazane obsłudze (ATTENTION) trzymało hasła do starego
 * hostingu bez limitu: purge brał tylko COMPLETED (7 dni) i FAILED/CANCELED (3 dni). Teraz ATTENTION — 14 dni od
 * eskalacji, z przypomnieniem dla zespołu 3 dni wcześniej (raz na zlecenie).
 */
type Zlecenie = {
  id: string; userId: string; subscriptionId: string; status: MigrationStatus; targetDomain: string;
  completedAt: Date | null; attentionAt: Date | null; secretsPurgedAt: Date | null;
};
const DZIEN = 24 * 60 * 60 * 1000;
const temu = (dni: number) => new Date(Date.now() - dni * DZIEN);

type Warunek = {
  secretsPurgedAt?: null; status?: MigrationStatus | { in: MigrationStatus[] };
  completedAt?: { lt?: Date; gte?: Date }; attentionAt?: { lt?: Date; gte?: Date }; OR?: Warunek[];
};
function pasuje(z: Zlecenie, w: Warunek): boolean {
  if ('secretsPurgedAt' in w && w.secretsPurgedAt === null && z.secretsPurgedAt !== null) return false;
  if (w.status !== undefined) {
    const s = w.status;
    if (typeof s === 'string' ? z.status !== s : !s.in.includes(z.status)) return false;
  }
  for (const pole of ['completedAt', 'attentionAt'] as const) {
    const war = w[pole];
    if (!war) continue;
    const v = z[pole];
    if (!v) return false;
    if (war.lt && !(v < war.lt)) return false;
    if (war.gte && !(v >= war.gte)) return false;
  }
  if (w.OR) return w.OR.some((o) => pasuje(z, o));
  return true;
}

function srodowisko(zlecenia: Zlecenie[]) {
  const zdarzenia: Array<{ subscriptionId: string; type: string; details: { migrationRequestId: string } }> = [];
  const prisma = {
    migrationRequest: {
      findMany: vi.fn(async ({ where }: { where: Warunek }) => zlecenia.filter((z) => pasuje(z, where))),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Zlecenie> }) => {
        Object.assign(zlecenia.find((z) => z.id === where.id)!, data);
      }),
    },
    subscriptionEvent: {
      findFirst: vi.fn(async ({ where }: { where: { type: string; details: { equals: string } } }) =>
        zdarzenia.find((e) => e.type === where.type && e.details.migrationRequestId === where.details.equals) ?? null),
      create: vi.fn(async ({ data }: { data: (typeof zdarzenia)[number] }) => { zdarzenia.push(data); }),
    },
    user: { findMany: vi.fn(async () => [{ id: 'staff_1' }, { id: 'admin_1' }]) },
  };
  const audit = { record: vi.fn() };
  const notifications = { create: vi.fn(async () => undefined) };
  const s = new MigrationOrchestratorService(prisma as never, {} as never, audit as never, notifications as never, {} as never, {} as never, null as never);
  return { s, zdarzenia, notifications, audit };
}

const zl = (id: string, status: MigrationStatus, o: Partial<Zlecenie> = {}): Zlecenie => ({
  id, userId: 'u1', subscriptionId: 'sub1', status, targetDomain: `${id}.pl`, completedAt: null, attentionAt: null, secretsPurgedAt: null, ...o,
});

describe('purgeExpiredSecrets — zlecenia przekazane obsłudze (ATTENTION)', () => {
  it(`hasła zlecenia w ATTENTION dłużej niż ${MIGRATION_SECRET_TTL_ATTENTION_DAYS} dni są usuwane; zespół dostaje informację`, async () => {
    expect([MIGRATION_SECRET_TTL_ATTENTION_DAYS, MIGRATION_SECRET_PRZYPOMNIENIE_ATTENTION_DAYS]).toEqual([14, 11]);
    const z = [
      zl('stare', MigrationStatus.ATTENTION, { attentionAt: temu(15) }),
      zl('swieze', MigrationStatus.ATTENTION, { attentionAt: temu(2) }),
      zl('gotowe', MigrationStatus.COMPLETED, { completedAt: temu(8) }),
    ];
    const { s, notifications, audit } = srodowisko(z);
    const wynik = await s.purgeExpiredSecrets();
    expect(wynik.purged).toBe(2);
    expect(z.find((x) => x.id === 'stare')!.secretsPurgedAt).toBeInstanceOf(Date);
    expect(z.find((x) => x.id === 'swieze')!.secretsPurgedAt).toBeNull();
    expect(audit.record).toHaveBeenCalledTimes(2);
    const tytuly = notifications.create.mock.calls.map((c) => (c as unknown as [{ title: string; userId: string }])[0]);
    expect(tytuly.map((t) => t.title)).toEqual([
      'Migracja stare.pl: hasła starego hostingu usunięte',
      'Migracja stare.pl: hasła starego hostingu usunięte',
    ]);
    expect(tytuly.map((t) => t.userId)).toEqual(['staff_1', 'admin_1']);
  });

  it('3 dni przed usunięciem — jedno przypomnienie dla zespołu na zlecenie, nie co godzinę', async () => {
    const z = [zl('czeka', MigrationStatus.ATTENTION, { attentionAt: temu(12) })];
    const { s, notifications, zdarzenia } = srodowisko(z);
    expect((await s.purgeExpiredSecrets()).przypomniano).toBe(1);
    expect((await s.purgeExpiredSecrets()).przypomniano).toBe(0);
    expect(zdarzenia.map((e) => e.type)).toEqual(['MIGRATION_SECRETS_EXPIRING']);
    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Migracja czeka.pl: hasła starego hostingu znikną za 3 dni', link: '/migrations', severity: 'warning',
    }));
    expect(z[0].secretsPurgedAt).toBeNull();
  });
});
