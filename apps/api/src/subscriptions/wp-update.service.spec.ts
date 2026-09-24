import { BadRequestException, ConflictException } from '@nestjs/common';
import { WpUpdateService, sprawdzWybor, stanZLogu, zmiany } from './wp-update.service';

/**
 * I-04/I-05 — strona API. Skrypt węzła sprawdzony lokalnie na atrapie wp-cli: kopia (pliki + baza,
 * 0600) przed aktualizacją, dwie ostatnie kopie zostają, wycofanie plików i bazy, gdy strona po
 * aktualizacji zwraca 5xx, walidacja slugów/domeny/zakresu.
 */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
const PRZED = {
  version: '6.5.2',
  core: [{ version: '6.6.2', update_type: 'major' }],
  plugins: [{ name: 'akismet', title: 'Akismet', status: 'active', version: '5.0', update: 'available', update_version: '5.3' }],
  themes: [{ name: 'tt4', title: 'Twenty Twenty-Four', status: 'active', version: '1.0', update: 'none', update_version: '' }],
};
const PO = { ...PRZED, version: '6.6.2', core: [], plugins: [{ ...PRZED.plugins[0], version: '5.3', update: 'none', update_version: '' }] };

function stanowisko(opts: { zadania?: unknown[]; wToku?: boolean; automaty?: unknown[] } = {}) {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: jest.fn(async () => (opts.wToku ? { id: 'busy' } : null)),
      findMany: jest.fn(async () => opts.zadania ?? []),
      create: jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
    wpAutoUpdate: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => opts.automaty ?? []),
      upsert: jest.fn(async () => undefined),
      deleteMany: jest.fn(async () => undefined),
      update: jest.fn(async () => undefined),
    },
  };
  const da = { assertDomainOwnedBySubscription: jest.fn(async (_s: string, _u: string, d: string) => d.trim().toLowerCase()) };
  const svc = new WpUpdateService(prisma as never, { record: jest.fn(async () => undefined) } as never, da as never);
  return { svc, prisma, da };
}

const payload = (s: ReturnType<typeof stanowisko>, i = 0) =>
  (s.prisma.nodeTask.create.mock.calls[i] as unknown as [{ data: { kind: string; requestedById: string | null; payload: Record<string, unknown> } }])[0].data;

