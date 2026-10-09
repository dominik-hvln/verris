/**
 * Decyzja 09.10 — zmiana kraju rozliczenia / NIP po pierwszej płatności.
 *
 * CO PILNUJE. API odrzuca taką zmianę (403) z komunikatem „Zmianę kraju rozliczenia
 * zgłoś obsłudze.” — `updateUserProfile` ma oddać ten komunikat do toastu formularza
 * „Dane bilingowe”. Przed poprawką akcja połykała każdy błąd i klient widział
 * „Błąd połączenia z serwerem”, choć API odpowiedziało i powiedziało, co zrobić.
 */

const apiFetch = jest.fn();
jest.mock('@/lib/auth', () => ({ getAuthToken: async () => 'jwt' }));
jest.mock('@/lib/api', () => {
  class ApiError extends Error {
    constructor(message: string, public readonly status: number, public readonly body: unknown) {
      super(message);
    }
  }
  return { ApiError, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

import { ApiError } from '@/lib/api';
import { updateUserProfile } from './actions';

beforeEach(() => apiFetch.mockReset());

describe('updateUserProfile — komunikat API trafia do klienta', () => {
  it('403 po pierwszej płatności → „Zmianę kraju rozliczenia zgłoś obsłudze.”', async () => {
    apiFetch.mockRejectedValue(new ApiError('Zmianę kraju rozliczenia zgłoś obsłudze.', 403, {}));
    await expect(updateUserProfile({ country: 'US' })).resolves.toEqual({
      error: 'Zmianę kraju rozliczenia zgłoś obsłudze.',
    });
  });

  it('błąd spoza API (np. wyjątek w kodzie) → ogólny komunikat', async () => {
    apiFetch.mockRejectedValue(new Error('boom'));
    await expect(updateUserProfile({ city: 'Poznań' })).resolves.toEqual({ error: 'Błąd połączenia z serwerem' });
  });
});
