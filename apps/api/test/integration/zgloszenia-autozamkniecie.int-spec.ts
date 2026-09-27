import { TicketSlaScheduler } from '../../src/tickets/ticket-sla.scheduler.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — automatyczne zamykanie zgłoszeń bez odpowiedzi klienta (5 dni) na prawdziwej bazie.
 * Klient, który odpisał po wybraniu listy przez harmonogram, nie może dostać zamkniętego
 * zgłoszenia i maila „zamknęliśmy, bo nie odpowiadasz”.
 */
const maile: string[] = [];
const harmonogram = () =>
  new TicketSlaScheduler(prisma() as never, { send: async (m: { subject: string }) => void maile.push(m.subject) } as never, { get: () => undefined } as never, { create: async () => ({}) } as never, null as never);

async function zgloszenie(dniCzeka: number) {
  const u = await prisma().user.create({ data: { email: `zg-${Date.now()}-${Math.random()}@test.verris.pl`, passwordHash: 'x' } });
  return prisma().ticket.create({
    data: { userId: u.id, subject: 'Poczta', message: 'Nie działa poczta', status: 'WAITING_CUSTOMER', waitingSince: new Date(Date.now() - dniCzeka * 86400_000) } as never,
  });
}
const status = async (id: string) => (await prisma().ticket.findUniqueOrThrow({ where: { id } })).status;

describe('X-04 automatyczne zamykanie zgłoszeń', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    maile.length = 0;
  });
  afterAll(rozlacz);

  it('bez odpowiedzi ponad 5 dni: zamknięte; młodsze zostają', async () => {
    const stare = await zgloszenie(6);
    const mlode = await zgloszenie(2);
    await harmonogram().autoCloseStale();
    expect(await status(stare.id)).toBe('CLOSED');
    expect(await status(mlode.id)).toBe('WAITING_CUSTOMER');
  });

  it('klient odpisał po wybraniu listy: zgłoszenie zostaje otwarte, bez maila o zamknięciu', async () => {
    const t = await zgloszenie(6);
    const p = prisma();
    const oryginal = p.ticket.findMany.bind(p.ticket);
    const szpieg = vi.spyOn(p.ticket, 'findMany').mockImplementationOnce(async (a: never) => {
      const lista = await oryginal(a);
      await p.ticket.update({ where: { id: t.id }, data: { status: 'OPEN' } as never });
      return lista;
    });
    await harmonogram().autoCloseStale();
    szpieg.mockRestore();
    expect(await status(t.id)).toBe('OPEN');
    expect(maile).toHaveLength(0);
  });
});
