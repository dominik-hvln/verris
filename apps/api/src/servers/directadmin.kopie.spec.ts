import { DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service';

/**
 * Kopie zapasowe w DirectAdminService: kopia teraz, odtworzenie, lista, retencja i tryb EKO.
 * To ścieżki, które nadpisują albo kasują dane klienta, więc pilnujemy, że:
 *  - błąd DA (200 + error=1) przerywa operację — odtworzenie nie kończy się „COMPLETED”,
 *    a nieudana kopia nie ustawia lastBackupAt (wynik zdrowia nie kłamie),
 *  - retencja kasuje wyłącznie starsze archiwa z /backups i nic, gdy lista się nie wczyta,
 *  - przestawienie crona kopii w trybie EKO nigdy nie gubi zadania (najpierw nowe, potem stare).
 */
type Odp = { data: unknown };
const odp = (v: unknown): Promise<Odp> => (v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v }));

function stanowisko(o: { status?: string; daPasswordEnc?: string | null; get?: Record<string, unknown>; post?: Record<string, unknown> } = {}) {
  const trasyGet: Record<string, unknown> = {
    '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl',
    '/CMD_API_SHOW_USER_CONFIG': 'domain=firma.pl',
    ...o.get,
  };
  const get = jest.fn((path: string, _cfg?: Record<string, unknown>) => odp(trasyGet[path] ?? ''));
  const post = jest.fn((path: string, _body?: unknown, _cfg?: Record<string, unknown>) =>
    odp(o.post?.[path] ?? 'error=0&text=OK'),
  );
  const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  Object.assign(klient, { client: { get, post } });
  const account = {
    id: 'a1', status: o.status ?? 'ACTIVE', daUsername: 'klient1', domain: 'firma.pl',
    daPasswordEnc: o.daPasswordEnc === undefined ? 'enc' : o.daPasswordEnc, server: null,
  };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    account: { update: jest.fn(async () => account) },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const svc = new DirectAdminService(prisma as never, {} as never, {} as never, audit as never);
  jest.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
  const wyslane = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
  return { svc, get, post, prisma, wyslane };
}

describe('Kopia teraz (CMD_API_SITE_BACKUP action=backup)', () => {
  it('pełny zakres kopii, długi timeout; po sukcesie lastBackupAt', async () => {
    const s = stanowisko();
    await s.svc.createHostingSiteBackupNow('s1', 'u1');
    const pola = s.wyslane();
    expect(pola).toMatchObject({ action: 'backup', type: 'sitebackup', domain: 'firma.pl', database_data_aware: 'yes', email_data_aware: 'yes' });
    expect(Object.keys(pola).filter((k) => k.startsWith('select')).map((k) => pola[k])).toEqual([
      'domain', 'subdomain', 'email', 'forwarder', 'autoresponder', 'vacation', 'list',
      'emailsettings', 'ftp', 'ftpsettings', 'database', 'database_data', 'email_data',
    ]);
    expect(s.post.mock.calls[0][2]).toMatchObject({ timeout: 120_000 });
    expect(s.prisma.account.update).toHaveBeenCalledWith(expect.objectContaining({ where: { subscriptionId: 's1' } }));
  });

  it.each([
    ['error=1 w treści', 'error=1&text=Brak%20miejsca%20na%20dysku'],
    ['błąd sieci', new Error('socket hang up')],
  ])('%s → wyjątek i BRAK lastBackupAt (kopia bezpieczeństwa przed odtworzeniem nie jest udawana)', async (_n, body) => {
    const s = stanowisko({ post: { '/CMD_API_SITE_BACKUP': body } });
    await expect(s.svc.createHostingSiteBackupNow('s1', 'u1')).rejects.toThrow();
    expect(s.prisma.account.update).not.toHaveBeenCalled();
  });

  it('konto zawieszone (SEC-2) → 400, bez DA i bez lastBackupAt', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.createHostingSiteBackupNow('s1', 'u1')).rejects.toThrow('zawieszone');
    expect(s.post).not.toHaveBeenCalled();
    expect(s.prisma.account.update).not.toHaveBeenCalled();
  });
});

