import { NodeTaskStatus } from '@verris/database';
import { AuditService } from '../common/audit/audit.service.js';
import { AkcjeKontaOperatoraService } from './akcje-konta-operatora.service.js';
import { MalwareScanService } from './malware-scan.service.js';
import { ZawieszenieOperatoraService } from './zawieszenie-operatora.service.js';

/**
 * F3.2 (G-12) — kwarantanna przez obsługę z karty usługi: prawdziwy MalwareScanService (tylko pliki z ostatnich
 * wyników skanera, zadanie MALWARE_SCAN `kwarantanna` z listą base64 — węzeł przenosi plik z manifestem sha256) i
 * prawdziwy przebieg D2/D3 (powód, dziennik zespołu, wpis klienta jako „obsługa Verris (zgłoszenie #…)”).
 */
const WLASCICIEL = 'u-klient';
const OPERATOR = 's-op';
const ZGL = 'ab12cd34-0000-4000-8000-000000000001';
const PLIK = 'domains/klient.pl/public_html/wp-content/uploads/x.php';
const WPIS = `20261010T100000Z-ab12/${PLIK}`;
type Wiersz = { action: string; userId: string | null; actorUserId: string | null; details: Record<string, unknown> };

function zbuduj() {
  const wiersze: Wiersz[] = [];
  const utworzone: Array<Record<string, unknown>> = [];
  const konto = { id: 'acc1', serverId: 'w1', status: 'ACTIVE', daUsername: 'klient1', domain: 'klient.pl' };
  const wynik = {
    id: 't0', status: NodeTaskStatus.COMPLETED, payload: { mode: 'list' }, errorMessage: null,
    outputLog: `VERRIS_MAL_RAZEM 1\nVERRIS_MAL SMW-INJ-12345-php.bkdr|${PLIK}\nVERRIS_KW 20261010T100000Z-ab12|2026-10-10T10:00:00Z|SMW-1|${PLIK}`,
    createdAt: new Date(), completedAt: new Date(),
  };
  const prisma = {
    subscription: {
      findUnique: vi.fn(async () => ({ userId: WLASCICIEL, user: { email: 'a@klient.pl', firstName: 'A', role: 'USER' }, account: konto })),
      findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => (where.userId === WLASCICIEL ? { id: 's1', userId: WLASCICIEL, account: konto } : null)),
    },
    ticket: { findMany: vi.fn(async () => [{ id: ZGL }]) },
    nodeTask: {
      findMany: vi.fn(async () => [wynik]),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (utworzone.push(data), { id: 't1', ...data })),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: Wiersz }) => (wiersze.push(data), data)) },
  };
  const audit = new AuditService(prisma as never);
  const malware = new MalwareScanService(prisma as never, audit);
  const svc = new AkcjeKontaOperatoraService(
    prisma as never, null as never, null as never, malware, audit, null as never, { get: () => 'x' } as never,
    new ZawieszenieOperatoraService(prisma as never, null as never),
  );
  return { svc, wiersze, utworzone };
}

const z = (powod = 'Zgłoszenie abuse: backdoor w uploads') => ({ subscriptionId: 's1', operatorUserId: OPERATOR, operatorRole: 'STAFF', powod, zgloszenie: '#ab12cd34' });

describe('F3.2 — kwarantanna malware przez obsługę (G-12)', () => {
  it('plik z wyników skanera → zadanie kwarantanna konta (lista base64), wpis klienta z autorem = obsługa i zgłoszeniem', async () => {
    const { svc, wiersze, utworzone } = zbuduj();
    await svc.kwarantanna(z(), [PLIK]);
    expect(utworzone).toEqual([
      expect.objectContaining({ kind: 'MALWARE_SCAN', accountId: 'acc1', serverId: 'w1', requestedById: WLASCICIEL, payload: { mode: 'kwarantanna', daUser: 'klient1', pathsB64: Buffer.from(PLIK).toString('base64') } }),
    ]);
    expect(wiersze.find((w) => w.action === 'HOSTING_MALWARE_QUARANTINE_QUEUED')).toMatchObject({ userId: WLASCICIEL, actorUserId: OPERATOR, details: expect.objectContaining({ zgloszenieId: ZGL }) });
    expect(wiersze.find((w) => w.action === 'OPERATOR_ACCOUNT_CHANGED')?.details).toMatchObject({ akcja: 'kwarantanna', pliki: 1, wynik: 'ok', zgloszenieId: ZGL });
  });

  it('plik spoza wyników skanera → 400 bez zadania, odmowa w dzienniku zespołu; bez powodu → 400', async () => {
    const { svc, wiersze, utworzone } = zbuduj();
    await expect(svc.kwarantanna(z(), ['domains/klient.pl/public_html/index.php'])).rejects.toMatchObject({ status: 400 });
    expect(utworzone).toEqual([]);
    expect(wiersze.find((w) => w.action === 'OPERATOR_ACCOUNT_CHANGED')?.details).toMatchObject({ akcja: 'kwarantanna', wynik: 'blad' });
    await expect(zbuduj().svc.kwarantanna(z('krótko'), [PLIK])).rejects.toMatchObject({ status: 400 });
  });

  it('przywrócenie z kwarantanny: tylko wpis z ostatniego stanu → zadanie przywroc', async () => {
    const { svc, utworzone } = zbuduj();
    await svc.przywrocZKwarantanny(z('Fałszywy alarm — plik wtyczki z repozytorium'), [WPIS]);
    expect(utworzone[0]).toMatchObject({ payload: { mode: 'przywroc', pathsB64: Buffer.from(WPIS).toString('base64') } });
    await expect(zbuduj().svc.przywrocZKwarantanny(z(), [`20261010T100000Z-ffff/${PLIK}`])).rejects.toMatchObject({ status: 400 });
  });
});
