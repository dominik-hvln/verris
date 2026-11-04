import { WalletTxType } from '@verris/database';
import { czescOplaconaPieniedzmi, maskaRachunku, normalizujRachunek, saldoDoZwrotu } from './zwrot-salda.js';

/** A2-07 / decyzja 9 — zwrot tylko opłaconych kredytów; numer rachunku z sumą kontrolną. */
describe('saldoDoZwrotu', () => {
  const t = (type: WalletTxType, amount: number, idempotencyKey?: string) => ({ type, amount, idempotencyKey });

  it('same wpłaty bez wydatków — całe saldo', () => {
    expect(saldoDoZwrotu(100, [t(WalletTxType.TOPUP, 100)]).toNumber()).toBe(100);
  });
  it('kod, prowizja z poleceń i rekompensata SLA nie podlegają zwrotowi', () => {
    const tx = [t(WalletTxType.TOPUP, 50), t(WalletTxType.PROMO_CREDIT, 150), t(WalletTxType.COMMISSION_CREDIT, 20), t(WalletTxType.ADJUSTMENT, 10, 'sla-s1-2026-10')];
    expect(saldoDoZwrotu(230, tx).toNumber()).toBe(50);
  });
  it('wydatki zjadają najpierw kredyty z kodu; zwrot za usługę pomniejsza wydatki', () => {
    const tx = [t(WalletTxType.TOPUP, 100), t(WalletTxType.PROMO_CREDIT, 150), t(WalletTxType.CHARGE_SUBSCRIPTION, -45), t(WalletTxType.REFUND, 45), t(WalletTxType.CHARGE_SUBSCRIPTION, -200)];
    // wydatki netto 200 > 150 kodu → kod zjedzony, z wpłaty zostało 50 = saldo
    expect(saldoDoZwrotu(50, tx).toNumber()).toBe(50);
  });
  it('rekompensata SLA i prowizja otrzymane PO opłaceniu usługi nie wracają przy zwrocie (liczenie chronologiczne)', () => {
    const d = (min: number) => new Date(Date.UTC(2026, 10, 4, 9, min));
    const tx = [
      { ...t(WalletTxType.TOPUP, 449), createdAt: d(0) },
      { ...t(WalletTxType.CHARGE_SUBSCRIPTION, -449), createdAt: d(1) },
      { ...t(WalletTxType.ADJUSTMENT, 45, 'sla-s1-2026-10'), createdAt: d(2) },
      { ...t(WalletTxType.COMMISSION_CREDIT, 20), createdAt: d(3) },
    ];
    // Stary wzór sumaryczny: darmowe 65 − wydatki 449 < 0 → „nic darmowego nie zostało” → zwrot 65 zł.
    expect(saldoDoZwrotu(65, tx).toNumber()).toBe(0);
    // Kolejność z bazy bez sortowania nie ma znaczenia, gdy jest createdAt.
    expect(saldoDoZwrotu(65, [...tx].reverse()).toNumber()).toBe(0);
  });
  it('saldo zero albo ujemne — nic', () => {
    expect(saldoDoZwrotu(0, [t(WalletTxType.TOPUP, 10)]).toNumber()).toBe(0);
    expect(saldoDoZwrotu(-5, []).toNumber()).toBe(0);
  });
});

/** Decyzja 16 (4.11.2026) — wkład EKO tylko od części obciążenia zapłaconej pieniędzmi; ta sama kolejność co zwrot. */
describe('czescOplaconaPieniedzmi', () => {
  const t = (type: WalletTxType, amount: number, idempotencyKey?: string) => ({ type, amount, idempotencyKey });

  it('obciążenie w całości z kodu BETA — 0 zł z pieniędzy', () => {
    expect(czescOplaconaPieniedzmi(-449, [t(WalletTxType.PROMO_CREDIT, 500)]).toNumber()).toBe(0);
  });
  it('najpierw schodzą darmowe: kod 100 zł + wpłata 400 zł, obciążenie 449 zł → 349 zł z pieniędzy', () => {
    expect(czescOplaconaPieniedzmi('-449.00', [t(WalletTxType.TOPUP, 400), t(WalletTxType.PROMO_CREDIT, 100)]).toNumber()).toBe(349);
  });
  it('rekompensata otrzymana po wcześniejszych wydatkach schodzi przy następnym obciążeniu', () => {
    const przed = [t(WalletTxType.TOPUP, 449), t(WalletTxType.CHARGE_SUBSCRIPTION, -449), t(WalletTxType.ADJUSTMENT, 45, 'sla-s1-2026-10'), t(WalletTxType.TOPUP, 45)];
    expect(czescOplaconaPieniedzmi(-45, przed).toNumber()).toBe(0);
  });
  it('darmowe zjedzone wcześniejszymi wydatkami — całe obciążenie z pieniędzy', () => {
    const przed = [t(WalletTxType.PROMO_CREDIT, 50), t(WalletTxType.TOPUP, 500), t(WalletTxType.CHARGE_SUBSCRIPTION, -50)];
    expect(czescOplaconaPieniedzmi(-45, przed).toNumber()).toBe(45);
  });
  it('prowizja z poleceń i rekompensata SLA to też nie pieniądze; zwykła korekta admina tak', () => {
    const przed = [t(WalletTxType.COMMISSION_CREDIT, 20), t(WalletTxType.ADJUSTMENT, 10, 'sla-s1-2026-10'), t(WalletTxType.ADJUSTMENT, 100, 'adm-1')];
    expect(czescOplaconaPieniedzmi(-45, przed).toNumber()).toBe(15);
  });
  it('spójne ze zwrotem salda: co zostało z darmowych, nie wraca przy zwrocie', () => {
    const przed = [t(WalletTxType.TOPUP, 100), t(WalletTxType.PROMO_CREDIT, 150)];
    const oplacone = czescOplaconaPieniedzmi(-200, przed); // 150 z kodu, 50 z wpłaty
    expect(oplacone.toNumber()).toBe(50);
    expect(saldoDoZwrotu(50, [...przed, t(WalletTxType.CHARGE_SUBSCRIPTION, -200)]).toNumber()).toBe(50);
  });
});

describe('normalizujRachunek', () => {
  it('26 cyfr NRB i IBAN z PL, spacje i myślniki', () => {
    expect(normalizujRachunek('61 1090 1014 0000 0712 1981 2874')).toBe('PL61109010140000071219812874');
    expect(normalizujRachunek('pl61-1090-1014-0000-0712-1981-2874')).toBe('PL61109010140000071219812874');
    expect(normalizujRachunek('DE89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000');
  });
  it('zła suma kontrolna, za krótki, śmieci', () => {
    expect(normalizujRachunek('61 1090 1014 0000 0712 1981 2875')).toBeNull();
    expect(normalizujRachunek('PL611090')).toBeNull();
    expect(normalizujRachunek('')).toBeNull();
  });
  it('maska pokazuje kraj i 4 ostatnie cyfry', () => {
    expect(maskaRachunku('PL61109010140000071219812874')).toBe('PL •••• 2874');
  });
});
