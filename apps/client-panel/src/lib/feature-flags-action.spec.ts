/**
 * Paczka 131 – flaga `kreatorMarki` przychodzi wyłącznie z /me/feature-flags: panel nie pyta przy każdym wejściu
 * o stan Kreatora marki (GET /kreator-marki/stan składa miniatury marek – za drogie na menu).
 */
const mockApi = jest.fn();
jest.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => mockApi(...a) }));

import { pobierzFlagiAction } from './feature-flags-action';

beforeEach(() => mockApi.mockReset());

it('jedno zapytanie – /me/feature-flags; flaga Kreatora marki z jego odpowiedzi', async () => {
  mockApi.mockResolvedValue({ vps: true, kreatorMarki: true });
  expect(await pobierzFlagiAction()).toEqual({ vps: true, kreatorMarki: true });
  expect(mockApi.mock.calls).toEqual([['/me/feature-flags']]);
});

it('awaria API – pusta mapa (Kreator marki ukryty)', async () => {
  mockApi.mockRejectedValue(new Error('500'));
  expect(await pobierzFlagiAction()).toEqual({});
});
