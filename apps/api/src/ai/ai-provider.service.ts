import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiInteractionStatus, type Prisma } from '@verris/database';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  type DostawcaAi,
  type KonfiguracjaAi,
  type PoziomAi,
  type UzycieZCache,
  kosztUsd,
  kosztZCacheUsd,
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
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
  };
  stop_reason?: string;
  error?: unknown;
}

/**
 * Blok promptu systemowego z punktem cache (prompt caching). Kształt zgodny z `BlokSystemu` z @verris/kreator
 * (ai/kontrakt.ts) – zdefiniowany tu, żeby dostawca AI nie zależał od kreatora.
 */
export interface BlokSystemuAi {
  tekst: string;
  cache: '1h' | '5m' | null;
}

/** Wynik wywołania z cache: `wej` = tokeny poza cache, zapis rozbity na TTL, odczyt z cache. */
export interface WynikAiZCache extends WynikAi<string>, Omit<UzycieZCache, 'wej' | 'wyj'> {
  /** stop_reason z Messages API (np. 'max_tokens' = odpowiedź ucięta). */
  powodKonca: string | null;
}

/** Limit punktów cache w jednym żądaniu (platform.claude.com/docs/en/build-with-claude/prompt-caching). */
const MAKS_PUNKTOW_CACHE = 4;

/**
 * Sprawdza bloki przed wysłaniem: najwyżej 4 punkty cache, a wpisy 1 h przed 5 min („Cache entries with longer TTL
 * must appear before shorter TTLs” – sekcja Mixing different TTLs). Błąd programisty, nie klienta – rzuca Error.
 */
export function sprawdzBlokiCache(bloki: BlokSystemuAi[]): void {
  const punkty = bloki.filter((b) => b.cache !== null);
  if (punkty.length > MAKS_PUNKTOW_CACHE) throw new Error(`Za dużo punktów cache: ${punkty.length} (maks. ${MAKS_PUNKTOW_CACHE}).`);
  const pierwszy5m = punkty.findIndex((b) => b.cache === '5m');
  if (pierwszy5m >= 0 && punkty.slice(pierwszy5m).some((b) => b.cache === '1h')) {
    throw new Error('Blok cache 1 h po bloku 5 min – API Anthropic wymaga kolejności od dłuższego TTL.');
  }
}

/** Bloki systemu w formacie Messages API: `cache_control` tylko na blokach z punktem cache. */
export function blokiSystemuAnthropic(bloki: BlokSystemuAi[]) {
  return bloki.map((b) =>
    b.cache
      ? { type: 'text' as const, text: b.tekst, cache_control: { type: 'ephemeral' as const, ttl: b.cache } }
      : { type: 'text' as const, text: b.tekst },
  );
}

/**
 * Rozbicie zapisu cache po TTL: z `usage.cache_creation` (ephemeral_5m/1h_input_tokens); gdy go brak – całość wg TTL
 * bloków żądania (przy mieszanych TTL po droższym 1 h – lepiej przeszacować koszt niż go zaniżyć).
 */
export function uzycieZOdpowiedzi(usage: OdpowiedzAnthropic['usage'], bloki: BlokSystemuAi[]): UzycieZCache {
  const zapis = usage?.cache_creation_input_tokens ?? 0;
  let zapis5m: number;
  let zapis1h: number;
  if (usage?.cache_creation) {
    zapis5m = usage.cache_creation.ephemeral_5m_input_tokens ?? 0;
    zapis1h = usage.cache_creation.ephemeral_1h_input_tokens ?? 0;
  } else if (bloki.some((b) => b.cache === '1h')) {
    zapis5m = 0;
    zapis1h = zapis;
  } else {
    zapis5m = zapis;
    zapis1h = 0;
  }
  return {
    wej: usage?.input_tokens ?? 0,
    wyj: usage?.output_tokens ?? 0,
    zapis5m,
    zapis1h,
    odczyt: usage?.cache_read_input_tokens ?? 0,
  };
}

@Injectable()
export class AiProviderService {
  private konf: KonfiguracjaAi | null = null;
  private konfAt = 0;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
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

  /**
   * Beta wewnętrzna (decyzja 2026-10-04): AI_TYLKO_KONTA = e-maile kont testowych po przecinku. Dopóki dokumenty
   * z OpenAI/Anthropic jako podprocesorami (PB-03) nie są opublikowane, dane innych klientów nie idą do AI.
   * Decyzja 5 (2026-11-03): przełącznik „Asystent dla wszystkich klientów” w adminie (Ustawienia → Asystent AI)
   * wyłącza tę listę bez zmian w .env. Pusta lista = AI dla wszystkich. null = wolno; tekst = powód odmowy.
   */
  async kontoPozaTestemAi(userId: string | null | undefined): Promise<string | null> {
    const lista = this.kontaTestoweAi();
    if (!lista.length) return null;
    if ((await this.konfiguracja()).dlaWszystkichKlientow) return null;
    const email = userId
      ? await this.prisma?.user.findUnique({ where: { id: userId }, select: { email: true } }).then((u) => u?.email?.toLowerCase())
      : undefined;
    return email && lista.includes(email)
      ? null
      : 'Asystent AI jest jeszcze w testach – wkrótce będzie dostępny na każdym koncie. Do tego czasu chętnie pomożemy w zgłoszeniu.';
  }

