import { PlatformSettingsService } from './platform-settings.service.js';

/**
 * FAK-01 / KSeF 12.10 — przełącznik trybu fakturowania w panelu admina (do 12.10 tylko wiersz
 * w bazie). Powrót do `zewnetrzny` wyłącza też wysyłkę KSeF.
 */
function usluga() {
  const wiersze = new Map<string, string>();
  const audyt: unknown[] = [];
  const prisma = {
    platformSetting: {
      findMany: async () => [...wiersze].map(([key, value]) => ({ key, value })),
      upsert: async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        wiersze.set(where.key, update.value);
      },
    },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  };
  const s = new PlatformSettingsService(prisma as never, { record: async (a: unknown) => audyt.push(a) } as never, {} as never);
  return { s, wiersze, audyt };
}

describe('Tryb fakturowania — przełącznik admina', () => {
  it('domyślnie zewnetrzny', async () => {
    await expect(usluga().s.getTrybFakturowania()).resolves.toEqual({ tryb: 'zewnetrzny' });
  });

  it('panel: zapisuje tryb i nie rusza KSeF; zmiana w dzienniku', async () => {
    const { s, wiersze, audyt } = usluga();
    await expect(s.ustawTrybFakturowania('panel', 'admin-1')).resolves.toEqual({ tryb: 'panel' });
    expect(wiersze.get('faktury.tryb')).toBe('panel');
    expect(wiersze.has('ksef.enabled')).toBe(false);
    expect(audyt).toEqual([expect.objectContaining({ action: 'FAKTURY_TRYB_ZMIENIONY', details: { poprzedni: 'zewnetrzny', tryb: 'panel', ksefWylaczony: false } })]);
  });

  it('powrót do zewnetrzny wyłącza wysyłkę KSeF (ponowne „panel” nie wznowi jej po cichu)', async () => {
    const { s, wiersze } = usluga();
    wiersze.set('faktury.tryb', 'panel');
    wiersze.set('ksef.enabled', '1');
    await s.ustawTrybFakturowania('zewnetrzny', 'admin-1');
    expect(wiersze.get('faktury.tryb')).toBe('zewnetrzny');
    expect(wiersze.get('ksef.enabled')).toBe('0');
  });
});
