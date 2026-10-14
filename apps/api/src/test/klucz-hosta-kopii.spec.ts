import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Kopie off-site — przypięty klucz hosta Storage Boxa (ops/scripts/node-backup-config.sh).
 * 13.10 na t2: w known_hosts były tylko ed25519 i rsa, klient SSH rclone wynegocjował ecdsa → „knownhosts: key mismatch”,
 * kopie i lista kopii węzła nie działały. Dokumentacja rclone (https://rclone.org/sftp/#host-key-validation) każe
 * pobrać wszystkie typy kluczy hosta; DSA pomijamy (OpenSSH 9.8+ go nie obsługuje).
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-backup-config.sh'), 'utf8');

describe('klucz hosta Storage Boxa — wszystkie typy, które może wynegocjować rclone', () => {
  it('ssh-keyscan pobiera rsa, ecdsa i ed25519 do pliku known_hosts remote’u', () => {
    const linia = SKRYPT.split('\n').find((l) => l.trimStart().startsWith('ssh-keyscan'));
    expect(linia).toBeDefined();
    const typy = /-t\s+(\S+)/.exec(linia!)?.[1]?.split(',') ?? [];
    expect(typy).toEqual(expect.arrayContaining(['rsa', 'ecdsa', 'ed25519']));
    expect(typy).not.toContain('dsa');
  });

  it('remote SFTP korzysta z tego pliku (bez wyłączonej weryfikacji)', () => {
    // Przegląd 15.10: remote zapisywany wprost w pliku konfiguracji (bez haseł w argv), dalej z przypiętym kluczem hosta.
    expect(SKRYPT).toMatch(/\[verris-remote\]\ntype = sftp\n[\s\S]*?known_hosts_file = \$KH\n/);
  });
});
