/**
 * PB-41 (08.10): bez uprawnienia „Wejście na konto klienta” API zwraca 403 — pracownik ma się dowiedzieć, czego mu
 * brakuje, zamiast ogólnego „Twoja rola nie ma uprawnień do tej operacji”.
 */
const mockStaffApi = jest.fn();
jest.mock('@/lib/staff-api', () => {
  class StaffApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: (...a: unknown[]) => mockStaffApi(...a) };
});
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('@/lib/crm-profile-data', () => ({ staffRunDnsTlsDiagnostic: jest.fn() }));

import { StaffApiError } from '@/lib/staff-api';
import { staffImpersonateUserAction } from './actions';

it('403 → komunikat o brakującym uprawnieniu', async () => {
  mockStaffApi.mockRejectedValue(new StaffApiError('Twoja rola nie ma uprawnień do tej operacji.', 403));
  await expect(staffImpersonateUserAction('u1', 'Zgłoszenie #1234 — strona nie działa')).resolves.toEqual({
    ok: false,
    error: 'Twoja rola nie ma uprawnienia „Wejście na konto klienta”. Poproś administratora o jego nadanie.',
  });
});

it('inny błąd API — jego komunikat', async () => {
  mockStaffApi.mockRejectedValue(new StaffApiError('Powód impersonacji jest wymagany (min. 10 znaków).', 400));
  await expect(staffImpersonateUserAction('u1', 'krótki')).resolves.toMatchObject({ error: 'Powód impersonacji jest wymagany (min. 10 znaków).' });
});
