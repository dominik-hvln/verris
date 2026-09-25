import { ServiceUnavailableException } from '@nestjs/common';
import { AiProviderService, parametryOpenAi } from './ai-provider.service';
import { DOMYSLNA_KONFIGURACJA_AI, kosztUsd, odczytajKonfiguracjeAi } from './ai-modele';

const konfig = (w: Record<string, string>) => ({ get: jest.fn((k: string) => w[k]) });
const odp = (body: unknown) => ({ ok: true, json: async () => body });
const wyslane = () => JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string) as Record<string, unknown>;

describe('AiProviderService — dwa poziomy (L-11)', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('bez klucza dostawcy poziomu: odmowa i zero ruchu sieciowego', async () => {
    const s = new AiProviderService(konfig({ AI_API_KEY: 'sk-test' }) as never);
    // analiza domyślnie = Anthropic, a klucza Anthropic brak
    await expect(s.complete({ system: 'x', user: '{}' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await s.dostepny('analiza')).toBe(false);
    expect(await s.dostepny('szybki')).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('szybki = OpenAI gpt-5.6-luna: parametry rozumowania, tokeny i koszt z usage', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      odp({ choices: [{ message: { content: 'cześć' } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }),
    );
    const s = new AiProviderService(konfig({ AI_API_KEY: 'sk-test', AI_API_BASE_URL: 'https://ai.example.com/v1' }) as never);
    const r = await s.chat({ system: 's', messages: [{ role: 'user', content: 'hej' }] });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://ai.example.com/v1/chat/completions');
    expect(wyslane()).toMatchObject({ model: 'gpt-5.6-luna', reasoning_effort: 'none', max_completion_tokens: 700 });
    expect(wyslane()).not.toHaveProperty('temperature');
    expect(r).toMatchObject({ wynik: 'cześć', dostawca: 'openai', model: 'gpt-5.6-luna', wej: 1000, wyj: 100 });
    expect(r.kosztUsd).toBeCloseTo((1000 * 0.2 + 100 * 1.2) / 1e6, 12);
  });

  it('analiza = Anthropic Sonnet 5: Messages API, bez temperature, JSON także w bloku ```', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      odp({
        content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: '```json\n{"ok":true}\n```' }],
        usage: { input_tokens: 1000, output_tokens: 500 },
      }),
    );
    const s = new AiProviderService(konfig({ ANTHROPIC_API_KEY: 'sk-ant' }) as never);
    const r = await s.complete({ system: 'Zwróć JSON', user: '{}' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-ant', 'anthropic-version': '2023-06-01' });
    expect(wyslane()).toMatchObject({ model: 'claude-sonnet-5', max_tokens: 8000 });
    expect(wyslane()).not.toHaveProperty('temperature');
    expect(r.wynik).toEqual({ ok: true });
    expect(r.kosztUsd).toBeCloseTo((1000 * 2 + 500 * 10) / 1e6, 12);
  });

  it('model z ustawień admina zastępuje domyślny (nowsza wersja = zmiana ustawienia, nie kodu)', async () => {
    const prisma = {
      platformSetting: {
        findUnique: jest.fn(async () => ({ value: JSON.stringify({ szybki: { dostawca: 'anthropic', model: 'claude-haiku-4-5-20251001' } }) })),
      },
    };
    (global.fetch as jest.Mock).mockResolvedValue(odp({ content: [{ type: 'text', text: 'ok' }], usage: {} }));
    const s = new AiProviderService(konfig({ ANTHROPIC_API_KEY: 'sk-ant' }) as never, prisma as never);
    const r = await s.chat({ system: 's', messages: [{ role: 'user', content: 'x' }] });
    expect(r).toMatchObject({ dostawca: 'anthropic', model: 'claude-haiku-4-5-20251001' });
  });

  it('limit klienta: odmowa po przekroczeniu, 0 = bez limitu; liczone tylko funkcje klienta w bieżącym miesiącu', async () => {
    const aggregate = jest.fn(async () => ({ _sum: { costUsd: 2.5 } }));
    const findUnique = jest.fn(async () => ({ value: JSON.stringify({ limitKlientaUsd: 2 }) }));
    const s = new AiProviderService(konfig({}) as never, { platformSetting: { findUnique }, aiInteractionLog: { aggregate } } as never);
    expect(await s.przekroczonyLimitKlienta('u1')).toMatch(/limit/);
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', feature: { in: ['chatbot_client', 'service_forecast'] } }) }),
    );
    findUnique.mockResolvedValueOnce({ value: JSON.stringify({ limitKlientaUsd: 0 }) });
    s.wyczyscCache();
    expect(await s.przekroczonyLimitKlienta('u1')).toBeNull();
    expect(await s.przekroczonyLimitKlienta(null)).toBeNull();
  });

  it('parametry OpenAI: modele bez rozumowania dostają temperature i max_tokens', () => {
    expect(parametryOpenAi('mistral-small-latest', 0.3, 700)).toEqual({ temperature: 0.3, max_tokens: 700 });
    expect(parametryOpenAi('o4-mini', 0.3, 700)).toEqual({ reasoning_effort: 'none', max_completion_tokens: 700 });
  });

  it('konfiguracja z bazy: śmieci i wstrzyknięcia wracają do wartości domyślnych', () => {
    const k = odczytajKonfiguracjeAi(
      JSON.stringify({
        szybki: { dostawca: 'evil', model: 'x; rm -rf /' },
        limitKlientaUsd: -5,
        ceny: { 'nowy-model': { wej: 1, wyj: 2 }, 'zly model': { wej: 1, wyj: 1 }, drogi: { wej: 5000, wyj: 1 } },
      }),
    );
    expect(k.szybki).toEqual(DOMYSLNA_KONFIGURACJA_AI.szybki);
    expect(k.limitKlientaUsd).toBe(DOMYSLNA_KONFIGURACJA_AI.limitKlientaUsd);
    expect(k.ceny['nowy-model']).toEqual({ wej: 1, wyj: 2 });
    expect(k.ceny).not.toHaveProperty('zly model');
    expect(k.ceny).not.toHaveProperty('drogi');
    expect(odczytajKonfiguracjeAi('{nie json')).toEqual(DOMYSLNA_KONFIGURACJA_AI);
    // model bez ceny liczony drożej niż najdroższy znany — limit nie przepuści nieznanego kosztu
    expect(kosztUsd(k, 'nieznany', 1e6, 0)).toBeGreaterThan(4);
  });
});
