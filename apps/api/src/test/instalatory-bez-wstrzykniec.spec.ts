import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Instalatory aplikacji na węźle budują polecenie dla `su -c` z danych klienta (tytuł strony, e-mail,
 * hasło). Wartość w '…' psuła się na apostrofie („Ania's”) i pozwalała dopisać polecenie. Teraz dane
 * klienta idą przez printf %q; strażnik pilnuje, żeby żadna z nich nie wróciła do '…$ZMIENNA…'.
 */
const skrypt = (n: string) => readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', n), 'utf8');

describe('instalatory aplikacji — dane klienta w poleceniach', () => {
  it.each([
    ['node-wp-install.sh', ['WP_SITE_TITLE', 'WP_ADMIN_USER', 'WP_ADMIN_PASS', 'WP_ADMIN_EMAIL']],
    ['node-app-install.sh', ['APP_ADMIN_USER', 'APP_ADMIN_PASS', 'APP_ADMIN_EMAIL', 'APP_DB_PASS']],
  ])('%s: brak %s w apostrofach', (plik, zmienne) => {
    const s = skrypt(plik);
    for (const z of zmienne) expect({ z, wApostrofach: s.includes(`'$${z}'`) }).toEqual({ z, wApostrofach: false });
    expect(s).toContain('printf %q');
  });
});
