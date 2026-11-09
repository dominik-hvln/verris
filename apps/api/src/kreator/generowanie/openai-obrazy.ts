import type { Fetch } from '../biblioteka/dostawca.js';
import { BladGeneratora, MAKS_BAJTOW_WYNIKU, blad, rozmiarOpenAi, type GeneratorObrazow, type WygenerowanyObraz, type WynikGeneracji, type ZlecenieObrazow } from './generator.js';

/**
 * OpenAI Images – POST https://api.openai.com/v1/images/generations (do sprawdzenia z dokumentacją przy wdrożeniu;
 * opis wg stanu wiedzy). Klucz: ten sam co asystent AI (AI_API_KEY, `AiProviderService.klucz('openai')`), adres
 * bazowy AI_API_BASE_URL. Bez klucza adapter jest wyłączony.
 *  - gpt-image-1: { model, prompt, n (1–10), size: 1024x1024 | 1536x1024 | 1024x1536, quality, output_format,
 *    moderation: 'auto' } → { data: [{ b64_json }] } – zawsze base64, bez `response_format`.
 *  - dall-e-3: n = 1, `response_format: 'b64_json'` – warianty jako osobne zlecenia.
 *  - Moderacja: HTTP 400 z `error.code` = 'moderation_blocked' (gpt-image-1) albo 'content_policy_violation'
 *    (dall-e-3); za odrzucone zlecenie dostawca nie pobiera opłaty.
 */
export const API_OPENAI = 'https://api.openai.com/v1';

interface OdpowiedzOpenAi {
  data?: { b64_json?: unknown }[];
  error?: { code?: unknown; type?: unknown; message?: unknown } | null;
}

const MODERACJA = /moderation|content_policy|safety/i;

export class GeneratorOpenAi implements GeneratorObrazow {
  readonly nazwa = 'openai' as const;

  constructor(
    private readonly klucz: string | undefined,
    readonly f: Fetch = fetch,
    private readonly baza = API_OPENAI,
  ) {}

  wlaczony(): boolean {
    return !!this.klucz;
  }

  async generuj(z: ZlecenieObrazow): Promise<WynikGeneracji> {
    if (!this.klucz) throw blad('wylaczony', 'brak AI_API_KEY');
    const dalle = z.model.startsWith('dall-e');
    const zlecenia = dalle ? Array.from({ length: z.ile }, () => 1) : [z.ile];
    const wyniki = await Promise.allSettled(zlecenia.map((n) => this.zlecenie(z, n, dalle)));
    const obrazy = wyniki.flatMap((w) => (w.status === 'fulfilled' ? w.value : []));
    const bledy = wyniki.flatMap((w) => (w.status === 'rejected' ? [w.reason instanceof BladGeneratora ? w.reason : blad('blad', String(w.reason))] : []));
    const moderowane = bledy.filter((b) => b.kod === 'moderacja').length * (dalle ? 1 : z.ile);
    if (obrazy.length) return { obrazy, rozliczone: obrazy.length, moderowane };
    const glowny = bledy.find((b) => b.kod === 'moderacja') ?? bledy.find((b) => b.kod === 'czas') ?? bledy[0] ?? blad('blad', 'pusta odpowiedź');
    throw glowny;
  }

  private async zlecenie(z: ZlecenieObrazow, n: number, dalle: boolean): Promise<WygenerowanyObraz[]> {
    let r: Response;
    try {
      r = await this.f(`${this.baza.replace(/\/+$/, '')}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.klucz!}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          dalle
            ? { model: z.model, prompt: z.prompt, n, size: z.proporcje === '1:1' ? '1024x1024' : rozmiarOpenAi(z.proporcje) === '1024x1536' ? '1024x1792' : '1792x1024', response_format: 'b64_json' }
            : { model: z.model, prompt: z.prompt, n, size: rozmiarOpenAi(z.proporcje), quality: 'medium', output_format: 'jpeg', moderation: 'auto' },
        ),
        redirect: 'error',
        signal: z.sygnal,
      });
    } catch (e) {
      throw z.sygnal.aborted ? blad('czas', 'OpenAI: termin') : blad('blad', `OpenAI: ${e instanceof Error ? e.message : String(e)}`);
    }
    const body = (await r.json().catch(() => null)) as OdpowiedzOpenAi | null;
    if (!r.ok) {
      const kod = `${String(body?.error?.code ?? '')} ${String(body?.error?.type ?? '')}`;
      if (r.status === 400 && MODERACJA.test(kod)) throw blad('moderacja', `OpenAI: ${kod.trim()}`);
      if (r.status === 429) throw blad('limit', 'OpenAI HTTP 429');
      throw blad('blad', `OpenAI HTTP ${r.status} ${kod.trim()}`);
    }
    const obrazy: WygenerowanyObraz[] = [];
    for (const d of Array.isArray(body?.data) ? body.data : []) {
      if (typeof d?.b64_json !== 'string' || d.b64_json.length > Math.ceil((MAKS_BAJTOW_WYNIKU * 4) / 3) + 4) continue;
      const dane = Buffer.from(d.b64_json, 'base64');
      if (dane.length) obrazy.push({ dane });
    }
    if (!obrazy.length) throw blad('blad', 'OpenAI: brak b64_json');
    return obrazy;
  }
}
