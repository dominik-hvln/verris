import { AuditService } from '../../src/common/audit/audit.service.js';
import { SubscriptionsAdminController } from '../../src/subscriptions/subscriptions.admin.controller.js';
import { UsersAdminService } from '../../src/users/users.admin.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F2.4 — listy usług i klientów w panelu operatora na prawdziwym PostgreSQL: filtry i stronicowanie w API
 * (wcześniej cichy limit 200), eksport CSV tych samych wierszy z wpisem w dzienniku.
 */
function kontrolerUslug() {
  const p = prisma() as never;
  return new (SubscriptionsAdminController as unknown as new (...a: unknown[]) => SubscriptionsAdminController)(
    null, p, null, null, null, null, null, null, null, new AuditService(p), null,
  );
}
const uzytkownicy = () => new UsersAdminService(prisma() as never, null as never, new AuditService(prisma() as never), null as never, null as never, null as never, null as never);
function odpowiedz() {
  const r = { naglowki: {} as Record<string, string>, tresc: '' };
  return { r, res: { setHeader: (k: string, v: string) => void (r.naglowki[k] = v), send: (t: string) => void (r.tresc = t) } };
}

describe('F2.4 — listy operatora (PostgreSQL)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('usługi: ponad 200 — wszystkie przez stronicowanie; filtry węzeł/plan/stan/wyszukiwanie; liczniki stanów', async () => {
    const [w1, w2] = [await utworzWezel(), await utworzWezel()];
    const [p1, p2] = [await utworzPlan({ productKind: 'HOSTING' }), await utworzPlan({ productKind: 'HOSTING' })];
    const konta = [];
    for (let i = 0; i < 205; i++) konta.push(await utworzKonto({ serverId: i < 200 ? w1.id : w2.id, planId: i % 2 ? p2.id : p1.id }));
    await prisma().subscription.updateMany({ data: { status: 'ACTIVE' } });
    await prisma().subscription.update({ where: { id: konta[3]!.subscription.id }, data: { status: 'PAST_DUE' } });
    await prisma().subscription.update({ where: { id: konta[204]!.subscription.id }, data: { status: 'PAST_DUE' } });
    const c = kontrolerUslug();

    const s1 = await c.list({ limit: '200' });
    expect(s1).toMatchObject({ total: 205, totalPages: 2, page: 1, liczby: { ACTIVE: 203, PAST_DUE: 2 } });
    expect(s1.rows).toHaveLength(200);
    const s2 = await c.list({ limit: '200', page: '2' });
    expect(s2.rows).toHaveLength(5);
    expect(new Set([...s1.rows, ...s2.rows].map((r) => r.id)).size).toBe(205);
    // Limit ponad 200 przycięty (nie cała tabela jednym żądaniem).
    expect((await c.list({ limit: '5000' })).limit).toBe(200);

    expect((await c.list({ serverId: w2.id })).total).toBe(5);
    expect((await c.list({ planId: p2.id })).total).toBe(102);
    const zalegle = await c.list({ status: 'PAST_DUE', serverId: w2.id });
    expect(zalegle.rows.map((r) => r.id)).toEqual([konta[204]!.subscription.id]);
    // Liczniki stanów liczone bez filtra stanu, z pozostałymi filtrami.
    expect(zalegle.liczby).toEqual({ ACTIVE: 4, PAST_DUE: 1 });
    expect((await c.list({ search: konta[7]!.account.domain.toUpperCase() })).rows.map((r) => r.id)).toEqual([konta[7]!.subscription.id]);
    expect((await c.list({ search: `#${konta[9]!.subscription.id.slice(0, 8)}` })).rows.map((r) => r.id)).toContain(konta[9]!.subscription.id);
    await expect(c.list({ status: 'NIEZNANY' })).rejects.toThrow(/Nieznany stan/);
  });

  it('usługi: CSV z tymi samymi filtrami, e-mail klienta, wpis w dzienniku (bez danych w szczegółach)', async () => {
    const w = await utworzWezel();
    const p = await utworzPlan({ productKind: 'HOSTING' });
    const a = await utworzKonto({ serverId: w.id, planId: p.id });
    await utworzKonto({ serverId: w.id, planId: p.id });
    await prisma().subscription.update({ where: { id: a.subscription.id }, data: { status: 'PAST_DUE' } });
    const { r, res } = odpowiedz();
    await kontrolerUslug().exportCsv({ status: 'PAST_DUE', page: '3' }, { userId: a.user.id }, res as never);
    const linie = r.tresc.replace(/^﻿/, '').trim().split('\r\n');
    expect(linie[0]).toBe('id,usluga,domena,plan,stan,cena,waluta,okres,koniec_okresu,klient_id,klient_email,wezel,zalozona');
    expect(linie).toHaveLength(2);
    expect(linie[1]).toContain(a.account.domain);
    expect(linie[1]).toContain(a.user.email);
    expect(r.naglowki['Content-Disposition']).toMatch(/verris-uslugi-\d{4}-\d{2}-\d{2}\.csv/);
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'OPERATOR_LIST_EXPORTED' } });
    expect(wpis).toMatchObject({ actorUserId: a.user.id, userId: null, details: { lista: 'uslugi', filtry: { status: 'PAST_DUE' }, wierszy: 1 } });
  });

  it('klienci: filtry stanu, salda i daty; eksport tylko kont klientów bez zanonimizowanych, z wpisem w dzienniku', async () => {
    const w = await utworzWezel();
    const p = await utworzPlan({ productKind: 'HOSTING' });
    const zalegly = await utworzKonto({ serverId: w.id, planId: p.id });
    await prisma().subscription.update({ where: { id: zalegly.subscription.id }, data: { status: 'PAST_DUE' } });
    const bogaty = await prisma().user.create({ data: { email: 'bogaty@test.verris.pl', passwordHash: 'x', walletBalance: 250, companyName: 'Firma Kowalski', nip: '1234563218' } });
    const stary = await prisma().user.create({ data: { email: 'stary@test.verris.pl', passwordHash: 'x', createdAt: new Date('2025-01-15T10:00:00Z'), loginBlocked: true } });
    await prisma().user.create({ data: { email: 'deleted-x@verris.local', passwordHash: 'x', anonymizedAt: new Date() } });
    await prisma().user.create({ data: { email: 'pracownik@test.verris.pl', passwordHash: 'x', role: 'STAFF' } });
    const svc = uzytkownicy();
    const emaile = async (o: Record<string, string>) => (await svc.list({ role: 'USER', ...o })).rows.map((r) => r.email).sort();

    expect(await emaile({ status: 'zalegle' })).toEqual([zalegly.user.email]);
    expect(await emaile({ status: 'zablokowane' })).toEqual(['stary@test.verris.pl']);
    expect(await emaile({ status: 'zanonimizowane' })).toEqual(['deleted-x@verris.local']);
    expect(await emaile({ saldoOd: '100' })).toEqual(['bogaty@test.verris.pl']);
    expect(await emaile({ saldoDo: '0,00', do: '2025-12-31' })).toEqual(['stary@test.verris.pl']);
    expect(await emaile({ od: '2026-01-01', search: 'kowalski' })).toEqual(['bogaty@test.verris.pl']);
    expect(await emaile({ search: '123-456-32-18' })).toEqual(['bogaty@test.verris.pl']);
    expect(await emaile({ search: bogaty.id.slice(0, 8) })).toEqual(['bogaty@test.verris.pl']);
    await expect(svc.list({ status: 'cos' })).rejects.toThrow(/Nieznany stan/);
    await expect(svc.list({ saldoOd: '1e9' })).rejects.toThrow(/kwota/);
    await expect(svc.list({ od: '10.10.2026' })).rejects.toThrow(/RRRR-MM-DD/);

    const csv = await svc.exportCustomersCsv({}, stary.id);
    const linie = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(linie[0]).toBe('id,email,imie,nazwisko,firma,nip,saldo,uslugi,blokada_logowania,wewnetrzne,2fa,zalozone');
    expect(linie).toHaveLength(4); // trzech klientów: bez pracownika i bez zanonimizowanego
    expect(csv).not.toContain('pracownik@');
    expect(csv).not.toContain('deleted-x@');
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'OPERATOR_LIST_EXPORTED' } });
    expect(wpis.details).toEqual({ lista: 'klienci', filtry: {}, wierszy: 3 });
  });
});
