import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * F2.5 — zgłoszenie założone przez obsługę w imieniu klienta (karta klienta, skrzynka). Pierwsza wiadomość jest
 * od obsługi: zgłoszenie czeka na klienta, nie ma terminu pierwszej odpowiedzi, klient dostaje mail bez nazwiska
 * operatora, a w aktywności konta „obsługa Verris (zgłoszenie #…)” (D3). Dziennik: TICKET_OPENED_BY_STAFF.
 */
const maile: Array<{ tag?: string; to: string; text?: string; html?: string; subject?: string }> = [];

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async (m: (typeof maile)[number]) => void maile.push(m) };
  const config = { get: (k: string) => (k === 'clientPanelUrl' ? 'https://panel.test' : undefined) };
  const notifications = { create: async () => undefined };
  const ai = { supportSuggestion: async () => null };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, ai as never);
  return new TicketsService(p, mailer as never, config as never, null as never, audit, notifications as never, opieka);
}

async function operator() {
  return prisma().user.create({
    data: { email: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', firstName: 'Zenon', lastName: 'Operatorski' },
  });
}

const tresc = { subject: 'Wysyłka spamu z Twojego konta', message: 'Wykryliśmy masową wysyłkę z jednej skrzynki — zmień hasło.' };

describe('F2.5 — zgłoszenie w imieniu klienta', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    maile.length = 0;
  });
  afterAll(rozlacz);

  it('z karty klienta (userId): czeka na klienta, przypisane do zakładającego, mail i dziennik bez nazwiska', async () => {
    const tickets = uslugi();
    const op = await operator();
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan({ productKind: 'HOSTING' })).id });

    const { id } = await tickets.adminCreateOnBehalf(op.id, { ...tresc, userId: k.user.id, priority: 'HIGH', subscriptionId: k.subscription.id });

    const row = await prisma().ticket.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      userId: k.user.id,
      openedByStaffId: op.id,
      assignedToId: op.id,
      status: 'WAITING_CUSTOMER',
      lastReplyIsStaff: true,
      priority: 'HIGH',
      subscriptionId: k.subscription.id,
      slaResponseDueAt: null,
    });
    expect(row.firstResponseAt).not.toBeNull();
    expect(row.waitingSince).not.toBeNull();
    // Bez „Otrzymaliśmy Twoje zgłoszenie” — to my napisaliśmy.
    expect(await prisma().ticketReply.count({ where: { ticketId: id } })).toBe(0);
    expect(maile.map((m) => m.tag)).toEqual(['ticket.opened-by-staff']);
    expect(maile[0]!.to).toBe(k.user.email);
    expect(JSON.stringify(maile)).not.toMatch(/Zenon|Operatorski/);

    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'TICKET_OPENED_BY_STAFF' } });
    expect(wpis).toMatchObject({ userId: k.user.id, actorUserId: op.id });
    expect(wpis.details).toMatchObject({ zgloszenieId: id });
    const ev = await prisma().ticketEvent.findFirstOrThrow({ where: { ticketId: id, type: 'TICKET_CREATED' } });
    expect(ev).toMatchObject({ actorId: op.id, meta: { przezObsluge: true } });

    const widok = await tickets.findOne(id, k.user.id);
    expect(widok.zalozylaObsluga).toBe(true);
    expect(JSON.stringify(widok)).not.toContain(op.id);

    const aktywnosc = await new UsersService(prisma() as never, {} as never, {} as never, {} as never, {} as never, {} as never).listMyActivity(k.user.id);
    expect(aktywnosc.events.find((e) => e.action === 'TICKET_OPENED_BY_STAFF')?.actor).toBe(`obsługa Verris (zgłoszenie #${id.slice(0, 8)})`);
  });

  it('ze skrzynki (e-mail, wielkość liter bez znaczenia); zwykłe zgłoszenie klienta ma zalozylaObsluga=false', async () => {
    const tickets = uslugi();
    const op = await operator();
    const klient = await prisma().user.create({ data: { email: `Klient-${Date.now()}@Test.Verris.pl`, passwordHash: 'x' } });
    const { id } = await tickets.adminCreateOnBehalf(op.id, { ...tresc, email: `  ${klient.email.toLowerCase()} ` });
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id } })).userId).toBe(klient.id);

    const wlasne = await tickets.create(klient.id, { subject: 'Pytanie', message: 'Jak zmienić PHP na 8.3?' });
    expect((await tickets.findOne(wlasne.id, klient.id)).zalozylaObsluga).toBe(false);
  });

  it('odmowy: bez klienta albo z oboma polami, konto zespołu, anonimizowane, cudza usługa', async () => {
    const tickets = uslugi();
    const op = await operator();
    const wezel = (await utworzWezel()).id;
    const plan = (await utworzPlan({ productKind: 'HOSTING' })).id;
    const a = await utworzKonto({ serverId: wezel, planId: plan });
    const b = await utworzKonto({ serverId: wezel, planId: plan });
    await expect(tickets.adminCreateOnBehalf(op.id, { ...tresc })).rejects.toBeInstanceOf(BadRequestException);
    await expect(tickets.adminCreateOnBehalf(op.id, { ...tresc, userId: a.user.id, email: a.user.email })).rejects.toBeInstanceOf(BadRequestException);
    await expect(tickets.adminCreateOnBehalf(op.id, { ...tresc, email: op.email })).rejects.toBeInstanceOf(NotFoundException);
    await expect(tickets.adminCreateOnBehalf(op.id, { ...tresc, email: 'nikt@nigdzie.pl' })).rejects.toBeInstanceOf(NotFoundException);
    await prisma().user.update({ where: { id: b.user.id }, data: { anonymizedAt: new Date() } });
    await expect(tickets.adminCreateOnBehalf(op.id, { ...tresc, userId: b.user.id })).rejects.toBeInstanceOf(NotFoundException);
    await expect(tickets.adminCreateOnBehalf(op.id, { ...tresc, userId: a.user.id, subscriptionId: b.subscription.id })).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma().ticket.count()).toBe(0);
    expect(maile).toEqual([]);
  });
});
