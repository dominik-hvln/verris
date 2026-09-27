import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Optional } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service.js';
import { kontekstZadania } from './kontekst-magazyn.js';

/**
 * Kontekst żądania dla dziennika audytu. Gdy operator działa „jako klient” (impersonacja E-5),
 * serwisy zapisują wpisy z actorUserId = klient — bez tego w dzienniku wyglądałoby, że wszystko
 * zrobił klient. AuditService dopisuje impersonatedBy z tego kontekstu.
 */
// Magazyn w osobnym pliku: audit.service go importuje, a ten plik importuje AuditService — cykl importów
// zostawiał wstrzykiwany AuditService jako undefined.
export { kontekstZadania };

const ZAPIS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class KontekstZadaniaInterceptor implements NestInterceptor {
  constructor(@Optional() private readonly audit?: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ method?: string; route?: { path?: string }; path?: string; ip?: string; user?: { impersonatedBy?: string; userId?: string; principalUserId?: string; customerOwnerId?: string | null } } | undefined>();
    const u = req?.user;
    const imp = u?.impersonatedBy;
    // O-03 — subkonto działa jako właściciel (userId = właściciel); serwisy wpisują actorUserId = userId.
    // Kontekst pozwala dziennikowi wpisać człowieka za subkontem — w jednym miejscu, dla wszystkich serwisów.
    const subkonto = u?.customerOwnerId && u.principalUserId && u.principalUserId !== u.userId
      ? { wlasciciel: u.userId!, osoba: u.principalUserId }
      : undefined;
    if (!imp && !subkonto) return next.handle();
    // O-03 — każdy UDANY zapis subkonta trafia do dziennika właściciela (IAM → Audyt), także w serwisach,
    // które same nic nie zapisują (np. zgłoszenie). Wcześniej właściciel widział tylko odmowy.
    const zapisSubkonta = subkonto && ZAPIS.has((req?.method ?? '').toUpperCase());
    const wynik = new Observable((sub) => kontekstZadania.run({ impersonatedBy: imp, subkonto }, () => next.handle().subscribe(sub)));
    if (!zapisSubkonta || !this.audit) return wynik;
    return wynik.pipe(
      tap({
        complete: () =>
          void this.audit!.record({
            action: 'CUSTOMER_IAM_SUBACCOUNT_ACTION',
            userId: subkonto.wlasciciel,
            actorUserId: subkonto.osoba,
            ipAddress: req?.ip,
            details: { method: req?.method, route: req?.route?.path ?? req?.path ?? '', ...(imp ? { impersonatedBy: imp } : {}) },
          }).catch(() => undefined),
      }),
    );
  }
}
