/**
 * X-05 — wybór usługi na stronach narzędzi hostingu (DNS, bazy, FTP, pliki…).
 *
 * CO PILNUJE. `?serviceId=` z URL, którego nie ma na liście usług klienta,
 * daje `null` („nie znaleziono"), a NIE pierwszą usługę z listy. Cichy fallback
 * oznaczałby, że klient z nieaktualnym linkiem (albo linkiem do usługi, która
 * już nie jest jego) edytuje DNS czy usuwa pliki na INNEJ swojej usłudze,
 * myśląc, że pracuje na tej z linku.
 */

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { getHostingDns, resolveServiceForHostingPages } from './hosting-tools-data';

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
});

describe('X-05 resolveServiceForHostingPages', () => {
  it('jawny serviceId z listy → ta usługa', async () => {
    await expect(resolveServiceForHostingPages('s2')).resolves.toEqual({ id: 's2' });
  });

  it('nieznany serviceId → null, nie pierwsza usługa', async () => {
    await expect(resolveServiceForHostingPages('obca')).resolves.toBeNull();
  });

  it('bez parametru → pierwsza usługa; brak usług → null', async () => {
    await expect(resolveServiceForHostingPages(undefined)).resolves.toEqual({ id: 's1' });
    apiFetch.mockResolvedValue([]);
    await expect(resolveServiceForHostingPages(undefined)).resolves.toBeNull();
  });
});

describe('X-05 getHostingDns', () => {
  it('koduje domenę w query stringu', async () => {
    apiFetch.mockResolvedValue({});
    await getHostingDns('s1', 'a b&c.pl');
    expect(apiFetch).toHaveBeenCalledWith('/services/s1/hosting-dns?domain=a%20b%26c.pl');
    await getHostingDns('s1');
    expect(apiFetch).toHaveBeenLastCalledWith('/services/s1/hosting-dns');
  });
});
