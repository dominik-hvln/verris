import { BadRequestException } from '@nestjs/common';
import { ResellerService } from './reseller.service.js';

/** O-08 — samodzielny wniosek o program resellerski: PENDING, bez wiązania klientów do akceptacji. */
function stanowisko(role = 'USER', profil: unknown = null) {
  let zapisany: Record<string, unknown> | null = profil as Record<string, unknown> | null;
  const repo = {
    findUnique: vi.fn(async () => zapisany),
    create: vi.fn(async (a: { data: Record<string, unknown> }) => (zapisany = { id: 'p1', createdAt: new Date(), updatedAt: new Date(), ...a.data })),
    findMany: vi.fn(async () => []),
    update: vi.fn(),
    count: vi.fn(),
  };
  const prisma = {
    user: { findUnique: vi.fn(async () => ({ role })), findMany: vi.fn(async (a: { where?: { role?: string } }) => (a.where?.role === 'ADMIN' ? [{ email: 'admin@x.pl' }] : [])) },
    resellerProfile: repo,
    subscription: { findMany: vi.fn(async () => []) },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const send = vi.fn(async () => undefined);
  return { svc: new ResellerService(prisma as never, audit as never, { send } as never), repo, audit, send };
}

describe('ResellerService — zatwierdzenie wniosku (O-08)', () => {
  it('PENDING → ACTIVE wysyła klientowi mail z linkiem; zawieszenie nie', async () => {
    const send = vi.fn(async () => undefined);
    const profil = { id: 'p', userId: 'u1', status: 'PENDING', brandName: 'Studio', markupPct: 25, code: 'rsl_abc', createdAt: new Date(), updatedAt: new Date() };
    const repo = { findUnique: vi.fn(async () => profil), update: vi.fn(async (a: { data: Record<string, unknown> }) => ({ ...profil, ...a.data })) };
    const prisma = { resellerProfile: repo, user: { findUnique: vi.fn(async () => ({ email: 'k@x.pl' })) } };
    const svc = new ResellerService(prisma as never, { record: vi.fn(async () => undefined) } as never, { send } as never);
    await svc.adminUpdate('u1', { status: 'ACTIVE' }, 'admin');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'k@x.pl', tag: 'reseller.approved' }));
    expect((send.mock.calls[0] as unknown as [{ text: string }])[0].text).toContain('reseller=rsl_abc');
    send.mockClear();
    repo.findUnique.mockResolvedValueOnce({ ...profil, status: 'ACTIVE' });
    await svc.adminUpdate('u1', { status: 'SUSPENDED' }, 'admin');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('ResellerService.apply (O-08)', () => {
  it('tworzy profil PENDING z kodem i wpisem w dzienniku', async () => {
    const s = stanowisko();
    const r = await s.svc.apply('u1', { brandName: '  Studio  ' });
    expect(s.repo.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', status: 'PENDING', brandName: 'Studio', markupPct: 20 }) });
    expect(r.status).toBe('PENDING');
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESELLER_APPLIED' }));
    expect(s.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@x.pl', tag: 'reseller.apply' }));
  });

  it('istniejący profil nie jest nadpisywany; konto obsługi → 400', async () => {
    const s = stanowisko('USER', { id: 'p', userId: 'u1', status: 'ACTIVE', brandName: null, markupPct: 30, code: 'rsl_x', createdAt: new Date(), updatedAt: new Date() });
    const r = await s.svc.apply('u1', {});
    expect(s.repo.create).not.toHaveBeenCalled();
    expect(r.status).toBe('ACTIVE');
    await expect(stanowisko('ADMIN').svc.apply('u1', {})).rejects.toThrow(BadRequestException);
  });
});

describe('ResellerService.createClient (O-06)', () => {
  function st(o: { status?: string; dzis?: number; istnieje?: boolean } = {}) {
    const profil = { id: 'p', userId: 'r1', status: o.status ?? 'ACTIVE', brandName: 'Studio X', markupPct: 20, code: 'rsl_a', createdAt: new Date(), updatedAt: new Date() };
    const tx = {
      user: { create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 'k1', ...a.data })) },
      userAuthToken: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      resellerProfile: { findUnique: vi.fn(async () => profil) },
      auditLog: { count: vi.fn(async () => o.dzis ?? 0) },
      user: { findFirst: vi.fn(async () => (o.istnieje ? { id: 'x' } : null)) },
      $transaction: vi.fn(async (f: (t: typeof tx) => unknown) => f(tx)),
    };
    const send = vi.fn(async () => undefined);
    const audit = { record: vi.fn(async () => undefined) };
    return { svc: new ResellerService(prisma as never, audit as never, { send } as never), tx, send, audit };
  }
  const dto = { email: ' Klient@Firma.pl ', firstName: 'Anna', lastName: 'Nowak' };

  it('konto przypisane do resellera, mail z marką i linkiem ustawienia hasła', async () => {
    const s = st();
    const r = await s.svc.createClient('r1', dto);
    expect(s.tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'klient@firma.pl', role: 'USER', resellerOwnerId: 'r1' }) });
    const mail = (s.send.mock.calls[0] as unknown as [{ subject: string; text: string }])[0];
    expect(mail.subject).toContain('Studio X');
    expect(mail.text).toContain('reset-password?token=');
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESELLER_CLIENT_CREATED', actorUserId: 'r1' }));
    expect(r.pozostaloDzis).toBe(9);
  });

  it('program nieaktywny → 403; limit dobowy → 429; zajęty adres → 409', async () => {
    await expect(st({ status: 'PENDING' }).svc.createClient('r1', dto)).rejects.toMatchObject({ status: 403 });
    await expect(st({ dzis: 10 }).svc.createClient('r1', dto)).rejects.toMatchObject({ status: 429 });
    await expect(st({ istnieje: true }).svc.createClient('r1', dto)).rejects.toMatchObject({ status: 409 });
  });
});

