import { ForbiddenException } from '@nestjs/common';
import { DodatkiOperatoraAdminController } from './dodatki-operatora.admin.controller.js';

/** Audyt Fali 3 (D3) — podgląd dodatków usługi: STAFF tylko usługi klientów (USER), konta zespołu — ADMIN. */
describe('DodatkiOperatoraAdminController.dodatki — reguła właściciela', () => {
  function zbuduj(rola: string) {
    const addons = { overview: vi.fn(async () => ({ katalog: [], posiadane: [] })) };
    const prisma = { subscription: { findUnique: vi.fn(async () => ({ userId: 'u1', user: { role: rola } })) } };
    return { ctrl: new DodatkiOperatoraAdminController(addons as never, prisma as never), addons };
  }

  it('usługa klienta: STAFF widzi', async () => {
    const { ctrl, addons } = zbuduj('USER');
    await ctrl.dodatki('s1', { userId: 'op', role: 'STAFF' });
    expect(addons.overview).toHaveBeenCalledWith('u1');
  });

  it('usługa konta zespołu: STAFF 403 bez odczytu; ADMIN widzi', async () => {
    for (const rola of ['STAFF', 'ADMIN']) {
      const { ctrl, addons } = zbuduj(rola);
      await expect(ctrl.dodatki('s1', { userId: 'op', role: 'STAFF' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(addons.overview).not.toHaveBeenCalled();
      await ctrl.dodatki('s1', { userId: 'a', role: 'ADMIN' });
      expect(addons.overview).toHaveBeenCalledWith('u1');
    }
  });
});