  /** E-maile z AI_TYLKO_KONTA (małe litery); pusta lista = brak ograniczenia z env. */
  kontaTestoweAi(): string[] {
    return (this.config.get<string>('AI_TYLKO_KONTA') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  /** null = mieści się w limicie; tekst = powód odmowy (pokazywany klientowi). */
  async przekroczonyLimitKlienta(userId: string | null | undefined): Promise<string | null> {
    const poza = await this.kontoPozaTestemAi(userId);
    if (poza) return poza;
    if (!userId) return null;
    const { limitKlientaUsd } = await this.konfiguracja();
    if (limitKlientaUsd <= 0) return null;
    if ((await this.zuzycieKlientaUsd(userId)) < limitKlientaUsd) return null;
    return 'Wykorzystano miesięczny limit asystenta AI dla tego konta. Odnowi się 1. dnia miesiąca – do tego czasu chętnie pomożemy w zgłoszeniu.';
  }

  /** Bezpiecznik kosztów (decyzja 2026-10-05): suma wszystkich wywołań w miesiącu ≥ limit platformy → AI stoi. */
  private async budzetPlatformyWyczerpany(konf: KonfiguracjaAi): Promise<boolean> {
    if (!this.prisma || konf.limitPlatformyUsd <= 0) return false;
    const teraz = new Date();
    const agg = await this.prisma.aiInteractionLog.aggregate({
      where: { createdAt: { gte: new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), 1)) } },
      _sum: { costUsd: true },
    });
    if (Number(agg._sum.costUsd ?? 0) < konf.limitPlatformyUsd) return false;
    const admini = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    for (const a of admini) {
      await this.notifications?.create({
        userId: a.id,
        category: 'SYSTEM',
        severity: 'warning',
        title: 'Budżet AI platformy wykorzystany',
        body: `Koszt AI w tym miesiącu osiągnął limit ${konf.limitPlatformyUsd} USD – asystent, prognozy i szkice są wyłączone do 1. dnia miesiąca albo do podniesienia limitu.`,
        link: '/settings/ai',
        dedupeKey: 'ai-budzet-platformy',
        dedupeWindowMin: 24 * 60,
      });
    }
    return true;
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

