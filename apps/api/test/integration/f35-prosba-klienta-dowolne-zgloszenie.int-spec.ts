/**
 * PRZEGLĄD 12.10 — F3.5: „tylko na prośbę klienta” przyjmuje DOWOLNE zgłoszenie klienta z wiadomością z panelu —
 * zamknięte, sprzed rezygnacji, o innej usłudze i innej sprawie.
 * Uruchom: DATABASE_URL=… npx vitest run -c vitest.integration.config.ts test/integration/cykl-zycia-uslugi.int-spec.ts
 *
 * Przed poprawką CZERWONY: cykl-zycia-uslugi.service.ts:229-234 (cofnięcie rezygnacji) i :341-345 (skrócenie okresu)
 * sprawdzają tylko zgloszenieKlienta (ticket.userId) + wymagajProsbyKlienta (jakakolwiek wiadomość z panelu).
 * STAFF z SUBSCRIPTIONS_MANAGE (L2) wznawia obciążanie klienta, który zrezygnował, podając numer starego zgłoszenia
 * „Nie działa mi poczta” z innej usługi, zamkniętego pół roku przed rezygnacją.
 */
import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { CyklZyciaUslugiService } from '../../src/subscriptions/cykl-zycia-uslugi.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

const DZIEN = 86_400_000;
const cykl = () => new CyklZyciaUslugiService(prisma() as never, new AuditService(prisma() as never), {} as never);
let n = 0;

