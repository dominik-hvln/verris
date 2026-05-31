import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiProviderService {
  constructor(private readonly config: ConfigService) {}

  get provider() {
    return this.config.get<string>('AI_PROVIDER') ?? 'openai-compatible';
  }

  get model() {
    return this.config.get<string>('AI_MODEL') ?? 'gpt-4o-mini';
  }

  get embedModel() {
    return this.config.get<string>('AI_EMBED_MODEL') ?? 'text-embedding-3-small';
  }

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('AI_API_KEY'));
  }

  /** Embeddings are optional — when no model/key is set, RAG falls back to keyword scoring. */
  embeddingsEnabled(): boolean {
    return this.isConfigured() && this.config.get<string>('AI_EMBED_DISABLED') !== 'true';
  }

  /**
   * Free-text chat completion (no forced JSON) for the conversational assistant.
   * Accepts a short message history so the chatbot can hold context.
   */
  async chat(input: {
    system: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const baseUrl = this.config.get<string>('AI_API_BASE_URL') ?? 'https://api.openai.com/v1';
    const key = this.config.get<string>('AI_API_KEY');
    if (!key) {
      throw new ServiceUnavailableException('AI provider is not configured.');
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: input.temperature ?? 0.3,
        max_tokens: input.maxTokens ?? 700,
        messages: [{ role: 'system', content: input.system }, ...input.messages],
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ServiceUnavailableException(
        body && typeof body === 'object' && 'error' in body
          ? JSON.stringify((body as { error: unknown }).error)
          : `AI provider ${response.status}`,
      );
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new ServiceUnavailableException('AI provider returned an empty response.');
    }
    return content;
  }

  /** Returns an embedding vector for each input string (OpenAI-compatible /embeddings). */
  async embed(inputs: string[]): Promise<number[][]> {
    const baseUrl = this.config.get<string>('AI_API_BASE_URL') ?? 'https://api.openai.com/v1';
    const key = this.config.get<string>('AI_API_KEY');
    if (!key) {
      throw new ServiceUnavailableException('AI provider is not configured.');
    }
    if (inputs.length === 0) return [];
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.embedModel, input: inputs }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ServiceUnavailableException(
        body && typeof body === 'object' && 'error' in body
          ? JSON.stringify((body as { error: unknown }).error)
          : `AI embeddings ${response.status}`,
      );
    }
    const data = (body as { data?: { embedding: number[] }[] })?.data ?? [];
    return data.map((d) => d.embedding);
  }

  async complete(input: { system: string; user: string; temperature?: number }) {
    const baseUrl = this.config.get<string>('AI_API_BASE_URL') ?? 'https://api.openai.com/v1';
    const key = this.config.get<string>('AI_API_KEY');
    if (!key) {
      throw new ServiceUnavailableException('AI provider is not configured.');
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: input.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ServiceUnavailableException(
        body && typeof body === 'object' && 'error' in body
          ? JSON.stringify(body.error)
          : `AI provider ${response.status}`,
      );
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new ServiceUnavailableException('AI provider returned an empty response.');
    }
    return JSON.parse(content) as unknown;
  }
}