  /**
   * Wywołanie wskazanym modelem (asystent www ma własną konfigurację modeli — asystent-www/konfiguracja.ts).
   * Ten sam bezpiecznik budżetu platformy i ten sam cennik modeli co poziomy szybki/analiza.
   */
  async wywolajModelem(input: {
    dostawca: DostawcaAi;
    model: string;
    system: string;
    messages: Wiadomosc[];
    json: boolean;
    maxTokens: number;
  }): Promise<WynikAi<string>> {
    const konf = await this.konfiguracja();
    const key = this.klucz(input.dostawca);
    if (!key) throw new ServiceUnavailableException('AI provider is not configured.');
    if (await this.budzetPlatformyWyczerpany(konf)) {
      throw new ServiceUnavailableException('Asystent AI jest chwilowo niedostępny. Chętnie pomożemy w zgłoszeniu.');
    }
    const r =
      input.dostawca === 'anthropic'
        ? await this.anthropic(key, input.model, input.system, input.messages, input.json, input.maxTokens)
        : await this.openai(key, input.model, input.system, input.messages, input.json, input.maxTokens);
    return { ...r, dostawca: input.dostawca, model: input.model, kosztUsd: kosztUsd(konf, input.model, r.wej, r.wyj) };
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
    if (await this.budzetPlatformyWyczerpany(konf)) {
      throw new ServiceUnavailableException('Asystent AI jest chwilowo niedostępny. Chętnie pomożemy w zgłoszeniu.');
    }
    const r =
      dostawca === 'anthropic'
        ? await this.anthropic(key, model, system, messages, json, maxTokens ?? (poziom === 'szybki' ? 2000 : 8000))
        : await this.openai(key, model, system, messages, json, maxTokens ?? (poziom === 'szybki' ? 2000 : 4000));
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
   * Anthropic Messages API. Bez temperature: Claude Sonnet 5 odrzucał niestandardowe temperature/top_p/top_k (400),
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

  /**
   * Anthropic Messages API z promptem systemowym w blokach i prompt caching (kreator stron; tylko Anthropic –
   * decyzja właściciela 7.11.2026). Format: platform.claude.com/docs/en/build-with-claude/prompt-caching –
   * `system: [{ type: 'text', text, cache_control: { type: 'ephemeral', ttl: '1h' | '5m' } }]`, bez nagłówka beta.
   * Koszt: wejście poza cache × cena, zapis 1 h × 2, zapis 5 min × 1,25, odczyt × mnożnik modelu (0,1 albo mniej).
   * Ten sam bezpiecznik budżetu platformy co pozostałe wywołania; każde wywołanie (także nieudane) trafia do
   * AiInteractionLog z `funkcja` – raport kosztów w adminie i budżet platformy liczą je razem z resztą AI.
   */
  async anthropicZBlokami(input: {
    model: string;
    system: BlokSystemuAi[];
    wiadomosci: Wiadomosc[];
    maxTokens: number;
    funkcja: string;
    userId: string | null;
    actorUserId?: string | null;
    /** Do dziennika (np. 'generacja-pro'); bez treści promptu. */
    rodzaj?: string;
    timeoutMs?: number;
  }): Promise<WynikAiZCache> {
    sprawdzBlokiCache(input.system);
    const konf = await this.konfiguracja();
    const key = this.klucz('anthropic');
    if (!key) throw new ServiceUnavailableException('Kreator AI jest chwilowo niedostępny – spróbuj ponownie później.');
    if (await this.budzetPlatformyWyczerpany(konf)) {
      throw new ServiceUnavailableException('Kreator AI jest chwilowo niedostępny – spróbuj ponownie później.');
    }
    const promptHash = createHash('sha256')
      .update(JSON.stringify([input.funkcja, input.model, input.system.map((b) => b.tekst), input.wiadomosci]))
      .digest('hex');
    const dziennik = async (dane: Partial<Prisma.AiInteractionLogUncheckedCreateInput>) => {
      await this.prisma?.aiInteractionLog
        .create({
          data: {
            feature: input.funkcja,
            provider: 'anthropic',
            model: input.model,
            promptHash,
            userId: input.userId,
            actorUserId: input.actorUserId ?? input.userId,
            status: AiInteractionStatus.COMPLETED,
            ...dane,
          },
        })
        .catch(() => undefined);
    };
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: input.model,
          max_tokens: input.maxTokens,
          system: blokiSystemuAnthropic(input.system),
          messages: input.wiadomosci,
        }),
        signal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
      });
      const body = (await res.json().catch(() => null)) as OdpowiedzAnthropic | null;
      if (!res.ok) throw blad(body, res.status);
      const tekst = (body?.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('');
      const u = uzycieZOdpowiedzi(body?.usage, input.system);
      const koszt = kosztZCacheUsd(konf, input.model, u);
      await dziennik({
        inputTokens: u.wej + u.zapis5m + u.zapis1h + u.odczyt,
        outputTokens: u.wyj,
        costUsd: koszt,
        status: tekst ? AiInteractionStatus.COMPLETED : AiInteractionStatus.FAILED,
        inputSummary: { rodzaj: input.rodzaj ?? null, wejPozaCache: u.wej, zapis5m: u.zapis5m, zapis1h: u.zapis1h, odczyt: u.odczyt },
        ...(tekst ? {} : { errorMessage: 'Pusta odpowiedź' }),
      });
      if (!tekst) throw new ServiceUnavailableException('AI provider returned an empty response.');
      return {
        wynik: tekst,
        dostawca: 'anthropic',
        model: input.model,
        wej: u.wej,
        wyj: u.wyj,
        zapis5m: u.zapis5m,
        zapis1h: u.zapis1h,
        odczyt: u.odczyt,
        kosztUsd: koszt,
        powodKonca: body?.stop_reason ?? null,
      };
    } catch (e) {
      if (!(e instanceof ServiceUnavailableException && e.message === 'AI provider returned an empty response.')) {
        await dziennik({
          status: AiInteractionStatus.FAILED,
          inputSummary: { rodzaj: input.rodzaj ?? null },
          errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
        });
      }
      throw e;
    }
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
 * Modele z rozumowaniem (OpenAI gpt-5*, gpt-6*, o*) przyjmują `max_completion_tokens` i `reasoning_effort` zamiast
 * `max_tokens`/`temperature`. gpt-5*: `none` — tanio i szybko. gpt-6*: `low` — krótkie rozumowanie za ułamek grosza
 * (developers.openai.com/api/docs/models/gpt-6-luna: none…max, domyślnie medium).
 */
export function parametryOpenAi(model: string, temperature: number, maxTokens: number): Record<string, unknown> {
  if (/^gpt-[6-9]/.test(model)) return { reasoning_effort: 'low', max_completion_tokens: maxTokens };
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
