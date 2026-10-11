import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@verris/database';
import { UsersAdminService } from './users.admin.service.js';
import { UsersAdminController } from './users.admin.controller.js';
import { JwtStrategy } from '../auth/strategies/jwt.strategy.js';
import { odbierzKodPrzekazania } from '../common/auth/przekazanie-sesji.js';

/**
 * K7 — „Zaloguj jako klient”: dziennik ma START i STOP sesji, oba z powodem podanym przez operatora.
 * Powód jedzie w tokenie impersonacji (impersonationReason) — STOP woła panel klienta tym tokenem,
 * więc łańcuch to: impersonate → kod przekazania → token → JwtStrategy → kontroler stop → wpis STOP.
 */
const SEKRET = 'test-jwt-sekret';
const KLIENT = { id: 'klient-1', email: 'anna@firma.pl', role: Role.USER, tokenVersion: 0, firstName: 'Anna', lastName: null };
const POWOD = 'Zgłoszenie #123 — klient prosi o sprawdzenie poczty';

function uklad() {
  const audit = { record: vi.fn(async () => undefined) };
  const jwt = new JwtService({ secret: SEKRET });
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({
        ...KLIENT,
        loginBlocked: false,
        anonymizedAt: null,
        customerOwnerId: null,
        customerPermissions: [],
        subaccountDisabledAt: null,
        subaccountServiceIds: [],
        customerOwner: null,
      })),
    },
  };
  const svc = new UsersAdminService(prisma as never, jwt, audit as never, {} as never, {} as never, {} as never, {} as never);
  const kontroler = new UsersAdminController(svc, {} as never, {} as never, {} as never, {} as never);
  const strategia = new JwtStrategy({ get: () => SEKRET } as never, prisma as never);
  return { svc, kontroler, strategia, jwt, audit };
}

const ctx = { actorUserId: 'operator-1', actorRole: Role.STAFF, alreadyImpersonating: null };
const req = { ip: '203.0.113.7', headers: { 'user-agent': 'test' } } as never;

describe('K7 — dziennik START/STOP logowania jako klient z powodem', () => {
  it('START zapisuje powód (przycięty) w dzienniku, a STOP z tokenu tej sesji — ten sam powód', async () => {
    const { svc, kontroler, strategia, jwt, audit } = uklad();
    const r = await svc.impersonate({ targetUserId: KLIENT.id, ctx, ipAddress: '203.0.113.7', userAgent: 'test', reason: `  ${POWOD}  ` });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_IMPERSONATION_STARTED',
        userId: KLIENT.id,
        actorUserId: 'operator-1',
        impersonatedBy: 'operator-1',
        details: expect.objectContaining({ reason: POWOD }),
      }),
    );

    // Panel klienta wymienia kod na token i z nim woła POST /admin/users/impersonate/stop.
    const token = odbierzKodPrzekazania(r.handoffCode);
    expect(token).toBeTruthy();
    const user = await strategia.validate(jwt.verify(token!));
    await kontroler.stop(user as never, req);

    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'USER_IMPERSONATION_STOPPED',
        userId: KLIENT.id,
        actorUserId: 'operator-1',
        impersonatedBy: 'operator-1',
        details: expect.objectContaining({ reason: POWOD }),
      }),
    );
  });

  it('bez powodu (lub krótszego niż 10 znaków) — odmowa bez wpisu; komunikat nie obiecuje powiadomienia klienta', async () => {
    const { svc, audit } = uklad();
    const proba = svc.impersonate({ targetUserId: KLIENT.id, ctx, reason: 'krótko' });
    await expect(proba).rejects.toBeInstanceOf(BadRequestException);
    await expect(proba).rejects.not.toThrow(/powiadomieni/i);
    await expect(proba).rejects.toThrow(/dzienniku/i);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
