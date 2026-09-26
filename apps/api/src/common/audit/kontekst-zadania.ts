import { AsyncLocalStorage } from 'node:async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Kontekst żądania dla dziennika audytu. Gdy operator działa „jako klient” (impersonacja E-5),
 * serwisy zapisują wpisy z actorUserId = klient — bez tego w dzienniku wyglądałoby, że wszystko
 * zrobił klient. AuditService dopisuje impersonatedBy z tego kontekstu.
 */
export const kontekstZadania = new AsyncLocalStorage<{ impersonatedBy?: string; subkonto?: { wlasciciel: string; osoba: string } }>();

@Injectable()
export class KontekstZadaniaInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const u = ctx.switchToHttp().getRequest<{ user?: { impersonatedBy?: string; userId?: string; principalUserId?: string; customerOwnerId?: string | null } } | undefined>()?.user;
    const imp = u?.impersonatedBy;
    // O-03 — subkonto działa jako właściciel (userId = właściciel); serwisy wpisują actorUserId = userId.
    // Kontekst pozwala dziennikowi wpisać człowieka za subkontem — w jednym miejscu, dla wszystkich serwisów.
    const subkonto = u?.customerOwnerId && u.principalUserId && u.principalUserId !== u.userId
      ? { wlasciciel: u.userId!, osoba: u.principalUserId }
      : undefined;
    if (!imp && !subkonto) return next.handle();
    return new Observable((sub) => kontekstZadania.run({ impersonatedBy: imp, subkonto }, () => next.handle().subscribe(sub)));
  }
}
