import { kubelek, ocenFlage, type FlagaDoOceny } from './feature-flags.js';

const f = (o: Partial<FlagaDoOceny> = {}): FlagaDoOceny => ({
  key: 'modul.eco', enabledDefault: false, rolloutPercent: 0, startsAt: null, endsAt: null,
  overrides: [], planOverrides: [], ...o,
});
const teraz = new Date('2026-09-23T12:00:00Z');

describe('N-12 — ocena flagi', () => {
  it('domyślnie włączona / wyłączona', () => {
    expect(ocenFlage(f({ enabledDefault: true }), 'u1', [], teraz)).toBe(true);
    expect(ocenFlage(f(), 'u1', [], teraz)).toBe(false);
  });

  it('nadpisanie klienta wygrywa, ale nie po wygaśnięciu', () => {
    const o = [{ userId: 'u1', enabled: true, expiresAt: null }];
    expect(ocenFlage(f({ overrides: o }), 'u1', [], teraz)).toBe(true);
    const wygasle = [{ userId: 'u1', enabled: true, expiresAt: new Date('2026-01-01') }];
    expect(ocenFlage(f({ overrides: wygasle }), 'u1', [], teraz)).toBe(false);
  });

  it('nadpisanie planu: „włączone” na którymkolwiek planie klienta wygrywa', () => {
    const p = [{ planId: 'a', enabled: false }, { planId: 'b', enabled: true }];
    expect(ocenFlage(f({ enabledDefault: true, planOverrides: [p[0]] }), 'u1', ['a'], teraz)).toBe(false);
    expect(ocenFlage(f({ planOverrides: p }), 'u1', ['a', 'b'], teraz)).toBe(true);
    expect(ocenFlage(f({ planOverrides: p }), 'u1', ['c'], teraz)).toBe(false);
  });

  it('okno czasowe wyłącza poza terminem', () => {
    expect(ocenFlage(f({ enabledDefault: true, startsAt: new Date('2026-10-01') }), 'u1', [], teraz)).toBe(false);
    expect(ocenFlage(f({ enabledDefault: true, endsAt: new Date('2026-09-01') }), 'u1', [], teraz)).toBe(false);
  });

  it('rollout: stabilny per klient i zbliżony do procentu', () => {
    const r = f({ rolloutPercent: 30 });
    expect(ocenFlage(r, 'u1', [], teraz)).toBe(ocenFlage(r, 'u1', [], teraz));
    const wlaczonych = Array.from({ length: 2000 }, (_, i) => ocenFlage(r, `u${i}`, [], teraz)).filter(Boolean).length;
    expect(wlaczonych).toBeGreaterThan(500);
    expect(wlaczonych).toBeLessThan(700);
    expect(kubelek('k', 'u')).toBeLessThan(100);
    expect(ocenFlage(f({ rolloutPercent: 100 }), 'u9', [], teraz)).toBe(true);
  });
});