describe('ResellerService.setMarkup (O-07)', () => {
  it('aktywny reseller zmienia narzut w granicach 0–300; nieaktywny → 403', async () => {
    const profil = { id: 'p', userId: 'r1', status: 'ACTIVE', brandName: null, markupPct: 20, code: 'rsl_a', createdAt: new Date(), updatedAt: new Date() };
    const repo = { findUnique: vi.fn(async () => profil), update: vi.fn(async () => profil) };
    const prisma = { resellerProfile: repo, user: { findMany: vi.fn(async () => []) }, subscription: { findMany: vi.fn(async () => []) } };
    const svc = new ResellerService(prisma as never, { record: vi.fn(async () => undefined) } as never, { send: vi.fn() } as never);
    await svc.setMarkup('r1', 35);
    expect(repo.update).toHaveBeenCalledWith({ where: { userId: 'r1' }, data: { markupPct: 35 } });
    await expect(svc.setMarkup('r1', 301)).rejects.toMatchObject({ status: 400 });
    repo.findUnique.mockResolvedValueOnce({ ...profil, status: 'SUSPENDED' });
    await expect(svc.setMarkup('r1', 30)).rejects.toMatchObject({ status: 403 });
  });
});

describe('ResellerService — panel operatora', () => {
  it('lista pokazuje e-mail klienta, nie samo ID', async () => {
    const profil = { id: 'p', userId: 'u1', status: 'PENDING', brandName: null, markupPct: 20, code: 'rsl_a', createdAt: new Date(), updatedAt: new Date() };
    const prisma = { resellerProfile: { findMany: vi.fn(async () => [profil]) }, user: { findMany: vi.fn(async () => [{ id: 'u1', email: 'studio@x.pl' }]) } };
    const svc = new ResellerService(prisma as never, { record: vi.fn() } as never, { send: vi.fn() } as never);
    await expect(svc.adminList()).resolves.toEqual([expect.objectContaining({ userId: 'u1', email: 'studio@x.pl' })]);
  });

  it.each([
    ['subkonto', { role: 'USER', customerOwnerId: 'owner', anonymizedAt: null }],
    ['konto operatora', { role: 'STAFF', customerOwnerId: null, anonymizedAt: null }],
  ])('włączenie dla: %s → 400', async (_n, user) => {
    const prisma = { resellerProfile: { findUnique: vi.fn(), create: vi.fn() }, user: { findUnique: vi.fn(async () => ({ id: 'x', ...user })) } };
    const svc = new ResellerService(prisma as never, { record: vi.fn() } as never, { send: vi.fn() } as never);
    await expect(svc.adminEnable('x', { markupPct: 20 }, 'admin')).rejects.toThrow(BadRequestException);
    expect(prisma.resellerProfile.create).not.toHaveBeenCalled();
  });
});
