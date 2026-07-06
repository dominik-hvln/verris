import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * CYBER-2 — ochrona anty-bot z pluggable dostawcą (bez vendor lock-in).
 *
 * Weryfikuje token captchy po stronie serwera przed wpuszczeniem żądania do
 * wrażliwych endpointów publicznych: rejestracja, logowanie, reset hasła,
 * ponowna wysyłka weryfikacji. Chroni przed masową rejestracją kont (abuse
 * zasobów, outbound spam), credential-stuffingiem i botami mailowymi.
 *
 * Dostawca wybierany flagą `CAPTCHA_PROVIDER` — gdy jeden dostawca zawodzi
 * (np. awarie Turnstile), przełączasz env bez zmian w kodzie:
 *   - `recaptcha`     → Google reCAPTCHA v2 (checkbox) [DOMYŚLNY]
 *   - `recaptcha-v3`  → Google reCAPTCHA v3 (score, próg CAPTCHA_SCORE_THRESHOLD)
 *   - `hcaptcha`      → hCaptcha (przyjazny RODO)
 *   - `turnstile`     → Cloudflare Turnstile
 *
 * Fail-closed w produkcji: gdy włączona i brak/nieprawidłowy token → 400.
 * W dev (brak `CAPTCHA_SECRET_KEY`) weryfikacja jest pomijana.
 */
export type CaptchaProvider = 'recaptcha' | 'recaptcha-v3' | 'hcaptcha' | 'turnstile';

interface SiteVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  ['error-codes']?: string[];
}

const VERIFY_URLS: Record<CaptchaProvider, string> = {
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  'recaptcha-v3': 'https://www.google.com/recaptcha/api/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
};

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly provider: CaptchaProvider;
  private readonly secret: string | null;
  private readonly enabled: boolean;
  private readonly scoreThreshold: number;

  constructor(private readonly config: ConfigService) {
    this.provider = (this.config.get<string>('captchaProvider') as CaptchaProvider) || 'recaptcha';
    this.secret = this.config.get<string>('captchaSecretKey') || null;
    this.scoreThreshold = this.config.get<number>('captchaScoreThreshold') ?? 0.5;

    const flag = this.config.get<boolean>('captchaEnabled');
    this.enabled = flag === true || (flag === undefined && !!this.secret);

    if (this.config.get<string>('nodeEnv') === 'production' && this.enabled && !this.secret) {
      this.logger.warn(
        'CAPTCHA_SECRET_KEY nie ustawiony — ochrona anty-bot (CYBER-2) jest WYŁĄCZONA na produkcji!',
      );
    }
  }

  /** Metadane dla frontu (/auth/config) — jaki widget renderować. Bez sekretów. */
  publicConfig(): { enabled: boolean; provider: CaptchaProvider } {
    return { enabled: this.isEnabled(), provider: this.provider };
  }

  isEnabled(): boolean {
    return this.enabled && !!this.secret;
  }

  /**
   * Weryfikuje token captchy. Rzuca `BadRequestException`, gdy weryfikacja jest
   * wymagana i się nie powiodła. No-op, gdy wyłączona (dev).
   *
   * @param token wartość pola odpowiedzi widgetu (g-recaptcha-response /
   *   h-captcha-response / cf-turnstile-response)
   * @param remoteIp IP klienta (korelacja po stronie dostawcy)
   * @param action logiczna nazwa akcji (telemetria / reCAPTCHA v3 action match)
   */
  async verify(
    token: string | undefined | null,
    remoteIp?: string | null,
    action = 'auth',
  ): Promise<void> {
    if (!this.isEnabled()) return;

    if (!token || typeof token !== 'string' || token.length < 10) {
      throw new BadRequestException(
        'Weryfikacja antybotowa nie powiodła się. Odśwież stronę i spróbuj ponownie.',
      );
    }

    const body = new URLSearchParams();
    body.set('secret', this.secret as string);
    body.set('response', token);
    if (remoteIp) body.set('remoteip', remoteIp);

    let outcome: SiteVerifyResponse;
    try {
      const res = await fetch(VERIFY_URLS[this.provider], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(5_000),
      });
      outcome = (await res.json()) as SiteVerifyResponse;
    } catch (err) {
      // Fail-closed: nie potrafimy zweryfikować (błąd sieci/timeout) → odrzuć.
      this.logger.warn(
        `Captcha siteverify (${this.provider}) nieosiągalny (${action}): ${(err as Error).message}`,
      );
      throw new BadRequestException(
        'Nie udało się zweryfikować testu antybotowego. Spróbuj ponownie za chwilę.',
      );
    }

    const failed =
      !outcome.success ||
      (this.provider === 'recaptcha-v3' &&
        typeof outcome.score === 'number' &&
        outcome.score < this.scoreThreshold);

    if (failed) {
      this.logger.warn(
        `Captcha (${this.provider}) odrzuciła token (${action}) ip=${remoteIp ?? '?'} ` +
          `score=${outcome.score ?? '-'} codes=${(outcome['error-codes'] ?? []).join(',')}`,
      );
      throw new BadRequestException(
        'Weryfikacja antybotowa nie powiodła się. Odśwież stronę i spróbuj ponownie.',
      );
    }
  }
}
