import { BillingService } from '../../src/billing/billing.service';
import { prisma, rozlacz, wyczyscBaze } from './setup';

/**
 * Z-05 — scenariusz z macierzy, odtworzony na prawdziwej bazie.
 *
 * Macierz opisała ten błąd tak: „Klient zapłacił, saldo się nie pojawiło,
 * system uważa zdarzenie za obsłużone i odrzuca ponowienia. Odzysk wyłącznie
 * ręcznie w bazie."
 *
 * Ten plik odtwarza dokładnie tę sekwencję. Nie „coś podobnego" — tę.
 *
 *   1. Stripe dostarcza `checkout.session.completed`.
 *   2. Handler pada w połowie (baza chwilowo niedostępna, timeout MinIO,
 *      cokolwiek).
 *   3. Stripe ponawia tę samą dostawę.
 *   4. Pod STARYM kodem: odpowiedź „duplicate: true", kod 200, koniec.
 *      Pod NOWYM: ponowienie przechodzi, portfel zostaje uznany.
 *
 * Dlaczego integracyjny, a nie jednostkowy: cała rzecz stoi na unikalnym
 * indeksie `eventId` i na warunkowym `updateMany`. Atrapa Prismy zawsze
 * powie, że to działa — w tym też rzecz, że wcześniej mówiła.
 */

const EVENT_ID = 'evt_test_z05_0001';

/** Minimalna atrapa zależności, których ścieżka webhooka w ogóle nie dotyka. */
const nic = () => undefined as never;
const pusty = new Proxy({}, { get: () => async () => undefined }) as never;

interface Ksiegowanie {
  userId: string;
  amount: number;
  idempotencyKey: string;
}

/**
 * Buduje serwis z prawdziwą Prismą i sterowalnym księgowaniem.
 * `padnij` decyduje, czy `ledger.credit` rzuci wyjątkiem — tak symulujemy
 * awarię w połowie handlera, bez czekania na prawdziwą awarię.
 */
function zbudujSerwis(opcje: { padnij: () => boolean }) {
  const ksiegowania: Ksiegowanie[] = [];
  const ledger = {
    credit: async (arg: Ksiegowanie) => {
      if (opcje.padnij()) throw new Error('symulowana awaria bazy w trakcie księgowania');
      // Idempotencja po kluczu — tak jak prawdziwy WalletLedgerService.
      const juz = ksiegowania.find((k) => k.idempotencyKey === arg.idempotencyKey);
      if (juz) return { id: 'tx-' + arg.idempotencyKey, idempotencyKey: arg.idempotencyKey };
      ksiegowania.push(arg);
      return { id: 'tx-' + arg.idempotencyKey, idempotencyKey: arg.idempotencyKey };
    },
  };
  const stripe = {
    verifyWebhookSignature: () => undefined,
    parseEvent: (raw: Buffer) => JSON.parse(raw.toString('utf8')),
  };
  const serwis = new BillingService(
    prisma() as never,
    ledger as never,
    stripe as never,
    { record: async () => undefined } as never,
    { get: () => undefined } as never,
    pusty,
    pusty,
    { send: async () => undefined } as never,
    pusty,
    { safeAward: async () => undefined, awardWalletTopup: async () => 0 } as never,
  );
  return { serwis, ksiegowania };
}

function zdarzenie(sessionId = 'cs_test_0001', userId = 'user-z05'): Buffer {
  return Buffer.from(
    JSON.stringify({
      id: EVENT_ID,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_status: 'paid',
          amount_total: 4500,
          currency: 'pln',
          client_reference_id: userId,
          metadata: { kind: 'wallet_topup' },
          payment_intent: 'pi_test_0001',
        },
      },
    }),
  );
}

async function wiersz() {
  return prisma().stripeWebhookEvent.findUnique({ where: { eventId: EVENT_ID } });
}

