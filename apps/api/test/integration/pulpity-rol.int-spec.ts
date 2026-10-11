import { Prisma } from '@verris/database';
import { PulpityRolService } from '../../src/admin-dashboard/pulpity-rol.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F3.9 — pulpity per rola na prawdziwej bazie: obsługa (moje zgłoszenia z terminami SLA, kolejka nieprzypisanych bez
 * scalonych i zamkniętych), NOC (flota bez sygnału, watchdog, nieudane zadania doby, kopie), finanse (KSeF odrzucone,
 * dokumenty do zapłaty, wpłaty do zaksięgowania; dla personelu bez kont zespołu).
 */
describe('F3.9 — pulpity per rola (Postgres)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);
  const teraz = Date.now();
  const za = (min: number) => new Date(teraz + min * 60_000);

  it('obsługa: moje zgłoszenia — po terminie, zagrożone, czeka na klienta; kolejka nieprzypisanych', async () => {
    const op = await prisma().user.create({ data: { email: `op-${teraz}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const inny = await prisma().user.create({ data: { email: `op2-${teraz}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const k = await prisma().user.create({ data: { email: `k-${teraz}@test.verris.pl`, passwordHash: 'x', companyName: 'Firma SA' } });
    const z = (o: Record<string, unknown>) => prisma().ticket.create({ data: { userId: k.id, subject: 'Temat', message: 'Treść', ...o } });
    const po = await z({ assignedToId: op.id, slaResponseDueAt: za(-30), subject: 'Po terminie' });
    await z({ assignedToId: op.id, slaResponseDueAt: za(60), subject: 'Zagrożone' });
    await z({ assignedToId: op.id, status: 'WAITING_CUSTOMER', firstResponseAt: za(-100), slaResolveDueAt: za(-10) });
    await z({ assignedToId: op.id, status: 'CLOSED', slaResponseDueAt: za(-30) });
    await z({ assignedToId: inny.id, slaResponseDueAt: za(-30) });
    const cel = await z({ priority: 'URGENT', slaResponseDueAt: za(-1) });
    await z({ scalonoDoId: cel.id, slaResponseDueAt: za(-1) });
    await z({ status: 'WAITING_CUSTOMER' });

    const p = await new PulpityRolService(prisma() as never).obsluga(op.id, teraz);
    expect(p.moje).toMatchObject({ otwarte: 3, poTerminie: 1, zagrozone: 1, czekaNaKlienta: 1 });
    expect(p.moje.lista[0]).toMatchObject({ id: po.id, temat: 'Po terminie', klient: 'Firma SA', stan: 'po-terminie', rodzajTerminu: 'odpowiedz' });
    expect(p.kolejka).toMatchObject({ nieprzypisane: 1, poTerminie: 1, pilne: 1 });
  });

  it('NOC: węzeł bez sygnału, usługa z watchdoga, nieudane zadanie doby, konto bez kopii', async () => {
    const plan = await utworzPlan();
    const w = await utworzWezel({ lastHeartbeatAt: new Date(teraz - 30 * 60_000), uslugiStan: [{ k: 'exim', s: 'failed', e: 'enabled' }], uslugiStanAt: new Date(teraz - 60_000) });
    const k = await utworzKonto({ serverId: w.id, planId: plan.id });
    await prisma().account.update({ where: { id: k.account.id }, data: { createdAt: new Date(teraz - 10 * 86400_000) } });
    await prisma().nodeTask.create({ data: { serverId: w.id, kind: 'NODE_SERVICES', status: 'FAILED', errorMessage: 'usługa nie działa po restarcie', completedAt: new Date(teraz - 3600_000) } });
    await prisma().nodeTask.create({ data: { serverId: w.id, kind: 'IP_BLOCKS', status: 'FAILED', completedAt: new Date(teraz - 3 * 86400_000) } });
    const p = await new PulpityRolService(prisma() as never).noc(teraz);
    expect(p.flota).toMatchObject({ aktywne: 1, bezSygnalu: 1 });
    expect(p.alerty.uslugi).toEqual([{ serverId: w.id, wezel: w.name, usluga: 'exim' }]);
    expect(p.kolejki).toMatchObject({ zadaniaBledyDoba: 1, bledy: [expect.objectContaining({ rodzaj: 'NODE_SERVICES', blad: 'usługa nie działa po restarcie' })] });
    expect(p.kopie.kontaBezSwiezejKopii).toBe(1);
  });

  it('finanse: KSeF odrzucone i do dosłania, dokumenty do zapłaty (po terminie), wpłaty do zaksięgowania; personel bez kont zespołu', async () => {
    const k = await prisma().user.create({ data: { email: `kf-${teraz}@test.verris.pl`, passwordHash: 'x' } });
    const zespol = await prisma().user.create({ data: { email: `z-${teraz}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    let n = 0;
    const f = (userId: string, o: Record<string, unknown>) =>
      prisma().invoice.create({ data: { userId, number: `${o.rodzajPrawny ? 'VDR' : 'T'}/${teraz}/${++n}`, amount: new Prisma.Decimal('100.00'), currency: 'PLN', ...o } });
    await f(k.id, { status: 'PAID', ksefStatus: 'REJECTED', ksefError: 'Błąd schematu', issuedAt: new Date() });
    await f(k.id, { status: 'PAID', ksefStatus: 'OFFLINE' });
    await f(k.id, { status: 'OPEN', dueAt: za(-60) });
    await f(k.id, { status: 'OPEN', dueAt: za(600) });
    await f(zespol.id, { status: 'OPEN', dueAt: za(-60) });
    await f(k.id, { status: 'PAID', rodzajPrawny: 'DOKUMENT_ROZLICZENIOWY', issuedAt: new Date() });
    const svc = new PulpityRolService(prisma() as never);
    const staff = await svc.finanse({ userId: 'f1', role: 'STAFF' }, teraz);
    expect(staff.ksef).toMatchObject({ odrzucone: 1, doDoslania: 1, lista: [expect.objectContaining({ blad: 'Błąd schematu', klient: k.email })] });
    expect(staff.doZaplaty).toEqual({ dokumentow: 2, kwota: '200', poTerminie: 1 });
    expect(staff.doZaksiegowania.wplat).toBe(1);
    expect(staff.nieudanePlatnosci).toBeNull();
    const admin = await svc.finanse({ userId: 'a1', role: 'ADMIN' }, teraz);
    expect(admin.doZaplaty).toMatchObject({ dokumentow: 3, poTerminie: 2 });
  });
});
