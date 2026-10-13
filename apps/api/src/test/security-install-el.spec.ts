import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 13.10 (t2, minimalny AlmaLinux 10 u Contabo): Onboard LIVE padł na
 * „/etc/audit/rules.d/verris-security.rules: No such file or directory” — instalator doinstalowywał pakiety
 * tylko przez apt-get, a obraz EL bez pakietu audit nie ma katalogu reguł.
 */
const KORZEN = join(import.meta.dirname, '../../../..');
const skrypt = readFileSync(join(KORZEN, 'ops/scripts/security-install-verris-security.sh'), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');

describe('security-install-verris-security.sh na AlmaLinux/CloudLinux', () => {
  it('instaluje przez dnf pakiet audit (i odpowiedniki ipset, bind-utils) przed zapisem reguł auditd', () => {
    const dnf = skrypt.search(/dnf -y install [^"\n]*\baudit\b/);
    const reguly = skrypt.indexOf('/etc/audit/rules.d/verris-security.rules');
    expect(dnf).toBeGreaterThan(-1);
    expect(dnf).toBeLessThan(reguly);
    expect(skrypt).toMatch(/dnf -y install [^"\n]*\bipset\b[^"\n]*\bbind-utils\b/);
    // EL10: /etc/audit/rules.d i augenrules są w osobnym pakiecie audit-rules (t2: audit był, katalogu nie).
    expect(skrypt).toMatch(/dnf -y install [^"\n]*\baudit-rules\b/);
  });
});