describe('Z-05 — webhook płatności przeciwko prawdziwej bazie', () => {
  beforeEach(async () => {
    await wyczyscBaze();
  });
  afterAll(rozlacz);

  it('ścieżka szczęśliwa: zdarzenie kończy jako PROCESSED, portfel uznany raz', async () => {
    const { serwis, ksiegowania } = zbudujSerwis({ padnij: () => false });
    const wynik = await serwis.handleStripeWebhook(zdarzenie(), 'sig');

    expect(wynik).toEqual({ received: true });
    expect(ksiegowania).toHaveLength(1);
    const w = await wiersz();
    expect(w?.status).toBe('PROCESSED');
    expect(w?.processedAt).not.toBeNull();
    expect(w?.attempts).toBe(1);
  });

  it('powtórna dostawa PRZETWORZONEGO zdarzenia to duplikat — portfel nie rośnie', async () => {
    const { serwis, ksiegowania } = zbudujSerwis({ padnij: () => false });
    await serwis.handleStripeWebhook(zdarzenie(), 'sig');
    const drugi = await serwis.handleStripeWebhook(zdarzenie(), 'sig');

    expect(drugi).toEqual({ received: true, duplicate: true });
    expect(ksiegowania).toHaveLength(1);
    expect((await wiersz())?.attempts).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Sedno Z-05
  // ═══════════════════════════════════════════════════════════════════════

  it('handler, który padł, zostawia zdarzenie w FAILED — NIE w stanie „obsłużone"', async () => {
    let pada = true;
    const { serwis } = zbudujSerwis({ padnij: () => pada });

    await expect(serwis.handleStripeWebhook(zdarzenie(), 'sig')).rejects.toThrow(
      'symulowana awaria',
    );

    const w = await wiersz();
    expect(w).not.toBeNull();
    // To jest ta różnica. Pod starym kodem wiersz istniał i nie miał stanu,
    // więc jego istnienie znaczyło „obsłużone".
    expect(w?.status).toBe('FAILED');
    expect(w?.lastError).toContain('symulowana awaria');
    expect(w?.nextAttemptAt).not.toBeNull();
    pada = false;
  });

  it('PONOWIENIE PO AWARII KSIĘGUJE PORTFEL — to jest cały Z-05', async () => {
    let pada = true;
    const { serwis, ksiegowania } = zbudujSerwis({ padnij: () => pada });

    // 1–2. Dostawa i awaria w połowie handlera.
    await expect(serwis.handleStripeWebhook(zdarzenie(), 'sig')).rejects.toThrow();
    expect(ksiegowania).toHaveLength(0);

    // Przyczyna awarii mija.
    pada = false;

    // 3. Stripe ponawia TĘ SAMĄ dostawę.
    const wynik = await serwis.handleStripeWebhook(zdarzenie(), 'sig');

    // 4. Pod starym kodem byłoby tu { received: true, duplicate: true }
    //    i zero księgowań — czyli klient zapłacił, saldo się nie pojawiło.
    expect(wynik).toEqual({ received: true });
    expect(ksiegowania).toHaveLength(1);
    expect(ksiegowania[0].amount).toBe(45);

    const w = await wiersz();
    expect(w?.status).toBe('PROCESSED');
    expect(w?.attempts).toBe(2);
  });

  it('ponowienie z zapisanej treści działa bez ponownej dostawy ze Stripe', async () => {
    let pada = true;
    const { serwis, ksiegowania } = zbudujSerwis({ padnij: () => pada });
    await expect(serwis.handleStripeWebhook(zdarzenie(), 'sig')).rejects.toThrow();
    pada = false;

    // Ścieżka panelu admina i schedulera: nie ma nowej dostawy, jest tylko
    // wiersz w bazie. Bez zapisanej treści nie byłoby czego uruchomić.
    const wynik = await serwis.przetworzPonownie(EVENT_ID);

    expect(wynik).toEqual({ eventId: EVENT_ID, status: 'PROCESSED' });
    expect(ksiegowania).toHaveLength(1);
    expect((await wiersz())?.status).toBe('PROCESSED');
  });

  it('ponowienie zdarzenia już przetworzonego niczego nie księguje drugi raz', async () => {
    const { serwis, ksiegowania } = zbudujSerwis({ padnij: () => false });
    await serwis.handleStripeWebhook(zdarzenie(), 'sig');

    const wynik = await serwis.przetworzPonownie(EVENT_ID);
    expect(wynik.status).toBe('PROCESSED');
    expect(ksiegowania).toHaveLength(1);
  });

  it('zdarzenie bez zapisanej treści odmawia ponowienia zamiast udawać sukces', async () => {
    // Tak wyglądają wiersze sprzed 2026-08-22 i te po czyszczeniu retencyjnym.
    await prisma().stripeWebhookEvent.create({
      data: { eventId: EVENT_ID, type: 'checkout.session.completed', status: 'FAILED' },
    });
    const { serwis } = zbudujSerwis({ padnij: () => false });

    await expect(serwis.przetworzPonownie(EVENT_ID)).rejects.toThrow(/nie ma zapisanej treści/);
  });

  it('dostawa w trakcie obsługi dostaje odmowę, a nie „duplikat"', async () => {
    // Ktoś inny właśnie trzyma to zdarzenie: świeży PENDING.
    await prisma().stripeWebhookEvent.create({
      data: {
        eventId: EVENT_ID,
        type: 'checkout.session.completed',
        status: 'PENDING',
        claimedAt: new Date(),
        attempts: 1,
      },
    });
    const { serwis, ksiegowania } = zbudujSerwis({ padnij: () => false });

    // Odpowiedź 200 kazałaby Stripe'owi uznać zdarzenie za doręczone — a tamta
    // dostawa może przecież paść.
    await expect(serwis.handleStripeWebhook(zdarzenie(), 'sig')).rejects.toThrow();
    expect(ksiegowania).toHaveLength(0);
    expect((await wiersz())?.status).toBe('PENDING');
  });

  it('PENDING porzucony przez martwy proces zostaje przejęty', async () => {
    // Proces API ubity między zajęciem a zakończeniem: wiersz zostaje
    // w PENDING i bez reguły dzierżawy nie wróciłby już nigdy.
    await prisma().stripeWebhookEvent.create({
      data: {
        eventId: EVENT_ID,
        type: 'checkout.session.completed',
        status: 'PENDING',
        claimedAt: new Date(Date.now() - 30 * 60 * 1000),
        attempts: 1,
      },
    });
    const { serwis, ksiegowania } = zbudujSerwis({ padnij: () => false });

    const wynik = await serwis.handleStripeWebhook(zdarzenie(), 'sig');
    expect(wynik).toEqual({ received: true });
    expect(ksiegowania).toHaveLength(1);
    const w = await wiersz();
    expect(w?.status).toBe('PROCESSED');
    expect(w?.attempts).toBe(2);
  });

  it('kolejne awarie odsuwają termin ponowienia coraz dalej', async () => {
    const { serwis } = zbudujSerwis({ padnij: () => true });

    await expect(serwis.handleStripeWebhook(zdarzenie(), 'sig')).rejects.toThrow();
    const po1 = await wiersz();

    // Ręczne przejęcie z pominięciem dzierżawy — interesuje nas sam odstęp.
    await prisma().stripeWebhookEvent.update({
      where: { eventId: EVENT_ID },
      data: { nextAttemptAt: new Date(0) },
    });
    await expect(serwis.przetworzPonownie(EVENT_ID)).rejects.toThrow();
    const po2 = await wiersz();

    expect(po2!.attempts).toBe(2);
    const odstep1 = po1!.nextAttemptAt!.getTime() - po1!.updatedAt.getTime();
    const odstep2 = po2!.nextAttemptAt!.getTime() - po2!.updatedAt.getTime();
    expect(odstep2).toBeGreaterThan(odstep1);
  });

  it('treść zdarzenia jest zapisana, żeby ponowienie działało gdy Stripe leży', async () => {
    const { serwis } = zbudujSerwis({ padnij: () => false });
    await serwis.handleStripeWebhook(zdarzenie(), 'sig');

    const w = await wiersz();
    const p = w?.payload as { id?: string; data?: { object?: { amount_total?: number } } };
    expect(p?.id).toBe(EVENT_ID);
    expect(p?.data?.object?.amount_total).toBe(4500);
  });
});
