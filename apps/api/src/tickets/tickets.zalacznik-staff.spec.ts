import { ForbiddenException } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';

/** Przegląd 28.09 — pracownik pobiera załącznik zgłoszenia tylko z uprawnieniem TICKETS_VIEW. */
function zbuduj(perms: string[] | null) {
  const prisma = {
    ticket: { findUnique: vi.fn(async () => ({ userId: 'klient1' })) },
    ticketAttachment: { findFirst: vi.fn(async () => ({ id: 'a1', storageKey: 'k', mimeType: 'text/plain', originalName: 'x.txt' })) },
    user: { findUnique: vi.fn(async () => (perms === null ? { staffRole: null } : { staffRole: { permissions: perms } })) },
  };
  const s = new TicketsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { s, prisma };
}

describe('getAttachmentForDownload — pracownik', () => {
  it('z TICKETS_VIEW pobiera', async () => {
    await expect(zbuduj(['TICKETS_VIEW']).s.getAttachmentForDownload('t1', 'a1', 'p1', 'STAFF')).resolves.toMatchObject({ id: 'a1' });
  });

  it.each([[['NODES_VIEW']], [null]])('bez TICKETS_VIEW (%j) → 403', async (perms) => {
    const { s, prisma } = zbuduj(perms);
    await expect(s.getAttachmentForDownload('t1', 'a1', 'p1', 'STAFF')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.ticketAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('admin i właściciel zgłoszenia bez zmian', async () => {
    await expect(zbuduj(null).s.getAttachmentForDownload('t1', 'a1', 'adm', 'ADMIN')).resolves.toMatchObject({ id: 'a1' });
    await expect(zbuduj(null).s.getAttachmentForDownload('t1', 'a1', 'klient1', 'USER')).resolves.toMatchObject({ id: 'a1' });
  });
});
