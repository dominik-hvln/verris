import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { DOMYSLNE_PROGI_SLA } from '../../src/tickets/sla-zgloszen.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * F3.7 (OE-25) — progi SLA z ustawień (tylko ADMIN, panel „Opieka nad zgłoszeniami”) i przeliczanie terminów po
 * zmianie priorytetu. Wcześniej progi były zaszyte, a zmiana priorytetu (ręczna, eskalacja) zostawiała terminy z chwili
 * utworzenia — URGENT po eskalacji miał 24 h na odpowiedź z LOW.
 */
const H = 3600_000;

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async () => undefined };
  const config = { get: () => undefined };
  const notifications = { create: async () => undefined };
  const ai = { supportSuggestion: async () => null };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, ai as never);
  return { opieka, tickets: new TicketsService(p, mailer as never, config as never, null as never, audit, notifications as never, opieka) };
}

async function klient() {
  return prisma().user.create({ data: { email: `k-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.verris.pl`, passwordHash: 'x', role: 'USER' } });
}
async function admin() {
  return prisma().user.create({ data: { email: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
}

const odUtworzenia = (t: { createdAt: Date; slaResponseDueAt: Date | null; slaResolveDueAt: Date | null }) => ({
  odpowiedz: t.slaResponseDueAt ? (t.slaResponseDueAt.getTime() - t.createdAt.getTime()) / H : null,
  rozwiazanie: t.slaResolveDueAt ? (t.slaResolveDueAt.getTime() - t.createdAt.getTime()) / H : null,
});

describe('F3.7 — SLA zgłoszeń konfigurowalne i przeliczane po zmianie priorytetu', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('nowe zgłoszenie dostaje terminy z ustawień, a bez ustawień — domyślne', async () => {
    const { tickets, opieka } = uslugi();
    const k = await klient();
    const a = await tickets.create(k.id, { subject: 'Strona nie działa', message: 'Od rana błąd 500.' });
    expect(odUtworzenia(await prisma().ticket.findUniqueOrThrow({ where: { id: a.id } }))).toEqual({ odpowiedz: 12, rozwiazanie: 72 });

    const adm = await admin();
    await opieka.zapiszProgiSla({ odpowiedz: { ...DOMYSLNE_PROGI_SLA.odpowiedz, NORMAL: 8 }, rozwiazanie: { ...DOMYSLNE_PROGI_SLA.rozwiazanie, NORMAL: 48 } }, adm.id);
    const b = await tickets.create(k.id, { subject: 'Poczta', message: 'Nie dochodzą maile.' });
    expect(odUtworzenia(await prisma().ticket.findUniqueOrThrow({ where: { id: b.id } }))).toEqual({ odpowiedz: 8, rozwiazanie: 48 });
    // Nowe progi nie przesuwają terminów już liczonych.
    expect(odUtworzenia(await prisma().ticket.findUniqueOrThrow({ where: { id: a.id } }))).toEqual({ odpowiedz: 12, rozwiazanie: 72 });
    expect(await prisma().auditLog.count({ where: { action: 'SUPPORT_SLA_UPDATED', actorUserId: adm.id } })).toBe(1);
  });

  it('zapis odrzuca progi niespójne (pilniejszy priorytet z dłuższym terminem)', async () => {
    const { opieka } = uslugi();
    const adm = await admin();
    await expect(
      opieka.zapiszProgiSla({ odpowiedz: { ...DOMYSLNE_PROGI_SLA.odpowiedz, HIGH: 20 }, rozwiazanie: DOMYSLNE_PROGI_SLA.rozwiazanie }, adm.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma().platformSetting.count({ where: { key: 'support.sla' } })).toBe(0);
  });

  it('zmiana priorytetu w zgłoszeniu przelicza terminy od utworzenia i trafia na oś zgłoszenia', async () => {
    const { tickets } = uslugi();
    const k = await klient();
    const adm = await admin();
    const z = await tickets.create(k.id, { subject: 'Wolna strona', message: 'Strona ładuje się 10 s.', priority: 'LOW' });
    expect(odUtworzenia(await prisma().ticket.findUniqueOrThrow({ where: { id: z.id } }))).toEqual({ odpowiedz: 24, rozwiazanie: 120 });

    await tickets.adminUpdateTicket(z.id, { priority: 'HIGH' }, adm.id);
    expect(odUtworzenia(await prisma().ticket.findUniqueOrThrow({ where: { id: z.id } }))).toEqual({ odpowiedz: 4, rozwiazanie: 24 });
    const ev = await prisma().ticketEvent.findFirstOrThrow({ where: { ticketId: z.id, type: 'PRIORITY_CHANGED' } });
    expect(ev.meta).toEqual({ from: 'LOW', to: 'HIGH' });
  });

  it('eskalacja (URGENT) skraca terminy, cofnięcie eskalacji przywraca terminy poprzedniego priorytetu', async () => {
    const { tickets } = uslugi();
    const k = await klient();
    const adm = await admin();
    const z = await tickets.create(k.id, { subject: 'Wyciek danych?', message: 'Ktoś zmienił treść strony.', priority: 'NORMAL' });

    await tickets.adminEscalateTicket(z.id, adm.id, 'Możliwe włamanie na konto klienta');
    expect(odUtworzenia(await prisma().ticket.findUniqueOrThrow({ where: { id: z.id } }))).toEqual({ odpowiedz: 1, rozwiazanie: 8 });

    await tickets.adminUndoEscalation(z.id, adm.id, 'Pomyłka — zwykła zmiana treści przez klienta');
    const po = await prisma().ticket.findUniqueOrThrow({ where: { id: z.id } });
    expect(po.priority).toBe('NORMAL');
    expect(odUtworzenia(po)).toEqual({ odpowiedz: 12, rozwiazanie: 72 });
  });

  it('po pierwszej odpowiedzi zmiana priorytetu nie rusza terminu odpowiedzi (już spełniony), tylko rozwiązania', async () => {
    const { tickets } = uslugi();
    const k = await klient();
    const adm = await admin();
    const z = await tickets.create(k.id, { subject: 'DNS', message: 'Domena nie wskazuje na serwer.', priority: 'NORMAL' });
    await tickets.adminAddReply(z.id, adm.id, { message: 'Sprawdzamy rekordy DNS.' });
    await tickets.adminUpdateTicket(z.id, { priority: 'URGENT' }, adm.id);
    expect(odUtworzenia(await prisma().ticket.findUniqueOrThrow({ where: { id: z.id } }))).toEqual({ odpowiedz: 12, rozwiazanie: 8 });
  });
});
