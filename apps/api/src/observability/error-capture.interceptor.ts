import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { Request } from 'express';
import { RuntimeErrorTracker } from './runtime-error-tracker.service';

/**
 * CYBER-9 — przechwytuje błędy z pipeline'u żądania i rejestruje 5xx w
 * RuntimeErrorTracker (ring + /metrics + GlitchTip). Błąd jest RZUCANY dalej,
 * więc AllExceptionsFilter nadal formatuje odpowiedź jak dotąd.
 *
 * Rejestrujemy tylko realne błędy serwera (5xx / nie-HttpException) — 4xx
 * (walidacja, 401/403/404) to normalny ruch, nie zaśmiecamy nimi monitoringu.
 */
@Injectable()
export class ErrorCaptureInterceptor implements NestInterceptor {
  constructor(private readonly tracker: RuntimeErrorTracker) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    return next.handle().pipe(
      catchError((err) => {
        const status =
          err instanceof HttpException ? err.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
        if (status >= 500) {
          const req = context.switchToHttp().getRequest<Request & { user?: { userId?: string } }>();
          this.tracker.capture(err, {
            method: req.method,
            path: req.route?.path ?? req.path,
            status,
            userId: req.user?.userId,
          });
        }
        return throwError(() => err);
      }),
    );
  }
}
