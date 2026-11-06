import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';

/**
 * Audit F-09 / CYBER-4: sliding-window rate limiting z pluggable store.
 *
 * Store:
 *  - **Redis** gdy `REDIS_URL` ustawione — licznik współdzielony między replikami
 *    i odporny na rozproszony flood (klucze z TTL auto-wygasają, brak „fail-open
 *    przez wyczyszczenie mapy" jak w trybie in-memory). To domyka lukę CYBER-4.
 *  - **in-memory** fallback gdy brak Redis lub błąd — jak dotąd (single replica).
 *
 * Keyed by client IP (`req.ip`, `trust proxy` w main.ts) + route scope. Limity
 * domyślne są luźne; auth/mail deklarują ostre przez `@RateLimit()`.
 */
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  scope?: string;
  keyByBodyField?: string;
  /**
   * P5-03 — liczymy tylko udane żądania (odpowiedź 2xx). Odrzucenia z walidacji (400), duplikat, odmowa nie zjadają
   * limitu: klient poprawiający literówkę w domenie nie blokuje się na godzinę. Sprawdzenie przed obsługą, doliczenie po.
   */
  tylkoUdane?: boolean;
  /**
   * Bezpiecznik do `tylkoUdane`: limit WSZYSTKICH prób w tym samym oknie (np. 60/h), żeby nieudanymi próbami
   * nie dało się dowolnie długo obciążać serwera.
   */
  limitProb?: number;
  /**
   * A1-02 / P5-03 — klucz per konto (sub z ważnego tokenu) zamiast per IP: biuro za jednym NAT-em nie blokuje się
   * wzajemnie, a zmiana adresu IP nie omija limitu na koncie. Bez ważnego tokenu — per IP.
   */
  perKonto?: boolean;
}

export const RATE_LIMIT_KEY = 'verris:rate-limit';
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

export const RATE_LIMIT_SKIP_KEY = 'verris:rate-limit-skip';
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_SKIP_KEY, true);

const DEFAULT_LIMIT = 300;
const DEFAULT_WINDOW_MS = 60_000;
/**
 * Zalogowani (ważny JWT) mają limit globalny liczony per konto, nie per IP. Jeden widok panelu to
 * kilkadziesiąt wywołań API (akcje serwera, prefetch linków, profil w middleware) i wszystkie idą
 * z IP klienta — 300/min per IP wyczerpywało się po kilku kliknięciach, a biuro za jednym NAT-em
 * blokowało się wzajemnie („Panel chwilowo niedostępny”). Podrobiony token nie przechodzi
 * weryfikacji i liczy się dalej per IP, więc nie da się nim ominąć limitu.
 */
export const AUTHENTICATED_LIMIT = 900;
export const MAX_BUCKETS = 50_000;

/** Odmiana: 1 minuta, 2–4 minuty, 5+ minut (także 12–14 → „minut”). */
function odmiana(n: number, [jeden, kilka, wiele]: [string, string, string]): string {
  if (n === 1) return jeden;
  const d = n % 10;
  const s = n % 100;
  return d >= 2 && d <= 4 && (s < 12 || s > 14) ? kilka : wiele;
}