describe('WpUpdateService', () => {
  it('aktualizacja z panelu: domena sprawdzona, wybór spłaszczony do listy dla skryptu', async () => {
    const s = stanowisko();
    await s.svc.aktualizuj('s1', 'u1', { domain: ' Sklep.PL ', core: 'minor', plugins: ['akismet', 'akismet', 'woocommerce'], themes: '*' });
    expect(s.da.assertDomainOwnedBySubscription).toHaveBeenCalledWith('s1', 'u1', ' Sklep.PL ');
    const d = payload(s);
    expect(d.kind).toBe('WP_UPDATE');
    expect(d.payload).toEqual({ mode: 'update', domain: 'sklep.pl', core: 'minor', plugins: 'akismet,woocommerce', themes: '*', auto: false, daUser: 'klient1' });
  });

  it('nic nie wybrano → 400; drugie zadanie w toku → 409', async () => {
    await expect(stanowisko().svc.aktualizuj('s1', 'u1', { domain: 'a.pl', core: 'none', plugins: [], themes: [] })).rejects.toThrow(BadRequestException);
    await expect(stanowisko({ wToku: true }).svc.sprawdz('s1', 'u1', 'a.pl')).rejects.toThrow(ConflictException);
  });

  it.each([[['-rf']], [['a;id']], [['A B']], [Array.from({ length: 201 }, (_, i) => `p${i}`)]])('odrzuca listę %j', (w) => {
    expect(() => sprawdzWybor(w as string[], 'wtyczek')).toThrow(BadRequestException);
  });

  it('automat wyłączony w całości = usunięcie ustawień', async () => {
    const s = stanowisko();
    await s.svc.ustawAutomat('s1', 'u1', { domain: 'a.pl', core: 'none', plugins: false, themes: false });
    expect(s.prisma.wpAutoUpdate.deleteMany).toHaveBeenCalled();
    expect(s.prisma.wpAutoUpdate.upsert).not.toHaveBeenCalled();
  });

  it('planista: zleca według ustawień bez osoby zlecającej, zajęte konto pomija bez znacznika przebiegu', async () => {
    const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
    const s = stanowisko({ automaty: [{ id: 'w1', domain: 'a.pl', core: 'minor', plugins: true, themes: false, account }] });
    expect(await s.svc.zlecAutomatyczne(new Date('2026-09-25T01:20:00Z'))).toBe(1);
    expect(payload(s).requestedById).toBeNull();
    expect(payload(s).payload).toMatchObject({ mode: 'update', core: 'minor', plugins: '*', themes: '', auto: true });
    expect(s.prisma.wpAutoUpdate.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { lastRunAt: new Date('2026-09-25T01:20:00Z') } });

    const zajete = stanowisko({ wToku: true, automaty: [{ id: 'w1', domain: 'a.pl', core: 'all', plugins: false, themes: false, account }] });
    expect(await zajete.svc.zlecAutomatyczne()).toBe(0);
    expect(zajete.prisma.wpAutoUpdate.update).not.toHaveBeenCalled();
  });

  it('stan i zmiany z logu; wycofanie i błąd widoczne dla klienta', async () => {
    const ok = `VERRIS_WP_PRZED=${b64(PRZED)}\nVERRIS_WPU_KOPIA=verris-wp-a.pl-20260925-032000-ab12.tar.gz\nVERRIS_WP_PO=${b64(PO)}\n[wp-update] Gotowe.`;
    const wycofane = `VERRIS_WP_PRZED=${b64(PRZED)}\nVERRIS_WPU_WYCOFANO=1\n[wp-update] BŁĄD: po aktualizacji strona zwracała błąd (HTTP 500) — przywróciliśmy pliki i bazę`;
    const t = (id: string, status: string, log: string, auto = false) => ({
      id, status, outputLog: log, createdAt: new Date('2026-09-25T01:20:00Z'), completedAt: new Date('2026-09-25T01:22:00Z'),
      payload: { mode: 'update', domain: 'a.pl', core: 'all', plugins: '*', themes: '', auto },
    });
    const s = stanowisko({ zadania: [t('t2', 'FAILED', wycofane, true), t('t1', 'COMPLETED', ok)] });
    const r = await s.svc.status('s1', 'u1', 'a.pl');
    expect(r.stan?.version).toBe('6.5.2'); // po wycofaniu obowiązuje stan sprzed
    expect(r.aktualizacje[0]).toMatchObject({ automatyczna: true, wycofano: true, blad: expect.stringContaining('HTTP 500') });
    expect(r.aktualizacje[1]).toMatchObject({ kopia: 'verris-wp-a.pl-20260925-032000-ab12.tar.gz', wycofano: false });
    expect(r.aktualizacje[1].zmiany).toEqual([
      { typ: 'core', nazwa: 'WordPress', z: '6.5.2', na: '6.6.2' },
      { typ: 'plugin', nazwa: 'Akismet', z: '5.0', na: '5.3' },
    ]);
  });

  it('brak WordPressa w katalogu domeny', async () => {
    const s = stanowisko({ zadania: [{ id: 't', status: 'COMPLETED', outputLog: 'VERRIS_WP_BRAK=1\n', createdAt: new Date(), completedAt: new Date(), payload: { mode: 'check', domain: 'a.pl' } }] });
    const r = await s.svc.status('s1', 'u1', 'a.pl');
    expect(r.brakWordpressa).toBe(true);
    expect(r.stan).toBeNull();
  });

  it('uszkodzony stan w logu nie wywraca odpowiedzi', () => {
    expect(stanZLogu('VERRIS_WP_PO=bmllLWpzb24=\n', 'PO')).toBeNull();
    expect(zmiany(null, null)).toEqual([]);
  });
});

describe('WpUpdateService — cache (J-02)', () => {
  it('zlecenie operacji na LiteSpeed Cache; zła operacja → 400', async () => {
    const s = stanowisko();
    await s.svc.cache('s1', 'u1', { domain: 'a.pl', action: 'purge' });
    expect(payload(s).payload).toMatchObject({ mode: 'cache', cache: 'purge', domain: 'a.pl' });
    await expect(s.svc.cache('s1', 'u1', { domain: 'a.pl', action: 'rm' })).rejects.toThrow(BadRequestException);
  });
});
