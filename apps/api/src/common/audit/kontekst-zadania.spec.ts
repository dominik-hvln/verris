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

  it('O-03 — żądanie subkonta: wpis na koncie właściciela dostaje jako autora osobę z subkonta', async () => {
    const { svc, create } = audyt();
    const u = { userId: 'wlasciciel', principalUserId: 'sub-1', customerOwnerId: 'wlasciciel' };
    const handler = { handle: () => defer(async () => {
      await svc.record({ action: 'SUBSCRIPTION_CREATED', userId: 'wlasciciel', actorUserId: 'wlasciciel' });
      await svc.record({ action: 'X', userId: 'wlasciciel' });
      await svc.record({ action: 'Y', userId: 'wlasciciel', actorUserId: 'operator' });
      await svc.record({ action: 'Z', userId: 'inny', actorUserId: 'inny' });
    }) };
    await lastValueFrom(new KontekstZadaniaInterceptor().intercept(ctx(u), handler));
    expect((create.mock.calls as unknown as [{ data: { action: string; actorUserId: string } }][]).map(([a]) => [a.data.action, a.data.actorUserId])).toEqual([
      ['SUBSCRIPTION_CREATED', 'sub-1'], ['X', 'sub-1'], ['Y', 'operator'], ['Z', 'inny'],
    ]);
  });

  it('F2.2 — akcja operatora z karty usługi: wpis „właściciel sam” dostaje autora = operator i numer zgłoszenia', async () => {
    const { svc, create } = audyt();
    const magazyn = { operator: { wlasciciel: 'wlasciciel', operatorUserId: 'operator-1', zgloszenieId: 'z-1' } };
    await kontekstZadania.run(magazyn, async () => {
      await svc.record({ action: 'HOSTING_EMAIL_PASSWORD_CHANGED', userId: 'wlasciciel', actorUserId: 'wlasciciel', details: { email: 'a@b.pl' } });
      await svc.record({ action: 'X', userId: 'wlasciciel' });
      await svc.record({ action: 'Y', userId: 'wlasciciel', actorUserId: 'ktos-inny' });
      await svc.record({ action: 'Z', userId: 'inny', actorUserId: 'inny', details: { a: 1 } });
    });
    const dane = (create.mock.calls as unknown as [{ data: { action: string; actorUserId: string; details: unknown } }][]).map(([a]) => [a.data.action, a.data.actorUserId, a.data.details]);
    expect(dane).toEqual([
      ['HOSTING_EMAIL_PASSWORD_CHANGED', 'operator-1', { zgloszenieId: 'z-1', email: 'a@b.pl' }],
      ['X', 'operator-1', { zgloszenieId: 'z-1' }],
      ['Y', 'ktos-inny', { zgloszenieId: 'z-1' }],
      ['Z', 'inny', { a: 1 }],
    ]);
    // Poza kontekstem — bez zmian.
    await svc.record({ action: 'W', userId: 'wlasciciel', actorUserId: 'wlasciciel' });
    expect(create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'W', actorUserId: 'wlasciciel' }) });
  });
});
