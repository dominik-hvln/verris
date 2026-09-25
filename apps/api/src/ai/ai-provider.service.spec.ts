import { ServiceUnavailableException } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';

describe('AiProviderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('fails closed when AI_API_KEY is not configured', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'AI_API_KEY') return undefined;
        if (key === 'AI_API_BASE_URL') return 'https://api.openai.com/v1';
        return undefined;
      }),
    };
    const service = new AiProviderService(config as never);

    await expect(service.complete({ system: 'Return JSON', user: '{}' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requests JSON chat completions from an OpenAI-compatible provider', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          AI_API_KEY: 'sk-test',
          AI_API_BASE_URL: 'https://ai.example.com/v1',
          AI_MODEL: 'model-live',
        };
        return values[key];
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"draft":"ok"}' } }] }),
    });
    const service = new AiProviderService(config as never);

    await expect(service.complete({ system: 'Return JSON', user: '{}' })).resolves.toEqual({ draft: 'ok' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://ai.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });

  it.each([
    ['gpt-5.6-luna', { reasoning_effort: 'none', max_completion_tokens: 700 }, ['temperature', 'max_tokens']],
    ['mistral-small-latest', { temperature: 0.3, max_tokens: 700 }, ['reasoning_effort', 'max_completion_tokens']],
  ])('%s: parametry generowania zgodne z modelem', async (model, maja, brak) => {
    const wartosci: Record<string, string> = { AI_API_KEY: 'sk-test', AI_MODEL: model };
    const config = { get: jest.fn((k: string) => wartosci[k]) };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
    const service = new AiProviderService(config as never);
    await service.chat({ system: 's', messages: [{ role: 'user', content: 'u' }] });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls.at(-1)[1].body);
    expect(body).toMatchObject(maja);
    for (const k of brak) expect(body).not.toHaveProperty(k);
  });
});
