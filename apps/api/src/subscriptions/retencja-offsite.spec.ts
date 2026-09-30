import { KOPIE_OFFSITE_DNI, KOPIE_OFFSITE_MAX_DNI, retencjaOffsiteDni, sufitRetencjiOffsite } from '@verris/contracts';
import { BackupScheduleService } from './backup-schedule.service.js';
import { BackupOffsiteService } from '../servers/backup-offsite.service.js';

/**
 * H-03 — klient wybiera retencję kopii poza serwerem w granicach planu (min. KOPIE_OFFSITE_DNI w cenie),
 * węzeł dostaje ją w GET /agent/tasks/backup-retention. Dotąd retencja była jedna dla całej floty.
 */
describe('retencja kopii poza serwerem — granice planu (H-03)', () => {
  it('sufit planu i wybór klienta zawsze w [KOPIE_OFFSITE_DNI, KOPIE_OFFSITE_MAX_DNI]', () => {
    expect(sufitRetencjiOffsite(60)).toBe(60);
    expect(sufitRetencjiOffsite(7)).toBe(KOPIE_OFFSITE_DNI);
    expect(sufitRetencjiOffsite(365)).toBe(KOPIE_OFFSITE_MAX_DNI);
    expect(sufitRetencjiOffsite(null)).toBe(KOPIE_OFFSITE_DNI);
    expect(retencjaOffsiteDni(45, 60)).toBe(45);
    // plan zmieniony na niższy — wybór spada do nowego sufitu
    expect(retencjaOffsiteDni(90, 60)).toBe(60);
    expect(retencjaOffsiteDni(10, 60)).toBe(KOPIE_OFFSITE_DNI);
    expect(retencjaOffsiteDni(undefined, 60)).toBe(KOPIE_OFFSITE_DNI);
  });
});

describe('BackupScheduleService — retencja wybrana przez klienta', () => {
  function serwis(planMax: number, wiersz: { offsiteRetentionDays: number } | null = null) {
    const zapisy: unknown[] = [];
    const prisma = {
      subscription: {
        findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
          where.userId === 'u1' ? { plan: { offsiteRetentionMaxDays: planMax } } : null,
      },
      backupSchedule: {
        findUnique: async () => wiersz,
        upsert: async (a: unknown) => void zapisy.push(a),
      },
    };
    return { s: new BackupScheduleService(prisma as never, {} as never), zapisy };
  }

  it('bez zapisanego wyboru: minimum w cenie, zakres z planu', async () => {
    const { s } = serwis(60);
    await expect(s.retencjaOffsite('sub1', 'u1')).resolves.toEqual({ dni: KOPIE_OFFSITE_DNI, min: KOPIE_OFFSITE_DNI, max: 60 });
  });

  it('wybór powyżej sufitu po zmianie planu — pokazujemy to, co faktycznie stosuje węzeł', async () => {
    const { s } = serwis(45, { offsiteRetentionDays: 90 });
    await expect(s.retencjaOffsite('sub1', 'u1')).resolves.toMatchObject({ dni: 45, max: 45 });
  });

  it('zapis w granicach planu trafia do harmonogramu kopii konta', async () => {
    const { s, zapisy } = serwis(60);
    await expect(s.ustawRetencjeOffsite('sub1', 'u1', 45)).resolves.toEqual({ dni: 45, min: KOPIE_OFFSITE_DNI, max: 60 });
    expect(zapisy).toEqual([
      { where: { subscriptionId: 'sub1' }, create: { subscriptionId: 'sub1', offsiteRetentionDays: 45 }, update: { offsiteRetentionDays: 45 } },
    ]);
  });

  it('poza planem albo poniżej minimum — 400 bez zapisu; cudza usługa — 404', async () => {
    const { s, zapisy } = serwis(60);
    await expect(s.ustawRetencjeOffsite('sub1', 'u1', 61)).rejects.toMatchObject({ status: 400 });
    await expect(s.ustawRetencjeOffsite('sub1', 'u1', KOPIE_OFFSITE_DNI - 1)).rejects.toMatchObject({ status: 400 });
    await expect(s.ustawRetencjeOffsite('sub1', 'u2', 45)).rejects.toMatchObject({ status: 404 });
    const { s: tylkoMinimum } = serwis(KOPIE_OFFSITE_DNI);
    await expect(tylkoMinimum.ustawRetencjeOffsite('sub1', 'u1', 31)).rejects.toThrow(`z ${KOPIE_OFFSITE_DNI} dni`);
    expect(zapisy).toEqual([]);
  });
});

describe('BackupOffsiteService — retencja kont dla węzła', () => {
  it('linia `<login> <dni>` na konto węzła, w granicach planu; usunięte konta pomija', async () => {
    let zapytanie: unknown;
    const prisma = {
      account: {
        findMany: async (a: unknown) => {
          zapytanie = a;
          return [
            { daUsername: 'a1', subscription: { backupSchedule: { offsiteRetentionDays: 60 }, plan: { offsiteRetentionMaxDays: 90 } } },
            { daUsername: 'b1', subscription: { backupSchedule: null, plan: { offsiteRetentionMaxDays: 90 } } },
            { daUsername: 'c1', subscription: { backupSchedule: { offsiteRetentionDays: 90 }, plan: { offsiteRetentionMaxDays: 45 } } },
          ];
        },
      },
    };
    const s = new BackupOffsiteService(prisma as never, {} as never, {} as never);
    await expect(s.retencjaKontDlaWezla('srv-1')).resolves.toBe('a1 60\nb1 30\nc1 45\n');
    expect(zapytanie).toMatchObject({ where: { serverId: 'srv-1', status: { not: 'DELETED' } } });
  });
});
