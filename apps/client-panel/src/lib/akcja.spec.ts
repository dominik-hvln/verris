import { bezpiecznaAkcja, KOMUNIKAT_PO_AKTUALIZACJI } from './akcja';

/**
 * t1, 08.10: kreator migracji otwarty przed deployem wołał akcję serwera, której nowy build już nie zna
 * (UnrecognizedActionError). Wyjątek przerywał funkcję przed `setPreflighting(false)` — „Sprawdzam dostępy…”
 * kręciło się bez końca, a odpytywanie postępu sypało błędami co 5 s.
 */
describe('bezpiecznaAkcja', () => {
  it('przepuszcza wynik akcji', async () => {
    await expect(bezpiecznaAkcja(async () => ({ ok: true as const, x: 1 }))).resolves.toEqual({ ok: true, x: 1 });
  });

  it('akcja nieznana po deployu → komunikat o odświeżeniu', async () => {
    const blad = Object.assign(new Error('Server Action "00be95" was not found on the server.'), { name: 'UnrecognizedActionError' });
    await expect(bezpiecznaAkcja(async () => { throw blad; })).resolves.toEqual({ error: KOMUNIKAT_PO_AKTUALIZACJI });
    expect(KOMUNIKAT_PO_AKTUALIZACJI).toMatch(/odśwież/);
  });

  it('inny wyjątek (sieć) → zwykły błąd zamiast przerwanej funkcji', async () => {
    const r = await bezpiecznaAkcja(async () => { throw new TypeError('Failed to fetch'); });
    expect(r).toEqual({ error: expect.stringMatching(/spróbuj ponownie/) });
  });
});
