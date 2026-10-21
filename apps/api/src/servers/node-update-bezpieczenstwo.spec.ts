import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNodeUpdateScript } from './node-update.script.js';
import { wynikAktualizacji } from './przeglad-wezla.service.js';

/**
 * 21.10 — weryfikator aktualizacji: „Zainstaluj poprawki bezpieczeństwa” (UPD_TRYB=bezpieczenstwo) instaluje tylko
 * poprawki z repozytoriów (dnf --security / --cve), opcjonalnie CustomBuild, restartuje LiteSpeed i odświeża raport —
 * bez pełnej aktualizacji stosu (yum -y update, da update). Skrypt wykonywany naprawdę na atrapach poleceń.
 */
function uruchom(env: Record<string, string>, opcje: { dnfKod?: number } = {}) {
  const T = mkdtempSync(join(tmpdir(), 'verris-upd-bezp-'));
  try {
    const bin = join(T, 'bin');
    const cb = join(T, 'custombuild');
    const lsws = join(T, 'lswsctrl');
    const wymus = join(T, 'wymus');
    mkdirSync(bin);
    mkdirSync(cb);
    const zapis = (nazwa: string, kod = 0) => `#!/usr/bin/env bash\necho "${nazwa} $*" >> "${join(T, 'wywolania')}"\nexit ${kod}\n`;
    for (const n of ['yum', 'da', 'rpm', 'sleep', 'verris-fetch']) {
      writeFileSync(join(bin, n), zapis(n));
      chmodSync(join(bin, n), 0o755);
    }
    writeFileSync(join(bin, 'dnf'), zapis('dnf', opcje.dnfKod ?? 0));
    chmodSync(join(bin, 'dnf'), 0o755);
    writeFileSync(join(cb, 'build'), zapis('build'));
    chmodSync(join(cb, 'build'), 0o755);
    writeFileSync(lsws, zapis('lswsctrl'));
    chmodSync(lsws, 0o755);
    const skrypt = join(T, 'upd.sh');
    writeFileSync(
      skrypt,
      loadNodeUpdateScript()
        .replace('CB=/usr/local/directadmin/custombuild', `CB=${cb}`)
        .replace(/bash \/usr\/local\/bin\/verris-agent-install\.sh/, 'true')
        .replaceAll('/usr/local/lsws/bin/lswsctrl', lsws)
        .replaceAll('/var/run/verris-aktualizacje.wymus', wymus)
        .replaceAll('/usr/local/bin/verris-straznik.sh', join(T, 'brak-straznika')),
    );
    let kod = 0;
    let out = '';
    try {
      out = execFileSync('bash', [skrypt], { env: { ...process.env, ...env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
    } catch (e) {
      const err = e as { status: number; stdout: string };
      kod = err.status;
      out = err.stdout;
    }
    const wywolania = existsSync(join(T, 'wywolania')) ? readFileSync(join(T, 'wywolania'), 'utf8').split('\n').filter(Boolean) : [];
    return { kod, out, wywolania, wymuszono: existsSync(wymus) };
  } finally {
    rmSync(T, { recursive: true, force: true });
  }
}

describe('aktualizacja węzła — tryb poprawek bezpieczeństwa', () => {
  it('tylko dnf --security i restart LiteSpeed; bez yum -y update, da update i CustomBuilda; raport do odświeżenia', () => {
    const r = uruchom({ UPD_TRYB: 'bezpieczenstwo' });
    expect(r.kod).toBe(0);
    expect(wynikAktualizacji(r.out)).toBe('ok');
    expect(r.wywolania).toContain('dnf -y upgrade --security');
    expect(r.wywolania).toContain('lswsctrl restart');
    expect(r.wywolania.some((w) => w.startsWith('yum') || w.startsWith('da ') || w.startsWith('build'))).toBe(false);
    expect(r.wymuszono).toBe(true);
  });

  it('z CVE: dnf --cve dla każdego numeru; z custombuild: update + update_versions', () => {
    const r = uruchom({ UPD_TRYB: 'bezpieczenstwo', UPD_CVE: 'CVE-2026-109618,CVE-2026-109619', UPD_CUSTOMBUILD: '1' });
    expect(r.kod).toBe(0);
    expect(r.wywolania.filter((w) => w.startsWith('dnf'))).toEqual(['dnf -y upgrade --cve CVE-2026-109618', 'dnf -y upgrade --cve CVE-2026-109619']);
    expect(r.wywolania).toEqual(expect.arrayContaining(['build update', 'build update_versions', 'build rewrite_confs']));
    expect(r.wywolania.some((w) => w.startsWith('yum'))).toBe(false);
  });

  it('zły numer CVE albo nieznany tryb → failed bez żadnej instalacji', () => {
    const przypadki: Record<string, string>[] = [{ UPD_TRYB: 'bezpieczenstwo', UPD_CVE: 'CVE-2026-1;rm -rf /' }, { UPD_TRYB: 'wszystko' }];
    for (const env of przypadki) {
      const r = uruchom(env);
      expect(r.kod).toBe(1);
      expect(wynikAktualizacji(r.out)).toBe('failed');
      expect(r.wywolania.filter((w) => w.startsWith('dnf') || w.startsWith('yum'))).toEqual([]);
    }
  });

  it('dnf kończy się błędem → failed (fala staje), a nie „ok”', () => {
    const r = uruchom({ UPD_TRYB: 'bezpieczenstwo' }, { dnfKod: 1 });
    expect(r.kod).toBe(1);
    expect(r.out).toContain('BŁĄD: dnf upgrade --security');
    expect(wynikAktualizacji(r.out)).toBe('failed');
  });

  it('domyślny tryb bez zmian: pełna aktualizacja (yum -y update, da update, update_versions)', () => {
    const r = uruchom({});
    expect(r.wywolania).toEqual(expect.arrayContaining(['yum -y update', 'da update', 'build update_versions']));
    expect(r.wywolania.some((w) => w.startsWith('dnf'))).toBe(false);
  });
});
