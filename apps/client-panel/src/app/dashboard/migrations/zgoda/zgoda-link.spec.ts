/**
 * Noc 15.10 (przegląd client-apifetch-path) — link „Zgoda na migrację” bierze serviceId i id z query (link z maila).
 * Next 16 dekoduje searchParams w całości, więc wartość z „.\t./”, „?” albo „#” kierowała żądanie z tokenem ofiary do
 * innej trasy API (np. `?serviceId=.%09.%2F.%09.%2Fusers%2Fme%3F` → GET /users/me), a „Zgadzam się” — POST.
 * Teraz identyfikatory muszą być UUID, a w ścieżce są kodowane.
 */
const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

import { getProsbaOZgodeMigracji } from '../../hosting-tools-data';
import { odrzucZgodeMigracjiAction, przyjmijZgodeMigracjiAction } from '../actions';

const S = '0b6f2c1e-4d5a-4b8e-9c7d-1a2b3c4d5e6f';
const M = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const ZLE = ['.\t./.\t./users/me?', '../admin', 'abc#', 'abc?x=1', `${S}/../x`, ''];

describe('zgoda na migrację — identyfikatory z linku', () => {
  beforeEach(() => apiFetch.mockReset().mockResolvedValue({}));

  it.each(ZLE)('odczyt: serviceId %j → odmowa bez żądania do API', async (zly) => {
    await expect(getProsbaOZgodeMigracji(zly, M)).rejects.toThrow();
    await expect(getProsbaOZgodeMigracji(S, zly)).rejects.toThrow();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it.each(ZLE)('akcje: %j → błąd bez POST', async (zly) => {
    expect(await przyjmijZgodeMigracjiAction({ serviceId: zly, migrationId: M })).toHaveProperty('error');
    expect(await odrzucZgodeMigracjiAction({ serviceId: S, migrationId: zly })).toHaveProperty('error');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('poprawne UUID → żądania na właściwe trasy (token tylko w query, zakodowany)', async () => {
    await getProsbaOZgodeMigracji(S, M, 'a b&c');
    expect(apiFetch).toHaveBeenLastCalledWith(`/services/${S}/migrations/bundles/${M}/zgoda?token=a%20b%26c`);
    await przyjmijZgodeMigracjiAction({ serviceId: S, migrationId: M, token: 't' });
    expect(apiFetch).toHaveBeenLastCalledWith(`/services/${S}/migrations/bundles/${M}/zgoda`, expect.objectContaining({ method: 'POST' }));
    await odrzucZgodeMigracjiAction({ serviceId: S, migrationId: M });
    expect(apiFetch).toHaveBeenLastCalledWith(`/services/${S}/migrations/bundles/${M}/zgoda/odrzuc`, expect.objectContaining({ method: 'POST' }));
  });
});
