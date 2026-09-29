import { hostingProfileScriptForNode, loadHostingProfileScript } from './hosting-profile.script.js';

/** Decyzja 2026-09-29 — adresy control-plane dla ograniczenia panelu DA :2222 idą z konfiguracji API. */
describe('profil hostingu wydawany węzłowi — adresy control-plane', () => {
  const zmienne = ['VERRIS_CONTROL_PLANE_IPS', 'VERRIS_DA_ADMIN_ALLOW'] as const;
  const stare = Object.fromEntries(zmienne.map((z) => [z, process.env[z]]));
  afterEach(() => {
    for (const z of zmienne) {
      if (stare[z] === undefined) delete process.env[z];
      else process.env[z] = stare[z];
    }
  });

  it('wstawia adresy z env API w miejsce parametrów skryptu (reszta skryptu bez zmian)', () => {
    process.env.VERRIS_CONTROL_PLANE_IPS = '203.0.113.10, 2001:db8::/64';
    process.env.VERRIS_DA_ADMIN_ALLOW = '198.51.100.7';
    const s = hostingProfileScriptForNode();
    expect(s).toMatch(/^VERRIS_CONTROL_PLANE_IPS="203\.0\.113\.10,2001:db8::\/64"$/m);
    expect(s).toMatch(/^VERRIS_DA_ADMIN_ALLOW="198\.51\.100\.7"$/m);
    expect(s.split('\n')).toHaveLength(loadHostingProfileScript().split('\n').length);
  });

  it('brak konfiguracji → puste parametry (profil nie zmienia zapory)', () => {
    delete process.env.VERRIS_CONTROL_PLANE_IPS;
    delete process.env.VERRIS_DA_ADMIN_ALLOW;
    const s = hostingProfileScriptForNode();
    expect(s).toMatch(/^VERRIS_CONTROL_PLANE_IPS=""$/m);
    expect(s).toMatch(/^VERRIS_DA_ADMIN_ALLOW=""$/m);
  });

  it('nieprawidłowy adres (próba wstrzyknięcia) → wyjątek, skrypt nie wychodzi', () => {
    process.env.VERRIS_CONTROL_PLANE_IPS = '203.0.113.10';
    process.env.VERRIS_DA_ADMIN_ALLOW = '1.2.3.4"; rm -rf /; "';
    expect(() => hostingProfileScriptForNode()).toThrow(/VERRIS_DA_ADMIN_ALLOW/);
  });
});
