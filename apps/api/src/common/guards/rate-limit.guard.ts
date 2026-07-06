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
import type { Request } from 'express';
import IORedis, { type Redis } from 'ioredis';

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
}

export const RATE_LIMIT_KEY = 'verris:rate-limit';
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

export const RATE_LIMIT_SKIP_KEY = 'verris:rate-limit-skip';
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_SKIP_KEY, true);

const DEFAULT_LIMIT = 300;
const DEFAULT_WINDOW_MS = 60_000;
const MAX_BUCKETS = 50_000;

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

  constructor(private readonly reflector: Reflector) {
    const url = process.env.REDIS_URL?.trim();
    if (url) {
      try {
        this.redis = new IORedis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
        this.redis.on('ready', () => {
          this.redisHealthy = true;
        });
        this.redis.on('error', (e) => {
          this.redisHealthy = false;
          this.logger.warn(`Redis (rate-limit) error — fallback in-memory: ${e.message}`);
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

    const options =
      this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? { limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS, scope: 'global' };

    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const scope = options.scope ?? `${req.method}:${req.route?.path ?? req.path}`;

    await this.assertWithinLimit(`${scope}:${ip}`, options);

    if (options.keyByBodyField) {
      const raw = (req.body as Record<string, unknown> | undefined)?.[options.keyByBodyField];
      if (typeof raw === 'string' && raw.trim()) {
        await this.assertWithinLimit(`${scope}:field:${raw.trim().toLowerCase()}`, options);
      }
    }

    return true;
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
        this.logger.warn(`Redis rate-limit op failed — fallback in-memory: ${(e as Error).message}`);
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
        this.buckets.clear();
        this.logger.warn('Rate-limit bucket map overflow — cleared (possible abuse)');
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
        message: 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.',
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
