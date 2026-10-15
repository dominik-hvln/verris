/** Decyzja 15.10 (#12) — panel klienta tylko dla kont klienckich: rola z /users/me świeżego tokenu. */
jest.mock('@/lib/api', () => ({ apiFetch: jest.fn() }));

import { apiFetch } from '@/lib/api';
import { KONTO_ZESPOLU, sesjaKlienta } from './tylko-klient';

describe('sesjaKlienta', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['ADMIN', 'STAFF'])('%s → odmowa i zamknięcie wydanej sesji', async (role) => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ role }).mockResolvedValueOnce({});
    expect(await sesjaKlienta('tok')).toEqual({ ok: false, error: KONTO_ZESPOLU });
    expect((apiFetch as jest.Mock).mock.calls[0]).toEqual(['/users/me', { unauthenticated: true, headers: { Authorization: 'Bearer tok' } }]);
    expect((apiFetch as jest.Mock).mock.calls[1][0]).toBe('/auth/logout');
  });

  it('klient → sesja; błąd sprawdzenia → odmowa', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ role: 'USER' });
    expect(await sesjaKlienta('tok')).toEqual({ ok: true });
    (apiFetch as jest.Mock).mockRejectedValueOnce(new Error('503'));
    expect((await sesjaKlienta('tok')).ok).toBe(false);
  });
});
