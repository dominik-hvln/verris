import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type DostawcaAi,
  type KonfiguracjaAi,
  type PoziomAi,
  kosztUsd,
  odczytajKonfiguracjeAi,
} from './ai-modele.js';

/** Klucz ustawienia platformy z konfiguracją AI (JSON, edycja: admin → Ustawienia → Asystent AI). */
export const KLUCZ_KONFIGURACJI_AI = 'ai.konfiguracja';

/** Funkcje uruchamiane przez klienta — liczą się do jego miesięcznego limitu kosztu AI. */
export const FUNKCJE_KLIENTA_AI = ['chatbot_client', 'service_forecast'];

export interface WynikAi<T> {
  wynik: T;
  dostawca: DostawcaAi;
  model: string;
  wej: number;
  wyj: number;
  kosztUsd: number;
}

type Wiadomosc = { role: 'user' | 'assistant'; content: string };

/**
 * Dane z zewnątrz — kształt deklarujemy jawnie, wszystko opcjonalne (dostawca może zwrócić cokolwiek).
 * OpenAI: chat/completions; Anthropic: Messages API (platform.claude.com/docs/en/api/messages).
 */
interface OdpowiedzOpenAi {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  data?: { embedding: number[] }[];
  error?: unknown;
}
interface OdpowiedzAnthropic {
  content?: Array<{ type?: string; text?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: unknown;
}

@Injectable()
export class AiProviderService {
  private konf: KonfiguracjaAi | null = null;
  private konfAt = 0;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  get embedModel() {
    return this.config.get<string>('AI_EMBED_MODEL') ?? 'text-embedding-3-small';
  }

  /** Konfiguracja poziomów z ustawień platformy (cache 30 s); bez bazy — wartości domyślne. */
  async konfiguracja(): Promise<KonfiguracjaAi> {
    if (this.konf && Date.now() - this.konfAt < 30_000) return this.konf;
    const row = await this.prisma?.platformSetting
      .findUnique({ where: { key: KLUCZ_KONFIGURACJI_AI } })
      .catch(() => null);
    this.konf = odczytajKonfiguracjeAi(row?.value);
    this.konfAt = Date.now();
    return this.konf;
  }

  wyczyscCache() {
    this.konf = null;
  }

  klucz(dostawca: DostawcaAi): string | undefined {
    return this.config.get<string>(dostawca === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'AI_API_KEY') || undefined;
  }

  /** Jakikolwiek dostawca skonfigurowany (status dla paneli). */
  isConfigured(): boolean {
    return Boolean(this.klucz('openai') || this.klucz('anthropic'));
  }

  /** Embeddings (RAG) zawsze u OpenAI — Anthropic nie ma API embeddingów. Bez klucza: RAG po słowach. */
  embeddingsEnabled(): boolean {
    return Boolean(this.klucz('openai')) && this.config.get<string>('AI_EMBED_DISABLED') !== 'true';
  }

  async opis(poziom: PoziomAi) {
    return (await this.konfiguracja())[poziom];
  }

  async dostepny(poziom: PoziomAi): Promise<boolean> {
    return Boolean(this.klucz((await this.opis(poziom)).dostawca));
  }

