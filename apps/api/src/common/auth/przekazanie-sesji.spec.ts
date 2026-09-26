import { odbierzKodPrzekazania, wydajKodPrzekazania } from './przekazanie-sesji.js';
import { AuthController } from '../../auth/auth.controller.js';

describe('jednorazowe kody przekazania sesji', () => {
  it('kod wymienia się na token dokładnie raz', () => {
    const kod = wydajKodPrzekazania('tok-1');
    expect(kod).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(odbierzKodPrzekazania(kod)).toBe('tok-1');
    expect(odbierzKodPrzekazania(kod)).toBeNull();
  });

  it('po 60 s kod nie działa; śmieci i inne typy → null', () => {
    const t0 = 1_000_000;
    const kod = wydajKodPrzekazania('tok-2', t0);
    expect(odbierzKodPrzekazania(kod, t0 + 60_001)).toBeNull();
    expect(odbierzKodPrzekazania('x')).toBeNull();
    expect(odbierzKodPrzekazania(undefined)).toBeNull();
    expect(odbierzKodPrzekazania({ kod } as unknown)).toBeNull();
  });
});

describe('POST /auth/handoff', () => {
  it('kod z impersonacji → token raz; drugi raz 401', () => {
    const c = new AuthController({} as never, {} as never, {} as never, {} as never, {} as never);
    const kod = wydajKodPrzekazania('tok-imp');
    expect(c.handoff({ code: kod })).toEqual({ access_token: 'tok-imp' });
    expect(() => c.handoff({ code: kod })).toThrow('Kod wygasł');
  });
});
