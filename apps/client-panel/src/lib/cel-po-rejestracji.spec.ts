import { CIASTKO_CELU, celPoZalogowaniu, zapamietajCel } from './cel-po-rejestracji';

/** Słoik ciasteczek jak `cookies()` z next/headers — do testu bez serwera. */
function sloik(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  const opcje: Record<string, unknown>[] = [];
  return {
    m,
    opcje,
    get: (n: string) => (m.has(n) ? { value: m.get(n)! } : undefined),
    set: (n: string, v: string, o: Record<string, unknown>) => {
      m.set(n, v);
      opcje.push(o);
    },
    delete: (n: string) => m.delete(n),
  };
}

describe('P4-4 / P3-11 – cel z verris.pl przeżywa rejestrację i potwierdzenie e-maila', () => {
  const POCZTA = '/dashboard/services/new?type=email';

  it('rejestracja z next zapisuje cel (httpOnly, 7 dni); pulpit i obce adresy niczego nie zapisują', () => {
    const s = sloik();
    zapamietajCel(s, POCZTA, true);
    expect(s.m.get(CIASTKO_CELU)).toBe(POCZTA);
    expect(s.opcje[0]).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 604800 });
    for (const zly of ['https://zly.example/x', '//zly.example', '/dashboard', null, undefined, '/login']) {
      const t = sloik();
      zapamietajCel(t, zly);
      expect(t.m.has(CIASTKO_CELU)).toBe(false);
    }
  });

  it('pierwsze logowanie bez next prowadzi do celu i kasuje ciasteczko (jednorazowe)', () => {
    const s = sloik({ [CIASTKO_CELU]: POCZTA });
    expect(celPoZalogowaniu(s, '/dashboard')).toBe(POCZTA);
    expect(s.m.has(CIASTKO_CELU)).toBe(false);
    expect(celPoZalogowaniu(s, '/dashboard')).toBe('/dashboard');
  });

  it('jawny next wygrywa, a podrobione ciasteczko z obcym adresem daje pulpit', () => {
    expect(celPoZalogowaniu(sloik({ [CIASTKO_CELU]: POCZTA }), '/dashboard/billing')).toBe('/dashboard/billing');
    expect(celPoZalogowaniu(sloik({ [CIASTKO_CELU]: 'https://zly.example' }), '/dashboard')).toBe('/dashboard');
  });
});
