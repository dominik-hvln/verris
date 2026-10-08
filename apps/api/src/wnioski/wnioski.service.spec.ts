import { ConflictException, NotFoundException } from '@nestjs/common';
import { WnioskiService } from './wnioski.service.js';

/**
 * PB-48 — WnioskiService bez bazy, z deterministycznym przeplotem:
 *  - dwie równoległe akceptacje, obie czytają PENDING — tylko warunkowe przejęcie (status PENDING) chroni
 *    przed podwójnym wykonaniem (typ bez klucza idempotencji: konto wewnętrzne),
 *  - drugi identyczny oczekujący wniosek tego samego pracownika → 409,
 *  - usługa przy wniosku musi należeć do klienta wniosku.
 */
type Wiersz = Record<string, unknown> & { id: string; status: string };

function zbuduj() {
  const wnioski = new Map<string, Wiersz>();
  const osoba = (id: string) => ({ id, email: `${id}@verris.pl`, firstName: null, lastName: null });
  const zWiazaniami = (w: Wiersz) => ({ ...w, requestedBy: osoba(String(w.requestedById)), decidedBy: null, customer: osoba(String(w.customerId)) });
  const pasuje = (w: Wiersz, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => w[k] === v);
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
        if (select?.staffRoleAssignments) return { staffRole: { id: 'r', name: 'L1', permissions: ['CUSTOMERS_VIEW'] }, staffRoleAssignments: [] };
        return { id: where.id, role: 'USER', anonymizedAt: null, isInternal: false };
      }),
      findMany: vi.fn(async () => []),
    },
    subscription: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'sub-k1' ? { userId: 'k1' } : where.id === 'sub-k2' ? { userId: 'k2' } : null)),
    },
    operatorRequest: {
      // Celowo „stary” odczyt: każdy decydujący widzi PENDING, jak przy równoczesnych kliknięciach.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const w = wnioski.get(where.id);
        return w ? zWiazaniami({ ...w, status: 'PENDING' }) : null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => zWiazaniami(wnioski.get(where.id)!)),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => [...wnioski.values()].filter((w) => pasuje(w, where))),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const w: Wiersz = { id: `w${wnioski.size + 1}`, status: 'PENDING', decidedById: null, decisionReason: null, decidedAt: null, result: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        wnioski.set(w.id, w);
        return zWiazaniami(w);
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const w = wnioski.get(String(where.id));
        if (!w || !pasuje(w, where)) return { count: 0 };
        Object.assign(w, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const w = wnioski.get(where.id)!;
        Object.assign(w, data);
        return zWiazaniami(w);
      }),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const notifications = { create: vi.fn(async () => undefined) };
  const users = { patchCustomerOperational: vi.fn(async () => ({ ok: true })) };
  const svc = new WnioskiService(prisma as never, audit as never, notifications as never, users as never, {} as never, {} as never);
  return { svc, prisma, users, wnioski };
}

const L1 = { userId: 'l1', role: 'STAFF' };
const ADMIN_A = { userId: 'adm-a', role: 'ADMIN' };
const ADMIN_B = { userId: 'adm-b', role: 'ADMIN' };
const flaga = (o: Partial<{ userId: string; subscriptionId: string; isInternal: boolean }> = {}) => ({
  typ: 'CUSTOMER_INTERNAL_FLAG',
  userId: o.userId ?? 'k1',
  subscriptionId: o.subscriptionId,
  payload: { isInternal: o.isInternal ?? true },
  uzasadnienie: 'Konto testowe zespołu.',
});

describe('PB-48 — WnioskiService', () => {
  it('dwie równoległe akceptacje, obie widzą PENDING: operacja wykonana raz, druga 409', async () => {
    const { svc, users } = zbuduj();
    const w = await svc.zloz(L1, flaga());
    const wyniki = await Promise.allSettled([svc.akceptuj(w.id, ADMIN_A), svc.akceptuj(w.id, ADMIN_B)]);
    expect(wyniki.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const odmowa = wyniki.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(odmowa.reason).toBeInstanceOf(ConflictException);
    expect(users.patchCustomerOperational).toHaveBeenCalledTimes(1);
  });

  it('ten sam oczekujący wniosek drugi raz → 409; dla innego klienta albo po rozpatrzeniu poprzedniego — można', async () => {
    const { svc, wnioski } = zbuduj();
    const w = await svc.zloz(L1, flaga());
    await expect(svc.zloz(L1, flaga())).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.zloz(L1, flaga({ userId: 'k2' }))).resolves.toMatchObject({ status: 'PENDING' });
    wnioski.get(w.id)!.status = 'REJECTED';
    await expect(svc.zloz(L1, flaga())).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('usługa przy wniosku musi należeć do klienta wniosku', async () => {
    const { svc, prisma } = zbuduj();
    await expect(svc.zloz(L1, flaga({ subscriptionId: 'sub-k2' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.zloz(L1, flaga({ subscriptionId: 'brak' }))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.operatorRequest.create).not.toHaveBeenCalled();
    await expect(svc.zloz(L1, flaga({ subscriptionId: 'sub-k1' }))).resolves.toMatchObject({ subscriptionId: 'sub-k1' });
  });
});
