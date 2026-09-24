import { ECO_FIRST_ENABLE_POINTS, ECO_LEDGER_REASON_LABEL, buildEcoPointRules } from './eco-point-rules';

/**
 * X-05 — zasady punktów EKO pokazywane klientowi.
 *
 * CO PILNUJE.
 *  1. Każdy powód z historii punktów (`EcoPointsLedgerEntry.reason`) ma polską
 *     etykietę, a każda zasada z przewodnika — wpis w historii. Brak etykiety
 *     oznacza surowe `REFERRAL_APPLIED_REFERRER` w tabeli klienta.
 *  2. Liczby w przewodniku są LUSTREM `ECO_POINT_DELTAS` z API
 *     (`apps/api/src/eco/eco-points.service.ts`). Panel nie może importować
 *     kodu API, więc kopia wartości żyje tutaj — zmiana punktacji w API bez
 *     zmiany przewodnika zapali ten test, zamiast obiecywać klientowi punkty,
 *     których nie dostanie.
 *  3. Kurs wymiany i progi badge'a pochodzą z konfiguracji platformy, nie są
 *     zaszyte w tekście.
 */

/** Kopia `ECO_POINT_DELTAS` z API (stan na 2026-09-24). */
const API_DELTAS: Record<string, number> = {
  EKO_FIRST_ENABLE: 5,
  REFERRAL_REGISTER_REFEREE: 3,
  REFERRAL_REGISTER_REFERRER: 5,
  REFERRAL_APPLIED_REFEREE: 3,
  REFERRAL_APPLIED_REFERRER: 5,
  SUBSCRIPTION_FIRST_PAID: 10,
  SUBSCRIPTION_RENEWAL: 5,
  DOMAIN_FIRST_PAID: 5,
  DOMAIN_RENEWAL: 3,
  STRIPE_CARD_LINKED: 15,
  EMAIL_VERIFIED: 2,
  BILLING_PROFILE_COMPLETE: 3,
  PASSKEY_REGISTERED: 5,
};

const PLATFORM = { ecoPointsPerTree: 1500, ecoPointsPer10Credits: 120, ecoBadgeImpressionsPerPoint: 250 };

describe('X-05 zasady punktów EKO', () => {
  const rules = buildEcoPointRules(PLATFORM);

  it('identyfikatory zasad są unikalne i każdy ma etykietę w historii — i odwrotnie', () => {
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(ECO_LEDGER_REASON_LABEL).sort());
  });

  it('punkty w przewodniku zgadzają się z punktacją API', () => {
    for (const [id, delta] of Object.entries(API_DELTAS)) {
      const rule = rules.find((r) => r.id === id);
      expect(rule?.points).toBe(`+${delta}`);
    }
    expect(ECO_FIRST_ENABLE_POINTS).toBe(API_DELTAS.EKO_FIRST_ENABLE);
  });

  it('doładowanie portfela: 2 pkt za 50 PLN, min. 20 PLN, maks. 20 pkt/mies. (ECO_POINT_LIMITS)', () => {
    const r = rules.find((x) => x.id === 'WALLET_TOPUP')!;
    expect(r.points).toBe('+2 / 50 PLN');
    expect(r.description).toMatch(/Minimum 20 PLN/);
    expect(r.description).toMatch(/Maks\. 20 pkt/);
  });

  it('kurs wymiany, drzewo i próg badge pochodzą z konfiguracji platformy', () => {
    const redeem = rules.find((x) => x.id === 'EKO_REDEEM_WALLET')!;
    expect(redeem.points).toBe('−120 = 10,00 K');
    expect(redeem.description).toContain(PLATFORM.ecoPointsPerTree.toLocaleString('pl-PL'));
    expect(rules.find((x) => x.id === 'BADGE_IMPRESSION')!.points).toBe('+1 co 250 wyśw.');
  });
});
