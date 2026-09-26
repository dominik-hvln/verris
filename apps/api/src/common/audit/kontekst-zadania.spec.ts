import { lastValueFrom, of, defer } from 'rxjs';
import { AuditService } from './audit.service.js';
import { KontekstZadaniaInterceptor, kontekstZadania } from './kontekst-zadania.js';

/** Impersonacja (E-5): wpisy dziennika z żądania operatora „jako klient” niosą impersonatedBy. */
const ctx = (user?: Record<string, unknown>) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;

describe('KontekstZadaniaInterceptor + AuditService', () => {
  function audyt() {
    const create = vi.fn(async () => ({}));
    return { svc: new AuditService({ auditLog: { create } } as never), create };
  }

  it('żądanie z impersonacją: wpis dostaje impersonatedBy operatora (także po await)', async () => {
    const { svc, create } = audyt();
    const handler = { handle: () => defer(async () => { await Promise.resolve(); await svc.record({ action: 'HOSTING_X', userId: 'klient', actorUserId: 'klient' }); return 'ok'; }) };
    await expect(lastValueFrom(new KontekstZadaniaInterceptor().intercept(ctx({ impersonatedBy: 'operator-1' }), handler))).resolves.toBe('ok');
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'klient', impersonatedBy: 'operator-1' }) });
  });

  it('zwykłe żądanie: bez impersonatedBy; jawna wartość w wywołaniu ma pierwszeństwo', async () => {
    const { svc, create } = audyt();
    const handler = { handle: () => defer(async () => svc.record({ action: 'A', userId: 'u' })) };
    await lastValueFrom(new KontekstZadaniaInterceptor().intercept(ctx({ userId: 'u' }), handler));
    expect(create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ impersonatedBy: null }) });
    await kontekstZadania.run({ impersonatedBy: 'op' }, () => svc.record({ action: 'B', impersonatedBy: 'jawny' }));
    expect(create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ impersonatedBy: 'jawny' }) });
    await lastValueFrom(new KontekstZadaniaInterceptor().intercept(ctx(undefined), { handle: () => of(1) }));
  });
});
