import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

/**
 * Audit F-09: in-process sliding-window rate limiting (zero dependencies).
 *
 * Design notes:
 *  - The API runs as a SINGLE replica (cron design constraint, see DEPLOY.md),
 *    so an in-memory store is correct. If the API is ever scaled
 *    horizontally, swap the store for Redis along with the cron locks.
 *  - Keyed by client IP (Express `req.ip` — `trust proxy` is configured in
 *    main.ts so this is the real client IP behind Caddy) + route scope.
 *  - Defaults are generous (panel traffic never hits them); auth/mail
 *    endpoints declare strict limits via the `@RateLimit()` decorator.
 */
export interface RateLimitOptions {
  /** Max requests per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
  /** Logical bucket name; defaults to the route path. */
  scope?: string;
  /** Additionally key by request body field (e.g. `email`) to protect mail-out endpoints. */
  keyByBodyField?: string;
}

export const RATE_LIMIT_KEY = 'verris:rate-limit';
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/** Marks a route as exempt (agent/webhook traffic with its own auth). */
export const RATE_LIMIT_SKIP_KEY = 'verris:rate-limit-skip';
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_SKIP_KEY, true);

const DEFAULT_LIMIT = 300;
const DEFAULT_WINDOW_MS = 60_000;
/** Hard cap on tracked buckets — prevents memory abuse via key cardinality. */
const MAX_BUCKETS = 50_000;

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    this.assertWithinLimit(`${scope}:${ip}`, options);

    if (options.keyByBodyField) {
      const raw = (req.body as Record<string, unknown> | undefined)?.[options.keyByBodyField];
      if (typeof raw === 'string' && raw.trim()) {
        this.assertWithinLimit(
          `${scope}:field:${raw.trim().toLowerCase()}`,
          options,
        );
      }
    }

    return true;
  }

  private assertWithinLimit(key: string, options: RateLimitOptions): void {
    const now = Date.now();
    this.sweep(now);

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= MAX_BUCKETS) {
        // Under key-cardinality pressure drop the oldest entries wholesale —
        // fail-open for legitimate traffic, never fail-closed.
        this.buckets.clear();
        this.logger.warn('Rate-limit bucket map overflow — cleared (possible abuse)');
      }
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.limit) {
      const retryAfterS = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.',
          retryAfterSeconds: retryAfterS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Lazy GC of expired buckets (at most once per 30 s). */
  private sweep(now: number): void {
    if (now - this.lastSweep < 30_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
