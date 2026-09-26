import { ConsentsController } from './consents.controller.js';

/** 26.09 — operator w sesji wsparcia nie może złożyć zgody za klienta (fałszywy dowód zgody). */
describe('ConsentsController — zgody tylko od klienta', () => {
  const consents = { acceptCurrent: vi.fn(), acceptDpa: vi.fn() };
  const prefs = { update: vi.fn() };
  const c = new ConsentsController(consents as never, prefs as never);
  const req = { headers: {}, ip: '1.2.3.4', socket: {} } as never;
  const operator = { userId: 'u1', impersonatedBy: 'admin1' };

  beforeEach(() => vi.clearAllMocks());

  it('impersonacja: akceptacja dokumentów, DPA i zgód marketingowych odrzucona, nic nie zapisane', async () => {
    await expect(c.acceptCurrent(operator, req)).rejects.toThrow('wyłącznie klient');
    await expect(c.acceptDpa(operator, req)).rejects.toThrow('wyłącznie klient');
    expect(() => c.updatePrefs(operator, {} as never, req)).toThrow('wyłącznie klient');
    expect(consents.acceptCurrent).not.toHaveBeenCalled();
    expect(consents.acceptDpa).not.toHaveBeenCalled();
    expect(prefs.update).not.toHaveBeenCalled();
  });

  it('klient akceptuje normalnie', async () => {
    await c.acceptCurrent({ userId: 'u1' }, req);
    expect(consents.acceptCurrent).toHaveBeenCalledWith('u1', expect.anything());
  });
});
