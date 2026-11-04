import { EcoPointsService } from './eco-points.service.js';

/**
 * W6 (decyzja 12) — opłacona usługa daje oprócz punktów wkład w drzewo. Wkład liczy się niezależnie od rocznego
 * limitu punktów za odnowienia, a jego błąd nie zabiera punktów. Na starym kodzie EcoPointsService nie znał wkładu.
 */
function baza(wpisy: Array<Record<string, unknown>> = []) {
  return {
    ecoPointsLedgerEntry: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        wpisy.find((w) => Object.entries(where).every(([k, v]) => w[k] === v)) ?? null,
      ),
      count: vi.fn(async () => wpisy.length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (wpisy.push(data), data)),
    },
    user: { update: vi.fn(async () => undefined) },
  };
}

describe('Eko-punkty — wkład w drzewo z opłaconej usługi', () => {
  it('pierwsza płatność: wkład z kluczem „pierwsza” i punkty', async () => {
    const drzewa = { wkladZUslugi: vi.fn(async () => 700) };
    const db = baza();
    const svc = new EcoPointsService({} as never, drzewa as never);
    expect(await svc.awardSubscriptionFirstPaid(db as never, 'u1', 's1')).toBe(true);
    expect(drzewa.wkladZUslugi).toHaveBeenCalledWith(db, { userId: 'u1', subscriptionId: 's1', referenceId: 'pierwsza', pierwsza: true });
  });

  it('odnowienie ponad roczny limit punktów: punktów brak, wkład jest', async () => {
    const drzewa = { wkladZUslugi: vi.fn(async () => 70) };
    const db = baza([1, 2, 3, 4].map((i) => ({ reason: 'SUBSCRIPTION_RENEWAL', referenceId: `r${i}`, subscriptionId: 's1', userId: 'u1' })));
    const svc = new EcoPointsService({} as never, drzewa as never);
    expect(await svc.awardSubscriptionRenewal(db as never, { userId: 'u1', subscriptionId: 's1', referenceId: 'r5' })).toBe(false);
    expect(drzewa.wkladZUslugi).toHaveBeenCalledWith(db, { userId: 'u1', subscriptionId: 's1', referenceId: 'r5', pierwsza: false });
  });

  it('błąd wkładu nie zabiera punktów', async () => {
    const drzewa = { wkladZUslugi: vi.fn(async () => { throw new Error('baza chwilowo niedostępna'); }) };
    const svc = new EcoPointsService({} as never, drzewa as never);
    expect(await svc.awardSubscriptionFirstPaid(baza() as never, 'u1', 's1')).toBe(true);
  });
});
