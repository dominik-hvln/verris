import { canShowGrafanaLink, grafanaSsoHref } from './grafana-ops-link';

/**
 * Link do Grafany w panelu obsługi: widzi go administrator albo pracownik z jawnym
 * uprawnieniem; przejście zawsze przez /grafana/sso (sesja panelu → Grafana), nigdy wprost.
 */
describe('X-05 link do Grafany', () => {
  const ORYG = process.env.NEXT_PUBLIC_GRAFANA_URL;
  afterEach(() => {
    process.env.NEXT_PUBLIC_GRAFANA_URL = ORYG;
  });

  it('admin zawsze, pracownik tylko z canAccessGrafana', () => {
    expect(canShowGrafanaLink({ role: 'ADMIN' })).toBe(true);
    expect(canShowGrafanaLink({ role: 'STAFF' })).toBe(false);
    expect(canShowGrafanaLink({ role: 'STAFF', canAccessGrafana: true })).toBe(true);
  });

  it('bez adresu Grafany nie ma linku (zamiast martwego przycisku)', () => {
    delete process.env.NEXT_PUBLIC_GRAFANA_URL;
    expect(grafanaSsoHref()).toBeNull();
  });

  it('z adresem: przejście przez /grafana/sso z zakodowanym celem', () => {
    process.env.NEXT_PUBLIC_GRAFANA_URL = 'https://grafana.verris.pl';
    const href = grafanaSsoHref();
    expect(href?.startsWith('/grafana/sso?to=')).toBe(true);
    expect(decodeURIComponent(href!.split('to=')[1]!)).toMatch(/^https:\/\/grafana\.verris\.pl/);
  });
});
