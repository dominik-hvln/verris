import { PlatformSettingsService } from './platform-settings.service.js';

/**
 * FAK-01 / KSeF 12.10 — przełącznik trybu fakturowania w panelu admina (do 12.10 tylko wiersz
 * w bazie). Powrót do `zewnetrzny` wyłącza też wysyłkę KSeF.
 */
function usluga(wyslaneBezStatusu = 0, wKolejce = 0) {
  const wiersze = new Map<string, string>();
  const audyt: unknown[] = [];
  const prisma = {
    invoice: {
      count: async ({ where }: { where: { ksefStatus: unknown } }) => (where.ksefStatus === 'SUBMITTED' ? wyslaneBezStatusu : wKolejce),
    },
    platformSetting: {
      findMany: async () => [...wiersze].map(([key, value]) => ({ key, value })),
      upsert: async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        wiersze.set(where.key, update.value);
      },
    },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  };
  const s = new PlatformSettingsService(prisma as never, { record: async (a: unknown) => audyt.push(a) } as never, { encrypt: (t: string) => `enc:${t}` } as never);
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

// Przegląd 13.10 — przełączenie TEST → PROD przy fakturach wysłanych, a bez statusu: sprawdzanie poszłoby do PROD
// z numerem sesji z TEST, faktury wisiałyby jako „wysłane” i zajmowały kolejkę wysyłki na zawsze.
describe('KSeF — zmiana środowiska', () => {
  const ustaw = (s: PlatformSettingsService, env: 'test' | 'prod') =>
    s.updateKsefSettings({ enabled: true, env, nip: '5260250274' }, 'admin-1');

  it('faktury czekają na status w starym środowisku → odmowa, środowisko bez zmian', async () => {
    const { s, wiersze } = usluga(2);
    wiersze.set('faktury.tryb', 'panel');
    wiersze.set('ksef.env', 'test');
    await expect(ustaw(s, 'prod')).rejects.toThrow('2 faktur czeka na status w środowisku test');
    expect(wiersze.get('ksef.env')).toBe('test');
  });

  // Przegląd 15.10 — faktury z kolejki (PENDING/OFFLINE) z czasu TEST poszłyby po zmianie do KSeF PROD.
  it('faktury czekają na wysyłkę (PENDING/OFFLINE) → odmowa, środowisko bez zmian', async () => {
    const { s, wiersze } = usluga(0, 4);
    wiersze.set('faktury.tryb', 'panel');
    wiersze.set('ksef.env', 'test');
    await expect(ustaw(s, 'prod')).rejects.toThrow('4 faktur czeka na wysyłkę do środowiska test. Po zmianie poszłyby do prod');
    expect(wiersze.get('ksef.env')).toBe('test');
  });

  it('bez faktur w toku — zmiana przechodzi; to samo środowisko (np. nowy token) — bez sprawdzania', async () => {
    const pusta = usluga(0);
    pusta.wiersze.set('faktury.tryb', 'panel');
    pusta.wiersze.set('ksef.env', 'test');
    await ustaw(pusta.s, 'prod');
    expect(pusta.wiersze.get('ksef.env')).toBe('prod');
    const wToku = usluga(3, 3);
    wToku.wiersze.set('faktury.tryb', 'panel');
    wToku.wiersze.set('ksef.env', 'prod');
    await ustaw(wToku.s, 'prod');
    expect(wToku.wiersze.get('ksef.env')).toBe('prod');
  });
});
