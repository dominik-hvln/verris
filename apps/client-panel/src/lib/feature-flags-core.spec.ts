/**
 * X-05 — widoczność modułów panelu (N-12) i przełączniki build-time.
 *
 * CO PILNUJE. Dwie własności, obie o tym, co klient w ogóle widzi w menu:
 *  1. Moduł jest widoczny tylko przy `przełącznik build-time && flaga operatora
 *     !== false`. BRAK flagi w bazie znaczy „włączony" — gdyby znaczył
 *     „wyłączony", pierwszy deploy bez zasianych flag schowałby EKO, IAM
 *     i polecenia wszystkim klientom naraz.
 *  2. Flaga operatora nie może WŁĄCZYĆ modułu wyłączonego przy buildzie
 *     (np. VPS przed wejściem do sprzedaży) — inaczej klient trafi na stronę
 *     „chwilowo niedostępne".
 *
 * DLACZEGO `resetModules`. `clientFeatures` jest liczone raz przy imporcie
 * z `process.env`, więc każdy wariant env wymaga świeżego modułu.
 */

type Core = typeof import('./feature-flags-core');
type Features = typeof import('./client-features');

const ENV_KEYS = [
  'NEXT_PUBLIC_FEATURE_ECO',
  'NEXT_PUBLIC_FEATURE_REFERRAL',
  'NEXT_PUBLIC_FEATURE_IAM',
  'NEXT_PUBLIC_FEATURE_VPS',
] as const;

async function load(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}): Promise<Core & Features> {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  jest.resetModules();
  const mod = { ...(await import('./client-features')), ...(await import('./feature-flags-core')) };
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  return mod;
}

describe('X-05 client-features — przełączniki build-time', () => {
  it('bez zmiennych: EKO, polecenia i IAM włączone, VPS ukryty', async () => {
    const { clientFeatures } = await load();
    expect(clientFeatures).toEqual({ eco: true, iam: true, referral: true, vps: false });
  });

  it('pusta wartość traktowana jak brak zmiennej', async () => {
    const { clientFeatures } = await load({ NEXT_PUBLIC_FEATURE_ECO: '', NEXT_PUBLIC_FEATURE_VPS: '' });
    expect(clientFeatures.eco).toBe(true);
    expect(clientFeatures.vps).toBe(false);
  });

  it('„false"/„0" wyłącza, „true"/„1" włącza', async () => {
    expect((await load({ NEXT_PUBLIC_FEATURE_ECO: 'false' })).clientFeatures.eco).toBe(false);
    expect((await load({ NEXT_PUBLIC_FEATURE_IAM: '0' })).clientFeatures.iam).toBe(false);
    expect((await load({ NEXT_PUBLIC_FEATURE_VPS: 'true' })).clientFeatures.vps).toBe(true);
    expect((await load({ NEXT_PUBLIC_FEATURE_VPS: '1' })).clientFeatures.vps).toBe(true);
  });
});

describe('X-05 czyModul / trasaWidoczna — co jest w menu', () => {
  it('brak flagi operatora = moduł widoczny', async () => {
    const { czyModul, trasaWidoczna } = await load();
    expect(czyModul({}, 'modul.eco')).toBe(true);
    expect(trasaWidoczna({}, '/dashboard/iam')).toBe(true);
  });

  it('flaga operatora `false` chowa moduł, także z query stringiem', async () => {
    const { trasaWidoczna } = await load();
    const flagi = { 'modul.referral': false };
    expect(trasaWidoczna(flagi, '/dashboard/referral')).toBe(false);
    expect(trasaWidoczna(flagi, '/dashboard/referral?tab=kody')).toBe(false);
    expect(trasaWidoczna(flagi, '/dashboard/eco')).toBe(true);
  });

  it('flaga operatora `true` nie włącza modułu wyłączonego przy buildzie', async () => {
    const { czyModul } = await load({ NEXT_PUBLIC_FEATURE_ECO: 'false' });
    expect(czyModul({ 'modul.eco': true }, 'modul.eco')).toBe(false);
  });

  it('VPS zależy wyłącznie od przełącznika build-time', async () => {
    expect((await load()).trasaWidoczna({}, '/dashboard/vps')).toBe(false);
    expect((await load({ NEXT_PUBLIC_FEATURE_VPS: 'true' })).trasaWidoczna({}, '/dashboard/vps/abc')).toBe(true);
  });

  it('trasy spoza modułów są zawsze widoczne (nic nie znika przez przypadek)', async () => {
    const { trasaWidoczna } = await load({
      NEXT_PUBLIC_FEATURE_ECO: 'false',
      NEXT_PUBLIC_FEATURE_IAM: 'false',
      NEXT_PUBLIC_FEATURE_REFERRAL: 'false',
    });
    const wszystkoWylaczone = { 'modul.eco': false, 'modul.iam': false, 'modul.referral': false };
    for (const href of ['/dashboard', '/dashboard/billing', '/dashboard/services', '/dashboard/support']) {
      expect(trasaWidoczna(wszystkoWylaczone, href)).toBe(true);
    }
  });
});
