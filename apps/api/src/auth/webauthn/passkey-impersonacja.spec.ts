import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from '../auth.controller.js';

/**
 * Audyt bezpieczeństwa 09.10 (A07) — operator w sesji „Zaloguj jako klient” (impersonacja, PB-41)
 * NIE może zarządzać passkey klienta: token impersonacji ma impersonatedBy, więc zarejestrowanie albo
 * usunięcie klucza dałoby trwały dostęp poza 30-min limitem. Zarządza nimi wyłącznie właściciel (jak 2FA).
 */
describe('passkey — zarządzanie zablokowane w sesji impersonacji', () => {
  function kontroler() {
    const webauthn = {
      registrationOptions: vi.fn(async () => ({ ok: true })),
      verifyRegistration: vi.fn(async () => ({ ok: true })),
      listCredentials: vi.fn(async () => []),
      deleteCredential: vi.fn(async () => ({ ok: true })),
    };
    const c = new AuthController(
      {} as never,
      {} as never,
      webauthn as never,
      {} as never,
      {} as never,
    );
    return { c, webauthn };
  }

  const impersonacja = { userId: 'klient', principalUserId: 'klient', impersonatedBy: 'operator' };
  const wlasciciel = { userId: 'klient', principalUserId: 'klient' };

  it('register/options, register/verify, lista i delete → 403 w sesji impersonacji; webauthn nietknięte', async () => {
    const { c, webauthn } = kontroler();
    await expect(async () => c.webauthnRegisterOptions(impersonacja as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(async () =>
      c.webauthnRegisterVerify(impersonacja as never, { response: {}, deviceName: 'x' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(async () => c.webauthnList(impersonacja as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(async () => c.webauthnDelete(impersonacja as never, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(webauthn.registrationOptions).not.toHaveBeenCalled();
    expect(webauthn.verifyRegistration).not.toHaveBeenCalled();
    expect(webauthn.deleteCredential).not.toHaveBeenCalled();
  });

  it('właściciel (bez impersonacji) nadal zarządza swoimi kluczami', async () => {
    const { c, webauthn } = kontroler();
    await c.webauthnRegisterOptions(wlasciciel as never);
    await c.webauthnDelete(wlasciciel as never, 'c1');
    expect(webauthn.registrationOptions).toHaveBeenCalledWith('klient');
    expect(webauthn.deleteCredential).toHaveBeenCalledWith('klient', 'c1');
  });
});
