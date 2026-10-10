import { BadRequestException, ConflictException } from '@nestjs/common';
import { RUNBOOKI } from '@verris/contracts';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * F2.5 — tagi zgłoszeń, eskalacja z powodem i cofnięciem, zdejmowana flaga ryzyka, kroki runbooka w wątku.
 * Na prawdziwej bazie: oś zgłoszenia, dziennik, priorytet sprzed eskalacji, klient nie widzi tagów ani kroków.
 */
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async () => undefined };
  const config = { get: () => undefined };
  const notifications = { create: async () => undefined };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, { supportSuggestion: async () => null } as never);
  return new TicketsService(p, mailer as never, config as never, null as never, audit, notifications as never, opieka);
}

async function przygotuj(priority = 'NORMAL') {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const op = await prisma().user.create({ data: { email: `op-${s}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
  const klient = await prisma().user.create({ data: { email: `kl-${s}@test.verris.pl`, passwordHash: 'x' } });
  const tickets = uslugi();
  const t = await tickets.create(klient.id, { subject: 'Poczta nie dochodzi', message: 'Od wczoraj nie dostaję maili.', priority });
  return { tickets, op, klient, t };
}

describe('F2.5 — tagi, eskalacja, ryzyko, runbook', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('tagi: normalizacja, zmiana na osi, lista w użyciu; klient ich nie widzi', async () => {
    const { tickets, op, klient, t } = await przygotuj();
    expect((await tickets.adminSetTags(t.id, op.id, [' Poczta ', 'spam out', 'poczta'])).tags).toEqual(['poczta', 'spam-out']);
    await tickets.adminSetTags(t.id, op.id, ['poczta', 'vip']);
    const ev = await prisma().ticketEvent.findMany({ where: { ticketId: t.id, type: 'TAGS_CHANGED' }, orderBy: { createdAt: 'asc' } });
    expect(ev.map((e) => e.meta)).toEqual([
      { dodane: 'poczta, spam-out', usuniete: null },
      { dodane: 'vip', usuniete: 'spam-out' },
    ]);
    // ta sama lista — bez wpisu na osi
    await tickets.adminSetTags(t.id, op.id, ['vip', 'poczta']);
    expect(await prisma().ticketEvent.count({ where: { ticketId: t.id, type: 'TAGS_CHANGED' } })).toBe(2);

    const t2 = await tickets.create(klient.id, { subject: 'Drugie', message: 'Drugie zgłoszenie klienta.' });
    await tickets.adminSetTags(t2.id, op.id, ['vip']);
    expect(await tickets.adminListTags()).toEqual([
      { tag: 'vip', liczba: 2 },
      { tag: 'poczta', liczba: 1 },
    ]);
    expect(JSON.stringify(await tickets.findOne(t.id, klient.id))).not.toContain('vip');

    await expect(tickets.adminSetTags(t.id, op.id, ['zły;tag'])).rejects.toBeInstanceOf(BadRequestException);
    await expect(tickets.adminSetTags(t.id, op.id, Array.from({ length: 11 }, (_, i) => `t${i}`))).rejects.toThrow(/Najwyżej 10/);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).tags).toEqual(['poczta', 'vip']);
  });

  it('eskalacja: druga odrzucona; cofnięcie z powodem przywraca priorytet sprzed eskalacji; oś i dziennik', async () => {
    const { tickets, op, klient, t } = await przygotuj('HIGH');
    await expect(tickets.adminUndoEscalation(t.id, op.id, 'Pomyłka przy przypisaniu')).rejects.toThrow(/nie jest eskalowane/);
    await tickets.adminEscalateTicket(t.id, op.id, 'Klient traci sprzedaż, potrzebny L3');
    expect(await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ priority: 'URGENT', escalationReason: 'Klient traci sprzedaż, potrzebny L3' });
    await expect(tickets.adminEscalateTicket(t.id, op.id, 'Druga eskalacja tego samego')).rejects.toBeInstanceOf(ConflictException);

    await expect(tickets.adminUndoEscalation(t.id, op.id, 'krótko')).rejects.toThrow(/min\. 10/);
    await tickets.adminUndoEscalation(t.id, op.id, 'Rozwiązane na L2, bez potrzeby L3');
    expect(await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({
      priority: 'HIGH',
      escalatedAt: null,
      escalatedById: null,
      escalationReason: null,
    });
    const ev = await prisma().ticketEvent.findFirstOrThrow({ where: { ticketId: t.id, type: 'ESCALATION_UNDONE' } });
    expect(ev).toMatchObject({ actorId: op.id, meta: { reason: 'Rozwiązane na L2, bez potrzeby L3', priorytet: 'HIGH' } });
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'TICKET_ESCALATION_UNDONE' } });
    expect(wpis).toMatchObject({ userId: klient.id, actorUserId: op.id });

    // po cofnięciu można eskalować ponownie
    await tickets.adminEscalateTicket(t.id, op.id, 'Wróciło po godzinie, potrzebny L3');
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).escalatedAt).not.toBeNull();
  });

  it('flaga ryzyka: ustawienie z opisem, zdjęcie z powodem (dziennik i oś); bez powodu — odmowa', async () => {
    const { tickets, op, t } = await przygotuj();
    await expect(tickets.adminSetRiskFlag(t.id, op.id, null, 'Ryzyko minęło po rozmowie')).rejects.toThrow(/nie ma flagi/);
    await expect(tickets.adminSetRiskFlag(t.id, op.id, 'SUPPORT_RISK', '')).rejects.toThrow(/Opisz ryzyko/);
    await tickets.adminSetRiskFlag(t.id, op.id, 'SUPPORT_RISK', 'Klient grozi odejściem po trzeciej awarii');
    expect(await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ riskFlag: 'SUPPORT_RISK', riskReason: 'Klient grozi odejściem po trzeciej awarii' });

    await expect(tickets.adminSetRiskFlag(t.id, op.id, null, '')).rejects.toThrow(/powód zdjęcia/);
    await tickets.adminSetRiskFlag(t.id, op.id, null, 'Rozmowa z klientem, zostaje z nami');
    expect(await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ riskFlag: null, riskReason: null });
    const ev = await prisma().ticketEvent.findMany({ where: { ticketId: t.id, type: { in: ['RISK_FLAG_SET', 'RISK_FLAG_CLEARED'] } }, orderBy: { createdAt: 'asc' } });
    expect(ev.map((e) => e.type)).toEqual(['RISK_FLAG_SET', 'RISK_FLAG_CLEARED']);
    const wpisy = await prisma().auditLog.findMany({ where: { action: 'CUSTOMER_RISK_FLAG_UPDATED' }, orderBy: { createdAt: 'asc' } });
    expect(wpisy.at(-1)!.details).toMatchObject({ riskFlag: null, from: 'SUPPORT_RISK', reason: 'Rozmowa z klientem, zostaje z nami' });
  });

  it('kroki runbooka: notatka wewnętrzna z krokami z katalogu; zły klucz/krok — odmowa; klient nie widzi', async () => {
    const { tickets, op, klient, t } = await przygotuj();
    const rb = RUNBOOKI.find((r) => r.klucz === 'poczta')!;
    const n = await tickets.adminRunbookSteps(t.id, op.id, 'poczta', [2, 0, 2]);
    expect(n.internal).toBe(true);
    expect(n.message).toBe([`Runbook „${rb.nazwa}” — wykonane 2 z ${rb.kroki.length}:`, `✓ ${rb.kroki[0]}`, `✓ ${rb.kroki[2]}`].join('\n'));
    const ev = await prisma().ticketEvent.findFirstOrThrow({ where: { ticketId: t.id, type: 'INTERNAL_NOTE' } });
    expect(ev.meta).toEqual({ zrodlo: 'runbook:poczta' });
    await expect(tickets.adminRunbookSteps(t.id, op.id, 'nie-ma', [0])).rejects.toThrow(/Nieznany runbook/);
    await expect(tickets.adminRunbookSteps(t.id, op.id, 'poczta', [rb.kroki.length])).rejects.toThrow(/Nieznany krok/);
    await expect(tickets.adminRunbookSteps(t.id, op.id, 'poczta', [])).rejects.toThrow(/co najmniej jeden/);
    expect(JSON.stringify(await tickets.findOne(t.id, klient.id))).not.toContain('Runbook');
  });
});
