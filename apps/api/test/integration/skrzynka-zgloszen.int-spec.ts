import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * F2.5 — skrzynka zgłoszeń na PostgreSQL: filtry, wyszukiwanie i stronicowanie w API (wcześniej cała tabela
 * do panelu). Sortowanie „termin”: najpierw pierwsza odpowiedź po terminie, potem termin rozwiązania — strony
 * sklejone z dwóch części bez dziur i powtórzeń. Liczniki menu bez filtrów listy.
 */
const tickets = () => new TicketsService(prisma() as never, null as never, null as never, null as never, new AuditService(prisma() as never), null as never, null as never);
const H = 3_600_000;

async function dane() {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const op = await prisma().user.create({ data: { email: `op-${s}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
  const inny = await prisma().user.create({ data: { email: `op2-${s}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
  const anna = await prisma().user.create({ data: { email: `anna-${s}@firma.pl`, passwordHash: 'x', firstName: 'Anna', companyName: 'Kwiaciarnia Róża' } });
  const jan = await prisma().user.create({ data: { email: `jan-${s}@test.pl`, passwordHash: 'x', firstName: 'Jan' } });
  const teraz = Date.now();
  const wiersze: Parameters<ReturnType<typeof prisma>['ticket']['create']>[0]['data'][] = [];
  // 5 po terminie pierwszej odpowiedzi (różnie spóźnione), 3 z nich przypisane do op
  for (let i = 0; i < 5; i++) {
    wiersze.push({ subject: `Spóźnione ${i}`, message: 'Pilne', userId: anna.id, assignedToId: i < 3 ? op.id : null, status: 'OPEN', priority: 'HIGH',
      slaResponseDueAt: new Date(teraz - (i + 1) * H), slaResolveDueAt: new Date(teraz + 20 * H), createdAt: new Date(teraz - (10 + i) * H) });
  }
  // 40 otwartych z odpowiedzią (różne terminy rozwiązania), część czeka na klienta, tagi i tematy
  for (let i = 0; i < 40; i++) {
    wiersze.push({ subject: `Zwykłe ${i}`, message: i === 7 ? 'Błąd 500 po aktualizacji wtyczki' : 'Pytanie', userId: i % 2 ? anna.id : jan.id,
      assignedToId: i % 4 === 0 ? op.id : inny.id, status: i % 5 === 0 ? 'WAITING_CUSTOMER' : 'IN_PROGRESS', priority: i % 3 === 0 ? 'URGENT' : 'NORMAL',
      topic: i % 2 ? 'EMAIL' : 'HOSTING', tags: i % 10 === 0 ? ['vip'] : [], firstResponseAt: new Date(teraz - H),
      slaResponseDueAt: new Date(teraz - 2 * H), slaResolveDueAt: new Date(teraz + (i + 1) * H), createdAt: new Date(teraz - (i + 1) * 60_000) });
  }
  // 2 stare bez terminów (sprzed SLA) — nie mogą wypaść z listy
  for (let i = 0; i < 2; i++) wiersze.push({ subject: `Stare ${i}`, message: 'Bez SLA', userId: jan.id, status: 'OPEN', slaResponseDueAt: null, slaResolveDueAt: null });
  // 6 zamkniętych
  for (let i = 0; i < 6; i++) {
    wiersze.push({ subject: `Zamknięte ${i}`, message: 'Rozwiązane', userId: jan.id, status: 'CLOSED', resolvedAt: new Date(teraz - i * H), firstResponseAt: new Date(teraz - 30 * H) });
  }
  const ids: string[] = [];
  for (const d of wiersze) ids.push((await prisma().ticket.create({ data: d as never })).id);
  await prisma().ticketReply.create({ data: { ticketId: ids[12]!, authorId: jan.id, message: 'Nadal mam komunikat ERR_TOO_MANY_REDIRECTS' } });
  return { op, inny, anna, jan, ids, teraz };
}

describe('F2.5 — skrzynka zgłoszeń (PostgreSQL)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('otwarte, sort „termin”: po terminie najpierw (najbardziej spóźnione), strony bez dziur i powtórzeń', async () => {
    const { op } = await dane();
    const t = tickets();
    const s1 = await t.adminList({ stan: 'otwarte', limit: '20' }, op.id);
    expect(s1).toMatchObject({ total: 47, totalPages: 3, page: 1, limit: 20 });
    expect(s1.rows.slice(0, 5).map((r) => r.subject)).toEqual(['Spóźnione 4', 'Spóźnione 3', 'Spóźnione 2', 'Spóźnione 1', 'Spóźnione 0']);
    // dalej najbliższy termin rozwiązania
    expect(s1.rows[5]!.subject).toBe('Zwykłe 0');
    const s2 = await t.adminList({ stan: 'otwarte', limit: '20', page: '2' }, op.id);
    const s3 = await t.adminList({ stan: 'otwarte', limit: '20', page: '3' }, op.id);
    const wszystkie = [...s1.rows, ...s2.rows, ...s3.rows].map((r) => r.id);
    expect(wszystkie).toHaveLength(47);
    expect(new Set(wszystkie).size).toBe(47);
    // strona, której granica przecina część „po terminie”
    const p2 = await t.adminList({ stan: 'otwarte', limit: '3', page: '2' }, op.id);
    expect(p2.rows.map((r) => r.subject)).toEqual(['Spóźnione 1', 'Spóźnione 0', 'Zwykłe 0']);
    // stare bez terminów są na końcu, nie znikają
    expect(s3.rows.slice(-2).map((r) => r.subject).sort()).toEqual(['Stare 0', 'Stare 1']);
    expect(await t.adminList({ limit: '5000' }, op.id)).toMatchObject({ limit: 100 });
  });

  it('liczniki menu niezależne od filtrów listy', async () => {
    const { op, jan } = await dane();
    const r = await tickets().adminList({ stan: 'zamkniete', q: 'nic-takiego' }, op.id);
    expect(r.total).toBe(0);
    expect(r.liczby).toEqual({ otwarte: 47, moje: 3 + 10, czeka: 8, poTerminie: 5, zamkniete: 6 });
    // z filtrem klienta — liczniki tego klienta
    const zJanem = await tickets().adminList({ userId: jan.id }, op.id);
    expect(zJanem.liczby).toMatchObject({ otwarte: 22, zamkniete: 6, poTerminie: 0 });
  });

  it('filtry: stan, priorytet, przypisany (ja/nikt/id), temat, tag, SLA', async () => {
    const { op, inny } = await dane();
    const t = tickets();
    const ile = async (q: Record<string, string>) => (await t.adminList(q, op.id)).total;
    expect(await ile({ stan: 'WAITING_CUSTOMER' })).toBe(8);
    expect(await ile({ stan: 'zamkniete' })).toBe(6);
    expect(await ile({ priorytet: 'URGENT' })).toBe(14);
    expect(await ile({ stan: 'otwarte', przypisany: 'ja' })).toBe(13);
    expect(await ile({ przypisany: inny.id })).toBe(30);
    expect(await ile({ stan: 'otwarte', przypisany: 'nikt' })).toBe(4);
    expect(await ile({ temat: 'EMAIL' })).toBe(20);
    expect(await ile({ tag: 'VIP' })).toBe(4);
    expect(await ile({ sla: 'po-terminie' })).toBe(5);
    expect(await ile({ sla: 'po-terminie', przypisany: 'ja' })).toBe(3);
    const zamkniete = await t.adminList({ stan: 'zamkniete', sort: 'zamkniete' }, op.id);
    expect(zamkniete.rows.map((r) => r.subject)).toEqual(['Zamknięte 0', 'Zamknięte 1', 'Zamknięte 2', 'Zamknięte 3', 'Zamknięte 4', 'Zamknięte 5']);
  });

  it('wyszukiwanie: temat, treść, wątek, klient (e-mail, firma), numer #', async () => {
    const { op, anna, ids } = await dane();
    const t = tickets();
    const znajdz = async (q: string) => (await t.adminList({ q }, op.id)).rows.map((r) => r.id);
    expect(await znajdz('zwykłe 39')).toEqual([ids[44]]);
    expect(await znajdz('BŁĄD 500')).toEqual([ids[12]]);
    expect(await znajdz('err_too_many')).toEqual([ids[12]]);
    expect((await t.adminList({ q: 'kwiaciarnia' }, op.id)).total).toBe(25);
    expect((await t.adminList({ q: anna.email }, op.id)).total).toBe(25);
    expect(await znajdz(`#${ids[3]!.slice(0, 8)}`)).toContain(ids[3]);
  });

  it('nieznane wartości filtrów → 400 (nie pusta lista)', async () => {
    const { op } = await dane();
    const t = tickets();
    for (const q of [{ stan: 'X' }, { priorytet: 'MEGA' }, { temat: 'NIC' }, { sla: 'jutro' }, { sort: 'losowo' }]) {
      await expect(t.adminList(q, op.id)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
