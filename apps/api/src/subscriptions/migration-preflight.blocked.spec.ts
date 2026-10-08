import { MigrationPreflightService } from './migration-preflight.service.js';

/**
 * Z-09 (t1, 08.10): host odrzucony przez resolvePublicHost (sieć prywatna, serwer Verris) wracał
 * z testu dostępów jako „unreachable” — kreator pisał „możesz kontynuować, resztę dokończymy”
 * i przepuszczał dalej, a zlecenie i tak padało. Teraz osobny status „blocked”.
 */
describe('preflight — host zakazany', () => {
  const svc = new MigrationPreflightService({ record: vi.fn(async () => undefined) } as never);

  it.each(['ftp', 'sftp'] as const)('%s na 127.0.0.1 → blocked, bez prefiksu „Brak połączenia”', async (protocol) => {
    const r = await svc.preflightBundle(
      { ftp: { host: '127.0.0.1', port: 21, username: 'u', password: 'p', protocol } } as never,
      'user',
      'sub',
    );
    expect(r.ok).toBe(false);
    expect(r.checks[0]).toMatchObject({ status: 'blocked', message: 'Host wskazuje na sieć prywatną — odrzucono.' });
  });

  it('mysql i imap na 10.0.0.1 → blocked', async () => {
    const r = await svc.preflightBundle(
      {
        mysql: [{ host: '10.0.0.1', port: 3306, username: 'u', password: 'p', database: 'd' }],
        imap: [{ host: '10.0.0.1', port: 993, username: 'u', password: 'p', email: 'a@b.pl' }],
      } as never,
      'user',
      'sub',
    );
    expect(r.checks.map((c) => c.status)).toEqual(['blocked', 'blocked']);
  });
});