describe('F3.5 — prośba klienta: zgłoszenie musi dotyczyć tej sprawy (przegląd 12.10)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('STAFF nie cofa rezygnacji klienta na podstawie starego, zamkniętego zgłoszenia o innej usłudze', async () => {
    n += 1;
    const p = prisma();
    const k = await p.user.create({ data: { email: `f35r-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 100 } });
    const op = await p.user.create({ data: { email: `f35r-op-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const plan = await utworzPlan();
    const nowa = (extra: Record<string, unknown> = {}) =>
      p.subscription.create({
        data: { userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN', paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 20 * DZIEN), currentPeriodEnd: new Date(Date.now() + 10 * DZIEN), ...extra } as never,
      });
    const poczta = await nowa();
    // Pół roku temu: zgłoszenie z panelu o poczcie w INNEJ usłudze, zamknięte.
    const stare = await p.ticket.create({
      data: { userId: k.id, subscriptionId: poczta.id, zrodlo: 'PANEL', status: 'CLOSED', subject: 'Nie działa mi poczta', message: 'Nie wysyłają się maile', createdAt: new Date(Date.now() - 180 * DZIEN) } as never,
    });
    // Dziś: klient sam rezygnuje z usługi hostingu na koniec okresu.
    const koniec = new Date(Date.now() + 10 * DZIEN);
    const hosting = await nowa({ currentPeriodEnd: koniec, cancelAt: koniec });
    await p.subscriptionEvent.create({ data: { subscriptionId: hosting.id, type: 'CANCEL_SCHEDULED', details: { actor: k.id, source: 'CUSTOMER', effectiveAt: koniec.toISOString() } } });

    await expect(
      cykl().cofnijAnulacje({ subscriptionId: hosting.id, operator: { userId: op.id, role: 'STAFF' }, powod: 'Klient prosi o pozostanie', zgloszenie: `#${stare.id.slice(0, 8)}` }),
    ).rejects.toBeDefined();
    expect((await p.subscription.findUniqueOrThrow({ where: { id: hosting.id } })).cancelAt?.toISOString()).toBe(koniec.toISOString());
  });

  it('każdy warunek osobno: inna usługa, zamknięte, wiadomość sprzed rezygnacji, starsza niż 14 dni — odmowa; świeża prośba o tę usługę — cofnięcie', async () => {
    n += 1;
    const p = prisma();
    const k = await p.user.create({ data: { email: `f35w-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 100 } });
    const op = await p.user.create({ data: { email: `f35w-op-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const plan = await utworzPlan();
    const koniec = new Date(Date.now() + 10 * DZIEN);
    const nowa = (extra: Record<string, unknown> = {}) =>
      p.subscription.create({
        data: { userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN', paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 20 * DZIEN), currentPeriodEnd: koniec, ...extra } as never,
      });
    const inna = await nowa();
    const hosting = await nowa({ cancelAt: koniec });
    // Klient zrezygnował 3 dni temu.
    await p.subscriptionEvent.create({ data: { subscriptionId: hosting.id, type: 'CANCEL_SCHEDULED', createdAt: new Date(Date.now() - 3 * DZIEN), details: { actor: k.id, source: 'CUSTOMER' } } as never });
    const zgloszenie = (extra: Record<string, unknown>) =>
      p.ticket.create({ data: { userId: k.id, zrodlo: 'PANEL', status: 'OPEN', subject: 'Rezygnacja', message: 'Jednak zostaję', createdAt: new Date(Date.now() - DZIEN), ...extra } as never });
    const cofnij = (t: { id: string }) =>
      cykl().cofnijAnulacje({ subscriptionId: hosting.id, operator: { userId: op.id, role: 'STAFF' }, powod: 'Klient prosi o pozostanie', zgloszenie: t.id });

    await expect(cofnij(await zgloszenie({ subscriptionId: inna.id }))).rejects.toThrow('dotyczy innej usługi');
    await expect(cofnij(await zgloszenie({ subscriptionId: hosting.id, status: 'CLOSED' }))).rejects.toThrow('jest zamknięte');
    await expect(cofnij(await zgloszenie({ subscriptionId: hosting.id, createdAt: new Date(Date.now() - 5 * DZIEN) }))).rejects.toThrow('złożoną po jego rezygnacji');
    // Wiadomość z panelu w odpowiedzi — liczy się najnowsza; odpowiedź z podglądu konta (impersonacja) się nie liczy.
    const stara = await zgloszenie({ subscriptionId: null, createdAt: new Date(Date.now() - 40 * DZIEN) });
    await p.ticketReply.create({ data: { ticketId: stara.id, authorId: k.id, message: 'Zostaję', isStaff: false, zrodlo: 'IMPERSONACJA', createdAt: new Date(Date.now() - DZIEN) } as never });
    await expect(cofnij(stara)).rejects.toThrow('złożoną po jego rezygnacji');
    expect((await p.subscription.findUniqueOrThrow({ where: { id: hosting.id } })).cancelAt).not.toBeNull();

    await p.ticketReply.create({ data: { ticketId: stara.id, authorId: k.id, message: 'Zostaję', isStaff: false, zrodlo: 'PANEL', createdAt: new Date(Date.now() - DZIEN) } as never });
    await expect(cofnij(stara)).resolves.toMatchObject({ bezZmian: false });
    expect((await p.subscription.findUniqueOrThrow({ where: { id: hosting.id } })).cancelAt).toBeNull();
  });

  it('skrócenie okresu: wiadomość klienta z panelu starsza niż 14 dni nie wystarcza', async () => {
    n += 1;
    const p = prisma();
    const k = await p.user.create({ data: { email: `f35s-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const op = await p.user.create({ data: { email: `f35s-op-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const plan = await utworzPlan();
    const koniec = new Date(Date.now() + 20 * DZIEN);
    const u = await p.subscription.create({
      data: { userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN', paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 10 * DZIEN), currentPeriodEnd: koniec } as never,
    });
    const t = await p.ticket.create({ data: { userId: k.id, subscriptionId: u.id, zrodlo: 'PANEL', status: 'OPEN', subject: 'Data', message: 'Proszę skrócić', createdAt: new Date(Date.now() - 15 * DZIEN) } as never });
    await expect(
      cykl().zmienDateOdnowienia({ subscriptionId: u.id, operator: { userId: op.id, role: 'STAFF' }, powod: 'Klient prosi o wcześniejszą datę', zgloszenie: t.id, nowaData: new Date(Date.now() + 10 * DZIEN), przed: koniec }),
    ).rejects.toThrow('ponad 14 dni');
  });
});
