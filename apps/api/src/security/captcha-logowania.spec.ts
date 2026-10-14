import { BadRequestException } from '@nestjs/common';
import { LOGIN_CAPTCHA_PO_PROBACH, SuspiciousActivityService } from './suspicious-activity.service.js';
import { AuthController } from '../auth/auth.controller.js';

/**
 * Decyzja 14.10 — miękka captcha logowania: test antybotowy dopiero po 5 nieudanych próbach (e-mail z dowolnego IP
 * albo IP na dowolny e-mail). Wcześniej /auth/login wymagał captchy ZAWSZE, gdy była włączona — także od paneli
 * operatora, które nie mają widgetu (włączenie kluczy w produkcji odcięłoby logowanie hasłem adminowi i obsłudze).
 */
type Proba = { email: string; ip: string | null; succeeded: boolean; reason: string };

function baza(proby: Proba[], rola = 'CLIENT') {
  const pasuje = (p: Proba, w: Record<string, unknown>) =>
    (w.email === undefined || p.email === w.email) &&
    (w.ip === undefined || p.ip === w.ip) &&
    p.succeeded === w.succeeded &&
    (w.reason as { not: string }).not !== p.reason;
  return {
    loginAttempt: { count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => proby.filter((p) => pasuje(p, where)).length) },
    user: { findUnique: vi.fn(async () => ({ role: rola })) },
  };
}
const zle = (n: number, email: string, ip: string, reason = 'bad_password'): Proba[] =>
  Array.from({ length: n }, () => ({ email, ip, succeeded: false, reason }));
const serwis = (proby: Proba[], rola = 'CLIENT') => new SuspiciousActivityService(baza(proby, rola) as never, {} as never, {} as never);

describe('wymagaCaptchyLogowania — próg nieudanych prób', () => {
  it(`poniżej ${LOGIN_CAPTCHA_PO_PROBACH} prób — bez captchy; od progu — z captchą (e-mail z wielu IP albo jedno IP na wiele kont)`, async () => {
    expect(LOGIN_CAPTCHA_PO_PROBACH).toBe(5);
    expect(await serwis(zle(4, 'jan@firma.pl', '198.51.100.1')).wymagaCaptchyLogowania('jan@firma.pl', '203.0.113.7')).toBe(false);
    const rozproszone = Array.from({ length: 5 }, (_, i) => zle(1, 'jan@firma.pl', `198.51.100.${i}`)[0]);
    expect(await serwis(rozproszone).wymagaCaptchyLogowania('Jan@Firma.pl', '203.0.113.7')).toBe(true);
    const jednoIp = Array.from({ length: 5 }, (_, i) => zle(1, `konto${i}@firma.pl`, '198.51.100.9')[0]);
    expect(await serwis(jednoIp).wymagaCaptchyLogowania('nowe@firma.pl', '198.51.100.9')).toBe(true);
  });

  it('przegląd 14.10: konto ADMIN/STAFF — złe hasła z cudzych IP nie wymuszają captchy (panel operatora jej nie pokazuje)', async () => {
    const rozproszone = Array.from({ length: 6 }, (_, i) => zle(1, 'admin@verris.pl', `198.51.100.${i}`)[0]);
    expect(await serwis(rozproszone, 'ADMIN').wymagaCaptchyLogowania('admin@verris.pl', '203.0.113.7')).toBe(false);
    expect(await serwis(rozproszone, 'STAFF').wymagaCaptchyLogowania('admin@verris.pl', '198.51.100.0')).toBe(false);
    expect(await serwis(zle(5, 'admin@verris.pl', '203.0.113.7'), 'ADMIN').wymagaCaptchyLogowania('admin@verris.pl', '203.0.113.7')).toBe(true);
  });

  it('odrzucenia samą blokadą (too_many_attempts) się nie liczą', async () => {
    expect(await serwis(zle(9, 'jan@firma.pl', '198.51.100.1', 'too_many_attempts')).wymagaCaptchyLogowania('jan@firma.pl', null)).toBe(false);
  });
});

describe('POST /auth/login — captcha dopiero po progu', () => {
  function kontroler(o: { wlaczona: boolean; wymagana: boolean }) {
    const verify = vi.fn(async () => undefined);
    const login = vi.fn(async () => ({ access_token: 't' }));
    const auth = { login, wymagaCaptchyLogowania: vi.fn(async () => o.wymagana) };
    const c = new AuthController(auth as never, {} as never, {} as never, {} as never, { isEnabled: () => o.wlaczona, verify } as never);
    return { c, verify, login };
  }
  const req = { headers: {}, ip: '203.0.113.7', socket: { remoteAddress: '203.0.113.7' } } as never;

  it('captcha włączona, mało porażek — logowanie bez tokenu (np. panel operatora bez widgetu)', async () => {
    const k = kontroler({ wlaczona: true, wymagana: false });
    await expect(k.c.login({ email: 'admin@verris.pl', password: 'x' } as never, req)).resolves.toEqual({ access_token: 't' });
    expect(k.verify).not.toHaveBeenCalled();
  });

  it('po progu bez tokenu — 400 z kodem CAPTCHA_WYMAGANA, hasło nie jest sprawdzane', async () => {
    const k = kontroler({ wlaczona: true, wymagana: true });
    const blad = await k.c.login({ email: 'jan@firma.pl', password: 'x' } as never, req).catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(BadRequestException);
    expect((blad as BadRequestException).getResponse()).toMatchObject({ code: 'CAPTCHA_WYMAGANA' });
    expect(k.login).not.toHaveBeenCalled();
  });

  it('po progu z tokenem — weryfikacja u dostawcy, potem logowanie', async () => {
    const k = kontroler({ wlaczona: true, wymagana: true });
    await k.c.login({ email: 'jan@firma.pl', password: 'x', captchaToken: 'token-z-widgetu' } as never, req);
    expect(k.verify).toHaveBeenCalledWith('token-z-widgetu', expect.anything(), 'login');
    expect(k.login).toHaveBeenCalled();
  });

  it('captcha wyłączona (brak kluczy) — nigdy nie wymagana', async () => {
    const k = kontroler({ wlaczona: false, wymagana: true });
    await k.c.login({ email: 'jan@firma.pl', password: 'x' } as never, req);
    expect(k.login).toHaveBeenCalled();
  });
});
