import { AuditService } from '../../src/common/audit/audit.service.js';
import { BlokadyIpWezlaService } from '../../src/servers/blokady-ip-wezla.admin.controller.js';
import { AkcjeKontaOperatoraService } from '../../src/subscriptions/akcje-konta-operatora.service.js';
import { BlokadyIpKontaService } from '../../src/subscriptions/blokady-ip-konta.service.js';
import { ZawieszenieOperatoraService } from '../../src/subscriptions/zawieszenie-operatora.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { PocztaPrzychodzacaService } from '../../src/tickets/poczta/poczta-przychodzaca.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { wymagajProsbyKlienta } from '../../src/tickets/zgloszenie-klienta.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Audyt Fali 3 — „dowód klienta” (D5, D2): adres IP do odblokowania przez L2 i prośba o operację kosztową muszą pochodzić
 * z wiadomości klienta zalogowanego w panelu. Prawdziwe ścieżki zapisu (TicketsService, PocztaPrzychodzacaService)
 * na prawdziwej bazie (migracja 20261012090000: Ticket.zrodlo, TicketReply.zrodlo).
 */
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async () => undefined };
  const config = { get: () => undefined };
  const notifications = { create: async () => undefined };
  const ai = { supportSuggestion: async () => null };
  const storage = { putObject: async () => undefined, removeObject: async () => undefined };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, ai as never);
  const tickets = new TicketsService(p, mailer as never, config as never, storage as never, audit, notifications as never, opieka);
  const poczta = new PocztaPrzychodzacaService(p, tickets, storage as never, audit, config as never);
  const akcje = new AkcjeKontaOperatoraService(p, null as never, null as never, null as never, audit, null as never, { get: () => 'x' } as never, new ZawieszenieOperatoraService(p, null as never));
  const blokady = new BlokadyIpKontaService(p, audit, akcje, new BlokadyIpWezlaService(p, audit));
  return { tickets, poczta, blokady };
}

async function l2() {
  const rola = await prisma().staffRole.create({ data: { name: `L2 ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, permissions: ['IP_UNBLOCK', 'TICKETS_MANAGE'] } });
  return prisma().user.create({ data: { email: `l2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: rola.id } });
}

describe('audyt Fali 3 — dowód klienta: źródło wiadomości zgłoszenia', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('źródło zapisywane na każdej ścieżce: panel, podgląd konta, w imieniu, przypisane z poczty, automat, odpowiedzi, scalenie', async () => {
    const { tickets, poczta } = uslugi();
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
    const op = await l2();
    const t = { subject: 'Temat', message: 'Treść', department: 'TECHNICAL' as const };

    const panel = await tickets.create(k.user.id, t, { zrodlo: 'PANEL' });
    const podglad = await tickets.create(k.user.id, t, { zrodlo: 'IMPERSONACJA' });
    const automat = await tickets.create(k.user.id, t);
    const wImieniu = await tickets.adminCreateOnBehalf(op.id, { ...t, userId: k.user.id });
    const zrodlo = async (id: string) => (await prisma().ticket.findUniqueOrThrow({ where: { id } })).zrodlo;
    expect([await zrodlo(panel.id), await zrodlo(podglad.id), await zrodlo(automat.id), await zrodlo(wImieniu.id)]).toEqual(['PANEL', 'IMPERSONACJA', 'SYSTEM', 'OBSLUGA']);

    await tickets.addReply(panel.id, k.user.id, { message: 'z panelu' });
    await tickets.addReply(panel.id, k.user.id, { message: 'w podglądzie' }, 'IMPERSONACJA');
    const odp = await prisma().ticketReply.findMany({ where: { ticketId: panel.id, isStaff: false }, orderBy: { createdAt: 'asc' }, select: { message: true, zrodlo: true } });
    expect(odp).toEqual([{ message: 'z panelu', zrodlo: 'PANEL' }, { message: 'w podglądzie', zrodlo: 'IMPERSONACJA' }]);

    // Mail obcego nadawcy przypisany przez obsługę klientowi — treść nie jest wiadomością klienta.
    const w = await prisma().pocztaPrzychodzaca.create({
      data: { messageId: '<obcy@x>', skrzynka: 'z', nadawca: 'obcy@example.com', temat: 'IP', otrzymano: new Date(), rozmiar: 10, wynik: 'BEZ_KLIENTA', tresc: 'odblokujcie 203.0.113.66' },
    });
    const { ticketId } = await poczta.przypisz(w.id, { userId: op.id, role: 'STAFF' }, { userId: k.user.id });
    expect(await zrodlo(ticketId)).toBe('OBSLUGA');

    // Scalenie: pierwsza wiadomość źródła zachowuje swoje źródło (automat nie staje się klientem z panelu).
    await tickets.adminMerge(automat.id, panel.id, op.id, 'duplikat zgłoszenia klienta');
    const zeScalenia = await prisma().ticketReply.findFirstOrThrow({ where: { ticketId: panel.id, message: { startsWith: 'Ze zgłoszenia' } } });
    expect(zeScalenia).toMatchObject({ isStaff: false, zrodlo: 'SYSTEM' });
  });

  it('L2: zgłoszenie „w imieniu” z adresem wpisanym przez pracownika → 403 bez zadania; ten sam adres od klienta z panelu → odblokowanie', async () => {
    const { tickets, blokady } = uslugi();
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
    const op = await l2();
    const { id } = await tickets.adminCreateOnBehalf(op.id, { subject: 'IP', message: 'Klient prosi o odblokowanie 198.51.100.9', userId: k.user.id });
    const z = { subscriptionId: k.subscription.id, operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Klient zgłasza blokadę adresu biura', zgloszenie: `#${id.slice(0, 8)}` };

    await expect(blokady.odblokuj(z, '198.51.100.9')).rejects.toMatchObject({ status: 403 });
    await expect(blokady.sprawdz(k.subscription.id, op.id, 'STAFF', '198.51.100.9')).rejects.toMatchObject({ status: 403 });
    expect(await prisma().nodeTask.count()).toBe(0);
    await expect(wymagajProsbyKlienta(prisma() as never, id, 'Obciążenie portfela klienta')).rejects.toMatchObject({ status: 403 });

    // Klient potwierdza w panelu w tym samym zgłoszeniu — od teraz adres i prośba są jego.
    await tickets.addReply(id, k.user.id, { message: 'Tak, to mój adres: 198.51.100.9' }, 'PANEL');
    expect(await blokady.odblokuj(z, '198.51.100.9')).toMatchObject({ ok: true });
    await expect(wymagajProsbyKlienta(prisma() as never, id, 'Obciążenie portfela klienta')).resolves.toBeUndefined();
  });
});
