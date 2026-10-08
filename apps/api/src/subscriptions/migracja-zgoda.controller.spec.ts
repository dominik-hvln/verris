import { ForbiddenException } from '@nestjs/common';
import { MigracjaZgodaController } from './migracja-zgoda.controller.js';

/**
 * PB-45 — zgodę na migrację przygotowaną przez obsługę daje wyłącznie właściciel konta. Operator, który
 * migrację przygotował, w sesji „Zaloguj jako klient” (JwtStrategy: userId = klient, impersonatedBy =
 * operator) nie może jej sam zatwierdzić ani odrzucić — wpis byłby fałszywym dowodem zgody klienta.
 * Pełna ścieżka na prawdziwej bazie: test/integration/migracja-za-klienta.int-spec.ts.
 */
describe('MigracjaZgodaController — decyzja tylko od właściciela', () => {
  const uslugi = () => ({
    przyjmij: vi.fn(async () => ({ id: 'm1', status: 'QUEUED' })),
    odrzuc: vi.fn(async () => ({ id: 'm1', stan: 'odrzucona' })),
    szczegoly: vi.fn(async () => ({ id: 'm1', stan: 'oczekuje' })),
  });
  const zadanie = { ip: '203.0.113.5' } as never;
  const sesjaWsparcia = { userId: 'klient', principalUserId: 'klient', impersonatedBy: 'operator', customerOwnerId: null };
  const subkonto = { userId: 'klient', principalUserId: 'sub-1', customerOwnerId: 'klient' };
  const wlasciciel = { userId: 'klient', principalUserId: 'klient', customerOwnerId: null };

  it.each([
    ['sesja wsparcia (impersonacja)', sesjaWsparcia],
    ['subkonto / członek zespołu', subkonto],
  ])('%s: przyjęcie i odrzucenie → 403, usługa nie jest wołana', async (_opis, user) => {
    const s = uslugi();
    const c = new MigracjaZgodaController(s as never);
    await expect(c.przyjmij(user, 's1', 'm1', { token: 't' }, zadanie)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(c.odrzuc(user, 's1', 'm1', { token: 't' }, zadanie)).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.przyjmij).not.toHaveBeenCalled();
    expect(s.odrzuc).not.toHaveBeenCalled();
  });

  it('podgląd prośby w sesji wsparcia działa (operator widzi to, co przygotował)', async () => {
    const s = uslugi();
    await new MigracjaZgodaController(s as never).szczegoly(sesjaWsparcia, 's1', 'm1', 't');
    expect(s.szczegoly).toHaveBeenCalled();
  });

  it('właściciel we własnej sesji — decyzja przechodzi z jego IP', async () => {
    const s = uslugi();
    await new MigracjaZgodaController(s as never).przyjmij(wlasciciel, 's1', 'm1', { token: 't' }, zadanie);
    expect(s.przyjmij).toHaveBeenCalledWith(expect.objectContaining({ userId: 'klient', actorUserId: 'klient', ip: '203.0.113.5' }));
  });
});
