import type { Mock } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { AiProviderService, sprawdzBlokiCache, uzycieZOdpowiedzi } from './ai-provider.service.js';
import { DOMYSLNA_KONFIGURACJA_AI, kosztZCacheUsd, mnoznikOdczytuCache } from './ai-modele.js';

/**
 * Paczka 119 – wywołanie Anthropic z blokami systemu i prompt caching (kreator stron).
 * Format i ceny: platform.claude.com/docs/en/build-with-claude/prompt-caching.
 */
const konfig = (w: Record<string, string>) => ({ get: vi.fn((k: string) => w[k]) });
const odp = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
const wyslane = () => JSON.parse((global.fetch as Mock).mock.calls[0][1].body as string) as Record<string, unknown>;

function prismaAtrapa(konf: object = {}) {
  return {
    platformSetting: { findUnique: vi.fn(async () => ({ value: JSON.stringify(konf) })) },
    aiInteractionLog: { aggregate: vi.fn(async () => ({ _sum: { costUsd: 0 } })), create: vi.fn(async () => ({})) },
    user: { findMany: vi.fn(async () => []) },
  };
}

const BLOKI = [
  { tekst: 'MASTER PROMPT', cache: '1h' as const },
  { tekst: 'KATALOG', cache: '5m' as const },
  { tekst: 'zmienne', cache: null },
];