/** P5-03 — „Spróbuj ponownie za 52 minuty” z czasu do odblokowania (ten sam co w `retryAfterSeconds`). */
export function komunikatLimitu(retryAfterSeconds: number): string {
  const s = Math.max(1, Math.ceil(retryAfterSeconds));
  const czas =
    s < 60
      ? `${s} ${odmiana(s, ['sekundę', 'sekundy', 'sekund'])}`
      : (() => {
          const m = Math.ceil(s / 60);
          return `${m} ${odmiana(m, ['minutę', 'minuty', 'minut'])}`;
        })();
  return `Zbyt wiele prób w krótkim czasie. Spróbuj ponownie za ${czas}. Jeśli sprawa jest pilna, napisz na kontakt@verris.pl.`;
}

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();
  private redis: Redis | null = null;
  private redisHealthy = false;
  private readonly jwt = new JwtService({ secret: process.env.JWT_SECRET });

  constructor(private readonly reflector: Reflector) {
    const url = process.env.REDIS_URL?.trim();
    if (url) {
      try {
        this.redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
        this.redis.on('ready', () => {
          this.redisHealthy = true;
        });
        this.redis.on('error', (e) => {
          this.redisHealthy = false;
          this.logger.warn(`Redis (rate-limit) error – fallback in-memory: ${e.message}`);
        });
        this.redis.on('end', () => {
          this.redisHealthy = false;
        });
        this.logger.log('Rate-limit: store Redis (odporny na rozproszony flood, CYBER-4).');
      } catch (e) {
        this.logger.warn(`Redis init failed, in-memory: ${(e as Error).message}`);
        this.redis = null;
      }
    } else {
      this.logger.log('Rate-limit: store in-memory (REDIS_URL nieustawione, single replica).');
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const skip = this.reflector.getAllAndOverride<boolean>(RATE_LIMIT_SKIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const custom = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

    // Trasy z własnym limitem (logowanie, maile) zostają per IP — tam liczy się właśnie adres.
    const konto = custom ? null : this.kontoZTokenu(req);
    if (konto) {
      await this.assertWithinLimit(`global:user:${konto}`, { limit: AUTHENTICATED_LIMIT, windowMs: DEFAULT_WINDOW_MS });
      return true;
    }

    const options = custom ?? { limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS, scope: 'global' };
    const scope = options.scope ?? `${req.method}:${req.route?.path ?? req.path}`;
    const wlasciciel = options.perKonto ? this.kontoZTokenu(req) : null;
    const klucze = [wlasciciel ? `${scope}:user:${wlasciciel}` : `${scope}:${ip}`];
    if (options.keyByBodyField) {
      const raw = (req.body as Record<string, unknown> | undefined)?.[options.keyByBodyField];
      if (typeof raw === 'string' && raw.trim()) klucze.push(`${scope}:field:${raw.trim().toLowerCase()}`);
    }

    if (!options.tylkoUdane) {
      for (const k of klucze) await this.assertWithinLimit(k, options);
      return true;
    }

    // P5-03 — bezpiecznik wszystkich prób (liczony od razu), potem sam limit udanych: sprawdzenie bez doliczania,
    // doliczenie dopiero, gdy odpowiedź wyszła z kodem 2xx.
    if (options.limitProb) {
      for (const k of klucze) await this.assertWithinLimit(`${k}:proby`, { ...options, limit: options.limitProb });
    }
    for (const k of klucze) await this.assertBelowLimit(k, options);
    const res = context.switchToHttp().getResponse<Response | undefined>();
    if (res && typeof res.once === 'function') {
      res.once('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          for (const k of klucze) void this.dolicz(k, options).catch(() => undefined);
        }
      });
    }
    return true;
  }

  /** Tylko sprawdzenie (bez doliczania) — do limitów `tylkoUdane`. */
  private async assertBelowLimit(key: string, options: RateLimitOptions): Promise<void> {
    if (this.redis && this.redisHealthy) {
      try {
        const redisKey = `rl:${key}`;
        const count = Number((await this.redis.get(redisKey)) ?? 0);
        if (count >= options.limit) {
          const ttl = await this.redis.pttl(redisKey);
          this.tooMany(Math.max(1, Math.ceil((ttl > 0 ? ttl : options.windowMs) / 1000)));
        }
        return;
      } catch (e) {
        if (e instanceof HttpException) throw e;
        this.redisHealthy = false;
      }
    }
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt > now && bucket.count >= options.limit) {
      this.tooMany(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
    }
  }

  /** Doliczenie udanego żądania (`tylkoUdane`). Nie rzuca — odpowiedź już wyszła. */
  async dolicz(key: string, options: RateLimitOptions): Promise<void> {
    if (this.redis && this.redisHealthy) {
      try {
        const redisKey = `rl:${key}`;
        const count = await this.redis.incr(redisKey);
        if (count === 1) await this.redis.pexpire(redisKey, options.windowMs);
        return;
      } catch {
        this.redisHealthy = false;
      }
    }
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size < MAX_BUCKETS) this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return;
    }
    bucket.count += 1;
  }

  /** `sub` z poprawnie podpisanego, niewygasłego tokenu Bearer; wszystko inne → null (limit per IP). */
  private kontoZTokenu(req: Request): string | null {
    const auth = req.headers?.authorization;
    if (!process.env.JWT_SECRET || typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
    try {
      const { sub } = this.jwt.verify<{ sub?: unknown }>(auth.slice(7));
      return typeof sub === 'string' && sub ? sub : null;
    } catch {
      return null;
    }
  }

  private async assertWithinLimit(key: string, options: RateLimitOptions): Promise<void> {
    // Preferuj Redis; przy błędzie natychmiast spadamy do in-memory (nie blokujemy ruchu).
    if (this.redis && this.redisHealthy) {
      try {
        const redisKey = `rl:${key}`;
        const count = await this.redis.incr(redisKey);
        if (count === 1) await this.redis.pexpire(redisKey, options.windowMs);
        if (count > options.limit) {
          const ttl = await this.redis.pttl(redisKey);
          const retryAfterS = Math.max(1, Math.ceil((ttl > 0 ? ttl : options.windowMs) / 1000));
          this.tooMany(retryAfterS);
        }
        return;
      } catch (e) {
        if (e instanceof HttpException) throw e;
        this.redisHealthy = false;
        this.logger.warn(`Redis rate-limit op failed – fallback in-memory: ${(e as Error).message}`);
        // fallthrough do in-memory
      }
    }
    this.assertWithinLimitMemory(key, options);
  }

  private assertWithinLimitMemory(key: string, options: RateLimitOptions): void {
    const now = Date.now();
    this.sweep(now);

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= MAX_BUCKETS) {
        // G-20 — wcześniej mapa była czyszczona w całości: wystarczyło 50 tys.
        // żądań z losowymi e-mailami, żeby wyzerować licznik prób logowania do
        // atakowanego konta (fail-open). Teraz usuwamy tylko wygasłe, a gdy
        // dalej brak miejsca — odmawiamy NOWYM kluczom (fail-closed).
        this.lastSweep = 0;
        this.sweep(now);
        if (this.buckets.size >= MAX_BUCKETS) {
          this.logger.warn('Rate-limit bucket map full – rejecting new keys (possible abuse)');
          this.tooMany(Math.ceil(options.windowMs / 1000));
        }
      }
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.limit) {
      this.tooMany(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
    }
  }

  private tooMany(retryAfterSeconds: number): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        // P5-03 — konkretny czas zamiast „za chwilę” (blokada potrafi trwać godzinę) i co zrobić teraz.
        message: komunikatLimitu(retryAfterSeconds),
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 30_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
