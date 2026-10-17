import { CZAS_USUWANIA_KONTA_MS, DirectAdminClient } from '@verris/directadmin-sdk';

/**
 * 17.10 (t2, PB-31): „Zakończ i usuń konto” → „timeout of 15000ms exceeded”. DirectAdmin usuwa katalog domowy,
 * bazy, pocztę i strefy w tym samym żądaniu CMD_API_SELECT_USERS delete=yes — domyślny limit odczytów (15 s)
 * kończył się przed odpowiedzią, a konto zostawało w panelu jako aktywne.
 */
describe('DirectAdminClient.deleteAccount — limit czasu', () => {
  it('usuwanie konta ma własny, długi limit (≥ 2 min), nie domyślne 15 s', async () => {
    const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'admin', loginKey: 'x', secure: true });
    const post = vi.fn(async () => ({ data: 'error=0&text=Users deleted' }));
    Object.assign(klient, { client: { post } });
    await klient.deleteAccount('vinorgdw');
    const [sciezka, cialo, opcje] = post.mock.calls[0] as unknown as [string, string, { timeout?: number }];
    expect(sciezka).toBe('/CMD_API_SELECT_USERS');
    expect(cialo).toContain('delete=yes');
    expect(cialo).toContain('select0=vinorgdw');
    expect(opcje.timeout).toBe(CZAS_USUWANIA_KONTA_MS);
    expect(CZAS_USUWANIA_KONTA_MS).toBeGreaterThanOrEqual(120_000);
  });
});
