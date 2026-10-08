import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { TicketContextService } from '../../src/tickets/ticket-context.service.js';
import { ZgloszenieDiagnostykaController } from '../../src/subscriptions/zgloszenie-diagnostyka.controller.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * PB-43 — zgłoszenie powiązane z usługą (decyzja właściciela 08.10: rdzeń przed betą). Na prawdziwej bazie:
 * zapis usługi przy tworzeniu, odmowa cudzej usługi i usługi spoza zakresu subkonta, zmiana powiązania
 * przez obsługę (oś zgłoszenia + dziennik), ON DELETE SET NULL, diagnostyka tylko dla powiązanej usługi.
 */
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const config = { get: () => undefined };
  const notifications = { create: async () => undefined };
  const ai = { supportSuggestion: async () => null };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, ai as never);
  const tickets = new TicketsService(p, mailer as never, config as never, null as never, audit, notifications as never, opieka);
  return { tickets, audit };
}

async function dwaKonta() {
  const serverId = (await utworzWezel()).id;
  const planId = (await utworzPlan({ productKind: 'HOSTING' })).id;
  const a = await utworzKonto({ serverId, planId });
  const b = await utworzKonto({ serverId, planId });
  const drugaA = await prisma().subscription.create({
    data: { userId: a.user.id, planId, interval: 'MONTH', priceAmount: 45 },
  });
  return { a, b, drugaA };
}

const tresc = { subject: 'Strona nie działa', message: 'Od rana błąd 500 na stronie głównej.' };

