import { UnauthorizedException } from '@nestjs/common';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { ServerIdentityGuard } from './server-identity.guard.js';

/**
 * Audyt 13.10 (do potwierdzenia #5, server-identity.guard.ts:legacy-plaintext-branch-accepts-stored-hash):
 * gałąź „starego tokenu jawnym tekstem” porównywała nagłówek z kolumną wprost — także gdy w kolumnie był
 * już skrót SHA-256. Kto znał sam skrót (zrzut bazy, kopia), przechodził jako węzeł, a „upgrade” zapisywał
 * sha256(skrótu) i odcinał prawdziwy węzeł.
 */
const crypto = Object.create(CryptoService.prototype) as CryptoService;

function stanowisko(identityToken: string) {
  const update = vi.fn(async () => ({}));
  const prisma = {
    server: { findUnique: vi.fn(async () => ({ id: 'srv-1', identityToken, status: 'ACTIVE' })), update },
  };
  const guard = new ServerIdentityGuard(prisma as never, crypto);
  const ctx = (token: string) => {
    const req: Record<string, unknown> = { headers: { 'x-server-id': 'srv-1', 'x-server-token': token } };
    return { req, c: { switchToHttp: () => ({ getRequest: () => req }) } as never };
  };
  return { guard, update, ctx };
}

describe('ServerIdentityGuard — token węzła', () => {
  const token = 'TOKEN-FIKCYJNY-WEZLA';
  const skrot = crypto.sha256Hex(token);

  it('prawdziwy token przy zapisanym skrócie → przepuszcza', async () => {
    const s = stanowisko(skrot);
    const { req, c } = s.ctx(token);
    await expect(s.guard.canActivate(c)).resolves.toBe(true);
    expect(req.serverId).toBe('srv-1');
    expect(s.update).not.toHaveBeenCalled();
  });

  it('sam zapisany skrót jako token → odmowa i bez zmiany tożsamości w bazie', async () => {
    const s = stanowisko(skrot);
    await expect(s.guard.canActivate(s.ctx(skrot).c)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(s.update).not.toHaveBeenCalled();
  });

  it('stary wiersz z jawnym tokenem → przepuszcza raz i zapisuje skrót', async () => {
    const s = stanowisko(token);
    await expect(s.guard.canActivate(s.ctx(token).c)).resolves.toBe(true);
    expect(s.update).toHaveBeenCalledWith({ where: { id: 'srv-1' }, data: { identityToken: skrot } });
  });
});
