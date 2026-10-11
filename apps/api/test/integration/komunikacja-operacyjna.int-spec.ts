import { AuditService } from '../../src/common/audit/audit.service.js';
import { KomunikatySerwisoweService, WYSYLANIE_PRZETERMINOWANE_MS } from '../../src/komunikacja/komunikaty-serwisowe.service.js';
import { StatusObslugiService } from '../../src/komunikacja/status-obslugi.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F3.8 — komunikat serwisowy do klientów węzła albo planu na prawdziwej bazie (migracja 20261011230000): odbiorcy
 * zamrożeni przy zleceniu (tylko właściciele z aktywnym kontem na węźle / usługą w planie, bez zanonimizowanych
 * i bez kont zespołu), wysyłka kolejką z limitem, jeden mail na odbiorcę także przy dwóch równoległych przebiegach,
 * zatrzymanie, odbiorca „w trakcie” po awarii procesu nie dostaje drugiego maila. Baner incydentów dla obsługi.
 */
describe('F3.8 — komunikaty serwisowe i baner (Postgres)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().komunikatSerwisowyOdbiorca.deleteMany({});
    await prisma().komunikatSerwisowy.deleteMany({});
  });
  afterAll(rozlacz);

  const TRESC = 'Dzień dobry{imie},\n\nwykryliśmy problem z serwerem, na którym działa Twoja usługa. Pracujemy nad tym.\n\nZespół obsługi Verris';

  function usluga(wysylka: { pada?: boolean } = {}) {
    const wyslane: Array<{ to: string; userId?: string; text: string; category?: string }> = [];
    const mailer = {
      send: async (m: { to: string; userId?: string; text: string; category?: string }) => {
        wyslane.push(m);
        return { providerId: 'smtp', messageId: 'm', emailLogId: null, delivered: !wysylka.pada };
      },
    };
    const p = prisma() as never;
    return { svc: new KomunikatySerwisoweService(p, new AuditService(p), mailer as never, { get: () => undefined } as never), wyslane };
  }

  it('węzeł: podgląd = zlecenie (właściciele aktywnych kont), kolejka z limitem, każdy dostaje jeden mail z imieniem, stop i koniec', async () => {
    const plan = await utworzPlan();
    const w = await utworzWezel();
    const inny = await utworzWezel();
    const a = await utworzKonto({ serverId: w.id, planId: plan.id });
    const b = await utworzKonto({ serverId: w.id, planId: plan.id });
    const c = await utworzKonto({ serverId: w.id, planId: plan.id });
    await utworzKonto({ serverId: w.id, planId: plan.id, status: 'SUSPENDED' });
    await utworzKonto({ serverId: inny.id, planId: plan.id });
    const anon = await utworzKonto({ serverId: w.id, planId: plan.id });
    await prisma().user.update({ where: { id: anon.user.id }, data: { anonymizedAt: new Date() } });
    // Drugie konto tego samego klienta na węźle — jeden mail.
    const drugie = await utworzKonto({ serverId: w.id, planId: plan.id });
    await prisma().account.update({ where: { id: drugie.account.id }, data: { userId: a.user.id } });
    await prisma().subscription.update({ where: { id: drugie.subscription.id }, data: { userId: a.user.id } });
    await prisma().user.delete({ where: { id: drugie.user.id } });
    await prisma().user.update({ where: { id: a.user.id }, data: { firstName: 'Anna' } });

    const { svc, wyslane } = usluga();
    const z = { zakres: 'WEZEL' as const, celId: w.id, temat: 'Awaria serwera — pracujemy nad tym', tresc: TRESC };
    const podglad = await svc.podglad(z);
    expect(podglad).toMatchObject({ odbiorcow: 3, cel: { id: w.id }, przekroczono: false });
    expect(podglad.przyklad.map((x) => x.id).sort()).toEqual([a.user.id, b.user.id, c.user.id].sort());
    await expect(svc.zlec({ ...z, tresc: `${TRESC}\n\nPrzy okazji: rabat na domeny!`, powod: 'awaria dysku na węźle' })).rejects.toThrow(/promocyjnych/);
    await expect(svc.zlec({ ...z, powod: 'krótko' })).rejects.toThrow(/powód/);

    const k = await svc.zlec({ ...z, powod: 'awaria dysku na węźle, incydent #1' });
    expect(k).toMatchObject({ status: 'WYSYLANY', odbiorcow: 3, wyslano: 0 });
    // Klient przeniesiony na inny węzeł po zleceniu — i tak dostaje komunikat o tym incydencie (lista zamrożona).
    await prisma().account.updateMany({ where: { userId: c.user.id }, data: { serverId: inny.id } });

    // Dwa równoległe przebiegi kolejki z limitem 2 — razem najwyżej 3 maile, każdy odbiorca raz.
    await Promise.all([svc.wyslijPaczke(2), svc.wyslijPaczke(2)]);
    await svc.wyslijPaczke(2);
    expect(wyslane.map((m) => m.userId).sort()).toEqual([a.user.id, b.user.id, c.user.id].sort());
    expect(wyslane.every((m) => m.category === 'TRANSACTIONAL')).toBe(true);
    expect(wyslane.find((m) => m.userId === a.user.id)!.text).toContain('Dzień dobry Anna,');
    expect(wyslane.find((m) => m.userId === b.user.id)!.text).toContain('Dzień dobry,');
    expect(await svc.widok(k.id)).toMatchObject({ status: 'WYSLANY', wyslano: 3, bledow: 0, pominieto: 0, zakonczono: expect.any(String) });
    await expect(svc.zatrzymaj(k.id, a.user.id)).rejects.toThrow(/nie jest już wysyłany/);
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'SERVICE_NOTICE_QUEUED' } });
    expect(wpis.details).toMatchObject({ komunikatId: k.id, zakres: 'WEZEL', odbiorcow: 3, powod: 'awaria dysku na węźle, incydent #1' });
  });

  it('plan: usługi ACTIVE i PAST_DUE; zatrzymanie pomija resztę; odbiorca „w trakcie” po awarii — błąd, bez drugiego maila', async () => {
    const plan = await utworzPlan();
    const w = await utworzWezel();
    const konta = await Promise.all([1, 2, 3, 4].map(() => utworzKonto({ serverId: w.id, planId: plan.id })));
    await prisma().subscription.updateMany({ where: { id: { in: konta.slice(0, 3).map((k) => k.subscription.id) } }, data: { status: 'ACTIVE' } });
    await prisma().subscription.update({ where: { id: konta[2].subscription.id }, data: { status: 'PAST_DUE' } });
    // konta[3] — PENDING_PAYMENT: poza zakresem planu.
    const { svc, wyslane } = usluga();
    const k = await svc.zlec({ zakres: 'PLAN', celId: plan.id, temat: 'Prace serwisowe w nocy', tresc: TRESC, powod: 'aktualizacja stosu w planie' });
    expect(k.odbiorcow).toBe(3);

    // Proces padł w trakcie wysyłki do pierwszego odbiorcy (WYSYLANIE od dawna) — nie wysyłamy drugi raz.
    const pierwszy = await prisma().komunikatSerwisowyOdbiorca.findFirstOrThrow({ where: { komunikatId: k.id }, orderBy: { userId: 'asc' } });
    await prisma().komunikatSerwisowyOdbiorca.update({ where: { id: pierwszy.id }, data: { status: 'WYSYLANIE', zmieniono: new Date(Date.now() - WYSYLANIE_PRZETERMINOWANE_MS - 1000) } });
    await svc.wyslijPaczke(1);
    expect(wyslane.map((m) => m.userId)).not.toContain(pierwszy.userId);
    expect(wyslane).toHaveLength(1);
    const po = await svc.zatrzymaj(k.id, konta[0].user.id);
    expect(po).toMatchObject({ status: 'ZATRZYMANY', wyslano: 1, bledow: 1, pominieto: 1 });
    await svc.wyslijPaczke(10);
    expect(wyslane).toHaveLength(1);
  });

  it('błąd serwera poczty: odbiorca z błędem, komunikat kończy się (bez pętli ponowień)', async () => {
    const plan = await utworzPlan();
    const w = await utworzWezel();
    await utworzKonto({ serverId: w.id, planId: plan.id });
    const { svc } = usluga({ pada: true });
    const k = await svc.zlec({ zakres: 'WEZEL', celId: w.id, temat: 'Awaria serwera — pracujemy', tresc: TRESC, powod: 'awaria sieci w DC' });
    await svc.wyslijPaczke();
    expect(await svc.widok(k.id)).toMatchObject({ status: 'WYSLANY', wyslano: 0, bledow: 1 });
  });

  it('baner obsługi: otwarte incydenty i prace (trwające, najbliższe 24 h) z węzłem i liczbą aktywnych kont', async () => {
    const plan = await utworzPlan();
    const w = await utworzWezel();
    await utworzKonto({ serverId: w.id, planId: plan.id });
    await utworzKonto({ serverId: w.id, planId: plan.id });
    const sonda = await prisma().serviceProbe.create({ data: { serverId: w.id, kind: 'HTTPS', target: 'https://example.test', label: 'Strony klientów' } });
    await prisma().probeIncident.create({ data: { probeId: sonda.id, severity: 'MAJOR', title: 'Strony na węźle nie odpowiadają' } });
    await prisma().probeIncident.create({ data: { probeId: sonda.id, severity: 'MINOR', title: 'stary', status: 'RESOLVED', resolvedAt: new Date() } });
    const teraz = new Date();
    await prisma().maintenanceWindow.create({ data: { serverId: w.id, title: 'Wymiana dysku', scheduledStart: new Date(teraz.getTime() + 3600_000), scheduledEnd: new Date(teraz.getTime() + 7200_000) } });
    await prisma().maintenanceWindow.create({ data: { title: 'Za tydzień', scheduledStart: new Date(teraz.getTime() + 7 * 86400_000), scheduledEnd: new Date(teraz.getTime() + 7 * 86400_000 + 3600_000) } });
    const b = await new StatusObslugiService(prisma() as never).biezace(teraz);
    expect(b.incydenty).toEqual([expect.objectContaining({ tytul: 'Strony na węźle nie odpowiadają', powazny: true, usluga: 'Strony klientów', wezel: { id: w.id, nazwa: w.name, kont: 2 } })]);
    expect(b.prace).toEqual([expect.objectContaining({ tytul: 'Wymiana dysku', trwa: false, wezel: { id: w.id, nazwa: w.name, kont: 2 }, calaPlatforma: false })]);
    await prisma().serviceProbe.deleteMany({});
    await prisma().maintenanceWindow.deleteMany({});
  });
});
