import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Extract caller IP and User-Agent from an Express request.
 *
 * Uses the leftmost `X-Forwarded-For` value if present (Caddy/Nginx adds
 * trusted edge IPs), then falls back to `req.ip`. The Express trust proxy
 * setting is configured in `main.ts` so `req.ip` is already correct in
 * common configs — we still prefer XFF leftmost because it's the closest
 * thing to the client's real IP through chained proxies.
 *
 * Used for `UserConsent` audit trail and `AuditLog.ipAddress`.
 */
export interface RequestContextDto {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Backwards-compat alias for older imports that used `RequestContext` as type. */
export type RequestContext = RequestContextDto;

export function extractRequestContext(req: Request): RequestContextDto {
  const xffHeader = req.headers['x-forwarded-for'];
  const xff =
    typeof xffHeader === 'string'
      ? xffHeader
      : Array.isArray(xffHeader)
      ? xffHeader[0]
      : null;
  // Audit F-10: `req.ip` is authoritative — `trust proxy` is set in main.ts,
  // so Express resolves it from the XFF entry appended by OUR proxy (Caddy).
  // The left-most XFF value is client-controlled and only used as a fallback.
  const ipAddress = req.ip || xff?.split(',')[0]?.trim() || null;
  const ua = req.headers['user-agent'];
  const userAgent = typeof ua === 'string' ? ua : null;
  return { ipAddress, userAgent };
}

/**
 * NestJS param decorator wrapper around `extractRequestContext`. Lets controllers
 * use `@RequestContext() ctx: RequestContextDto` instead of pulling the raw
 * `req` object via `@Req()`.
 */
export const RequestContextParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContextDto => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return extractRequestContext(req);
  },
);

/**
 * Re-export under the original `RequestContext` name to keep ergonomic
 * `@RequestContext()` param syntax. Older imports of `RequestContext` as a
 * **type** will still work via the alias above (TypeScript distinguishes
 * between value and type imports).
 */
export const RequestContext = RequestContextParam;
