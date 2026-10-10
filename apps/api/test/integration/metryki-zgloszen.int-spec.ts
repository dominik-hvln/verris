import { MetricsService } from '../../src/observability/metrics.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Przegląd F2.5 — metryki czasu odpowiedzi obsługi (verris_ticket_staff_response_avg_seconds,
 * verris_ticket_first_response_avg_seconds) po dodaniu notatek wewnętrznych i zgłoszeń zakładanych przez obsługę:
 * notatka nie jest odpowiedzią dla klienta, a zgłoszenie od obsługi nie zaczyna się wiadomością klienta i nie
 * ma „pierwszej odpowiedzi po 0 s”.
 */
const S = 1000;

describe('przegląd F2.5 — metryki czasu odpowiedzi bez notatek i zgłoszeń od obsługi', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('notatka wewnętrzna i zgłoszenie od obsługi nie zaniżają średnich', async () => {
    const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const agent = await prisma().user.create({ data: { email: `ag-${s}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const klient = await prisma().user.create({ data: { email: `kl-${s}@test.verris.pl`, passwordHash: 'x' } });
    const t0 = new Date(Date.now() - 3600 * S);

    // A — klient pisze; po minucie notatka wewnętrzna; odpowiedź dla klienta po 10 min.
    const a = await prisma().ticket.create({
      data: { userId: klient.id, subject: 'A', message: 'Nie działa.', createdAt: t0, firstResponseAt: new Date(t0.getTime() + 600 * S) },
    });
    await prisma().ticketReply.createMany({
      data: [
        { ticketId: a.id, authorId: agent.id, isStaff: true, internal: true, message: 'notatka', createdAt: new Date(t0.getTime() + 60 * S) },
        { ticketId: a.id, authorId: agent.id, isStaff: true, message: 'odpowiedź', createdAt: new Date(t0.getTime() + 600 * S) },
      ],
    });

    // B — założone przez obsługę (firstResponseAt = createdAt); obsługa dopisuje, potem klient, odpowiedź po 5 min.
    const t1 = new Date(t0.getTime() + 1200 * S);
    const b = await prisma().ticket.create({
      data: { userId: klient.id, subject: 'B', message: 'Wykryliśmy awarię.', createdAt: t1, firstResponseAt: t1, openedByStaffId: agent.id, assignedToId: agent.id },
    });
    await prisma().ticketReply.createMany({
      data: [
        { ticketId: b.id, authorId: agent.id, isStaff: true, message: 'uzupełnienie', createdAt: new Date(t1.getTime() + 50 * S) },
        { ticketId: b.id, authorId: klient.id, isStaff: false, message: 'dzięki', createdAt: new Date(t1.getTime() + 100 * S) },
        { ticketId: b.id, authorId: agent.id, isStaff: true, message: 'naprawione', createdAt: new Date(t1.getTime() + 400 * S) },
      ],
    });

    const m = new MetricsService(prisma() as never) as unknown as {
      avgStaffResponseSeconds: (since?: Date) => Promise<number | null>;
      avgFirstResponseSeconds: (since?: Date) => Promise<number | null>;
    };
    // A: 600 s; B: 300 s (klient → obsługa). Bez poprawki: (60 + 50 + 300) / 3.
    expect(await m.avgStaffResponseSeconds()).toBeCloseTo(450, 3);
    // Tylko A (600 s). Bez poprawki: (600 + 0) / 2.
    expect(await m.avgFirstResponseSeconds()).toBeCloseTo(600, 3);
  });
});
