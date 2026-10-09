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
  const panel = CADDY.slice(CADDY.indexOf('(panel_headers) {'), CADDY.indexOf('# Blok oczywistych skanerów'));

  // 09.10: CSP paneli z nonce ustawia aplikacja (libs/ui/src/csp.ts; testy form-action/connect-src są
  // w apps/client-panel/src/middleware.spec.ts). Drugi CSP z Caddy przeglądarka stosuje RAZEM z nim —
  // polityka bez nonce zablokowałaby skrypty Nexta. Caddy daje tylko wartość domyślną (`?`), gdy upstream jej nie wysłał.
  it('Caddy nie nadpisuje CSP paneli — tylko domyślny (?) dla odpowiedzi bez CSP z aplikacji', () => {
    const linie = panel.split('\n').map((l) => l.trim()).filter((l) => /^[?+-]?Content-Security-Policy\b/.test(l));
    expect(linie).toHaveLength(1);
    expect(linie[0]).toMatch(/^\?Content-Security-Policy "/);
  });

  it('domyślny CSP z Caddy bez skryptów inline i bez obcych hostów w script-src', () => {
    const csp = /\?Content-Security-Policy "([^"]+)"/.exec(panel)?.[1] ?? '';
    const ss = /script-src ([^;]+)/.exec(csp)?.[1]?.trim();
    expect(ss).toBe("'self'");
  });

  it('webhook OpenProvidera na API tylko z adresów OpenProvidera (inne → 403)', () => {
    const api = CADDY.slice(CADDY.indexOf('{$CADDY_API_DOMAIN'));
    const blok = /@op_webhook_obcy \{([\s\S]*?)\}/.exec(api)?.[1] ?? '';
    expect(blok).toMatch(/path \/webhooks\/openprovider\n/);
    expect(blok).toMatch(/not remote_ip 185\.87\.187\.130 34\.34\.72\.46 34\.91\.59\.39\n/); // + sandbox OP (07.10)
    expect(api).toMatch(/respond @op_webhook_obcy 403/);
  });
});
