jest.mock('next/navigation', () => ({
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
  },
}));

import { bezpiecznie, odpakuj, zOdpakowaniem } from './wynik-akcji';

/** Komunikat błędu API musi dojść do klienta — Next na produkcji ukrywa treść rzuconych błędów akcji. */
describe('wynik akcji serwera', () => {
  it('błąd API → wynik z komunikatem, a u klienta Error z tą samą treścią', async () => {
    const w = await bezpiecznie(async () => {
      throw new Error('Za mało środków w portfelu');
    });
    expect(w).toEqual({ ok: false, blad: 'Za mało środków w portfelu' });
    expect(() => odpakuj(w)).toThrow('Za mało środków w portfelu');
  });

  it('sukces → dane; opakowana akcja zwraca dane jak dawniej', async () => {
    const akcja = async (a: number) => bezpiecznie(async () => a * 2);
    await expect(zOdpakowaniem(akcja)(21)).resolves.toBe(42);
  });

  it('redirect() przechodzi dalej zamiast zamienić się w błąd', async () => {
    await expect(bezpiecznie(async () => { throw new Error('NEXT_REDIRECT'); })).rejects.toThrow('NEXT_REDIRECT');
  });
});
