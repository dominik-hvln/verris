import { MigrationPreflightService } from './migration-preflight.service.js';

/**
 * E2e 14.10 (migracja 1e4768ef): baza niedostępna z zewnątrz, SSH tylko kluczem, a eksport przez PHP wołał skrypt
 * pod domeną docelową sl.hvln.pl, która nie miała wpisu w DNS. Test dostępów mówił tylko „hasło odczytamy z wp-config”,
 * a błąd wychodził po kwadransie w kroku bazy. Teraz test dostępów ostrzega o adresie strony bez wpisu w DNS.
 */
class Preflight extends MigrationPreflightService {
  sprawdzone: string[] = [];
  constructor(private readonly istnieja: string[]) {
    super({ record: vi.fn(async () => undefined) } as never);
  }
  protected override async adresStronyIstnieje(domena: string): Promise<boolean> {
    this.sprawdzone.push(domena);
    return this.istnieja.includes(domena);
  }
}

// FTP na 127.0.0.1 — odrzucony przed połączeniem (test nie łączy się z siecią); baza bez hasła — bez łączenia.
const ftp = { host: '127.0.0.1', port: 21, username: 'u', password: 'p', protocol: 'ftps' };
const baza = { host: 'hvln.pl', port: 3306, database: 'hvln_wp' };

describe('test dostępów — adres strony do eksportu bazy przez PHP', () => {
  it('bez domeny źródłowej, domena konta bez wpisu w DNS → ostrzeżenie przy bazie (bez blokady)', async () => {
    const svc = new Preflight([]);
    const r = await svc.preflightBundle({ ftp, mysql: [baza] } as never, 'user', 'sub', 'user', 'sl.hvln.pl');
    const db = r.checks.find((c) => c.kind === 'mysql')!;
    expect(db.status).toBe('reachable');
    expect(db.message).toContain('Login i hasło bazy odczytamy z pliku wp-config.php');
    expect(db.message).toContain('adres strony „sl.hvln.pl” nie ma wpisu w DNS');
    expect(db.message).toContain('Domena źródłowa');
  });

  it('domena źródłowa ma pierwszeństwo; istnieje → bez ostrzeżenia', async () => {
    const svc = new Preflight(['hvln.pl']);
    const r = await svc.preflightBundle({ ftp, mysql: [baza], sourceDomain: 'HVLN.pl', targetDomain: 'sl.hvln.pl' } as never, 'user', 'sub', 'user', 'sl.hvln.pl');
    expect(svc.sprawdzone).toEqual(['hvln.pl']);
    expect(r.checks.find((c) => c.kind === 'mysql')!.message).not.toContain('DNS');
  });

  it('bez plików (bez FTP) nie ma eksportu przez PHP — nie sprawdzamy adresu', async () => {
    const svc = new Preflight([]);
    await svc.preflightBundle({ mysql: [baza] } as never, 'user', 'sub', 'user', 'sl.hvln.pl');
    expect(svc.sprawdzone).toEqual([]);
  });
});
