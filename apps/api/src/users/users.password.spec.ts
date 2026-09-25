import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';

/** Zmiana hasła: stare hasło wymagane; po zmianie inne urządzenia tracą sesję, bieżące nie. */
describe('UsersService.changePassword', () => {
  async function stanowisko() {
    const passwordHash = await bcrypt.hash('stare-haslo', 4);
    const prisma = {
      user: { findUnique: jest.fn(async () => ({ id: 'u1', email: 'k@x.pl', firstName: 'K', passwordHash })), update: jest.fn(async () => ({})) },
      userSession: { updateMany: jest.fn(async () => ({ count: 2 })) },
    };
    const svc = new UsersService(prisma as never, {} as never, {} as never, {} as never, { send: jest.fn(async () => undefined) } as never);
    jest.spyOn(svc as unknown as { notifyPasswordChanged: () => Promise<void> }, 'notifyPasswordChanged').mockResolvedValue(undefined);
    return { svc, prisma };
  }

  it('złe aktualne hasło → 401, bez zmian i bez wylogowania', async () => {
    const s = await stanowisko();
    await expect(s.svc.changePassword('u1', { currentPassword: 'zle', newPassword: 'Nowe-haslo-123!' } as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(s.prisma.user.update).not.toHaveBeenCalled();
    expect(s.prisma.userSession.updateMany).not.toHaveBeenCalled();
  });

  it('poprawne → nowe hasło i unieważnienie wszystkich sesji poza bieżącą', async () => {
    const s = await stanowisko();
    await s.svc.changePassword('u1', { currentPassword: 'stare-haslo', newPassword: 'Nowe-haslo-123!' } as never, { ip: null, userAgent: null, sid: 'biezaca' });
    expect(s.prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null, NOT: { id: 'biezaca' } },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
