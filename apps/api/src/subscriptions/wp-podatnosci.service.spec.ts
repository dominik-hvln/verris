import type { Mock } from 'vitest';
import { WpPodatnosciService, opisBledu, porownajWersje, wZakresie, wierszeZFeedu } from './wp-podatnosci.service.js';

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

  it('start API: z kluczem i pustą bazą pobiera feed od razu; z danymi albo bez klucza — nie', async () => {
    const odswiez = vi.fn(async () => 1200);
    const zBaza = (n: number, klucz?: string) => {
      const svc = new WpPodatnosciService({ wpPodatnosc: { count: vi.fn(async () => n) } } as never, { get: () => klucz } as never);
      svc.odswiez = odswiez;
      return svc;
    };
    zBaza(0, 'wf-key').onApplicationBootstrap();
    await vi.waitFor(() => expect(odswiez).toHaveBeenCalledTimes(1));
    zBaza(5, 'wf-key').onApplicationBootstrap();
    zBaza(0).onApplicationBootstrap();
    await new Promise((r) => setTimeout(r, 10));
    expect(odswiez).toHaveBeenCalledTimes(1);
  });

  it('ten sam slug dwa razy w rekordzie → jeden wiersz z oboma zakresami (D3 02.10: UniqueConstraintViolation)', () => {
    const sw = (slug: string, od: string, doW: string, fix: string) => ({
      type: 'plugin',
      slug,
      affected_versions: { [`${od} - ${doW}`]: { from_version: od, from_inclusive: true, to_version: doW, to_inclusive: true } },
      patched_versions: [fix],
    });
    const w = wierszeZFeedu({ u1: rekord({ software: [sw('example', '1.0.0', '1.2.3', '1.2.4'), sw('Example', '2.0.0', '2.0.5', '2.0.6')] }) });
    expect(w).toHaveLength(1);
    expect(w[0].zakresy.map((z) => z.do)).toEqual(['1.2.3', '2.0.5']);
    expect(w[0].poprawione).toEqual(['1.2.4', '2.0.6']);
  });

  it('cron: błąd sieci nie ucieka do Schedulera — log „Wordfence feed: …” i null (D3 02.10)', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error(''), { code: 'ETIMEDOUT' }) });
    }) as unknown as typeof fetch;
    const svc = new WpPodatnosciService({} as never, { get: () => 'wf-key' } as never);
    const warn = vi.spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn').mockImplementation(() => undefined);
    expect(await svc.odswiez()).toBeNull();
    expect(warn).toHaveBeenCalledWith('Wordfence feed: TypeError: fetch failed (ETIMEDOUT)');
  });

  it('opis błędu Prismy: kod i sedno komunikatu w jednej linii (D3 02.10: pusty WARN)', () => {
    const e = Object.assign(new Error('\nInvalid `prisma.wpPodatnosc.createMany()` invocation:\n\n\nUnique constraint failed on the fields: (`id`)'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });
    expect(opisBledu(e)).toBe(
      'PrismaClientKnownRequestError [P2002]: Invalid `prisma.wpPodatnosc.createMany()` invocation: Unique constraint failed on the fields: (`id`)',
    );
  });

  it('opis błędu sieci: nazwa i powód z cause, nie pusty komunikat (D3 01.10)', () => {
    expect(opisBledu(new TypeError('fetch failed', { cause: Object.assign(new Error(''), { code: 'ENOTFOUND' }) }))).toBe('TypeError: fetch failed (ENOTFOUND)');
    expect(opisBledu(new AggregateError([], ''))).toBe('AggregateError: —');
  });
});
