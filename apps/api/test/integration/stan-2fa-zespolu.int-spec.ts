import { UsersAdminService } from '../../src/users/users.admin.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Fala 1B (plan 3c, poz. 17 — tylko odczyt, bez przełącznika wymuszenia, decyzja D10) — lista operatorów
 * pokazuje, kto w zespole ma 2FA i ile passkey. Liczba passkey liczona jednym groupBy na prawdziwym
 * PostgreSQL tylko dla kont STAFF/ADMIN; klienci na tej samej liście nie dostają nowego pola (null).
 */
describe('Fala 1B — stan 2FA i passkey zespołu na liście użytkowników', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('passkey policzone dla STAFF i ADMIN, klient — null', async () => {
    const t = Date.now();
    const staff = await prisma().user.create({ data: { email: `staff-${t}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', isTwoFactorEnabled: true } });
    const admin = await prisma().user.create({ data: { email: `admin-${t}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const klient = await prisma().user.create({ data: { email: `klient-${t}@test.verris.pl`, passwordHash: 'x', role: 'USER' } });
    for (const [userId, n] of [[staff.id, 2], [klient.id, 1]] as const) {
      for (let i = 0; i < n; i++) {
        await prisma().webAuthnCredential.create({ data: { userId, credentialId: `cred-${userId}-${i}`, publicKey: 'pk' } });
      }
    }

    const svc = new UsersAdminService(prisma() as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const { rows } = await svc.list({ limit: 50 });
    const po = (id: string) => rows.find((r) => r.id === id)!;
    expect(po(staff.id)).toMatchObject({ isTwoFactorEnabled: true, passkeys: 2 });
    expect(po(admin.id)).toMatchObject({ isTwoFactorEnabled: false, passkeys: 0 });
    expect(po(klient.id).passkeys).toBeNull();
  });
});
