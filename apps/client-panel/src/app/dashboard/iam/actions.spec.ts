const ustawione: Record<string, string> = {};
const przekierowania: string[] = [];
jest.mock('next/headers', () => ({
  cookies: async () => ({ set: (k: string, v: string) => { ustawione[k] = v; } }),
}));
jest.mock('next/navigation', () => ({
  redirect: (u: string) => {
    przekierowania.push(u);
    throw new Error('NEXT_REDIRECT');
  },
}));
jest.mock('next/cache', () => ({ revalidatePath: () => undefined }));
jest.mock('@/lib/api', () => {
  class ApiError extends Error {}
  return { ApiError, apiFetch: jest.fn(async () => { throw new ApiError('Ten adres ma już dostęp do konta.'); }) };
});

import { acceptInviteAction, inviteSubaccountAction } from './actions';

/** Błąd formularza IAM ma wrócić na stronę z komunikatem — wyjątek kończył się stroną błędu bez treści. */
describe('IAM: błędy formularzy', () => {
  beforeEach(() => { przekierowania.length = 0; delete ustawione.iam_blad; });

  const form = (pola: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(pola)) for (const x of [v].flat()) f.append(k, x);
    return f;
  };

  it('błąd API przy zaproszeniu → komunikat w ciasteczku, powrót na IAM z notice=blad', async () => {
    await expect(inviteSubaccountAction(form({ email: 'a@b.pl', permissions: ['TICKETS_READ'] }))).rejects.toThrow('NEXT_REDIRECT');
    expect(ustawione.iam_blad).toBe('Ten adres ma już dostęp do konta.');
    expect(przekierowania).toEqual(['/dashboard/iam?notice=blad']);
  });

  it('brak uprawnień w formularzu → komunikat, bez zapytania do API', async () => {
    await expect(inviteSubaccountAction(form({ email: 'a@b.pl' }))).rejects.toThrow('NEXT_REDIRECT');
    expect(ustawione.iam_blad).toMatch(/uprawnienie/);
  });

  it('przyjęcie zaproszenia: powrót na stronę zaproszenia z tym samym tokenem', async () => {
    await expect(acceptInviteAction(form({ token: 'tok/1', firstName: 'A', lastName: 'B', password: 'x'.repeat(10) }))).rejects.toThrow('NEXT_REDIRECT');
    expect(przekierowania).toEqual(['/accept-invite?token=tok%2F1&notice=blad']);
  });
});
