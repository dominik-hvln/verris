import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { wynikZLogu } from './slow-sql.service.js';

/** K-14 — skrypt węzła na prawdziwym formacie slow logu MariaDB: tylko bazy konta, bez wartości z zapytań. */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-slow-sql.sh');
const LOG = `# Time: 260925 10:00:00
# User@Host: klient1_wp[klient1_wp] @ localhost []
# Thread_id: 5  Schema: klient1_wp  QC_hit: No
# Query_time: 3.500000  Lock_time: 0.000100  Rows_sent: 1  Rows_examined: 250000
SET timestamp=1790330000;
SELECT * FROM wp_posts WHERE post_title = 'Tajny tytuł' AND ID IN (1,2,3);
# User@Host: klient1_wp[klient1_wp] @ localhost []
# Thread_id: 6  Schema: klient1_wp  QC_hit: No
# Query_time: 2.100000  Lock_time: 0.000100  Rows_sent: 1  Rows_examined: 120000
SET timestamp=1790330100;
SELECT * FROM wp_posts WHERE post_title = 'Inny' AND ID IN (4,5);
# User@Host: klient10_x[klient10_x] @ localhost []
# Thread_id: 7  Schema: klient10_x  QC_hit: No
# Query_time: 9.000000  Lock_time: 0.000100  Rows_sent: 1  Rows_examined: 1
SET timestamp=1790330200;
SELECT haslo FROM users WHERE email = 'ktos@example.com';
`;

describe('K-14 — wolne zapytania SQL', () => {
  it('skrypt: grupuje zapytania konta, bez cudzych baz i bez wartości', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sq-'));
    writeFileSync(join(dir, 'slow.log'), LOG);
    const out = execFileSync('bash', [SKRYPT], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', SQ_DA_USER: 'klient1', SQ_LOG_FILE: join(dir, 'slow.log') },
    });
    const w = wynikZLogu(out)!;
    expect(w.grupy).toHaveLength(1);
    expect(w.grupy[0]).toMatchObject({ baza: 'klient1_wp', liczba: 2, suma: 5.6, max: 3.5, przejrzane: 250000 });
    expect(w.grupy[0].sql).toBe('SELECT * FROM wp_posts WHERE post_title = ? AND ID IN (?…);');
    expect(JSON.stringify(w)).not.toMatch(/Tajny|haslo|ktos@/);
  });

  it('wynik z logu: śmieci odrzucone', () => {
    expect(wynikZLogu('nic')).toBeNull();
    expect(wynikZLogu(`VERRIS_SLOWSQL=${Buffer.from('{"grupy":[{"sql":1,"suma":-3}]}').toString('base64')}`)!.grupy[0]).toMatchObject({ sql: '', suma: 0 });
  });
});