describe('PB-43 — zgłoszenie powiązane z usługą', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('klient wskazuje swoją usługę: zapis na zgłoszeniu, widok klienta i obsługi pokazuje usługę', async () => {
    const { tickets } = uslugi();
    const { a } = await dwaKonta();
    const t = await tickets.create(a.user.id, { ...tresc, subscriptionId: a.subscription.id });
    const row = await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.subscriptionId).toBe(a.subscription.id);

    const klient = (await tickets.findOne(t.id, a.user.id)) as unknown as { subscription: { id: string; account: { domain: string } } };
    expect(klient.subscription.id).toBe(a.subscription.id);
    expect(klient.subscription.account.domain).toBe(a.account.domain);
    const obsluga = (await tickets.adminFindOne(t.id)) as unknown as { subscription: { id: string } };
    expect(obsluga.subscription.id).toBe(a.subscription.id);
  });

  it('cudza usługa → odmowa, zgłoszenie nie powstaje', async () => {
    const { tickets } = uslugi();
    const { a, b } = await dwaKonta();
    await expect(tickets.create(a.user.id, { ...tresc, subscriptionId: b.subscription.id })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      tickets.createWithOptionalFiles(a.user.id, { ...tresc, subscriptionId: b.subscription.id }, []),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma().ticket.count()).toBe(0);
  });

  it('subkonto z zakresem usług: tylko usługa z zakresu', async () => {
    const { tickets } = uslugi();
    const { a, drugaA } = await dwaKonta();
    await expect(
      tickets.create(a.user.id, { ...tresc, subscriptionId: drugaA.id }, { zakresUslug: [a.subscription.id] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const ok = await tickets.create(a.user.id, { ...tresc, subscriptionId: a.subscription.id }, { zakresUslug: [a.subscription.id] });
    expect(ok.subscriptionId).toBe(a.subscription.id);
    // bez wskazania usługi zgłoszenie dalej można wysłać (sprawa konta, nie usługi)
    const bez = await tickets.create(a.user.id, tresc, { zakresUslug: [a.subscription.id] });
    expect(bez.subscriptionId).toBeNull();
  });

  it('obsługa zmienia powiązanie: oś zgłoszenia + dziennik; cudza usługa odrzucona; odłączenie', async () => {
    const { tickets } = uslugi();
    const { a, b, drugaA } = await dwaKonta();
    const operator = await prisma().user.create({ data: { email: `op-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const t = await tickets.create(a.user.id, { ...tresc, subscriptionId: a.subscription.id });

    const po = await tickets.adminLinkSubscription(t.id, operator.id, drugaA.id);
    expect(po.subscriptionId).toBe(drugaA.id);
    const ev = await prisma().ticketEvent.findFirstOrThrow({ where: { ticketId: t.id, type: 'SERVICE_LINK_CHANGED' } });
    expect(ev.actorId).toBe(operator.id);
    expect(ev.meta).toMatchObject({ from: a.subscription.id, to: drugaA.id });
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'TICKET_SERVICE_LINK_CHANGED' } });
    expect(wpis).toMatchObject({ userId: a.user.id, actorUserId: operator.id });

    await expect(tickets.adminLinkSubscription(t.id, operator.id, b.subscription.id)).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).subscriptionId).toBe(drugaA.id);

    // ta sama usługa drugi raz — bez nowego wpisu
    await tickets.adminLinkSubscription(t.id, operator.id, drugaA.id);
    expect(await prisma().ticketEvent.count({ where: { ticketId: t.id, type: 'SERVICE_LINK_CHANGED' } })).toBe(1);

    await tickets.adminLinkSubscription(t.id, operator.id, null);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).subscriptionId).toBeNull();
    expect(await prisma().auditLog.count({ where: { action: 'TICKET_SERVICE_LINK_CHANGED' } })).toBe(2);
  });

  it('usunięcie usługi zostawia zgłoszenie bez powiązania (ON DELETE SET NULL)', async () => {
    const { tickets } = uslugi();
    const { a, drugaA } = await dwaKonta();
    const t = await tickets.create(a.user.id, { ...tresc, subscriptionId: drugaA.id });
    await prisma().subscription.delete({ where: { id: drugaA.id } });
    const row = await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.subscriptionId).toBeNull();
  });

  it('szkic odpowiedzi bierze powiązaną usługę, nie najnowszą aktywną', async () => {
    const { tickets } = uslugi();
    const { a, drugaA } = await dwaKonta();
    // drugaA jest nowsza — bez powiązania szkic brał właśnie ją (pierwsza aktywna na liście)
    await prisma().account.create({
      data: { daUsername: `d${Date.now() % 100000}`, domain: 'druga-usluga.test', userId: a.user.id, serverId: a.account.serverId, subscriptionId: drugaA.id, status: 'ACTIVE' },
    });
    await prisma().subscription.updateMany({ where: { userId: a.user.id }, data: { status: 'ACTIVE' } });
    const t = await tickets.create(a.user.id, { subject: 'Pytanie', message: 'Mam pytanie o konfigurację.', subscriptionId: a.subscription.id });
    const vars = await new TicketContextService(prisma() as never).varsFor(t.id);
    expect(vars.domena).toBe(a.account.domain);
  });

  it('powiązana usługa starsza niż 10 najnowszych: jest w podglądzie (wybór „Zmień:”) i w szkicu odpowiedzi', async () => {
    const { tickets } = uslugi();
    const { a } = await dwaKonta();
    // a.subscription — najstarsza; nad nią 10 nowszych aktywnych usług (z drugaA z dwaKonta jest ich 11)
    await prisma().subscription.update({ where: { id: a.subscription.id }, data: { createdAt: new Date(Date.now() - 86_400_000) } });
    for (let i = 0; i < 9; i++) {
      await prisma().subscription.create({ data: { userId: a.user.id, planId: a.subscription.planId, interval: 'MONTH', priceAmount: 45 } });
    }
    await prisma().subscription.updateMany({ where: { userId: a.user.id }, data: { status: 'ACTIVE' } });
    const t = await tickets.create(a.user.id, { subject: 'Pytanie', message: 'Mam pytanie o konfigurację.', subscriptionId: a.subscription.id });

    const ctx = new TicketContextService(prisma() as never);
    const podglad = await ctx.contextFor(t.id);
    expect(podglad.services.map((s) => s.id)).toContain(a.subscription.id);
    expect(podglad.services).toHaveLength(11);
    expect((await ctx.varsFor(t.id)).domena).toBe(a.account.domain);
  });

  it('diagnostyka z rozmowy: tylko powiązana usługa, wpis w dzienniku', async () => {
    const { tickets, audit } = uslugi();
    const { a } = await dwaKonta();
    const operator = await prisma().user.create({ data: { email: `op2-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const wolane: string[] = [];
    const diagnostics = {
      forSubscription: async (id: string) => {
        wolane.push(id);
        return { subscriptionId: id, generatedAt: new Date().toISOString(), overall: 'ok', summary: 'ok', findings: [] };
      },
    };
    const c = new ZgloszenieDiagnostykaController(prisma() as never, diagnostics as never, audit);

    const bez = await tickets.create(a.user.id, tresc);
    await expect(c.diagnostyka(bez.id, { userId: operator.id })).rejects.toBeInstanceOf(BadRequestException);
    expect(wolane).toEqual([]);

    const z = await tickets.create(a.user.id, { ...tresc, subscriptionId: a.subscription.id });
    const wynik = await c.diagnostyka(z.id, { userId: operator.id });
    expect(wynik.subscriptionId).toBe(a.subscription.id);
    expect(wolane).toEqual([a.subscription.id]);
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'TICKET_DIAGNOSTICS_RUN' } });
    expect(wpis).toMatchObject({ userId: a.user.id, actorUserId: operator.id });
  });
});
