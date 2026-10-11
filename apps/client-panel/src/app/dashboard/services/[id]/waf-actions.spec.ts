/**
 * Noc 11→12.10 — odczyt stanu WAF: tylko 400 „brak konta hostingowego” jest stanem; inny błąd (sieć, 5xx, 404)
 * to błąd odczytu, a nie `null` udający brak konta.
 */
class ApiErrorAtrapa extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
const mockApiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
  ApiError: ApiErrorAtrapa,
}));

import { getWafStatus } from './waf-actions';

beforeEach(() => mockApiFetch.mockReset());

it('stan z API → ok', async () => {
  mockApiFetch.mockResolvedValueOnce({ domain: 'klient.pl' });
  await expect(getWafStatus('s1')).resolves.toEqual({ ok: true, status: { domain: 'klient.pl' } });
  expect(mockApiFetch).toHaveBeenCalledWith('/services/s1/waf');
});

it('400 „brak konta hostingowego” → brakKonta; 5xx i błąd sieci → błąd odczytu (nie null)', async () => {
  mockApiFetch.mockRejectedValueOnce(new ApiErrorAtrapa('Usługa nie ma jeszcze konta hostingowego.', 400));
  await expect(getWafStatus('s1')).resolves.toMatchObject({ ok: false, brakKonta: true });
  mockApiFetch.mockRejectedValueOnce(new ApiErrorAtrapa('Internal server error', 500));
  await expect(getWafStatus('s1')).resolves.toEqual({ ok: false, brakKonta: false, error: 'Nie udało się wczytać stanu zapory — spróbuj ponownie.' });
  mockApiFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
  await expect(getWafStatus('s1')).resolves.toMatchObject({ ok: false, brakKonta: false });
});
