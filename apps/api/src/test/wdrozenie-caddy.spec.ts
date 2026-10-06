import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ta sama rodzina co X-29: Caddy czyta Caddyfile tylko przy starcie i przy reloadzie, a `prod-deploy-ghcr.sh`
 * nie przeładowywał go wcale. Wykryte 2026-09-25 na produkcji: trasa grafana…/verris-sso była w repo i na
 * dysku serwera, a Caddy dalej kierował ją do forward_auth. Strażnik: reload jest w skrypcie, jest
 * warunkiem sukcesu (błąd = exit 1) i stoi po bramce zdrowia aplikacji.
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'prod-deploy-ghcr.sh'), 'utf8');

describe('wdrożenie przeładowuje Caddy', () => {
  it('caddy reload z Caddyfile z repo, porażka kończy wdrożenie błędem', () => {
    const krok = SKRYPT.match(/if ! compose exec -T -w \/etc\/caddy caddy caddy reload --config \/etc\/caddy\/Caddyfile; then[\s\S]*?\n {2}fi\n/);
    expect(krok?.[0]).toMatch(/exit 1/);
  });

  it('po bramce zdrowia aplikacji (reload nie może wycofać zdrowego wydania)', () => {
    expect(SKRYPT.indexOf('caddy reload --config')).toBeGreaterThan(SKRYPT.indexOf('compose up -d --no-build ${APP_SERVICES}'));
  });
});

describe('CSP paneli', () => {
  const CADDY = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'caddy', 'Caddyfile'), 'utf8');
  const panel = CADDY.slice(CADDY.indexOf('(panel_headers) {'));

  it('form-action dopuszcza węzły *.verris.pl (webmail skrzynki: POST z tokenem do Roundcube), nic szerszego', () => {
    const fa = /form-action ('self'[^;]+);/.exec(panel)?.[1] ?? ''; // pierwsza CSP po (panel_headers)
    expect(fa.split(' ')).toContain('https://*.verris.pl');
    expect(fa).not.toMatch(/\bhttps:(?!\/\/)|\*(?!\.verris\.pl)/);
  });

  it('connect-src dopuszcza websocket konsoli VPS (wss_url z request_console), tylko wss i tylko *.hetzner.cloud', () => {
    const cs = /connect-src ([^;]+);/.exec(panel)?.[1] ?? '';
    expect(cs.split(' ')).toContain('wss://*.hetzner.cloud');
    expect(cs).not.toMatch(/(^| )wss:(?!\/\/\*\.hetzner\.cloud)/);
  });
});