  /** Koszt AI konta klienta w bieżącym miesiącu (tylko funkcje klienta, nie praca obsługi). */
  async zuzycieKlientaUsd(userId: string): Promise<number> {
    if (!this.prisma) return 0;
    const teraz = new Date();
    const agg = await this.prisma.aiInteractionLog.aggregate({
      where: {
        userId,
        feature: { in: FUNKCJE_KLIENTA_AI },
        createdAt: { gte: new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), 1)) },
      },
      _sum: { costUsd: true },
    });
    return Number(agg._sum.costUsd ?? 0);
  }

  /** null = mieści się w limicie; tekst = powód odmowy (pokazywany klientowi). */
  async przekroczonyLimitKlienta(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const { limitKlientaUsd } = await this.konfiguracja();
    if (limitKlientaUsd <= 0) return null;
    if ((await this.zuzycieKlientaUsd(userId)) < limitKlientaUsd) return null;
    return 'Wykorzystano miesięczny limit asystenta AI dla tego konta. Odnowi się 1. dnia miesiąca — do tego czasu chętnie pomożemy w zgłoszeniu.';
  }

  /** Swobodna odpowiedź (czat). Domyślnie poziom SZYBKI. */
  async chat(
    input: { system: string; messages: Wiadomosc[]; maxTokens?: number },
    poziom: PoziomAi = 'szybki',
  ): Promise<WynikAi<string>> {
    return this.wywolaj(poziom, input.system, input.messages, false, input.maxTokens);
  }

  /** Odpowiedź w JSON (prognozy, szkice). Domyślnie poziom ANALIZA. */
  async complete(input: { system: string; user: string }, poziom: PoziomAi = 'analiza'): Promise<WynikAi<unknown>> {
    const r = await this.wywolaj(poziom, input.system, [{ role: 'user', content: input.user }], true);
    return { ...r, wynik: JSON.parse(bezPlotkow(r.wynik)) as unknown };
  }

  private async wywolaj(
    poziom: PoziomAi,
    system: string,
    messages: Wiadomosc[],
    json: boolean,
    maxTokens?: number,
  ): Promise<WynikAi<string>> {
    const konf = await this.konfiguracja();
    const { dostawca, model } = konf[poziom];
    const key = this.klucz(dostawca);
    if (!key) throw new ServiceUnavailableException('AI provider is not configured.');
    const r =
      dostawca === 'anthropic'
        ? await this.anthropic(key, model, system, messages, json, maxTokens ?? (poziom === 'szybki' ? 2000 : 8000))
        : await this.openai(key, model, system, messages, json, maxTokens ?? (poziom === 'szybki' ? 700 : 4000));
    return { ...r, dostawca, model, kosztUsd: kosztUsd(konf, model, r.wej, r.wyj) };
  }

  private async openai(
    key: string,
    model: string,
    system: string,
    messages: Wiadomosc[],
    json: boolean,
    maxTokens: number,
  ) {
    const baseUrl = this.config.get<string>('AI_API_BASE_URL') ?? 'https://api.openai.com/v1';
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        ...parametryOpenAi(model, json ? 0.2 : 0.3, maxTokens),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });
    const body = (await res.json().catch(() => null)) as OdpowiedzOpenAi | null;
    if (!res.ok) throw blad(body, res.status);
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new ServiceUnavailableException('AI provider returned an empty response.');
    return { wynik: content, wej: body?.usage?.prompt_tokens ?? 0, wyj: body?.usage?.completion_tokens ?? 0 };
  }

  /**
   * Anthropic Messages API. Bez temperature: Claude Sonnet 5 odrzuca niestandardowe temperature/top_p/top_k (400),
   * a adaptacyjne myślenie jest domyślnie włączone — stąd większy max_tokens niż u OpenAI.
   */
  private async anthropic(
    key: string,
    model: string,
    system: string,
    messages: Wiadomosc[],
    json: boolean,
    maxTokens: number,
  ) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: json ? `${system}\nOdpowiedz wyłącznie poprawnym obiektem JSON, bez komentarzy i bez bloków kodu.` : system,
        messages,
      }),
    });
    const body = (await res.json().catch(() => null)) as OdpowiedzAnthropic | null;
    if (!res.ok) throw blad(body, res.status);
    const tekst = (body?.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('');
    if (!tekst) throw new ServiceUnavailableException('AI provider returned an empty response.');
    return { wynik: tekst, wej: body?.usage?.input_tokens ?? 0, wyj: body?.usage?.output_tokens ?? 0 };
  }

  /** Wektory do RAG (OpenAI /embeddings). */
  async embed(inputs: string[]): Promise<number[][]> {
    const key = this.klucz('openai');
    if (!key) throw new ServiceUnavailableException('AI provider is not configured.');
    if (inputs.length === 0) return [];
    const baseUrl = this.config.get<string>('AI_API_BASE_URL') ?? 'https://api.openai.com/v1';
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embedModel, input: inputs }),
    });
    const body = (await res.json().catch(() => null)) as OdpowiedzOpenAi | null;
    if (!res.ok) throw blad(body, res.status);
    return (body?.data ?? []).map((d) => d.embedding);
  }
}

/**
 * Modele z rozumowaniem (OpenAI gpt-5*, o*) przyjmują `max_completion_tokens` i `reasoning_effort` zamiast
 * `max_tokens`/`temperature`. `none` — bez tokenów rozumowania: tanio i szybko (gpt-5.6-luna: none…max).
 */
export function parametryOpenAi(model: string, temperature: number, maxTokens: number): Record<string, unknown> {
  if (/^(gpt-5|o\d)/.test(model)) return { reasoning_effort: 'none', max_completion_tokens: maxTokens };
  return { temperature, max_tokens: maxTokens };
}

function blad(body: { error?: unknown } | null, status: number) {
  return new ServiceUnavailableException(body?.error ? JSON.stringify(body.error).slice(0, 500) : `AI provider ${status}`);
}

/** Model czasem owija JSON w ```json … ``` mimo instrukcji. */
function bezPlotkow(t: string): string {
  const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(t);
  return m ? m[1] : t;
}
