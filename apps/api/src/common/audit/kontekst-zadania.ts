import { AsyncLocalStorage } from 'node:async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Kontekst żądania dla dziennika audytu. Gdy operator działa „jako klient” (impersonacja E-5),
 * serwisy zapisują wpisy z actorUserId = klient — bez tego w dzienniku wyglądałoby, że wszystko
 * zrobił klient. AuditService dopisuje impersonatedBy z tego kontekstu.
 */
export const kontekstZadania = new AsyncLocalStorage<{ impersonatedBy?: string }>();

@Injectable()
export class KontekstZadaniaInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const imp = ctx.switchToHttp().getRequest<{ user?: { impersonatedBy?: string } } | undefined>()?.user?.impersonatedBy;
    if (!imp) return next.handle();
    return new Observable((sub) => kontekstZadania.run({ impersonatedBy: imp }, () => next.handle().subscribe(sub)));
  }
}
