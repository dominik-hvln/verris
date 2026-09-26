import { PrzegladRcpdScheduler } from './przeglad-rcpd.scheduler.js';

describe('P-11 przypomnienie o przeglądzie RCPD', () => {
  it('każdy aktywny administrator dostaje zadanie z linkiem do RODO w adminie', async () => {
    const create = vi.fn(async () => undefined);
    const findMany = vi.fn(async () => [{ id: 'a1' }, { id: 'a2' }]);
    const s = new PrzegladRcpdScheduler({ user: { findMany } } as never, { create } as never);
    expect(await s.przypomnij()).toBe(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { role: 'ADMIN', loginBlocked: false } }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'a2', title: 'Przegląd okresowy RCPD', link: '/compliance' }));
  });
});
