import type { Mock } from 'vitest';
import { WpPodatnosciService, porownajWersje, wZakresie, wierszeZFeedu } from './wp-podatnosci.service.js';

const rekord = (o: Record<string, unknown> = {}) => ({
  title: 'XSS w Example',
  informational: false,
  references: ['http://www.wordfence.com/threat-intel/vulnerabilities/example'],
  published: '2026-09-01 10:00:00',
  software: [
    {
      type: 'plugin',
      slug: 'example',
      affected_versions: { '1.0.0 - 1.2.3': { from_version: '1.0.0', from_inclusive: true, to_version: '1.2.3', to_inclusive: true } },
      patched_versions: ['1.2.4'],
    },
  ],
  ...o,
});

describe('I-07 — podatności WordPressa (Wordfence Scanner Feed v3)', () => {
  it.each([
    ['1.2.3', '1.2.3', 0],
    ['1.2', '1.2.0', 0],
    ['1.10', '1.9', 1],
    ['6.4.1', '6.4', 1],
    ['2.0-beta', '2.0', -1],
    ['2.0-RC1', '2.0-beta2', 1],
  ])('porownajWersje(%s, %s) = %d', (a, b, w) => expect(porownajWersje(a, b)).toBe(w));

  it('zakresy: granice włącznie/wyłącznie i „*”', () => {
    const z = { od: '1.0.0', odWlacznie: true, do: '1.2.3', doWlacznie: true };
    expect(wZakresie('1.2.3', z)).toBe(true);
    expect(wZakresie('1.2.4', z)).toBe(false);
    expect(wZakresie('1.2.3', { ...z, doWlacznie: false })).toBe(false);
    expect(wZakresie('0.9', { ...z, od: '*' })).toBe(true);
  });

  it('feed → wiersze: link https do rekordu, bez rekordów informacyjnych i śmieci', () => {
    const w = wierszeZFeedu({
      u1: rekord(),
      u2: rekord({ informational: true }),
      u3: rekord({ software: [{ type: 'evil', slug: 'x' }] }),
    });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ id: 'u1:plugin:example', link: 'https://www.wordfence.com/threat-intel/vulnerabilities/example', poprawione: ['1.2.4'] });
  });

  it('dopasowanie do stanu strony: tylko wersje w zakresie', async () => {
    const [wiersz] = wierszeZFeedu({ u1: rekord() });
    const prisma = { wpPodatnosc: { findMany: vi.fn(async () => [wiersz]) } };
    const s = new WpPodatnosciService(prisma as never, { get: () => 'k' } as never);
    const stan = (wersja: string) => ({
      version: '6.8',
      core: [],
      plugins: [{ name: 'example', title: 'Example', status: 'active', version: wersja, update: 'available', update_version: '1.2.4' }],
      themes: [],
    });
    expect(await s.dlaStanu(stan('1.2.0'))).toEqual([expect.objectContaining({ nazwa: 'Example', wersja: '1.2.0', poprawione: ['1.2.4'] })]);
    expect(await s.dlaStanu(stan('1.2.4'))).toEqual([]);
  });

  it('odświeżanie: bez klucza nic, z kluczem Bearer; zbyt mały feed nie czyści bazy', async () => {
    const tx = { wpPodatnosc: { deleteMany: vi.fn(), createMany: vi.fn() } };
    const prisma = { $transaction: vi.fn(async (f: (t: typeof tx) => Promise<void>) => f(tx)) };
    expect(await new WpPodatnosciService(prisma as never, { get: () => undefined } as never).odswiez()).toBeNull();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ u1: rekord() }) })) as unknown as typeof fetch;
    expect(await new WpPodatnosciService(prisma as never, { get: () => 'wf-key' } as never).odswiez()).toBeNull();
    expect((global.fetch as Mock).mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer wf-key' });
    expect(tx.wpPodatnosc.deleteMany).not.toHaveBeenCalled();
    const duzy = Object.fromEntries(Array.from({ length: 1200 }, (_, i) => [`u${i}`, rekord()]));
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => duzy })) as unknown as typeof fetch;
    expect(await new WpPodatnosciService(prisma as never, { get: () => 'wf-key' } as never).odswiez()).toBe(1200);
    expect(tx.wpPodatnosc.deleteMany).toHaveBeenCalled();
  });
});
