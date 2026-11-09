import sharp from 'sharp';
import { GeneratorBfl } from './bfl.js';
import { GeneratorOpenAi } from './openai-obrazy.js';
import { BladGeneratora, WYMIARY_BFL, rozmiarOpenAi, type ZlecenieObrazow } from './generator.js';
import type { Fetch } from '../biblioteka/dostawca.js';

/**
 * Paczka 124 – adaptery generowania zdjęć z atrapą fetch: BFL (zlecenie → odpytywanie → pobranie pliku z *.bfl.ai,
 * moderacja, błąd, termin), OpenAI Images (b64_json, moderacja 400, n w jednym zleceniu).
 */
const jpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: '#aa5533' } }).jpeg().toBuffer();
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const zlecenie = (z: Partial<ZlecenieObrazow> = {}): ZlecenieObrazow => ({
  prompt: 'Bright hair salon interior, natural light. No text.',
  proporcje: '4:3',
  ile: 1,
  model: 'flux-pro-1.1',
  sygnal: AbortSignal.timeout(5000),
  ...z,
});
const odrazu = async (_ms: number, s: AbortSignal) => {
  if (s.aborted) throw s.reason;
};

/** Atrapa API BFL: każde zlecenie dostaje id; `statusy[id]` = kolejne odpowiedzi odpytywania. */
function atrapaBfl(statusy: (n: number) => unknown[], plik: Buffer, opcje: { zlecenieStatus?: number; pollingUrl?: (id: string) => string; sample?: string } = {}) {
  const wywolania: { url: string; init?: RequestInit }[] = [];
  let n = 0;
  const kolejki = new Map<string, unknown[]>();
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    wywolania.push({ url: u, init });
    if (u.startsWith('https://api.bfl.ai/v1/flux')) {
      if (opcje.zlecenieStatus) return json({ detail: 'x' }, opcje.zlecenieStatus);
      const id = `zad-${++n}`;
      kolejki.set(id, [...statusy(n)]);
      return json({ id, polling_url: opcje.pollingUrl ? opcje.pollingUrl(id) : `https://api.eu1.bfl.ai/v1/get_result?id=${id}` });
    }
    if (u.includes('/v1/get_result')) {
      const id = new URL(u).searchParams.get('id')!;
      const k = kolejki.get(id)!;
      return json(k.length > 1 ? k.shift() : k[0]);
    }
    if (u.startsWith('https://delivery-eu1.bfl.ai/')) return new Response(plik, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(plik.length) } });
    return new Response('nie', { status: 404 });
  }) as unknown as Fetch;
  return { f, wywolania };
}

const gotowy = (id = 'x') => ({ status: 'Ready', result: { sample: `https://delivery-eu1.bfl.ai/results/${id}/sample.jpeg?se=1` } });

describe('GeneratorBfl', () => {
  it('zlecenie z x-key, wymiarami z proporcji i jpeg → odpytywanie aż do Ready → plik pobrany od razu; warianty równolegle', async () => {
    const plik = await jpeg();
    const { f, wywolania } = atrapaBfl(() => [{ status: 'Pending' }, { status: 'Pending' }, gotowy()], plik);
    const g = new GeneratorBfl('bfl-klucz', f, odrazu);
    const w = await g.generuj(zlecenie({ ile: 2, proporcje: '16:9' }));
    expect(w.obrazy).toHaveLength(2);
    expect(w.obrazy[0]!.dane.equals(plik)).toBe(true);
    expect(w).toMatchObject({ rozliczone: 2, moderowane: 0 });
    const zl = wywolania.filter((x) => x.url === 'https://api.bfl.ai/v1/flux-pro-1.1');
    expect(zl).toHaveLength(2);
    expect((zl[0]!.init!.headers as Record<string, string>)['x-key']).toBe('bfl-klucz');
    expect(JSON.parse(String(zl[0]!.init!.body))).toMatchObject({ prompt: expect.stringContaining('hair salon'), ...WYMIARY_BFL['16:9'], output_format: 'jpeg' });
    expect(wywolania.filter((x) => x.url.includes('get_result'))).toHaveLength(6);
    for (const { width, height } of Object.values(WYMIARY_BFL)) {
      expect(width % 32 + (height % 32)).toBe(0);
      expect(Math.max(width, height)).toBeLessThanOrEqual(1440);
    }
  });

  it('moderacja wszystkich wariantów → BladGeneratora „moderacja” (rozliczone, bo zlecenia przyjęto); jeden z dwóch → wynik częściowy', async () => {
    const plik = await jpeg();
    const wszystkie = atrapaBfl(() => [{ status: 'Content Moderated' }], plik);
    const e = await new GeneratorBfl('k', wszystkie.f, odrazu).generuj(zlecenie({ ile: 2 })).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BladGeneratora);
    expect(e).toMatchObject({ kod: 'moderacja', rozliczone: 2 });
    expect((e as Error).message).toContain('narusza zasady');

    const czesc = atrapaBfl((n) => (n === 1 ? [{ status: 'Request Moderated' }] : [gotowy()]), plik);
    const w = await new GeneratorBfl('k', czesc.f, odrazu).generuj(zlecenie({ ile: 2 }));
    expect(w).toMatchObject({ rozliczone: 2, moderowane: 1 });
    expect(w.obrazy).toHaveLength(1);
  });

  it('błąd dostawcy: 429 przy zleceniu → „limit” bez rozliczenia; status Error → „blad”; brak klucza → „wylaczony”', async () => {
    const plik = await jpeg();
    await expect(new GeneratorBfl('k', atrapaBfl(() => [], plik, { zlecenieStatus: 429 }).f, odrazu).generuj(zlecenie())).rejects.toMatchObject({ kod: 'limit', rozliczone: 0 });
    await expect(new GeneratorBfl('k', atrapaBfl(() => [{ status: 'Error' }], plik).f, odrazu).generuj(zlecenie())).rejects.toMatchObject({ kod: 'blad', rozliczone: 1 });
    await expect(new GeneratorBfl('k', atrapaBfl(() => [], plik, { zlecenieStatus: 402 }).f, odrazu).generuj(zlecenie())).rejects.toMatchObject({ kod: 'blad' });
    const bez = new GeneratorBfl(undefined, atrapaBfl(() => [], plik).f, odrazu);
    expect(bez.wlaczony()).toBe(false);
    await expect(bez.generuj(zlecenie())).rejects.toMatchObject({ kod: 'wylaczony' });
  });

  it('termin: dostawca wiecznie „Pending” → „czas” po upływie sygnału (z prawdziwym odstępem odpytywania)', async () => {
    const plik = await jpeg();
    const { f } = atrapaBfl(() => [{ status: 'Pending' }], plik);
    const s = new AbortController();
    setTimeout(() => s.abort(new Error('termin')), 30);
    await expect(new GeneratorBfl('k', f).generuj(zlecenie({ sygnal: s.signal }))).rejects.toMatchObject({ kod: 'czas', rozliczone: 1 });
  });

  it('SSRF: polling_url albo adres wyniku spoza *.bfl.ai → błąd, obcy host nie jest odpytywany', async () => {
    const plik = await jpeg();
    const zly = atrapaBfl(() => [gotowy()], plik, { pollingUrl: (id) => `https://evil.example/v1/get_result?id=${id}` });
    await expect(new GeneratorBfl('k', zly.f, odrazu).generuj(zlecenie())).rejects.toMatchObject({ kod: 'blad' });
    expect(zly.wywolania.some((w) => w.url.includes('evil.example'))).toBe(false);
    const zlyWynik = atrapaBfl(() => [{ status: 'Ready', result: { sample: 'http://169.254.169.254/latest' } }], plik);
    await expect(new GeneratorBfl('k', zlyWynik.f, odrazu).generuj(zlecenie())).rejects.toMatchObject({ kod: 'blad' });
    expect(zlyWynik.wywolania.some((w) => w.url.includes('169.254'))).toBe(false);
  });
});

