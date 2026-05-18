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
});
