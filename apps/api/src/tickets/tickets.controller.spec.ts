import { Role } from '@verris/database';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { TicketsController } from './tickets.controller.js';

describe('TicketsController (RBAC metadata)', () => {
  it('adminFindAll requires STAFF or ADMIN', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, TicketsController.prototype.adminFindAll);
    expect(roles?.sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
  });
});

/** Audyt Fali 3 — źródło wiadomości z panelu klienta: podgląd konta przez obsługę (impersonacja) to nie klient. */
describe('TicketsController — źródło wiadomości klienta', () => {
  function zbuduj() {
    const svc = {
      create: vi.fn(async () => ({ id: 't1' })),
      createWithOptionalFiles: vi.fn(async () => ({ id: 't1' })),
      addReply: vi.fn(async () => ({ id: 'r1' })),
      clientReplyWithFiles: vi.fn(async () => ({ id: 'r1' })),
    };
    const n = null as never;
    return { ctrl: new TicketsController(svc as never, n, n, n, n, n), svc };
  }
  const dto = { subject: 'Temat', message: 'Treść' } as never;

  it('klient w panelu → PANEL; operator „jako klient” → IMPERSONACJA (zgłoszenie i odpowiedź, z plikami i bez)', async () => {
    const { ctrl, svc } = zbuduj();
    await ctrl.create({ userId: 'k' }, dto);
    await ctrl.create({ userId: 'k', impersonatedBy: 'op' }, dto);
    expect(svc.create.mock.calls.map((c) => (c as unknown as [string, unknown, { zrodlo: string }])[2].zrodlo)).toEqual(['PANEL', 'IMPERSONACJA']);
    await ctrl.createWithAttachments({ userId: 'k', impersonatedBy: 'op' }, dto, []);
    expect((svc.createWithOptionalFiles.mock.calls[0] as unknown[])[4]).toBe('IMPERSONACJA');
    await ctrl.addReply('t1', { userId: 'k' }, { message: 'x' });
    await ctrl.addReply('t1', { userId: 'k', impersonatedBy: 'op' }, { message: 'x' });
    expect(svc.addReply.mock.calls.map((c) => (c as unknown[])[3])).toEqual(['PANEL', 'IMPERSONACJA']);
    await ctrl.clientReplyWithFiles('t1', { userId: 'k', impersonatedBy: 'op' }, { message: 'x' }, []);
    expect((svc.clientReplyWithFiles.mock.calls[0] as unknown[])[4]).toBe('IMPERSONACJA');
  });
});