describe('Odtworzenie kopii (action=restore) — nadpisuje dane na żywym koncie', () => {
  const selecty = (pola: Record<string, string>) =>
    Object.keys(pola).filter((k) => k.startsWith('select')).map((k) => pola[k]);

  it('tylko pliki → tylko obszary plikowe; nazwa archiwum 1:1; timeout 10 min', async () => {
    const s = stanowisko();
    await s.svc.restoreHostingBackup('s1', 'u1', { fileName: 'klient1.2026-09-01.tar.gz', files: true, databases: false, email: false });
    const pola = s.wyslane();
    expect(pola).toMatchObject({ action: 'restore', domain: 'firma.pl', file: 'klient1.2026-09-01.tar.gz' });
    expect(selecty(pola)).toEqual(['domain', 'subdomain', 'ftp', 'ftpsettings']);
    expect(s.post.mock.calls[0][2]).toMatchObject({ timeout: 600_000 });
  });

  it('same bazy → bez nadpisywania poczty i plików', async () => {
    const s = stanowisko();
    await s.svc.restoreHostingBackup('s1', 'u1', { fileName: 'a.tar.gz', files: false, databases: true, email: false });
    expect(selecty(s.wyslane())).toEqual(['database', 'database_data']);
  });

  it('pusty zakres → 400, DA nic nie dostaje', async () => {
    const s = stanowisko();
    await expect(s.svc.restoreHostingBackup('s1', 'u1', { fileName: 'a.tar.gz', files: false, databases: false, email: false }))
      .rejects.toThrow('przynajmniej jeden');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('błąd DA w treści → wyjątek (zadanie odtworzenia ląduje w FAILED, nie COMPLETED)', async () => {
    const s = stanowisko({ post: { '/CMD_API_SITE_BACKUP': { error: '1', text: 'Archiwum uszkodzone' } } });
    await expect(s.svc.restoreHostingBackup('s1', 'u1', { fileName: 'a.tar.gz', files: true, databases: true, email: true }))
      .rejects.toThrow('Archiwum uszkodzone');
  });
});

describe('Lista kopii', () => {
  it('GET z błędem DA → zapasowy POST; w wyniku tylko archiwa', async () => {
    const s = stanowisko({
      get: { '/CMD_API_SITE_BACKUP': { error: '1', text: 'Nieznana akcja' } },
      post: { '/CMD_API_SITE_BACKUP': 'domain=firma.pl&file0=klient1.2026-09-01.tar.gz&file1=notatka.txt' },
    });
    const wynik = await s.svc.listHostingBackups('s1', 'u1');
    expect(wynik.fetchError).toBeNull();
    expect(wynik.rows).toEqual([{ id: 'file0', fileName: 'klient1.2026-09-01.tar.gz' }]);
    expect(s.wyslane()).toEqual({ domain: 'firma.pl', api: 'yes' });
  });

  it('GET i POST padają → fetchError, a nie pusta lista „brak kopii”', async () => {
    const s = stanowisko({
      get: { '/CMD_API_SITE_BACKUP': new Error('ECONNRESET') },
      post: { '/CMD_API_SITE_BACKUP': 'error=1&text=Serwer%20kopii%20niedost%C4%99pny' },
    });
    const wynik = await s.svc.listHostingBackups('s1', 'u1');
    expect(wynik).toMatchObject({ rows: [], fetchError: 'Serwer kopii niedostępny' });
  });

  it('pusta lista z DA → odczyt z menedżera plików (/backups)', async () => {
    const s = stanowisko({ get: { '/CMD_API_SITE_BACKUP': {}, '/CMD_API_FILE_MANAGER': { list: ['klient1.2026-09-02.tar.zst'] } } });
    expect((await s.svc.listHostingBackups('s1', 'u1')).rows).toEqual([{ id: 'list0', fileName: 'klient1.2026-09-02.tar.zst' }]);
    expect(s.get).toHaveBeenCalledWith('/CMD_API_FILE_MANAGER', expect.objectContaining({ params: expect.objectContaining({ path: '/backups' }) }));
  });

  it('konto bez zapisanego dostępu DA → fetchError bez żadnego zapytania', async () => {
    const s = stanowisko({ daPasswordEnc: null });
    expect((await s.svc.listHostingBackups('s1', 'u1')).fetchError).toContain('Brak zapisanego dostępu');
    expect(s.get).not.toHaveBeenCalled();
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('Retencja kopii (pruneHostingBackups) — kasuje pliki', () => {
  const katalog = (wpisy: Array<[string, string, string]>) =>
    new URLSearchParams(wpisy.map(([n, typ, data]) => [`/backups/${n}`, new URLSearchParams({ type: typ, size: '1', date: data }).toString()])).toString();
  const BACKUPS = katalog([
    ['a.tar.gz', 'file', '2026-09-01T02:00:00Z'],
    ['b.tar.gz', 'file', '2026-09-03T02:00:00Z'],
    ['c.tar.gz', 'file', '2026-09-02T02:00:00Z'],
    ['d.zip', 'file', '2026-08-01T02:00:00Z'],
    ['notatki.txt', 'file', '2020-01-01T00:00:00Z'],
    ['stare.tar.gz', 'dir', '2020-01-01T00:00:00Z'],
  ]);

  it('zostawia `keep` najnowszych archiwów; nie rusza plików innych niż archiwa ani katalogów', async () => {
    const s = stanowisko({ get: { '/CMD_API_FILE_MANAGER': BACKUPS } });
    await expect(s.svc.pruneHostingBackups('s1', 'u1', 2)).resolves.toBe(2);
    expect(s.post).toHaveBeenCalledTimes(1);
    expect(s.wyslane()).toEqual({ action: 'multiple', button: 'delete', path: '/backups', select0: 'a.tar.gz', select1: 'd.zip' });
  });

  it.each([0, -1, Number.NaN])('keep=%p → nic nie kasuje i nawet nie pyta DA', async (keep) => {
    const s = stanowisko({ get: { '/CMD_API_FILE_MANAGER': BACKUPS } });
    await expect(s.svc.pruneHostingBackups('s1', 'u1', keep)).resolves.toBe(0);
    expect(s.get).not.toHaveBeenCalled();
    expect(s.post).not.toHaveBeenCalled();
  });

  it('błąd DA przy liście katalogu → 0 i żadnego kasowania', async () => {
    const s = stanowisko({ get: { '/CMD_API_FILE_MANAGER': 'error=1&text=Brak%20katalogu' } });
    await expect(s.svc.pruneHostingBackups('s1', 'u1', 1)).resolves.toBe(0);
    expect(s.post).not.toHaveBeenCalled();
  });

  it('błąd DA przy kasowaniu → 0 (nie raportujemy usuniętych, których nie usunięto)', async () => {
    const s = stanowisko({ get: { '/CMD_API_FILE_MANAGER': BACKUPS }, post: { '/CMD_FILE_MANAGER': 'error=1&text=Permission%20denied' } });
    await expect(s.svc.pruneHostingBackups('s1', 'u1', 1)).resolves.toBe(0);
  });
});

describe('Tryb EKO — harmonogram crona kopii (applyEcoModeBackupCronPolicy)', () => {
  const CRON = {
    minute0: '15', hour0: '3', day_of_month0: '*', month0: '*', day_of_week0: '*',
    command0: '/usr/local/bin/da-cli CMD_API_SITE_BACKUP',
    minute1: '0', hour1: '*', day_of_month1: '*', month1: '*', day_of_week1: '*',
    command1: 'php ~/cron.php',
  };

  it('EKO włączone: kopia dzienna → niedziela z zachowaniem godziny; inne crony nietknięte', async () => {
    const s = stanowisko({ get: { '/CMD_API_CRON': CRON } });
    const wynik = await s.svc.applyEcoModeBackupCronPolicy('s1', 'u1', true);
    expect(wynik.adjusted).toBe(1);
    const akcje = s.post.mock.calls.map((_c, i) => s.wyslane(i));
    expect(akcje).toHaveLength(2);
    expect(akcje).toContainEqual({
      action: 'create', minute: '15', hour: '3', day_of_month: '*', month: '*', day_of_week: '0',
      command: CRON.command0, api: 'yes',
    });
    expect(akcje).toContainEqual({ action: 'delete', select0: '0', api: 'yes' });
  });

  it('DA odrzuca nowe zadanie → stare zostaje; najpierw create, potem delete (jak L-03)', async () => {
    const s = stanowisko({ get: { '/CMD_API_CRON': CRON } });
    s.post.mockImplementation((_p: string, body?: unknown) =>
      odp(new URLSearchParams(String(body)).get('action') === 'create' ? 'error=1&text=Limit%20cron%C3%B3w' : 'error=0'),
    );
    const wynik = await s.svc.applyEcoModeBackupCronPolicy('s1', 'u1', true);
    expect(wynik.adjusted).toBe(0);
    expect(s.post.mock.calls.map((_c, i) => s.wyslane(i).action)).not.toContain('delete');
  });

  it('błąd odczytu crona → bez zmian i z komunikatem', async () => {
    const s = stanowisko({ get: { '/CMD_API_CRON': new Error('ECONNREFUSED') } });
    expect(await s.svc.applyEcoModeBackupCronPolicy('s1', 'u1', false)).toEqual({ adjusted: 0, notice: 'Bez zmian harmonogramu w DA: ECONNREFUSED' });
    expect(s.post).not.toHaveBeenCalled();
  });
});
