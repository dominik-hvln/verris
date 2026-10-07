import { WebAuthnService } from './webauthn.service.js';

// G-18 (07.10): dodanie/usunięcie passkey nie zostawiało śladu w dzienniku konta — tylko mail.
describe('passkey — dziennik konta', () => {
  it('usunięcie passkey zapisuje PASSKEY_REMOVED z nazwą urządzenia', async () => {
    const prisma = {
      webAuthnCredential: { findFirst: vi.fn(async () => ({ id: 'c1', name: 'MacBook' })), delete: vi.fn(async () => ({})) },
      user: { findUnique: vi.fn(async () => null) },
    };
    const audit = { record: vi.fn(async () => undefined) };
    const svc = new WebAuthnService(prisma as never, { get: () => undefined } as never, {} as never, {} as never, audit as never);
    await svc.deleteCredential('u1', 'c1');
    expect(audit.record).toHaveBeenCalledWith({ action: 'PASSKEY_REMOVED', userId: 'u1', actorUserId: 'u1', details: { name: 'MacBook' } });
  });
});
