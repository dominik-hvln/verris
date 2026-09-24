import { BadRequestException } from '@nestjs/common';
import { ResellerService } from './reseller.service';

/** O-08 — samodzielny wniosek o program resellerski: PENDING, bez wiązania klientów do akceptacji. */
function stanowisko(role = 'USER', profil: unknown = null) {
  let zapisany: Record<string, unknown> | null = profil as Record<string, unknown> | null;
  const repo = {
    findUnique: jest.fn(async () => zapisany),
    create: jest.fn(async (a: { data: Record<string, unknown> }) => (zapisany = { id: 'p1', createdAt: new Date(), updatedAt: new Date(), ...a.data })),
    findMany: jest.fn(async () => []),
    update: jest.fn(),
    count: jest.fn(),
  };
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ role })), findMany: jest.fn(async () => []) },
    resellerProfile: repo,
    subscription: { findMany: jest.fn(async () => []) },
  };
  const audit = { record: jest.fn(async () => undefined) };
  return { svc: new ResellerService(prisma as never, audit as never, { send: jest.fn(async () => undefined) } as never), repo, audit };
}

describe('ResellerService.apply (O-08)', () => {
  it('tworzy profil PENDING z kodem i wpisem w dzienniku', async () => {
    const s = stanowisko();
    const r = await s.svc.apply('u1', { brandName: '  Studio  ' });
    expect(s.repo.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', status: 'PENDING', brandName: 'Studio', markupPct: 20 }) });
    expect(r.status).toBe('PENDING');
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESELLER_APPLIED' }));
  });

  it('istniejący profil nie jest nadpisywany; konto obsługi → 400', async () => {
    const s = stanowisko('USER', { id: 'p', userId: 'u1', status: 'ACTIVE', brandName: null, markupPct: 30, code: 'rsl_x', createdAt: new Date(), updatedAt: new Date() });
    const r = await s.svc.apply('u1', {});
    expect(s.repo.create).not.toHaveBeenCalled();
    expect(r.status).toBe('ACTIVE');
    await expect(stanowisko('ADMIN').svc.apply('u1', {})).rejects.toThrow(BadRequestException);
  });
});