describe('GeneratorOpenAi', () => {
  it('gpt-image-1: jedno zlecenie z n i rozmiarem z proporcji, Bearer z AI_API_KEY, wynik z b64_json', async () => {
    const plik = await jpeg();
    const f = vi.fn(async () => json({ data: [{ b64_json: plik.toString('base64') }, { b64_json: plik.toString('base64') }] })) as unknown as Fetch;
    const w = await new GeneratorOpenAi('sk-test', f).generuj(zlecenie({ ile: 2, model: 'gpt-image-1', proporcje: '4:5' }));
    expect(w.obrazy).toHaveLength(2);
    expect(w.obrazy[1]!.dane.equals(plik)).toBe(true);
    expect(w.rozliczone).toBe(2);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'gpt-image-1', n: 2, size: '1024x1536' });
    expect(JSON.parse(String(init.body))).not.toHaveProperty('response_format');
    expect([rozmiarOpenAi('16:9'), rozmiarOpenAi('1:1'), rozmiarOpenAi('3:4')]).toEqual(['1536x1024', '1024x1024', '1024x1536']);
  });

  it('moderacja (400 moderation_blocked) → „moderacja”; 500 → „blad”; brak klucza → wyłączony', async () => {
    const mod = vi.fn(async () => json({ error: { code: 'moderation_blocked', type: 'image_generation_user_error', message: 'x' } }, 400)) as unknown as Fetch;
    await expect(new GeneratorOpenAi('sk', mod).generuj(zlecenie({ model: 'gpt-image-1' }))).rejects.toMatchObject({ kod: 'moderacja', rozliczone: 0 });
    const zle = vi.fn(async () => json({ error: { message: 'x' } }, 500)) as unknown as Fetch;
    await expect(new GeneratorOpenAi('sk', zle).generuj(zlecenie({ model: 'gpt-image-1' }))).rejects.toMatchObject({ kod: 'blad' });
    expect(new GeneratorOpenAi(undefined).wlaczony()).toBe(false);
    await expect(new GeneratorOpenAi(undefined).generuj(zlecenie())).rejects.toMatchObject({ kod: 'wylaczony' });
  });

  it('dall-e-3: osobne zlecenia n=1 z response_format b64_json', async () => {
    const plik = await jpeg();
    const f = vi.fn(async () => json({ data: [{ b64_json: plik.toString('base64') }] })) as unknown as Fetch;
    const w = await new GeneratorOpenAi('sk', f).generuj(zlecenie({ ile: 2, model: 'dall-e-3', proporcje: '16:9' }));
    expect(w.obrazy).toHaveLength(2);
    const ciala = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>);
    expect(ciala).toHaveLength(2);
    expect(ciala[0]).toMatchObject({ n: 1, response_format: 'b64_json', size: '1792x1024' });
  });
});
