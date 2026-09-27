import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller.js';

/** Przegląd 28.09 — wymóg silnego logowania zmienia tylko właściciel we własnej sesji. */
describe('PATCH /users/me/strong-auth', () => {
  const zbuduj = () => {
    const svc = { setStrongAuthRequirement: vi.fn(async () => ({ ok: true })) };
    return { c: new UsersController(svc as never), svc };
  };

  it('właściciel może wyłączyć wymóg', async () => {
    const { c, svc } = zbuduj();
    await c.setStrongAuth({ userId: 'w1' }, { enabled: false } as never);
    expect(svc.setStrongAuthRequirement).toHaveBeenCalledWith('w1', false);
  });

  it.each([
    ['subkonto', { userId: 'w1', customerOwnerId: 'w1' }],
    ['operator w impersonacji', { userId: 'w1', impersonatedBy: 'staff1' }],
  ])('%s nie zmienia wymogu właściciela', (_n, user) => {
    const { c, svc } = zbuduj();
    expect(() => c.setStrongAuth(user, { enabled: false } as never)).toThrow(ForbiddenException);
    expect(svc.setStrongAuthRequirement).not.toHaveBeenCalled();
  });
});