describe('anthropicZBlokami – prompt caching', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  it('system jako tablica bloków: cache_control z TTL tylko na blokach z punktem cache, bez nagłówka beta', async () => {
    (global.fetch as Mock).mockResolvedValue(odp({ content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn' }));
    const s = new AiProviderService(konfig({ ANTHROPIC_API_KEY: 'sk-ant' }) as never, prismaAtrapa() as never);
    const r = await s.anthropicZBlokami({
      model: 'claude-sonnet-5-5',
      system: BLOKI,
      wiadomosci: [{ role: 'user', content: 'brief' }],
      maxTokens: 16000,
      funkcja: 'kreator',
      userId: 'u1',
    });
    const [url, init] = (global.fetch as Mock).mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toEqual({ 'x-api-key': 'sk-ant', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
    expect(wyslane()).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 16000,
      system: [
        { type: 'text', text: 'MASTER PROMPT', cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: 'KATALOG', cache_control: { type: 'ephemeral', ttl: '5m' } },
        { type: 'text', text: 'zmienne' },
      ],
      messages: [{ role: 'user', content: 'brief' }],
    });
    expect(r).toMatchObject({ wynik: '{}', dostawca: 'anthropic', powodKonca: 'end_turn' });
  });

  it('koszt: wejście poza cache × cena, zapis 1 h × 2, zapis 5 min × 1,25, odczyt × 0,05 (Sonnet 5.5); wpis w dzienniku AI', async () => {
    (global.fetch as Mock).mockResolvedValue(
      odp({
        content: [{ type: 'text', text: 'ok' }],
        usage: {
          input_tokens: 1000,
          output_tokens: 2000,
          cache_read_input_tokens: 10_000,
          cache_creation_input_tokens: 3000,
          cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
        },
      }),
    );
    const prisma = prismaAtrapa();
    const s = new AiProviderService(konfig({ ANTHROPIC_API_KEY: 'sk-ant' }) as never, prisma as never);
    const r = await s.anthropicZBlokami({ model: 'claude-sonnet-5-5', system: BLOKI, wiadomosci: [{ role: 'user', content: 'x' }], maxTokens: 100, funkcja: 'kreator', userId: 'u1', rodzaj: 'generacja-lite' });
    // Sonnet 5.5: wejście 2 USD, wyjście 10 USD za 1 mln.
    const oczekiwany = (1000 * 2 + 2000 * 2 * 2 + 1000 * 2 * 1.25 + 10_000 * 2 * 0.05 + 2000 * 10) / 1e6;
    expect(r.kosztUsd).toBeCloseTo(oczekiwany, 12);
    expect(r).toMatchObject({ wej: 1000, wyj: 2000, zapis1h: 2000, zapis5m: 1000, odczyt: 10_000 });
    expect(prisma.aiInteractionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        feature: 'kreator',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        userId: 'u1',
        status: 'COMPLETED',
        inputTokens: 14_000,
        outputTokens: 2000,
        costUsd: r.kosztUsd,
        inputSummary: { rodzaj: 'generacja-lite', wejPozaCache: 1000, zapis5m: 1000, zapis1h: 2000, odczyt: 10_000 },
      }),
    });
  });

  it('bez rozbicia cache_creation: zapis liczony wg TTL bloków (1 h, jeśli jest blok 1 h)', () => {
    expect(uzycieZOdpowiedzi({ input_tokens: 5, cache_creation_input_tokens: 800 }, BLOKI)).toMatchObject({ zapis1h: 800, zapis5m: 0 });
    expect(uzycieZOdpowiedzi({ cache_creation_input_tokens: 800 }, [{ tekst: 'a', cache: '5m' }])).toMatchObject({ zapis1h: 0, zapis5m: 800 });
  });

  it('mnożnik odczytu: 0,05 dla Opus/Sonnet 5.5, 0,025 dla Fable/Mythos 5.1, 0,1 dla reszty', () => {
    expect(mnoznikOdczytuCache('claude-sonnet-5-5')).toBe(0.05);
    expect(mnoznikOdczytuCache('claude-opus-5-5')).toBe(0.05);
    expect(mnoznikOdczytuCache('claude-mythos-5-1')).toBe(0.025);
    expect(mnoznikOdczytuCache('claude-sonnet-5')).toBe(0.1);
    expect(mnoznikOdczytuCache('claude-haiku-4-5-20251001')).toBe(0.1);
    // Haiku 4.5: 1 USD wejście → odczyt 0,10 USD / 1 mln (tabela cen w dokumentacji).
    expect(kosztZCacheUsd(DOMYSLNA_KONFIGURACJA_AI, 'claude-haiku-4-5-20251001', { wej: 0, wyj: 0, zapis5m: 0, zapis1h: 0, odczyt: 1_000_000 })).toBeCloseTo(0.1, 12);
  });

  it('kolejność TTL i liczba punktów: 1 h po 5 min albo 5 punktów → błąd przed wysłaniem', async () => {
    expect(() => sprawdzBlokiCache([{ tekst: 'a', cache: '5m' }, { tekst: 'b', cache: '1h' }])).toThrow(/1 h po bloku 5 min/);
    expect(() => sprawdzBlokiCache(Array.from({ length: 5 }, () => ({ tekst: 'a', cache: '5m' as const })))).toThrow(/punktów cache/);
    const s = new AiProviderService(konfig({ ANTHROPIC_API_KEY: 'sk-ant' }) as never, prismaAtrapa() as never);
    await expect(
      s.anthropicZBlokami({ model: 'claude-sonnet-5-5', system: [{ tekst: 'a', cache: '5m' }, { tekst: 'b', cache: '1h' }], wiadomosci: [], maxTokens: 1, funkcja: 'kreator', userId: null }),
    ).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('budżet platformy wyczerpany → 503 bez wywołania; błąd dostawcy → wpis FAILED w dzienniku', async () => {
    const prisma = prismaAtrapa({ limitPlatformyUsd: 1 });
    prisma.aiInteractionLog.aggregate.mockResolvedValueOnce({ _sum: { costUsd: 5 } });
    const s = new AiProviderService(konfig({ ANTHROPIC_API_KEY: 'sk-ant' }) as never, prisma as never);
    const wej = { model: 'claude-sonnet-5-5', system: BLOKI, wiadomosci: [{ role: 'user' as const, content: 'x' }], maxTokens: 1, funkcja: 'kreator', userId: 'u1' };
    await expect(s.anthropicZBlokami(wej)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(global.fetch).not.toHaveBeenCalled();

    (global.fetch as Mock).mockResolvedValue(odp({ error: { type: 'overloaded_error' } }, false, 529));
    await expect(s.anthropicZBlokami(wej)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.aiInteractionLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ feature: 'kreator', status: 'FAILED' }) });
  });
});
