import { execFileSync } from 'child_process';
import { buildNodeBootstrapOneLiner, buildNodeBootstrapScript } from './node-bootstrap.script';
import { STOS_WEZLA, stosJakoEnv, zgodnoscZManifestem } from './stos-wezla';

/** PB-29 / PB-30 — bootstrap węzła: bez sekretów w treści, manifest wersji, poprawne wykrywanie CloudLinux. */
describe('Bootstrap węzła (PB-29 / PB-30)', () => {
  const skrypt = buildNodeBootstrapScript({
    apiBaseUrl: 'https://api.verris.pl/',
    bootstrapToken: 'eko_btk_test',
    serverId: 'srv-1',
    stackEnv: stosJakoEnv(),
    hostname: 'node-pl-02.verris.pl',
  });

  it('jest poprawnym skryptem bash', () => {
    expect(() => execFileSync('bash', ['-n'], { input: skrypt })).not.toThrow();
  });

  it('nie zawiera kluczy licencyjnych — pobiera je POST-em z nagłówkiem tokenu', () => {
    expect(skrypt).toMatch(/^DA_LICENSE=''$/m);
    expect(skrypt).toMatch(/^CL_ACTIVATION_KEY=''$/m);
    expect(skrypt).toMatch(/^LS_SERIAL=''$/m);
    expect(skrypt).toContain('-X POST -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" "$API_BASE/agent/nodes/bootstrap/secrets"');
    expect(skrypt).not.toContain('?token=');
  });

  it('wykrywa CloudLinux przez /proc/lve i cldetect, nie po nazwie jądra', () => {
    expect(skrypt).toContain('[ -e /proc/lve/list ]');
    expect(skrypt).toContain('cldetect --detect-edition');
    expect(skrypt).not.toContain('uname -r | grep -qi lve');
  });

  it('instaluje DirectAdmin z wersjami z manifestu i sprząta token po DONE', () => {
    expect(skrypt).toContain(`VERRIS_MARIADB='${STOS_WEZLA.mariadb}'`);
    expect(skrypt).toContain('export DA_CHANNEL="$VERRIS_DA_CHANNEL"');
    expect(skrypt).toContain('mysql_inst=mariadb mariadb="$VERRIS_MARIADB"');
    expect(skrypt).toContain('rm -f "$RUNNER" "$UNIT"');
  });

  it('one-liner niesie token w nagłówku, nie w adresie', () => {
    const linia = buildNodeBootstrapOneLiner({ apiBaseUrl: 'https://api.verris.pl', bootstrapToken: 'eko_btk_x' });
    expect(linia).toBe("curl -fsS -H 'X-Bootstrap-Token: eko_btk_x' 'https://api.verris.pl/agent/nodes/bootstrap/script' | bash");
  });

  it('raport zgodności porównuje prefiks wersji i zna brak raportu', () => {
    const r = zgodnoscZManifestem({ stackVersion: STOS_WEZLA.wersja, dbVersion: '11.4.13', lsVersion: '6.2.1', phpVersion: null });
    expect(r.map((p) => p.zgodne)).toEqual([true, true, false, null]);
  });
});
